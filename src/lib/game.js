import { SIMULATION_EVENTS, TEAM_KEYS } from "../data/gameData.js";
import { PIVOT_SCENARIOS, mergeSimulationSettings } from "../data/simulationSettings.js";
import { getEvaluationFactor } from "./aiEvaluation.js";

export const TEAM_BASE_ASSET = 100000000;
/** Length of the management simulation in months. */
export const SIMULATION_MONTHS = 24;
/** Virtual budget each student can distribute across other teams during the investment phase. */
export const INVESTMENT_BUDGET = 50000000;
export const INVESTMENT_STEP = 1000000;
export const AVATAR_COLORS = [
  "from-pink-500 to-rose-500",
  "from-indigo-500 to-sky-500",
  "from-emerald-500 to-teal-500",
  "from-amber-400 to-orange-500",
  "from-fuchsia-500 to-purple-600",
  "from-cyan-400 to-blue-600",
  "from-lime-400 to-green-600",
  "from-red-500 to-orange-500"
];

export function makeRoomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export function makeTeam(teamKey, index = 0) {
  const label = teamKey.length === 1 ? teamKey : String(index + 1);
  return {
    teamId: teamKey,
    teamName: `팀 ${label}`,
    mascot: null,
    teamSlogan: "",
    teamSetupComplete: false,
    leaderId: null,
    trendCard: null,
    techCard: null,
    idea: null,
    ideaSubmitted: false,
    ideaLocked: false,
    initialCapital: TEAM_BASE_ASSET,
    currentAsset: TEAM_BASE_ASSET,
    investmentsReceived: 0,
    midDecision: null,
    riskShield: false,
    riskDouble: false,
    aiEvaluation: null,
    lastEventImpact: null,
    assetHistory: [{ month: 0, asset: TEAM_BASE_ASSET }]
  };
}

export function makeStudent(uid, nickname) {
  return {
    uid,
    nickname: String(nickname || "").trim().slice(0, 20),
    team: null,
    cLevelResult: null,
    investments: {},
    investmentSubmitted: false,
    joinedAt: Date.now(),
    updatedAt: Date.now()
  };
}

export function normalizeTeamName(name = "팀") {
  return String(name || "").trim() || "팀";
}

