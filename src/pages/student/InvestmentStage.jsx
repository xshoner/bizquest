import { useEffect, useState } from "react";
import { CircleDollarSign } from "lucide-react";
import { INVESTMENT_BUDGET, INVESTMENT_STEP, formatWon, getTeamEntries, sumInvestments } from "../../lib/game.js";
import { updateOwnStudent } from "../../lib/roomStore.js";
import { StudentAiEvaluationReport } from "./SimulationStage.jsx";

const STALE_SCREEN_MESSAGE = "화면 정보가 오래되어 저장하지 못했습니다. 새로고침 버튼을 누르거나 다시 QR코드를 촬영하세요.";

function writeErrorMessage(err, fallback) {
  if (err?.code === "permission-denied") return STALE_SCREEN_MESSAGE;
  if (err?.code === "unavailable") return "네트워크 연결이 불안정합니다. 잠시 후 다시 시도하세요.";
  return err?.message || fallback;
}

function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div role="alert" className="mt-3 rounded-lg bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 ring-1 ring-rose-200">
      <div className="flex items-start justify-between gap-3"><span>{message}</span><button type="button" onClick={onDismiss} className="shrink-0 font-black">닫기</button></div>
      {message === STALE_SCREEN_MESSAGE && <button type="button" onClick={() => window.location.reload()} className="touch-button mt-3 w-full rounded-lg bg-rose-600 px-4 py-3 font-black text-white">새로고침</button>}
    </div>
  );
}

function pickInvestments(investments, allowedKeys) {
  const result = {};
  for (const key of allowedKeys) {
    const value = Number(investments?.[key] || 0);
    if (value > 0) result[key] = value;
  }
  return result;
}

function InvestmentTeamDetails({ team }) {
  const idea = team.idea || {};
  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3">
      <div className="space-y-2 text-sm leading-6 text-slate-700">
        <p><b>제품 및 서비스명:</b> {idea.serviceName || "-"}</p><p><b>트렌드:</b> {team.trendCard?.title || "미선택"}</p><p><b>기술카드:</b> {team.techCard?.title || "미선택"}</p><p><b>문제정의:</b> {idea.problem || "-"}</p><p><b>고객정의:</b> {(idea.customers || []).join(", ") || "-"}</p><p><b>제품/서비스:</b> {idea.product || idea.solution || "-"}</p><p><b>수익모델:</b> {(idea.revenueModels || []).join(", ") || "-"}</p><p><b>마케팅:</b> {(idea.marketingStrategies || []).join(", ") || "-"}</p>
      </div>
      {team.aiEvaluation ? <StudentAiEvaluationReport team={team} /> : <div className="mt-3 rounded-lg bg-white px-3 py-3 text-sm font-black text-slate-500">AI 평가 결과 대기</div>}
    </div>
  );
}

