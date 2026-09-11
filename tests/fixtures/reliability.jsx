import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import InvestmentStage from "../../src/pages/student/InvestmentStage.jsx";
import { StudentTimerAlert } from "../../src/components/shared/PhaseTimer.jsx";
import { ensureStudentAuth } from "../../src/lib/studentSession.js";
import { useRoom } from "../../src/hooks/useRoom.js";
import "../../src/styles.css";
function SessionRoom() {
  const [refresh, setRefresh] = useState(0);
  const {room,loading,error} = useRoom("ABC123", "owner", refresh);
  return <><p data-testid="resumed-room">{loading ? "복원 중" : error || `${room?.status} · ${room?.students?.["original-student"]?.team}`}</p><button onClick={()=>setRefresh(n=>n+1)}>재연결</button></>;
}
function Harness() {
  const [tick, setTick] = useState(0);
  const [endsAt, setEndsAt] = useState(null);
  const [user, setUser] = useState("");
  const mode = new URLSearchParams(location.search).get("mode");
  useEffect(() => {
    if (mode === "session") {
      Promise.all([ensureStudentAuth(), ensureStudentAuth()]).then(([u]) => setUser(u.uid));
      return;
    }
    const id = setInterval(() => setTick(n => n + 1), 50);
    return () => clearInterval(id);
  }, []);
  const room = { ownerUid: "owner", roomId: "ABC123", createdAt: 1, teams: {
    A: { teamName: "우리 팀" },
    B: { teamName: "바다 팀", idea: { serviceName: "파도 발전기", problem: "에너지 부족" }, aiEvaluation: { opinion: "비용 검증이 필요합니다", factors: { F01: { grade: "양호", reason: "시장 근거 있음" } } } },
    C: { teamName: "하늘 팀", idea: { serviceName: "하늘 배송" } }
  } };
  const student = JSON.parse(JSON.stringify(window.serverStudent || { uid: "student", team: "A", investments: {}, investmentSubmitted: false }));
  if (mode === "session") return <><p role="status">{user || "복원 중"}</p><SessionRoom /></>;
  return <main style={{maxWidth: 460, margin: "20px auto", padding: 12}}>
    <span data-testid="tick">{tick}</span>
    <button onClick={() => setEndsAt(Date.now() + 61000)}>61초 시작</button>
    <StudentTimerAlert timer={endsAt ? { endsAt, durationMs: 61000 } : null} />
    <InvestmentStage room={room} uid="student" student={student} />
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
