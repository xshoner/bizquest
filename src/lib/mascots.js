export const TEAM_MASCOTS = [
  { id: "rocket", name: "로켓", column: 0, row: 0 },
  { id: "robot", name: "로봇", column: 1, row: 0 },
  { id: "bulb", name: "아이디어 전구", column: 2, row: 0 },
  { id: "fox", name: "창업 여우", column: 3, row: 0 },
  { id: "owl", name: "전략 부엉이", column: 4, row: 0 },
  { id: "sprout", name: "새싹", column: 0, row: 1 },
  { id: "lion", name: "리더 사자", column: 1, row: 1 },
  { id: "cloud", name: "도움 구름", column: 2, row: 1 },
  { id: "star", name: "도전 별", column: 3, row: 1 },
  { id: "penguin", name: "분석 펭귄", column: 4, row: 1 },
  { id: "dragon", name: "도전 드래곤" },
  { id: "otter", name: "협력 수달" }
];

export const DEFAULT_MASCOT_ID = TEAM_MASCOTS[0].id;

export function getMascot(mascotId) {
  return TEAM_MASCOTS.find((mascot) => mascot.id === mascotId) || TEAM_MASCOTS[0];
}
