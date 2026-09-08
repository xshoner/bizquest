import { useState } from "react";
import { Award, ClipboardCheck, Cpu, Lightbulb, LineChart, MessageCircle, PieChart, Play, Trophy } from "lucide-react";
import { STATUSES, STATUS_LABELS } from "../../data/gameData.js";
import { PIVOT_SCENARIOS } from "../../data/simulationSettings.js";
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

export function PhaseProgressPanel({ room, teams, students }) {
  const [showPending, setShowPending] = useState(false);
  const assigned = Object.values(students).filter((student) => student.team && teams[student.team]);
  const activeTeams = getTeamEntries(teams).filter(([key]) => assigned.some((student) => student.team === key));
  let title = "", done = 0, total = 0, pending = [];
  switch (room.status) {
    case STATUSES.WAITING: title = "팀 배정"; total = Object.keys(students).length; done = assigned.length; pending = Object.values(students).filter((student) => !student.team).map((student) => student.nickname); break;
    case STATUSES.C_LEVEL: title = "C레벨 자가진단 완료"; total = assigned.length; done = assigned.filter((student) => student.cLevelResult?.key).length; pending = assigned.filter((student) => !student.cLevelResult?.key).map((student) => student.nickname); break;
    case STATUSES.CARD_SELECT: title = "카드 선택 완료 팀"; total = activeTeams.length; done = activeTeams.filter(([, team]) => team.trendCard && team.techCard).length; pending = activeTeams.filter(([, team]) => !(team.trendCard && team.techCard)).map(([, team]) => team.teamName); break;
    case STATUSES.IDEATION:
    case STATUSES.AI_EVALUATION: title = room.status === STATUSES.IDEATION ? "사업계획 제출 · 확정" : "사업계획 확정"; total = activeTeams.length; done = activeTeams.filter(([, team]) => team.ideaLocked).length; pending = activeTeams.filter(([, team]) => !team.ideaLocked).map(([, team]) => `${team.teamName}${team.idea && team.ideaSubmitted !== false ? " (확정 대기)" : " (미제출)"}`); break;
    case STATUSES.INVESTMENT: title = "투자 확정"; total = assigned.length; done = assigned.filter((student) => student.investmentSubmitted).length; pending = assigned.filter((student) => !student.investmentSubmitted).map((student) => student.nickname); break;
    default: return <div className="progress-panel"><p className="progress-panel-title">진행 현황</p><p className="text-sm font-bold text-slate-500">{room.status === STATUSES.SIMULATION ? `${room.currentMonth || 0} / ${SIMULATION_MONTHS}개월 진행` : "수업이 완료되었습니다."}</p>{room.status === STATUSES.SIMULATION && <div className="progress-bar"><b style={{ width: `${Math.min(100, ((room.currentMonth || 0) / SIMULATION_MONTHS) * 100)}%` }} /></div>}</div>;
  }
  const percent = total ? Math.round((done / total) * 100) : 0;
  return <div className="progress-panel"><div className="flex flex-wrap items-center justify-between gap-2"><p className="progress-panel-title">{title}</p><b className={`progress-count ${total && done === total ? "progress-count-done" : ""}`}>{done} / {total}{total && done === total ? " · 모두 완료" : ""}</b></div><div className="progress-bar"><b style={{ width: `${percent}%` }} /></div>{pending.length > 0 && <div className="mt-2"><button type="button" onClick={() => setShowPending((current) => !current)} className="text-xs font-black text-indigo-700">미완료 {pending.length}명/팀 {showPending ? "접기" : "보기"}</button>{showPending && <div className="mt-2 flex flex-wrap gap-1">{pending.map((name) => <span key={name} className="progress-pending-chip">{name}</span>)}</div>}</div>}</div>;
}

export function PhaseTimerControl({ timer, onStart, onExtend, onStop }) {
  const active = Boolean(timer?.endsAt);
  return <div className="timer-panel print:hidden"><div className="flex items-center justify-between gap-2"><p className="progress-panel-title">단계 타이머</p>{active && <button type="button" onClick={onStop} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700 ring-1 ring-rose-200">종료</button>}</div>{active ? <><PhaseTimerDisplay timer={timer} /><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={onExtend} className="timer-preset">+1분</button>{PHASE_TIMER_PRESETS_MIN.map((minutes) => <button key={minutes} type="button" onClick={() => onStart(minutes)} className="timer-preset">{minutes}분 재시작</button>)}</div></> : <><p className="text-xs font-bold text-slate-500">학생 화면 상단에 남은 시간이 표시됩니다. 단계를 바꾸면 자동으로 꺼집니다.</p><div className="mt-2 flex flex-wrap gap-2">{PHASE_TIMER_PRESETS_MIN.map((minutes) => <button key={minutes} type="button" onClick={() => onStart(minutes)} className="timer-preset timer-preset-primary">{minutes}분 시작</button>)}</div></>}</div>;
}

export function PhaseRail({ currentStatus, onPhaseClick }) {
  return <nav className="phase-rail mt-5" aria-label="진행 단계">{PHASES.map((phase, index) => { const Icon = PHASE_ICONS[phase] || Play; return <button key={phase} type="button" onClick={() => onPhaseClick(phase)} className={`phase-rail-button ${currentStatus === phase ? "phase-rail-button-active" : ""}`}><span className="phase-rail-number">{index + 1}</span><Icon className="phase-rail-icon" size={42} /><b>{phase === STATUSES.CARD_SELECT ? <><span>트렌드 및</span><span>기술카드 선택</span></> : STATUS_LABELS[phase]}</b></button>; })}</nav>;
}
