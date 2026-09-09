import { openEvaluationReport } from "../../lib/evaluationReport.js";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BUSINESS_FACTORS } from "../../data/gameData.js";
import { TEAM_BASE_ASSET, applyRiskMultiplier, formatWon, getTeamBaseAsset, getTeamStartingCapital } from "../../lib/game.js";
import { getEvaluationFactor } from "../../lib/aiEvaluation.js";
import { getEventImage } from "../../lib/assets.js";
import { EventCardVisual } from "../../components/shared/Effects.jsx";
import { gradeClassName } from "../../components/shared/AssetCharts.jsx";

function getDisplayAsset(team, currentMonth) {
  if (!team) return 0;
  if (currentMonth > 0 || team.lastEventImpact) return Number(team.currentAsset || 0);
  return getTeamStartingCapital(team);
}

export function Simulation({ room, student }) {
  const myTeam = room.teams?.[student.team];
  const displayAsset = getDisplayAsset(myTeam, room.currentMonth || 0);
  const assetNegative = displayAsset < 0;
  const investment = Number(myTeam?.investmentsReceived || 0);
  const baseAsset = getTeamBaseAsset(myTeam);
  const startingTotal = getTeamStartingCapital(myTeam);
  const diversity = myTeam?.diversity;
  return (
    <section className="student-simulation-screen">
      <div className={`rounded-lg p-5 text-white ${assetNegative ? "bg-rose-700" : "bg-slate-900"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-slate-200">현재 월</p><p className="text-5xl font-black">{room.currentMonth || 0}</p></div><div className="rounded-lg bg-white/10 px-3 py-2 text-right"><p className="text-xs text-slate-200">출발 총액</p><p className="text-lg font-black">{formatWon(startingTotal)}</p></div></div><div className="mt-5 grid grid-cols-2 gap-2"><div className="rounded-lg bg-white/10 p-3"><p className="text-xs text-slate-200">기본 자본금</p><p className={`text-xl font-black ${baseAsset !== TEAM_BASE_ASSET ? "text-rose-300" : ""}`}>{formatWon(baseAsset)}</p>{diversity && <span className={`diversity-badge diversity-badge-${diversity.key} mt-1`}>{diversity.label} {diversity.rate > 0 ? "+" : ""}{diversity.rate}%</span>}</div><div className="rounded-lg bg-white/10 p-3"><p className="text-xs text-slate-200">투자 유치금</p><p className="text-xl font-black">{formatWon(investment)}</p></div></div></div>
      {room.currentEvent && <><StudentEventShowcase event={room.currentEvent} impact={myTeam?.lastEventImpact} month={room.currentMonth || 0} team={myTeam} simulationSettings={room.simulationSettings} /><article className="mt-4 overflow-hidden rounded-lg bg-white p-4 shadow-lift"><div className="flex gap-3"><img src={getEventImage(room.currentEvent)} alt={room.currentEvent.title} className="h-32 w-20 flex-none rounded-lg object-cover shadow-lift" /><div className="min-w-0"><p className="text-sm font-black uppercase tracking-wide text-indigo-600">{room.currentEvent.factor} · {BUSINESS_FACTORS.find((factor) => factor.id === room.currentEvent.factor)?.name}</p><h2 className="mt-2 break-keep text-xl font-black">{room.currentEvent.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{room.currentEvent.description}</p>{myTeam?.lastEventImpact?.eventId === room.currentEvent.id && <p className="mt-3 text-lg font-black">우리 팀 평가: {myTeam.lastEventImpact.grade} · 자산 변동 {myTeam.lastEventImpact.rate > 0 ? "+" : ""}{myTeam.lastEventImpact.rate}%</p>}</div></div></article></>}
      <SimulationAssetDock event={room.currentEvent} month={room.currentMonth || 0} team={myTeam} simulationSettings={room.simulationSettings} />
    </section>
  );
}

export function StudentAiEvaluationReport({ team }) {
  const [popupBlocked, setPopupBlocked] = useState(false);
  return (
    <article className="student-ai-report-compact">
      <div className="student-ai-report-heading">
        <div><p>AI 평가 결과</p><h3>{team.teamName} 사업계획</h3></div>
        {team.idea?.serviceName && <span>{team.idea.serviceName}</span>}
      </div>
      <button type="button" className="touch-button mt-3 rounded-lg bg-indigo-600 px-4 py-3 font-bold text-white" onClick={() => setPopupBlocked(!openEvaluationReport(team))}>세부내용보기</button>
      {popupBlocked && <p role="alert" className="mt-2 text-sm text-rose-700">팝업이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 눌러주세요.</p>}
      <div className="student-ai-grade-list">
        {BUSINESS_FACTORS.map((factor) => {
          const grade = getEvaluationFactor(team, factor.id)?.grade || "보통";
          return <div key={factor.id}><span>{factor.name}</span><b className={gradeClassName(grade)}>{grade}</b></div>;
        })}
      </div>
    </article>
  );
}

function StudentEventShowcase({ event, impact, month, team, simulationSettings }) {
  const activeImpact = impact?.eventId === event.id ? impact : null;
  const projectedImpact = useMemo(() => activeImpact || applyRiskMultiplier(team, event, simulationSettings, month).lastEventImpact, [activeImpact, event, month, simulationSettings, team]);
  const [impactVisible, setImpactVisible] = useState(false);
  const rate = Number(projectedImpact?.rate || 0);
  useEffect(() => { setImpactVisible(false); const timer = window.setTimeout(() => setImpactVisible(true), 500); return () => window.clearTimeout(timer); }, [event.id, month]);
  return <div className="student-event-showcase" key={`${month}-${event.id}`}><div className="event-spark event-spark-one" /><div className="event-spark event-spark-two" /><div className="student-event-card-wrap"><EventCardVisual event={event}>{impactVisible && projectedImpact && <div className={`event-card-impact-float ${rate >= 0 ? "student-impact-positive" : "student-impact-negative"}`} role="status" aria-live="polite"><span>{rate >= 0 ? "▲" : "▼"}</span><strong>{rate > 0 ? "+" : ""}{rate}%</strong><small>{rate >= 0 ? "자산 증가" : "자산 감소"} · {projectedImpact.grade}</small></div>}</EventCardVisual></div></div>;
}

function SimulationAssetDock({ event, month, team, simulationSettings }) {
  const activeImpact = event && team?.lastEventImpact?.eventId === event.id ? team.lastEventImpact : null;
  const projectedImpact = useMemo(() => !event || !team ? null : activeImpact || applyRiskMultiplier(team, event, simulationSettings, month).lastEventImpact, [activeImpact, event, month, simulationSettings, team]);
  const currentAsset = Number(team?.currentAsset ?? getTeamStartingCapital(team));
  const beforeAsset = Number(projectedImpact?.beforeAsset ?? currentAsset);
  const afterAsset = Number(projectedImpact?.afterAsset ?? currentAsset);
  const rate = Number(projectedImpact?.rate || 0);
  const startingTotal = getTeamStartingCapital(team);
  const cumulativeRate = startingTotal ? ((afterAsset - startingTotal) / startingTotal) * 100 : 0;
  const tone = !event ? "neutral" : rate < 0 ? "negative" : "positive";
  return createPortal(<div className={`simulation-asset-dock simulation-asset-dock-${tone}`} role="status" aria-live="polite"><div className="simulation-asset-dock-main"><span>우리 팀 현재 자산</span><RollingWon from={beforeAsset} to={afterAsset} active={Boolean(event)} duration={1500} /></div><div className="simulation-asset-dock-meta"><span>최초 시작 자산 {formatWon(startingTotal)}</span><b>현재 {cumulativeRate >= 0 ? "+" : ""}{cumulativeRate.toFixed(1)}% 변동</b></div></div>, document.body);
}

function RollingWon({ from, to, active, duration = 1500 }) {
  const [value, setValue] = useState(active ? from : to);
  useEffect(() => {
    if (!active) { setValue(to); return undefined; }
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now) => { const progress = Math.min(1, (now - startedAt) / duration); const eased = 1 - Math.pow(1 - progress, 3); setValue(Math.round(from + (to - from) * eased)); if (progress < 1) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, duration, from, to]);
  return <strong className={active ? "asset-number-rolling" : ""}>{formatWon(value)}</strong>;
}
