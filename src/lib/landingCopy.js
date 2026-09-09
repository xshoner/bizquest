// Upgrade only untouched previous default copy; preserve administrator custom text.
const LEGACY_COPY = {
  "heroBadge": "팀빌딩 기반 청소년 창업 체험 게이미피케이션",
  "heroTitle": "게임처럼 시작하는 청소년 창업 체험교육",
  "heroDescription": "비즈퀘스트는 학생들이 가상 창업가가 되어 아이디어를 기획하고, 실제와 유사한 시장 경제 시뮬레이션을 플레이하는 웹 기반 게이미피케이션 플랫폼입니다.",
  "startLink": "지금 시작하기",
  "sectionEyebrow": "교사와 학생을 위한 간편한 시작",
  "sectionTitle": "방 만들기와 참여를 빠르게 시작하세요",
  "introTitle": "실제 창업과 비즈니스 경험을 팀빌딩 게임으로 구현",
  "featureTitle": "몰입은 깊게, 학습은 확실하게",
  "processTitle": "방 입장부터 매출 목표 달성까지의 8단계 여정",
  "processDescription": "직관적인 게임 플레이 흐름을 통해 실제 창업 전반의 핵심 액션을 압축적으로 체험합니다.",
  "ctaTitle": "교실을 생동감 넘치는 가상 비즈니스로 바꾸세요",
  "ctaDescription": "3초 만에 무료 비즈니스 룸을 생성하고, 학생들이 펼치는 창업 레이스를 바로 시작하세요.",
  "ctaButton": "가장 빠르게 시작하기"
};

export function migrateLandingCopy(incoming = {}, defaults = {}) {
  const result = Object.fromEntries(Object.entries(incoming).map(([key, value]) => [key,
    LEGACY_COPY[key] === value ? defaults[key] : value
  ]));
  if (Array.isArray(result.featureItems)) {
    result.featureItems = result.featureItems.map((item) =>
      item.title === "완벽한 게이미피케이션" && item.description === "랭킹 시스템, C레벨 배지, 가상 경영 시뮬레이션으로 학생의 자발적 몰입을 이끌어냅니다."
        ? defaults.featureItems?.[0] || item : item);
  }
  return result;
}
