// Run with an authenticated Firebase CLI account that owns the project.
// Dry run: node scripts/migrate-classroom-access.cjs
// Apply directory only: node scripts/migrate-classroom-access.cjs --apply
// Grant a verified operator and remove the obsolete passcode:
// node scripts/migrate-classroom-access.cjs --apply --admin-uid FIREBASE_UID
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

async function main() {
  const project = JSON.parse(fs.readFileSync(".firebaserc", "utf8")).projects.default;
  const apply = process.argv.includes("--apply");
  const uidIndex = process.argv.indexOf("--admin-uid");
  const adminUid = uidIndex >= 0 ? process.argv[uidIndex + 1] : null;
  if (uidIndex >= 0 && !/^[A-Za-z0-9_-]{1,128}$/.test(adminUid || "")) throw new Error("Valid --admin-uid required.");
  const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
  const cliAuth = require(path.join(globalRoot, "firebase-tools/lib/auth.js"));
  const account = cliAuth.getGlobalDefaultAccount();
  if (!account) throw new Error("Run firebase login first.");
  const token = await cliAuth.getAccessToken(account.tokens.refresh_token, ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/firebase"]);
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
  async function request(url, method = "GET", body) {
    const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Firebase request failed (${response.status}).`);
    return response.json();
  }
  if (adminUid) {
    const record = await request(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:lookup`, "POST", { localId: [adminUid] });
    if (!record?.users?.[0]?.email || record.users[0].disabled) throw new Error("Operator UID must belong to an enabled teacher account.");
  }
  const rows = await request(`${base}:runQuery`, "POST", { structuredQuery: { from: [{ collectionId: "rooms", allDescendants: true }], select: { fields: [{ fieldPath: "roomId" }, { fieldPath: "ownerUid" }] } } });
  const codes = new Map();
  for (const row of rows || []) {
    const match = row.document?.name?.match(/\/users\/([^/]+)\/rooms\/([A-Z0-9]{6})$/);
    if (!match) continue;
    if (codes.has(match[2]) && codes.get(match[2]) !== match[1]) throw new Error(`Duplicate room code ${match[2]}: use QR until a new code is assigned.`);
    codes.set(match[2], match[1]);
  }
  // Check every code before any writes so a conflict cannot leave a partial migration.
  for (const [roomId, ownerUid] of codes) {
    const current = await request(`${base}/roomCodes/${roomId}`);
    if (current && current.fields?.ownerUid?.stringValue !== ownerUid) throw new Error(`Directory conflict: ${roomId}`);
  }
  if (apply) {
    for (const [roomId, ownerUid] of codes) await request(`${base}/roomCodes/${roomId}`, "PATCH", { fields: { roomId: { stringValue: roomId }, ownerUid: { stringValue: ownerUid } } });
    if (adminUid) {
      await request(`${base}/platformAdmins/${adminUid}`, "PATCH", { fields: { enabled: { booleanValue: true } } });
      // An empty field with an explicit update mask deletes only these legacy fields.
      const settings = await request(`${base}/appSettings/global`);
      if (settings) await request(`${base}/appSettings/global?updateMask.fieldPaths=adminPasscode&updateMask.fieldPaths=adminPasscodeChangedAt`, "PATCH", { fields: {} });
    }
  }
  console.log(JSON.stringify({ project, mode: apply ? "applied" : "dry-run", roomCodes: codes.size, operator: adminUid ? "verified" : "not requested" }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
