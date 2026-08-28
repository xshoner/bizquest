import { SIMULATION_EVENTS, TEAM_KEYS } from "../data/gameData.js";

export const TEAM_BASE_ASSET = 100000000;
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
  for (const item of Object.values(team?.aiEvaluation?.factors || {})) {
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

export function applyRiskMultiplier(team, event) {
  const grade = team.aiEvaluation?.factors?.[event.factor]?.grade || "보통";
  const rate = Number(event.rates?.[grade] ?? 0);
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
