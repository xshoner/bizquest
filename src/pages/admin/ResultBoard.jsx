import { ClipboardCheck, Crown, Lightbulb, Sparkles, Trophy, Users } from "lucide-react";
import {
  SIMULATION_MONTHS,
  buildResultInsights,
  countAiGrades,
  formatWon,
  getAssetChange,
  getPivotScenario,
  getStudentsByTeam
} from "../../lib/game.js";
import { AssetChangeSummary, AssetTrendChart } from "../../components/shared/AssetCharts.jsx";

function pivotEffectTextForReport(scenario) {
  const primary = Number(scenario.primaryMultiplier || 1);
  const effects = {
    government_support: `F09 이벤트 ${primary}배`, professional_management: `최종 자산 ${Number(scenario.dilutionRate || 0)}% 지분 희석`, downsizing: `모든 이벤트 ${primary}배`, aggressive_expansion: `모든 이벤트 ${primary}배`, turnaround: "최저 등급 팩터 상향", early_exit: "13~24개월 자산 동결", global_expansion: `F01·F04 ${primary}배`, ip_protection: "F14 양호·도용 피해 완화", cofounder_reset: "팀 리스크 완화", crowdfunding: `시장 이벤트 ${primary}배`
  };
  return effects[scenario.id] || scenario.effectLabel || "";
}

function pivotImmediateTextForReport(scenario) {
  if (scenario.id === "early_exit") return "현재 자산 동결";
  if (Number(scenario.immediateRate || 0)) return `현재 자산 ${scenario.immediateRate > 0 ? "+" : ""}${scenario.immediateRate}%`;
  const amount = Number(scenario.immediateAmount || 0);
  return amount ? `${amount > 0 ? "+" : "-"}${formatWon(Math.abs(amount))}` : "즉시 비용 없음";
}

function PivotReportBadge({ team, settings, compact = false }) {
  const scenario = getPivotScenario(settings, team?.pivotScenarioId || team?.pivotModifiers?.scenarioId || team?.midDecision?.resolvedScenario);
  if (!scenario) return null;
  return (
    <div className={`report-pivot-choice ${compact ? "report-pivot-choice-compact" : ""}`}>
      <span>{scenario.icon}</span>
      <div>
        <small>12개월 피벗 전략</small>
        <strong>{scenario.title}</strong>
        {!compact && <em>{scenario.summary}<br />즉시: {pivotImmediateTextForReport(scenario)} · 이후: {pivotEffectTextForReport(scenario)}</em>}
      </div>
    </div>
  );
}

function AiGradeTally({ team }) {
  if (!team?.aiEvaluation) return null;
  const counts = countAiGrades(team);
  return (
    <div className="ai-grade-tally" aria-label="AI 평가 등급 분포">
      <span className="ai-grade-tally-good">양호 {counts.양호}</span>
      <span className="ai-grade-tally-mid">보통 {counts.보통}</span>
      <span className="ai-grade-tally-weak">취약 {counts.취약}</span>
    </div>
  );
}

function TopTeamReportCard({ team, place, students, settings }) {
  const members = getStudentsByTeam(students, team.key);
  return (
    <article className={`report-top-team-card report-top-team-${place}`}>
      <header className="report-top-team-head">
        <span className={`rank-medal rank-medal-lg rank-medal-${place}`}>{place}</span>
        <div>
          <small>{place}위 팀</small>
          <h3>{team.teamName}</h3>
          <p>{team.teamSlogan ? `“${team.teamSlogan}”` : "팀 구호 미정"}</p>
        </div>
      </header>
      <section className="report-top-team-members">
        <p className="report-block-title"><Users size={14} /> 팀원 {members.length}명</p>
        <div>
          {members.map((member) => (
            <span key={member.uid} className="report-member-chip">
              {team.leaderId === member.uid && <Crown size={12} className="text-amber-500" />}
              {member.nickname}
              {member.cLevelResult?.key && <b className={`c-level-mini-badge c-level-mini-${member.cLevelResult.key}`}>{member.cLevelResult.key}</b>}
            </span>
          ))}
          {members.length === 0 && <span className="text-sm text-slate-400">팀원 없음</span>}
        </div>
      </section>
      <AssetChangeSummary team={team} className="report-top-team-assets" featured={place === 1} />
      <section className="report-top-team-ai">
        <div className="report-top-team-ai-heading">
          <p className="report-block-title"><ClipboardCheck size={14} /> 사업계획 AI 평가 결과</p>
          <AiGradeTally team={team} />
        </div>
        <p>{team.aiEvaluation?.opinion || "AI 평가 의견이 없습니다."}</p>
      </section>
      <PivotReportBadge team={team} settings={settings} />
      <AssetTrendChart team={team} className="mt-4" />
    </article>
  );
}

function InvestorRanking({ investors = [] }) {
  const top = investors.slice(0, 10);
  return (
    <section className="investor-ranking">
      <div className="investor-ranking-heading"><div><p>나는 투자왕</p><h3>투자 포트폴리오 TOP 10</h3></div><Crown size={28} /></div>
      <div className="investor-ranking-list">
        {top.map((investor, index) => (
          <div key={investor.uid} className={index < 3 ? `investor-top-${index + 1}` : ""}>
            <b>{index + 1}</b><span><strong>{investor.nickname}</strong><small>{investor.team ? `${investor.team}팀 · ` : ""}수익률 {investor.portfolio.rate >= 0 ? "+" : ""}{investor.portfolio.rate.toFixed(1)}%</small></span><em>{formatWon(investor.portfolio.finalValue)}</em>
          </div>
        ))}
      </div>
      {!top.length && <p className="investor-ranking-empty">확정된 투자 내역이 없습니다.</p>}
    </section>
  );
}

