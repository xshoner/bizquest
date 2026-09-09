import { useEffect, useRef, useState } from "react";
import { updateOwnTeam } from "../lib/roomStore.js";

// Firestore may return map keys in a different order from the editor's object.
function fingerprint(value) {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
}

export function restorePlanDraft(key, savedIdea) {
  try {
    const draft = JSON.parse(localStorage.getItem(key));
    if (draft && draft.base === fingerprint(savedIdea || null)) return draft.idea;
  } catch { /* Storage may be disabled. Server saving remains available. */ }
  return savedIdea;
}

export function usePlanAutosave({ key, idea, savedIdea, enabled, ownerUid, roomId, teamKey }) {
  const [status, setStatus] = useState("");
  const timer = useRef(null);
  const queue = useRef(Promise.resolve());
  const latest = useRef(idea);
  const alive = useRef(true);
  const lastSaved = useRef(fingerprint(savedIdea || null));
  const enabledRef = useRef(enabled);
  latest.current = idea;
  enabledRef.current = enabled;
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(timer.current); }; }, []);

  function save(payload, submitted = false, message) {
    clearTimeout(timer.current);
    const serialized = fingerprint(payload);
    const work = queue.current.catch(() => {}).then(async () => {
      if (!submitted && (!alive.current || !enabledRef.current)) return;
      if (alive.current) setStatus(submitted ? "제출 중…" : "자동저장 중…");
      await updateOwnTeam(ownerUid, roomId, teamKey, { idea: payload, ideaSubmitted: submitted, aiEvaluation: null }, message);
      lastSaved.current = serialized;
      try {
        if (submitted || fingerprint(latest.current) === serialized) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify({ base: serialized, idea: latest.current }));
      } catch { /* Do not report a successful server save as failed. */ }
      if (alive.current) setStatus(submitted ? "제출 완료" : fingerprint(latest.current) === serialized ? "자동저장 완료" : "자동저장 대기");
    });
    queue.current = work;
    return work;
  }

  useEffect(() => {
    if (!enabled || fingerprint(idea) === lastSaved.current) return;
    try {
      localStorage.setItem(key, JSON.stringify({ base: fingerprint(savedIdea || null), idea }));
      setStatus("이 기기에 초안 저장됨 · 자동저장 대기");
    } catch { setStatus("자동저장 대기"); }
    const schedule = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        save(latest.current).catch(() => {
          if (alive.current) {
            setStatus("자동저장 실패 · 연결 후 재시도합니다. 제출 버튼으로 다시 저장할 수 있습니다.");
            timer.current = setTimeout(schedule, 5000);
          }
        });
      }, 800);
    };
    schedule();
    window.addEventListener("online", schedule);
    return () => { clearTimeout(timer.current); window.removeEventListener("online", schedule); };
  }, [idea, enabled, key, ownerUid, roomId, teamKey]);

  return { status, save };
}
