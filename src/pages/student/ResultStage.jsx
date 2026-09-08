import { useMemo, useState } from "react";
import { Award, ClipboardCheck, Crown, Users } from "lucide-react";
import {
  buildResultInsights,
  calculateInvestmentPortfolio,
  countAiGrades,
  formatWon,
  getAssetChange,
  getPivotScenario,
  getStudentsByTeam,
  rankInvestors,
  rankTeams
} from "../../lib/game.js";
import { AssetChangeSummary, AssetTrendChart } from "../../components/shared/AssetCharts.jsx";
import { PIVOT_SCENARIOS } from "../../data/simulationSettings.js";

function pivotImmediateText(scenario) {
  if (scenario.id === "early_exit") return "현재 자산 동결";
  if (Number(scenario.immediateRate || 0)) return `현재 자산 ${scenario.immediateRate > 0 ? "+" : ""}${scenario.immediateRate}%`;
  const amount = Number(scenario.immediateAmount || 0);
  return amount ? `${amount > 0 ? "+" : "-"}${formatWon(Math.abs(amount))}` : "즉시 비용 없음";
}

function pivotEffectText(scenario) {
  const primary = Number(scenario.primaryMultiplier || 1);
  const secondary = Number(scenario.secondaryMultiplier || 1);
  const descriptions = {
    government_support: `F09 이벤트 ${primary}배`, professional_management: `최종 자산 ${Number(scenario.dilutionRate || 0)}% 지분 희석`, downsizing: `모든 이벤트 ${primary}배`, aggressive_expansion: `모든 이벤트 ${primary}배`, turnaround: "최저 등급 팩터 1개 상향", early_exit: "13~24개월 이벤트 미적용", global_expansion: `F01·F04 ${primary}배 / F11 ${secondary}배`, ip_protection: `F14 양호 / E05·E19 하락 ${primary}배`, cofounder_reset: `E16·E20 하락 ${primary}배 / 양호 상승 ${secondary}배`, crowdfunding: `F02·F07·F11 ${primary}배`
  };
  return descriptions[scenario.id] || scenario.effectLabel;
}

function PivotResultBadge({ team, settings }) {
  const scenarios = settings?.pivotScenarios || PIVOT_SCENARIOS;
  const id = team?.pivotScenarioId || team?.pivotModifiers?.scenarioId || team?.midDecision?.resolvedScenario;
  const scenario = getPivotScenario({ ...settings, pivotScenarios: scenarios }, id);
  if (!scenario) return null;
  return <div className="report-pivot-choice student-result-pivot"><span>{scenario.icon}</span><div><small>12개월 피벗 전략</small><strong>{scenario.title}</strong><em>{scenario.summary}<br />즉시: {pivotImmediateText(scenario)} · 이후: {pivotEffectText(scenario)}</em></div></div>;
}

function AiGradeSummary({ team }) {
  const counts = countAiGrades(team);
  return <div className="student-result-ai compact-result-ai"><p><ClipboardCheck size={15} /> 사업계획 AI 평가 결과</p><div className="ai-grade-tally result-ai-counts"><span className="ai-grade-tally-good">양호 {counts.양호}건</span><span className="ai-grade-tally-mid">보통 {counts.보통}건</span><span className="ai-grade-tally-weak">취약 {counts.취약}건</span></div></div>;
}

function TeamCardBody({ team, place, members, settings }) {
  return <><div className="student-ranked-members"><p><Users size={14} /> 팀원 {members.length}명</p><div>{members.map((member) => <span key={member.uid}>{team.leaderId === member.uid && <Crown size={11} />} {member.nickname}</span>)}</div></div><AssetChangeSummary team={team} className="student-ranked-assets" /><AiGradeSummary team={team} /><PivotResultBadge team={team} settings={settings} /><AssetTrendChart team={team} size="compact" className="student-ranked-chart" /></>;
}

function TeamCardHeading({ team, place, collapsed = false }) {
  return <div className="student-ranked-team-open"><span className={`student-rank-badge student-rank-badge-${place}`}><Award size={18} /> {place}위</span><div className="student-ranked-team-name"><h3>{team.teamName}</h3><p>{team.teamSlogan ? `“${team.teamSlogan}”` : "팀 구호 미정"}</p></div>{collapsed && <span className="result-disclosure-label">펼쳐보기</span>}</div>;
}

function TeamResultCard({ team, place, members, settings }) {
  if (place > 1) return <details className={`student-ranked-team-card student-ranked-team-${place} result-collapsible-card`}><summary><TeamCardHeading team={team} place={place} collapsed /></summary><div className="result-collapsible-body"><TeamCardBody team={team} place={place} members={members} settings={settings} /></div></details>;
  return <article className="student-ranked-team-card student-ranked-team-1"><TeamCardHeading team={team} place={place} /><TeamCardBody team={team} place={place} members={members} settings={settings} /></article>;
}