export default function ResultBoard({ rankedTeams, rankedInvestors, teams, students, room }) {
  const participantCount = Object.keys(students).length;
  const totalFinal = rankedTeams.reduce((sum, team) => sum + Number(team.currentAsset || 0), 0);
  const totalInitial = rankedTeams.reduce((sum, team) => sum + getAssetChange(team).initial, 0);
  const classRate = totalInitial ? ((totalFinal - totalInitial) / totalInitial) * 100 : 0;
  const finishedAt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short" }).format(new Date(room.updatedAt || Date.now()));
  const insights = buildResultInsights(teams);

  return (
    <section className="print-report report-board">
      <header className="report-header">
        <div><p className="report-kicker"><Trophy size={16} /> FINAL REPORT</p><h2>최종 순위 및 사업 리포트</h2><p className="report-meta">{room.roomTitle} · 방 코드 {room.roomId} · 참가자 {participantCount}명 · 팀 {rankedTeams.length}개 · {finishedAt}</p></div>
        <div className="report-kpis"><div><p>{SIMULATION_MONTHS}개월 후 학급 총 자산</p><strong>{formatWon(totalFinal)}</strong></div><div className={classRate >= 0 ? "report-kpi-up" : "report-kpi-down"}><p>학급 평균 증감율</p><strong>{classRate >= 0 ? "+" : ""}{classRate.toFixed(1)}%</strong></div></div>
      </header>
      <section className="result-analysis-dashboard"><div className="result-analysis-heading"><span>DATA BADGES</span><h3>최종 분석 대시보드</h3></div><div className="result-analysis-grid">{insights.map((insight) => <article key={insight.label}><span>{insight.icon}</span><div><p>{insight.label}</p><strong>{insight.value} <em>(최종결과 {insight.rank}위)</em></strong></div></article>)}</div></section>
      <InvestorRanking investors={rankedInvestors} />
      {rankedTeams.length > 0 && <section className="report-top3-section"><div className="report-top3-heading"><span>TOP 3 TEAMS</span><h3>최종 TOP3 팀</h3><p>팀 구성부터 자산 변화, AI 평가와 피벗 전략까지 한눈에 확인하세요.</p></div><div className="report-top3-grid">{rankedTeams.slice(0, 3).map((team, index) => <TopTeamReportCard key={team.key} team={team} place={index + 1} students={students} settings={room.simulationSettings} />)}</div></section>}
      <div className="mt-6 grid gap-4">
        {rankedTeams.map((team, index) => {
          const members = getStudentsByTeam(students, team.key);
          return (
            <article key={team.key} className={`report-team-card ${index === 0 ? "report-team-card-winner" : ""}`}>
              <div className="report-team-head"><div className="flex min-w-0 items-center gap-3"><span className={`rank-medal rank-medal-lg rank-medal-${Math.min(index + 1, 4)}`}>{index + 1}</span><div className="min-w-0"><h3 className="truncate text-xl font-black">{team.teamName}</h3><p className="truncate text-sm font-bold text-indigo-700">{team.teamSlogan ? `“${team.teamSlogan}”` : "팀 구호 미정"}</p><p className="truncate text-xs font-bold text-slate-500">{team.idea?.serviceName || team.idea?.product || "사업 아이디어 미작성"}</p></div></div></div>
              <AssetChangeSummary team={team} className="mt-4" />
              <div className="report-team-grid mt-4">
                <div className="report-team-block"><p className="report-block-title"><Users size={14} /> 팀원 {members.length}명</p><div className="flex flex-wrap gap-2">{members.map((member) => <span key={member.uid} className="report-member-chip">{team.leaderId === member.uid && <Crown size={12} className="text-amber-500" />}{member.nickname}{member.cLevelResult?.key && <b className={`c-level-mini-badge c-level-mini-${member.cLevelResult.key}`}>{member.cLevelResult.key}</b>}</span>)}{members.length === 0 && <span className="text-sm text-slate-400">팀원 없음</span>}</div>{team.diversity && <span className={`diversity-badge diversity-badge-${team.diversity.key} mt-3`}><Sparkles size={13} /> {team.diversity.label} <b>{team.diversity.rate > 0 ? "+" : ""}{team.diversity.rate}%</b></span>}</div>
                <div className="report-team-block"><p className="report-block-title"><Lightbulb size={14} /> 사업 개요</p><dl className="report-dl"><dt>트렌드</dt><dd>{team.trendCard?.title || "미선택"}</dd><dt>기술카드</dt><dd>{team.techCard?.title || "미선택"}</dd><dt>문제정의</dt><dd>{team.idea?.problem || "-"}</dd><dt>고객</dt><dd>{(team.idea?.customers || []).join(", ") || "-"}</dd><dt>제품/서비스</dt><dd>{team.idea?.product || team.idea?.solution || "-"}</dd><dt>수익모델</dt><dd>{(team.idea?.revenueModels || []).join(", ") || "-"}</dd></dl></div>
                <div className="report-team-block"><p className="report-block-title"><ClipboardCheck size={14} /> AI 평가</p><AiGradeTally team={team} /><p className="mt-2 text-sm leading-6 text-slate-600">{team.aiEvaluation?.opinion || "AI 평가 의견이 없습니다."}</p></div>
              </div>
              <PivotReportBadge team={team} settings={room.simulationSettings} />
              <AssetTrendChart team={team} className="mt-4" />
            </article>
          );
        })}
      </div>
    </section>
  );
}
