import test from "node:test";
import assert from "node:assert/strict";
import { teamPhaseState } from "./phaseProgress.js";
test("팀 배정만으로 구성이 완료되지 않으며 교사 확정 대기를 구분한다", () => {
  assert.equal(teamPhaseState("WAITING", {}, [{ uid: "s" }]).done, false);
  assert.equal(teamPhaseState("WAITING", { teamSetupComplete: true }, []).done, true);
  assert.equal(teamPhaseState("IDEATION", { idea: {}, ideaSubmitted: true }).awaiting, true);
  assert.equal(teamPhaseState("IDEATION", { idea: {}, ideaSubmitted: true, ideaLocked: true }).awaiting, false);
});
test("AI 평가 완료와 대체평가·미평가를 구분한다", () => {
  assert.equal(teamPhaseState("AI_EVALUATION", { ideaLocked: true }).done, false);
  assert.equal(teamPhaseState("AI_EVALUATION", { aiEvaluation: { model: "gemini-2.5-flash-fallback" } }).done, false);
  assert.equal(teamPhaseState("AI_EVALUATION", { aiEvaluation: { model: "gemini-2.5-flash" } }).done, true);
});
