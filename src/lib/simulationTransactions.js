import { applyRiskMultiplier, getTeamStartingCapital, SIMULATION_MONTHS } from "./game.js";

// The adapter keeps this operation testable against the real Firestore emulator.
export async function applySimulationEventTransaction({ runTransaction, db, ref, event, month, fallbackSettings = {}, owner }) {
  return runTransaction(db, async (transaction) => {
  const applySnap = await transaction.get(ref);
  if (!applySnap.exists()) return;
  const applyRoom = applySnap.data();
  if (applyRoom.status !== "SIMULATION") return;
  if (Number(applyRoom.currentMonth || 0) !== month || applyRoom.currentEvent?.id !== event.id || applyRoom.currentEventApplied) return;
  const teamPatch = {};
  for (const [key, team] of Object.entries(applyRoom.teams || {})) {
    const updated = applyRiskMultiplier(team, event, applyRoom.simulationSettings || fallbackSettings, month);
    const history = Array.isArray(team.assetHistory) && team.assetHistory.length > 0
      ? team.assetHistory
      : [{ month: 0, asset: getTeamStartingCapital(team) }];
    teamPatch[`teams.${key}.currentAsset`] = updated.currentAsset;
    teamPatch[`teams.${key}.lastEventImpact`] = updated.lastEventImpact;
    teamPatch[`teams.${key}.assetHistory`] = [...history, { month, asset: updated.currentAsset }];
  }
  const isPivotStop = month === 12 && applyRoom.pivotPhase !== "applied";
  if (isPivotStop) {
    for (const key of Object.keys(applyRoom.teams || {})) {
      teamPatch[`teams.${key}.midDecision`] = { votes: {}, resolvedScenario: null };
    }
  }
  const keepRunning = Boolean(applyRoom.simulationRunning) && month < SIMULATION_MONTHS && !isPivotStop;
  transaction.update(ref, {
    updatedAt: Date.now(),
    ...teamPatch,
    currentEventApplied: true,
    ...(isPivotStop ? { pivotPhase: "voting" } : {}),
    simulationRunning: keepRunning,
    simulationOwner: keepRunning ? applyRoom.simulationOwner || owner : null,
    simulationHeartbeatAt: keepRunning ? Date.now() : 0,
    sysMessage: month >= SIMULATION_MONTHS ? `${SIMULATION_MONTHS}개월 경영 시뮬레이션이 종료되었습니다. 교사가 최종 결과 버튼을 누르면 결과가 공개됩니다.` : isPivotStop ? "12개월 차가 종료되었습니다. 모든 팀원이 미래를 바꿀 피벗 카드에 투표하세요." : `${month}개월 차 이벤트 자산 변동이 반영되었습니다.`
  });
  });
}
