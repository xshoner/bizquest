import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { STATUSES } from "../../data/gameData.js";
import { getEventImage } from "../../lib/assets.js";
import { playFanfare } from "../../lib/audio.js";

export const RESULT_FIREWORKS_DURATION = 10000;

/** Plays the fanfare exactly once when the room enters RESULT. */
export function FanfareOnResult({ status }) {
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current !== STATUSES.RESULT && status === STATUSES.RESULT) playFanfare();
    previous.current = status;
  }, [status]);
  return null;
}

export function ResultFireworks({ status }) {
  const previous = useRef(status);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (previous.current !== STATUSES.RESULT && status === STATUSES.RESULT) {
      setVisible(true);
      const timer = window.setTimeout(() => setVisible(false), RESULT_FIREWORKS_DURATION);
      previous.current = status;
      return () => window.clearTimeout(timer);
    }
    previous.current = status;
    return undefined;
  }, [status]);

  if (!visible) return null;
  return createPortal((
    <div className="result-fireworks" aria-hidden="true">
      {Array.from({ length: 22 }, (_, index) => <span key={index} />)}
    </div>
  ), document.body);
}

/**
 * Full-screen "final results are being tallied" overlay.
 * `variant="stage"` is the large teacher-screen showcase, `variant="phase"` the compact student overlay.
 */
export function ResultFinalizingShowcase({ variant = "stage" }) {
  if (variant === "phase") {
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

export function AiEvaluationShowcase() {
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

export function EventCardVisual({ event, children }) {
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
