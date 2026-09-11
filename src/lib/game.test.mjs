import test from "node:test";
import assert from "node:assert/strict";
import { calculateInvestmentPortfolio, getAssetChange, makePivotTeamPatch, rankInvestors, resolvePivotVote, applyRiskMultiplier } from "./game.js";
import { PIVOT_SCENARIOS, mergeSimulationSettings } from "../data/simulationSettings.js";
import { SIMULATION_EVENTS } from "../data/gameData.js";

const baseTeam = {
  teamId: "A",
  initialCapital: 100_000_000,
  baseAsset: 100_000_000,
  currentAsset: 120_000_000,
  aiEvaluation: { factors: { F01: { grade: "보통" }, F09: { grade: "취약" }, F14: { grade: "취약" } } },
  assetHistory: [{ month: 0, asset: 100_000_000 }, { month: 12, asset: 120_000_000 }]
};

test("설정 기본값은 기존 코드의 이벤트 변동률과 전역 팩터 배율을 유지한다", () => {
  const settings = mergeSimulationSettings({ factorGradeMultipliers: { F16: { 양호: 1 } } });
  assert.deepEqual(settings.eventRates.E01, { 양호: 3, 보통: -5, 취약: -12 });
  assert.deepEqual(settings.globalFactorMultipliers.F16, { 양호: 1.05, 보통: 1.015, 취약: 1.035 });
  assert.deepEqual(settings.globalFactorMultipliers.F17, { 양호: 0.95, 보통: 0.975, 취약: 1.037 });
});

test("관리자가 저장한 기본 변동률, 배율과 0배가 실제 계산에 반영된다", () => {
  const event = SIMULATION_EVENTS[0];
  const team = { ...baseTeam, aiEvaluation: { factors: { F01: { grade: "보통" }, F16: { grade: "보통" }, F17: { grade: "양호" } } } };
  const settings = mergeSimulationSettings({ eventRates: { E01: { 보통: 10 } }, eventMultipliers: { E01: { positive: 2 } }, factorGradeMultipliers: { F01: { 보통: 1.5 } }, globalFactorMultipliers: { F16: { 보통: 1.1 }, F17: { 양호: 0.8 } } });
  assert.equal(applyRiskMultiplier(team, event, settings, 1).lastEventImpact.rate, 33);
  settings.eventRates.E01.보통 = -10;
  assert.equal(applyRiskMultiplier(team, event, settings, 24).lastEventImpact.rate, -12);
  settings.eventMultipliers.E01.negative = 0;
  assert.equal(applyRiskMultiplier(team, event, settings, 1).lastEventImpact.rate, 0);
  settings.eventMultipliers.E01.negative = 1;
  settings.factorGradeMultipliers.F01.보통 = 0;
  assert.equal(applyRiskMultiplier(team, event, settings, 1).lastEventImpact.rate, 0);
});

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

 test("피벗의 0배는 13개월 이후 상승·하락 모두에 적용되고 12개월에는 적용되지 않는다", () => {
  for (const grade of ["양호", "취약"]) {
    const event = SIMULATION_EVENTS.find((e) => e.factor === "F09");
    const team = { ...baseTeam, aiEvaluation: { factors: { F09: { grade } } } };
    const scenario = { ...PIVOT_SCENARIOS.find((s) => s.id === "government_support"), primaryMultiplier: 0 };
    const patched = { ...team, ...makePivotTeamPatch(team, scenario) };
    assert.equal(applyRiskMultiplier(patched, event, {}, 13).lastEventImpact.rate, 0);
    assert.notEqual(applyRiskMultiplier(patched, event, {}, 12).lastEventImpact.rate, 0);
    const downsized = { ...team, ...makePivotTeamPatch(team, { ...PIVOT_SCENARIOS.find((s) => s.id === "downsizing"), primaryMultiplier: 0 }) };
    assert.equal(applyRiskMultiplier(downsized, event, {}, 13).lastEventImpact.rate, 0);
  }
});

 test("수업 오류의 5배·2.5배·역방향 전역 배율은 기본 효과로 복구한다", () => {
  const settings = mergeSimulationSettings({eventRates:{E21:{양호:32}},globalFactorMultipliers:{F16:{양호:5,보통:2.5,취약:0.75},F17:{양호:3.5,보통:1.07,취약:0.78}}});
  assert.deepEqual(settings.globalFactorMultipliers, mergeSimulationSettings().globalFactorMultipliers);
  const team = {...baseTeam,aiEvaluation:{factors:{F09:{grade:'양호'},F16:{grade:'양호'}}}};
  const updated = applyRiskMultiplier(team,{id:'E21',factor:'F09',rates:{양호:32}},settings,5);
  assert.equal(updated.lastEventImpact.rate,33.6);
 });

 test("기본 자산 필드가 없어도 고정된 최초 자본을 수익률 분모로 사용한다", () => {
   assert.equal(getAssetChange({initialCapital:200000000,currentAsset:300000000}).rate,50);
   const portfolio=calculateInvestmentPortfolio({team:'A',investmentSubmitted:true,investments:{B:25000000}},{B:{initialCapital:200000000,currentAsset:300000000}});
   assert.equal(portfolio.rate,25);
 });

 test("100% 초과 손실과 피벗 비용으로 음수 자산·부호 반전이 생기지 않는다", () => {
   const team={...baseTeam,currentAsset:1000000};
   assert.equal(makePivotTeamPatch(team,PIVOT_SCENARIOS.find(s=>s.id==='downsizing')).currentAsset,0);
   const event={id:'CUSTOM',factor:'F01',rates:{보통:-200}};
   const failed=applyRiskMultiplier(team,event,{},1);
   assert.equal(failed.currentAsset,0);
   assert.equal(applyRiskMultiplier(failed,event,{},2).currentAsset,0);
 });
