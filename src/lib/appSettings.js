import { useEffect, useState } from "react";
import { auth, db, doc, onSnapshot, signInAnonymously } from "../firebase.js";

export const DEFAULT_APP_SETTINGS = {
  adminPasscode: "7476",
  geminiApiKey: "AIzaSyCRu_qSe4hDKPohHrdmd9PH0HjQVKaB4nU",
  defaultRoomTitle: "스타트업 히어로",
  studentOriginHost: "192.168.0.190",
  landing: {
    heroAlt: "BIZ 퀘스트 청소년 창업 체험 게이미피케이션",
    startLink: "지금 시작하기",
    flowLink: "수업 흐름 보기",
    sectionEyebrow: "교사와 학생을 위한 간편한 시작",
    sectionTitle: "방 만들기와 참여를 빠르게 시작하세요",
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
    valueItems: [
      { title: "게임처럼 몰입", description: "팀 미션, 단계 진행, 실시간 이벤트로 수업 집중도를 높입니다." },
      { title: "실전 창업 과정", description: "트렌드 분석부터 투자 유치까지 창업 흐름을 직접 경험합니다." },
      { title: "AI 기반 피드백", description: "사업계획을 팩터별로 평가해 개선 방향을 바로 확인합니다." },
      { title: "협업과 의사결정", description: "팀장, 팀원, 투자자 역할을 오가며 비즈니스 감각을 익힙니다." }
    ],
    flowSteps: ["대기실 및 팀빌딩", "트렌드·기술카드", "사업계획 수립", "AI 평가", "투자 유치", "경영 시뮬레이션", "최종 결과"],
    footerBrand: "BIZ 퀘스트",
    footerTagline: "아이디어를 창업으로, 가능성을 현실로.",
    contactEmail: "xshoner@gmail.com",
    contactPhone: "010-3246-7476"
  }
};

export const APP_SETTINGS_PATH = ["appSettings", "global"];

export function mergeAppSettings(settings = {}) {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...settings,
    landing: {
      ...DEFAULT_APP_SETTINGS.landing,
      ...(settings.landing || {}),
      featureButtons: Array.isArray(settings.landing?.featureButtons)
        ? settings.landing.featureButtons
        : DEFAULT_APP_SETTINGS.landing.featureButtons,
      valueItems: Array.isArray(settings.landing?.valueItems)
        ? settings.landing.valueItems
        : DEFAULT_APP_SETTINGS.landing.valueItems,
      flowSteps: Array.isArray(settings.landing?.flowSteps)
        ? settings.landing.flowSteps
        : DEFAULT_APP_SETTINGS.landing.flowSteps
    }
  };
}

export function useAppSettings() {
  const [settings, setSettings] = useState(DEFAULT_APP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let unsubscribe = null;
    let mounted = true;

    async function subscribe() {
      try {
        if (!auth.currentUser) await signInAnonymously(auth);
        if (!mounted) return;
        unsubscribe = onSnapshot(
          doc(db, ...APP_SETTINGS_PATH),
          (snapshot) => {
            setSettings(mergeAppSettings(snapshot.exists() ? snapshot.data() : {}));
            setLoading(false);
          },
          (err) => {
            setError(err.message || "설정 정보를 불러오지 못했습니다.");
            setLoading(false);
          }
        );
      } catch (err) {
        if (!mounted) return;
        setError(err.message || "설정 정보를 불러오지 못했습니다.");
        setLoading(false);
      }
    }

    subscribe();
    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return { settings, loading, error };
}
