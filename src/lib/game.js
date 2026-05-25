import { SIMULATION_EVENTS, TEAM_KEYS } from "../data/gameData.js";

export const TEAM_BASE_ASSET = 100000000;
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
  return {
    roomId,
    roomTitle,
    status: "WAITING",
    currentMonth: 0,
    currentEvent: null,
    eventHistory: [],
    aiEvaluationStatus: "idle",
    simulationRunning: false,
    resultFinalizing: false,
    currentDecision: null,
    sysMessage: "방이 열렸습니다. QR 또는 방 코드로 입장하세요.",
    teams: makeDefaultTeams(),
    students: {}
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

export function recalculateInvestments(room, uid, nextInvestments) {
  const students = {
    ...(room.students || {}),
    [uid]: {
      ...(room.students?.[uid] || {}),
      investments: nextInvestments,
      investmentSubmitted: true
    }
  };

  const teams = Object.fromEntries(
    Object.entries(room.teams || {}).map(([key, team]) => [
      key,
      {
        ...team,
        investmentsReceived: Object.values(students).reduce(
          (sum, student) => sum + Number(student.investments?.[key] || 0),
          0
        )
      }
    ])
  );

  return { students, teams };
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
