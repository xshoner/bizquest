import { useEffect, useRef, useState } from "react";
import { CircleDollarSign } from "lucide-react";
import { INVESTMENT_BUDGET, INVESTMENT_STEP, countAiGrades, getTeamEntries, sumInvestments } from "../../lib/game.js";
import { updateOwnStudent } from "../../lib/roomStore.js";
import { BUSINESS_FACTORS } from "../../data/gameData.js";
import { getEvaluationFactor } from "../../lib/aiEvaluation.js";

const formatInvestment = (value) => `${(Number(value || 0) / 10000).toLocaleString("ko-KR")}만 원`;

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
      {team.aiEvaluation ? <>
        <p className="mt-4 font-bold">{Object.entries(countAiGrades(team)).map(([grade, count]) => `${grade} ${count}건`).join(" · ")}</p>
        <details className="mt-3" onClick={(event) => event.stopPropagation()}><summary className="touch-button cursor-pointer rounded-lg bg-indigo-50 p-3 font-bold text-indigo-700">AI 평가 의견 보기</summary>
          <p className="my-3 whitespace-pre-wrap">{team.aiEvaluation.opinion}</p>
          {BUSINESS_FACTORS.map((factor) => { const evaluation = getEvaluationFactor(team, factor.id); return <div className="my-3" key={factor.id}><b>{factor.name} · {evaluation?.grade || "보통"}</b><p className="whitespace-pre-wrap text-sm leading-6">{evaluation?.reason || "평가 의견 없음"}</p></div>; })}
        </details>
      </> : <p className="mt-3">AI 평가 결과 대기</p>}
    </div>
  );
}

