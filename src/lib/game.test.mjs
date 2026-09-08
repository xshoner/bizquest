import test from "node:test";
import assert from "node:assert/strict";
import { calculateInvestmentPortfolio, getAssetChange, makePivotTeamPatch, rankInvestors, resolvePivotVote, applyRiskMultiplier } from "./game.js";
import { PIVOT_SCENARIOS } from "../data/simulationSettings.js";

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
