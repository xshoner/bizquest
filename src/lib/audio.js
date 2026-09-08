// Shared Web Audio helpers.
// A single AudioContext is created lazily and resumed on the first user gesture, which is what mobile
// browsers require before any sound can play. Creating a new context per sound (the previous approach)
// left every context suspended on phones, so effects were silent there.
let context = null;
let unlocked = false;

const MUTE_KEY = "bizquest-sound-muted";

export function isSoundMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setSoundMuted(muted) {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "true" : "false");
  } catch {
    // ignore storage failures
  }
}

function getContext() {
  if (typeof window === "undefined") return null;
  const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextImpl) return null;
  if (!context) context = new AudioContextImpl();
  return context;
}

function resume() {
  const ctx = getContext();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  unlocked = true;
}

/** Call once at app start: resumes the context on the first pointer/key interaction. */
export function installAudioUnlock() {
  if (typeof window === "undefined" || unlocked) return;
  const handler = () => {
    resume();
    window.removeEventListener("pointerdown", handler);
    window.removeEventListener("keydown", handler);
    window.removeEventListener("touchstart", handler);
  };
  window.addEventListener("pointerdown", handler, { passive: true });
  window.addEventListener("keydown", handler);
  window.addEventListener("touchstart", handler, { passive: true });
}

function withContext(play) {
  if (isSoundMuted()) return;
  try {
    const ctx = getContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    play(ctx, ctx.currentTime);
  } catch {
    // Autoplay policies can still block audio until the user interacts.
  }
}

export function playFanfare() {
  withContext((ctx, now) => {
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.51];
    notes.forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = index % 2 === 0 ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.22, now + index * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.12 + 0.28);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now + index * 0.12);
      oscillator.stop(now + index * 0.12 + 0.3);
    });
  });
}

export function playSimulationFinale() {
  withContext((ctx, now) => {
    const chord = [261.63, 329.63, 392, 523.25];
    chord.forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = index % 2 ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 2, now + 1.35);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.12 + index * 0.03);
      gain.gain.setValueAtTime(0.12, now + 0.75);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.65);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now + index * 0.04);
      oscillator.stop(now + 1.7);
    });
  });
}

export function playWhoosh() {
  withContext((ctx, now) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
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
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.38);
  });
}

/** Short rising cue used when the 12-month pivot cards enter the screen. */
export function playPivotTransition() {
  withContext((ctx, now) => {
    const notes = [293.66, 440, 659.25];
    notes.forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = index === 2 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.11);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.08, now + index * 0.11 + 0.3);
      gain.gain.setValueAtTime(0.0001, now + index * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.14, now + index * 0.11 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.11 + 0.42);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now + index * 0.11);
      oscillator.stop(now + index * 0.11 + 0.45);
    });
  });
}

/** Crisp two-part cue for a real room phase change. */
export function playPhaseTransition(status = "") {
  withContext((ctx, now) => {
    const phaseOffsets = {
      WAITING: 0,
      C_LEVEL: 20,
      CARD_SELECT: 40,
      IDEATION: 60,
      AI_EVALUATION: 80,
      INVESTMENT: 100,
      SIMULATION: 120,
      RESULT: 160
    };
    const base = 360 + Number(phaseOffsets[status] || 0);
    [base, base * 1.5].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = index ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.13);
      gain.gain.setValueAtTime(0.0001, now + index * 0.13);
      gain.gain.exponentialRampToValueAtTime(index ? 0.13 : 0.17, now + index * 0.13 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.13 + 0.38);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now + index * 0.13);
      oscillator.stop(now + index * 0.13 + 0.4);
    });
  });
}