export default function InvestmentStage({ room, uid, student }) {
  const availableTeams = getTeamEntries(room.teams).filter(([key]) => key !== student.team);
  const availableKeys = availableTeams.map(([key]) => key);
  const [investments, setInvestments] = useState(() => pickInvestments(student.investments, availableKeys));
  const [directInputTeam, setDirectInputTeam] = useState(null);
  const [expandedTeam, setExpandedTeam] = useState(null);
  const [viewMode, setViewMode] = useState("compare");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [limitHint, setLimitHint] = useState("");
  const total = sumInvestments(investments);
  const submitted = Boolean(student.investmentSubmitted);

  useEffect(() => setInvestments(pickInvestments(student.investments, availableKeys)), [student.investments, availableKeys.join("|")]);

  async function submit() {
    if (busy) return;
    if (total > INVESTMENT_BUDGET) return setError(`투자 총액이 예산(${formatWon(INVESTMENT_BUDGET)})을 초과했습니다.`);
    setBusy(true); setError("");
    try {
      await updateOwnStudent(room.ownerUid, room.roomId, uid, { investments: pickInvestments(investments, availableKeys), investmentSubmitted: true });
    } catch (err) {
      setError(writeErrorMessage(err, "투자를 저장하지 못했습니다. 다시 시도하세요."));
    } finally { setBusy(false); }
  }

  function setAmount(teamKey, amount) {
    const sanitized = Math.max(0, Math.min(INVESTMENT_BUDGET, Math.round(Number(amount || 0) / INVESTMENT_STEP) * INVESTMENT_STEP));
    const next = { ...investments, [teamKey]: sanitized };
    if (sumInvestments(next) <= INVESTMENT_BUDGET) { setInvestments(next); setLimitHint(""); return; }
    const remaining = Math.max(0, INVESTMENT_BUDGET - (total - Number(investments[teamKey] || 0)));
    setInvestments({ ...investments, [teamKey]: remaining });
    setLimitHint(`잔여 투자금이 부족해 ${formatWon(remaining)}으로 조정했습니다.`);
  }

  return (
    <section>
      <h2 className="text-2xl font-black">가상 투자</h2>
      <div className="mt-3 rounded-lg bg-slate-900 p-4 text-white"><p className="text-sm text-slate-300">잔여 투자금</p><p className="text-3xl font-black">{formatWon(INVESTMENT_BUDGET - total)}</p></div>
      <div className="mt-3 rounded-lg bg-indigo-50 px-4 py-3 text-sm font-black leading-6 text-indigo-700 ring-1 ring-indigo-100"><p>우리 팀 사업에는 투자할 수 없습니다.</p><p>상대팀 사업내용을 보고 투자하세요.</p></div>
      {submitted && <div className="ticker-pulse mt-3 rounded-lg bg-rose-50 px-4 py-3 text-sm font-black text-rose-700">투자 완료. 금액을 바꾸고 다시 누르면 재확정됩니다.</div>}
      {limitHint && <div className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700 ring-1 ring-amber-200">{limitHint}</div>}
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <div className="investment-view-tabs" role="tablist" aria-label="기업 정보 보기 방식"><button type="button" role="tab" aria-selected={viewMode === "compare"} onClick={() => setViewMode("compare")}>나란히 비교</button><button type="button" role="tab" aria-selected={viewMode === "list"} onClick={() => setViewMode("list")}>빠른 투자</button></div>
      <div className={`mt-4 ${viewMode === "compare" ? "investment-compare-scroller" : "space-y-3"}`}>
        {availableTeams.map(([key, team]) => {
          const expanded = viewMode === "compare" || expandedTeam === key;
          return <article key={key} className={`rounded-lg bg-white p-4 shadow-lift ${viewMode === "compare" ? "investment-compare-card" : ""}`}>
            <p className="text-sm font-bold text-indigo-600">{team.teamName}</p><h3 className="mt-1 text-lg font-black">{team.idea?.product || team.idea?.solution || team.techCard?.title || "아이디어 준비 중"}</h3><p className="mt-2 text-sm text-slate-500">{team.idea?.problem || team.trendCard?.title || "팀 발표를 듣고 투자하세요."}</p>
            {viewMode === "list" && <button type="button" onClick={() => setExpandedTeam(expanded ? null : key)} className="touch-button mt-3 w-full rounded-lg bg-indigo-50 px-3 py-2 text-sm font-black text-indigo-700">{expanded ? "사업 내용 및 AI 평가 접기" : "사업 내용 및 AI 평가 보기"}</button>}
            {expanded && <InvestmentTeamDetails team={team} />}
            <div className="investment-range-row"><button type="button" onClick={() => setAmount(key, Number(investments[key] || 0) - INVESTMENT_STEP)} aria-label={`${team.teamName} 투자금 100만원 줄이기`}>−</button><input type="range" min="0" max={INVESTMENT_BUDGET} step={INVESTMENT_STEP} value={investments[key] || 0} onChange={(event) => setAmount(key, event.target.value)} aria-label={`${team.teamName} 투자 금액`} className="w-full accent-indigo-600" /><button type="button" onClick={() => setAmount(key, Number(investments[key] || 0) + INVESTMENT_STEP)} aria-label={`${team.teamName} 투자금 100만원 늘리기`}>+</button></div>
            <strong className="investment-current-amount">{formatWon(investments[key] || 0)}</strong>
            <button type="button" onClick={() => setDirectInputTeam(directInputTeam === key ? null : key)} className="touch-button mt-3 w-full rounded-lg bg-slate-100 px-3 py-2 text-sm font-black text-slate-700">직접 입력</button>
            {directInputTeam === key && <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 p-3"><input type="number" inputMode="numeric" min="0" max={INVESTMENT_BUDGET} step={INVESTMENT_STEP} value={investments[key] || 0} onChange={(event) => setAmount(key, event.target.value)} aria-label={`${team.teamName} 투자 금액 직접 입력`} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-3 text-right font-black outline-none focus:border-indigo-500" /><span className="text-sm font-bold text-slate-500">원</span></div>}
          </article>;
        })}
      </div>
      <button disabled={busy} onClick={submit} className={`touch-button mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-4 text-lg font-black text-white disabled:opacity-60 ${submitted ? "bg-rose-600" : "bg-emerald-600"}`}><CircleDollarSign size={20} /> {busy ? "저장 중..." : submitted ? "투자 재확정" : "투자 확정"}</button>
    </section>
  );
}
