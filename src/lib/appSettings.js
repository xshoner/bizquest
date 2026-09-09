import { migrateLandingCopy } from "./landingCopy.js";
import { useEffect, useState } from "react";
import { auth, db, doc, getDoc, onAuthStateChanged } from "../firebase.js";
import { DEFAULT_SIMULATION_SETTINGS, mergeSimulationSettings } from "../data/simulationSettings.js";

export const DEFAULT_APP_SETTINGS = {
  defaultRoomTitle: "BIZQUEST",
  studentOriginHost: "192.168.0.190",
  simulation: DEFAULT_SIMULATION_SETTINGS,
  landing: {
    heroAlt: "BIZ 퀘스트 청소년 창업 체험 게이미피케이션",
    startLink: "수업 시작하기",
    flowLink: "수업 흐름 보기",
    sectionEyebrow: "START YOUR CLASS",
    sectionTitle: "우리 교실의 첫 비즈니스",
    teacherTitle: "교사용 방 만들기",
    teacherDescription: "수업명으로 방을 만들고 학생을 초대합니다.",
    roomTitleLabel: "방 제목",
    createButton: "방 만들기",
    creatingButton: "생성 중...",
    studentTitle: "학생 참여하기",
    studentDescription: "QR 또는 6자리 방 코드로 바로 입장합니다.",
    joinCodeLabel: "방 코드",
    joinPlaceholder: "예: ABC123",
    joinButton: "입장하기",
    featureButtons: ["서비스 소개", "특장점", "이용 방법", "활용 사례", "FAQ"],
    brandName: "BizQuest",
    heroBadge: "청소년을 위한 비즈니스 시뮬레이션",
    heroTitle: "아이디어를 넘어,\n경영을 경험하다.",
    heroDescription: "아이디어 기획부터 AI 사업성 평가, 투자 유치, 24개월 경영 시뮬레이션까지. 실제 창업 프로세스를 수업 목적과 차시에 맞춰 적용하세요.",
    statItems: [
      { title: "누적 체험 학생", description: "12,400+명" },
      { title: "교사 만족도", description: "98.5%" }
    ],
    introEyebrow: "ABOUT BIZQUEST",
    introTitle: "직접 선택하고, 결과로 배우는 경영",
    introQuote: "안전한 실패를 허용하는 환경에서 배우는 진짜 창의·경영 프로세스",
    introBody: "학생들은 팀 빌딩, C레벨 자가진단, 아이템 기획, 트렌드 분석, 모의 투자, AI 전문가 평가, 24개월 경영 시뮬레이션까지 가상의 경영 환경 속에서 미션 중심으로 창업 전 과정을 경험합니다.",
    featureEyebrow: "KEY FEATURES",
    featureTitle: "학생은 몰입하고, 교사는 흐름에 집중하도록",
    featureItems: [
      { title: "의사결정으로 배우는 경영", description: "팀별 미션과 시장 이벤트 속에서 투자와 경영을 선택하고, 결과를 비교하며 비즈니스 감각을 기릅니다." },
      { title: "설치가 필요 없는 웹앱", description: "스마트폰, 태블릿, PC에서 브라우저 접속만으로 바로 수업을 시작할 수 있습니다." },
      { title: "교사 전용 대시보드", description: "학생 팀 관리, 진행률, 자금 현황, 랭킹을 한 화면에서 확인하고 즉시 피드백할 수 있습니다." }
    ],
    processEyebrow: "HOW IT WORKS",
    processTitle: "한 팀의 시작에서, 경영의 결과까지",
    processDescription: "팀 구성부터 최종 결과까지 8단계. 교사가 수업의 속도를 조절하고, 학생은 매 단계 의사결정의 주체가 됩니다.",
    useCaseEyebrow: "USE CASES",
    useCaseTitle: "학교와 교육 기관에서 바로 활용하는 창업 체험",
    useCaseDescription: "진로체험 교실부터 해커톤 단기 캠프까지 수업 목적에 맞춰 유연하게 적용할 수 있습니다.",
    useCases: [
      { title: "정규 수업 / 진로 활동", description: "자유학년제, 창체 시간, 기업가정신 동아리 수업에서 반 친구들과 협업하며 실제 수익 모형을 다듬는 주체적 경험을 제공합니다.", quote: "진로 수업 내내 조용하던 학생들이 가상 상품 기획을 위해 치열하게 토의했습니다." },
      { title: "창업 해커톤 / 캠프", description: "단기 교육 일정에서도 가상 론칭과 시장 반응 확인, 피보팅 단계를 빠르게 경험할 수 있습니다.", quote: "실시간 시뮬레이션 덕분에 평가와 시상이 간소화되고 재미는 더 커졌습니다." },
      { title: "지자체 & 청소년 기관", description: "지역 진로센터와 청소년 기관에서 방학 및 주말 경제 교양 프로그램으로 운영하기 좋습니다.", quote: "참여 청소년들이 스스로 가상 영업을 이어가며 경제 개념을 자연스럽게 익혔습니다." }
    ],
    faqEyebrow: "FAQ",
    faqTitle: "자주 묻는 질문",
    faqs: [
      { title: "창업 지식이 없는 학생도 참여할 수 있나요?", description: "네. 단계별 퀘스트와 시각 튜토리얼을 따라가며 개념을 자연스럽게 익히도록 설계되어 있습니다." },
      { title: "한 클래스당 적정 인원과 소요 시간은 어떻게 되나요?", description: "20~30명 학급을 3~5인 팀으로 구성할 때 가장 활기차며, 90분 압축 체험부터 장기 프로젝트까지 운영할 수 있습니다." },
      { title: "별도 서버나 프로그램 설치가 필요한가요?", description: "아니요. 클라우드형 웹앱이므로 학생은 QR 코드 또는 방 코드로 브라우저에서 바로 접속합니다." }
    ],
    ctaTitle: "다음 수업, 학생들이 경영자가 되는 시간",
    ctaDescription: "수업방을 만들고 학생을 초대하세요. 첫 아이디어가 경영 경험이 됩니다.",
    ctaButton: "수업방 만들기",
    valueItems: [
      { title: "게임처럼 몰입", description: "팀 미션, 단계 진행, 실시간 이벤트로 수업 집중도를 높입니다." },
      { title: "실전 창업 과정", description: "트렌드 분석부터 투자 유치까지 창업 흐름을 직접 경험합니다." },
      { title: "AI 기반 피드백", description: "사업계획을 팩터별로 평가해 개선 방향을 바로 확인합니다." },
      { title: "협업과 의사결정", description: "팀장, 팀원, 투자자 역할을 오가며 비즈니스 감각을 익힙니다." }
    ],
    flowSteps: ["대기실 및 팀빌딩", "C레벨 자가진단", "트렌드·기술카드", "사업계획 수립", "AI 평가", "투자 유치", "경영 시뮬레이션", "최종 결과"],
    footerBrand: "BIZ 퀘스트",
    footerTagline: "아이디어를 창업으로, 가능성을 현실로.",
    contactEmail: "xshoner@gmail.com",
    contactPhone: "010-3246-7476"
  }
};