function CompanyRankList({ rankedTeams, myTeamKey }) {
  return <section className="company-rank-board student-company-rank-board"><div className="company-rank-heading"><span>COMPANY RANKING</span><h3>기업별 최종 순위</h3></div><div className="student-company-rank-list">{rankedTeams.map((team, index) => {
    const change = getAssetChange(team);
    const mine = team.key === myTeamKey;
    return <div key={team.key} className={`student-company-rank-row ${mine ? "student-company-rank-mine" : ""}`}><b className={`student-rank-badge student-rank-badge-${Math.min(index + 1, 4)}`}>{index + 1}위</b><div><strong>{team.teamName}{mine && <small>우리 팀</small>}</strong><span>{team.idea?.serviceName || team.idea?.product || team.idea?.solution || "아이템 미정"}</span></div><em>{formatWon(change.final)}<small className={change.positive ? "rank-rate-up" : "rank-rate-down"}>{change.positive ? "+" : ""}{change.rate.toFixed(1)}%</small></em></div>;
  })}</div></section>;
}

function ResultTabs({ tab, setTab }) {
  return <div className="result-tabs" role="tablist" aria-label="최종 순위 구분"><button type="button" role="tab" aria-selected={tab === "company"} onClick={() => setTab("company")}>기업 순위</button><button type="button" role="tab" aria-selected={tab === "investor"} onClick={() => setTab("investor")}>나는 투자왕</button></div>;
}

function StudentInvestorView({ room, student, investors }) {
  const myIndex = investors.findIndex((investor) => investor.uid === student.uid);
  const portfolio = myIndex >= 0 ? investors[myIndex].portfolio : calculateInvestmentPortfolio(student, room.teams);
  return <div className="student-investor-view"><section className="student-investor-hero"><p>5천만원으로 만든 나의 투자 결과</p><strong>{formatWon(portfolio.finalValue)}</strong><span className={portfolio.profit >= 0 ? "profit-up" : "profit-down"}>{portfolio.profit >= 0 ? "+" : ""}{formatWon(portfolio.profit)} · {portfolio.rate >= 0 ? "+" : ""}{portfolio.rate.toFixed(1)}%</span><div><b>내 순위 {myIndex >= 0 ? `${myIndex + 1}위` : "-"}</b><span>현금 잔액 {formatWon(portfolio.cash)}</span></div></section><section className="student-holdings"><h3>내 투자금 현황</h3>{portfolio.holdings.length ? portfolio.holdings.map((holding) => <div key={holding.teamKey}><span><b>{room.teams[holding.teamKey]?.teamName || holding.teamKey}</b><small>투자 {formatWon(holding.amount)}</small></span><strong>{formatWon(holding.value)}<small>{(holding.ratio * 100).toFixed(1)}%</small></strong></div>) : <p>투자하지 않은 금액은 현금으로 유지되었습니다.</p>}</section><section className="investor-ranking investor-ranking-compact"><div className="investor-ranking-heading"><div><p>나는 투자왕</p><h3>TOP 3</h3></div><Crown size={28} /></div><div className="investor-ranking-list">{investors.slice(0, 3).map((investor, index) => <div key={investor.uid} className={`investor-top-${index + 1} ${investor.uid === student.uid ? "investor-me" : ""}`}><b>{index + 1}</b><span><strong>{investor.nickname}</strong><small>수익률 {investor.portfolio.rate >= 0 ? "+" : ""}{investor.portfolio.rate.toFixed(1)}%</small></span><em>{formatWon(investor.portfolio.finalValue)}</em></div>)}</div></section></div>;
}

export default function StudentResult({ room, student }) {
  const [tab, setTab] = useState("company");
  const rankedTeams = useMemo(() => rankTeams(room.teams), [room.teams]);
  const rankedInvestors = useMemo(() => rankInvestors(room.students, room.teams), [room.students, room.teams]);
  const insights = useMemo(() => buildResultInsights(room.teams), [room.teams]);
  if (tab === "investor") return <section><ResultTabs tab={tab} setTab={setTab} /><StudentInvestorView room={room} student={student} investors={rankedInvestors} /></section>;
  return <section className="student-result-screen"><ResultTabs tab={tab} setTab={setTab} /><h2 className="text-2xl font-black">최종 순위 및 사업 리포트</h2><CompanyRankList rankedTeams={rankedTeams} myTeamKey={student.team} /><section className="result-analysis-dashboard student-result-dashboard"><div className="result-analysis-heading"><span>DATA BADGES</span><h3>최종 분석 대시보드</h3></div><div className="result-analysis-grid">{insights.map((insight) => <article key={insight.label}><span>{insight.icon}</span><div><p>{insight.label}</p><strong>{insight.value} <em>(최종결과 {insight.rank}위)</em></strong></div></article>)}</div></section><section className="student-result-group"><h3>최종 TOP3 팀 세부내역</h3><p>2위와 3위 팀은 눌러서 세부내역을 확인할 수 있습니다.</p><div className="student-top3-grid">{rankedTeams.slice(0, 3).map((team, index) => <TeamResultCard key={team.key} team={team} place={index + 1} members={getStudentsByTeam(room.students, team.key)} settings={room.simulationSettings} />)}</div></section></section>;
}
