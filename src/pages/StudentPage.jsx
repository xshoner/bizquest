import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Award, Check, CircleDollarSign, Crown, Lightbulb, Pencil, Send, TrendingUp } from "lucide-react";
import { auth, db, doc, onAuthStateChanged, signInAnonymously, updateDoc } from "../firebase.js";
import {
  C_LEVEL_KEYS,
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
import { TEAM_BASE_ASSET, formatWon, getStudentsByTeam, getTeamEntries, normalizeTeamName, rankTeams, recalculateInvestments } from "../lib/game.js";
import { useRoom } from "../hooks/useRoom.js";

const BUDGET = 50000000;
const trendCardImages = Object.entries(import.meta.glob("../images/B*.png", { eager: true, import: "default" }))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, image]) => image);
const techCardImages = Object.entries(import.meta.glob("../images/A*.png", { eager: true, import: "default" }))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, image]) => image);
const eventCardImages = Object.fromEntries(
  Object.entries(import.meta.glob("../images/E*.png", { eager: true, import: "default" }))
    .map(([path, image]) => [path.match(/E\d{2}/)?.[0], image])
    .filter(([id]) => id)
);

export default function StudentPage() {
  const { roomId } = useParams();
  const { room, loading, error } = useRoom(roomId);
  const [nickname, setNickname] = useState("");
  const [joining, setJoining] = useState(false);
  const [authUid, setAuthUid] = useState(localStorage.getItem(`startupHero:${roomId}:uid`) || "");
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
    if (!nickname.trim()) return;
    setJoining(true);
    const credential = auth.currentUser ? { user: auth.currentUser } : await signInAnonymously(auth);
    const nextUid = credential.user.uid;
    setAuthUid(nextUid);
    localStorage.setItem(`startupHero:${roomId}:uid`, nextUid);
    localStorage.setItem("startupHero:lastRoomId", roomId);
    await updateDoc(doc(db, "rooms", roomId), {
      [`students.${nextUid}`]: { uid: nextUid, nickname: nickname.trim(), team: null, cLevelResult: null, investments: {}, investmentSubmitted: false },
      sysMessage: `${nickname.trim()} 학생이 입장했습니다.`
    });
    setJoining(false);
  }

  if (loading || !authReady) return <MobileFrame>방 정보를 불러오는 중입니다.</MobileFrame>;
  if (error) return <MobileFrame>{error}</MobileFrame>;
  if (!room) return <MobileFrame><p>존재하지 않는 방입니다.</p><Link className="mt-4 inline-block font-bold text-indigo-600" to="/">메인으로 이동</Link></MobileFrame>;

  if (!student) {
    return (
      <MobileFrame>
        <div className="flex min-h-[80vh] flex-col justify-center">
          <p className="text-sm font-bold text-indigo-600">스타트업 히어로</p>
          <h1 className="mt-2 text-3xl font-black">{room.roomTitle}</h1>
          <p className="mt-2 text-slate-500">닉네임을 입력하고 체험에 입장하세요. 같은 브라우저로 다시 들어오면 기존 참여 정보가 유지됩니다.</p>
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="예: 김창업" className="mt-6 rounded-lg border border-slate-200 px-4 py-4 text-lg outline-none focus:border-indigo-500" />
          <button disabled={joining} onClick={joinRoom} className="touch-button mt-3 rounded-lg bg-indigo-600 px-4 py-4 text-lg font-black text-white disabled:opacity-50">{joining ? "입장 중..." : "입장"}</button>
        </div>
      </MobileFrame>
    );
  }

  return (
    <MobileFrame>
      <PhaseTransition status={room.status} />
      {room.resultFinalizing && <ResultFinalizingShowcase />}
      <FanfareOnResult status={room.status} />
      <ResultFireworks status={room.status} />
      <StudentHeader room={room} uid={authUid} student={student} />
      {room.sysMessage && <div className="ticker-pulse mb-4 rounded-lg bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700">{room.sysMessage}</div>}
      {room.status === STATUSES.WAITING && <WaitingRoom room={room} uid={authUid} />}
      {room.status === STATUSES.C_LEVEL && <CLevelDiagnosis room={room} uid={authUid} student={student} />}
      {room.status === STATUSES.CARD_SELECT && <CardSelect room={room} uid={authUid} student={student} />}
      {room.status === STATUSES.IDEATION && <Ideation room={room} uid={authUid} student={student} />}
      {room.status === STATUSES.AI_EVALUATION && <AiEvaluation room={room} student={student} />}
      {room.status === STATUSES.INVESTMENT && <Investment room={room} uid={authUid} student={student} />}
      {room.status === STATUSES.SIMULATION && <Simulation room={room} uid={authUid} student={student} />}
      {room.status === STATUSES.RESULT && <Result room={room} />}
    </MobileFrame>
  );
}

