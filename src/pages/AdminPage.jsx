import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowRight,
  Award,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CheckCircle2,
  ClipboardCheck,
  Cpu,
  Crown,
  FileDown,
  FileText,
  Flag,
  GraduationCap,
  Hash,
  Lightbulb,
  LineChart,
  Mail,
  Maximize2,
  Megaphone,
  MessageCircle,
  Pause,
  Phone,
  PieChart,
  Play,
  Plus,
  QrCode,
  RotateCcw,
  Rocket,
  Trophy,
  Trash2,
  Users
} from "lucide-react";
import { auth, db, doc, getDoc, setDoc, signInAnonymously, updateDoc } from "../firebase.js";
import { BUSINESS_FACTORS, STATUSES, STATUS_LABELS } from "../data/gameData.js";
import {
  TEAM_BASE_ASSET,
  applyRiskMultiplier,
  drawEvent,
  formatWon,
  getAvatarColor,
  getStudentsByTeam,
  getTeamEntries,
  makeInitialRoom,
  makeNextTeamKey,
  makeRoomId,
  makeTeam,
  normalizeTeamName,
  rankTeams
} from "../lib/game.js";
import { useAppSettings } from "../lib/appSettings.js";
import { useRoom } from "../hooks/useRoom.js";
import simulationBgm from "../images/bgm01.mp3";
import landingImage from "../images/landing2.png";

const PHASES = [
  STATUSES.WAITING,
  STATUSES.C_LEVEL,
  STATUSES.CARD_SELECT,
  STATUSES.IDEATION,
  STATUSES.AI_EVALUATION,
  STATUSES.INVESTMENT,
  STATUSES.SIMULATION,
  STATUSES.RESULT
];
const PHASE_ICONS = {
  [STATUSES.WAITING]: MessageCircle,
  [STATUSES.C_LEVEL]: Award,
  [STATUSES.CARD_SELECT]: LineChart,
  [STATUSES.IDEATION]: Lightbulb,
  [STATUSES.AI_EVALUATION]: ClipboardCheck,
  [STATUSES.INVESTMENT]: PieChart,
  [STATUSES.SIMULATION]: Cpu,
  [STATUSES.RESULT]: Trophy
};
const AI_GRADES = ["양호", "보통", "취약"];
const SIMULATION_EVENT_DELAY = 5000;
const SIMULATION_SPEEDS = {
  slow: { label: "느림", rate: "5초", delay: SIMULATION_EVENT_DELAY },
  normal: { label: "보통", rate: "5초", delay: SIMULATION_EVENT_DELAY },
  fast: { label: "빠르게", rate: "5초", delay: SIMULATION_EVENT_DELAY }
};
const eventCardImages = Object.fromEntries(
  Object.entries(import.meta.glob("../images/E*.png", { eager: true, import: "default" }))
    .map(([path, image]) => [path.match(/E\d{2}/)?.[0], image])
    .filter(([id]) => id)
);

