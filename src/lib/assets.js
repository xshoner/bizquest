// Central image registry. Card images are keyed by their file prefix (A01, B07, E12 ...) so a missing
// or renamed file only affects that one card instead of shifting every index.
function byPrefix(globResult, pattern) {
  return Object.fromEntries(
    Object.entries(globResult)
      .map(([path, image]) => [path.match(pattern)?.[0], image])
      .filter(([id]) => id)
  );
}

export const trendCardImages = byPrefix(import.meta.glob("../images/B*.webp", { eager: true, import: "default" }), /B\d{2}/);
export const techCardImages = byPrefix(import.meta.glob("../images/A*.webp", { eager: true, import: "default" }), /A\d{2}/);
export const eventCardImages = byPrefix(import.meta.glob("../images/E*.webp", { eager: true, import: "default" }), /E\d{2}/);

function pad(index) {
  return String(Number(index) + 1).padStart(2, "0");
}

/** Trend cards are B01..B15, tech cards A01..A15; `card.index` is zero-based in gameData. */
export function getTrendCardImage(card) {
  if (!card) return "";
  return trendCardImages[card.image] || trendCardImages[`B${pad(card.index)}`] || "";
}

export function getTechCardImage(card) {
  if (!card) return "";
  return techCardImages[card.image] || techCardImages[`A${pad(card.index)}`] || "";
}

export function getEventImage(event) {
  return eventCardImages[event?.id] || "";
}