function PhaseTransition({ status }) {
  const previous = useRef(status);
  const [visibleStatus, setVisibleStatus] = useState(null);

  useEffect(() => {
    if (previous.current && previous.current !== status) {
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

function StudentHeader({ room, uid, student }) {
  const myTeam = room.teams?.[student.team];
  const isLeader = myTeam?.leaderId === uid;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(myTeam?.teamName || "");

  useEffect(() => {
    setName(myTeam?.teamName || "");
  }, [myTeam?.teamName]);

  async function saveTeamName() {
    if (!student.team || !isLeader) return;
    const nextName = normalizeTeamName(name.trim() || myTeam.teamName);
    await updateDoc(doc(db, "rooms", room.roomId), {
      [`teams.${student.team}.teamName`]: nextName,
      sysMessage: `${nextName}으로 팀명이 변경되었습니다.`
    });
    setEditing(false);
  }

  return (
    <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-slate-200 bg-[#f5f7fb]/95 px-4 py-3 backdrop-blur">
      <p className="text-xs font-bold text-indigo-600">{room.roomTitle} · {STATUS_LABELS[room.status]}</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <div className="student-name-wrap">
          <h1 className="min-w-0 truncate text-xl font-black">{student.nickname}</h1>
          {student.cLevelResult?.key && <span className={`student-header-c-level c-level-mini-${student.cLevelResult.key}`}>{student.cLevelResult.key}</span>}
        </div>
        <div className="flex max-w-[58%] items-center gap-1 rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-700">
          {isLeader && <Crown size={14} className="text-amber-500" />}
          {editing ? (
            <input value={name} onChange={(event) => setName(event.target.value)} onBlur={saveTeamName} onKeyDown={(event) => event.key === "Enter" && saveTeamName()} autoFocus className="min-w-0 bg-transparent outline-none" />
          ) : (
            <span className="truncate">{myTeam?.teamName || "팀 미선택"}</span>
          )}
          {isLeader && !editing && <button onClick={() => setEditing(true)} title="팀 이름 변경"><Pencil size={14} /></button>}
        </div>
      </div>
    </header>
  );
}
function WaitingRoom({ room, uid }) {
  async function selectTeam(teamKey) {
    const currentTeam = room.students?.[uid]?.team;
    const nextTeam = currentTeam === teamKey ? null : teamKey;
    const nickname = room.students?.[uid]?.nickname || "학생";
    await updateDoc(doc(db, "rooms", room.roomId), {
      [`students.${uid}.team`]: nextTeam,
      sysMessage: nextTeam
        ? `${nickname} 학생이 ${room.teams?.[teamKey]?.teamName || "팀"}에 합류했습니다.`
        : `${nickname} 학생이 팀 선택을 취소했습니다.`
    });
  }

  return (
    <section>
      <h2 className="text-2xl font-black">팀을 선택하세요</h2>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {getTeamEntries(room.teams).map(([key, team]) => {
          const count = Object.values(room.students || {}).filter((member) => member.team === key).length;
          const selected = room.students?.[uid]?.team === key;
          return (
            <button key={key} onClick={() => selectTeam(key)} className={`touch-button rounded-lg p-4 text-left shadow-lift ${selected ? "selected-team-card text-white" : "bg-white text-slate-900"}`}>
              <p className="break-keep text-xl font-black">{team.teamName}</p>
              <p className={`mt-1 text-sm ${selected ? "text-white/85" : "text-slate-500"}`}>{count}명 참여{selected ? " · 선택됨" : ""}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CLevelDiagnosis({ room, uid, student }) {
  const savedResult = student.cLevelResult;
  const [started, setStarted] = useState(Boolean(savedResult));
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState(Array(C_LEVEL_QUESTIONS.length).fill(null));
  const [result, setResult] = useState(savedResult || null);
  const [saving, setSaving] = useState(false);
  const question = C_LEVEL_QUESTIONS[current];
  const selected = answers[current];
  const progress = result ? 100 : Math.round((answers.filter((answer) => answer !== null).length / C_LEVEL_QUESTIONS.length) * 100);

  useEffect(() => {
    if (savedResult) {
      setResult(savedResult);
      setStarted(true);
    }
  }, [savedResult?.key]);

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
    await updateDoc(doc(db, "rooms", room.roomId), {
      [`students.${uid}.cLevelResult`]: payload,
      sysMessage: `${student.nickname} 학생의 C레벨 자가진단 결과는 ${type.key}입니다.`
    });
    setResult(payload);
    setSaving(false);
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
        <div className="c-level-result-hero">
          <p className="c-level-result-label">{type.key}</p>
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
  const [step, setStep] = useState(myTeam?.trendCard && !myTeam?.techCard ? "tech" : "trend");
  const [selectedTrend, setSelectedTrend] = useState(myTeam?.trendCard || null);
  const [selectedTech, setSelectedTech] = useState(myTeam?.techCard || null);

  useEffect(() => {
    setSelectedTrend(myTeam?.trendCard || null);
    setSelectedTech(myTeam?.techCard || null);
    if (myTeam?.trendCard && !myTeam?.techCard) setStep("tech");
  }, [myTeam?.trendCard, myTeam?.techCard]);

  async function confirmTrend() {
    if (!selectedTrend || !isLeader) return;
    await updateDoc(doc(db, "rooms", room.roomId), {
      [`teams.${student.team}.trendCard`]: selectedTrend,
      sysMessage: `${myTeam?.teamName || "팀"}이 ${selectedTrend.title} 트렌드 카드를 선택했습니다.`
    });
    setStep("tech");
  }

  async function confirmTech() {
    if (!selectedTrend || !selectedTech || !isLeader) return;
    const nextTeams = {
      ...(room.teams || {}),
      [student.team]: { ...myTeam, trendCard: selectedTrend, techCard: selectedTech }
    };
    await updateDoc(doc(db, "rooms", room.roomId), {
      teams: nextTeams,
      status: room.status,
      sysMessage: `${myTeam?.teamName || "팀"}이 ${selectedTrend.title} 트렌드와 ${selectedTech.title} 기술카드를 확정했습니다. 교사가 다음 단계로 이동할 때까지 기다려 주세요.`
    });
  }

  if (!student.team) return <Notice>먼저 팀을 선택해야 합니다.</Notice>;

  const cards = step === "trend" ? TREND_CARDS : TECH_CARDS;
  const selectedCard = step === "trend" ? selectedTrend : selectedTech;
  const imageList = step === "trend" ? trendCardImages : techCardImages;

  return (
    <section>
      <h2 className="text-2xl font-black">트렌드 및 기술카드 선택</h2>
      <p className="mt-1 text-sm text-slate-500">{isLeader ? "팀장만 선택하고 확정할 수 있습니다." : "팀장이 카드를 선택하는 중입니다."}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-white p-2 text-center text-sm font-black shadow-lift">
        <span className={step === "trend" ? "rounded-lg bg-indigo-600 py-2 text-white" : "py-2 text-slate-500"}>{myTeam?.trendCard && <Check size={14} className="mr-1 inline" />}1. 트렌드</span>
        <span className={step === "tech" ? "rounded-lg bg-indigo-600 py-2 text-white" : "py-2 text-slate-500"}>{myTeam?.techCard && <Check size={14} className="mr-1 inline" />}2. 기술카드</span>
      </div>
      {myTeam?.trendCard && myTeam?.techCard && (
        <div className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700 ring-1 ring-emerald-200">
          <Check size={16} className="mr-1 inline" /> 카드 선택 완료: {myTeam.trendCard.title} / {myTeam.techCard.title}
        </div>
      )}
      {step === "tech" && selectedTrend && (
        <div className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          선택한 트렌드: {selectedTrend.title}
        </div>
      )}
      <div className="card-sheet-grid mt-4">
        {cards.map((card) => (
          <CardSheetButton
            key={card.id}
            card={card}
            image={imageList[card.index]}
            selected={selectedCard?.id === card.id}
            disabled={!isLeader}
            onClick={() => (step === "trend" ? setSelectedTrend(card) : setSelectedTech(card))}
          />
        ))}
      </div>
      {step === "trend" ? (
        <button disabled={!isLeader || !selectedTrend} onClick={confirmTrend} className="touch-button sticky bottom-4 mt-4 w-full rounded-lg bg-indigo-600 px-4 py-4 text-lg font-black text-white shadow-lift disabled:bg-slate-200 disabled:text-slate-400">다음(기술카드 선택하기)</button>
      ) : (
        <button disabled={!isLeader || !selectedTech} onClick={confirmTech} className="touch-button sticky bottom-4 mt-4 w-full rounded-lg bg-indigo-600 px-4 py-4 text-lg font-black text-white shadow-lift disabled:bg-slate-200 disabled:text-slate-400">확인</button>
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

function ResultFinalizingShowcase() {
  return (
    <div className="phase-overlay result-finalizing-overlay">
      <div className="phase-burst result-finalizing-burst">
        <p className="text-sm font-black text-amber-200">최종 결과</p>
        <h2 className="mt-3 break-keep text-4xl font-black text-white">최종결과 집계중...</h2>
        <p className="mt-4 text-sm font-bold text-indigo-100">잠시 후 최종 순위와 사업 리포트가 공개됩니다.</p>
      </div>
    </div>
  );
}

function FanfareOnResult({ status }) {
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current !== STATUSES.RESULT && status === STATUSES.RESULT) playFanfare();
    previous.current = status;
  }, [status]);
  return null;
}

function ResultFireworks({ status }) {
  const previous = useRef(status);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (previous.current !== STATUSES.RESULT && status === STATUSES.RESULT) {
      setVisible(true);
      const timer = window.setTimeout(() => setVisible(false), 10000);
      previous.current = status;
      return () => window.clearTimeout(timer);
    }
    previous.current = status;
    return undefined;
  }, [status]);

  if (!visible) return null;
  return (
    <div className="result-fireworks" aria-hidden="true">
      {Array.from({ length: 22 }, (_, index) => <span key={index} />)}
    </div>
  );
}
function Ideation({ room, uid, student }) {
  const team = room.teams?.[student.team];
  const savedIdea = room.teams?.[student.team]?.idea;
  const emptyIdea = {
    serviceName: "",
    problem: "",
    customers: [],
    solution: "",
    product: "",
    revenueModels: [],
    marketingStrategies: [],
    tagline: ""
  };
  const [idea, setIdea] = useState(savedIdea || emptyIdea);
  const [editing, setEditing] = useState(!savedIdea || team?.ideaSubmitted === false);
  const isLeader = team?.leaderId === uid;
  const submitted = Boolean(savedIdea && team?.ideaSubmitted !== false);
  const locked = Boolean(team?.ideaLocked);

  useEffect(() => {
    if (savedIdea && !editing) setIdea({ ...emptyIdea, ...savedIdea });
    if (savedIdea && team?.ideaSubmitted === false) setEditing(true);
  }, [savedIdea, editing, team?.ideaSubmitted]);

  async function submitIdea() {
    if (!isLeader || locked) return;
    const nextTeams = {
      ...(room.teams || {}),
      [student.team]: { ...team, idea, ideaSubmitted: true, aiEvaluation: null }
    };
    const activeTeams = Object.keys(nextTeams).filter((teamKey) => Object.values(room.students || {}).some((member) => member.team === teamKey));
    const allActiveTeamsSubmitted = activeTeams.length > 0 && activeTeams.every((teamKey) => nextTeams[teamKey]?.idea && nextTeams[teamKey]?.ideaSubmitted !== false);
    await updateDoc(doc(db, "rooms", room.roomId), {
      teams: nextTeams,
      aiEvaluationStatus: allActiveTeamsSubmitted ? "idle" : room.aiEvaluationStatus || "idle",
      status: room.status,
      sysMessage: allActiveTeamsSubmitted
        ? "모든 팀의 사업계획이 등록되었습니다. 교사가 사업계획 AI 평가 단계로 이동할 때까지 수정할 수 있습니다."
        : `${team?.teamName || "팀"}이 아이디어를 제출했습니다.`
    });
    setEditing(false);
  }

  async function unlockIdea() {
    if (!isLeader || locked) return;
    await updateDoc(doc(db, "rooms", room.roomId), {
      [`teams.${student.team}.ideaSubmitted`]: false,
      [`teams.${student.team}.aiEvaluation`]: null,
      aiEvaluationStatus: "idle",
      sysMessage: `${team?.teamName || "팀"}이 사업계획 제출을 해제하고 수정 중입니다.`
    });
    setEditing(true);
  }

  if (!student.team) return <Notice>먼저 팀을 선택해야 합니다.</Notice>;

  if (submitted && !editing) {
    return (
      <section>
        <div className="rounded-lg bg-emerald-600 p-5 text-white shadow-lift">
          <p className="text-sm font-black text-emerald-100">아이디어 제출 상태</p>
          <h2 className="mt-2 text-3xl font-black">제출 완료</h2>
          <p className="mt-2 text-sm leading-6 text-emerald-50">관리자 대시보드에 제출 내용이 반영되었습니다. 수정이 필요하면 아래 버튼을 누르세요.</p>
        </div>
        <IdeaSummary team={team} idea={{ ...emptyIdea, ...savedIdea }} />
        {isLeader ? (
          <button disabled={locked} onClick={unlockIdea} className="touch-button mt-4 w-full rounded-lg bg-slate-900 px-4 py-4 text-lg font-black text-white disabled:bg-slate-200 disabled:text-slate-400">{locked ? "관리자 확정 완료" : "제출 해제 및 수정하기"}</button>
        ) : (
          <Notice>팀장이 제출한 사업계획입니다. 일반 팀원은 보기만 가능합니다.</Notice>
        )}
      </section>
    );
  }

  const disabled = !isLeader || locked;

  return (
    <section>
      <h2 className="text-2xl font-black">아이디어 및 사업계획수립</h2>
      {disabled && <div className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm font-black text-amber-700 ring-1 ring-amber-200">{locked ? "관리자가 사업계획을 확정하여 더 이상 수정할 수 없습니다." : "팀장만 사업계획서를 입력하고 제출할 수 있습니다."}</div>}
      <CanvasBlock title="제품 및 서비스명">
        <input disabled={disabled} value={idea.serviceName} onChange={(event) => setIdea({ ...idea, serviceName: event.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-3 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" placeholder="예: AI 공부 도우미, 펫케어 매니저" />
      </CanvasBlock>
      <CanvasBlock title="문제정의: 왜 이 사업을 시작하려고 하나요?">
        <ChipGroup options={PROBLEM_OPTIONS} value={idea.problem} allowCustom disabled={disabled} onChange={(problem) => setIdea({ ...idea, problem })} />
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
      <button disabled={disabled} onClick={submitIdea} className="touch-button mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-4 text-lg font-black text-white disabled:bg-slate-200 disabled:text-slate-400"><Send size={18} /> {locked ? "관리자 확정 완료" : "작성 완료 및 제출"}</button>
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
function Investment({ room, uid, student }) {
  const [investments, setInvestments] = useState(student.investments || {});
  const [directInputTeam, setDirectInputTeam] = useState(null);
  const [expandedTeam, setExpandedTeam] = useState(null);
  const total = Object.values(investments).reduce((sum, value) => sum + Number(value || 0), 0);
  const availableTeams = getTeamEntries(room.teams).filter(([key]) => key !== student.team);
  const submitted = Boolean(student.investmentSubmitted);

  useEffect(() => {
    setInvestments(student.investments || {});
  }, [student.investments]);

  async function submit() {
    const { students, teams } = recalculateInvestments(room, uid, investments);
    await updateDoc(doc(db, "rooms", room.roomId), {
      students,
      teams,
      sysMessage: `${student.nickname} 학생이 투자를 확정했습니다.`
    });
  }

  function setAmount(teamKey, amount) {
    const sanitized = Math.max(0, Math.min(BUDGET, Number(amount || 0)));
    const next = { ...investments, [teamKey]: sanitized };
    const nextTotal = Object.values(next).reduce((sum, value) => sum + Number(value || 0), 0);
    if (nextTotal <= BUDGET) setInvestments(next);
  }

  return (
    <section>
      <h2 className="text-2xl font-black">가상 투자</h2>
      <div className="mt-3 rounded-lg bg-slate-900 p-4 text-white">
        <p className="text-sm text-slate-300">잔여 투자금</p>
        <p className="text-3xl font-black">{formatWon(BUDGET - total)}</p>
      </div>
      <div className="mt-3 rounded-lg bg-indigo-50 px-4 py-3 text-sm font-black leading-6 text-indigo-700 ring-1 ring-indigo-100">
        <p>우리 팀 사업에는 투자할 수 없습니다.</p>
        <p>상대팀 사업내용을 보고 투자하세요.</p>
      </div>
      {submitted && <div className="ticker-pulse mt-3 rounded-lg bg-rose-50 px-4 py-3 text-sm font-black text-rose-700">투자 완료. 금액을 바꾸고 다시 누르면 재확정됩니다.</div>}
      <div className="mt-4 space-y-3">
        {availableTeams.map(([key, team]) => {
          const expanded = expandedTeam === key;
          return (
            <article key={key} className="rounded-lg bg-white p-4 shadow-lift">
              <p className="text-sm font-bold text-indigo-600">{team.teamName}</p>
              <h3 className="mt-1 text-lg font-black">{team.idea?.product || team.idea?.solution || team.techCard?.title || "아이디어 준비 중"}</h3>
              <p className="mt-2 text-sm text-slate-500">{team.idea?.problem || team.trendCard?.title || "팀 발표를 듣고 투자하세요."}</p>
              <button type="button" onClick={() => setExpandedTeam(expanded ? null : key)} className="touch-button mt-3 w-full rounded-lg bg-indigo-50 px-3 py-2 text-sm font-black text-indigo-700">
                {expanded ? "사업 내용 및 AI 평가 접기" : "사업 내용 및 AI 평가 보기"}
              </button>
              {expanded && <InvestmentTeamDetails team={team} />}
              <div className="mt-4 flex items-center gap-3">
                <input type="range" min="0" max="50000000" step="1000000" value={investments[key] || 0} onChange={(event) => setAmount(key, event.target.value)} className="w-full accent-indigo-600" />
                <span className="w-20 text-right text-sm font-black">{formatWon(investments[key] || 0)}</span>
              </div>
              <button type="button" onClick={() => setDirectInputTeam(directInputTeam === key ? null : key)} className="touch-button mt-3 w-full rounded-lg bg-slate-100 px-3 py-2 text-sm font-black text-slate-700">직접 입력</button>
              {directInputTeam === key && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 p-3">
                  <input type="number" min="0" max="50000000" step="1000000" value={investments[key] || 0} onChange={(event) => setAmount(key, event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-3 text-right font-black outline-none focus:border-indigo-500" />
                  <span className="text-sm font-bold text-slate-500">원</span>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <button onClick={submit} className={`touch-button mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-4 text-lg font-black text-white ${submitted ? "bg-rose-600" : "bg-emerald-600"}`}><CircleDollarSign size={20} /> {submitted ? "투자 재확정" : "투자 확정"}</button>
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

function InvestmentTeamDetails({ team }) {
  const idea = team.idea || {};
  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3">
      <div className="space-y-2 text-sm leading-6 text-slate-700">
        <p><b>제품 및 서비스명:</b> {idea.serviceName || "-"}</p>
        <p><b>트렌드:</b> {team.trendCard?.title || "미선택"}</p>
        <p><b>기술카드:</b> {team.techCard?.title || "미선택"}</p>
        <p><b>문제정의:</b> {idea.problem || "-"}</p>
        <p><b>고객정의:</b> {(idea.customers || []).join(", ") || "-"}</p>
        <p><b>제품/서비스:</b> {idea.product || idea.solution || "-"}</p>
        <p><b>수익모델:</b> {(idea.revenueModels || []).join(", ") || "-"}</p>
        <p><b>마케팅:</b> {(idea.marketingStrategies || []).join(", ") || "-"}</p>
      </div>
      {team.aiEvaluation ? (
        <StudentAiEvaluationReport team={team} />
      ) : (
        <div className="mt-3 rounded-lg bg-white px-3 py-3 text-sm font-black text-slate-500">AI 평가 결과 대기</div>
      )}
    </div>
  );
}

function AiEvaluationShowcase() {
  return (
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
  );
}
function Simulation({ room, uid, student }) {
  const myTeam = room.teams?.[student.team];
  if (room.currentDecision) return <DecisionVote room={room} uid={uid} student={student} team={myTeam} />;
  const displayAsset = getDisplayAsset(myTeam, room.currentMonth || 0);
  const assetNegative = displayAsset < 0;
  const investment = Number(myTeam?.investmentsReceived || 0);
  const startingTotal = TEAM_BASE_ASSET + investment;
  const impact = myTeam?.lastEventImpact;
  const impactRate = impact ? Number(impact.rate || 0) : 0;
  const impactAmount = impact ? Number(impact.afterAsset || 0) - Number(impact.beforeAsset || 0) : 0;
  return (
    <section>
      <div className={`student-asset-pulse ${impactRate < 0 ? "student-asset-pulse-negative" : "student-asset-pulse-positive"}`}>
        <div>
          <p>우리 팀 현재 자산</p>
          <strong>{formatWon(displayAsset)}</strong>
        </div>
        <div className="text-right">
          <p>{room.currentMonth || 0}개월 차 변동</p>
          <strong>{impact ? `${impactRate > 0 ? "+" : ""}${impactRate}%` : "대기"}</strong>
          {impact && <span>{impactAmount >= 0 ? "+" : ""}{formatWon(impactAmount)}</span>}
        </div>
      </div>
      <div className={`rounded-lg p-5 text-white ${assetNegative ? "bg-rose-700" : "bg-slate-900"}`}>
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-sm text-slate-200">현재 월</p><p className="text-5xl font-black">{room.currentMonth || 0}</p></div>
          <div className="rounded-lg bg-white/10 px-3 py-2 text-right"><p className="text-xs text-slate-200">출발 총액</p><p className="text-lg font-black">{formatWon(startingTotal)}</p></div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-white/10 p-3"><p className="text-xs text-slate-200">기본 자본금</p><p className="text-xl font-black">{formatWon(TEAM_BASE_ASSET)}</p></div>
          <div className="rounded-lg bg-white/10 p-3"><p className="text-xs text-slate-200">투자 유치금</p><p className="text-xl font-black">{formatWon(investment)}</p></div>
        </div>
        <div className="mt-5 rounded-lg bg-white p-4 text-slate-950"><p className="text-sm font-black text-slate-500">현재 우리 팀 총 자산</p><p className={`mt-1 text-4xl font-black ${assetNegative ? "text-rose-600" : "text-indigo-600"}`}>{formatWon(displayAsset)}</p></div>
      </div>
      {room.currentEvent && (
        <>
          <StudentEventShowcase event={room.currentEvent} impact={myTeam?.lastEventImpact} month={room.currentMonth || 0} team={myTeam} />
          <article className="mt-4 overflow-hidden rounded-lg bg-white p-4 shadow-lift">
            <div className="flex gap-3">
              <img src={getEventImage(room.currentEvent)} alt={room.currentEvent.title} className="h-32 w-20 flex-none rounded-lg object-cover shadow-lift" />
              <div className="min-w-0">
                <p className="text-sm font-black uppercase tracking-wide text-indigo-600">{room.currentEvent.factor} · {BUSINESS_FACTORS.find((factor) => factor.id === room.currentEvent.factor)?.name}</p>
                <h2 className="mt-2 break-keep text-xl font-black">{room.currentEvent.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{room.currentEvent.description}</p>
                {myTeam?.lastEventImpact?.eventId === room.currentEvent.id && (
                  <p className="mt-3 text-lg font-black">우리 팀 평가: {myTeam.lastEventImpact.grade} · 자산 변동 {myTeam.lastEventImpact.rate > 0 ? "+" : ""}{myTeam.lastEventImpact.rate}%</p>
                )}
              </div>
            </div>
          </article>
        </>
      )}
      <AssetBars teams={room.teams} currentMonth={room.currentMonth || 0} />
    </section>
  );
}

function StudentAiEvaluationReport({ team }) {
  const evaluation = team.aiEvaluation;
  return (
    <article className="mt-4 rounded-lg bg-white p-4 shadow-lift">
      <p className="text-sm font-black text-indigo-600">AI 평가결과</p>
      <h3 className="mt-1 break-keep text-xl font-black">{team.teamName} 사업계획 리포트</h3>
      <p className="mt-3 rounded-lg bg-indigo-50 p-3 text-sm font-bold leading-6 text-indigo-800">{evaluation?.opinion || "아직 평가 의견이 없습니다."}</p>
      <div className="mt-3 grid gap-2">
        {BUSINESS_FACTORS.map((factor) => {
          const item = evaluation?.factors?.[factor.id];
          return (
            <div key={factor.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <b className="break-keep">{factor.name}</b>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${gradeClassName(item?.grade || "보통")}`}>{item?.grade || "보통"}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-600">{item?.reason || factor.description}</p>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function StudentEventShowcase({ event, impact, month, team }) {
  const [impactVisible, setImpactVisible] = useState(false);
  const activeImpact = impact?.eventId === event.id ? impact : null;
  const rate = activeImpact ? Number(activeImpact.rate || 0) : 0;
  const currentAsset = Number(team?.currentAsset ?? team?.initialCapital ?? TEAM_BASE_ASSET);
  const beforeAsset = Number(activeImpact?.beforeAsset ?? currentAsset);
  const afterAsset = Number(activeImpact?.afterAsset ?? currentAsset);
  const changedAmount = afterAsset - beforeAsset;
  const changePct = beforeAsset ? Math.round(((afterAsset - beforeAsset) / beforeAsset) * 1000) / 10 : 0;
  const history = Array.isArray(team?.assetHistory) ? team.assetHistory.slice(-6) : [];
  const graphValues = history.length > 1 ? history.map((item) => Number(item.asset || 0)) : [beforeAsset, afterAsset];
  const graphMin = Math.min(...graphValues);
  const graphMax = Math.max(...graphValues);
  const graphRange = Math.max(1, graphMax - graphMin);
  const graphPoints = graphValues.map((value, index) => {
    const x = graphValues.length === 1 ? 0 : (index / (graphValues.length - 1)) * 100;
    const y = 48 - ((value - graphMin) / graphRange) * 40;
    return `${x},${y}`;
  }).join(" ");

  useEffect(() => {
    playWhoosh();
    setImpactVisible(false);
    const timer = window.setTimeout(() => setImpactVisible(true), 1500);
    return () => window.clearTimeout(timer);
  }, [event.id, month]);

  return (
    <div className="student-event-showcase" key={`${month}-${event.id}`}>
      <div className="event-spark event-spark-one" />
      <div className="event-spark event-spark-two" />
      <EventCardVisual event={event}>
        {impactVisible && activeImpact && (
          <div className={`student-impact-number ${rate >= 0 ? "student-impact-positive" : "student-impact-negative"}`}>
            <span className="student-impact-arrow">{rate >= 0 ? "▲" : "▼"}</span>
            {rate > 0 ? "+" : ""}{rate}%!!
          </div>
        )}
      </EventCardVisual>
      <div className={`student-event-asset-overlay ${activeImpact ? "student-event-asset-applied" : "student-event-asset-waiting"} ${changedAmount < 0 ? "student-event-asset-negative" : "student-event-asset-positive"}`}>
        <div>
          <p>{activeImpact ? "우리 팀 실시간 자산" : "현재 자산 현황"}</p>
          <strong>{formatWon(afterAsset)}</strong>
          {activeImpact && <span>{changedAmount >= 0 ? "+" : ""}{formatWon(changedAmount)} · {changePct >= 0 ? "+" : ""}{changePct}%</span>}
        </div>
        <svg viewBox="0 0 100 56" role="img" aria-label="우리 팀 자산 변화 그래프">
          <polyline points={graphPoints} />
        </svg>
      </div>
    </div>
  );
}
function DecisionVote({ room, uid, student, team }) {
  const currentVote = team?.midDecision?.votes?.[uid];
  async function vote(choice) {
    await updateDoc(doc(db, "rooms", room.roomId), {
      [`teams.${student.team}.midDecision.votes.${uid}`]: choice,
      sysMessage: `${team?.teamName || "팀"}에서 긴급 의사결정 투표가 진행 중입니다.`
    });
  }
  return (
    <section>
      <div className="event-card event-card-warning">
        <p className="text-sm font-black uppercase tracking-wide">12개월 차 긴급 의사결정</p>
        <h2 className="mt-2 text-2xl font-black">{room.currentDecision.title}</h2>
        <p className="mt-2 text-base leading-7">{room.currentDecision.description}</p>
      </div>
      <div className="mt-4 grid gap-3">
        <button onClick={() => vote("A")} className={`touch-button rounded-lg p-4 text-left font-black shadow-lift ${currentVote === "A" ? "bg-indigo-600 text-white" : "bg-white text-slate-900"}`}>A. {room.currentDecision.optionA}</button>
        <button onClick={() => vote("B")} className={`touch-button rounded-lg p-4 text-left font-black shadow-lift ${currentVote === "B" ? "bg-indigo-600 text-white" : "bg-white text-slate-900"}`}>B. {room.currentDecision.optionB}</button>
      </div>
      <p className="mt-3 text-center text-sm font-bold text-slate-500">{currentVote ? "투표 완료. 교사가 다음 진행을 시작합니다." : "팀원들과 상의한 뒤 선택하세요."}</p>
    </section>
  );
}
function Result({ room }) {
  const [selected, setSelected] = useState(null);
  const rankedTeams = useMemo(() => rankTeams(room.teams), [room.teams]);
  const winner = rankedTeams[0];
  return (
    <section>
      <h2 className="text-2xl font-black">최종 순위 및 사업 리포트</h2>
      {winner && (
        <button onClick={() => setSelected(winner)} className="mt-4 w-full overflow-hidden rounded-lg bg-gradient-to-br from-amber-300 via-orange-500 to-rose-600 p-1 text-left shadow-[0_16px_40px_rgba(245,158,11,0.35)]">
          <div className="rounded-lg bg-white/95 p-5">
            <p className="text-sm font-black text-amber-700">1위 팀</p>
            <h3 className="mt-1 text-4xl font-black text-slate-950">{winner.teamName}</h3>
            <AssetChangeSummary team={winner} featured className="mt-3" />
            <AssetTrendChart team={winner} className="mt-4" />
          </div>
        </button>
      )}
      <div className="mt-4 grid grid-cols-3 items-end gap-2">
        {[rankedTeams[1], rankedTeams[0], rankedTeams[2]].map((team, index) => {
          if (!team) return <div key={index} />;
          const place = index === 1 ? 1 : index === 0 ? 2 : 3;
          return (
            <button key={team.key} onClick={() => setSelected(team)} className={`rounded-lg p-3 shadow-lift ${place === 1 ? "min-h-36 bg-amber-50 ring-2 ring-amber-300" : "min-h-28 bg-white"}`}>
              <Award className={`mx-auto ${place === 1 ? "text-amber-500" : "text-slate-400"}`} />
              <p className={`mt-2 text-2xl font-black ${place === 1 ? "text-amber-700" : ""}`}>{place}위</p>
              <p className="break-keep text-sm font-bold">{team.teamName}</p>
              {place === 1 && <p className="mt-1 text-xs font-black text-slate-800">{formatWon(team.currentAsset || 0)}</p>}
            </button>
          );
        })}
      </div>
      <div className="mt-5 space-y-2">
        {rankedTeams.map((team, index) => (
          <button key={team.key} onClick={() => setSelected(team)} className={`touch-button w-full rounded-lg px-4 py-3 text-left shadow-lift ${index === 0 ? "bg-amber-50 ring-2 ring-amber-300" : "bg-white"}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-black">{index + 1}. {team.teamName}</span>
              <span className={`font-bold ${index === 0 ? "text-amber-700" : Number(team.currentAsset || 0) < 0 ? "text-rose-600" : "text-indigo-600"}`}>{formatWon(team.currentAsset || 0)}</span>
            </div>
            <AssetChangeSummary team={team} className="mt-2" />
            <div className="mt-2 flex flex-wrap gap-1">
              {getStudentsByTeam(room.students, team.key).map((member) => (
                <span key={member.uid} className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-600 ring-1 ring-slate-200">{member.nickname}</span>
              ))}
            </div>
          </button>
        ))}
      </div>
      {selected && <ReportModal team={selected} members={getStudentsByTeam(room.students, selected.key)} onClose={() => setSelected(null)} />}
    </section>
  );
}
function AssetBars({ teams, currentMonth = 0 }) {
  const ranked = rankTeams(teams);
  const values = ranked.map((team) => getDisplayAsset(team, currentMonth));
  const maxAbs = Math.max(1, ...values.map((value) => Math.abs(value)));
  return (
    <div className="mt-4 rounded-lg bg-white p-4 shadow-lift">
      <h3 className="flex items-center gap-2 font-black"><TrendingUp size={18} /> 팀별 실시간 자산</h3>
      <div className="mt-3 space-y-3">
        {ranked.map((team) => {
          const value = getDisplayAsset(team, currentMonth);
          return (
            <div key={team.key}>
              <div className="mb-1 flex justify-between text-sm"><span className="font-bold">{team.teamName}</span><span className={value < 0 ? "font-bold text-rose-600" : ""}>{formatWon(value)}</span></div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-all ${value < 0 ? "bg-rose-500" : "bg-indigo-500"}`} style={{ width: `${Math.max(3, (Math.abs(value) / maxAbs) * 100)}%` }} /></div>
            </div>
          );
        })}
      </div>
    </div>
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

function CanvasBlock({ title, children }) {
  return <section className="mt-4 rounded-lg bg-white p-4 shadow-lift"><h3 className="mb-3 flex items-center gap-2 font-black"><Lightbulb size={18} /> {title}</h3>{children}</section>;
}

function ChipGroup({ options, value, allowCustom = false, disabled = false, onChange }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState(options.includes(value) ? "" : value || "");
  const [customConfirmed, setCustomConfirmed] = useState(false);

  function saveCustom() {
    if (disabled) return;
    const next = customValue.trim();
    if (next) {
      onChange(next);
      setCustomConfirmed(true);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button key={option} type="button" disabled={disabled} onClick={() => onChange(option)} className={`touch-button rounded-full px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 ${value === option ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"}`}>
            {value === option && <Check size={14} className="mr-1 inline" />}
            {option}
          </button>
        ))}
        {allowCustom && (
          <button type="button" disabled={disabled} onClick={() => setCustomOpen(!customOpen)} className={`touch-button rounded-full px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 ${customOpen ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>직접 입력</button>
        )}
      </div>
      {allowCustom && customOpen && (
        <div className="mt-3 flex gap-2">
          <input disabled={disabled || customConfirmed} value={customValue} onChange={(event) => { setCustomValue(event.target.value); setCustomConfirmed(false); }} onKeyDown={(event) => event.key === "Enter" && saveCustom()} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-3 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" placeholder="직접 입력" />
          <button type="button" disabled={disabled || customConfirmed} onClick={saveCustom} className="touch-button rounded-lg bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-200 disabled:text-slate-400">{customConfirmed ? "등록됨" : "확인"}</button>
        </div>
      )}
    </div>
  );
}

function AssetTrendChart({ team, className = "" }) {
  const history = normalizeAssetHistory(team);
  const width = 360;
  const height = 140;
  const padding = 16;
  const values = history.map((point) => point.asset);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = history.map((point, index) => {
    const x = padding + (index / Math.max(1, history.length - 1)) * (width - padding * 2);
    const y = height - padding - ((point.asset - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });
  const last = history[history.length - 1];

  return (
    <div className={`rounded-lg bg-white p-3 ring-1 ring-slate-200 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-black text-slate-500">24개월 자산 추이</p>
        <p className="text-xs font-black text-indigo-700">{last?.month || 0}개월 · {formatWon(last?.asset || 0)}</p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full overflow-visible">
        <defs>
          <linearGradient id={`student-line-${team.teamId || team.key}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="50%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        {[0, 1, 2].map((line) => (
          <line key={line} x1={padding} x2={width - padding} y1={padding + line * 48} y2={padding + line * 48} stroke="#e2e8f0" strokeWidth="1" />
        ))}
        <polyline points={points.join(" ")} fill="none" stroke={`url(#student-line-${team.teamId || team.key})`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        {history.map((point, index) => {
          if (index !== 0 && index !== history.length - 1 && point.month % 6 !== 0) return null;
          const [x, y] = points[index].split(",").map(Number);
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

function getDisplayAsset(team, currentMonth) {
  if (!team) return 0;
  if (currentMonth > 0 || team.lastEventImpact) return Number(team.currentAsset || 0);
  return Number(team.initialCapital || TEAM_BASE_ASSET + Number(team.investmentsReceived || 0));
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

function TextModal({ field, value, onSave, onClose }) {
  const [draft, setDraft] = useState(value || "");
  const label = field === "problem" ? "문제" : "해결책";
  return (
    <div className="fixed inset-0 z-20 flex items-end bg-slate-900/50 p-4">
      <div className="w-full rounded-lg bg-white p-5 shadow-lift">
        <h3 className="text-xl font-black">{label}</h3>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="mt-3 min-h-36 w-full rounded-lg border border-slate-200 p-3 outline-none focus:border-indigo-500" placeholder={`${label}을 작성하세요`} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={onClose} className="touch-button rounded-lg bg-slate-100 px-4 py-3 font-bold">취소</button>
          <button onClick={() => { onSave(draft); onClose(); }} className="touch-button rounded-lg bg-indigo-600 px-4 py-3 font-bold text-white">저장</button>
        </div>
      </div>
    </div>
  );
}

function ReportModal({ team, members = [], onClose }) {
  const profit = Number(team.currentAsset || 0) - Number(team.initialCapital || 0);
  return (
    <div className="fixed inset-0 z-20 flex items-end bg-slate-900/50 p-4">
      <div className="max-h-[86vh] w-full overflow-y-auto rounded-lg bg-white p-5 shadow-lift">
        <h3 className="text-2xl font-black">{team.teamName} 성적표</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {members.map((member) => (
            <span key={member.uid} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 ring-1 ring-slate-200">{member.nickname}</span>
          ))}
        </div>
        <AssetTrendChart team={team} className="mt-4" />
        <div className="mt-4 space-y-3 text-sm leading-6">
          <p><b>선택 트렌드:</b> {team.trendCard?.title || "미선택"}</p>
          <p><b>선택 기술카드:</b> {team.techCard?.title || "미선택"}</p>
          <p><b>제품 및 서비스명:</b> {team.idea?.serviceName || "-"}</p>
          <p><b>문제정의:</b> {team.idea?.problem || "-"}</p>
          <p><b>고객정의:</b> {(team.idea?.customers || []).join(", ") || "-"}</p>
          <p><b>제품/서비스:</b> {team.idea?.product || "-"}</p>
          <p><b>수익모델:</b> {(team.idea?.revenueModels || []).join(", ") || "-"}</p>
          <p><b>최초 총 자산:</b> {formatWon(team.initialCapital || 0)}</p>
          <p><b>최종 총 자산:</b> {formatWon(team.currentAsset || 0)}</p>
          <p><b>최종 수익:</b> <span className={profit >= 0 ? "text-emerald-600" : "text-rose-600"}>{formatWon(profit)}</span></p>
        </div>
        <button onClick={onClose} className="touch-button mt-5 w-full rounded-lg bg-slate-900 px-4 py-3 font-bold text-white">닫기</button>
      </div>
    </div>
  );
}
function Notice({ children }) {
  return <div className="rounded-lg bg-white p-5 text-center font-bold shadow-lift">{children}</div>;
}

