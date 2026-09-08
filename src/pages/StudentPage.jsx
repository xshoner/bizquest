import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Award, Check, Crown, Lightbulb, Pencil, RotateCcw, Send } from "lucide-react";
import { auth, onAuthStateChanged, setDoc, signInAnonymously } from "../firebase.js";
import {
  C_LEVEL_KEYS,
  C_LEVEL_ROLES,
  C_LEVEL_QUESTIONS,
  C_LEVEL_TYPES,
  CUSTOMER_OPTIONS,
  BUSINESS_FACTORS,
  MARKETING_OPTIONS,
  PROBLEM_OPTIONS,
  REVENUE_OPTIONS,
  STATUSES,
  STATUS_LABELS,
  TECH_CARDS,
  TREND_CARDS
} from "../data/gameData.js";
import { formatWon, getTeamBaseAsset, makeStudent, normalizeTeamName } from "../lib/game.js";
import { studentDocRef, useRoom } from "../hooks/useRoom.js";
import { updateOwnStudent, updateOwnTeam } from "../lib/roomStore.js";
import { getTechCardImage, getTrendCardImage } from "../lib/assets.js";
import { PhaseTimerDisplay } from "../components/shared/PhaseTimer.jsx";
import { AiEvaluationShowcase, ResultFinalizingShowcase, ResultFireworks } from "../components/shared/Effects.jsx";
import { MascotAvatar } from "../components/shared/MascotAvatar.jsx";
import { installAudioUnlock, playPhaseTransition } from "../lib/audio.js";
import StudentResult from "./student/ResultStage.jsx";
import { Simulation as SimulationStage, StudentAiEvaluationReport } from "./student/SimulationStage.jsx";
import PivotVoteStage from "./student/PivotVoteStage.jsx";
import InvestmentStage from "./student/InvestmentStage.jsx";
import WaitingRoomStage from "./student/WaitingRoomStage.jsx";

const STALE_SCREEN_MESSAGE = "화면 정보가 오래되어 저장하지 못했습니다. 새로고침 버튼을 누르거나 다시 QR코드를 촬영하세요.";

function writeErrorMessage(err, fallback = "저장하지 못했습니다. 네트워크를 확인하고 다시 시도하세요.") {
  if (err?.code === "permission-denied") return STALE_SCREEN_MESSAGE;
  if (err?.code === "unavailable") return "네트워크 연결이 불안정합니다. 잠시 후 다시 시도하세요.";
  return err?.message || fallback;
}

function reloadPage() {
  window.location.reload();
}

function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  const showReload = message === STALE_SCREEN_MESSAGE;
  return (
    <div role="alert" className="mt-3 rounded-lg bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 ring-1 ring-rose-200">
      <div className="flex items-start justify-between gap-3">
        <span>{message}</span>
        {onDismiss && <button type="button" onClick={onDismiss} className="shrink-0 font-black">닫기</button>}
      </div>
      {showReload && (
        <button type="button" onClick={reloadPage} className="touch-button mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-3 font-black text-white">
          <RotateCcw size={16} /> 새로고침
        </button>
      )}
    </div>
  );
}

