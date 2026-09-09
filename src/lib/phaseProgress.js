import { isFallbackEvaluation } from "./aiEvaluation.js";

export function teamPhaseState(status, team, members = []) {
  switch (status) {
    case "WAITING": return { done: Boolean(team.teamSetupComplete), label: team.teamSetupComplete ? "팀 구성 확정" : "팀 구성 중" };
    case "C_LEVEL": return { done: members.length > 0 && members.every((s) => s.cLevelResult?.key), label: `자가진단 ${members.filter((s) => s.cLevelResult?.key).length}/${members.length}명` };
    case "CARD_SELECT": return { done: Boolean(team.trendCard && team.techCard), label: team.trendCard && team.techCard ? "카드 선택 완료" : "카드 선택 중" };
    case "IDEATION": return { done: Boolean(team.ideaLocked), awaiting: Boolean(team.idea && team.ideaSubmitted !== false && !team.ideaLocked), label: team.ideaLocked ? "교사 확정 완료" : team.idea && team.ideaSubmitted !== false ? "교사 확정 대기" : "사업계획 작성 중" };
    case "AI_EVALUATION": return { done: Boolean(team.aiEvaluation) && !isFallbackEvaluation(team.aiEvaluation), label: isFallbackEvaluation(team.aiEvaluation) ? "대체평가 · 재평가 가능" : team.aiEvaluation ? "평가 완료" : "평가 대기" };
    case "INVESTMENT": return { done: members.length > 0 && members.every((s) => s.investmentSubmitted), label: `투자 확정 ${members.filter((s) => s.investmentSubmitted).length}/${members.length}명` };
    default: return { done: true, label: status === "RESULT" ? "최종 결과" : "경영 진행 중" };
  }
}