export const APP_SETTINGS_PATH = ["appSettings", "global"];
export const LOCAL_APP_SETTINGS_KEY = "bizquest-app-settings-cache";

function readLocalAppSettings() {
  if (typeof window === "undefined") return null;
  try {
    const cached = window.localStorage.getItem(LOCAL_APP_SETTINGS_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    delete parsed.geminiApiKey;
    delete parsed.adminPasscode;
    delete parsed.adminPasscodeChangedAt;
    return parsed;
  } catch {
    return null;
  }
}

export function mergeAppSettings(settings = {}) {
  const sanitizedSettings = { ...settings };
  delete sanitizedSettings.geminiApiKey;
  delete sanitizedSettings.adminPasscode;
  delete sanitizedSettings.adminPasscodeChangedAt;
  const incomingLanding = migrateLandingCopy(settings.landing || {}, DEFAULT_APP_SETTINGS.landing);
  const flowSteps = Array.isArray(incomingLanding.flowSteps)
    ? incomingLanding.flowSteps
    : DEFAULT_APP_SETTINGS.landing.flowSteps;
  const normalizedFlowSteps = flowSteps.includes("C레벨 자가진단")
    ? flowSteps
    : [flowSteps[0] || "대기실 및 팀빌딩", "C레벨 자가진단", ...flowSteps.slice(1)];

  return {
    ...DEFAULT_APP_SETTINGS,
    ...sanitizedSettings,
    simulation: mergeSimulationSettings(settings.simulation),
    landing: {
      ...DEFAULT_APP_SETTINGS.landing,
      ...incomingLanding,
      featureButtons: Array.isArray(incomingLanding.featureButtons)
        ? incomingLanding.featureButtons
        : DEFAULT_APP_SETTINGS.landing.featureButtons,
      valueItems: Array.isArray(incomingLanding.valueItems)
        ? incomingLanding.valueItems
        : DEFAULT_APP_SETTINGS.landing.valueItems,
      flowSteps: normalizedFlowSteps,
      statItems: Array.isArray(incomingLanding.statItems)
        ? incomingLanding.statItems
        : DEFAULT_APP_SETTINGS.landing.statItems,
      featureItems: Array.isArray(incomingLanding.featureItems)
        ? incomingLanding.featureItems
        : DEFAULT_APP_SETTINGS.landing.featureItems,
      useCases: Array.isArray(incomingLanding.useCases)
        ? incomingLanding.useCases
        : DEFAULT_APP_SETTINGS.landing.useCases,
      faqs: Array.isArray(incomingLanding.faqs)
        ? incomingLanding.faqs
        : DEFAULT_APP_SETTINGS.landing.faqs
    }
  };
}

export function useAppSettings() {
  const [settings, setSettings] = useState(() => mergeAppSettings(readLocalAppSettings() || DEFAULT_APP_SETTINGS));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    let requestId = 0;

    async function loadSettings(user) {
      const currentRequest = ++requestId;
      try {
        if (!user || user.isAnonymous) {
          setSettings(mergeAppSettings(readLocalAppSettings() || DEFAULT_APP_SETTINGS));
          setLoading(false);
          return;
        }
        const snapshot = await getDoc(doc(db, ...APP_SETTINGS_PATH));
        if (!mounted || currentRequest !== requestId) return;
        const remoteSettings = snapshot.exists() ? snapshot.data() : {};
        const nextSettings = mergeAppSettings(remoteSettings);
        setSettings(nextSettings);
        try { localStorage.setItem(LOCAL_APP_SETTINGS_KEY, JSON.stringify(nextSettings)); } catch { /* Cache is optional. */ }
        setLoading(false);
      } catch (err) {
        if (!mounted) return;
        setError(err.message || "설정 정보를 불러오지 못했습니다.");
        setLoading(false);
      }
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => loadSettings(user));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    function handleStorage(event) {
      if (event.key !== LOCAL_APP_SETTINGS_KEY || !event.newValue) return;
      try {
        setSettings(mergeAppSettings(JSON.parse(event.newValue)));
      } catch {
        // Ignore malformed external cache updates.
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return { settings, loading, error };
}
