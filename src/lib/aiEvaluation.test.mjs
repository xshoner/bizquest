import test from "node:test";
import assert from "node:assert/strict";
import { buildEvaluationPrompt, getBusinessPlanCharacterCount, getPlanDiligenceAssessment, makeFallbackAiEvaluation, normalizeAiEvaluation } from "./aiEvaluation.js";
import { BUSINESS_FACTORS } from "../data/gameData.js";

function teamWithLength(length) {
  return { idea: { product: "가".repeat(length) } };
}

test("사업계획서 성실성은 전체 글자 수로 판정한다", () => {
  assert.equal(getBusinessPlanCharacterCount({ idea: { product: "가 나 다" } }), 5);
  assert.equal(getPlanDiligenceAssessment(teamWithLength(499)).grade, "취약");
  assert.equal(getPlanDiligenceAssessment(teamWithLength(500)).grade, "보통");
  assert.equal(getPlanDiligenceAssessment(teamWithLength(999)).grade, "보통");
  assert.equal(getPlanDiligenceAssessment(teamWithLength(1000)).grade, "양호");
});

test("새 팩터의 취약 판정은 기존 취약 개수 보정으로 바뀌지 않는다", () => {
  const team = { idea: { product: "지역 학생을 위한 학습 자료 공유 서비스로 다양한 과목의 문제 해결 방법과 교육 콘텐츠를 제공합니다. 교사가 검토한 설명을 바탕으로 학생이 부족한 부분을 찾습니다." } };
  const factors = Object.fromEntries(BUSINESS_FACTORS.map(({ id }) => [id, { grade: "취약", reason: "구현 방식을 검토할 필요가 있다." }]));
  const result = normalizeAiEvaluation({ factors }, team);
  assert.equal(Object.keys(result.factors).length, 17);
  assert.equal(result.factors.F16.grade, "취약");
  assert.equal(result.factors.F17.grade, "취약");
  assert.match(buildEvaluationPrompt(team), /17가지 팩터/);
  assert.match(buildEvaluationPrompt(team), /자연법칙/);
  assert.match(buildEvaluationPrompt(team), /동일하거나 유사한/);
  assert.match(makeFallbackAiEvaluation(team).factors.F17.reason, /검토할 필요가 있다/);
});

test("AI 응답과 관계없이 F15 성실성 등급을 글자 수로 확정한다", () => {
  const evaluation = normalizeAiEvaluation({ factors: { F15: { grade: "취약", reason: "모델 판단" } } }, teamWithLength(1000));
  assert.equal(evaluation.factors.F15.grade, "양호");
  assert.match(evaluation.factors.F15.reason, /1,000자/);
});