function LandingPage({ appSettings, roomTitle, setRoomTitle, joinCode, setJoinCode, actionError, creating, createRoom, joinAsStudent }) {
  const landing = appSettings.landing;

  return (
    <section className="landing-page">
      <section className="landing-hero">
        <img src={landingImage} alt={landing.heroAlt} />
        <a href="#quick-start" className="landing-hero-hotspot landing-hero-start">{landing.startLink}</a>
        <a href="#class-flow" className="landing-hero-hotspot landing-hero-flow">{landing.flowLink}</a>
      </section>

      <section id="quick-start" className="landing-quick-start">
        <div className="landing-section-title">
          <p>{landing.sectionEyebrow}</p>
          <h2>{landing.sectionTitle}</h2>
        </div>
        <div className="landing-start-grid">
          <section className="landing-start-card">
            <div className="landing-start-head">
              <GraduationCap size={34} />
              <div>
                <h3>{landing.teacherTitle}</h3>
                <p>{landing.teacherDescription}</p>
              </div>
            </div>
            <label>{landing.roomTitleLabel}</label>
            <input value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} />
            {actionError && <p className="landing-error">{actionError}</p>}
            <button disabled={creating} onClick={createRoom} className="landing-action-button">
              <Plus size={18} />
              {creating ? landing.creatingButton : landing.createButton}
            </button>
          </section>

          <section className="landing-start-card">
            <div className="landing-start-head">
              <QrCode size={34} />
              <div>
                <h3>{landing.studentTitle}</h3>
                <p>{landing.studentDescription}</p>
              </div>
            </div>
            <label>{landing.joinCodeLabel}</label>
            <input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder={landing.joinPlaceholder} className="landing-code-input" />
            <button onClick={joinAsStudent} className="landing-action-button landing-action-dark">
              {landing.joinButton}
              <ArrowRight size={18} />
            </button>
          </section>
        </div>
      </section>

      <section className="landing-feature-buttons" aria-label="준비 중인 메뉴">
        {landing.featureButtons.map((label) => (
          <button key={label} type="button">{label}</button>
        ))}
      </section>

      <section className="landing-value-panel">
        {landing.valueItems.map((item, index) => (
          <article key={item.title}>
            <span>{index + 1}</span>
            <strong>{item.title}</strong>
            <p>{item.description}</p>
          </article>
        ))}
      </section>

      <section id="class-flow" className="landing-flow-panel">
        {landing.flowSteps.map((label, index) => (
          <button key={label} type="button">
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </section>

      <footer className="landing-footer">
        <div>
          <strong>{landing.footerBrand}</strong>
          <p>{landing.footerTagline}</p>
        </div>
        <div className="landing-contact">
          <span><Mail size={16} /> {landing.contactEmail}</span>
          <span><Phone size={16} /> {landing.contactPhone}</span>
        </div>
      </footer>
    </section>
  );
}

export default function AdminPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { room, loading, error } = useRoom(roomId);
  const { settings: appSettings } = useAppSettings();
  const [roomTitle, setRoomTitle] = useState("스타트업 히어로");
  const [joinCode, setJoinCode] = useState("");
  const [actionError, setActionError] = useState("");
  const [creating, setCreating] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrCollapsed, setQrCollapsed] = useState(false);
  const [planTeam, setPlanTeam] = useState(null);
  const [opinionTeam, setOpinionTeam] = useState(null);
  const [aiConfirmOpen, setAiConfirmOpen] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const intervalRef = useRef(null);
  const bgmRef = useRef(null);
  const resultBoardRef = useRef(null);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    stopSimulationBgm();
  }, []);

  useEffect(() => {
    if (room?.status === STATUSES.RESULT) {
      setSimulationRunning(false);
      stopSimulationBgm();
      window.setTimeout(() => {
        resultBoardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 250);
    }
  }, [room?.status]);

  useEffect(() => {
    if (!roomId && roomTitle === "스타트업 히어로" && appSettings.defaultRoomTitle) {
      setRoomTitle(appSettings.defaultRoomTitle);
    }
  }, [appSettings.defaultRoomTitle, roomId, roomTitle]);

  function ensureSimulationBgm() {
    if (!bgmRef.current) {
      bgmRef.current = new Audio(simulationBgm);
      bgmRef.current.loop = true;
      bgmRef.current.volume = 0.42;
    }
    return bgmRef.current;
  }

  function playSimulationBgm() {
    const audio = ensureSimulationBgm();
    audio.play().catch(() => {});
  }

  function pauseSimulationBgm() {
    if (bgmRef.current) bgmRef.current.pause();
  }

  function stopSimulationBgm() {
    if (!bgmRef.current) return;
    bgmRef.current.pause();
    bgmRef.current.currentTime = 0;
  }

  const studentUrl = roomId ? `${getStudentOrigin(appSettings.studentOriginHost)}/room/${roomId}` : "";
  const students = room?.students || {};
  const teams = room?.teams || {};
  const rankedTeams = useMemo(() => rankTeams(teams), [teams]);
  const activeTeamEntries = useMemo(() => getTeamEntries(teams).filter(([teamKey]) =>
    Object.values(students).some((student) => student.team === teamKey)
  ), [teams, students]);
  const allPlansSubmitted = activeTeamEntries.length > 0 && activeTeamEntries.every(([, team]) => team.idea && team.ideaSubmitted !== false);
  const allTeamsEvaluated = activeTeamEntries.length > 0 && activeTeamEntries.every(([, team]) => team.aiEvaluation);
  const investmentChartVisible = [STATUSES.INVESTMENT, STATUSES.SIMULATION, STATUSES.RESULT].includes(room?.status);

  async function createRoom() {
    setActionError("");
    setCreating(true);
    try {
      if (!auth.currentUser) await signInAnonymously(auth);
      const nextRoomId = makeRoomId();
      await setDoc(doc(db, "rooms", nextRoomId), makeInitialRoom(nextRoomId, roomTitle.trim() || appSettings.defaultRoomTitle || "스타트업 히어로"));
      navigate(`/admin/${nextRoomId}`);
    } catch (err) {
      setActionError(err.message || "방 생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  }

  function joinAsStudent() {
    const code = joinCode.trim().toUpperCase();
    if (code) navigate(`/room/${code}`);
  }

  async function updateStatus(status) {
    if (!roomId) return;
    if (status === STATUSES.C_LEVEL || status === STATUSES.CARD_SELECT) {
      const activeTeams = Object.entries(teams).filter(([teamKey]) =>
        Object.values(students).some((student) => student.team === teamKey)
      );
      if (activeTeams.length === 0) {
        await updateDoc(doc(db, "rooms", roomId), {
          sysMessage: "학생을 팀에 배치한 뒤 다음 단계로 이동할 수 있습니다."
        });
        return;
      }
      const unassignedStudents = Object.values(students).some((student) => !student.team);
      if (unassignedStudents) {
        await updateDoc(doc(db, "rooms", roomId), {
          sysMessage: "대기 중인 학생을 모두 팀에 배치한 뒤 다음 단계로 이동할 수 있습니다."
        });
        return;
      }
      const missingLeader = activeTeams.some(([, team]) => !team.leaderId);
      if (missingLeader) {
        await updateDoc(doc(db, "rooms", roomId), {
          sysMessage: "팀장을 지정하세요. 참가자가 있는 모든 팀에 팀장이 있어야 다음 단계로 이동할 수 있습니다."
        });
        return;
      }
    }
    await updateDoc(doc(db, "rooms", roomId), {
      status,
      sysMessage: `${STATUS_LABELS[status]} 단계로 이동했습니다.`
    });
  }

  async function handlePhaseClick(status) {
    if (status === STATUSES.AI_EVALUATION) {
      if (!allPlansSubmitted) {
        await evaluateBusinessPlans();
        return;
      }
      setAiConfirmOpen(true);
      return;
    }
    if (status === STATUSES.SIMULATION) {
      await runSimulation(0);
      return;
    }
    if (status === STATUSES.RESULT) {
      await finalizeResults();
      return;
    }
    await updateStatus(status);
  }

  async function finalizeResults() {
    if (!roomId) return;
    if (Number(room?.currentMonth || 0) < 24) {
      await updateDoc(doc(db, "rooms", roomId), {
        sysMessage: "24개월 경영 시뮬레이션이 끝난 뒤 최종 결과를 집계할 수 있습니다."
      });
      return;
    }
    stopSimulationBgm();
    await updateDoc(doc(db, "rooms", roomId), {
      resultFinalizing: true,
      simulationRunning: false,
      sysMessage: "최종결과 집계중..."
    });
    window.setTimeout(() => {
      updateDoc(doc(db, "rooms", roomId), {
        resultFinalizing: false,
        status: STATUSES.RESULT,
        sysMessage: "최종 결과가 공개되었습니다."
      });
    }, 3000);
  }

  async function setLeader(uid, teamKey) {
    const nickname = students[uid]?.nickname || "학생";
    await updateDoc(doc(db, "rooms", roomId), {
      [`teams.${teamKey}.leaderId`]: uid,
      sysMessage: `${nickname} 학생이 ${teams[teamKey]?.teamName || "팀"} 팀장이 되었습니다.`
    });
  }

  async function renameTeam(teamKey, teamName) {
    const fallback = teams[teamKey]?.teamName || "팀";
    await updateDoc(doc(db, "rooms", roomId), {
      [`teams.${teamKey}.teamName`]: normalizeTeamName(teamName.trim() || fallback),
      sysMessage: "팀 이름이 변경되었습니다."
    });
  }

  async function addTeam() {
    const key = makeNextTeamKey(teams);
    await updateDoc(doc(db, "rooms", roomId), {
      [`teams.${key}`]: makeTeam(key, Object.keys(teams).length),
      sysMessage: "팀을 추가했습니다."
    });
  }

  async function deleteTeam(teamKey) {
    const nextTeams = { ...teams };
    const removedName = nextTeams[teamKey]?.teamName || "팀";
    delete nextTeams[teamKey];

    const nextStudents = Object.fromEntries(
      Object.entries(students).map(([uid, student]) => [
        uid,
        student.team === teamKey ? { ...student, team: null } : student
      ])
    );

    await updateDoc(doc(db, "rooms", roomId), {
      teams: nextTeams,
      students: nextStudents,
      sysMessage: `${removedName}이 삭제되어 해당 팀 학생은 대기실로 이동했습니다.`
    });
  }

  async function lockBusinessPlan(teamKey) {
    await updateDoc(doc(db, "rooms", roomId), {
      [`teams.${teamKey}.ideaLocked`]: true,
      sysMessage: `${teams[teamKey]?.teamName || "팀"} 사업계획을 확정했습니다. 학생 화면에서 더 이상 수정할 수 없습니다.`
    });
  }

  async function evaluateBusinessPlans() {
    if (!roomId || evaluating) return;
    if (!allPlansSubmitted) {
      await updateDoc(doc(db, "rooms", roomId), {
        sysMessage: "모든 팀의 사업계획서가 등록되어야 AI 평가를 시작할 수 있습니다."
      });
      return;
    }
    setEvaluating(true);
    try {
      await updateDoc(doc(db, "rooms", roomId), {
        status: STATUSES.AI_EVALUATION,
        aiEvaluationStatus: "evaluating",
        sysMessage: "지금 모두의 사업계획을 비즈니스 전문 AI가 평가중입니다..."
      });
      const evaluations = {};
      for (const [teamKey, team] of activeTeamEntries) {
        try {
          evaluations[teamKey] = await requestAiEvaluation(team, appSettings.geminiApiKey);
        } catch (err) {
          evaluations[teamKey] = makeFallbackAiEvaluation(team, err);
        }
      }
      const nextTeams = Object.fromEntries(Object.entries(teams).map(([key, team]) => [
        key,
        evaluations[key] ? { ...team, aiEvaluation: evaluations[key] } : team
      ]));
      await updateDoc(doc(db, "rooms", roomId), {
        teams: nextTeams,
        aiEvaluationStatus: "done",
        status: STATUSES.AI_EVALUATION,
        sysMessage: `${makeAiEvaluationMessage(evaluations)} 교사가 투자 유치 단계를 누르면 다음 단계로 이동합니다.`
      });
    } catch (err) {
      await updateDoc(doc(db, "rooms", roomId), {
        aiEvaluationStatus: "error",
        status: STATUSES.AI_EVALUATION,
        sysMessage: `AI 평가에 실패했습니다. ${err.message || "잠시 후 다시 시도하세요."}`
      });
    } finally {
      setEvaluating(false);
    }
  }

  async function initializeAssets() {
    const nextTeams = Object.fromEntries(Object.entries(room.teams || {}).map(([key, team]) => {
      const base = TEAM_BASE_ASSET + Number(team.investmentsReceived || 0);
      return [key, { ...team, initialCapital: base, currentAsset: base, midDecision: null, lastEventImpact: null, assetHistory: [{ month: 0, asset: base }] }];
    }));
    await updateDoc(doc(db, "rooms", roomId), {
      teams: nextTeams,
      currentMonth: 0,
      currentEvent: null,
      eventHistory: [],
      currentDecision: null,
      aiEvaluationStatus: "done",
      resultFinalizing: false,
      simulationRunning: true,
      status: STATUSES.SIMULATION,
      sysMessage: "AI 경영 시뮬레이션을 시작합니다. 모든 팀은 기본 자산 100,000,000원에 투자 유치금을 더해 출발합니다."
    });
  }

  async function runSimulation(startMonth = 0, speed = "normal") {
    if (!roomId || intervalRef.current) return;
    if (!allTeamsEvaluated) {
      await updateDoc(doc(db, "rooms", roomId), {
        sysMessage: "먼저 모든 팀의 AI 평가를 완료해야 경영 시뮬레이션을 시작할 수 있습니다."
      });
      return;
    }
    if (startMonth === 0) await initializeAssets();
    if (startMonth > 0) {
      await updateDoc(doc(db, "rooms", roomId), {
        simulationRunning: true,
        sysMessage: `${startMonth}개월 차부터 경영 시뮬레이션을 재개합니다.`
      });
    }
    let month = startMonth;
    setSimulationRunning(true);
    playSimulationBgm();

    async function advanceOneMonth() {
      month += 1;
      const freshSnap = await getDoc(doc(db, "rooms", roomId));
      if (!freshSnap.exists()) return;
      const freshRoom = freshSnap.data();

      const event = drawEvent();
      const nextEventHistory = [
        ...(Array.isArray(freshRoom.eventHistory) ? freshRoom.eventHistory : []),
        { month, event }
      ];
      const nextTeams = Object.fromEntries(
        Object.entries(freshRoom.teams || {}).map(([key, team]) => {
          const updated = applyRiskMultiplier(team, event);
          const history = Array.isArray(team.assetHistory) && team.assetHistory.length > 0
            ? team.assetHistory
            : [{ month: 0, asset: Number(team.initialCapital || TEAM_BASE_ASSET) }];
          return [key, { ...updated, assetHistory: [...history, { month, asset: updated.currentAsset }] }];
        })
      );
      await updateDoc(doc(db, "rooms", roomId), {
        teams: nextTeams,
        currentMonth: month,
        currentEvent: event,
        eventHistory: nextEventHistory,
        currentDecision: null,
        simulationRunning: month < 24,
        status: STATUSES.SIMULATION,
        resultFinalizing: false,
        sysMessage: month >= 24 ? "24개월 경영 시뮬레이션이 종료되었습니다. 교사가 최종 결과 버튼을 누르면 결과가 공개됩니다." : `${month}개월 차 이벤트: ${event.title}`
      });
      if (month >= 24) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setSimulationRunning(false);
        stopSimulationBgm();
      }
    }

    await advanceOneMonth();
    if (month >= 24) return;
    intervalRef.current = setInterval(advanceOneMonth, SIMULATION_SPEEDS[speed]?.delay || SIMULATION_EVENT_DELAY);
  }

  function pauseSimulation() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setSimulationRunning(false);
    pauseSimulationBgm();
    if (roomId) {
      updateDoc(doc(db, "rooms", roomId), {
        simulationRunning: false,
        sysMessage: "AI 경영 시뮬레이션을 일시정지했습니다."
      });
    }
  }

  function resumeSimulation() {
    if (room?.status !== STATUSES.SIMULATION || intervalRef.current) return;
    runSimulation(room.currentMonth || 0);
  }

  async function continueAfterDecision() {
    const nextTeams = Object.fromEntries(Object.entries(teams).map(([key, team]) => {
      const votes = Object.values(team.midDecision?.votes || {});
      const aCount = votes.filter((vote) => vote === "A").length;
      const bCount = votes.filter((vote) => vote === "B").length;
      const choice = aCount >= bCount ? "A" : "B";
      return [
        key,
        {
          ...team,
          currentAsset: choice === "A" ? Number(team.currentAsset || 0) - 20000000 : Number(team.currentAsset || 0),
          riskShield: choice === "A",
          riskDouble: choice === "B",
          midDecision: { ...(team.midDecision || {}), result: choice }
        }
      ];
    }));
    await updateDoc(doc(db, "rooms", roomId), {
      teams: nextTeams,
      currentDecision: null,
      sysMessage: "긴급 의사결정 결과를 반영했습니다. 시뮬레이션을 계속합니다."
    });
    runSimulation(room.currentMonth || 12);
  }

  async function resetRoom() {
    await setDoc(doc(db, "rooms", roomId), makeInitialRoom(roomId, room?.roomTitle || appSettings.defaultRoomTitle || "스타트업 히어로"));
  }

  async function requestAiEvaluation(team, apiKey = appSettings.geminiApiKey) {
    const prompt = [
      "너는 청소년 창업 평가 위원이야.",
      "아래 사업계획을 14가지 팩터(F01~F14)에 대해 각각 '양호', '보통', '취약' 중 하나로 판정해.",
      "입력 내용이 한 문장도 되지 않거나, 의미 없는 특수문자/반복문자/무작위 문자열이 대부분이거나, 사업 아이디어를 판단할 수 없을 정도로 지나치게 부실하면 모든 팩터를 반드시 '취약'으로 판정해.",
      "부실 입력으로 전체 취약 처리할 때는 각 reason에 '사업계획 내용이 부족하거나 의미를 판단하기 어려워 취약으로 판정했습니다.'라고 써.",
      "반드시 JSON만 출력해. 형식은 {\"factors\":{\"F01\":{\"grade\":\"양호\",\"reason\":\"한 줄 이유\"}},\"opinion\":\"1~2줄 총평\"}.",
      `팩터: ${BUSINESS_FACTORS.map((factor) => `${factor.id} ${factor.name}: ${factor.description}`).join(" / ")}`,
      `팀명: ${team.teamName}`,
      `트렌드: ${team.trendCard?.title || "미선택"}`,
      `기술카드: ${team.techCard?.title || "미선택"}`,
      `제품 및 서비스명: ${team.idea?.serviceName || "-"}`,
      `문제정의: ${team.idea?.problem || "-"}`,
      `고객정의: ${(team.idea?.customers || []).join(", ") || "-"}`,
      `해결 아이디어: ${team.idea?.solution || "-"}`,
      `제품/서비스 설명: ${team.idea?.product || "-"}`,
      `수익모델: ${(team.idea?.revenueModels || []).join(", ") || "-"}`,
      `마케팅 전략: ${(team.idea?.marketingStrategies || []).join(", ") || "-"}`,
      `한 줄 표현: ${team.idea?.tagline || "-"}`
    ].join("\n");

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey.trim() || appSettings.geminiApiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.25 }
      })
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Gemini 응답 오류 ${response.status}${errorText ? `: ${errorText.slice(0, 180)}` : ""}`);
    }
    const payload = await response.json();
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    return normalizeAiEvaluation(JSON.parse(stripJsonFence(text)));
  }

  if (!roomId) {
    return (
      <LandingPage
        appSettings={appSettings}
        roomTitle={roomTitle}
        setRoomTitle={setRoomTitle}
        joinCode={joinCode}
        setJoinCode={setJoinCode}
        actionError={actionError}
        creating={creating}
        createRoom={createRoom}
        joinAsStudent={joinAsStudent}
      />
    );
  }

  if (loading) return <div className="p-8">방 정보를 불러오는 중입니다.</div>;
  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!room) return <div className="p-8">존재하지 않는 방입니다. <Link className="font-bold text-indigo-600" to="/">메인으로 이동</Link></div>;

  return (
    <section className="mx-auto max-w-7xl px-5 py-6">
      <header className="admin-topbar">
        <div className="bizquest-brand" aria-label="비즈퀘스트">
          <span className="bizquest-mark"><b>B</b><Rocket size={38} /></span>
          <span>
            <span className="bizquest-name"><b>BIZ</b> 퀘스트</span>
            <span className="bizquest-tagline">아이디어를 창업으로, 가능성을 현실로</span>
          </span>
        </div>
        <div className="admin-room-meta">
          <span><FileText size={22} /><b>방 제목</b>{room.roomTitle}</span>
          <span><Hash size={24} /><b>방 코드</b>{roomId}</span>
          <span><Flag size={22} /><b>현재단계</b>{STATUS_LABELS[room.status]}</span>
          <button onClick={resetRoom} className="phase-reset"><RotateCcw size={17} /> 초기화</button>
        </div>
      </header>

      {room.sysMessage && <div className="event-notice ticker-pulse mt-4"><Megaphone size={24} /><div><p>진행 안내</p><strong>{room.sysMessage}</strong></div></div>}
      <PhaseRail currentStatus={room.status} onPhaseClick={handlePhaseClick} />
      {room.resultFinalizing && <ResultFinalizingShowcase />}
      <FanfareOnResult status={room.status} />

      <div className="mt-6 grid gap-5 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-5">
          <div className={`qr-panel rounded-lg bg-white p-5 shadow-lift ${qrCollapsed ? "qr-panel-collapsed" : ""}`}>
            <button onClick={() => setQrCollapsed(!qrCollapsed)} className="qr-toggle" type="button">
              <span>학생 입장 QR</span>
              {qrCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </button>
            {!qrCollapsed && (
              <>
                <div className="mt-4 flex justify-center rounded-lg bg-white p-3"><QRCodeSVG value={studentUrl} size={190} /></div>
                <p className="mt-3 break-all text-xs text-slate-500">{studentUrl}</p>
                <button onClick={() => setQrOpen(true)} className="touch-button mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 font-bold text-white"><Maximize2 size={18} /> 크게 보기</button>
              </>
            )}
          </div>
          <div className="rounded-lg bg-white p-5 shadow-lift">
            <h2 className="flex items-center gap-2 font-black"><Users size={18} /> 참가자 대기실</h2>
            <div className="mt-3 space-y-2">
              {Object.entries(students).filter(([, student]) => !student.team).map(([uid, student]) => <div key={uid} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className={`grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br ${getAvatarColor(uid)} text-xs font-black text-white shadow-sm`}>{student.nickname?.slice(0, 1) || "?"}</span><span className="font-semibold">{student.nickname}</span></div>)}
              {Object.values(students).filter((student) => !student.team).length === 0 && <p className="text-sm text-slate-500">대기 중인 학생이 없습니다.</p>}
            </div>
          </div>
          {room.status === STATUSES.RESULT && <button onClick={() => window.print()} className="print:hidden touch-button inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 font-bold text-white"><FileDown size={18} /> 수업 결과 PDF 저장</button>}
        </aside>
        <div className="print-main space-y-5">
          <TeamGrid roomStatus={room.status} teams={teams} students={students} onSetLeader={setLeader} onRenameTeam={renameTeam} onAddTeam={addTeam} onDeleteTeam={deleteTeam} onLockPlan={lockBusinessPlan} onOpenPlan={setPlanTeam} onOpenOpinion={setOpinionTeam} />
          {investmentChartVisible && <InvestmentChart teams={teams} />}
          {room.status === STATUSES.RESULT && (
            <div ref={resultBoardRef}>
              <ResultBoard rankedTeams={rankedTeams} teams={teams} students={students} room={room} />
            </div>
          )}
        </div>
      </div>
      {qrOpen && <QrModal value={studentUrl} roomId={roomId} onClose={() => setQrOpen(false)} />}
      {aiConfirmOpen && <AiConfirmModal onCancel={() => setAiConfirmOpen(false)} onConfirm={() => { setAiConfirmOpen(false); evaluateBusinessPlans(); }} />}
      {planTeam && <BusinessPlanModal team={planTeam} onClose={() => setPlanTeam(null)} />}
      {opinionTeam && <AiOpinionModal team={opinionTeam} onClose={() => setOpinionTeam(null)} />}
      {room.aiEvaluationStatus === "evaluating" && <AiEvaluationShowcase />}
      {room.status === STATUSES.SIMULATION && room.currentEvent && Number(room.currentMonth || 0) < 24 && (
        <AdminEventShowcase
          event={room.currentEvent}
          month={room.currentMonth || 0}
          running={Boolean(simulationRunning || room.simulationRunning)}
          onPause={pauseSimulation}
          onResume={resumeSimulation}
        />
      )}
    </section>
  );
}

function getStudentOrigin(localNetworkHost) {
  const { protocol, hostname, port, origin } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${localNetworkHost || hostname}${port ? `:${port}` : ""}`;
  }
  return origin;
}

