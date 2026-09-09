import { teamPhaseState } from "../../lib/phaseProgress.js";
import { isFallbackEvaluation } from "../../lib/aiEvaluation.js";
import { useState } from "react";
import { Award, ClipboardCheck, Cpu, Lightbulb, LineChart, MessageCircle, PieChart, Play, Trophy } from "lucide-react";
import { BUSINESS_FACTORS, SIMULATION_EVENTS, STATUSES, STATUS_LABELS } from "../../data/gameData.js";
import { mergeSimulationSettings, PIVOT_SCENARIOS } from "../../data/simulationSettings.js";
import { SIMULATION_MONTHS, getStudentsByTeam, getTeamEntries } from "../../lib/game.js";
import { PHASE_TIMER_PRESETS_MIN, PhaseTimerDisplay } from "../../components/shared/PhaseTimer.jsx";

const PHASES = [STATUSES.WAITING, STATUSES.C_LEVEL, STATUSES.CARD_SELECT, STATUSES.IDEATION, STATUSES.AI_EVALUATION, STATUSES.INVESTMENT, STATUSES.SIMULATION, STATUSES.RESULT];
const PHASE_ICONS = { [STATUSES.WAITING]: MessageCircle, [STATUSES.C_LEVEL]: Award, [STATUSES.CARD_SELECT]: LineChart, [STATUSES.IDEATION]: Lightbulb, [STATUSES.AI_EVALUATION]: ClipboardCheck, [STATUSES.INVESTMENT]: PieChart, [STATUSES.SIMULATION]: Cpu, [STATUSES.RESULT]: Trophy };

export function PivotAdminPanel({ room, teams, students, settings, onForce, onContinue }) {
  const activeTeams = getTeamEntries(teams).filter(([key]) => Object.values(students).some((student) => student.team === key));
  const scenarios = settings?.pivotScenarios || PIVOT_SCENARIOS;
  const complete = activeTeams.every(([, team]) => team.midDecision?.resolvedScenario);
  return <section className="pivot-admin-panel">
    <div className="pivot-admin-heading"><div><p>12개월 피벗 의사결정</p><h2>팀별 선택 완료 현황</h2></div><button type="button" disabled={!complete} onClick={onContinue}><Play size={18} /> 계속 진행</button></div>
    <div className="pivot-admin-grid">{activeTeams.map(([key, team]) => {
      const members = getStudentsByTeam(students, key);
      const votes = team.midDecision?.votes || {};
      const voted = members.filter((member) => votes[member.uid]).length;
      const resolved = team.midDecision?.resolvedScenario;
      const scenario = scenarios.find((item) => item.id === resolved);
      return <article key={key} className={resolved ? "pivot-team-done" : ""}><div><strong>{team.teamName}</strong><span>{voted}/{members.length}명 선택 완료</span></div>{resolved ? <b>{scenario?.icon} {scenario?.title || resolved}</b> : <button type="button" onClick={() => onForce(key, true)}>교사 강제 확정</button>}</article>;
    })}</div>
    {!complete && <p className="pivot-admin-help">수업이 지연되면 교사가 현재 표를 기준으로 강제 확정할 수 있습니다. 투표가 전혀 없으면 첫 번째 카드가 적용됩니다.</p>}
  </section>;
}

export function PhaseProgressPanel({ room, teams, students, onSelectTeam, onSelectStudent }) {
  const [showPending, setShowPending] = useState(false);
  const assigned = Object.values(students).filter((student) => student.team && teams[student.team]);
  const activeTeams = getTeamEntries(teams).filter(([key]) => assigned.some((student) => student.team === key));
  const states = activeTeams.map(([key, team]) => ({ key, team, ...teamPhaseState(room.status, team, assigned.filter((s) => s.team === key)) }));
  let title = "", done = 0, total = 0, pending = [];
  if ([STATUSES.SIMULATION, STATUSES.RESULT].includes(room.status)) return <div className="progress-panel"><p className="progress-panel-title">{room.status === STATUSES.RESULT ? "수업 완료" : `경영 ${room.currentMonth || 0} / ${SIMULATION_MONTHS}개월`}</p></div>;
  if ([STATUSES.C_LEVEL, STATUSES.INVESTMENT].includes(room.status)) {
    title = room.status === STATUSES.C_LEVEL ? "자가진단 완료" : "투자 확정";
    const remaining = assigned.filter((s) => room.status === STATUSES.C_LEVEL ? !s.cLevelResult?.key : !s.investmentSubmitted);
    total = assigned.length; done = total - remaining.length;
    pending = remaining.map((s) => ({ id: s.uid, label: s.nickname, select: () => onSelectStudent?.(s.uid) }));
  } else {
    title = { WAITING: "팀 구성 확정", CARD_SELECT: "카드 선택 완료", IDEATION: "사업계획 교사 확정", AI_EVALUATION: "평가 완료 (대체평가 제외)" }[room.status] || "진행 현황";
    total = states.length; done = states.filter((s) => s.done).length;
    pending = states.filter((s) => !s.done).map((s) => ({ id: s.key, label: `${s.team.teamName} · ${s.label}`, select: () => onSelectTeam?.(s.key) }));
  }
  const fallbackCount = activeTeams.filter(([, t]) => isFallbackEvaluation(t.aiEvaluation)).length;
  return <div className="progress-panel">
    {room.status === STATUSES.WAITING && <p className="mb-2 text-sm">학생 팀 배정 {assigned.length}/{Object.keys(students).length}명 · 미배정 {Object.keys(students).length - assigned.length}명</p>}
    <div className="flex flex-wrap justify-between gap-2"><p className="progress-panel-title">{title}</p><b>{done}/{total}{total > 0 && done === total ? " · 모두 완료" : ""}</b></div>
    <div className="progress-bar"><b style={{ width: `${total ? done / total * 100 : 0}%` }} /></div>
    {room.status === STATUSES.AI_EVALUATION && <p className="mt-2 text-sm">대체평가 {fallbackCount}팀 · 미평가 {activeTeams.filter(([, t]) => !t.aiEvaluation).length}팀</p>}
    {pending.length > 0 && <div className="mt-2"><button type="button" onClick={() => setShowPending(!showPending)} className="text-sm font-semibold">미완료 {pending.length}명/팀 {showPending ? "접기" : "보기"}</button>{showPending && <div className="mt-2 flex flex-wrap gap-2">{pending.map((item) => <button type="button" key={item.id} onClick={item.select} className="progress-pending-chip">{item.label} →</button>)}</div>}</div>}
  </div>;
}

