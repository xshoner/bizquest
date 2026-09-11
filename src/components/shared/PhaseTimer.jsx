import { Hourglass, TimerReset } from "lucide-react";
import { formatCountdown, useCountdown } from "../../hooks/useCountdown.js";

export const PHASE_TIMER_PRESETS_MIN = [3, 5, 10];
const WARNING_MS = 30000;

/**
 * Countdown display shared by teacher and students.
 * `timer` is the room's `phaseTimer` field: { endsAt, durationMs, phase, startedAt } or null.
 */
export function PhaseTimerDisplay({ timer, compact = false }) {
  const remaining = useCountdown(timer?.endsAt);
  if (!timer?.endsAt || remaining === null) return null;
  const expired = remaining <= 0;
  const warning = !expired && remaining <= WARNING_MS;
  const progress = timer.durationMs ? Math.max(0, Math.min(100, (remaining / timer.durationMs) * 100)) : 0;
  return (
    <div className={`phase-timer ${compact ? "phase-timer-compact" : ""} ${expired ? "phase-timer-expired" : warning ? "phase-timer-warning" : ""}`} role="timer" aria-live={warning || expired ? "assertive" : "off"}>
      <span className="phase-timer-icon">{expired ? <TimerReset size={compact ? 16 : 20} /> : <Hourglass size={compact ? 16 : 20} />}</span>
      <span className="phase-timer-body">
        <b>{expired ? "시간 종료" : formatCountdown(remaining)}</b>
        {!compact && <small>{expired ? "알림 종료 · 활동은 계속할 수 있어요" : "남은 시간"}</small>}
      </span>
      <i className="phase-timer-bar" aria-hidden="true"><b style={{ width: `${progress}%` }} /></i>
    </div>
  );
}

export function StudentTimerAlert({ timer }) {
  const remaining = useCountdown(timer?.endsAt);
  const seconds = remaining === null ? null : Math.ceil(remaining / 1000);
  const label = seconds <= 60 && seconds >= 58 ? "1분" : seconds <= 20 && seconds >= 18 ? "20초" : seconds >= 1 && seconds <= 5 ? String(seconds) : null;
  if (!timer?.endsAt || !label) return null;
  return <div className="student-timer-alert" role="status" aria-live="assertive" aria-atomic="true"><strong key={label}>{label}</strong></div>;
}