export function getAvatarColor(seed = "") {
  const sum = String(seed).split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

export function makeDefaultTeams() {
  return TEAM_KEYS.reduce((teams, key, index) => {
    teams[key] = makeTeam(key, index);
    return teams;
  }, {});
}

export function makeInitialRoom(roomId, roomTitle = "스타트업 히어로") {
  const now = Date.now();
  return {
    roomId,
    roomTitle,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    status: "WAITING",
    currentMonth: 0,
    currentEvent: null,
    currentEventApplied: true,
    eventHistory: [],
    aiEvaluationStatus: "idle",
    aiEvaluationOwner: null,
    aiEvaluationStartedAt: 0,
    aiEvaluationHeartbeatAt: 0,
    aiEvaluationProgress: null,
    simulationRunning: false,
    simulationOwner: null,
    simulationHeartbeatAt: 0,
    resultFinalizing: false,
    resultFinalizeAt: 0,
    currentDecision: null,
    pivotPhase: null,
    phaseTimer: null,
    sysMessage: "방이 열렸습니다. QR 또는 방 코드로 입장하세요.",
    teams: makeDefaultTeams()
  };
}

export function getTeamEntries(teams = {}) {
  return Object.entries(teams).sort(([a], [b]) => a.localeCompare(b, "ko"));
}

export function getStudentsByTeam(students = {}, teamKey) {
  return Object.entries(students)
    .filter(([, student]) => student.team === teamKey)
    .map(([uid, student]) => ({ uid, ...student }));
}

export function formatWon(value = 0) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString()}원`;
}

export function rankTeams(teams = {}) {
  return getTeamEntries(teams)
    .map(([key, team]) => ({ key, ...team }))
    .sort((a, b) => (b.currentAsset || 0) - (a.currentAsset || 0));
}

export function calculateInvestmentPortfolio(student, teams = {}, budget = INVESTMENT_BUDGET) {
  const valid = isValidInvestmentRecord(student, teams, budget);
  const investments = valid ? student.investments || {} : {};
  const invested = sumInvestments(investments);
  const cash = Math.max(0, budget - invested);
  const holdings = Object.entries(investments).map(([teamKey, amount]) => {
    const team = teams[teamKey];
    const start = getTeamStartingCapital(team);
    const ratio = start > 0 ? Math.max(0, Number(team?.currentAsset || 0) / start) : 0;
    return { teamKey, amount: Number(amount || 0), value: Math.round(Number(amount || 0) * ratio), ratio };
  });
  const finalValue = cash + holdings.reduce((sum, holding) => sum + holding.value, 0);
  return { initialValue: budget, invested, cash, holdings, finalValue, profit: finalValue - budget, rate: budget ? ((finalValue - budget) / budget) * 100 : 0 };
}

export function rankInvestors(students = {}, teams = {}) {
  return Object.entries(students)
    .map(([uid, student]) => ({ uid, ...student, portfolio: calculateInvestmentPortfolio(student, teams) }))
    .sort((a, b) => b.portfolio.finalValue - a.portfolio.finalValue || String(a.nickname || "").localeCompare(String(b.nickname || ""), "ko"));
}

export function buildResultInsights(teams = {}) {
  const ranked = rankTeams(teams);
  if (!ranked.length) return [];
  const rankOf = (team) => ranked.findIndex((item) => item.key === team?.key) + 1;
  const bestBy = (score, direction = "max", candidates = ranked) => [...candidates].sort((a, b) => {
    const delta = Number(score(b)) - Number(score(a));
    return direction === "max" ? delta || rankOf(a) - rankOf(b) : -delta || rankOf(a) - rankOf(b);
  })[0];
  const monthlyWins = Object.fromEntries(ranked.map((team) => [team.key, 0]));
  for (let month = 1; month <= 12; month += 1) {
    const leader = bestBy((team) => {
      const points = Array.isArray(team.assetHistory) ? team.assetHistory.filter((point) => Number(point.month) <= month) : [];
      return Number(points[points.length - 1]?.asset ?? getTeamStartingCapital(team));
    });
    if (leader) monthlyWins[leader.key] += 1;
  }
  const diversityTeams = ranked.filter((team) => team.diversity);
  const leaders = [
    { icon: "👑", label: "12개월 동안 가장 오래 1위를 달린 팀", team: bestBy((team) => monthlyWins[team.key]) },
    { icon: "✅", label: "전 항목에서 가장 많은 ‘양호’를 받은 팀", team: bestBy((team) => countAiGrades(team).양호) },
    { icon: "⚠️", label: "전 항목에서 가장 많은 ‘취약’을 받은 팀", team: bestBy((team) => countAiGrades(team).취약) },
    { icon: "🌈", label: "팀원 다양성이 가장 우수한 팀", team: diversityTeams.length ? bestBy((team) => team.diversity?.rate || 0, "max", diversityTeams) : ranked[0] },
    { icon: "🧬", label: "팀원 성향이 가장 닮았던 팀", team: diversityTeams.length ? bestBy((team) => team.diversity?.rate || 0, "min", diversityTeams) : ranked[0] },
    { icon: "💰", label: "가장 많은 투자를 유치한 팀", team: bestBy((team) => team.investmentsReceived || 0) },
    { icon: "🪙", label: "가장 적은 투자를 유치한 팀", team: bestBy((team) => team.investmentsReceived || 0, "min") }
  ];
  return leaders.map((item) => ({ ...item, rank: rankOf(item.team), value: item.team?.teamName || "-" }));
}

export function drawEvent() {
  return SIMULATION_EVENTS[Math.floor(Math.random() * SIMULATION_EVENTS.length)];
}

export function sumInvestments(investments = {}) {
  return Object.values(investments || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
}

/**
 * Validates a single student's investment map. Every client (teacher and students) applies the same
 * rule when deriving totals, so an out-of-budget or self-invested record is simply ignored instead of
 * corrupting the game state.
 */
export function isValidInvestmentRecord(student, teams = {}, budget = INVESTMENT_BUDGET) {
  if (!student?.investmentSubmitted) return false;
  const investments = student.investments;
  if (!investments || typeof investments !== "object") return false;
  const entries = Object.entries(investments);
  if (entries.some(([teamKey, value]) => teamKey === student.team || !teams[teamKey] || Number(value) < 0 || !Number.isFinite(Number(value)))) {
    return false;
  }
  return sumInvestments(investments) <= budget;
}

/** Derives `investmentsReceived` for every team from the student records. */
export function computeInvestmentsReceived(students = {}, teams = {}) {
  const totals = Object.fromEntries(Object.keys(teams).map((key) => [key, 0]));
  for (const student of Object.values(students)) {
    if (!isValidInvestmentRecord(student, teams)) continue;
    for (const [teamKey, value] of Object.entries(student.investments)) {
      if (teamKey in totals) totals[teamKey] += Number(value) || 0;
    }
  }
  return totals;
}

/**
 * C-level diversity bonus. Evaluated over team members who finished the self-diagnosis; at least
 * three diagnosed members are required before any badge applies.
 */
export const TEAM_DIVERSITY_LEVELS = {
  excellent: { key: "excellent", label: "팀 다양성 탁월", rate: 35 },
  good: { key: "good", label: "팀 다양성 우수", rate: 10 },
  poor: { key: "poor", label: "팀 다양성 불리", rate: -10 },
  risky: { key: "risky", label: "팀 다양성 위험", rate: -25 }
};

export function computeTeamDiversity(members = []) {
  const keys = members.map((member) => member?.cLevelResult?.key).filter(Boolean);
  if (keys.length < 3) return null;
  const counts = {};
  for (const key of keys) counts[key] = (counts[key] || 0) + 1;
  const distinct = Object.keys(counts).length;
  const maxCount = Math.max(...Object.values(counts));
  if (distinct === 1) return TEAM_DIVERSITY_LEVELS.risky;
  if (distinct === keys.length) return TEAM_DIVERSITY_LEVELS.excellent;
  // When both apply (e.g. A,A,A,B,C) the diversity reward wins over the concentration penalty.
  if (distinct >= 3) return TEAM_DIVERSITY_LEVELS.good;
  if (maxCount >= 3) return TEAM_DIVERSITY_LEVELS.poor;
  return null;
}

export function computeBaseAsset(diversity) {
  return Math.round(TEAM_BASE_ASSET * (1 + Number(diversity?.rate || 0) / 100));
}

/** Base asset of a team including the diversity bonus (frozen value wins once stored). */
export function getTeamBaseAsset(team) {
  const stored = Number(team?.baseAsset);
  return Number.isFinite(stored) && stored > 0 ? stored : TEAM_BASE_ASSET;
}

/** Starting capital = base asset (with diversity bonus) + investments received. */
export function getTeamStartingCapital(team) {
  const initial = Number(team?.initialCapital);
  if (Number.isFinite(initial) && initial > 0 && team?.baseAsset) return initial;
  return getTeamBaseAsset(team) + Number(team?.investmentsReceived || 0);
}

/**
 * Returns teams with the derived fields `investmentsReceived`, `diversity`, `baseAsset` and
 * `memberCount` computed from the student records. Once the simulation has started the values stored
 * on the team document (frozen by the teacher at kick-off) win so late edits cannot change a running game.
 */
export function withDerivedInvestments(teams = {}, students = {}, status = "WAITING") {
  const frozen = ["SIMULATION", "RESULT"].includes(status);
  const totals = computeInvestmentsReceived(students, teams);
  return Object.fromEntries(
    Object.entries(teams).map(([key, team]) => {
      const members = getStudentsByTeam(students, key);
      if (frozen) return [key, { ...team, memberCount: members.length }];
      const diversity = computeTeamDiversity(members);
      return [key, {
        ...team,
        memberCount: members.length,
        investmentsReceived: totals[key] || 0,
        diversity,
        baseAsset: computeBaseAsset(diversity)
      }];
    })
  );
}

/** Start → final asset change of a team, for reports. */
export function getAssetChange(team) {
  const initial = getTeamStartingCapital(team);
  const final = Number(team?.currentAsset || 0);
  const delta = final - initial;
  const rate = initial ? (delta / initial) * 100 : 0;
  return { initial, final, delta, rate, positive: delta >= 0 };
}

/** Counts AI factor grades (양호/보통/취약) for a team. */
export function countAiGrades(team) {
  const counts = { 양호: 0, 보통: 0, 취약: 0 };
  const factors = [...Object.values(team?.aiEvaluation?.factors || {})];
  if (!team?.aiEvaluation?.factors?.F15) factors.push(getEvaluationFactor(team, "F15"));
  for (const item of factors) {
    if (item?.grade in counts) counts[item.grade] += 1;
  }
  return counts;
}

export function makeNextTeamKey(teams = {}) {
  let index = Object.keys(teams).length + 1;
  let key = `T${index}`;
  while (teams[key]) {
    index += 1;
    key = `T${index}`;
  }
  return key;
}

export function getPivotScenario(settings, scenarioId) {
  return mergeSimulationSettings(settings).pivotScenarios.find((scenario) => scenario.id === scenarioId)
    || PIVOT_SCENARIOS.find((scenario) => scenario.id === scenarioId);
}

export function resolvePivotVote(team, memberUids = [], scenarios = PIVOT_SCENARIOS) {
  const votes = team?.midDecision?.votes || {};
  const counts = {};
  for (const uid of memberUids) {
    const scenarioId = votes[uid];
    if (scenarios.some((scenario) => scenario.id === scenarioId)) counts[scenarioId] = (counts[scenarioId] || 0) + 1;
  }
  const max = Math.max(0, ...Object.values(counts));
  const tied = scenarios.filter((scenario) => counts[scenario.id] === max);
  const leaderVote = votes[team?.leaderId];
  return tied.find((scenario) => scenario.id === leaderVote)?.id || tied[0]?.id || scenarios[0]?.id || null;
}

export function makePivotTeamPatch(team, scenario, month = 12) {
  const beforeAsset = Number(team.currentAsset || 0);
  const immediateAmount = Number(scenario?.immediateAmount || 0);
  const immediateRate = Number(scenario?.immediateRate || 0);
  const afterAsset = Math.round(beforeAsset * (1 + immediateRate / 100) + immediateAmount);
  const modifiers = { scenarioId: scenario?.id, appliedAtMonth: month };
  if (scenario?.id === "government_support") modifiers.factorMultipliers = { F09: Number(scenario.primaryMultiplier || 1) };
  if (scenario?.id === "professional_management") modifiers.equityDilutionRate = Number(scenario.dilutionRate || 0);
  if (scenario?.id === "downsizing" || scenario?.id === "aggressive_expansion") modifiers.eventRateMultiplier = Number(scenario.primaryMultiplier || 1);
  if (scenario?.id === "early_exit") modifiers.frozenAfterMonth = month;
  if (scenario?.id === "global_expansion") modifiers.factorMultipliers = { F01: Number(scenario.primaryMultiplier || 1), F04: Number(scenario.primaryMultiplier || 1), F11: Number(scenario.secondaryMultiplier || 1) };
  if (scenario?.id === "ip_protection") {
    modifiers.factorOverrides = { F14: "양호" };
    modifiers.negativeEventMultipliers = { E05: Number(scenario.primaryMultiplier || 1), E19: Number(scenario.primaryMultiplier || 1) };
  }
  if (scenario?.id === "cofounder_reset") {
    modifiers.negativeEventMultipliers = { E16: Number(scenario.primaryMultiplier || 1), E20: Number(scenario.primaryMultiplier || 1) };
    modifiers.goodPositiveMultiplier = Number(scenario.secondaryMultiplier || 1);
  }
  if (scenario?.id === "crowdfunding") modifiers.factorMultipliers = { F02: Number(scenario.primaryMultiplier || 1), F07: Number(scenario.primaryMultiplier || 1), F11: Number(scenario.primaryMultiplier || 1) };
  if (scenario?.id === "turnaround") {
    const factors = team.aiEvaluation?.factors || {};
    const target = Object.keys(factors).find((key) => factors[key]?.grade === "취약") || Object.keys(factors).find((key) => factors[key]?.grade === "보통");
    if (target) modifiers.factorOverrides = { [target]: factors[target]?.grade === "취약" ? "보통" : "양호" };
  }
  const history = Array.isArray(team.assetHistory) ? team.assetHistory : [];
  return { currentAsset: afterAsset, pivotModifiers: modifiers, pivotScenarioId: scenario?.id, assetHistory: [...history, { month, asset: afterAsset, pivot: true }] };
}

export function applyRiskMultiplier(team, event, simulationSettings = {}, month = 0) {
  const settings = mergeSimulationSettings(simulationSettings);
  const modifiers = team.pivotModifiers || {};
  const baseGrade = team.aiEvaluation?.factors?.[event.factor]?.grade || "보통";
  const grade = modifiers.factorOverrides?.[event.factor] || baseGrade;
  let rate = Number(simulationSettings.eventRates?.[event.id]?.[grade] ?? event.rates?.[grade] ?? 0);
  rate *= Number(settings.eventMultipliers?.[event.id]?.[rate >= 0 ? "positive" : "negative"] ?? 1);
  rate *= Number(settings.factorGradeMultipliers?.[event.factor]?.[grade] ?? 1);
  if (month > 12) {
    rate *= Number(modifiers.eventRateMultiplier || 1);
    rate *= Number(modifiers.factorMultipliers?.[event.factor] || 1);
    if (rate < 0) rate *= Number(modifiers.negativeEventMultipliers?.[event.id] || 1);
    if (rate > 0 && grade === "양호") rate *= Number(modifiers.goodPositiveMultiplier || 1);
    if (Number(modifiers.frozenAfterMonth || 0) > 0) rate = 0;
  }
  // Global assessments modify each team's event rate throughout all 24 months.
  // Missing assessments in existing rooms stay neutral until re-evaluation.
  const assessmentGrade = (id) => (month > 12 ? modifiers.factorOverrides?.[id] : null) || team.aiEvaluation?.factors?.[id]?.grade;
  const feasibility = assessmentGrade("F16");
  const duplication = assessmentGrade("F17");
  const globalMultiplier = (id, grade) => Number(settings.globalFactorMultipliers[id]?.[grade] ?? 1);
  if (rate > 0 && ["양호", "보통"].includes(feasibility)) rate *= globalMultiplier("F16", feasibility);
  if (rate < 0) {
    const extraLoss = (feasibility === "취약" ? globalMultiplier("F16", feasibility) - 1 : 0) + globalMultiplier("F17", duplication) - 1;
    rate *= Math.max(0, 1 + extraLoss);
  }
  rate = Math.round(rate * 100) / 100 || 0;
  const beforeAsset = Number(team.currentAsset || 0);
  const afterAsset = Math.round(beforeAsset * (1 + rate / 100));

  return {
    ...team,
    currentAsset: afterAsset,
    lastEventImpact: {
      eventId: event.id,
      factor: event.factor,
      grade,
      rate,
      beforeAsset,
      afterAsset
    }
  };
}