function TeamGrid({ roomStatus, teams, students, onSetLeader, onRenameTeam, onAddTeam, onDeleteTeam, onLockPlan, onOpenPlan, onOpenOpinion }) {
  const maxInvestment = Math.max(1, ...Object.values(teams).map((team) => Number(team.investmentsReceived || 0)));
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-black">팀 구성 현황</h2>
        <button onClick={onAddTeam} className="print:hidden touch-button inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white"><Plus size={16} /> 팀 추가</button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {getTeamEntries(teams).map(([key, team]) => {
          const cardSelectionComplete = Boolean(team.trendCard && team.techCard);
          const members = getStudentsByTeam(students, key).sort((a, b) => {
            if (a.uid === team.leaderId) return -1;
            if (b.uid === team.leaderId) return 1;
            return String(a.nickname || "").localeCompare(String(b.nickname || ""), "ko");
          });
          return (
            <section key={key} className="rounded-lg bg-white p-4 shadow-lift">
              <div className="flex items-center gap-2">
                <input key={`${key}-${team.teamName}`} defaultValue={team.teamName} onBlur={(event) => onRenameTeam(key, event.target.value)} className="min-w-0 flex-1 rounded-lg border border-transparent bg-slate-50 px-3 py-2 text-lg font-black focus:border-indigo-500 focus:outline-none" />
                <button title="팀 삭제" onClick={() => onDeleteTeam(key)} className="print:hidden touch-button grid w-12 place-items-center rounded-lg bg-rose-50 text-rose-600"><Trash2 size={18} /></button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {members.map((student) => (
                  <button key={student.uid} onClick={() => onSetLeader(student.uid, key)} className={`team-member-chip ${team.leaderId === student.uid ? "team-member-chip-leader" : ""}`}>
                    {team.leaderId === student.uid && <Crown size={14} className="text-amber-500" />}
                    {student.nickname}
                    {student.cLevelResult?.key && <span className={`c-level-mini-badge c-level-mini-${student.cLevelResult.key}`}>{student.cLevelResult.key}</span>}
                  </button>
                ))}
                {members.length === 0 && <span className="text-sm text-slate-400">팀원을 기다리는 중</span>}
              </div>
              <div className={`mt-4 rounded-lg p-3 text-sm ${cardSelectionComplete ? "admin-card-selection-complete" : "bg-slate-50 text-slate-600"}`}>
                {cardSelectionComplete ? (
                  <div className="admin-card-selection-body">
                    <div className="admin-card-selection-badge">
                      <CheckCircle2 size={18} />
                      <span>선택 확정 완료</span>
                    </div>
                    <div className="admin-card-selection-items">
                      <p><LineChart size={15} /> <b>트렌드</b><span>{team.trendCard.title}</span></p>
                      <p><Cpu size={15} /> <b>기술카드</b><span>{team.techCard.title}</span></p>
                    </div>
                  </div>
                ) : (
                  <>
                    <p>트렌드: {team.trendCard ? <><CheckCircle2 size={14} className="mr-1 inline text-emerald-600" />{team.trendCard.title}</> : "미선택"}</p>
                    <p>기술카드: {team.techCard ? <><CheckCircle2 size={14} className="mr-1 inline text-emerald-600" />{team.techCard.title}</> : "미선택"}</p>
                  </>
                )}
                <div className="print:hidden mt-3 grid grid-cols-[1fr_auto] gap-2">
                  <button type="button" disabled={!team.idea || team.ideaSubmitted === false} onClick={() => onOpenPlan({ key, ...team })} className="touch-button rounded-lg bg-indigo-600 px-3 py-2 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-400">{team.idea && team.ideaSubmitted !== false ? "사업계획 등록 완료!" : "사업계획서 미등록"}</button>
                  <button type="button" disabled={!team.idea || team.ideaSubmitted === false || team.ideaLocked} onClick={() => onLockPlan(key)} className="touch-button rounded-lg bg-slate-900 px-3 py-2 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-400">{team.ideaLocked ? "확정됨" : "확정"}</button>
                </div>
                <InvestmentGauge investment={team.investmentsReceived || 0} maxInvestment={maxInvestment} />
                <AiEvaluationSummary team={team} onOpenOpinion={() => onOpenOpinion({ key, ...team })} />
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
function PhaseRail({ currentStatus, onPhaseClick }) {
  return (
    <nav className="phase-rail mt-5" aria-label="진행 단계">
      {PHASES.map((phase, index) => {
        const Icon = PHASE_ICONS[phase] || Play;
        return (
          <button key={phase} type="button" onClick={() => onPhaseClick(phase)} className={`phase-rail-button ${currentStatus === phase ? "phase-rail-button-active" : ""}`}>
            <span className="phase-rail-number">{index + 1}</span>
            <Icon className="phase-rail-icon" size={42} />
            <b>{phase === STATUSES.CARD_SELECT ? <><span>트렌드 및</span><span>기술카드 선택</span></> : STATUS_LABELS[phase]}</b>
          </button>
        );
      })}
    </nav>
  );
}

function ResultFinalizingShowcase() {
  return createPortal((
    <div className="event-showcase ai-evaluation-showcase result-finalizing-showcase">
      <div className="event-spark event-spark-one" />
      <div className="event-spark event-spark-two" />
      <div className="event-showcase-stage ai-evaluation-stage">
        <div className="event-showcase-copy event-showcase-copy-active">
          <p>최종 결과</p>
          <h2>최종결과 집계중...</h2>
          <span>잠시 후 최종 순위와 사업 리포트가 공개됩니다</span>
        </div>
        <div className="ai-evaluation-loader" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  ), document.body);
}

function FanfareOnResult({ status }) {
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current !== STATUSES.RESULT && status === STATUSES.RESULT) playFanfare();
    previous.current = status;
  }, [status]);
  return null;
}

function AdminEventShowcase({ event, month, running, onPause, onResume }) {
  const factor = BUSINESS_FACTORS.find((item) => item.id === event.factor);
  useEffect(() => {
    playWhoosh();
  }, [event.id, month]);
  return createPortal((
    <div className={`event-showcase event-showcase-admin ${running ? "" : "event-showcase-paused"}`}>
      <button
        type="button"
        onClick={running ? onPause : onResume}
        className={`event-showcase-control ${running ? "event-showcase-control-pause" : "event-showcase-control-play"}`}
      >
        {running ? <><Pause size={22} /> PAUSE</> : <><Play size={22} /> PLAY</>}
      </button>
      <div className="event-spark event-spark-one" />
      <div className="event-spark event-spark-two" />
      <div className="event-showcase-stage">
        <div key={`copy-${month}-${event.id}`} className="event-showcase-copy event-showcase-copy-active">
          <p>{month}개월 차 랜덤 이벤트</p>
          <h2>{event.title}</h2>
          <span>{event.factor} · {factor?.name || "비즈니스 팩터"}</span>
        </div>
        <EventCardVisual key={`card-${month}-${event.id}`} event={event} />
      </div>
    </div>
  ), document.body);
}

function AiEvaluationShowcase() {
  return createPortal((
    <div className="event-showcase ai-evaluation-showcase">
      <div className="event-spark event-spark-one" />
      <div className="event-spark event-spark-two" />
      <div className="event-showcase-stage ai-evaluation-stage">
        <div className="event-showcase-copy event-showcase-copy-active">
          <p>사업계획 AI 평가</p>
          <h2>지금 모두의 사업계획을<br />비즈니스 전문 AI가 평가중입니다...</h2>
          <span>잠시 후 팀별 평가 결과가 공개됩니다</span>
        </div>
        <div className="ai-evaluation-loader" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  ), document.body);
}

function AdminEventReviewShowcase({ entries }) {
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(Math.max(0, entries.length - 1));
  const entry = entries[index];
  const factor = BUSINESS_FACTORS.find((item) => item.id === entry?.event?.factor);

  useEffect(() => {
    setIndex(Math.max(0, entries.length - 1));
  }, [entries.length]);

  if (!open || !entry?.event) return null;

  function move(direction) {
    setIndex((current) => Math.max(0, Math.min(entries.length - 1, current + direction)));
  }

  return createPortal((
    <div className="event-showcase event-showcase-admin event-review-showcase">
      <button type="button" onClick={() => setOpen(false)} className="event-review-close">리뷰 닫기</button>
      <button type="button" onClick={() => move(-1)} disabled={index <= 0} className="event-review-arrow event-review-arrow-left" title="이전 이벤트">
        <ChevronLeft size={42} />
      </button>
      <button type="button" onClick={() => move(1)} disabled={index >= entries.length - 1} className="event-review-arrow event-review-arrow-right" title="다음 이벤트">
        <ChevronRight size={42} />
      </button>
      <div className="event-spark event-spark-one" />
      <div className="event-spark event-spark-two" />
      <div className="event-showcase-stage">
        <div key={`review-copy-${index}-${entry.event.id}`} className="event-showcase-copy event-showcase-copy-active">
          <p>{entry.month}개월 차 이벤트 리뷰</p>
          <h2>{entry.event.title}</h2>
          <span>{entry.event.factor} · {factor?.name || "비즈니스 팩터"}</span>
        </div>
        <EventCardVisual key={`review-card-${index}-${entry.event.id}`} event={entry.event} />
      </div>
    </div>
  ), document.body);
}

function EventCardVisual({ event, children }) {
  const image = getEventImage(event);
  return (
    <div className="event-card-visual">
      {image ? (
        <img src={image} alt={event.title} />
      ) : (
        <div className="event-card-fallback">
          <strong>{event.id}</strong>
          <span>{event.title}</span>
        </div>
      )}
      {children}
    </div>
  );
}

function getEventImage(event) {
  return eventCardImages[event?.id] || "";
}

function EventImageModal({ event, onClose }) {
  return createPortal((
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-slate-950/80 p-5" onClick={onClose}>
      <div className="w-full max-w-md" onClick={(clickEvent) => clickEvent.stopPropagation()}>
        <img src={getEventImage(event)} alt={event.title} className="mx-auto max-h-[86vh] rounded-lg object-contain shadow-lift" />
        <button type="button" onClick={onClose} className="touch-button mt-4 w-full rounded-lg bg-white px-4 py-3 font-black text-slate-900">닫기</button>
      </div>
    </div>
  ), document.body);
}

function AiConfirmModal({ onCancel, onConfirm }) {
  return createPortal((
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-slate-950/70 p-5">
      <article className="w-full max-w-md rounded-lg bg-white p-6 text-center shadow-lift">
        <p className="text-sm font-bold text-indigo-600">사업계획 AI 평가</p>
        <h2 className="mt-2 text-3xl font-black">AI 분석을 시작할까요?</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">시작하면 제출된 사업계획을 기준으로 비즈니스 전문 AI 평가가 진행됩니다.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="touch-button rounded-lg bg-slate-100 px-4 py-3 font-black text-slate-700">취소</button>
          <button type="button" onClick={onConfirm} className="touch-button rounded-lg bg-indigo-600 px-4 py-3 font-black text-white">시작</button>
        </div>
      </article>
    </div>
  ), document.body);
}

function AiEvaluationSummary({ team, onOpenOpinion }) {
  const [expanded, setExpanded] = useState(true);
  const evaluation = team.aiEvaluation;
  if (!evaluation) {
    return <div className="mt-3 rounded-lg bg-slate-100 px-3 py-3 text-xs font-bold text-slate-500">AI 평가 대기</div>;
  }
  const isFallback = String(evaluation.model || "").includes("fallback");
  return (
    <div className="mt-3 rounded-lg bg-white/80 p-3 ring-1 ring-slate-200">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-black text-slate-600">AI 평가 결과</p>
        <div className="print:hidden flex gap-1">
          <button type="button" onClick={() => setExpanded(!expanded)} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">{expanded ? "접기" : "펼치기"}</button>
          <button type="button" onClick={onOpenOpinion} className="rounded-full bg-slate-900 px-3 py-1 text-xs font-black text-white">상세보기</button>
        </div>
      </div>
      {expanded && (
        <div className="ai-evaluation-body">
          <p className="mb-2 rounded-lg bg-indigo-50 p-3 text-xs font-bold leading-5 text-indigo-800">{evaluation.opinion || "평가 의견이 없습니다."}</p>
          {isFallback && (
            <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 ring-1 ring-amber-200">
              Gemini 응답 실패 - 기본 평가 기준 적용
            </div>
          )}
          <div className="ai-factor-grid">
            {BUSINESS_FACTORS.map((factor) => {
              const grade = evaluation.factors?.[factor.id]?.grade || "보통";
              return (
                <div key={factor.id} className="ai-factor-chip">
                  <span className="ai-factor-name">{factor.name}</span>
                  <span className={`ai-factor-grade ${gradeClassName(grade)}`}>{grade}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function InvestmentGauge({ investment, maxInvestment }) {
  const width = Math.max(4, (Number(investment || 0) / Math.max(1, Number(maxInvestment || 1))) * 100);
  return (
    <div className="mt-3 rounded-lg bg-white/80 p-3 ring-1 ring-slate-200">
      <div className="investment-gauge-summary">
        <p><span>기본자산</span><strong>{formatWon(TEAM_BASE_ASSET)}</strong></p>
        <p><span>투자유치</span><strong className="text-indigo-700">{formatWon(investment)}</strong></p>
      </div>
      <div className="h-4 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-cyan-400 to-emerald-400 transition-all" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function InvestmentChart({ teams }) {
  const max = Math.max(1, ...Object.values(teams).map((team) => Number(team.investmentsReceived || 0)));
  const sortedTeams = getTeamEntries(teams).sort(([, a], [, b]) => Number(b.investmentsReceived || 0) - Number(a.investmentsReceived || 0));
  return (
    <section className="rounded-lg bg-white p-5 shadow-lift">
      <h2 className="flex items-center gap-2 text-xl font-black"><BarChart3 size={20} /> 실시간 투자 유치</h2>
      <div className="mt-5 space-y-3">
        {sortedTeams.map(([key, team]) => (
          <div key={key} className="grid grid-cols-[90px_1fr_90px] items-center gap-3">
            <span className="truncate text-sm font-bold">{team.teamName}</span>
            <div className="h-8 overflow-hidden rounded-lg bg-slate-100 shadow-inner">
              <div className="h-full rounded-lg bg-gradient-to-r from-indigo-600 via-cyan-400 to-emerald-400 shadow-[0_8px_24px_rgba(91,78,230,0.35)] transition-all" style={{ width: `${Math.max(3, ((team.investmentsReceived || 0) / max) * 100)}%` }} />
            </div>
            <span className="text-right text-sm font-black">{formatWon(team.investmentsReceived || 0)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function BusinessPlanModal({ team, onClose }) {
  const idea = team.idea || {};
  return createPortal((
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 p-5" onClick={onClose}>
      <article className="max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-lift" onClick={(event) => event.stopPropagation()}>
        <p className="text-sm font-bold text-indigo-600">사업계획서</p>
        <h2 className="mt-1 text-3xl font-black">{team.teamName}</h2>
        <div className="mt-4 grid gap-3 text-sm leading-6 text-slate-700">
          <p><b>제품 및 서비스명:</b> {idea.serviceName || "-"}</p>
          <p><b>트렌드:</b> {team.trendCard?.title || "미선택"}</p>
          <p><b>기술카드:</b> {team.techCard?.title || "미선택"}</p>
          <p><b>문제정의:</b> {idea.problem || "-"}</p>
          <p><b>고객정의:</b> {(idea.customers || []).join(", ") || "-"}</p>
          <p><b>아이디어 도출:</b> {idea.solution || "-"}</p>
          <p><b>제품/서비스 설명:</b> {idea.product || "-"}</p>
          <p><b>수익모델:</b> {(idea.revenueModels || []).join(", ") || "-"}</p>
          <p><b>마케팅 전략:</b> {(idea.marketingStrategies || []).join(", ") || "-"}</p>
          <p><b>한 줄 표현:</b> {idea.tagline || "-"}</p>
        </div>
        <button onClick={onClose} className="touch-button mt-5 w-full rounded-lg bg-slate-900 px-4 py-3 font-bold text-white">닫기</button>
      </article>
    </div>
  ), document.body);
}

function AiOpinionModal({ team, onClose }) {
  const evaluation = team.aiEvaluation;
  const isFallback = String(evaluation?.model || "").includes("fallback");
  return createPortal((
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 p-5" onClick={onClose}>
      <article className="max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-lift" onClick={(event) => event.stopPropagation()}>
        <p className="text-sm font-bold text-indigo-600">AI 평가의견</p>
        <h2 className="mt-1 text-3xl font-black">{team.teamName}</h2>
        {isFallback && (
          <div className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm font-black text-amber-700 ring-1 ring-amber-200">
            Gemini 호출 실패로 기본 평가를 표시합니다. {evaluation?.errorMessage || evaluation?.model || ""}
          </div>
        )}
        <p className="mt-3 rounded-lg bg-indigo-50 p-4 text-sm font-bold leading-6 text-indigo-800">{evaluation?.opinion || "아직 평가 의견이 없습니다."}</p>
        <div className="mt-4 grid gap-2">
          {BUSINESS_FACTORS.map((factor) => {
            const item = evaluation?.factors?.[factor.id];
            return (
              <div key={factor.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between gap-2"><b>{factor.name}</b><span className={`rounded-full px-3 py-1 text-xs font-black ${gradeClassName(item?.grade || "보통")}`}>{item?.grade || "보통"}</span></div>
                <p className="mt-1 text-slate-600">{item?.reason || factor.description}</p>
              </div>
            );
          })}
        </div>
        <button onClick={onClose} className="touch-button mt-5 w-full rounded-lg bg-slate-900 px-4 py-3 font-bold text-white">닫기</button>
      </article>
    </div>
  ), document.body);
}

function ResultBoard({ rankedTeams, teams, students, room }) {
  const winner = rankedTeams[0];
  return (
    <section className="print-report rounded-lg bg-white p-5 shadow-lift">
      <h2 className="text-xl font-black">최종 순위 및 사업 리포트</h2>
      <p className="mt-1 hidden text-sm text-slate-500 print:block">{room.roomTitle} · 참가자 {Object.keys(students).length}명</p>
      {winner && (
        <article className="winner-report-card mt-4 overflow-hidden rounded-lg bg-gradient-to-br from-amber-300 via-orange-500 to-rose-600 p-1 shadow-[0_18px_45px_rgba(245,158,11,0.35)]">
          <div className="rounded-lg bg-white/95 p-5">
            <div className="winner-crown-badge"><Crown size={42} /><span>1위 팀</span></div>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-4xl font-black text-slate-950">{winner.teamName}</h3>
                <p className="mt-2 text-sm font-bold text-slate-600">{winner.idea?.serviceName || winner.idea?.product || "사업 아이디어"}</p>
              </div>
              <AssetChangeSummary team={winner} featured />
            </div>
            <AssetTrendChart team={winner} className="mt-4" />
          </div>
        </article>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {rankedTeams.slice(0, 3).map((team, index) => (
          <div key={team.key} className={`rounded-lg p-4 text-center ${index === 0 ? "bg-amber-50 ring-2 ring-amber-300" : "bg-slate-50"}`}>
            <p className={`text-3xl font-black ${index === 0 ? "text-amber-600" : "text-indigo-600"}`}>{index + 1}위</p>
            <p className="mt-2 font-black">{team.teamName}</p>
            <p className={`text-sm ${index === 0 ? "font-black text-slate-950" : Number(team.currentAsset || 0) < 0 ? "font-bold text-rose-600" : "text-slate-500"}`}>{formatWon(team.currentAsset || 0)}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-3">
        {rankedTeams.map((team, index) => (
          <article key={team.key} className={`rounded-lg border p-4 ${index === 0 ? "border-amber-300 bg-amber-50/60" : "border-slate-200"}`}>
            <div className="flex items-center justify-between gap-3"><h3 className="font-black">{index + 1}. {team.teamName}</h3><span className={`font-black ${index === 0 ? "text-amber-700" : Number(team.currentAsset || 0) < 0 ? "text-rose-600" : "text-indigo-600"}`}>{formatWon(team.currentAsset || 0)}</span></div>
            <AssetChangeSummary team={team} className="mt-3" />
            <div className="mt-3 flex flex-wrap gap-2">
              {getStudentsByTeam(students, team.key).map((member) => (
                <span key={member.uid} className="rounded-full bg-white px-3 py-2 text-xs font-black text-slate-700 ring-1 ring-slate-200">{member.nickname}</span>
              ))}
            </div>
            <p className="mt-2 text-sm text-slate-600">트렌드: {team.trendCard?.title || "미선택"}</p>
            <p className="mt-1 text-sm text-slate-600">기술카드: {team.techCard?.title || "미선택"}</p>
            <p className="mt-1 text-sm text-slate-600">아이디어: {team.idea?.product || team.idea?.solution || "-"}</p>
            <AssetTrendChart team={team} className="mt-4" />
          </article>
        ))}
      </div>
    </section>
  );
}

function AssetChangeSummary({ team, featured = false, className = "" }) {
  const initial = Number(team.initialCapital || TEAM_BASE_ASSET + Number(team.investmentsReceived || 0));
  const final = Number(team.currentAsset || 0);
  const rate = initial ? ((final - initial) / initial) * 100 : 0;
  const positive = rate >= 0;
  return (
    <div className={`asset-change-summary ${featured ? "asset-change-summary-featured" : ""} ${className}`}>
      <div>
        <p>최초 총 자산</p>
        <strong>{formatWon(initial)}</strong>
      </div>
      <div>
        <p>최종 총 자산</p>
        <strong>{formatWon(final)}</strong>
      </div>
      <div className={positive ? "asset-change-positive" : "asset-change-negative"}>
        <p>증감율</p>
        <strong>{positive ? "+" : ""}{rate.toFixed(1)}%</strong>
      </div>
    </div>
  );
}

function AssetTrendChart({ team, className = "" }) {
  const history = normalizeAssetHistory(team);
  const width = 520;
  const height = 150;
  const padding = 18;
  const values = history.map((point) => point.asset);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = history.map((point, index) => {
    const x = padding + (index / Math.max(1, history.length - 1)) * (width - padding * 2);
    const y = height - padding - ((point.asset - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(" ");
  const last = history[history.length - 1];

  return (
    <div className={`rounded-lg bg-white p-3 ring-1 ring-slate-200 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-black text-slate-500">24개월 총 자산 변동 추이</p>
        <p className="text-xs font-black text-indigo-700">{last?.month || 0}개월 · {formatWon(last?.asset || 0)}</p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full overflow-visible">
        <defs>
          <linearGradient id={`line-${team.teamId || team.key}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="50%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        {[0, 1, 2].map((line) => (
          <line key={line} x1={padding} x2={width - padding} y1={padding + line * 52} y2={padding + line * 52} stroke="#e2e8f0" strokeWidth="1" />
        ))}
        <polyline points={points} fill="none" stroke={`url(#line-${team.teamId || team.key})`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        {history.map((point, index) => {
          if (index !== 0 && index !== history.length - 1 && point.month % 6 !== 0) return null;
          const [x, y] = points.split(" ")[index].split(",").map(Number);
          return <circle key={point.month} cx={x} cy={y} r="4" fill="#0f172a" />;
        })}
      </svg>
    </div>
  );
}

function normalizeAssetHistory(team) {
  const history = Array.isArray(team.assetHistory) && team.assetHistory.length > 1
    ? team.assetHistory
    : [
        { month: 0, asset: Number(team.initialCapital || TEAM_BASE_ASSET) },
        { month: 24, asset: Number(team.currentAsset || team.initialCapital || TEAM_BASE_ASSET) }
      ];
  const sampled = history.filter((point, index) => {
    const month = Number(point.month || 0);
    return month % 2 === 0 || index === history.length - 1;
  });
  return sampled.map((point) => ({
    month: Number(point.month || 0),
    asset: Number(point.asset || 0)
  }));
}

function QrModal({ value, roomId, onClose }) {
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-slate-950/80 p-5">
      <div className="w-full max-w-xl rounded-lg bg-white p-6 text-center shadow-lift">
        <p className="text-sm font-bold text-indigo-600">학생 입장 QR</p>
        <h2 className="mt-1 text-3xl font-black">방 코드 {roomId}</h2>
        <div className="mt-6 flex justify-center"><QRCodeSVG value={value} size={360} /></div>
        <p className="mt-4 break-all text-sm text-slate-500">{value}</p>
        <button onClick={onClose} className="touch-button mt-5 w-full rounded-lg bg-slate-900 px-4 py-3 font-bold text-white">닫기</button>
      </div>
    </div>
  );
}

function stripJsonFence(text) {
  return String(text || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

function makeAiEvaluationMessage(evaluations = {}) {
  const values = Object.values(evaluations);
  const fallbackCount = values.filter((evaluation) => String(evaluation?.model || "").includes("fallback")).length;
  const geminiCount = Math.max(0, values.length - fallbackCount);
  if (fallbackCount > 0) {
    return `AI 평가 완료: Gemini 성공 ${geminiCount}팀, 기본 평가 적용 ${fallbackCount}팀. 평가의견에서 실패 사유를 확인하세요.`;
  }
  return `AI 사업계획서 평가가 완료되었습니다. 팀 패널에서 14개 지표와 1~2줄 종합의견을 확인하세요.`;
}

function normalizeAiEvaluation(raw) {
  const factors = {};
  for (const factor of BUSINESS_FACTORS) {
    const item = raw?.factors?.[factor.id] || {};
    const grade = AI_GRADES.includes(item.grade) ? item.grade : "보통";
    factors[factor.id] = {
      grade,
      reason: String(item.reason || factor.description).slice(0, 80)
    };
  }
  return {
    factors,
    opinion: String(raw?.opinion || "사업계획의 강점과 보완점을 바탕으로 경영 시뮬레이션을 진행합니다.").slice(0, 160),
    evaluatedAt: Date.now(),
    model: "gemini-2.5-flash"
  };
}

function makeFallbackAiEvaluation(team, error) {
  const ideaText = [
    team.trendCard?.title,
    team.techCard?.title,
    team.idea?.serviceName,
    team.idea?.problem,
    ...(team.idea?.customers || []),
    team.idea?.solution,
    team.idea?.product,
    ...(team.idea?.revenueModels || []),
    ...(team.idea?.marketingStrategies || []),
    team.idea?.tagline
  ].join(" ");

  const hasAny = (...words) => words.some((word) => ideaText.includes(word));
  const factors = {};
  for (const factor of BUSINESS_FACTORS) {
    let grade = "보통";
    if (factor.id === "F03" && hasAny("앱", "AI", "온라인", "플랫폼", "서비스")) grade = "양호";
    if (factor.id === "F05" && hasAny("온라인", "앱", "AI", "스마트폰", "플랫폼", "배송")) grade = "양호";
    if (factor.id === "F06" && hasAny("AI", "앱", "디지털", "스마트폰", "플랫폼", "자동")) grade = "양호";
    if (factor.id === "F07" && (team.idea?.customers || []).length > 0) grade = "양호";
    if (factor.id === "F11" && hasAny("인스타", "틱톡", "유튜브", "입소문", "인플루언서", "콘텐츠")) grade = "양호";
    if (factor.id === "F12" && hasAny("구독", "정기", "관리", "커뮤니티", "프리미엄")) grade = "양호";
    if (factor.id === "F04" && hasAny("제품 판매", "포장", "배달", "푸드", "제조")) grade = "취약";
    if (factor.id === "F08" && hasAny("사람", "오프라인", "매장", "교육", "돌봄")) grade = "취약";
    if (factor.id === "F10" && hasAny("여행", "오프라인", "배달", "매장", "야외")) grade = "취약";
    factors[factor.id] = {
      grade,
      reason: `${factor.name} 관점에서 사업계획의 핵심 키워드를 기준으로 ${grade}로 판정했습니다.`
    };
  }
  return {
    factors,
    opinion: `Gemini 응답 문제로 기본 평가 기준을 적용했습니다. ${team.idea?.serviceName || team.idea?.product || "이 아이디어"}는 강점 지표를 살리고 취약 지표를 보완해야 합니다.`,
    evaluatedAt: Date.now(),
    model: "gemini-2.5-flash-fallback",
    errorMessage: String(error?.message || "unknown").slice(0, 240)
  };
}

function gradeClassName(grade) {
  if (grade === "양호") return "bg-emerald-100 text-emerald-800";
  if (grade === "취약") return "bg-rose-100 text-rose-800";
  return "bg-amber-100 text-amber-800";
}

function playFanfare() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const now = context.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.51];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index % 2 === 0 ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.22, now + index * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.12 + 0.28);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + index * 0.12);
      oscillator.stop(now + index * 0.12 + 0.3);
    });
    window.setTimeout(() => context.close().catch(() => {}), 1600);
  } catch {
    // Browser autoplay policies can block audio until the user interacts.
  }
}

function playWhoosh() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(900, now);
    oscillator.frequency.exponentialRampToValueAtTime(140, now + 0.32);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2600, now);
    filter.frequency.exponentialRampToValueAtTime(360, now + 0.32);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.38);
    window.setTimeout(() => context.close().catch(() => {}), 700);
  } catch {
    // Browser autoplay policies can block audio until the user interacts.
  }
}