export default function StudentPage() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const ownerUid = searchParams.get("owner") || "";
  const [refreshKey, setRefreshKey] = useState(0);
  const { room, loading, error } = useRoom(roomId, ownerUid, refreshKey);
  const [nickname, setNickname] = useState("");

  useEffect(() => installAudioUnlock(), []);

  // Phones suspend the realtime connection while asleep. Re-subscribe whenever the page becomes
  // visible again (or the network comes back) so the current phase is loaded automatically.
  useEffect(() => {
    function resync() {
      if (document.visibilityState === "visible") setRefreshKey((current) => current + 1);
    }
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("online", resync);
    window.addEventListener("pageshow", resync);
    return () => {
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("online", resync);
      window.removeEventListener("pageshow", resync);
    };
  }, []);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [authUid, setAuthUid] = useState("");
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.uid) {
        setAuthUid(user.uid);
        localStorage.setItem(`startupHero:${roomId}:uid`, user.uid);
        localStorage.setItem("startupHero:lastRoomId", roomId);
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, [roomId]);

  const student = authUid ? room?.students?.[authUid] : null;

  async function joinRoom() {
    const trimmed = nickname.trim();
    if (!trimmed) return;
    if (trimmed.length > 20) {
      setJoinError("닉네임은 20자 이내로 입력하세요.");
      return;
    }
    setJoining(true);
    setJoinError("");
    try {
      const credential = auth.currentUser ? { user: auth.currentUser } : await signInAnonymously(auth);
      const nextUid = credential.user.uid;
      // Each student owns exactly one document; the room document is never touched from here.
      await setDoc(studentDocRef(ownerUid, roomId, nextUid), makeStudent(nextUid, trimmed), { merge: true });
      setAuthUid(nextUid);
      localStorage.setItem(`startupHero:${roomId}:uid`, nextUid);
      localStorage.setItem("startupHero:lastRoomId", roomId);
    } catch (err) {
      setJoinError(writeErrorMessage(err, "입장하지 못했습니다. 네트워크를 확인하고 다시 시도하세요."));
    } finally {
      setJoining(false);
    }
  }

  if (loading || !authReady) return <MobileFrame>방 정보를 불러오는 중입니다.</MobileFrame>;
  if (error) {
    return (
      <MobileFrame>
        <div className="rounded-lg bg-white p-5 shadow-lift">
          <p className="font-bold text-rose-700">{error}</p>
          <p className="mt-2 text-sm text-slate-500">새로고침 버튼을 누르거나 다시 QR코드를 촬영하세요.</p>
          <button type="button" onClick={reloadPage} className="touch-button mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-4 text-lg font-black text-white"><RotateCcw size={18} /> 새로고침</button>
        </div>
      </MobileFrame>
    );
  }
  if (!ownerUid) return <MobileFrame><p>잘못된 QR 주소입니다. 교사가 새 QR을 보여주면 다시 입장하세요.</p><Link className="mt-4 inline-block font-bold text-indigo-600" to="/">메인으로 이동</Link></MobileFrame>;
  if (!room) return <MobileFrame><p>존재하지 않는 방입니다.</p><Link className="mt-4 inline-block font-bold text-indigo-600" to="/">메인으로 이동</Link></MobileFrame>;

  if (!student) {
    return (
      <MobileFrame>
        <div className="flex min-h-[80vh] flex-col justify-center">
          <p className="text-sm font-bold text-indigo-600">스타트업 히어로</p>
          <h1 className="mt-2 text-3xl font-black">{room.roomTitle}</h1>
          <p className="mt-2 text-slate-500">닉네임을 입력하고 체험에 입장하세요. 같은 브라우저로 다시 들어오면 기존 참여 정보가 유지됩니다.</p>
          <input value={nickname} maxLength={20} onChange={(event) => setNickname(event.target.value)} onKeyDown={(event) => event.key === "Enter" && joinRoom()} placeholder="예: 김창업" className="mt-6 rounded-lg border border-slate-200 px-4 py-4 text-lg outline-none focus:border-indigo-500" />
          <button disabled={joining} onClick={joinRoom} className="touch-button mt-3 rounded-lg bg-indigo-600 px-4 py-4 text-lg font-black text-white disabled:opacity-50">{joining ? "입장 중..." : "입장"}</button>
          <ErrorBanner message={joinError} onDismiss={() => setJoinError("")} />
        </div>
      </MobileFrame>
    );
  }

  return (
    <MobileFrame>
      <PhaseTransition status={room.status} />
      {room.resultFinalizing && <ResultFinalizingShowcase variant="phase" />}
      <ResultFireworks status={room.status} />
      <StudentHeader room={room} uid={authUid} student={student} />
      {room.sysMessage && <div className="ticker-pulse mb-4 rounded-lg bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700">{room.sysMessage}</div>}
      {room.status === STATUSES.WAITING && <WaitingRoomStage room={room} uid={authUid} />}
      {room.status === STATUSES.C_LEVEL && <CLevelDiagnosis room={room} uid={authUid} student={student} />}
      {room.status === STATUSES.CARD_SELECT && <CardSelect room={room} uid={authUid} student={student} />}
      {room.status === STATUSES.IDEATION && <Ideation room={room} uid={authUid} student={student} />}
      {room.status === STATUSES.AI_EVALUATION && <AiEvaluation room={room} student={student} />}
      {[STATUSES.INVESTMENT, STATUSES.SIMULATION, STATUSES.RESULT].includes(room.status) && <TeamFundingSummary room={room} student={student} />}
      {room.status === STATUSES.INVESTMENT && <InvestmentStage room={room} uid={authUid} student={student} />}
      {room.status === STATUSES.SIMULATION && <SimulationStage room={room} student={student} />}
      {room.status === STATUSES.SIMULATION && ["voting", "ready"].includes(room.pivotPhase) && <PivotVoteStage room={room} uid={authUid} student={student} />}
      {room.status === STATUSES.RESULT && <StudentResult room={room} student={student} />}
    </MobileFrame>
  );
}

function PhaseTransition({ status }) {
  const previous = useRef(status);
  const [visibleStatus, setVisibleStatus] = useState(null);

  useEffect(() => {
    if (previous.current && previous.current !== status) {
      playPhaseTransition(status);
      setVisibleStatus(status);
      const timer = window.setTimeout(() => setVisibleStatus(null), 3800);
      previous.current = status;
      return () => window.clearTimeout(timer);
    }
    previous.current = status;
    return undefined;
  }, [status]);

  if (!visibleStatus) return null;

  return (
    <div className="phase-overlay">
      <div className="phase-burst">
        <p className="text-sm font-black text-amber-200">다음 미션 공개</p>
        <h2 className="mt-3 break-keep text-4xl font-black text-white">이번은<br />{STATUS_LABELS[visibleStatus]} 단계!</h2>
        <p className="mt-4 text-sm font-bold text-indigo-100">팀원들과 화면을 확인하고 바로 움직이세요.</p>
      </div>
    </div>
  );
}

function MobileFrame({ children }) {
  return <section className="mx-auto min-h-screen max-w-md bg-[#f5f7fb] px-4 py-5">{children}</section>;
}

const STUDENT_PHASES = [
  STATUSES.WAITING,
  STATUSES.C_LEVEL,
  STATUSES.CARD_SELECT,
  STATUSES.IDEATION,
  STATUSES.AI_EVALUATION,
  STATUSES.INVESTMENT,
  STATUSES.SIMULATION,
  STATUSES.RESULT
];

