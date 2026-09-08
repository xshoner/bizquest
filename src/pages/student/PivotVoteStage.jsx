import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, RotateCcw } from "lucide-react";
import { PIVOT_SCENARIOS } from "../../data/simulationSettings.js";
import { formatWon, getStudentsByTeam } from "../../lib/game.js";
import { updateOwnTeam } from "../../lib/roomStore.js";
import { playPivotTransition } from "../../lib/audio.js";

const STALE_MESSAGE = "화면 정보가 오래되어 저장하지 못했습니다. 새로고침 버튼을 누르거나 다시 QR코드를 촬영하세요.";

function writeErrorMessage(err, fallback) {
  if (err?.code === "permission-denied") return STALE_MESSAGE;
  if (err?.code === "unavailable") return "네트워크 연결이 불안정합니다. 잠시 후 다시 시도하세요.";
  return err?.message || fallback;
}

function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return <div role="alert" className="mt-3 rounded-lg bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 ring-1 ring-rose-200"><div className="flex items-start justify-between gap-3"><span>{message}</span><button type="button" onClick={onDismiss} className="shrink-0 font-black">닫기</button></div>{message === STALE_MESSAGE && <button type="button" onClick={() => window.location.reload()} className="touch-button mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-3 font-black text-white"><RotateCcw size={16} /> 새로고침</button>}</div>;
}

function immediateText(scenario) {
  if (scenario.id === "early_exit") return "현재 자산 동결";
  if (Number(scenario.immediateRate || 0)) return `현재 자산 ${scenario.immediateRate > 0 ? "+" : ""}${scenario.immediateRate}%`;
  const amount = Number(scenario.immediateAmount || 0);
  return amount ? `${amount > 0 ? "+" : "-"}${formatWon(Math.abs(amount))}` : "즉시 비용 없음";
}

function effectText(scenario) {
  const primary = Number(scenario.primaryMultiplier || 1);
  const secondary = Number(scenario.secondaryMultiplier || 1);
  const descriptions = {
    government_support: `F09 이벤트 ${primary}배`, professional_management: `최종 자산 ${Number(scenario.dilutionRate || 0)}% 지분 희석`, downsizing: `모든 이벤트 ${primary}배`, aggressive_expansion: `모든 이벤트 ${primary}배`, turnaround: "최저 등급 팩터 1개 상향", early_exit: "13~24개월 이벤트 미적용", global_expansion: `F01·F04 ${primary}배 / F11 ${secondary}배`, ip_protection: `F14 양호 / E05·E19 하락 ${primary}배`, cofounder_reset: `E16·E20 하락 ${primary}배 / 양호 상승 ${secondary}배`, crowdfunding: `F02·F07·F11 ${primary}배`
  };
  return descriptions[scenario.id] || scenario.effectLabel;
}

export default function PivotVoteStage({ room, uid, student }) {
  const [visible, setVisible] = useState(false);
  const team = room.teams?.[student.team];
  const scenarios = room.simulationSettings?.pivotScenarios || PIVOT_SCENARIOS;
  const savedVote = team?.midDecision?.votes?.[uid] || "";
  const [selected, setSelected] = useState(savedVote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const members = getStudentsByTeam(room.students, student.team);
  const votes = team?.midDecision?.votes || {};
  const votedCount = members.filter((member) => votes[member.uid]).length;
  const resolved = team?.midDecision?.resolvedScenario;
  const winner = scenarios.find((scenario) => scenario.id === resolved);

  useEffect(() => { if (savedVote) setSelected(savedVote); }, [savedVote]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => { setVisible(true); playPivotTransition(); }, 3500);
    return () => { window.clearTimeout(timer); document.body.style.overflow = previousOverflow; };
  }, []);

  async function confirmVote() {
    if (!selected || savedVote || busy) return;
    setBusy(true); setError("");
    try {
      await updateOwnTeam(room.ownerUid, room.roomId, student.team, { [`midDecision.votes.${uid}`]: selected }, `${student.nickname} 학생이 피벗 투표를 확정했습니다.`);
    } catch (err) {
      setError(writeErrorMessage(err, "피벗 투표를 저장하지 못했습니다."));
    } finally { setBusy(false); }
  }

  if (!visible) return null;
  return createPortal(<div className="pivot-vote-overlay" role="dialog" aria-modal="true" aria-labelledby="pivot-vote-title"><section className="pivot-vote-modal">
    <div className="pivot-vote-top"><span>12개월 피벗 포인트</span><b>{votedCount}/{members.length}명 선택 완료</b></div>
    <h2 id="pivot-vote-title">우리 회사의 미래를 선택하세요</h2>
    <p>우리 회사의 미래를 바꿀 아래 10개의 피벗 카드 중 하나를 고르세요. 모든 팀원이 투표하고 가장 높은 투표를 받은 카드가 자동으로 선택됩니다.</p>
    {resolved && <div className="pivot-resolved-banner"><span>{winner?.icon}</span><div><small>우리 팀 최종 선택</small><strong>{winner?.title || resolved}</strong></div></div>}
    <div className="pivot-card-viewport"><span className="pivot-scroll-arrow pivot-scroll-arrow-left" aria-hidden="true">‹</span><div className="pivot-card-scroller" aria-label="피벗 카드 목록">{scenarios.map((scenario, index) => { const active = selected === scenario.id; return <button key={scenario.id} type="button" disabled={Boolean(savedVote || resolved)} onClick={() => setSelected(scenario.id)} className={`pivot-card pivot-card-tone-${index % 10} ${active ? "pivot-card-selected" : ""}`}><span className="pivot-card-icon">{scenario.icon}</span><small>{scenario.tone}</small><h3>{scenario.title}</h3><p>{scenario.summary}</p><dl><div><dt>즉시 효과</dt><dd>{immediateText(scenario)}</dd></div><div><dt>13~24개월</dt><dd>{effectText(scenario)}</dd></div></dl>{active && <b className="pivot-card-check"><Check size={16} /> 선택</b>}</button>; })}</div><span className="pivot-scroll-arrow pivot-scroll-arrow-right" aria-hidden="true">›</span></div>
    <div className="pivot-scroll-hint">← 좌우로 밀어 10개 카드를 확인하세요 →</div>
    <ErrorBanner message={error} onDismiss={() => setError("")} />
    <button type="button" disabled={!selected || Boolean(savedVote) || busy} onClick={confirmVote} className="pivot-confirm-button">{savedVote ? "선택 확정 완료 · 변경할 수 없음" : busy ? "확정 중..." : "이 카드로 투표 확정"}</button>
    {savedVote && !resolved && <p className="pivot-waiting-copy">다른 팀원의 선택을 기다리고 있습니다.</p>}
  </section></div>, document.body);
}
