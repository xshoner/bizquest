// Recalculate a completed lesson from its recorded events. Dry-run unless --apply is supplied.
// Original Firestore documents are backed up under .local-tools and original calculation fields
// remain in the room's calculationCorrection field. Student records are never changed.
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const decode = value => value.mapValue ? Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)])) : value.arrayValue ? (value.arrayValue.values || []).map(decode) : 'integerValue' in value ? Number(value.integerValue) : 'doubleValue' in value ? value.doubleValue : 'booleanValue' in value ? value.booleanValue : 'nullValue' in value ? null : value.stringValue ?? value.timestampValue;
const encode = value => value === null ? { nullValue: null } : Array.isArray(value) ? { arrayValue: { values: value.map(encode) } } : typeof value === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, encode(item)])) } } : typeof value === 'number' ? Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value } : typeof value === 'boolean' ? { booleanValue: value } : { stringValue: value };
const unpack = document => decode({ mapValue: { fields: document.fields } });

async function main() {
  const roomId = process.argv[process.argv.indexOf('--room') + 1];
  if (!process.argv.includes('--room') || !/^[A-Z0-9]{6}$/.test(roomId)) throw Error('Use --room ABC123 [--apply].');
  const apply = process.argv.includes('--apply');
  const project = JSON.parse(fs.readFileSync('.firebaserc', 'utf8')).projects.default;
  const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  const cliAuth = require(path.join(globalRoot, 'firebase-tools/lib/auth.js'));
  const account = cliAuth.getGlobalDefaultAccount();
  if (!account) throw Error('Firebase login required.');
  const token = await cliAuth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase']);
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
  async function request(url, method = 'GET', body) {
    const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (!response.ok) throw Error(`Firestore ${response.status}; no credentials printed.`);
    return response.json();
  }
  const directory = unpack(await request(`${base}/roomCodes/${roomId}`));
  const roomDoc = await request(`${base}/users/${directory.ownerUid}/rooms/${roomId}`);
  const settingsDoc = await request(`${base}/appSettings/global`);
  const room = unpack(roomDoc), settings = unpack(settingsDoc);
  if (room.status !== 'RESULT' || room.currentMonth !== 24) throw Error('Only completed 24-month lessons can be repaired.');
  if (room.calculationCorrection) throw Error('This lesson has already been repaired.');
  const { normalizeGlobalMultipliers } = await import('../src/data/simulationSettings.js');
  const { replaySimulation } = await import('../src/lib/replaySimulation.js');
  const { getAssetChange } = await import('../src/lib/game.js');
  const teams = replaySimulation(room);
  const now = Date.now();
  const originalTeams = Object.fromEntries(Object.entries(room.teams).map(([key, team]) => [key, { currentAsset: team.currentAsset, assetHistory: team.assetHistory, lastEventImpact: team.lastEventImpact || null, equityDilutionApplied: team.equityDilutionApplied || false }]));
  const patch = {
    calculationVersion: 2,
    calculationCorrection: { correctedAt: now, reason: 'F16/F17 percent-vs-multiplier and direction correction; replayed recorded events', originalGlobalFactorMultipliers: room.simulationSettings.globalFactorMultipliers, originalTeams },
    simulationSettings: { ...room.simulationSettings, globalFactorMultipliers: normalizeGlobalMultipliers(room.simulationSettings.globalFactorMultipliers) },
    updatedAt: now
  };
  for (const [key, team] of Object.entries(teams)) {
    for (const field of ['currentAsset', 'assetHistory', 'lastEventImpact', 'equityDilutionApplied']) patch[`teams.${key}.${field}`] = team[field];
  }
  function write(document, flatPatch) {
    const nested = {};
    for (const [key, value] of Object.entries(flatPatch)) {
      const parts = key.split('.'); let target = nested;
      for (const part of parts.slice(0, -1)) target = target[part] ||= {};
      target[parts.at(-1)] = value;
    }
    return { update: { name: document.name, fields: encode(nested).mapValue.fields }, updateMask: { fieldPaths: Object.keys(flatPatch) }, currentDocument: { updateTime: document.updateTime } };
  }
  const summary = Object.keys(teams).sort().map(key => ({ team: key, beforeRate: getAssetChange(room.teams[key]).rate, afterRate: getAssetChange(teams[key]).rate, afterAsset: teams[key].currentAsset }));
  if (apply) {
    fs.mkdirSync('.local-tools', { recursive: true });
    fs.writeFileSync(`.local-tools/repair-${roomId}-${now}-backup.json`, JSON.stringify({ roomDoc, settingsDoc }, null, 2), { flag: 'wx' });
    await request(`${base}:commit`, 'POST', { writes: [write(roomDoc, patch), write(settingsDoc, { 'simulation.globalFactorMultipliers': normalizeGlobalMultipliers(settings.simulation?.globalFactorMultipliers), updatedAt: now })] });
    const checked = unpack(await request(`${base}/users/${directory.ownerUid}/rooms/${roomId}`));
    for (const key of Object.keys(teams)) if (checked.teams[key].currentAsset !== teams[key].currentAsset) throw Error('Read-back verification failed.');
    console.log('Applied and verified; original fields retained for rollback.');
  }
  console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', roomId, teams: summary }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