/** Eight-step progress strip: done steps filled, current step highlighted. */
function StepIndicator({ status }) {
  const currentIndex = Math.max(0, STUDENT_PHASES.indexOf(status));
  return (
    <ol className="step-indicator" aria-label={`전체 8단계 중 ${currentIndex + 1}단계`}>
      {STUDENT_PHASES.map((phase, index) => (
        <li
          key={phase}
          className={index < currentIndex ? "step-done" : index === currentIndex ? "step-current" : ""}
          aria-current={index === currentIndex ? "step" : undefined}
          title={STATUS_LABELS[phase]}
        >
          <span>{index + 1}</span>
        </li>
      ))}
    </ol>
  );
}

function StudentHeader({ room, uid, student }) {
  const myTeam = room.teams?.[student.team];
  const isLeader = myTeam?.leaderId === uid;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(myTeam?.teamName || "");
  const savingRef = useRef(false);

  useEffect(() => {
    setName(myTeam?.teamName || "");
  }, [myTeam?.teamName]);

  async function saveTeamName() {
    if (!student.team || !isLeader || savingRef.current) return;
    const nextName = normalizeTeamName(name.trim() || myTeam.teamName).slice(0, 10);
    setEditing(false);
    if (nextName === myTeam.teamName) return;
    savingRef.current = true;
    try {
      await updateOwnTeam(room.ownerUid, room.roomId, student.team, { teamName: nextName }, `${nextName}으로 팀명이 변경되었습니다.`);
    } catch {
      setName(myTeam.teamName || "");
    } finally {
      savingRef.current = false;
    }
  }

  return (
    <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-slate-200 bg-[#f5f7fb]/95 px-4 py-3 backdrop-blur">
      <p className="min-w-0 truncate text-xs font-bold text-indigo-600">{room.roomTitle} · {STATUS_LABELS[room.status]}</p>
      <StepIndicator status={room.status} />
      <PhaseTimerDisplay timer={room.phaseTimer} compact />
      <div className="student-identity-bar">
        <div className="student-identity-card student-identity-person">
          <span className="student-identity-label">내 이름</span>
          <div className="student-name-wrap">
            <h1 className="min-w-0 truncate">{student.nickname}</h1>
            {student.cLevelResult?.key && <span className={`student-header-c-level c-level-mini-${student.cLevelResult.key}`}>{student.cLevelResult.key}</span>}
          </div>
        </div>
        <div className="student-identity-card student-identity-team">
          <span className="student-identity-label">우리 팀</span>
          <div className="student-team-name-row">
          {myTeam && <MascotAvatar mascotId={myTeam.mascot} size="tiny" />}
          {isLeader && <Crown size={14} className="text-amber-300" />}
          {editing ? (
            <input value={name} maxLength={10} onChange={(event) => setName(event.target.value)} onBlur={saveTeamName} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} autoFocus />
          ) : (
            <strong>{myTeam?.teamName || "팀 미선택"}</strong>
          )}
          {isLeader && !editing && <button onClick={() => setEditing(true)} title="팀 이름 변경"><Pencil size={14} /></button>}
          </div>
        </div>
      </div>
    </header>
  );
}
function CLevelDiagnosis({ room, uid, student }) {
  const savedResult = student.cLevelResult;
  const [started, setStarted] = useState(Boolean(savedResult));
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState(Array(C_LEVEL_QUESTIONS.length).fill(null));
  const [result, setResult] = useState(savedResult || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [celebrating, setCelebrating] = useState(false);
  const question = C_LEVEL_QUESTIONS[current];
  const selected = answers[current];
  const progress = result ? 100 : Math.round((answers.filter((answer) => answer !== null).length / C_LEVEL_QUESTIONS.length) * 100);

  useEffect(() => {
    if (savedResult) {
      setResult(savedResult);
      setStarted(true);
    }
  }, [savedResult?.key]);

  useEffect(() => {
    if (!celebrating) return undefined;
    const timer = window.setTimeout(() => setCelebrating(false), 4200);
    return () => window.clearTimeout(timer);
  }, [celebrating]);

  async function finishDiagnosis() {
    const scores = C_LEVEL_KEYS.map(() => 0);
    C_LEVEL_QUESTIONS.forEach((item, index) => {
      const answerIndex = answers[index];
      if (answerIndex === null) return;
      item.opts[answerIndex].scores.forEach((score, typeIndex) => {
        scores[typeIndex] += score;
      });
    });
    const topScore = Math.max(...scores);
    const topIndex = scores.indexOf(topScore);
    const type = C_LEVEL_TYPES[topIndex];
    const payload = {
      key: type.key,
      title: type.title,
      scores,
      completedAt: Date.now()
    };
    setSaving(true);
    setError("");
    try {
      await updateOwnStudent(room.ownerUid, room.roomId, uid, { cLevelResult: payload });
      setResult(payload);
      setCelebrating(true);
    } catch (err) {
      setError(writeErrorMessage(err, "진단 결과를 저장하지 못했습니다. 다시 시도하세요."));
    } finally {
      setSaving(false);
    }
  }

  function chooseOption(index) {
    const next = [...answers];
    next[current] = index;
    setAnswers(next);
  }

  if (!student.team) return <Notice>먼저 대기실에서 팀을 선택해야 합니다.</Notice>;

  if (!started) {
    return (
      <section className="c-level-screen c-level-intro">
        <div className="c-level-progress">
          <span>0 / {C_LEVEL_QUESTIONS.length}</span>
          <i><b style={{ width: "0%" }} /></i>
        </div>
        <div className="c-level-intro-card">
          <p className="c-level-badge">BizQuest 적성 테스트</p>
          <h2>나는 어떤<br /><span>C레벨</span>일까?</h2>
          <p>질문에 답하면 창업팀 안에서 나에게 어울리는 역할을 분석합니다.</p>
          <div className="c-level-chip-row">
            {C_LEVEL_KEYS.map((key) => <span key={key}>{key}</span>)}
          </div>
          <button type="button" onClick={() => setStarted(true)} className="c-level-start-button">테스트 시작하기</button>
        </div>
      </section>
    );
  }

  if (result) {
    const type = C_LEVEL_TYPES.find((item) => item.key === result.key) || C_LEVEL_TYPES[0];
    const scores = Array.isArray(result.scores) ? result.scores : C_LEVEL_KEYS.map((key) => key === type.key ? 1 : 0);
    const maxScore = Math.max(1, ...scores);
    return (
      <section className="c-level-screen">
        {celebrating && <div className="result-fireworks c-level-result-fireworks" aria-hidden="true">{Array.from({ length: 22 }, (_, index) => <span key={index} />)}</div>}
        <div className="c-level-result-hero">
          <p className="c-level-result-label">{type.key}</p>
          <p className="c-level-role-description">{C_LEVEL_ROLES[type.key].fullName} : {C_LEVEL_ROLES[type.key].description}</p>
          <h2>{type.title}</h2>
          <p>{type.sub}</p>
          <div className="c-level-score-bars">
            {C_LEVEL_KEYS.map((key, index) => (
              <div key={key} className="c-level-score-row">
                <span>{key}</span>
                <i><b className={key === type.key ? "top" : ""} style={{ width: `${Math.round((Number(scores[index] || 0) / maxScore) * 100)}%` }} /></i>
                <em>{Number(scores[index] || 0)}점</em>
              </div>
            ))}
          </div>
        </div>
        <div className="c-level-result-grid">
          <article>
            <strong>핵심 강점</strong>
            <p>{type.strength}</p>
            <div>{type.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          </article>
          <article>
            <strong>성장 포인트</strong>
            <p>{type.weakness}</p>
          </article>
        </div>
        <article className="c-level-jobs">
          <strong>어울리는 역할</strong>
          {type.jobs.map((job) => <p key={job}>{job}</p>)}
        </article>
        <article className="c-level-role-list">
          <h3 className="font-black">C레벨 역할 알아보기</h3>
          {C_LEVEL_KEYS.map((key) => <div key={key}><strong>{key}</strong><p>{C_LEVEL_ROLES[key].fullName} : {C_LEVEL_ROLES[key].description}</p></div>)}
        </article>
        <Notice>자가진단이 완료되었습니다. 교사가 다음 단계로 이동할 때까지 기다려 주세요.</Notice>
      </section>
    );
  }

  return (
    <section className="c-level-screen">
      <div className="c-level-progress">
        <span>{answers.filter((answer) => answer !== null).length} / {C_LEVEL_QUESTIONS.length}</span>
        <i><b style={{ width: `${progress}%` }} /></i>
      </div>
      <div className="c-level-question-card">
        <p>질문 {current + 1} / {C_LEVEL_QUESTIONS.length}</p>
        <h2>{question.text}</h2>
        <div className="c-level-options">
          {question.opts.map((option, index) => (
            <button key={option.text} type="button" onClick={() => chooseOption(index)} className={selected === index ? "selected" : ""}>
              <span>{["A", "B", "C", "D"][index]}</span>
              {option.text}
            </button>
          ))}
        </div>
      </div>
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <div className="c-level-nav-buttons">
        <button type="button" disabled={current === 0} onClick={() => setCurrent(current - 1)}>이전</button>
        {current < C_LEVEL_QUESTIONS.length - 1 ? (
          <button type="button" disabled={selected === null} onClick={() => setCurrent(current + 1)}>다음</button>
        ) : (
          <button type="button" disabled={selected === null || saving} onClick={finishDiagnosis}>{saving ? "저장 중..." : "결과 보기"}</button>
        )}
      </div>
    </section>
  );
}

function CardSelect({ room, uid, student }) {
  const myTeam = room.teams?.[student.team];
  const isLeader = myTeam?.leaderId === uid;
  const bothSaved = Boolean(myTeam?.trendCard && myTeam?.techCard);
  const [editing, setEditing] = useState(!bothSaved);
  const [step, setStep] = useState(myTeam?.trendCard && !myTeam?.techCard ? "tech" : "trend");
  const [selectedTrend, setSelectedTrend] = useState(myTeam?.trendCard || null);
  const [selectedTech, setSelectedTech] = useState(myTeam?.techCard || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSelectedTrend(myTeam?.trendCard || null);
    setSelectedTech(myTeam?.techCard || null);
    if (myTeam?.trendCard && !myTeam?.techCard) setStep("tech");
    if (myTeam?.trendCard && myTeam?.techCard) setEditing(false);
  }, [myTeam?.trendCard, myTeam?.techCard]);

  const canSelect = isLeader && editing;

  function openStep(nextStep) {
    if (!isLeader) return;
    if (nextStep === "tech" && !selectedTrend) return;
    setStep(nextStep);
    if (!editing) setEditing(true);
  }

  async function confirmTrend() {
    if (!selectedTrend || !canSelect || busy) return;
    // First pass: publish the trend right away so the teacher sees progress.
    // Re-selection (both cards already saved): keep the change local until "확인" saves both together.
    if (bothSaved) {
      setStep("tech");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await updateOwnTeam(room.ownerUid, room.roomId, student.team, { trendCard: selectedTrend }, `${myTeam?.teamName || "팀"}이 ${selectedTrend.title} 트렌드 카드를 선택했습니다.`);
      setStep("tech");
    } catch (err) {
      setError(writeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmTech() {
    if (!selectedTrend || !selectedTech || !canSelect || busy) return;
    setBusy(true);
    setError("");
    try {
      // Field-path write on our own team only — never the whole `teams` map or the room `status`.
      await updateOwnTeam(
        room.ownerUid,
        room.roomId,
        student.team,
        { trendCard: selectedTrend, techCard: selectedTech },
        `${myTeam?.teamName || "팀"}이 ${selectedTrend.title} 트렌드와 ${selectedTech.title} 기술카드를 확정했습니다. 교사가 다음 단계로 이동할 때까지 기다려 주세요.`
      );
      setEditing(false);
    } catch (err) {
      setError(writeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!student.team) return <Notice>먼저 팀을 선택해야 합니다.</Notice>;

  const cards = step === "trend" ? TREND_CARDS : TECH_CARDS;
  const selectedCard = step === "trend" ? selectedTrend : selectedTech;
  const complete = bothSaved && !editing;

  return (
    <section>
      <h2 className="text-2xl font-black">트렌드 및 기술카드 선택</h2>
      <p className="mt-1 text-sm text-slate-500">
        {isLeader
          ? complete ? "선택이 완료되었습니다. 바꾸려면 '완료' 버튼이나 탭을 누르세요." : "팀장만 선택하고 확정할 수 있습니다."
          : myTeam?.leaderId ? "팀장이 카드를 선택하는 중입니다." : "아직 팀장이 없습니다. 선생님께 팀장 지정을 요청하세요."}
      </p>
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-white p-2 text-center text-sm font-black shadow-lift" role="tablist" aria-label="카드 종류">
        <button type="button" role="tab" aria-selected={step === "trend"} onClick={() => openStep("trend")} disabled={!isLeader} className={step === "trend" ? "rounded-lg bg-indigo-600 py-2 text-white" : "py-2 text-slate-500 disabled:opacity-70"}>
          {myTeam?.trendCard && <Check size={14} className="mr-1 inline" />}1. 트렌드
        </button>
        <button type="button" role="tab" aria-selected={step === "tech"} onClick={() => openStep("tech")} disabled={!isLeader || !selectedTrend} className={step === "tech" ? "rounded-lg bg-indigo-600 py-2 text-white" : "py-2 text-slate-500 disabled:opacity-70"}>
          {myTeam?.techCard && <Check size={14} className="mr-1 inline" />}2. 기술카드
        </button>
      </div>
      {bothSaved && (
        <div className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700 ring-1 ring-emerald-200">
          <Check size={16} className="mr-1 inline" /> 카드 선택 완료: {myTeam.trendCard.title} / {myTeam.techCard.title}
          {editing && isLeader && <span className="mt-1 block text-xs font-bold text-emerald-600">다시 선택 중 — 기술카드 단계에서 '확인'을 누르면 새 선택이 저장됩니다.</span>}
        </div>
      )}
      {step === "tech" && selectedTrend && (
        <div className="mt-3 rounded-lg bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700">
          선택한 트렌드: {selectedTrend.title}
        </div>
      )}
      <div className="card-sheet-grid mt-4">
        {cards.map((card) => (
          <CardSheetButton
            key={card.id}
            card={card}
            image={step === "trend" ? getTrendCardImage(card) : getTechCardImage(card)}
            selected={selectedCard?.id === card.id}
            disabled={!canSelect}
            onClick={() => (step === "trend" ? setSelectedTrend(card) : setSelectedTech(card))}
          />
        ))}
      </div>
      {complete ? (
        <button disabled={!isLeader} onClick={() => openStep("tech")} className="touch-button sticky bottom-4 mt-4 w-full rounded-lg bg-emerald-600 px-4 py-4 text-lg font-black text-white shadow-lift disabled:bg-slate-200 disabled:text-slate-400"><Check size={18} className="mr-1 inline" /> 완료 (다시 선택하려면 누르세요)</button>
      ) : step === "trend" ? (
        <button disabled={!canSelect || !selectedTrend || busy} onClick={confirmTrend} className="touch-button sticky bottom-4 mt-4 w-full rounded-lg bg-indigo-600 px-4 py-4 text-lg font-black text-white shadow-lift disabled:bg-slate-200 disabled:text-slate-400">다음(기술카드 선택하기)</button>
      ) : (
        <button disabled={!canSelect || !selectedTech || busy} onClick={confirmTech} className="touch-button sticky bottom-4 mt-4 w-full rounded-lg bg-indigo-600 px-4 py-4 text-lg font-black text-white shadow-lift disabled:bg-slate-200 disabled:text-slate-400">{busy ? "저장 중..." : "확인"}</button>
      )}
    </section>
  );
}

function CardSheetButton({ card, image, selected, disabled, onClick }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-label={card.title} className={`card-sheet-button ${selected ? "card-sheet-button-selected" : ""}`}>
      <img className="card-sheet-image" src={image} alt={card.title} loading="lazy" />
      {selected && <span className="card-check"><Check size={18} /></span>}
    </button>
  );
}
function SelectedCardsStrip({ team }) {
  const trend = team?.trendCard;
  const tech = team?.techCard;
  if (!trend && !tech) return null;
  const items = [
    { label: "트렌드", card: trend, image: getTrendCardImage(trend) },
    { label: "기술카드", card: tech, image: getTechCardImage(tech) }
  ];
  return (
    <div className="selected-cards-strip mt-3">
      {items.map((item) => (
        <div key={item.label} className="selected-card-item">
          {item.image ? <img src={item.image} alt={item.card?.title || item.label} /> : <span className="selected-card-empty">미선택</span>}
          <div>
            <p>{item.label}</p>
            <strong>{item.card?.title || "미선택"}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}

function normalizeIdea(savedIdea, emptyIdea) {
  const merged = { ...emptyIdea, ...(savedIdea || {}) };
  if (!Array.isArray(merged.problems) || merged.problems.length === 0) {
    merged.problems = merged.problem ? String(merged.problem).split(", ").filter(Boolean) : [];
  }
  return merged;
}

function Ideation({ room, uid, student }) {
  const team = room.teams?.[student.team];
  const savedIdea = room.teams?.[student.team]?.idea;
  const emptyIdea = {
    serviceName: "",
    problem: "",
    problems: [],
    customers: [],
    solution: "",
    product: "",
    revenueModels: [],
    marketingStrategies: [],
    tagline: ""
  };
  const [idea, setIdea] = useState(() => normalizeIdea(savedIdea, emptyIdea));
  const [editing, setEditing] = useState(!savedIdea || team?.ideaSubmitted === false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isLeader = team?.leaderId === uid;
  const submitted = Boolean(savedIdea && team?.ideaSubmitted !== false);
  const locked = Boolean(team?.ideaLocked);

  useEffect(() => {
    if (savedIdea && !editing) setIdea(normalizeIdea(savedIdea, emptyIdea));
    if (savedIdea && team?.ideaSubmitted === false) setEditing(true);
  }, [savedIdea, editing, team?.ideaSubmitted]);

  async function submitIdea() {
    if (!isLeader || locked || busy) return;
    const activeTeams = Object.keys(room.teams || {}).filter((teamKey) => Object.values(room.students || {}).some((member) => member.team === teamKey));
    const otherTeamsSubmitted = activeTeams
      .filter((teamKey) => teamKey !== student.team)
      .every((teamKey) => room.teams[teamKey]?.idea && room.teams[teamKey]?.ideaSubmitted !== false);
    // `problem` stays a joined string for the teacher dashboard, prompt and reports.
    const payload = { ...idea, problems: idea.problems || [], problem: (idea.problems || []).join(", ") };
    setBusy(true);
    setError("");
    try {
      // Only our own team's fields are written; the room phase and other teams are never touched.
      await updateOwnTeam(
        room.ownerUid,
        room.roomId,
        student.team,
        { idea: payload, ideaSubmitted: true, aiEvaluation: null },
        otherTeamsSubmitted
          ? "모든 팀의 사업계획이 등록되었습니다. 교사가 사업계획 AI 평가 단계로 이동할 때까지 수정할 수 있습니다."
          : `${team?.teamName || "팀"}이 아이디어를 제출했습니다.`
      );
      setEditing(false);
    } catch (err) {
      setError(writeErrorMessage(err, "사업계획을 제출하지 못했습니다. 다시 시도하세요."));
    } finally {
      setBusy(false);
    }
  }

  async function unlockIdea() {
    if (!isLeader || locked || busy) return;
    setBusy(true);
    setError("");
    try {
      await updateOwnTeam(
        room.ownerUid,
        room.roomId,
        student.team,
        { ideaSubmitted: false, aiEvaluation: null },
        `${team?.teamName || "팀"}이 사업계획 제출을 해제하고 수정 중입니다.`
      );
      setEditing(true);
    } catch (err) {
      setError(writeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!student.team) return <Notice>먼저 팀을 선택해야 합니다.</Notice>;

  // Team members always see the submitted plan; the leader sees it unless they re-opened it for editing.
  // A teacher-locked plan is always shown as the final summary.
  const showSummary = submitted && (!isLeader || locked || !editing);

  if (showSummary) {
    return (
      <section>
        <div className={`rounded-lg p-5 text-white shadow-lift ${locked ? "bg-slate-900" : "bg-emerald-600"}`}>
          <p className={`text-sm font-black ${locked ? "text-amber-300" : "text-emerald-100"}`}>{locked ? "교사 확정 완료" : "아이디어 제출 상태"}</p>
          <h2 className="mt-2 text-3xl font-black">{locked ? "우리 팀 사업계획서" : "제출 완료"}</h2>
          <p className={`mt-2 text-sm leading-6 ${locked ? "text-slate-200" : "text-emerald-50"}`}>
            {locked ? "교사가 확정한 최종 사업계획서입니다. 이 내용으로 AI 평가와 투자 유치가 진행됩니다." : "관리자 대시보드에 제출 내용이 반영되었습니다. 수정이 필요하면 아래 버튼을 누르세요."}
          </p>
        </div>
        <SelectedCardsStrip team={team} />
        <IdeaSummary team={team} idea={normalizeIdea(savedIdea, emptyIdea)} />
        <ErrorBanner message={error} onDismiss={() => setError("")} />
        {isLeader ? (
          <button disabled={locked || busy} onClick={unlockIdea} className="touch-button mt-4 w-full rounded-lg bg-slate-900 px-4 py-4 text-lg font-black text-white disabled:bg-slate-200 disabled:text-slate-400">{locked ? "관리자 확정 완료" : "제출 해제 및 수정하기"}</button>
        ) : (
          <Notice>{locked ? "교사가 확정한 우리 팀 사업계획서입니다." : "팀장이 제출한 사업계획입니다. 일반 팀원은 보기만 가능합니다."}</Notice>
        )}
      </section>
    );
  }

  const disabled = !isLeader || locked;

  return (
    <section>
      <h2 className="text-2xl font-black">아이디어 및 사업계획수립</h2>
      <SelectedCardsStrip team={team} />
      {disabled && <div className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm font-black text-amber-700 ring-1 ring-amber-200">{locked ? "관리자가 사업계획을 확정하여 더 이상 수정할 수 없습니다." : "팀장만 사업계획서를 입력하고 제출할 수 있습니다."}</div>}
      <CanvasBlock title="제품 및 서비스명">
        <input disabled={disabled} value={idea.serviceName} onChange={(event) => setIdea({ ...idea, serviceName: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-3 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" placeholder="예: AI 공부 도우미, 펫케어 매니저" />
      </CanvasBlock>
      <CanvasBlock title="문제정의: 왜 이 사업을 시작하려고 하나요?">
        <p className="mb-2 text-xs font-bold text-slate-500">중복선택 가능</p>
        <MultiChipGroup options={PROBLEM_OPTIONS} values={idea.problems} limit={3} allowCustom disabled={disabled} onChange={(problems) => setIdea({ ...idea, problems, problem: problems.join(", ") })} />
      </CanvasBlock>
      <CanvasBlock title="고객정의: 누가 우리의 고객인가요?">
        <p className="mb-2 text-xs font-bold text-slate-500">중복선택 가능</p>
        <MultiChipGroup options={CUSTOMER_OPTIONS} values={idea.customers} allowCustom disabled={disabled} onChange={(customers) => setIdea({ ...idea, customers })} />
      </CanvasBlock>
      <CanvasBlock title="아이디어 도출: 기존의 불편을 어떻게 해결하나요?">
        <textarea disabled={disabled} value={idea.solution} onChange={(event) => setIdea({ ...idea, solution: event.target.value })} className="min-h-32 w-full rounded-lg border border-slate-200 p-3 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" placeholder={"AI로 자동 추천해줘요\n기다리지 않아도 돼요\n스마트폰으로 쉽게 해결해요\n게임처럼 재미있게 만들어요\n지역 사람들을 연결해줘요"} />
      </CanvasBlock>
      <CanvasBlock title="제품/서비스 설명: 여러분의 아이디어가 실현될 제품이나 서비스를 상세히 설명해주세요">
        <textarea disabled={disabled} value={idea.product} onChange={(event) => setIdea({ ...idea, product: event.target.value })} className="min-h-32 w-full rounded-lg border border-slate-200 p-3 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" placeholder={"AI 기반 공부 도우미 앱\n반려동물 건강 관리 서비스\n지역 여행 추천 플랫폼\n친환경 배달 포장 서비스\n팀빌딩 게임 교육 플랫폼"} />
      </CanvasBlock>
      <CanvasBlock title="수익모델: 돈을 어떻게 버나요?">
        <MultiChipGroup options={REVENUE_OPTIONS} values={idea.revenueModels} limit={3} allowCustom disabled={disabled} onChange={(revenueModels) => setIdea({ ...idea, revenueModels })} />
      </CanvasBlock>
      <CanvasBlock title="마케팅 전략: 어떻게 알릴건가요?">
        <MultiChipGroup options={MARKETING_OPTIONS} values={idea.marketingStrategies} limit={3} allowCustom disabled={disabled} onChange={(marketingStrategies) => setIdea({ ...idea, marketingStrategies })} />
      </CanvasBlock>
      <CanvasBlock title="우리 제품 또는 서비스를 한 줄로 참신하게 표현한다면?">
        <input disabled={disabled} value={idea.tagline} onChange={(event) => setIdea({ ...idea, tagline: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-3 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" placeholder="예: 공부 시간을 줄이고 성적은 올리는 AI 학습 파트너" />
      </CanvasBlock>
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <button disabled={disabled || busy} onClick={submitIdea} className="touch-button mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-4 text-lg font-black text-white disabled:bg-slate-200 disabled:text-slate-400"><Send size={18} /> {locked ? "관리자 확정 완료" : busy ? "제출 중..." : "작성 완료 및 제출"}</button>
    </section>
  );
}

function IdeaSummary({ team, idea }) {
  return (
    <article className="mt-4 rounded-lg bg-white p-4 shadow-lift">
      <h3 className="font-black">{team?.teamName} 아이디어</h3>
      <p className="mt-3 text-sm text-slate-600"><b>제품 및 서비스명:</b> {idea.serviceName || "-"}</p>
      <p className="mt-2 text-sm text-slate-600"><b>문제정의:</b> {idea.problem || "-"}</p>
      <p className="mt-2 text-sm text-slate-600"><b>고객정의:</b> {(idea.customers || []).join(", ") || "-"}</p>
      <p className="mt-2 text-sm text-slate-600"><b>아이디어 도출:</b> {idea.solution || "-"}</p>
      <p className="mt-2 text-sm text-slate-600"><b>제품/서비스:</b> {idea.product || "-"}</p>
      <p className="mt-2 text-sm text-slate-600"><b>수익모델:</b> {(idea.revenueModels || []).join(", ") || "-"}</p>
      <p className="mt-2 text-sm text-slate-600"><b>마케팅:</b> {(idea.marketingStrategies || []).join(", ") || "-"}</p>
      <p className="mt-2 text-sm text-slate-600"><b>한 줄 표현:</b> {idea.tagline || "-"}</p>
    </article>
  );
}
function TeamFundingSummary({ room, student }) {
  const team = room.teams?.[student.team];
  if (!team) return null;
  const baseAsset = getTeamBaseAsset(team);
  const investment = Number(team.investmentsReceived || 0);
  return (
    <section className="team-funding-summary" aria-live="polite" aria-atomic="true">
      <h2>{room.status === STATUSES.INVESTMENT ? "우리 팀 실시간 투자 유치" : "우리 팀 최종 투자유치 결과"}</h2>
      <dl>
        <div><dt>기본자산</dt><dd>{formatWon(baseAsset)}</dd></div>
        <div><dt>투자유치</dt><dd>{formatWon(investment)}</dd></div>
        <div><dt>총액</dt><dd>{formatWon(baseAsset + investment)}</dd></div>
      </dl>
      <p>{room.status === STATUSES.INVESTMENT ? "투자 확정된 금액이 실시간으로 반영됩니다." : "투자 종료 시점의 자산이며, 경영시뮬레이션 손익은 포함하지 않습니다."}</p>
    </section>
  );
}

function AiEvaluation({ room, student }) {
  const team = room.teams?.[student.team];
  if (room.aiEvaluationStatus !== "evaluating" && !team?.aiEvaluation) {
    return <Ideation room={room} uid={student.uid} student={student} />;
  }
  return (
    <section>
      {room.aiEvaluationStatus === "evaluating" && (
        <>
          <AiEvaluationShowcase />
          <div className="rounded-lg bg-slate-900 p-5 text-white shadow-lift">
            <p className="text-sm font-black text-indigo-100">사업계획 AI 평가</p>
            <h2 className="mt-2 break-keep text-3xl font-black">비즈니스 전문 AI가 평가중입니다...</h2>
            <p className="mt-3 text-sm leading-6 text-slate-200">평가가 끝나면 팀별 AI 평가결과가 자동으로 표시됩니다.</p>
          </div>
        </>
      )}
      {team?.aiEvaluation && (
        <>
          <StudentAiEvaluationReport team={team} />
          <Notice>교사가 투자 유치 단계를 누르면 다음 단계로 이동합니다.</Notice>
        </>
      )}
    </section>
  );
}

function CanvasBlock({ title, children }) {
  return <section className="mt-4 rounded-lg bg-white p-4 shadow-lift"><h3 className="mb-3 flex items-center gap-2 font-black"><Lightbulb size={18} /> {title}</h3>{children}</section>;
}

function MultiChipGroup({ options, values = [], limit, allowCustom = false, disabled = false, onChange }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [customConfirmed, setCustomConfirmed] = useState(false);

  function toggle(option) {
    if (disabled) return;
    const selected = values.includes(option);
    if (selected) {
      onChange(values.filter((value) => value !== option));
      return;
    }
    if (limit && values.length >= limit) return;
    onChange([...values, option]);
  }

  function addCustom() {
    if (disabled) return;
    const next = customValue.trim();
    if (!next || values.includes(next)) return;
    if (limit && values.length >= limit) return;
    onChange([...values, next]);
    setCustomConfirmed(true);
  }

  return (
    <div>
      {limit && <p className="mb-2 text-xs font-bold text-slate-500">최대 {limit}개까지 선택</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = values.includes(option);
          return (
            <button key={option} type="button" disabled={disabled} onClick={() => toggle(option)} className={`touch-button rounded-full px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 ${selected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"}`}>
              {selected && <Check size={14} className="mr-1 inline" />}
              {option}
            </button>
          );
        })}
        {allowCustom && (
          <button type="button" disabled={disabled} onClick={() => setCustomOpen(!customOpen)} className={`touch-button rounded-full px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 ${customOpen ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>직접 입력</button>
        )}
      </div>
      {allowCustom && customOpen && (
        <div className="mt-3 flex gap-2">
          <input value={customValue} onChange={(event) => { setCustomValue(event.target.value); setCustomConfirmed(false); }} onKeyDown={(event) => event.key === "Enter" && addCustom()} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-3 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" placeholder={limit && values.length >= limit ? `최대 ${limit}개까지 선택했습니다` : "직접 입력"} disabled={disabled || customConfirmed || Boolean(limit && values.length >= limit)} />
          <button type="button" onClick={addCustom} disabled={disabled || customConfirmed || Boolean(limit && values.length >= limit)} className="touch-button rounded-lg bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-200 disabled:text-slate-400">{customConfirmed ? "등록됨" : "확인"}</button>
        </div>
      )}
    </div>
  );
}

function Notice({ children }) {
  return <div className="rounded-lg bg-white p-5 text-center font-bold shadow-lift">{children}</div>;
}
