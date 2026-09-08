import { SIMULATION_MONTHS, formatWon, getAssetChange, getTeamStartingCapital } from "../../lib/game.js";

export function gradeClassName(grade) {
  if (grade === "양호") return "bg-emerald-100 text-emerald-800";
  if (grade === "취약") return "bg-rose-100 text-rose-800";
  return "bg-amber-100 text-amber-800";
}

/** Samples a team's asset history to every second month (plus the last point) for compact charts. */
export function normalizeAssetHistory(team) {
  const history = Array.isArray(team.assetHistory) && team.assetHistory.length > 1
    ? team.assetHistory
    : [
        { month: 0, asset: getTeamStartingCapital(team) },
        { month: SIMULATION_MONTHS, asset: Number(team.currentAsset || getTeamStartingCapital(team)) }
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

/**
 * Line chart of a team's asset over the simulation.
 * `size="wide"` is the teacher layout (520×150), `size="compact"` the student layout (360×140).
 */
export function AssetTrendChart({ team, className = "", size = "wide" }) {
  const history = normalizeAssetHistory(team);
  const width = size === "compact" ? 360 : 520;
  const height = size === "compact" ? 140 : 150;
  const padding = size === "compact" ? 16 : 18;
  const gridStep = size === "compact" ? 48 : 52;
  const values = history.map((point) => point.asset);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = history.map((point, index) => {
    const x = padding + (index / Math.max(1, history.length - 1)) * (width - padding * 2);
    const y = height - padding - ((point.asset - min) / range) * (height - padding * 2);
    return [x, y];
  });
  const last = history[history.length - 1];
  const gradientId = `asset-line-${size}-${team.teamId || team.key}`;
  const pivotIndex = history.findIndex((point) => point.month === 12);
  const pivotX = pivotIndex >= 0 ? points[pivotIndex]?.[0] : null;

  return (
    <div className={`rounded-lg bg-white p-3 ring-1 ring-slate-200 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-black text-slate-500">{SIMULATION_MONTHS}개월 총 자산 변동 추이</p>
        <p className="text-xs font-black text-indigo-700">{last?.month || 0}개월 · {formatWon(last?.asset || 0)}</p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className={`${size === "compact" ? "h-32" : "h-36"} w-full overflow-visible`} role="img" aria-label={`${team.teamName || "팀"} 자산 변동 추이`}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="50%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        {[0, 1, 2].map((line) => (
          <line key={line} x1={padding} x2={width - padding} y1={padding + line * gridStep} y2={padding + line * gridStep} stroke="#e2e8f0" strokeWidth="1" />
        ))}
        {pivotX !== null && <><line x1={pivotX} x2={pivotX} y1={padding - 4} y2={height - padding + 4} stroke="#f59e0b" strokeWidth="2" strokeDasharray="5 5" /><text x={pivotX} y={padding - 6} textAnchor="middle" fill="#b45309" fontSize="11" fontWeight="900">PIVOT</text></>}
        <polyline points={points.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke={`url(#${gradientId})`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        {history.map((point, index) => {
          if (index !== 0 && index !== history.length - 1 && point.month % 6 !== 0) return null;
          const [x, y] = points[index];
          return <circle key={point.month} cx={x} cy={y} r="4" fill="#0f172a" />;
        })}
      </svg>
    </div>
  );
}

/** "Initial → final" asset summary with the final block coloured by gain/loss. */
export function AssetChangeSummary({ team, featured = false, className = "" }) {
  const { initial, final, delta, rate, positive } = getAssetChange(team);
  const tone = positive ? "asset-change-up" : "asset-change-down";
  return (
    <div className={`asset-change-summary ${tone} ${featured ? "asset-change-summary-featured" : ""} ${className}`}>
      <div>
        <p>최초 총 자산</p>
        <strong>{formatWon(initial)}</strong>
      </div>
      <div className="asset-change-arrow" aria-hidden="true">▶</div>
      <div className="asset-change-final">
        <p>최종 총 자산</p>
        <strong>{formatWon(final)}</strong>
        <span className="asset-change-delta">{positive ? "▲ +" : "▼ "}{formatWon(delta)} · {positive ? "+" : ""}{rate.toFixed(1)}%</span>
      </div>
    </div>
  );
}