export default function InvestmentStage({ room, uid, student }) {
  const availableTeams = getTeamEntries(room.teams).filter(([key]) => key !== student.team);
  const availableKeys = availableTeams.map(([key]) => key);
  const draftKey = `bizquest:investment:${room.ownerUid}:${room.roomId}:${room.createdAt}:${uid}:${student.team}`;
  const [investments, setInvestments] = useState(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey));
      if (draft && sumInvestments(draft) <= INVESTMENT_BUDGET) return pickInvestments(draft, availableKeys);
    } catch { /* Use server values if local storage is unavailable. */ }
    return pickInvestments(student.investments, availableKeys);
  });
  const dirty = useRef(JSON.stringify(investments) !== JSON.stringify(pickInvestments(student.investments, availableKeys)));
  const saveTimer = useRef(null);
  const latest = useRef(investments);
  latest.current = investments;
  const queue = useRef(Promise.resolve());
  const [saveStatus, setSaveStatus] = useState("");
  const [revision, setRevision] = useState(0);
  const [directAmount, setDirectAmount] = useState("");
  const [directInputTeam, setDirectInputTeam] = useState(null);
  const [expandedTeam, setExpandedTeam] = useState(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [limitHint, setLimitHint] = useState("");
  const total = sumInvestments(investments);
  const submitted = Boolean(student.investmentSubmitted);

  // A collection snapshot recreates every student's investment map. It must not replace an editor.
  const serverSignature = JSON.stringify(pickInvestments(student.investments, [...availableKeys].sort()));
  useEffect(() => {
    if (!dirty.current) setInvestments(JSON.parse(serverSignature));
  }, [serverSignature]);

  function save(payload, confirmed) {
    const work = queue.current.catch(() => {}).then(async () => {
      await updateOwnStudent(room.ownerUid, room.roomId, uid, { investments: pickInvestments(payload, availableKeys), investmentSubmitted: confirmed });
      if (JSON.stringify(latest.current) === JSON.stringify(payload)) {
        if (confirmed) dirty.current = false;
        setSaveStatus(confirmed ? "투자 확정 완료" : "입력 금액 자동저장 완료");
        try { localStorage.removeItem(draftKey); } catch { /* Best effort. */ }
      }
    });
    queue.current = work;
    return work;
  }

  useEffect(() => {
    if (!dirty.current) return;
    const timer = saveTimer.current = setTimeout(() => {
      setSaveStatus("자동저장 중…");
      save(investments, false).catch((err) => { setSaveStatus("저장 실패 · 기기에 보관 중"); setError(writeErrorMessage(err, "연결 후 다시 저장해 주세요.")); });
    }, 400);
    return () => clearTimeout(timer);
  }, [investments, revision]);
  useEffect(() => {
    const retry = () => { if (dirty.current) setRevision((value) => value + 1); };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);
  useEffect(() => {
    if (!expandedTeam) return;
    const close = (event) => { if (event.key === "Escape") setExpandedTeam(null); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [expandedTeam]);

  async function submit() {
    if (busy) return;
    clearTimeout(saveTimer.current);
    if (total > INVESTMENT_BUDGET) return setError("투자 예산을 초과했습니다.");
    setBusy(true); setError("");
    try { await save(investments, true); }
    catch (err) { setError(writeErrorMessage(err, "투자를 저장하지 못했습니다. 다시 시도하세요.")); }
    finally { setBusy(false); }
  }

  function setAmount(teamKey, amount) {
    if (busy || !Number.isFinite(Number(amount))) return;
    dirty.current = true;
    const current = latest.current;
    const remaining = Math.max(0, INVESTMENT_BUDGET - (sumInvestments(current) - Number(current[teamKey] || 0)));
    const requested = Math.max(0, Math.round(Number(amount) / INVESTMENT_STEP) * INVESTMENT_STEP);
    const next = { ...current, [teamKey]: Math.min(remaining, requested) };
    latest.current = next;
    setInvestments(next);
    setSaveStatus("자동저장 대기");
    setLimitHint(requested > remaining ? `잔여 투자금이 부족해 ${formatInvestment(remaining)}으로 조정했습니다.` : "");
    try { localStorage.setItem(draftKey, JSON.stringify(next)); } catch { /* Server save still works. */ }
  }

  return (
    <section>
      <h2 className="text-2xl font-black">가상 투자</h2>
      <div className="mt-3 rounded-lg bg-slate-900 p-4 text-white"><p className="text-sm text-slate-300">잔여 투자금</p><p className="text-3xl font-black">{formatInvestment(INVESTMENT_BUDGET - total)}</p></div>
      <div className="mt-3 rounded-lg bg-indigo-50 px-4 py-3 text-sm font-black leading-6 text-indigo-700 ring-1 ring-indigo-100"><p>우리 팀 사업에는 투자할 수 없습니다.</p><p>상대팀 사업내용을 보고 투자하세요.</p></div>
      {submitted && <div className="ticker-pulse mt-3 rounded-lg bg-rose-50 px-4 py-3 text-sm font-black text-rose-700">투자 완료. 금액을 바꾸고 다시 누르면 재확정됩니다.</div>}
      {limitHint && <div className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700 ring-1 ring-amber-200">{limitHint}</div>}
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <p role="status" className="mt-3 text-sm text-slate-500">{saveStatus}</p>
      <div className="mt-4 space-y-3">
        {availableTeams.map(([key, team]) => {
          return <article key={key} className="rounded-xl bg-white p-4 shadow-lift">
            <button type="button" onClick={() => setExpandedTeam(key)} className="investment-team-open w-full rounded-lg bg-indigo-50 p-3 text-left">
              <strong className="investment-team-name">{team.teamName}</strong><span className="mt-1 block text-sm text-slate-600">{team.idea?.serviceName || "아이템명 미입력"} · 내용 보기</span>
            </button>
            <div className="investment-range-row"><button type="button" onClick={() => setAmount(key, Number(investments[key] || 0) - INVESTMENT_STEP)} aria-label={`${team.teamName} 투자금 100만원 줄이기`}>−</button><input type="range" min="0" max={INVESTMENT_BUDGET} step={INVESTMENT_STEP} value={investments[key] || 0} onChange={(event) => setAmount(key, event.target.value)} aria-label={`${team.teamName} 투자 금액`} className="w-full accent-indigo-600" /><button type="button" onClick={() => setAmount(key, Number(investments[key] || 0) + INVESTMENT_STEP)} aria-label={`${team.teamName} 투자금 100만원 늘리기`}>+</button></div>
            <strong className="investment-current-amount">{formatInvestment(investments[key] || 0)}</strong>
            <button type="button" onClick={() => { setDirectInputTeam(directInputTeam === key ? null : key); setDirectAmount(String(Number(investments[key] || 0) / 10000)); }} className="touch-button mt-3 w-full rounded-lg bg-slate-100 px-3 py-2 text-sm font-black text-slate-700">직접 입력</button>
            {directInputTeam === key && <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 p-3"><input type="number" inputMode="numeric" min="0" max={INVESTMENT_BUDGET / 10000} step={INVESTMENT_STEP / 10000} value={directAmount} onChange={(event) => setDirectAmount(event.target.value)} aria-label={`${team.teamName} 투자 금액 직접 입력 (만 원)`} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-3 text-right font-black outline-none focus:border-indigo-500" /><span className="text-sm font-bold text-slate-500">만 원</span><button type="button" className="rounded-lg bg-slate-900 p-3 text-white" onClick={() => { if (!Number.isFinite(Number(directAmount))) return; setAmount(key, Number(directAmount) * 10000); setDirectInputTeam(null); }}>적용</button></div>}
          </article>;
        })}
      </div>
      {expandedTeam && room.teams[expandedTeam] && <div className="investment-modal" onClick={() => setExpandedTeam(null)}>
        <div role="dialog" aria-modal="true" aria-labelledby="investment-dialog-title" className="investment-modal-panel">
          <button type="button" autoFocus className="float-right rounded-lg bg-slate-100 px-3 py-2 font-bold" onClick={() => setExpandedTeam(null)}>닫기</button>
          <h3 id="investment-dialog-title" className="text-xl font-black">{room.teams[expandedTeam].teamName}</h3>
          <p className="mt-2 text-xs text-slate-500">아무 곳이나 누르면 닫힙니다. AI 평가 의견은 펼쳐서 읽을 수 있습니다.</p>
          <InvestmentTeamDetails team={room.teams[expandedTeam]} />
        </div>
      </div>}
      <button disabled={busy} onClick={submit} className={`touch-button mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-4 text-lg font-black text-white disabled:opacity-60 ${submitted ? "bg-rose-600" : "bg-emerald-600"}`}><CircleDollarSign size={20} /> {busy ? "저장 중..." : submitted ? "투자 재확정" : "투자 확정"}</button>
    </section>
  );
}
