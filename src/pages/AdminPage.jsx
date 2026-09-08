import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowRight,
  Award,
  BarChart3,
  Building2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ClipboardCheck,
  Cpu,
  Crown,
  FileDown,
  FileText,
  Flag,
  Gamepad2,
  GraduationCap,
  Hash,
  KeyRound,
  LayoutDashboard,
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
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trophy,
  Trash2,
  Users
} from "lucide-react";
import { collection, db, getCurrentIdToken, getDoc, getDocs, setDoc, updateDoc } from "../firebase.js";
import { BUSINESS_FACTORS, STATUSES, STATUS_LABELS } from "../data/gameData.js";
import {
  SIMULATION_MONTHS,
  TEAM_BASE_ASSET,
  applyRiskMultiplier,
  buildResultInsights,
  getPivotScenario,
  makePivotTeamPatch,
  rankInvestors,
  resolvePivotVote,
  drawEvent,
  formatWon,
  getAvatarColor,
  getStudentsByTeam,
  getTeamBaseAsset,
  getTeamEntries,
  getTeamStartingCapital,
  getAssetChange,
  countAiGrades,
  makeInitialRoom,
  makeNextTeamKey,
  makeRoomId,
  makeTeam,
  normalizeTeamName,
  rankTeams
} from "../lib/game.js";
import { PIVOT_SCENARIOS } from "../data/simulationSettings.js";
import { isFallbackEvaluation, makeFallbackAiEvaluation } from "../lib/aiEvaluation.js";
import { deleteRoomDeep, deleteTeamDeep, moveStudent, removeStudentDeep, resetRoomDeep } from "../lib/roomStore.js";
import { useAppSettings } from "../lib/appSettings.js";
import { roomDocRef, useRoom } from "../hooks/useRoom.js";
import { loginTeacher, logoutTeacher, registerTeacher, useTeacherAuth } from "../hooks/useTeacherAuth.js";
import simulationBgm from "../images/bgm01.mp3";
import bizQuestLogo from "../images/bizquest-logo.png";
import heroBackgroundImage from "../images/landing-hero-ai-v2.webp";
import processRoadmapImage from "../images/landing-process-roadmap.webp";
import { AiEvaluationShowcase, EventCardVisual, FanfareOnResult, ResultFinalizingShowcase, ResultFireworks } from "../components/shared/Effects.jsx";
import { AssetChangeSummary, AssetTrendChart, gradeClassName } from "../components/shared/AssetCharts.jsx";
import { installAudioUnlock, playWhoosh } from "../lib/audio.js";
import { MascotAvatar } from "../components/shared/MascotAvatar.jsx";
import { PHASE_TIMER_PRESETS_MIN, PhaseTimerDisplay } from "../components/shared/PhaseTimer.jsx";
import { buildFullCsv, buildRoomJson, downloadTextFile, safeFileName } from "../lib/exportReport.js";

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
/** Interval between simulated months. */
const SIMULATION_EVENT_DELAY = 5000;
/** Delay between announcing an event and applying its asset impact. */
const SIMULATION_EVENT_APPLY_DELAY = 4000;
/** Time before the result board is revealed after the teacher presses "최종 결과". */
const RESULT_FINALIZE_DELAY = 3000;
const SIMULATION_LEASE_TIMEOUT = 12000;
const AI_EVALUATION_LEASE_TIMEOUT = 15000;
const AI_HEARTBEAT_INTERVAL = 5000;

function makeAdminSessionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `admin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatSavedAt(value) {
  const timestamp = Number(value || 0);
  if (!timestamp) return "저장된 수업";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function SavedRoomsMenu({ rooms, loading, deletingRoomId, onResumeRoom, onDeleteRoom }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnOutsideClick(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="saved-rooms-menu" ref={menuRef}>
      <button
        type="button"
        className={`saved-rooms-trigger ${open ? "saved-rooms-trigger-open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <FileText size={17} />
        <span>저장된 수업</span>
        {!loading && rooms.length > 0 && <b>{rooms.length}</b>}
        <ChevronDown size={15} className="saved-rooms-chevron" />
      </button>
      {open && (
        <div className="saved-rooms-popover" role="menu" aria-label="저장된 수업">
          <div className="saved-rooms-popover-head">
            <span>
              <strong>수업 이어하기</strong>
              <small>마지막 저장 단계부터 바로 시작합니다.</small>
            </span>
            <span className="saved-rooms-count">{rooms.length}개</span>
          </div>
          <div className="saved-rooms-list">
            {loading && <p className="saved-rooms-empty">저장된 수업을 불러오는 중입니다.</p>}
            {!loading && rooms.map((savedRoom) => (
              <div className="saved-room-item" key={savedRoom.roomId} role="menuitem">
                <button
                  type="button"
                  className="saved-room-open"
                  onClick={() => {
                    setOpen(false);
                    onResumeRoom(savedRoom.roomId);
                  }}
                >
                  <span className="saved-room-icon"><Play size={15} /></span>
                  <span className="saved-room-copy">
                    <b>{savedRoom.roomTitle || savedRoom.roomId}</b>
                    <small>{savedRoom.roomId} · {STATUS_LABELS[savedRoom.status] || savedRoom.status}</small>
                  </span>
                  <time>{formatSavedAt(savedRoom.updatedAt || savedRoom.lastOpenedAt || savedRoom.createdAt)}</time>
                </button>
                <button
                  type="button"
                  className="saved-room-delete"
                  onClick={() => onDeleteRoom(savedRoom)}
                  disabled={deletingRoomId === savedRoom.roomId}
                  aria-label={`${savedRoom.roomTitle || savedRoom.roomId} 수업 삭제`}
                  title="저장된 수업 삭제"
                >
                  {deletingRoomId === savedRoom.roomId ? <span className="saved-room-spinner" /> : <Trash2 size={16} />}
                </button>
              </div>
            ))}
            {!loading && rooms.length === 0 && (
              <p className="saved-rooms-empty">저장된 수업이 아직 없습니다.<br />새 수업을 만들면 여기에 자동으로 저장됩니다.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LandingPage({ appSettings, roomTitle, setRoomTitle, joinCode, setJoinCode, actionError, creating, createRoom, joinAsStudent, authState, onOpenAuth, recentRooms, recentRoomsLoading, deletingRoomId, onResumeRoom, onDeleteRoom }) {
  const landing = appSettings.landing;
  const [quickStartTab, setQuickStartTab] = useState("teacher");
  const navTargets = ["intro", "features", "class-flow", "cases", "faq"];
  const featureIcons = [Gamepad2, Smartphone, LayoutDashboard];
  const useCaseIcons = [GraduationCap, Rocket, Building2];
  const flowIcons = [Users, Award, LineChart, Lightbulb, ClipboardCheck, PieChart, Cpu, Trophy];

  return (
    <section className="landing-page">
      <nav className="landing-nav">
        <a href="#top" className="landing-logo" aria-label="BizQuest home">
          <span><Rocket size={24} /></span>
          <strong>{landing.brandName}</strong>
        </a>
        <div className="landing-nav-actions">
          {landing.featureButtons.map((label, index) => (
            <a key={`${label}-${index}`} href={`#${navTargets[index] || "quick-start"}`}>{label}</a>
          ))}
        </div>
        <div className="landing-nav-account">
          {authState.loggedIn && (
            <SavedRoomsMenu
              rooms={recentRooms}
              loading={recentRoomsLoading}
              deletingRoomId={deletingRoomId}
              onResumeRoom={onResumeRoom}
              onDeleteRoom={onDeleteRoom}
            />
          )}
          <AuthBar authState={authState} onOpenAuth={onOpenAuth} />
        </div>
      </nav>

      <header id="top" className="landing-hero" style={{ "--landing-hero-image": `url(${heroBackgroundImage})` }}>
        <div className="landing-hero-copy">
          <p className="landing-kicker"><Sparkles size={17} /> {landing.heroBadge}</p>
          <h1>{landing.heroTitle}</h1>
          <p className="landing-lead">{landing.heroDescription}</p>
          <div className="landing-hero-buttons">
            <a href="#quick-start" className="landing-primary-button"><Rocket size={18} /> {landing.startLink}</a>
            <a href="#class-flow" className="landing-secondary-button"><ArrowRight size={18} /> {landing.flowLink}</a>
          </div>
          <div className="landing-stat-row">
            {landing.statItems.map((item) => (
              <span key={item.title}><b>{item.description}</b>{item.title}</span>
            ))}
          </div>
        </div>

        <div id="quick-start" className="landing-quick-start">
          <div className="landing-section-title">
            <p>{landing.sectionEyebrow}</p>
            <h2>{landing.sectionTitle}</h2>
          </div>
          <div className="landing-start-tabs" role="tablist" aria-label="빠른 시작 유형">
            <button
              type="button"
              role="tab"
              aria-selected={quickStartTab === "teacher"}
              className={quickStartTab === "teacher" ? "landing-start-tab landing-start-tab-active" : "landing-start-tab"}
              onClick={() => setQuickStartTab("teacher")}
            >
              <ShieldCheck size={16} />
              {landing.teacherTitle}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={quickStartTab === "student"}
              className={quickStartTab === "student" ? "landing-start-tab landing-start-tab-active" : "landing-start-tab"}
              onClick={() => setQuickStartTab("student")}
            >
              <KeyRound size={16} />
              {landing.studentTitle}
            </button>
          </div>
          <div className="landing-start-grid">
            {quickStartTab === "teacher" && (
            <section className="landing-start-card landing-start-card-primary">
              <div className="landing-start-head">
                <ShieldCheck size={32} />
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
            )}

            {quickStartTab === "student" && (
            <section className="landing-start-card">
              <div className="landing-start-head">
                <KeyRound size={32} />
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
            )}
          </div>
        </div>
      </header>

      <section id="intro" className="landing-section landing-intro">
        <div className="landing-section-title">
          <p>{landing.introEyebrow}</p>
          <h2>{landing.introTitle}</h2>
        </div>
        <div className="landing-intro-grid">
          <article className="landing-intro-copy">
            <h3>{landing.introQuote}</h3>
            <p>{landing.introBody}</p>
          </article>
          <div className="landing-value-panel">
            {landing.valueItems.map((item, index) => (
              <article key={item.title}>
                <span>{index + 1}</span>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="landing-section landing-muted-section">
        <div className="landing-section-title">
          <p>{landing.featureEyebrow}</p>
          <h2>{landing.featureTitle}</h2>
        </div>
        <div className="landing-card-grid">
          {landing.featureItems.map((item, index) => {
            const Icon = featureIcons[index % featureIcons.length];
            return (
              <article key={item.title} className="landing-info-card">
                <Icon size={26} />
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="class-flow" className="landing-section landing-process-section" style={{ "--landing-process-image": `url(${processRoadmapImage})` }}>
        <div className="landing-section-title">
          <p>{landing.processEyebrow}</p>
          <h2>{landing.processTitle}</h2>
          <span>{landing.processDescription}</span>
        </div>
        <div className="landing-flow-panel">
          {landing.flowSteps.map((label, index) => {
            const Icon = flowIcons[index % flowIcons.length];
            return (
              <button key={`${label}-${index}`} type="button" className="landing-flow-card">
                <span className="landing-flow-number">{index + 1}</span>
                <b className="landing-flow-badge"><Icon size={24} /></b>
                <strong>{label}</strong>
              </button>
            );
          })}
        </div>
      </section>

      <section id="cases" className="landing-section landing-muted-section">
        <div className="landing-section-title">
          <p>{landing.useCaseEyebrow}</p>
          <h2>{landing.useCaseTitle}</h2>
          <span>{landing.useCaseDescription}</span>
        </div>
        <div className="landing-card-grid">
          {landing.useCases.map((item, index) => {
            const Icon = useCaseIcons[index % useCaseIcons.length];
            return (
              <article key={item.title} className="landing-info-card landing-case-card">
                <Icon size={26} />
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                {item.quote && <blockquote>{item.quote}</blockquote>}
              </article>
            );
          })}
        </div>
      </section>

      <section id="faq" className="landing-section">
        <div className="landing-section-title">
          <p>{landing.faqEyebrow}</p>
          <h2>{landing.faqTitle}</h2>
        </div>
        <div className="landing-faq-list">
          {landing.faqs.map((item) => (
            <details key={item.title}>
              <summary>{item.title}<ChevronDown size={18} /></summary>
              <p>{item.description}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="landing-cta">
        <div>
          <h2>{landing.ctaTitle}</h2>
          <p>{landing.ctaDescription}</p>
        </div>
        <a href="#quick-start" className="landing-primary-button"><Rocket size={18} /> {landing.ctaButton}</a>
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

function AuthBar({ authState, onOpenAuth }) {
  async function handleLogout() {
    await logoutTeacher();
    window.alert("정상적으로 로그아웃 되었습니다");
  }

  if (authState?.loggedIn) {
    return (
      <div className="teacher-auth-badge">
        <span>{authState.teacherId || authState.user?.displayName || "teacher"}</span>
        <button type="button" onClick={handleLogout}>로그아웃</button>
      </div>
    );
  }
  return (
    <div className="teacher-auth-actions">
      <button type="button" onClick={() => onOpenAuth("login")}>로그인</button>
      <button type="button" onClick={() => onOpenAuth("signup")}>회원가입</button>
    </div>
  );
}

function AuthModal({ mode, onClose }) {
  const [modalMode, setModalMode] = useState(mode);
  const [form, setForm] = useState({ id: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const isSignup = modalMode === "signup";

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (isSignup) {
        await registerTeacher(form);
        await logoutTeacher();
        window.alert("회원가입 완료! 이제 비트퀘스트의 팀원이 되었습니다.");
        onClose();
        window.location.href = "/";
      } else {
        await loginTeacher(form.id, form.password);
        onClose();
      }
    } catch (err) {
      setMessage(err.message || "처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return createPortal((
    <div className="auth-modal-backdrop">
      <form className="auth-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()} autoComplete="off">
        <button type="button" className="auth-modal-close" onClick={onClose}>닫기</button>
        <p>{isSignup ? "Teacher Sign Up" : "Teacher Login"}</p>
        <h2>{isSignup ? "회원가입" : "로그인"}</h2>
        <div className="auth-mode-buttons">
          <button type="button" className={!isSignup ? "active" : ""} onClick={() => setModalMode("login")}>로그인</button>
          <button type="button" className={isSignup ? "active" : ""} onClick={() => setModalMode("signup")}>회원가입</button>
        </div>
        <label>id</label>
        <input
          value={form.id}
          onChange={(event) => update("id", event.target.value)}
          autoFocus
          autoComplete="off"
          name={isSignup ? "signup-teacher-id" : "login-teacher-id"}
        />
        <label>pw</label>
        <input
          type="password"
          value={form.password}
          onChange={(event) => update("password", event.target.value)}
          autoComplete={isSignup ? "new-password" : "off"}
          name={isSignup ? "signup-teacher-password" : "login-teacher-password"}
        />
        {isSignup && (
          <>
            <p className="auth-password-help">비밀번호는 8자리 이상(영문, 숫자, 특수문자 허용)</p>
            <label>이메일주소</label>
            <input
              type="email"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
              autoComplete="email"
              name="signup-teacher-email"
            />
          </>
        )}
        {message && <div className="auth-message auth-error">{message}</div>}
        <button type="submit" disabled={busy}>{busy ? "처리 중..." : isSignup ? "회원가입" : "로그인"}</button>
      </form>
    </div>
  ), document.body);
}

export default function AdminPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const authState = useTeacherAuth();
  const { room, loading, error } = useRoom(authState.ready && authState.loggedIn ? roomId : null, authState.user?.uid);
  const { settings: appSettings } = useAppSettings();
  const [roomTitle, setRoomTitle] = useState("스타트업 히어로");
  const [joinCode, setJoinCode] = useState("");
  const [actionError, setActionError] = useState("");
  const [creating, setCreating] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrCollapsed, setQrCollapsed] = useState(false);
  const [planTeam, setPlanTeam] = useState(null);
  const [opinionTeam, setOpinionTeam] = useState(null);
  const [studentMenu, setStudentMenu] = useState(null);
  const [aiConfirmOpen, setAiConfirmOpen] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [authModal, setAuthModal] = useState(null);
  const [recentRooms, setRecentRooms] = useState([]);
  const [recentRoomsLoading, setRecentRoomsLoading] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState("");
  const [pivotUiVisible, setPivotUiVisible] = useState(false);
  const simulationTimerRef = useRef(null); // next-month timer
  const applyTimerRef = useRef(null); // pending "apply event impact" timer
  const simulationActiveRef = useRef(false); // true while this tab drives the simulation
  const aiHeartbeatRef = useRef(null);
  const finalizeTimerRef = useRef(null);
  const adminSessionIdRef = useRef(makeAdminSessionId());
  const bgmRef = useRef(null);
  const resultBoardRef = useRef(null);
  const pivotResolvingRef = useRef(false);

  useEffect(() => installAudioUnlock(), []);

  useEffect(() => {
    if (!["voting", "ready"].includes(room?.pivotPhase)) { setPivotUiVisible(false); return undefined; }
    const timer = window.setTimeout(() => setPivotUiVisible(true), 1000);
    return () => window.clearTimeout(timer);
  }, [room?.pivotPhase]);

  useEffect(() => () => {
    clearSimulationTimers();
    simulationActiveRef.current = false;
    if (aiHeartbeatRef.current) clearInterval(aiHeartbeatRef.current);
    if (finalizeTimerRef.current) clearTimeout(finalizeTimerRef.current);
    stopSimulationBgm();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (roomId || !authState.ready || !authState.loggedIn) {
      setRecentRooms([]);
      setRecentRoomsLoading(false);
      return undefined;
    }

    setRecentRoomsLoading(true);
    getDocs(collection(db, "users", authState.user.uid, "rooms"))
      .then((snapshot) => {
        if (cancelled) return;
        const rooms = snapshot.docs
          .map((item) => ({ roomId: item.id, ...item.data() }))
          .sort((a, b) => Number(b.updatedAt || b.lastOpenedAt || b.createdAt || 0) - Number(a.updatedAt || a.lastOpenedAt || a.createdAt || 0));
        setRecentRooms(rooms);
      })
      .catch((err) => {
        if (!cancelled) setActionError(err.message || "진행 중인 수업을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setRecentRoomsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authState.loggedIn, authState.ready, authState.user?.uid, roomId]);

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

  const studentUrl = roomId ? `${getStudentOrigin(appSettings.studentOriginHost)}/room/${roomId}?owner=${encodeURIComponent(authState.user?.uid || "")}` : "";
  const students = room?.students || {};
  const teams = room?.teams || {};
  const rankedTeams = useMemo(() => rankTeams(teams), [teams]);
  const rankedInvestors = useMemo(() => rankInvestors(students, teams), [students, teams]);
  const activeTeamEntries = useMemo(() => getTeamEntries(teams).filter(([teamKey]) =>
    Object.values(students).some((student) => student.team === teamKey)
  ), [teams, students]);
  const allPlansSubmitted = activeTeamEntries.length > 0 && activeTeamEntries.every(([, team]) => team.idea && team.ideaSubmitted !== false);
  const allPlansLocked = allPlansSubmitted && activeTeamEntries.every(([, team]) => team.ideaLocked);
  const allTeamsEvaluated = activeTeamEntries.length > 0 && activeTeamEntries.every(([, team]) => team.aiEvaluation);
  const investmentChartVisible = [STATUSES.INVESTMENT, STATUSES.SIMULATION, STATUSES.RESULT].includes(room?.status);
  const activeTeamKeys = activeTeamEntries.map(([key]) => key);
  const allPivotsResolved = activeTeamEntries.length > 0 && activeTeamEntries.every(([, team]) => Boolean(team.midDecision?.resolvedScenario));
  const currentRoomRef = () => roomDocRef(authState.user.uid, roomId);

  async function updateRoom(patch) {
    if (!roomId || !authState.user?.uid) return;
    await updateDoc(currentRoomRef(), { ...patch, updatedAt: Date.now() });
  }

  function startAiHeartbeat() {
    if (aiHeartbeatRef.current) clearInterval(aiHeartbeatRef.current);
    aiHeartbeatRef.current = window.setInterval(() => {
      updateRoom({ aiEvaluationHeartbeatAt: Date.now() }).catch(() => {});
    }, AI_HEARTBEAT_INTERVAL);
  }

  function stopAiHeartbeat() {
    if (!aiHeartbeatRef.current) return;
    clearInterval(aiHeartbeatRef.current);
    aiHeartbeatRef.current = null;
  }

  function scheduleResultFinalization(finalizeAt) {
    if (finalizeTimerRef.current) return;
    const delay = Math.max(0, Number(finalizeAt || 0) - Date.now());
    finalizeTimerRef.current = window.setTimeout(async () => {
      finalizeTimerRef.current = null;
      await updateRoom({
        resultFinalizing: false,
        resultFinalizeAt: 0,
        status: STATUSES.RESULT,
        sysMessage: "최종 결과가 공개되었습니다."
      });
    }, delay);
  }

  useEffect(() => {
    if (!roomId || !authState.user?.uid) return;
    updateRoom({ lastOpenedAt: Date.now() }).catch(() => {});
  }, [authState.user?.uid, roomId]);

  useEffect(() => {
    if (!roomId || !room || room.status !== STATUSES.SIMULATION || !room.simulationRunning || simulationRunning || simulationActiveRef.current || room.simulationOwner === adminSessionIdRef.current) return undefined;

    const heartbeatAge = Date.now() - Number(room.simulationHeartbeatAt || 0);
    const hasFreshOwner = room.simulationOwner && room.simulationOwner !== adminSessionIdRef.current && heartbeatAge < SIMULATION_LEASE_TIMEOUT;
    const delay = hasFreshOwner ? SIMULATION_LEASE_TIMEOUT - heartbeatAge + 250 : 0;
    const recoveryTimer = window.setTimeout(async () => {
      const snapshot = await getDoc(currentRoomRef()).catch(() => null);
      const savedRoom = snapshot?.exists() ? snapshot.data() : null;
      if (!savedRoom?.simulationRunning) return;
      const savedHeartbeatAge = Date.now() - Number(savedRoom.simulationHeartbeatAt || 0);
      if (savedRoom.simulationOwner && savedRoom.simulationOwner !== adminSessionIdRef.current && savedHeartbeatAge < SIMULATION_LEASE_TIMEOUT) return;
      await updateRoom({
        simulationRunning: false,
        simulationOwner: null,
        simulationHeartbeatAt: 0,
        sysMessage: `${Number(savedRoom.currentMonth || 0)}개월 차에서 안전하게 일시정지했습니다. 계속하기를 누르면 다음 시점부터 재개합니다.`
      });
    }, delay);

    return () => clearTimeout(recoveryTimer);
  }, [authState.user?.uid, room?.simulationHeartbeatAt, room?.simulationOwner, room?.simulationRunning, room?.status, roomId, simulationRunning]);

  useEffect(() => {
    if (!roomId || !room || room.aiEvaluationStatus !== "evaluating" || evaluating || room.aiEvaluationOwner === adminSessionIdRef.current) return undefined;

    const heartbeatAge = Date.now() - Number(room.aiEvaluationHeartbeatAt || room.aiEvaluationStartedAt || 0);
    const hasFreshOwner = room.aiEvaluationOwner && room.aiEvaluationOwner !== adminSessionIdRef.current && heartbeatAge < AI_EVALUATION_LEASE_TIMEOUT;
    const delay = hasFreshOwner ? AI_EVALUATION_LEASE_TIMEOUT - heartbeatAge + 250 : 0;
    const recoveryTimer = window.setTimeout(async () => {
      const snapshot = await getDoc(currentRoomRef()).catch(() => null);
      const savedRoom = snapshot?.exists() ? snapshot.data() : null;
      if (savedRoom?.aiEvaluationStatus !== "evaluating") return;
      const savedHeartbeatAge = Date.now() - Number(savedRoom.aiEvaluationHeartbeatAt || savedRoom.aiEvaluationStartedAt || 0);
      if (savedRoom.aiEvaluationOwner && savedRoom.aiEvaluationOwner !== adminSessionIdRef.current && savedHeartbeatAge < AI_EVALUATION_LEASE_TIMEOUT) return;
      await updateRoom({
        aiEvaluationStatus: "interrupted",
        aiEvaluationOwner: null,
        sysMessage: "관리자 연결이 중단되어 AI 평가를 안전하게 멈췄습니다. AI 평가 단계를 다시 누르면 완료되지 않은 팀부터 이어집니다."
      });
    }, delay);

    return () => clearTimeout(recoveryTimer);
  }, [authState.user?.uid, evaluating, room?.aiEvaluationHeartbeatAt, room?.aiEvaluationOwner, room?.aiEvaluationStartedAt, room?.aiEvaluationStatus, roomId]);

  useEffect(() => {
    if (!roomId || !room?.resultFinalizing) return;
    scheduleResultFinalization(room.resultFinalizeAt || Date.now());
  }, [room?.resultFinalizeAt, room?.resultFinalizing, roomId]);

  useEffect(() => {
    const pendingMonth = Number(room?.currentMonth || 0);
    if (!roomId || simulationRunning || ![12, SIMULATION_MONTHS].includes(pendingMonth) || !room?.currentEvent || room.currentEventApplied !== false) return;
    if (applyTimerRef.current) return;
    applyTimerRef.current = window.setTimeout(() => {
      applyTimerRef.current = null;
      applySimulationEvent(room.currentEvent, pendingMonth).catch(() => {});
    }, SIMULATION_EVENT_APPLY_DELAY);
  }, [room?.currentEvent?.id, room?.currentEventApplied, room?.currentMonth, roomId, simulationRunning]);

  useEffect(() => {
    if (room?.pivotPhase !== "voting" || pivotResolvingRef.current) return;
    const readyTeams = activeTeamEntries.filter(([key, team]) => {
      if (team.midDecision?.resolvedScenario) return false;
      const members = getStudentsByTeam(students, key);
      return members.length > 0 && members.every((member) => team.midDecision?.votes?.[member.uid]);
    });
    if (!readyTeams.length) return;
    pivotResolvingRef.current = true;
    Promise.all(readyTeams.map(([key]) => resolveTeamPivot(key)))
      .finally(() => { pivotResolvingRef.current = false; });
  }, [room?.pivotPhase, teams, students]);

  useEffect(() => {
    if (room?.pivotPhase === "voting" && allPivotsResolved) {
      updateRoom({ pivotPhase: "ready", sysMessage: "모든 팀의 피벗 카드가 확정되었습니다. 계속 진행을 눌러 13개월 차를 시작하세요." }).catch(() => {});
    }
  }, [allPivotsResolved, room?.pivotPhase]);

  async function createRoom() {
    setActionError("");
    if (!authState.loggedIn) {
      setAuthModal("login");
      setActionError("로그인 / 회원가입 후 교사용 방 만들기를 사용할 수 있습니다.");
      return;
    }
    setCreating(true);
    try {
      const nextRoomId = makeRoomId();
      await setDoc(roomDocRef(authState.user.uid, nextRoomId), {
        ...makeInitialRoom(nextRoomId, roomTitle.trim() || appSettings.defaultRoomTitle || "스타트업 히어로"),
        ownerUid: authState.user.uid
      });
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

  async function deleteSavedRoom(savedRoom) {
    if (!authState.user?.uid || !savedRoom?.roomId || deletingRoomId) return;
    const roomLabel = savedRoom.roomTitle || savedRoom.roomId;
    const confirmed = window.confirm(`“${roomLabel}” 수업을 삭제할까요?\n\n학생 기록과 진행 상태가 함께 삭제되며 되돌릴 수 없습니다.`);
    if (!confirmed) return;

    setDeletingRoomId(savedRoom.roomId);
    setActionError("");
    try {
      // Removes the room and its students sub-collection (Firestore does not cascade deletes).
      await deleteRoomDeep(authState.user.uid, savedRoom.roomId);
      setRecentRooms((current) => current.filter((item) => item.roomId !== savedRoom.roomId));
    } catch (err) {
      setActionError(err.message || "저장된 수업을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      window.alert("수업을 삭제하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setDeletingRoomId("");
    }
  }

  async function updateStatus(status) {
    if (!roomId) return;
    if (status === STATUSES.C_LEVEL || status === STATUSES.CARD_SELECT) {
      const activeTeams = Object.entries(teams).filter(([teamKey]) =>
        Object.values(students).some((student) => student.team === teamKey)
      );
      if (activeTeams.length === 0) {
        await updateRoom({
          sysMessage: "학생을 팀에 배치한 뒤 다음 단계로 이동할 수 있습니다."
        });
        return;
      }
      const unassignedStudents = Object.values(students).some((student) => !student.team);
      if (unassignedStudents) {
        await updateRoom({
          sysMessage: "대기 중인 학생을 모두 팀에 배치한 뒤 다음 단계로 이동할 수 있습니다."
        });
        return;
      }
      const missingLeader = activeTeams.some(([, team]) => !team.leaderId);
      if (missingLeader) {
        await updateRoom({
          sysMessage: "팀장을 지정하세요. 참가자가 있는 모든 팀에 팀장이 있어야 다음 단계로 이동할 수 있습니다."
        });
        return;
      }
    }
    await updateRoom({
      status,
      phaseTimer: null,
      sysMessage: `${STATUS_LABELS[status]} 단계로 이동했습니다.`
    });
  }

  /** Teacher-controlled countdown shown on every screen. `minutes` null → stop. */
  async function setPhaseTimer(minutes, { extend = false } = {}) {
    if (!roomId) return;
    if (minutes === null) {
      await updateRoom({ phaseTimer: null, sysMessage: "타이머를 종료했습니다." }).catch((err) => reportActionError(err, "타이머를 종료하지 못했습니다."));
      return;
    }
    const now = Date.now();
    const current = room?.phaseTimer;
    const base = extend && current?.endsAt && Number(current.endsAt) > now ? Number(current.endsAt) : now;
    const durationMs = extend && current?.durationMs ? Number(current.durationMs) + minutes * 60000 : minutes * 60000;
    await updateRoom({
      phaseTimer: { startedAt: extend && current?.startedAt ? current.startedAt : now, endsAt: base + minutes * 60000, durationMs, phase: room?.status || null },
      sysMessage: extend ? `타이머를 ${minutes}분 연장했습니다.` : `${STATUS_LABELS[room?.status] || "현재"} 단계 타이머 ${minutes}분을 시작했습니다.`
    }).catch((err) => reportActionError(err, "타이머를 설정하지 못했습니다."));
  }

  function exportCsv() {
    downloadTextFile(`${safeFileName(room?.roomTitle)}_${roomId}_결과.csv`, buildFullCsv(room), "text/csv");
  }

  function exportJson() {
    downloadTextFile(`${safeFileName(room?.roomTitle)}_${roomId}_백업.json`, buildRoomJson(room), "application/json");
  }

  async function handlePhaseClick(status) {
    if (status === STATUSES.AI_EVALUATION) {
      if (!allPlansSubmitted) {
        await evaluateBusinessPlans();
        return;
      }
      if (!allPlansLocked) {
        const pending = activeTeamEntries.filter(([, team]) => !team.ideaLocked).map(([, team]) => team.teamName).join(", ");
        await updateRoom({
          sysMessage: `모든 팀의 사업계획서를 '확정'해야 AI 평가 단계로 이동할 수 있습니다. 미확정: ${pending}`
        });
        return;
      }
      setAiConfirmOpen(true);
      return;
    }
    if (status === STATUSES.SIMULATION) {
      if (room?.status === STATUSES.SIMULATION && Number(room.currentMonth || 0) > 0) {
        await resumeSimulation();
      } else {
        await runSimulation(0);
      }
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
    if (Number(room?.currentMonth || 0) < SIMULATION_MONTHS) {
      await updateRoom({
        sysMessage: `${SIMULATION_MONTHS}개월 경영 시뮬레이션이 끝난 뒤 최종 결과를 집계할 수 있습니다.`
      });
      return;
    }
    stopSimulationBgm();
    const dilutionPatch = {};
    for (const [key, team] of Object.entries(room.teams || {})) {
      const dilutionRate = Number(team.pivotModifiers?.equityDilutionRate || 0);
      if (!dilutionRate || team.equityDilutionApplied) continue;
      const finalAsset = Math.round(Number(team.currentAsset || 0) * (1 - dilutionRate / 100));
      const history = Array.isArray(team.assetHistory) ? [...team.assetHistory] : [];
      if (history.length) history[history.length - 1] = { ...history[history.length - 1], asset: finalAsset, dilution: true };
      dilutionPatch[`teams.${key}.currentAsset`] = finalAsset;
      dilutionPatch[`teams.${key}.assetHistory`] = history;
      dilutionPatch[`teams.${key}.equityDilutionApplied`] = true;
    }
    const resultFinalizeAt = Date.now() + RESULT_FINALIZE_DELAY;
    await updateRoom({
      ...dilutionPatch,
      resultFinalizing: true,
      resultFinalizeAt,
      phaseTimer: null,
      simulationRunning: false,
      simulationOwner: null,
      simulationHeartbeatAt: 0,
      sysMessage: "최종결과 집계중..."
    });
    scheduleResultFinalization(resultFinalizeAt);
  }

  async function setLeader(uid, teamKey) {
    const nickname = students[uid]?.nickname || "학생";
    await updateRoom({
      [`teams.${teamKey}.leaderId`]: uid,
      sysMessage: `${nickname} 학생이 ${teams[teamKey]?.teamName || "팀"} 팀장이 되었습니다.`
    });
  }

  async function renameTeam(teamKey, teamName) {
    const fallback = teams[teamKey]?.teamName || "팀";
    await updateRoom({
      [`teams.${teamKey}.teamName`]: normalizeTeamName(teamName.trim() || fallback).slice(0, 10),
      sysMessage: "팀 이름이 변경되었습니다."
    });
  }

  async function addTeam() {
    const key = makeNextTeamKey(teams);
    await updateRoom({
      [`teams.${key}`]: makeTeam(key, Object.keys(teams).length),
      sysMessage: "팀을 추가했습니다."
    });
  }

  function reportActionError(err, fallback) {
    setActionError(err?.message || fallback);
  }

  async function deleteTeam(teamKey) {
    const removedName = teams[teamKey]?.teamName || "팀";
    const memberCount = getStudentsByTeam(students, teamKey).length;
    if (!window.confirm(`“${removedName}” 팀을 삭제할까요?${memberCount ? `\n\n팀원 ${memberCount}명은 대기실로 이동합니다.` : ""}`)) return;
    try {
      await deleteTeamDeep({
        ownerUid: authState.user.uid,
        roomId,
        teamKey,
        students,
        sysMessage: `${removedName}이 삭제되어 해당 팀 학생은 대기실로 이동했습니다.`
      });
    } catch (err) {
      reportActionError(err, "팀을 삭제하지 못했습니다.");
    }
  }

  async function assignStudentToTeam(uid, teamKey) {
    const nickname = students[uid]?.nickname || "학생";
    try {
      await moveStudent({
        ownerUid: authState.user.uid,
        roomId,
        uid,
        student: students[uid],
        teams,
        teamKey,
        sysMessage: `${nickname} 학생을 ${teams[teamKey]?.teamName || "팀"}에 배정했습니다.`
      });
    } catch (err) {
      reportActionError(err, "학생을 배정하지 못했습니다.");
    }
    setStudentMenu(null);
  }

  async function removeStudent(uid) {
    const nickname = students[uid]?.nickname || "학생";
    if (!window.confirm(`${nickname} 학생을 방에서 내보낼까요?`)) return;
    try {
      await removeStudentDeep({
        ownerUid: authState.user.uid,
        roomId,
        uid,
        teams,
        sysMessage: `${nickname} 학생을 대기실에서 내보냈습니다.`
      });
    } catch (err) {
      reportActionError(err, "학생을 내보내지 못했습니다.");
    }
    setStudentMenu(null);
  }

  async function moveStudentToTeam(uid, teamKey) {
    const nickname = students[uid]?.nickname || "학생";
    try {
      await moveStudent({
        ownerUid: authState.user.uid,
        roomId,
        uid,
        student: students[uid],
        teams,
        teamKey,
        sysMessage: `${nickname} 학생을 ${teams[teamKey]?.teamName || "팀"}으로 이동했습니다.`
      });
    } catch (err) {
      reportActionError(err, "학생을 이동하지 못했습니다.");
    }
    setStudentMenu(null);
  }

  async function lockBusinessPlan(teamKey) {
    await updateRoom({
      [`teams.${teamKey}.ideaLocked`]: true,
      sysMessage: `${teams[teamKey]?.teamName || "팀"} 사업계획을 확정했습니다. 학생 화면에서 더 이상 수정할 수 없습니다.`
    });
  }

  async function evaluateBusinessPlans() {
    if (!roomId || evaluating) return;
    if (!allPlansSubmitted) {
      await updateRoom({
        sysMessage: "모든 팀의 사업계획서가 등록되어야 AI 평가를 시작할 수 있습니다."
      });
      return;
    }
    if (!allPlansLocked) {
      await updateRoom({
        sysMessage: "모든 팀의 사업계획서를 교사가 '확정'해야 AI 평가를 시작할 수 있습니다."
      });
      return;
    }

    const evaluations = Object.fromEntries(
      activeTeamEntries
        .filter(([, team]) => team.aiEvaluation)
        .map(([teamKey, team]) => [teamKey, team.aiEvaluation])
    );
    const pendingEntries = activeTeamEntries.filter(([, team]) => !team.aiEvaluation);
    if (pendingEntries.length === 0) {
      await updateRoom({
        aiEvaluationStatus: "done",
        aiEvaluationOwner: null,
        aiEvaluationProgress: { completed: activeTeamEntries.length, total: activeTeamEntries.length },
        status: STATUSES.AI_EVALUATION,
        sysMessage: "모든 팀의 AI 평가가 이미 완료되었습니다. 투자 유치 단계로 이동할 수 있습니다."
      });
      return;
    }

    setEvaluating(true);
    try {
      const startedAt = Date.now();
      await updateRoom({
        status: STATUSES.AI_EVALUATION,
        aiEvaluationStatus: "evaluating",
        aiEvaluationOwner: adminSessionIdRef.current,
        aiEvaluationStartedAt: startedAt,
        aiEvaluationHeartbeatAt: startedAt,
        aiEvaluationProgress: { completed: Object.keys(evaluations).length, total: activeTeamEntries.length },
        sysMessage: pendingEntries.length === activeTeamEntries.length
          ? "지금 모두의 사업계획을 비즈니스 전문 AI가 평가중입니다..."
          : `중단된 AI 평가를 이어서 진행합니다. 남은 팀 ${pendingEntries.length}개를 평가합니다.`
      });
      startAiHeartbeat();

      for (const [teamKey, team] of pendingEntries) {
        try {
          evaluations[teamKey] = await requestAiEvaluation(teamKey, team);
        } catch (err) {
          evaluations[teamKey] = makeFallbackAiEvaluation(team, err);
        }
        const completed = Object.keys(evaluations).length;
        await updateRoom({
          [`teams.${teamKey}.aiEvaluation`]: evaluations[teamKey],
          aiEvaluationHeartbeatAt: Date.now(),
          aiEvaluationProgress: { completed, total: activeTeamEntries.length },
          sysMessage: `AI 평가 진행 중: ${completed}/${activeTeamEntries.length}팀 완료`
        });
      }

      await updateRoom({
        aiEvaluationStatus: "done",
        aiEvaluationOwner: null,
        aiEvaluationHeartbeatAt: Date.now(),
        aiEvaluationProgress: { completed: activeTeamEntries.length, total: activeTeamEntries.length },
        status: STATUSES.AI_EVALUATION,
        sysMessage: `${makeAiEvaluationMessage(evaluations)} 교사가 투자 유치 단계를 누르면 다음 단계로 이동합니다.`
      });
    } catch (err) {
      await updateRoom({
        aiEvaluationStatus: "error",
        aiEvaluationOwner: null,
        status: STATUSES.AI_EVALUATION,
        sysMessage: `AI 평가가 중단되었습니다. 다시 실행하면 완료되지 않은 팀부터 이어집니다. ${err.message || "잠시 후 다시 시도하세요."}`
      });
    } finally {
      stopAiHeartbeat();
      setEvaluating(false);
    }
  }

  async function initializeAssets() {
    // Field-path writes only: freezes the derived investment totals onto each team and resets the
    // simulation fields without touching leader-editable fields (name, cards, idea).
    const teamPatch = {};
    for (const [key, team] of Object.entries(room.teams || {})) {
      const investmentsReceived = Number(team.investmentsReceived || 0);
      const baseAsset = getTeamBaseAsset(team); // includes the C-level diversity bonus
      const base = baseAsset + investmentsReceived;
      teamPatch[`teams.${key}.investmentsReceived`] = investmentsReceived;
      teamPatch[`teams.${key}.baseAsset`] = baseAsset;
      teamPatch[`teams.${key}.diversity`] = team.diversity ? { key: team.diversity.key, label: team.diversity.label, rate: team.diversity.rate } : null;
      teamPatch[`teams.${key}.initialCapital`] = base;
      teamPatch[`teams.${key}.currentAsset`] = base;
      teamPatch[`teams.${key}.midDecision`] = null;
      teamPatch[`teams.${key}.lastEventImpact`] = null;
      teamPatch[`teams.${key}.assetHistory`] = [{ month: 0, asset: base }];
    }
    await updateRoom({
      ...teamPatch,
      currentMonth: 0,
      currentEvent: null,
      currentEventApplied: true,
      eventHistory: [],
      currentDecision: null,
      pivotPhase: null,
      simulationSettings: appSettings.simulation,
      aiEvaluationStatus: "done",
      resultFinalizing: false,
      resultFinalizeAt: 0,
      simulationRunning: true,
      simulationOwner: adminSessionIdRef.current,
      simulationHeartbeatAt: Date.now(),
      status: STATUSES.SIMULATION,
      phaseTimer: null,
      sysMessage: "AI 경영 시뮬레이션을 시작합니다. 모든 팀은 기본 자산(C레벨 다양성 보너스 반영)에 투자 유치금을 더해 출발합니다."
    });
  }

  async function applySimulationEvent(event, month) {
    const applySnap = await getDoc(currentRoomRef());
    if (!applySnap.exists()) return;
    const applyRoom = applySnap.data();
    if (Number(applyRoom.currentMonth || 0) !== month || applyRoom.currentEvent?.id !== event.id || applyRoom.currentEventApplied) return;
    const teamPatch = {};
    for (const [key, team] of Object.entries(applyRoom.teams || {})) {
      const updated = applyRiskMultiplier(team, event, applyRoom.simulationSettings || appSettings.simulation, month);
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
    await updateRoom({
      ...teamPatch,
      currentEventApplied: true,
      ...(isPivotStop ? { pivotPhase: "voting" } : {}),
      simulationRunning: keepRunning,
      simulationOwner: keepRunning ? applyRoom.simulationOwner || adminSessionIdRef.current : null,
      simulationHeartbeatAt: keepRunning ? Date.now() : 0,
      sysMessage: month >= SIMULATION_MONTHS ? `${SIMULATION_MONTHS}개월 경영 시뮬레이션이 종료되었습니다. 교사가 최종 결과 버튼을 누르면 결과가 공개됩니다.` : isPivotStop ? "12개월 차가 종료되었습니다. 모든 팀원이 미래를 바꿀 피벗 카드에 투표하세요." : `${month}개월 차 이벤트 자산 변동이 반영되었습니다.`
    });
  }

  async function resolveTeamPivot(teamKey, force = false) {
    const team = teams[teamKey];
    if (!team || team.midDecision?.resolvedScenario) return;
    const members = getStudentsByTeam(students, teamKey);
    const votes = team.midDecision?.votes || {};
    if (!force && !members.every((member) => votes[member.uid])) return;
    const settings = room.simulationSettings || appSettings.simulation;
    const scenarioId = resolvePivotVote(team, members.map((member) => member.uid), settings.pivotScenarios || PIVOT_SCENARIOS);
    await updateRoom({
      [`teams.${teamKey}.midDecision.resolvedScenario`]: scenarioId,
      [`teams.${teamKey}.midDecision.resolvedAt`]: Date.now(),
      sysMessage: `${team.teamName}의 피벗 카드가 확정되었습니다.`
    });
  }

  async function continueAfterPivot() {
    if (!allPivotsResolved) {
      await updateRoom({ sysMessage: "아직 피벗 카드가 확정되지 않은 팀이 있습니다. 미완료 팀을 확인하거나 강제 확정하세요." });
      return;
    }
    const freshSnap = await getDoc(currentRoomRef());
    if (!freshSnap.exists()) return;
    const freshRoom = freshSnap.data();
    const settings = freshRoom.simulationSettings || appSettings.simulation;
    const patch = {};
    for (const [key, team] of Object.entries(freshRoom.teams || {})) {
      if (!activeTeamKeys.includes(key)) continue;
      const scenario = getPivotScenario(settings, team.midDecision?.resolvedScenario);
      const pivot = makePivotTeamPatch(team, scenario, 12);
      patch[`teams.${key}.currentAsset`] = pivot.currentAsset;
      patch[`teams.${key}.pivotModifiers`] = pivot.pivotModifiers;
      patch[`teams.${key}.pivotScenarioId`] = pivot.pivotScenarioId;
      patch[`teams.${key}.assetHistory`] = pivot.assetHistory;
    }
    await updateRoom({ ...patch, pivotPhase: "applied", currentEvent: null, currentEventApplied: true, sysMessage: "피벗 전략을 적용했습니다. 13개월 차 경영 시뮬레이션을 시작합니다." });
    await runSimulation(12);
  }

  function clearSimulationTimers() {
    if (simulationTimerRef.current) {
      window.clearTimeout(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }
    if (applyTimerRef.current) {
      window.clearTimeout(applyTimerRef.current);
      applyTimerRef.current = null;
    }
  }

  /** Stops driving the simulation from this tab (does not touch Firestore). */
  function stopLocalSimulation({ keepPendingApply = false } = {}) {
    if (simulationTimerRef.current) {
      window.clearTimeout(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }
    if (!keepPendingApply && applyTimerRef.current) {
      window.clearTimeout(applyTimerRef.current);
      applyTimerRef.current = null;
    }
    simulationActiveRef.current = false;
    setSimulationRunning(false);
  }

  /**
   * Drives the simulation month by month with a recursive timeout: the next tick is scheduled only
   * after the current one has finished its Firestore round-trip, so slow networks cannot make ticks
   * overlap. `simulationActiveRef` guards against double starts; every timer lives in a ref so a
   * pause or unmount cancels it.
   */
  async function runSimulation(startMonth = 0) {
    if (!roomId || simulationActiveRef.current) return;
    if (!allTeamsEvaluated) {
      await updateRoom({
        sysMessage: "먼저 모든 팀의 AI 평가를 완료해야 경영 시뮬레이션을 시작할 수 있습니다."
      });
      return;
    }
    simulationActiveRef.current = true;
    setSimulationRunning(true);
    try {
      if (startMonth === 0) {
        await initializeAssets();
      } else {
        await updateRoom({
          simulationRunning: true,
          simulationOwner: adminSessionIdRef.current,
          simulationHeartbeatAt: Date.now(),
          sysMessage: `${startMonth}개월 차부터 경영 시뮬레이션을 재개합니다.`
        });
      }
    } catch (err) {
      stopLocalSimulation();
      reportActionError(err, "시뮬레이션을 시작하지 못했습니다.");
      return;
    }
    playSimulationBgm();
    let month = startMonth;

    async function advanceOneMonth() {
      if (!simulationActiveRef.current) return;
      const nextMonth = month + 1;
      try {
        const freshSnap = await getDoc(currentRoomRef());
        if (!simulationActiveRef.current) return;
        if (!freshSnap.exists()) {
          stopLocalSimulation();
          return;
        }
        const freshRoom = freshSnap.data();
        const ownedElsewhere = freshRoom.simulationOwner && freshRoom.simulationOwner !== adminSessionIdRef.current && freshRoom.simulationRunning;
        if (ownedElsewhere || !freshRoom.simulationRunning) {
          // Another tab took over, or the simulation was paused from elsewhere.
          stopLocalSimulation();
          stopSimulationBgm();
          return;
        }

        const event = drawEvent();
        const nextEventHistory = [
          ...(Array.isArray(freshRoom.eventHistory) ? freshRoom.eventHistory : []),
          { month: nextMonth, event }
        ];
        const eventPreviewPatch = Object.fromEntries(
          Object.keys(freshRoom.teams || {}).map((key) => [`teams.${key}.lastEventImpact`, null])
        );
        const isPivotMonth = nextMonth === 12 && freshRoom.pivotPhase !== "applied";
        const isLastMonth = nextMonth >= SIMULATION_MONTHS;
        await updateRoom({
          ...eventPreviewPatch,
          currentMonth: nextMonth,
          currentEvent: event,
          currentEventApplied: false,
          eventHistory: nextEventHistory,
          currentDecision: null,
          simulationRunning: !isLastMonth && !isPivotMonth,
          simulationOwner: isLastMonth || isPivotMonth ? null : adminSessionIdRef.current,
          simulationHeartbeatAt: isLastMonth || isPivotMonth ? 0 : Date.now(),
          status: STATUSES.SIMULATION,
          resultFinalizing: false,
          sysMessage: `${nextMonth}개월 차 이벤트: ${event.title}`
        });
        month = nextMonth;

        applyTimerRef.current = window.setTimeout(() => {
          applyTimerRef.current = null;
          applySimulationEvent(event, nextMonth).catch(() => {});
        }, SIMULATION_EVENT_APPLY_DELAY);

        if (isLastMonth || isPivotMonth) {
          // Keep the pending apply timer so the final month's impact still lands.
          stopLocalSimulation({ keepPendingApply: true });
          stopSimulationBgm();
          return;
        }
        simulationTimerRef.current = window.setTimeout(advanceOneMonth, SIMULATION_EVENT_DELAY);
      } catch {
        // Transient Firestore error: retry the same month on the next tick instead of dying silently.
        if (simulationActiveRef.current) {
          simulationTimerRef.current = window.setTimeout(advanceOneMonth, SIMULATION_EVENT_DELAY);
        }
      }
    }

    await advanceOneMonth();
  }

  function pauseSimulation() {
    // The current event (if still unapplied) is applied on resume via resumeSimulation().
    stopLocalSimulation();
    pauseSimulationBgm();
    if (roomId) {
      updateRoom({
        simulationRunning: false,
        simulationOwner: null,
        simulationHeartbeatAt: 0,
        sysMessage: "AI 경영 시뮬레이션을 일시정지했습니다."
      }).catch((err) => reportActionError(err, "일시정지 상태를 저장하지 못했습니다."));
    }
  }

  async function resumeSimulation() {
    if (room?.status !== STATUSES.SIMULATION || simulationActiveRef.current) return;
    if (["voting", "ready"].includes(room?.pivotPhase)) return;
    const snapshot = await getDoc(currentRoomRef()).catch(() => null);
    const savedRoom = snapshot?.exists() ? snapshot.data() : room;
    if (savedRoom.currentEvent && savedRoom.currentEventApplied === false) {
      await applySimulationEvent(savedRoom.currentEvent, Number(savedRoom.currentMonth || 0)).catch(() => {});
      if (Number(savedRoom.currentMonth || 0) === 12) return;
    }
    const savedMonth = Number(savedRoom.currentMonth || 0);
    if (savedMonth >= SIMULATION_MONTHS) return;
    await runSimulation(savedMonth);
  }

  async function resetRoom() {
    const studentCount = Object.keys(students).length;
    const confirmed = window.confirm(
      `이 방을 처음 상태로 초기화할까요?\n\n팀 구성, 사업계획, AI 평가, 시뮬레이션 기록과 참가 학생 ${studentCount}명의 정보가 모두 삭제되며 되돌릴 수 없습니다.`
    );
    if (!confirmed) return;
    pauseSimulation();
    try {
      await resetRoomDeep(authState.user.uid, roomId, room?.roomTitle || appSettings.defaultRoomTitle || "스타트업 히어로");
    } catch (err) {
      reportActionError(err, "방을 초기화하지 못했습니다.");
    }
  }

  /**
   * Asks the server to evaluate one team. The server verifies the teacher's Firebase ID token,
   * reads the team's plan straight from Firestore and builds the prompt itself, so no prompt text
   * ever travels from the browser.
   */
  async function requestAiEvaluation(teamKey, team) {
    const idToken = await getCurrentIdToken();
    const response = await fetch("/api/ai-evaluation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`
      },
      body: JSON.stringify({ ownerUid: authState.user.uid, roomId, teamKey })
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const hint = response.status === 401 || response.status === 403
        ? " 교사 로그인 상태가 만료되었거나 방 소유자가 아닙니다. 다시 로그인한 뒤 시도하세요."
        : [500, 502].includes(response.status) && /GEMINI_API_KEY/.test(errorText)
          ? ` 배포 도메인(${window.location.host})의 서버 환경변수 GEMINI_API_KEY를 확인하세요.`
          : "";
      throw new Error(`AI 응답 오류 ${response.status}.${hint}${errorText ? ` ${errorText.slice(0, 220)}` : ""}`);
    }
    const payload = await response.json();
    if (!payload?.evaluation?.factors) throw new Error("AI 서버가 올바르지 않은 응답을 반환했습니다.");
    return { ...payload.evaluation, teamName: team?.teamName };
  }

  if (!roomId) {
    return (
      <>
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
          authState={authState}
          onOpenAuth={setAuthModal}
          recentRooms={recentRooms}
          recentRoomsLoading={recentRoomsLoading}
          deletingRoomId={deletingRoomId}
          onResumeRoom={(savedRoomId) => navigate(`/admin/${savedRoomId}`)}
          onDeleteRoom={deleteSavedRoom}
        />
        {authModal && <AuthModal mode={authModal} onClose={() => setAuthModal(null)} />}
      </>
    );
  }

  if (!authState.ready) return <div className="p-8">관리자 로그인 상태를 확인하는 중입니다.</div>;
  if (!authState.loggedIn) {
    return (
      <section className="grid min-h-screen place-items-center bg-slate-50 px-5">
        <div className="w-full max-w-lg rounded-3xl bg-white p-8 text-center shadow-xl">
          <ShieldCheck className="mx-auto text-indigo-600" size={46} />
          <h1 className="mt-4 text-2xl font-black">진행 중인 수업을 이어가려면 로그인하세요</h1>
          <p className="mt-3 text-slate-600">같은 교사 계정으로 로그인하면 방 코드 {roomId}의 저장된 단계부터 복구됩니다.</p>
          <button type="button" onClick={() => setAuthModal("login")} className="mt-6 rounded-xl bg-indigo-600 px-6 py-3 font-bold text-white">교사 로그인</button>
          <Link to="/" className="mt-4 block text-sm font-bold text-slate-500">메인으로 이동</Link>
        </div>
        {authModal && <AuthModal mode={authModal} onClose={() => setAuthModal(null)} />}
      </section>
    );
  }

  if (loading) return <div className="p-8">방 정보를 불러오는 중입니다.</div>;
  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!room) return <div className="p-8">존재하지 않는 방입니다. <Link className="font-bold text-indigo-600" to="/">메인으로 이동</Link></div>;

  return (
    <section className="admin-dashboard mx-auto max-w-7xl px-5 py-6">
      <header className="admin-topbar">
        <div className="bizquest-brand" aria-label="비즈퀘스트">
          <img className="bizquest-logo-image" src={bizQuestLogo} alt="" />
          <span>
            <span className="bizquest-name"><b>BIZ</b>QUEST</span>
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

      {room.sysMessage && (
        <div className="event-notice ticker-pulse mt-3">
          <span className="event-notice-label"><Megaphone size={14} /> 진행 안내</span>
          <div className="event-notice-window"><strong>{room.sysMessage}</strong></div>
        </div>
      )}
      {room.status === STATUSES.SIMULATION && !room.simulationRunning && Number(room.currentMonth || 0) < SIMULATION_MONTHS && !["voting", "ready"].includes(room.pivotPhase) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div>
            <b className="block text-amber-900">시뮬레이션이 {Number(room.currentMonth || 0)}개월 차에서 일시정지되어 있습니다.</b>
            <span className="text-sm text-amber-700">저장된 자산과 이벤트 상태를 유지한 채 다음 시점부터 이어갑니다.</span>
          </div>
          <button type="button" onClick={resumeSimulation} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-3 font-bold text-white"><Play size={18} /> 계속하기</button>
        </div>
      )}
      {["interrupted", "error"].includes(room.aiEvaluationStatus) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4">
          <div>
            <b className="block text-indigo-900">AI 평가가 중간에 멈췄습니다.</b>
            <span className="text-sm text-indigo-700">완료된 팀 결과는 유지하고 미완료 팀부터 다시 시작합니다.</span>
          </div>
          <button type="button" onClick={evaluateBusinessPlans} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white"><Sparkles size={18} /> 평가 이어하기</button>
        </div>
      )}
      <PhaseRail currentStatus={room.status} onPhaseClick={handlePhaseClick} />
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <PhaseProgressPanel room={room} teams={teams} students={students} />
        <PhaseTimerControl timer={room.phaseTimer} onStart={(minutes) => setPhaseTimer(minutes)} onExtend={() => setPhaseTimer(1, { extend: true })} onStop={() => setPhaseTimer(null)} />
      </div>
      {pivotUiVisible && ["voting", "ready"].includes(room.pivotPhase) && (
        <PivotAdminPanel room={room} teams={teams} students={students} settings={room.simulationSettings || appSettings.simulation} onForce={resolveTeamPivot} onContinue={continueAfterPivot} />
      )}
      {room.resultFinalizing && <ResultFinalizingShowcase />}
      <FanfareOnResult status={room.status} />
      <ResultFireworks status={room.status} />

      <div className="admin-workspace mt-5 grid gap-4 lg:grid-cols-[288px_1fr]">
        <aside className="admin-sidebar space-y-4">
          <div className={`qr-panel rounded-lg bg-white p-5 shadow-lift ${qrCollapsed ? "qr-panel-collapsed" : ""}`}>
            <button onClick={() => setQrCollapsed(!qrCollapsed)} className="qr-toggle" type="button">
              <span>학생 입장 QR</span>
              {qrCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </button>
            {!qrCollapsed && (
              <>
                <div className="mt-4 flex justify-center rounded-lg bg-white p-3"><QRCodeSVG value={studentUrl} size={190} /></div>
                <div className="mt-3 rounded-lg bg-indigo-50 px-4 py-3 text-center">
                  <p className="text-xs font-black text-indigo-500">방 코드</p>
                  <strong className="block text-3xl font-black tracking-[0.16em] text-indigo-700">{roomId}</strong>
                </div>
                <button onClick={() => setQrOpen(true)} className="touch-button mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 font-bold text-white"><Maximize2 size={18} /> 크게 보기</button>
              </>
            )}
          </div>
          <div className="rounded-lg bg-white p-5 shadow-lift">
            <h2 className="flex items-center gap-2 font-black"><Users size={18} /> 참가자 대기실</h2>
            <div className="mt-3 space-y-2">
              {Object.entries(students).filter(([, student]) => !student.team).map(([uid, student]) => (
                <button key={uid} type="button" onClick={() => setStudentMenu({ uid, mode: "waiting" })} className="waiting-student-button">
                  <span className={`grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br ${getAvatarColor(uid)} text-xs font-black text-white shadow-sm`}>{student.nickname?.slice(0, 1) || "?"}</span>
                  <span className="font-semibold">{student.nickname}</span>
                </button>
              ))}
              {Object.values(students).filter((student) => !student.team).length === 0 && <p className="text-sm text-slate-500">대기 중인 학생이 없습니다.</p>}
            </div>
          </div>
          <div className="print:hidden rounded-lg bg-white p-5 shadow-lift">
            <h2 className="flex items-center gap-2 font-black"><FileDown size={18} /> 내보내기</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">{room.status === STATUSES.RESULT ? "최종 결과를 파일로 저장합니다." : "결과 CSV는 최종 결과 단계에서 저장할 수 있습니다. JSON 백업은 언제든 가능합니다."}</p>
            <div className="mt-3 grid gap-2">
              <button onClick={() => window.print()} disabled={room.status !== STATUSES.RESULT} className="touch-button inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"><FileDown size={18} /> PDF 저장(인쇄)</button>
              <button onClick={exportCsv} disabled={room.status !== STATUSES.RESULT} className="touch-button inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"><FileText size={18} /> 결과 CSV(엑셀)</button>
              <button onClick={exportJson} className="touch-button inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 font-bold text-white"><FileText size={18} /> 전체 데이터 JSON 백업</button>
            </div>
          </div>
        </aside>
        <div className="print-main admin-main-content space-y-4">
          <TeamGrid roomStatus={room.status} teams={teams} students={students} onOpenStudentMenu={(uid, teamKey) => setStudentMenu({ uid, teamKey, mode: "assigned" })} onRenameTeam={renameTeam} onAddTeam={addTeam} onDeleteTeam={deleteTeam} onLockPlan={lockBusinessPlan} onOpenPlan={setPlanTeam} onOpenOpinion={setOpinionTeam} />
          {investmentChartVisible && <InvestmentChart teams={teams} />}
          {room.status === STATUSES.RESULT && (
            <div ref={resultBoardRef}>
              <ResultBoard rankedTeams={rankedTeams} rankedInvestors={rankedInvestors} teams={teams} students={students} room={room} />
            </div>
          )}
        </div>
      </div>
      {qrOpen && <QrModal value={studentUrl} roomId={roomId} onClose={() => setQrOpen(false)} />}
      {aiConfirmOpen && <AiConfirmModal onCancel={() => setAiConfirmOpen(false)} onConfirm={() => { setAiConfirmOpen(false); evaluateBusinessPlans(); }} />}
      {planTeam && <BusinessPlanModal team={planTeam} onClose={() => setPlanTeam(null)} />}
      {opinionTeam && <AiOpinionModal team={opinionTeam} onClose={() => setOpinionTeam(null)} />}
      {studentMenu && <StudentManageModal menu={studentMenu} students={students} teams={teams} onClose={() => setStudentMenu(null)} onAssign={assignStudentToTeam} onKick={removeStudent} onMove={moveStudentToTeam} onSetLeader={setLeader} />}
      {room.aiEvaluationStatus === "evaluating" && <AiEvaluationShowcase />}
      {room.status === STATUSES.SIMULATION && room.currentEvent && Number(room.currentMonth || 0) < SIMULATION_MONTHS && (!['voting', 'ready'].includes(room.pivotPhase) || !pivotUiVisible) && (
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

function TeamGrid({ roomStatus, teams, students, onOpenStudentMenu, onRenameTeam, onAddTeam, onDeleteTeam, onLockPlan, onOpenPlan, onOpenOpinion }) {
  return (
    <section className="admin-team-section">
      <div className="admin-section-heading">
        <div><p>TEAM DASHBOARD</p><h2>팀 구성 현황</h2></div>
        <button onClick={onAddTeam} className="print:hidden admin-ui-button admin-ui-button-primary"><Plus size={15} /> 팀 추가</button>
      </div>
      <div className="admin-team-grid grid gap-4 md:grid-cols-2">
        {getTeamEntries(teams).map(([key, team], teamIndex) => {
          const cardSelectionComplete = Boolean(team.trendCard && team.techCard);
          const members = getStudentsByTeam(students, key).sort((a, b) => {
            if (a.uid === team.leaderId) return -1;
            if (b.uid === team.leaderId) return 1;
            return String(a.nickname || "").localeCompare(String(b.nickname || ""), "ko");
          });
          const diversity = team.diversity;
          return (
            <section key={key} className={`admin-team-card admin-team-tone-${teamIndex % 6}`}>
              <div className="admin-team-identity">
                <div className="admin-team-main-row">
                  <div className="admin-team-avatar-column">
                    <MascotAvatar mascotId={team.mascot} size="medium" />
                    <span className="team-member-count" title="현재 팀 인원"><Users size={12} /> 총 {members.length}명</span>
                  </div>
                  <div className="admin-team-title-column">
                    <input key={`${key}-${team.teamName}`} maxLength={10} defaultValue={team.teamName} onBlur={(event) => onRenameTeam(key, event.target.value)} />
                    <div className="admin-team-meta-row">
                      {team.teamSetupComplete && <span className="team-setup-complete"><CheckCircle2 size={12} /> 팀구성 완료</span>}
                      <button title="팀 삭제" onClick={() => onDeleteTeam(key)} className="print:hidden admin-team-delete"><Trash2 size={14} /> 삭제</button>
                    </div>
                  </div>
                </div>
                <p className={`admin-team-slogan ${team.teamSlogan ? "" : "admin-team-slogan-empty"}`}>
                  <span>팀 구호</span>
                  <strong>{team.teamSlogan || "아직 팀 구호를 정하지 않았습니다."}</strong>
                </p>
              </div>
              {diversity && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`diversity-badge diversity-badge-${diversity.key}`}>
                    <Sparkles size={13} /> {diversity.label}
                    <b>{diversity.rate > 0 ? "+" : ""}{diversity.rate}%</b>
                  </span>
                  <span className="text-xs font-bold text-slate-500">C레벨 자가진단 구성 보너스 → 기본 자산 {formatWon(getTeamBaseAsset(team))}</span>
                </div>
              )}
              <div className="admin-team-members">
                {members.map((student) => {
                  const diagnosisInProgress = roomStatus === STATUSES.C_LEVEL && !student.cLevelResult?.key;
                  const diagnosisComplete = roomStatus === STATUSES.C_LEVEL && Boolean(student.cLevelResult?.key);
                  const pendingInvestment = roomStatus === STATUSES.INVESTMENT && !student.investmentSubmitted;
                  const investmentDone = [STATUSES.INVESTMENT, STATUSES.SIMULATION, STATUSES.RESULT].includes(roomStatus) && student.investmentSubmitted;
                  return (
                    <button key={student.uid} onClick={() => onOpenStudentMenu(student.uid, key)} className={`team-member-chip ${team.leaderId === student.uid ? "team-member-chip-leader" : ""} ${pendingInvestment ? "team-member-chip-pending" : ""}`} title={diagnosisInProgress ? "자가진단 진행 중" : diagnosisComplete ? "자가진단 완료" : pendingInvestment ? "투자 미확정" : investmentDone ? "투자 확정" : undefined}>
                      {team.leaderId === student.uid && <Crown size={14} className="text-amber-500" />}
                      {student.nickname}
                      {student.cLevelResult?.key && <span className={`c-level-mini-badge c-level-mini-${student.cLevelResult.key}`}>{student.cLevelResult.key}</span>}
                      {diagnosisInProgress && <span className="c-level-status-light c-level-status-progress" aria-label="자가진단 진행 중" />}
                      {diagnosisComplete && <span className="c-level-status-light c-level-status-complete" aria-label="자가진단 완료" />}
                      {investmentDone && <CheckCircle2 size={13} className="text-emerald-600" aria-label="투자 확정" />}
                      {pendingInvestment && <span className="team-member-pending-dot" aria-hidden="true" />}
                    </button>
                  );
                })}
                {members.length === 0 && <span className="text-sm text-slate-400">팀원을 기다리는 중</span>}
              </div>
              <div className={`admin-team-details ${cardSelectionComplete ? "admin-card-selection-complete" : "admin-card-selection-empty"}`}>
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
                <div className="print:hidden admin-team-actions">
                  <button type="button" disabled={!team.idea || team.ideaSubmitted === false} onClick={() => onOpenPlan({ key, ...team })} className="admin-ui-button admin-ui-button-primary">{team.idea && team.ideaSubmitted !== false ? <><CheckCircle2 size={14} /> 사업계획 완료</> : <><FileText size={14} /> 사업계획 미등록</>}</button>
                  <button type="button" disabled={!team.idea || team.ideaSubmitted === false || team.ideaLocked} onClick={() => onLockPlan(key)} className="admin-ui-button admin-ui-button-secondary">{team.ideaLocked ? <><CheckCircle2 size={14} /> 확정됨</> : <><ShieldCheck size={14} /> 확정</>}</button>
                </div>
                <InvestmentGauge team={team} />
                <AiEvaluationSummary team={team} onOpenOpinion={() => onOpenOpinion({ key, ...team })} />
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
function PivotAdminPanel({ room, teams, students, settings, onForce, onContinue }) {
  const activeTeams = getTeamEntries(teams).filter(([key]) => Object.values(students).some((student) => student.team === key));
  const scenarios = settings?.pivotScenarios || PIVOT_SCENARIOS;
  const complete = activeTeams.every(([, team]) => team.midDecision?.resolvedScenario);
  return (
    <section className="pivot-admin-panel">
      <div className="pivot-admin-heading">
        <div><p>12개월 피벗 의사결정</p><h2>팀별 선택 완료 현황</h2></div>
        <button type="button" disabled={!complete} onClick={onContinue}><Play size={18} /> 계속 진행</button>
      </div>
      <div className="pivot-admin-grid">
        {activeTeams.map(([key, team]) => {
          const members = getStudentsByTeam(students, key);
          const votes = team.midDecision?.votes || {};
          const voted = members.filter((member) => votes[member.uid]).length;
          const resolved = team.midDecision?.resolvedScenario;
          const scenario = scenarios.find((item) => item.id === resolved);
          return (
            <article key={key} className={resolved ? "pivot-team-done" : ""}>
              <div><strong>{team.teamName}</strong><span>{voted}/{members.length}명 선택 완료</span></div>
              {resolved ? <b>{scenario?.icon} {scenario?.title || resolved}</b> : <button type="button" onClick={() => onForce(key, true)}>교사 강제 확정</button>}
            </article>
          );
        })}
      </div>
      {!complete && <p className="pivot-admin-help">수업이 지연되면 교사가 현재 표를 기준으로 강제 확정할 수 있습니다. 투표가 전혀 없으면 첫 번째 카드가 적용됩니다.</p>}
    </section>
  );
}

/** Per-phase completion summary with the names of students/teams still pending. */
function PhaseProgressPanel({ room, teams, students }) {
  const [showPending, setShowPending] = useState(false);
  const assigned = Object.values(students).filter((student) => student.team && teams[student.team]);
  const activeTeams = getTeamEntries(teams).filter(([key]) => assigned.some((student) => student.team === key));
  let title = "";
  let done = 0;
  let total = 0;
  let pending = [];

  switch (room.status) {
    case STATUSES.WAITING: {
      title = "팀 배정";
      total = Object.keys(students).length;
      done = assigned.length;
      pending = Object.values(students).filter((student) => !student.team).map((student) => student.nickname);
      break;
    }
    case STATUSES.C_LEVEL: {
      title = "C레벨 자가진단 완료";
      total = assigned.length;
      done = assigned.filter((student) => student.cLevelResult?.key).length;
      pending = assigned.filter((student) => !student.cLevelResult?.key).map((student) => student.nickname);
      break;
    }
    case STATUSES.CARD_SELECT: {
      title = "카드 선택 완료 팀";
      total = activeTeams.length;
      done = activeTeams.filter(([, team]) => team.trendCard && team.techCard).length;
      pending = activeTeams.filter(([, team]) => !(team.trendCard && team.techCard)).map(([, team]) => team.teamName);
      break;
    }
    case STATUSES.IDEATION:
    case STATUSES.AI_EVALUATION: {
      title = room.status === STATUSES.IDEATION ? "사업계획 제출 · 확정" : "사업계획 확정";
      total = activeTeams.length;
      done = activeTeams.filter(([, team]) => team.ideaLocked).length;
      pending = activeTeams
        .filter(([, team]) => !team.ideaLocked)
        .map(([, team]) => `${team.teamName}${team.idea && team.ideaSubmitted !== false ? " (확정 대기)" : " (미제출)"}`);
      break;
    }
    case STATUSES.INVESTMENT: {
      title = "투자 확정";
      total = assigned.length;
      done = assigned.filter((student) => student.investmentSubmitted).length;
      pending = assigned.filter((student) => !student.investmentSubmitted).map((student) => student.nickname);
      break;
    }
    default:
      return (
        <div className="progress-panel">
          <p className="progress-panel-title">진행 현황</p>
          <p className="text-sm font-bold text-slate-500">{room.status === STATUSES.SIMULATION ? `${room.currentMonth || 0} / ${SIMULATION_MONTHS}개월 진행` : "수업이 완료되었습니다."}</p>
          {room.status === STATUSES.SIMULATION && (
            <div className="progress-bar"><b style={{ width: `${Math.min(100, ((room.currentMonth || 0) / SIMULATION_MONTHS) * 100)}%` }} /></div>
          )}
        </div>
      );
  }

  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="progress-panel-title">{title}</p>
        <b className={`progress-count ${total && done === total ? "progress-count-done" : ""}`}>{done} / {total}{total && done === total ? " · 모두 완료" : ""}</b>
      </div>
      <div className="progress-bar"><b style={{ width: `${percent}%` }} /></div>
      {pending.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowPending((current) => !current)} className="text-xs font-black text-indigo-700">
            미완료 {pending.length}명/팀 {showPending ? "접기" : "보기"}
          </button>
          {showPending && (
            <div className="mt-2 flex flex-wrap gap-1">
              {pending.map((name) => <span key={name} className="progress-pending-chip">{name}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PhaseTimerControl({ timer, onStart, onExtend, onStop }) {
  const active = Boolean(timer?.endsAt);
  return (
    <div className="timer-panel print:hidden">
      <div className="flex items-center justify-between gap-2">
        <p className="progress-panel-title">단계 타이머</p>
        {active && <button type="button" onClick={onStop} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700 ring-1 ring-rose-200">종료</button>}
      </div>
      {active ? (
        <>
          <PhaseTimerDisplay timer={timer} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={onExtend} className="timer-preset">+1분</button>
            {PHASE_TIMER_PRESETS_MIN.map((minutes) => (
              <button key={minutes} type="button" onClick={() => onStart(minutes)} className="timer-preset">{minutes}분 재시작</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="text-xs font-bold text-slate-500">학생 화면 상단에 남은 시간이 표시됩니다. 단계를 바꾸면 자동으로 꺼집니다.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PHASE_TIMER_PRESETS_MIN.map((minutes) => (
              <button key={minutes} type="button" onClick={() => onStart(minutes)} className="timer-preset timer-preset-primary">{minutes}분 시작</button>
            ))}
          </div>
        </>
      )}
    </div>
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

function AiConfirmModal({ onCancel, onConfirm }) {
  return createPortal((
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-slate-950/70 p-5">
      <article className="w-full max-w-md rounded-lg bg-white p-6 text-center shadow-lift">
        <p className="text-sm font-bold text-indigo-600">사업계획 AI 평가</p>
        <h2 className="mt-2 text-3xl font-black">AI 분석을 시작할까요?</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">학생의 학습 단계와 아이디어의 발전 가능성을 중심으로 평가합니다. 의미 있는 계획은 보통을 기본으로 강점을 인정하고, 팀별 구체성에 따라 결과를 다르게 판정합니다.</p>
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-left text-xs font-bold leading-5 text-amber-800">한 줄 미만의 입력이나 의미 없는 단어 반복처럼 내용을 판단할 수 없는 경우에만 전체 취약으로 처리합니다.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="touch-button rounded-lg bg-slate-100 px-4 py-3 font-black text-slate-700">취소</button>
          <button type="button" onClick={onConfirm} className="touch-button rounded-lg bg-indigo-600 px-4 py-3 font-black text-white">시작</button>
        </div>
      </article>
    </div>
  ), document.body);
}

function StudentManageModal({ menu, students, teams, onClose, onAssign, onKick, onMove, onSetLeader }) {
  const student = students[menu.uid];
  if (!student) return null;
  const currentTeamKey = student.team || menu.teamKey || "";
  const availableTeams = getTeamEntries(teams).filter(([key]) => key !== currentTeamKey);
  return createPortal((
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-slate-950/70 p-5" onClick={onClose}>
      <article className="w-full max-w-md rounded-lg bg-white p-5 shadow-lift" onClick={(event) => event.stopPropagation()}>
        <p className="text-sm font-bold text-indigo-600">{menu.mode === "waiting" ? "대기 학생 관리" : "팀원 관리"}</p>
        <h2 className="mt-1 text-2xl font-black">{student.nickname}</h2>
        <div className="mt-4 grid gap-2">
          {menu.mode === "assigned" && (
            <button type="button" onClick={() => { onSetLeader(menu.uid, currentTeamKey); onClose(); }} className="touch-button inline-flex items-center justify-center gap-2 rounded-lg bg-amber-50 px-4 py-3 font-black text-amber-700 ring-1 ring-amber-200">
              <Crown size={18} className="text-amber-500" />
              팀장으로 지정
            </button>
          )}
          {availableTeams.map(([key, team]) => (
            <button key={key} type="button" onClick={() => menu.mode === "waiting" ? onAssign(menu.uid, key) : onMove(menu.uid, key)} className="touch-button rounded-lg bg-indigo-50 px-4 py-3 text-left font-black text-indigo-700 ring-1 ring-indigo-100">
              {menu.mode === "waiting" ? "직접 팀 배정" : "다른 팀으로 이동"} · {team.teamName}
            </button>
          ))}
          {availableTeams.length === 0 && <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">이동할 다른 팀이 없습니다.</p>}
          {menu.mode === "waiting" && (
            <button type="button" onClick={() => onKick(menu.uid)} className="touch-button rounded-lg bg-rose-600 px-4 py-3 font-black text-white">
              강퇴
            </button>
          )}
        </div>
        <button type="button" onClick={onClose} className="touch-button mt-4 w-full rounded-lg bg-slate-900 px-4 py-3 font-black text-white">닫기</button>
      </article>
    </div>
  ), document.body);
}

function AiEvaluationSummary({ team, onOpenOpinion }) {
  const [expanded, setExpanded] = useState(false);
  const evaluation = team.aiEvaluation;
  if (!evaluation) {
    return <div className="mt-3 rounded-lg bg-slate-100 px-3 py-3 text-xs font-bold text-slate-500">AI 평가 대기</div>;
  }
  const isFallback = isFallbackEvaluation(evaluation);
  return (
    <div className="mt-3 rounded-lg bg-white/80 p-3 ring-1 ring-slate-200">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-black text-slate-600">AI 평가 결과{team.idea?.serviceName && <span className="ml-1 font-bold text-indigo-700">· {team.idea.serviceName}</span>}</p>
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
              AI 응답 실패 - 기본 평가 기준 적용
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

// The default base asset (1억) fills 30% of the gauge; the diversity bonus and investments extend it.
const GAUGE_BASE_FILL_RATIO = 0.3;

function InvestmentGauge({ team }) {
  const investment = Number(team?.investmentsReceived || 0);
  const baseAsset = getTeamBaseAsset(team);
  const bonusRate = Number(team?.diversity?.rate || 0);
  const fullScale = TEAM_BASE_ASSET / GAUGE_BASE_FILL_RATIO;
  const baseWidth = Math.min(100, (baseAsset / fullScale) * 100);
  const investmentWidth = Math.min(100 - baseWidth, (investment / fullScale) * 100);
  const hasBonus = bonusRate !== 0;
  return (
    <div className="mt-3 rounded-lg bg-white/80 p-3 ring-1 ring-slate-200">
      <div className="investment-gauge-summary">
        <p>
          <span>기본자산{hasBonus && <em className={`gauge-bonus-tag ${bonusRate > 0 ? "gauge-bonus-plus" : "gauge-bonus-minus"}`}>{bonusRate > 0 ? "+" : ""}{bonusRate}%</em>}</span>
          <strong className={hasBonus ? "text-rose-600" : ""}>{formatWon(baseAsset)}</strong>
        </p>
        <p><span>투자유치</span><strong className="text-indigo-700">{formatWon(investment)}</strong></p>
        <p><span>총액</span><strong className="text-slate-950">{formatWon(baseAsset + investment)}</strong></p>
      </div>
      <div className="asset-gauge" role="img" aria-label={`기본자산 ${formatWon(baseAsset)}, 투자유치 ${formatWon(investment)}`}>
        <div className={`asset-gauge-base ${hasBonus ? (bonusRate > 0 ? "asset-gauge-base-plus" : "asset-gauge-base-minus") : ""}`} style={{ width: `${baseWidth}%` }} />
        <div className="asset-gauge-investment" style={{ left: `${baseWidth}%`, width: `${investmentWidth}%` }} />
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
  const isFallback = isFallbackEvaluation(evaluation);
  return createPortal((
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 p-5" onClick={onClose}>
      <article className="max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-lift" onClick={(event) => event.stopPropagation()}>
        <p className="text-sm font-bold text-indigo-600">AI 평가의견</p>
        <h2 className="mt-1 text-3xl font-black">{team.teamName}</h2>
        {team.idea?.serviceName && <p className="mt-1 text-sm font-bold text-slate-600"><span className="text-slate-400">제품 및 서비스명</span> · {team.idea.serviceName}</p>}
        {isFallback && (
          <div className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm font-black text-amber-700 ring-1 ring-amber-200">
            AI 호출 실패로 기본 평가를 표시합니다. {evaluation?.errorMessage || evaluation?.model || ""}
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

function ResultBoard({ rankedTeams, rankedInvestors, teams, students, room }) {
  const winner = rankedTeams[0];
  const podium = [rankedTeams[1], rankedTeams[0], rankedTeams[2]];
  const participantCount = Object.keys(students).length;
  const totalFinal = rankedTeams.reduce((sum, team) => sum + Number(team.currentAsset || 0), 0);
  const totalInitial = rankedTeams.reduce((sum, team) => sum + getAssetChange(team).initial, 0);
  const classRate = totalInitial ? ((totalFinal - totalInitial) / totalInitial) * 100 : 0;
  const finishedAt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short" }).format(new Date(room.updatedAt || Date.now()));
  const insights = buildResultInsights(teams);

  return (
    <section className="print-report report-board">
      <header className="report-header">
        <div>
          <p className="report-kicker"><Trophy size={16} /> FINAL REPORT</p>
          <h2>최종 순위 및 사업 리포트</h2>
          <p className="report-meta">{room.roomTitle} · 방 코드 {room.roomId} · 참가자 {participantCount}명 · 팀 {rankedTeams.length}개 · {finishedAt}</p>
        </div>
        <div className="report-kpis">
          <div>
            <p>{SIMULATION_MONTHS}개월 후 학급 총 자산</p>
            <strong>{formatWon(totalFinal)}</strong>
          </div>
          <div className={classRate >= 0 ? "report-kpi-up" : "report-kpi-down"}>
            <p>학급 평균 증감율</p>
            <strong>{classRate >= 0 ? "+" : ""}{classRate.toFixed(1)}%</strong>
          </div>
        </div>
      </header>

      <section className="result-analysis-dashboard">
        <div className="result-analysis-heading"><span>DATA BADGES</span><h3>최종 분석 대시보드</h3></div>
        <div className="result-analysis-grid">
          {insights.map((insight) => (
            <article key={insight.label}><span>{insight.icon}</span><div><p>{insight.label}</p><strong>{insight.value} <em>(최종결과 {insight.rank}위)</em></strong></div></article>
          ))}
        </div>
      </section>

      <InvestorRanking investors={rankedInvestors} />

      {winner && (
        <article className="winner-report-card mt-5 overflow-hidden rounded-lg bg-gradient-to-br from-amber-300 via-orange-500 to-rose-600 p-1 shadow-[0_18px_45px_rgba(245,158,11,0.35)]">
          <div className="rounded-lg bg-white/95 p-5">
            <div className="winner-crown-badge"><Crown size={42} /><span>1위 팀</span></div>
            <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <h3 className="text-4xl font-black text-slate-950">{winner.teamName}</h3>
                <p className="mt-2 text-base font-black text-indigo-700">{winner.idea?.serviceName || winner.idea?.product || "사업 아이디어"}</p>
                {winner.idea?.tagline && <p className="mt-1 text-sm font-bold text-slate-500">“{winner.idea.tagline}”</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {winner.diversity && <span className={`diversity-badge diversity-badge-${winner.diversity.key}`}><Sparkles size={13} /> {winner.diversity.label} <b>{winner.diversity.rate > 0 ? "+" : ""}{winner.diversity.rate}%</b></span>}
                  <AiGradeTally team={winner} />
                </div>
              </div>
              <AssetChangeSummary team={winner} featured />
            </div>
            <AssetTrendChart team={winner} className="mt-4" />
          </div>
        </article>
      )}

      <div className="report-podium mt-5">
        {podium.map((team, index) => {
          if (!team) return <div key={index} />;
          const place = index === 1 ? 1 : index === 0 ? 2 : 3;
          const change = getAssetChange(team);
          return (
            <div key={team.key} className={`report-podium-step report-podium-${place}`}>
              <span className={`rank-medal rank-medal-${place}`}>{place}</span>
              <p className="report-podium-name">{team.teamName}</p>
              <p className={`report-podium-asset ${change.positive ? "text-emerald-600" : "text-rose-600"}`}>{formatWon(change.final)}</p>
              <p className={`report-podium-rate ${change.positive ? "report-rate-up" : "report-rate-down"}`}>{change.positive ? "▲ +" : "▼ "}{change.rate.toFixed(1)}%</p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4">
        {rankedTeams.map((team, index) => {
          const change = getAssetChange(team);
          const members = getStudentsByTeam(students, team.key);
          const pivotScenario = getPivotScenario(room.simulationSettings, team.pivotScenarioId || team.midDecision?.resolvedScenario);
          return (
            <article key={team.key} className={`report-team-card ${index === 0 ? "report-team-card-winner" : ""}`}>
              <div className="report-team-head">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`rank-medal rank-medal-lg rank-medal-${Math.min(index + 1, 4)}`}>{index + 1}</span>
                  <div className="min-w-0">
                    <h3 className="truncate text-xl font-black">{team.teamName}</h3>
                    <p className="truncate text-sm font-bold text-indigo-700">{team.idea?.serviceName || team.idea?.product || "사업 아이디어 미작성"}</p>
                  </div>
                </div>
                <div className={`report-final-asset ${change.positive ? "report-final-up" : "report-final-down"}`}>
                  <p>최종 총 자산</p>
                  <strong>{formatWon(change.final)}</strong>
                  <span>{change.positive ? "▲ +" : "▼ "}{formatWon(change.delta)} ({change.positive ? "+" : ""}{change.rate.toFixed(1)}%)</span>
                </div>
              </div>

              {pivotScenario && <div className="report-pivot-choice"><span>{pivotScenario.icon}</span><div><small>12개월 피벗 전략</small><strong>{pivotScenario.title}</strong><em>{pivotEffectTextForReport(pivotScenario)}</em></div></div>}

              <AssetChangeSummary team={team} className="mt-4" />

              <div className="report-team-grid mt-4">
                <div className="report-team-block">
                  <p className="report-block-title"><Users size={14} /> 팀원 {members.length}명</p>
                  <div className="flex flex-wrap gap-2">
                    {members.map((member) => (
                      <span key={member.uid} className="report-member-chip">
                        {team.leaderId === member.uid && <Crown size={12} className="text-amber-500" />}
                        {member.nickname}
                        {member.cLevelResult?.key && <b className={`c-level-mini-badge c-level-mini-${member.cLevelResult.key}`}>{member.cLevelResult.key}</b>}
                      </span>
                    ))}
                    {members.length === 0 && <span className="text-sm text-slate-400">팀원 없음</span>}
                  </div>
                  {team.diversity && (
                    <span className={`diversity-badge diversity-badge-${team.diversity.key} mt-3`}><Sparkles size={13} /> {team.diversity.label} <b>{team.diversity.rate > 0 ? "+" : ""}{team.diversity.rate}%</b></span>
                  )}
                </div>
                <div className="report-team-block">
                  <p className="report-block-title"><Lightbulb size={14} /> 사업 개요</p>
                  <dl className="report-dl">
                    <dt>트렌드</dt><dd>{team.trendCard?.title || "미선택"}</dd>
                    <dt>기술카드</dt><dd>{team.techCard?.title || "미선택"}</dd>
                    <dt>문제정의</dt><dd>{team.idea?.problem || "-"}</dd>
                    <dt>고객</dt><dd>{(team.idea?.customers || []).join(", ") || "-"}</dd>
                    <dt>제품/서비스</dt><dd>{team.idea?.product || team.idea?.solution || "-"}</dd>
                    <dt>수익모델</dt><dd>{(team.idea?.revenueModels || []).join(", ") || "-"}</dd>
                  </dl>
                </div>
                <div className="report-team-block">
                  <p className="report-block-title"><ClipboardCheck size={14} /> AI 평가</p>
                  <AiGradeTally team={team} />
                  <p className="mt-2 text-sm leading-6 text-slate-600">{team.aiEvaluation?.opinion || "AI 평가 의견이 없습니다."}</p>
                  <div className="report-capital mt-3">
                    <span>기본 자산 {formatWon(getTeamBaseAsset(team))}</span>
                    <span>투자 유치 {formatWon(team.investmentsReceived || 0)}</span>
                    <span>총액 {formatWon(getTeamBaseAsset(team) + Number(team.investmentsReceived || 0))}</span>
                  </div>
                </div>
              </div>

              <AssetTrendChart team={team} className="mt-4" />
            </article>
          );
        })}
      </div>
    </section>
  );
}

function pivotEffectTextForReport(scenario) {
  const primary = Number(scenario.primaryMultiplier || 1);
  const effects = {
    government_support: `F09 이벤트 ${primary}배`, professional_management: `최종 자산 ${Number(scenario.dilutionRate || 0)}% 지분 희석`, downsizing: `모든 이벤트 ${primary}배`, aggressive_expansion: `모든 이벤트 ${primary}배`, turnaround: "최저 등급 팩터 상향", early_exit: "13~24개월 자산 동결", global_expansion: `F01·F04 ${primary}배`, ip_protection: "F14 양호·도용 피해 완화", cofounder_reset: "팀 리스크 완화", crowdfunding: `시장 이벤트 ${primary}배`
  };
  return effects[scenario.id] || scenario.effectLabel || "";
}

function InvestorRanking({ investors = [], compact = false, currentUid = "" }) {
  const top = investors.slice(0, compact ? 3 : 10);
  const myIndex = investors.findIndex((investor) => investor.uid === currentUid);
  return (
    <section className={`investor-ranking ${compact ? "investor-ranking-compact" : ""}`}>
      <div className="investor-ranking-heading"><div><p>나는 투자왕</p><h3>투자 포트폴리오 TOP {compact ? 3 : 10}</h3></div><Crown size={28} /></div>
      <div className="investor-ranking-list">
        {top.map((investor, index) => (
          <div key={investor.uid} className={`${index < 3 ? `investor-top-${index + 1}` : ""} ${investor.uid === currentUid ? "investor-me" : ""}`}>
            <b>{index + 1}</b><span><strong>{investor.nickname}</strong><small>{investor.team ? `${investor.team}팀 · ` : ""}수익률 {investor.portfolio.rate >= 0 ? "+" : ""}{investor.portfolio.rate.toFixed(1)}%</small></span><em>{formatWon(investor.portfolio.finalValue)}</em>
          </div>
        ))}
      </div>
      {compact && myIndex >= 0 && <div className="investor-my-rank"><span>내 투자 순위</span><strong>{myIndex + 1}위 · {formatWon(investors[myIndex].portfolio.finalValue)}</strong></div>}
      {!top.length && <p className="investor-ranking-empty">확정된 투자 내역이 없습니다.</p>}
    </section>
  );
}

function AiGradeTally({ team }) {
  if (!team?.aiEvaluation) return null;
  const counts = countAiGrades(team);
  return (
    <div className="ai-grade-tally" aria-label="AI 평가 등급 분포">
      <span className="ai-grade-tally-good">양호 {counts.양호}</span>
      <span className="ai-grade-tally-mid">보통 {counts.보통}</span>
      <span className="ai-grade-tally-weak">취약 {counts.취약}</span>
    </div>
  );
}

function QrModal({ value, roomId, onClose }) {
  return createPortal((
    <div className="qr-popover-backdrop" onClick={onClose}>
      <div className="qr-popover" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={onClose} className="qr-popover-close">닫기</button>
        <p className="text-sm font-bold text-indigo-600">학생 입장 QR</p>
        <h2 className="mt-1 text-3xl font-black">방 코드 {roomId}</h2>
        <div className="mt-6 flex justify-center"><QRCodeSVG value={value} size={360} /></div>
        <p className="mt-4 break-all text-sm text-slate-500">{value}</p>
      </div>
    </div>
  ), document.body);
}

function makeAiEvaluationMessage(evaluations = {}) {
  const values = Object.values(evaluations);
  const fallbackCount = values.filter((evaluation) => isFallbackEvaluation(evaluation)).length;
  const aiSuccessCount = Math.max(0, values.length - fallbackCount);
  if (fallbackCount > 0) {
    return `AI 평가 완료: Gemini 성공 ${aiSuccessCount}팀, 기본 평가 적용 ${fallbackCount}팀. 평가의견에서 실패 사유를 확인하세요.`;
  }
  return `AI 사업계획서 평가가 완료되었습니다. 팀 패널에서 14개 지표와 1~2줄 종합의견을 확인하세요.`;
}
