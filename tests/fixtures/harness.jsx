import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { useAdminBgm } from "../../src/hooks/useAdminBgm.js";
import { restorePlanDraft, usePlanAutosave } from "../../src/hooks/usePlanAutosave.js";
import { StudentAiEvaluationReport } from "../../src/pages/student/SimulationStage.jsx";
import { BUSINESS_FACTORS } from "../../src/data/gameData.js";
import "../../src/styles.css";

function Harness() {
  const [phase, setPhase] = useState("WAITING");
  const bgm = useAdminBgm("test-room", phase);
  const [submitted, setSubmitted] = useState(false);
  const [idea, setIdea] = useState(() => restorePlanDraft("test-draft", null) || { serviceName: "" });
  const autosave = usePlanAutosave({ key: "test-draft", idea, savedIdea: null, enabled: !submitted, ownerUid: "test-owner", roomId: "test-room", teamKey: "A" });
  const team = { teamName: "테스트 팀 <script>alert(1)</script>", idea, aiEvaluation: { opinion: "강점과 보완점을 확인하세요.", factors: Object.fromEntries(BUSINESS_FACTORS.map(({ id }) => [id, { grade: "보통", reason: `${id} 구현 방식을 검토할 필요가 있다.` }])) } };
  return <main style={{ maxWidth: 480, margin: "24px auto", padding: 16 }}>
    <select aria-label="단계" value={phase} onChange={(event) => setPhase(event.target.value)}>{["WAITING", "C_LEVEL", "IDEATION", "AI_EVALUATION", "INVESTMENT", "SIMULATION", "RESULT"].map((value) => <option key={value}>{value}</option>)}</select>
    {bgm.available && <button data-bgm-control onClick={bgm.toggle}>BGM {bgm.playing ? "중지" : "재생"}</button>}
    <button onClick={bgm.play}>시뮬레이션 시작</button><button onClick={bgm.pause}>시뮬레이션 일시정지</button>
    <input aria-label="사업명" disabled={submitted} value={idea.serviceName} onChange={(event) => setIdea({ serviceName: event.target.value })} />
    <p role="status">{autosave.status}</p>
    <button onClick={async () => { setSubmitted(true); await autosave.save(idea, true); }}>제출</button>
    <StudentAiEvaluationReport team={team} />
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