export function PhaseTimerControl({ timer, onStart, onExtend, onStop }) {
  const active = Boolean(timer?.endsAt);
  return <div className="timer-panel print:hidden"><div className="flex items-center justify-between gap-2"><p className="progress-panel-title">단계 타이머</p>{active && <button type="button" onClick={onStop} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700 ring-1 ring-rose-200">종료</button>}</div>{active ? <><PhaseTimerDisplay timer={timer} /><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={onExtend} className="timer-preset">+1분</button>{PHASE_TIMER_PRESETS_MIN.map((minutes) => <button key={minutes} type="button" onClick={() => onStart(minutes)} className="timer-preset">{minutes}분 재시작</button>)}</div></> : <><p className="text-xs font-bold text-slate-500">학생 화면 상단에 남은 시간이 표시됩니다. 단계를 바꾸면 자동으로 꺼집니다.</p><div className="mt-2 flex flex-wrap gap-2">{PHASE_TIMER_PRESETS_MIN.map((minutes) => <button key={minutes} type="button" onClick={() => onStart(minutes)} className="timer-preset timer-preset-primary">{minutes}분 시작</button>)}</div></>}</div>;
}

export function PhaseRail({ currentStatus, onPhaseClick }) {
  return <nav className="phase-rail mt-5" aria-label="진행 단계">{PHASES.map((phase, index) => { const Icon = PHASE_ICONS[phase] || Play; return <button key={phase} type="button" onClick={() => onPhaseClick(phase)} className={`phase-rail-button ${currentStatus === phase ? "phase-rail-button-active" : ""}`}><span className="phase-rail-number">{index + 1}</span><Icon className="phase-rail-icon" size={42} /><b>{phase === STATUSES.CARD_SELECT ? <><span>트렌드 및</span><span>기술카드 선택</span></> : STATUS_LABELS[phase]}</b></button>; })}</nav>;
}

export function SimulationSettingsSnapshot({ snapshot, defaults }) {
  const settings = mergeSimulationSettings(snapshot || defaults);
  return <details className="rounded-lg border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-semibold">시뮬레이션 적용 설정</summary>
    <p className="my-2 text-sm">{snapshot ? "현재 게임: 시뮬레이션 시작 시 고정된 값" : "시뮬레이션 시작 시 최신 기본값을 고정합니다."}</p><p className="text-xs">다음 게임 기본값은 운영자 설정에서 변경합니다.</p>
    <div className="mt-3 max-h-80 overflow-auto text-xs">
      {BUSINESS_FACTORS.map((factor) => { const values = (factor.effect ? settings.globalFactorMultipliers : settings.factorGradeMultipliers)[factor.id]; return <p key={factor.id} className="my-2">{factor.id} {factor.name}: 양호 {values?.양호 ?? 1} / 보통 {values?.보통 ?? 1} / 취약 {values?.취약 ?? 1}배</p>; })}
      {SIMULATION_EVENTS.map((event) => <p key={event.id} className="my-3">{event.id} {event.title}<br />변동률 양호 {settings.eventRates[event.id].양호}% / 보통 {settings.eventRates[event.id].보통}% / 취약 {settings.eventRates[event.id].취약}%<br />상승 {settings.eventMultipliers[event.id].positive} / 하락 {settings.eventMultipliers[event.id].negative}배</p>)}
      {settings.pivotScenarios.map((scenario) => <p key={scenario.id} className="my-3">{scenario.title}{scenario.primaryMultiplier !== undefined && <><br />주요 배율 {scenario.primaryMultiplier}</>}{scenario.secondaryMultiplier !== undefined && <> / 보조 배율 {scenario.secondaryMultiplier}</>}</p>)}
    </div>
  </details>;
}
