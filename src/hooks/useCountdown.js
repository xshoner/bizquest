import { useEffect, useState } from "react";

/**
 * Returns the remaining milliseconds until `endsAt` (epoch ms), re-rendering once a second.
 * Returns null when there is no active timer.
 */
export function useCountdown(endsAt) {
  const [remaining, setRemaining] = useState(() => (endsAt ? Math.max(0, Number(endsAt) - Date.now()) : null));

  useEffect(() => {
    if (!endsAt) {
      setRemaining(null);
      return undefined;
    }
    function tick() {
      setRemaining(Math.max(0, Number(endsAt) - Date.now()));
    }
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  return remaining;
}

export function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
