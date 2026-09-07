// Platform-agnostic AI evaluation proxy.
//
// Security model:
//  1. The client sends its Firebase ID token. We never trust the decoded payload on its own —
//     the token is validated by using it to read the room document through the Firestore REST API,
//     which enforces the deployed security rules. If Firestore rejects the token, we reject the call.
//  2. Only the room owner (teacher) may request an evaluation: token `sub` must equal `ownerUid`.
//  3. The prompt is built here from Firestore data, so clients cannot inject arbitrary prompts.
import {
  assessStudentPlanQuality,
  buildEvaluationPrompt,
  isPlanSubmitted,
  makeClearlyInvalidAiEvaluation,
  normalizeAiEvaluation,
  stripJsonFence
} from "../src/lib/aiEvaluation.js";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_FIREBASE_PROJECT_ID = "startup-5ec16";
const GEMINI_TIMEOUT_MS = 45000;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function textResponse(status, message) {
  return { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }, body: message };
}

function jsonResponse(status, payload) {
  return { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, body: JSON.stringify(payload) };
}

function decodeBase64Url(segment) {
  const normalized = String(segment || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  if (typeof atob === "function") {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  // eslint-disable-next-line no-undef
  return Buffer.from(padded, "base64").toString("utf8");
}

function decodeIdTokenPayload(idToken) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(decodeBase64Url(parts[1]));
  } catch {
    return null;
  }
}

// Converts a Firestore REST "Value" into a plain JS value.
export function decodeFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return new Date(value.timestampValue).getTime();
  if ("mapValue" in value) return decodeFirestoreFields(value.mapValue?.fields || {});
  if ("arrayValue" in value) return (value.arrayValue?.values || []).map(decodeFirestoreValue);
  return null;
}

export function decodeFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]));
}

async function fetchRoomWithToken({ projectId, ownerUid, roomId, idToken, fetchImpl }) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(ownerUid)}/rooms/${encodeURIComponent(roomId)}`;
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (response.status === 401 || response.status === 403) {
    return { error: textResponse(401, "Firebase authentication was rejected. Sign in again as the room owner.") };
  }
  if (response.status === 404) {
    return { error: textResponse(404, "Room not found.") };
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { error: textResponse(502, `Firestore read failed (${response.status}). ${detail.slice(0, 200)}`) };
  }
  const document = await response.json();
  return { room: decodeFirestoreFields(document.fields || {}) };
}

async function callGemini({ apiKey, model, prompt, fetchImpl }) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS) : null;
  try {
    const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.25,
          responseMimeType: "application/json"
        }
      }),
      signal: controller?.signal
    });
    const responseText = await response.text();
    return { response, responseText };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * @param {object} input
 * @param {string} input.method
 * @param {string} input.authorization  Raw Authorization header value
 * @param {string} input.rawBody        Request body as text
 * @param {Record<string, string|undefined>} input.env
 * @param {typeof fetch} [input.fetchImpl]
 * @returns {Promise<{status:number, headers:Record<string,string>, body:string}>}
 */
export async function handleAiEvaluationRequest({ method, authorization, rawBody, env, fetchImpl = fetch }) {
  if (method !== "POST") return textResponse(405, "Method Not Allowed");

  const geminiApiKey = String(env?.GEMINI_API_KEY || "").trim();
  if (!geminiApiKey) return textResponse(500, "GEMINI_API_KEY environment variable is missing.");
  const projectId = env?.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;

  const idToken = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!idToken) return textResponse(401, "Missing Firebase ID token.");
  const tokenPayload = decodeIdTokenPayload(idToken);
  if (!tokenPayload?.sub) return textResponse(401, "Malformed Firebase ID token.");
  if (tokenPayload.aud && tokenPayload.aud !== projectId) return textResponse(401, "Token audience does not match this project.");
  if (tokenPayload.firebase?.sign_in_provider === "anonymous") return textResponse(403, "Only teacher accounts can request AI evaluation.");

  let payload;
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    return textResponse(400, "Request body must be JSON.");
  }
  const ownerUid = String(payload.ownerUid || "");
  const roomId = String(payload.roomId || "");
  const teamKey = String(payload.teamKey || "");
  if (![ownerUid, roomId, teamKey].every((value) => ID_PATTERN.test(value))) {
    return textResponse(400, "ownerUid, roomId and teamKey are required.");
  }
  if (tokenPayload.sub !== ownerUid) return textResponse(403, "Only the room owner can request AI evaluation.");

  // This read both validates the token (Firestore verifies the signature) and fetches trusted data.
  const { room, error } = await fetchRoomWithToken({ projectId, ownerUid, roomId, idToken, fetchImpl });
  if (error) return error;
  if (room.ownerUid && room.ownerUid !== ownerUid) return textResponse(403, "Room owner mismatch.");

  const team = room.teams?.[teamKey];
  if (!team) return textResponse(404, "Team not found in this room.");
  if (!isPlanSubmitted(team)) return textResponse(409, "This team has not submitted a business plan yet.");

  const inputQuality = assessStudentPlanQuality(team);
  if (!inputQuality.valid) {
    return jsonResponse(200, { evaluation: makeClearlyInvalidAiEvaluation(team, inputQuality.reason), source: "quality-check" });
  }

  const comparisonTeams = Object.entries(room.teams || {})
    .filter(([key, other]) => key !== teamKey && isPlanSubmitted(other))
    .map(([, other]) => other);
  const prompt = buildEvaluationPrompt(team, comparisonTeams);

  let gemini;
  try {
    gemini = await callGemini({ apiKey: geminiApiKey, model: GEMINI_MODEL, prompt, fetchImpl });
  } catch (err) {
    return textResponse(504, `Gemini request failed: ${String(err?.message || err).slice(0, 200)}`);
  }
  const { response, responseText } = gemini;
  const invalidApiKey = response.status === 400 && /API_KEY_INVALID|API key not valid/i.test(responseText);
  if (invalidApiKey || response.status === 401 || response.status === 403) {
    return textResponse(502, `Gemini API key was rejected with ${response.status}. Cloudflare Pages의 Production 환경변수 GEMINI_API_KEY를 새 키로 저장하고 다시 배포하세요. 미리보기 주소는 Preview 환경도 확인하세요.`);
  }
  if (!response.ok) {
    return textResponse(502, `Gemini responded with ${response.status}. ${responseText.slice(0, 300)}`);
  }

  try {
    const completion = JSON.parse(responseText);
    const text = (completion.candidates?.[0]?.content?.parts || []).filter((part) => !part.thought).map((part) => part?.text || "").join("");
    if (!text) throw new Error("No text was returned by Gemini.");
    const raw = JSON.parse(stripJsonFence(text));
    return jsonResponse(200, { evaluation: normalizeAiEvaluation(raw, team), source: "gemini" });
  } catch (err) {
    return textResponse(502, `Gemini returned malformed JSON: ${String(err?.message || err).slice(0, 200)}`);
  }
}
