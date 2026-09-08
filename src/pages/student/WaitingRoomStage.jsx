import { useEffect, useState } from "react";
import { getTeamEntries, normalizeTeamName } from "../../lib/game.js";
import { updateOwnStudent, updateOwnTeam } from "../../lib/roomStore.js";
import { MascotAvatar } from "../../components/shared/MascotAvatar.jsx";
import { TEAM_MASCOTS } from "../../lib/mascots.js";

function errorMessage(err) {
  if (err?.code === "permission-denied") return "화면 정보가 오래되어 저장하지 못했습니다. 새로고침 후 다시 시도하세요.";
  if (err?.code === "unavailable") return "네트워크 연결이 불안정합니다. 잠시 후 다시 시도하세요.";
  return err?.message || "저장하지 못했습니다. 다시 시도하세요.";
}

export default function WaitingRoomStage({ room, uid }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedTeamKey = room.students?.[uid]?.team;
  const selectedTeam = room.teams?.[selectedTeamKey];
  const teamLocked = selectedTeam?.teamSetupComplete === true;
  const isLeader = selectedTeam?.leaderId === uid;
  const [setupName, setSetupName] = useState(selectedTeam?.teamName || "");
  const [selectedMascotId, setSelectedMascotId] = useState(selectedTeam?.mascot || "");
  const [slogan, setSlogan] = useState(selectedTeam?.teamSlogan || "");

  useEffect(() => {
    setSetupName(selectedTeam?.teamName || "");
    setSelectedMascotId(selectedTeam?.mascot || "");
    setSlogan(selectedTeam?.teamSlogan || "");
  }, [selectedTeamKey, selectedTeam?.teamName, selectedTeam?.mascot, selectedTeam?.teamSlogan]);

  async function selectTeam(teamKey) {
    if (busy || teamLocked || room.teams?.[teamKey]?.teamSetupComplete) return;
    const nextTeam = selectedTeamKey === teamKey ? null : teamKey;
    setBusy(true); setError("");
    try { await updateOwnStudent(room.ownerUid, room.roomId, uid, { team: nextTeam }); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  async function saveTeamSetup() {
    const nextName = normalizeTeamName(setupName).slice(0, 10);
    const nextSlogan = slogan.trim().slice(0, 40);
    if (!nextName || !selectedMascotId || !nextSlogan) return setError("팀 이름, 마스코트, 팀 구호를 모두 정해 주세요.");
    if (!selectedTeamKey || !isLeader || busy || teamLocked) return;
    setSetupName(nextName); setSlogan(nextSlogan); setBusy(true); setError("");
    try {
      await updateOwnTeam(room.ownerUid, room.roomId, selectedTeamKey, { teamName: nextName, mascot: selectedMascotId, teamSlogan: nextSlogan, teamSetupComplete: true }, `${nextName} 팀 구성이 완료되었습니다.`);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  return <section>
    <h2 className="text-2xl font-black">{teamLocked ? "우리 팀 구성이 완료되었습니다" : "팀을 선택하세요"}</h2>
    {teamLocked && <p className="mt-2 text-sm text-slate-600">팀 변경은 관리자만 할 수 있습니다.</p>}
    {error && <div role="alert" className="mt-3 rounded-lg bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 ring-1 ring-rose-200"><div className="flex items-start justify-between gap-3"><span>{error}</span><button type="button" onClick={() => setError("")} className="shrink-0 font-black">닫기</button></div></div>}
    <div className="mt-4 grid grid-cols-2 gap-3">{getTeamEntries(room.teams).filter(([key]) => !teamLocked || key === selectedTeamKey).map(([key, team]) => {
      const count = Object.values(room.students || {}).filter((member) => member.team === key).length;
      const selected = selectedTeamKey === key;
      return <button key={key} disabled={busy || teamLocked || team.teamSetupComplete} onClick={() => selectTeam(key)} className={`touch-button rounded-lg p-4 text-left shadow-lift disabled:cursor-not-allowed ${selected ? "selected-team-card text-white" : "bg-white text-slate-900"}`}><div className="waiting-team-title"><MascotAvatar mascotId={team.mascot} size="small" /><p className="break-keep text-xl font-black">{team.teamName}</p></div><p className={`mt-1 text-sm ${selected ? "text-white/85" : "text-slate-500"}`}>{count}명 참여{team.teamSetupComplete ? " · 구성 완료" : selected ? " · 선택됨" : ""}</p></button>;
    })}</div>
    {selectedTeam && <section className="team-identity-setup"><div className="team-identity-heading"><MascotAvatar mascotId={selectedMascotId || selectedTeam.mascot} size="large" /><div><p>우리 회사 만들기</p><h3>팀 이름·마스코트·구호</h3></div></div>{isLeader && !teamLocked ? <><label className="team-slogan-field team-name-field"><span>기업명 <b>{setupName.length}/10</b></span><input value={setupName} maxLength={10} onChange={(event) => setSetupName(event.target.value)} placeholder="10자 이내 기업명" /></label><p className="team-identity-guide">팀을 표현하는 마스코트를 하나 골라 주세요.</p><div className="mascot-picker" role="list" aria-label="회사 마스코트 선택">{TEAM_MASCOTS.map((mascot) => <button key={mascot.id} type="button" disabled={busy} className={selectedMascotId === mascot.id ? "selected" : ""} onClick={() => setSelectedMascotId(mascot.id)} title={mascot.name}><MascotAvatar mascotId={mascot.id} size="medium" /><span>{mascot.name}</span></button>)}</div><label className="team-slogan-field"><span>팀 구호 만들기 <b>{slogan.length}/40</b></span><input value={slogan} maxLength={40} onChange={(event) => setSlogan(event.target.value)} onKeyDown={(event) => event.key === "Enter" && saveTeamSetup()} placeholder="예: 아이디어를 현실로, 우리는 할 수 있다!" /></label><button type="button" disabled={busy} onClick={saveTeamSetup} className="team-slogan-save">{busy ? "저장 중..." : "팀 구성 저장하기"}</button></> : <div className="team-identity-readonly"><strong>{selectedTeam.teamSlogan || "아직 팀 구호를 정하지 않았어요."}</strong><span>{teamLocked ? "팀 구성이 완료되었습니다. 변경이 필요하면 관리자에게 요청하세요." : "팀장이 마스코트와 구호를 정할 수 있습니다."}</span></div>}</section>}
  </section>;
}
