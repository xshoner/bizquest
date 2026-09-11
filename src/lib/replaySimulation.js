import { applyRiskMultiplier, getTeamStartingCapital, makePivotTeamPatch, SIMULATION_MONTHS } from "./game.js";
import { mergeSimulationSettings } from "../data/simulationSettings.js";

/** Replays the recorded events, grades, investments and pivot decisions; never draws new events. */
export function replaySimulation(room, apply = applyRiskMultiplier) {
  const events = [...(room.eventHistory || [])].sort((a, b) => a.month - b.month);
  if (events.length !== SIMULATION_MONTHS || events.some((entry, i) => entry.month !== i + 1 || !entry.event?.id)) {
    throw new Error("24개월 이벤트 기록이 완전하지 않아 자동 재계산할 수 없습니다.");
  }
  const settings = mergeSimulationSettings(room.simulationSettings);
  return Object.fromEntries(Object.entries(room.teams).map(([key, original]) => {
    let team = { ...original, currentAsset: getTeamStartingCapital(original), pivotModifiers: null, lastEventImpact: null, equityDilutionApplied: false };
    team.assetHistory = [{ month: 0, asset: team.currentAsset }];
    for (const { month, event } of events) {
      team = apply(team, event, room.simulationSettings, month);
      team.assetHistory.push({ month, asset: team.currentAsset });
      if (month === 12 && original.pivotModifiers?.scenarioId) {
        const scenario = settings.pivotScenarios.find((item) => item.id === original.pivotModifiers.scenarioId);
        if (!scenario) throw new Error("기록된 피벗 전략을 찾을 수 없습니다.");
        team = { ...team, ...makePivotTeamPatch(team, scenario), pivotModifiers: original.pivotModifiers };
      }
    }
    const dilution = Number(original.pivotModifiers?.equityDilutionRate || 0);
    if (dilution) {
      team.currentAsset = Math.max(0, Math.round(team.currentAsset * (1 - dilution / 100)));
      team.assetHistory[team.assetHistory.length - 1] = { month: SIMULATION_MONTHS, asset: team.currentAsset, dilution: true };
      team.equityDilutionApplied = true;
    }
    return [key, team];
  }));
}
