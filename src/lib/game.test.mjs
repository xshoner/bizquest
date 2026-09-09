import test from "node:test";
import assert from "node:assert/strict";
import { calculateInvestmentPortfolio, getAssetChange, makePivotTeamPatch, rankInvestors, resolvePivotVote, applyRiskMultiplier } from "./game.js";
import { PIVOT_SCENARIOS } from "../data/simulationSettings.js";
import { SIMULATION_EVENTS } from "../data/gameData.js";

const baseTeam = {
  teamId: "A",
  initialCapital: 100_000_000,
  baseAsset: 100_000_000,
  currentAsset: 120_000_000,
  aiEvaluation: { factors: { F01: { grade: "보통" }, F09: { grade: "취약" }, F14: { grade: "취약" } } },
  assetHistory: [{ month: 0, asset: 100_000_000 }, { month: 12, asset: 120_000_000 }]
};

test("투자 포트폴리오는 미투자 현금과 기업 수익률을 함께 반영한다", () => {
  const student = { uid: "u1", nickname: "투자왕", team: "B", investmentSubmitted: true, investments: { A: 25_000_000 } };
  const portfolio = calculateInvestmentPortfolio(student, { A: baseTeam, B: { ...baseTeam, teamId: "B" } });
  assert.equal(portfolio.cash, 25_000_000);
  assert.equal(portfolio.finalValue, 55_000_000);
  assert.equal(rankInvestors({ u1: student }, { A: baseTeam, B: { ...baseTeam, teamId: "B" } })[0].uid, "u1");
});

test("피벗 투표 동률이면 팀장 표가 우선한다", () => {
  const team = { leaderId: "leader", midDecision: { votes: { leader: "downsizing", member: "aggressive_expansion" } } };
  assert.equal(resolvePivotVote(team, ["leader", "member"], PIVOT_SCENARIOS), "downsizing");
});

test("정부지원 피벗은 즉시 자산과 13개월 이후 F09 배율을 반영한다", () => {
  const scenario = PIVOT_SCENARIOS.find((item) => item.id === "government_support");
  const pivot = makePivotTeamPatch(baseTeam, scenario);
  assert.equal(pivot.currentAsset, 150_000_000);
  const affected = applyRiskMultiplier({ ...baseTeam, currentAsset: pivot.currentAsset, pivotModifiers: pivot.pivotModifiers }, { id: "E06", factor: "F09", rates: { 취약: -10 } }, {}, 13);
  assert.equal(affected.lastEventImpact.rate, -15);
  assert.equal(affected.currentAsset, 127_500_000);
});

test("조기 청산은 13개월 이후 이벤트 자산 변동을 동결한다", () => {
  const scenario = PIVOT_SCENARIOS.find((item) => item.id === "early_exit");
  const pivot = makePivotTeamPatch(baseTeam, scenario);
  const affected = applyRiskMultiplier({ ...baseTeam, pivotModifiers: pivot.pivotModifiers }, { id: "E01", factor: "F01", rates: { 보통: -20 } }, {}, 13);
  assert.equal(affected.lastEventImpact.rate, 0);
  assert.equal(affected.currentAsset, baseTeam.currentAsset);
});

test("시뮬레이션 누적 수익률은 출발 총액을 기준으로 계산한다", () => {
  const change = getAssetChange({ initialCapital: 127_000_000, baseAsset: 100_000_000, currentAsset: 100_405_711 });
  assert.equal(change.delta, -26_594_289);
  assert.ok(Math.abs(change.rate - (-20.940385)) < 0.00001);
});

test("F15 성실성 등급과 관리자 배율이 전용 이벤트에 반영된다", () => {
  const event = SIMULATION_EVENTS.find((item) => item.id === "E26");
  const team = { ...baseTeam, aiEvaluation: { factors: { F15: { grade: "양호" } } } };
  const affected = applyRiskMultiplier(team, event, { factorGradeMultipliers: { F15: { 양호: 1.5 } } }, 8);
  assert.equal(affected.lastEventImpact.rate, 27);
});

test("새 전역 팩터의 모든 등급 조합이 전·후반 개별 이벤트에 적용된다", () => {
  const positive = { 양호: 21, 보통: 20.3, 취약: 20 };
  const negative = { 양호: -19, 보통: -19.5, 취약: -20.74 };
  for (const month of [1, 12, 13, 24]) {
    for (const feasibility of Object.keys(positive)) {
      for (const duplication of Object.keys(negative)) {
        const team = { ...baseTeam, aiEvaluation: { factors: { F16: { grade: feasibility }, F17: { grade: duplication } } } };
        const apply = (rate) => applyRiskMultiplier(team, { id: "E01", factor: "F01", rates: { 보통: rate } }, {}, month);
        assert.equal(apply(20).lastEventImpact.rate, positive[feasibility]);
        const expectedLoss = Math.round((negative[duplication] - (feasibility === "취약" ? 0.7 : 0)) * 100) / 100;
        assert.equal(apply(-20).lastEventImpact.rate, expectedLoss);
        assert.equal(apply(0).currentAsset, team.currentAsset);
      }
    }
  }
});

test("새 팩터는 팀별로 적용되며 피벗 배율과 청산을 유지한다", () => {
  const team = { ...baseTeam, aiEvaluation: { factors: { F16: { grade: "양호" }, F17: { grade: "취약" } } }, pivotModifiers: { eventRateMultiplier: 2 } };
  const event = { id: "E01", factor: "F01", rates: { 보통: 10 } };
  assert.equal(applyRiskMultiplier(team, event, {}, 13).lastEventImpact.rate, 21);
  assert.equal(applyRiskMultiplier(baseTeam, event, {}, 13).lastEventImpact.rate, 10);
  assert.equal(applyRiskMultiplier({ ...team, pivotModifiers: { frozenAfterMonth: 12 } }, event, {}, 13).lastEventImpact.rate, 0);
});
