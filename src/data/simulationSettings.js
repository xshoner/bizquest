import { BUSINESS_FACTORS, SIMULATION_EVENTS } from "./gameData.js";

export const PIVOT_SCENARIOS = [
  { id: "government_support", title: "정부지원사업 선정", tone: "안정", icon: "🏛️", summary: "지원금을 확보하지만 정책 변화에 더 민감해집니다.", immediateLabel: "+3,000만원", effectLabel: "F09 이벤트 등락폭 1.5배", immediateAmount: 30000000, primaryMultiplier: 1.5 },
  { id: "professional_management", title: "전문 경영인·투자자 영입", tone: "성장·희석", icon: "🤝", summary: "큰 자금을 확보하는 대신 최종 지분 일부를 이양합니다.", immediateLabel: "+5,000만원", effectLabel: "최종 자산 15% 지분 희석", immediateAmount: 50000000, dilutionRate: 15 },
  { id: "downsizing", title: "긴축 경영(다운사이징)", tone: "방어", icon: "🛡️", summary: "구조조정 비용을 감수하고 모든 변동성을 낮춥니다.", immediateLabel: "-4,500만원", effectLabel: "모든 이벤트 등락폭 40% 완화", immediateAmount: -45000000, primaryMultiplier: 0.6 },
  { id: "aggressive_expansion", title: "공격적 확장", tone: "고위험·고수익", icon: "🚀", summary: "마케팅에 투자해 상승과 하락의 폭을 모두 키웁니다.", immediateLabel: "-3,000만원", effectLabel: "모든 이벤트 등락폭 40% 증폭", immediateAmount: -30000000, primaryMultiplier: 1.4 },
  { id: "turnaround", title: "약점 집중 보완", tone: "개선형", icon: "🔧", summary: "가장 취약한 사업 팩터 하나를 한 단계 개선합니다.", immediateLabel: "즉시 비용 없음", effectLabel: "최저 등급 팩터 1개 상향", immediateAmount: 0, primaryMultiplier: 1 },
  { id: "early_exit", title: "사업 정리·조기 청산", tone: "종료형", icon: "🏁", summary: "현재 자산을 지키고 전략적 엑싯을 선택합니다.", immediateLabel: "현재 자산 동결", effectLabel: "13~24개월 이벤트 미적용", immediateAmount: 0, primaryMultiplier: 1 },
  { id: "global_expansion", title: "해외 진출", tone: "고위험 확장", icon: "🌏", summary: "해외 화제성과 환율·원자재 노출을 함께 키웁니다.", immediateLabel: "-2,000만원", effectLabel: "F01·F04 1.5배 / F11 1.3배", immediateAmount: -20000000, primaryMultiplier: 1.5, secondaryMultiplier: 1.3 },
  { id: "ip_protection", title: "지식재산권 강화", tone: "방어형", icon: "⚖️", summary: "권리를 선점해 카피캣과 도용 피해를 줄입니다.", immediateLabel: "-1,000만원", effectLabel: "F14 양호 고정 / E05·E19 하락 절반", immediateAmount: -10000000, primaryMultiplier: 0.5 },
  { id: "cofounder_reset", title: "공동창업자 영입·팀 재정비", tone: "안정형", icon: "🧩", summary: "팀 리스크를 막는 대신 신중한 조직으로 바뀝니다.", immediateLabel: "-1,000만원", effectLabel: "E16·E20 하락 80% 상쇄 / 양호 상승 10% 감소", immediateAmount: -10000000, primaryMultiplier: 0.2, secondaryMultiplier: 0.9 },
  { id: "crowdfunding", title: "사전예약·크라우드펀딩", tone: "시장 검증형", icon: "📣", summary: "현재 성과를 자금으로 바꾸고 시장 노출을 확대합니다.", immediateLabel: "현재 자산 +10%", effectLabel: "F02·F07·F11 등락폭 1.4배", immediateAmount: 0, immediateRate: 10, primaryMultiplier: 1.4 }
];

export const DEFAULT_SIMULATION_SETTINGS = {
  pivotScenarios: PIVOT_SCENARIOS,
  eventRates: Object.fromEntries(SIMULATION_EVENTS.map((event) => [event.id, { ...event.rates }])),
  globalFactorMultipliers: {
    F16: { 양호: 1.05, 보통: 1.015, 취약: 1.035 },
    F17: { 양호: 0.95, 보통: 0.975, 취약: 1.037 }
  },
  eventMultipliers: Object.fromEntries(SIMULATION_EVENTS.map((event) => [event.id, { positive: 1, negative: 1 }])),
  factorGradeMultipliers: Object.fromEntries(BUSINESS_FACTORS.map((factor) => [factor.id, { "양호": 1, "보통": 1, "취약": 1 }]))
};

export function mergeSimulationSettings(settings = {}) {
  const incomingScenarios = new Map((settings.pivotScenarios || []).map((scenario) => [scenario.id, scenario]));
  return {
    eventRates: Object.fromEntries(SIMULATION_EVENTS.map((event) => [event.id, {
      ...event.rates, ...(settings.eventRates?.[event.id] || {})
    }])),
    globalFactorMultipliers: Object.fromEntries(Object.entries(DEFAULT_SIMULATION_SETTINGS.globalFactorMultipliers).map(([id, grades]) => [id, {
      ...grades, ...(settings.globalFactorMultipliers?.[id] || {})
    }])),
    pivotScenarios: PIVOT_SCENARIOS.map((scenario) => ({ ...scenario, ...(incomingScenarios.get(scenario.id) || {}) })),
    eventMultipliers: Object.fromEntries(SIMULATION_EVENTS.map((event) => [event.id, {
      ...DEFAULT_SIMULATION_SETTINGS.eventMultipliers[event.id],
      ...(settings.eventMultipliers?.[event.id] || {})
    }])),
    factorGradeMultipliers: Object.fromEntries(BUSINESS_FACTORS.map((factor) => [factor.id, {
      ...DEFAULT_SIMULATION_SETTINGS.factorGradeMultipliers[factor.id],
      ...(settings.factorGradeMultipliers?.[factor.id] || {})
    }]))
  };
}
