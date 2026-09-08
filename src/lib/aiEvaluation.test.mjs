import test from "node:test";
import assert from "node:assert/strict";
import { getBusinessPlanCharacterCount, getPlanDiligenceAssessment, normalizeAiEvaluation } from "./aiEvaluation.js";

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

test("AI 응답과 관계없이 F15 성실성 등급을 글자 수로 확정한다", () => {
  const evaluation = normalizeAiEvaluation({ factors: { F15: { grade: "취약", reason: "모델 판단" } } }, teamWithLength(1000));
  assert.equal(evaluation.factors.F15.grade, "양호");
  assert.match(evaluation.factors.F15.reason, /1,000자/);
});
