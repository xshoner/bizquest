const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_FIREBASE_PROJECT_ID = "startup-5ec16";
const HEALTH_TIMEOUT_MS = 12000;

function jsonResponse(status, payload) {
  return {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(payload)
  };
}

function decodeBase64Url(segment) {
  const normalized = String(segment || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  if (typeof atob === "function") {
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  }
  // eslint-disable-next-line no-undef
  return Buffer.from(padded, "base64").toString("utf8");
}

function decodeToken(token) {
  try {
    const parts = String(token || "").split(".");
    return parts.length === 3 ? JSON.parse(decodeBase64Url(parts[1])) : null;
  } catch {
    return null;
  }
}

async function verifyTeacher({ authorization, projectId, fetchImpl }) {
  const idToken = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
  const payload = decodeToken(idToken);
  if (!idToken || !payload?.sub || (payload.aud && payload.aud !== projectId)) return false;
  if (payload.firebase?.sign_in_provider === "anonymous") return false;

  // Firestore validates the token signature and the deployed isTeacher() rule.
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/appSettings/global`;
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${idToken}` } });
  return response.ok || response.status === 404;
}

async function checkKey(apiKey, fetchImpl) {
  if (!apiKey) return { configured: false, ok: false, message: "환경변수가 설정되지 않았습니다." };
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS) : null;
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(`${GEMINI_API_BASE}/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      // One input character and one output token keep this operational check negligible.
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "." }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 1 }
      }),
      signal: controller?.signal
    });
    return {
      configured: true,
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      message: response.ok ? "정상 호출되었습니다." : `호출 실패 (HTTP ${response.status})`
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      latencyMs: Date.now() - startedAt,
      message: error?.name === "AbortError" ? "호출 시간이 초과되었습니다." : "네트워크 호출에 실패했습니다."
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function handleGeminiHealthRequest({ method, authorization, env, fetchImpl = fetch }) {
  if (method !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });
  const projectId = env?.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
  if (!(await verifyTeacher({ authorization, projectId, fetchImpl }))) {
    return jsonResponse(401, { error: "교사 로그인이 필요합니다." });
  }

  const keys = [env?.GEMINI_API_KEY, env?.GEMINI_API_KEY_2].map((value) => String(value || "").trim());
  const checks = await Promise.all(keys.map((key) => checkKey(key, fetchImpl)));
  return jsonResponse(200, {
    model: GEMINI_MODEL,
    checkedAt: Date.now(),
    keys: { primary: checks[0], secondary: checks[1] }
  });
}
