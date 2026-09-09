import test from "node:test";
import assert from "node:assert/strict";
import { handleGeminiHealthRequest } from "./geminiHealthHandler.js";

const PROJECT = "startup-5ec16";
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const teacherToken = `${encode({ alg: "RS256" })}.${encode({ sub: "teacher", aud: PROJECT, firebase: { sign_in_provider: "password" } })}.signature`;
const studentToken = `${encode({ alg: "RS256" })}.${encode({ sub: "student", aud: PROJECT, firebase: { sign_in_provider: "anonymous" } })}.signature`;

test("Gemini 상태 점검은 두 키를 각각 최소 토큰으로 호출한다", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    if (String(url).startsWith("https://firestore.googleapis.com/")) return new Response(JSON.stringify({ fields: { enabled: { booleanValue: true } } }), { status: 200 });
    const requestBody = JSON.parse(init.body);
    calls.push({ key: init.headers["x-goog-api-key"], requestBody });
    const status = init.headers["x-goog-api-key"] === "primary-key" ? 200 : 429;
    return new Response(status === 200 ? "ok" : "quota", { status });
  };
  const response = await handleGeminiHealthRequest({
    method: "POST",
    authorization: `Bearer ${teacherToken}`,
    env: { FIREBASE_PROJECT_ID: PROJECT, GEMINI_API_KEY: "primary-key", GEMINI_API_KEY_2: "secondary-key" },
    fetchImpl
  });
  assert.equal(response.status, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.keys.primary.ok, true);
  assert.equal(payload.keys.secondary.ok, false);
  assert.deepEqual(calls.map((call) => call.key).sort(), ["primary-key", "secondary-key"]);
  for (const call of calls) {
    assert.equal(call.requestBody.contents[0].parts[0].text, ".");
    assert.equal(call.requestBody.generationConfig.maxOutputTokens, 1);
  }
});

test("Gemini 상태 점검은 미설정 키를 노출 없이 이상으로 표시한다", async () => {
  const fetchImpl = async (url) => {
    if (String(url).startsWith("https://firestore.googleapis.com/")) return new Response(JSON.stringify({ fields: { enabled: { booleanValue: true } } }), { status: 200 });
    return new Response("ok", { status: 200 });
  };
  const response = await handleGeminiHealthRequest({
    method: "POST",
    authorization: `Bearer ${teacherToken}`,
    env: { FIREBASE_PROJECT_ID: PROJECT, GEMINI_API_KEY: "secret-primary" },
    fetchImpl
  });
  const payload = JSON.parse(response.body);
  assert.equal(payload.keys.primary.ok, true);
  assert.equal(payload.keys.secondary.configured, false);
  assert.doesNotMatch(response.body, /secret-primary/);
});

test("익명 사용자는 Gemini 키 상태를 점검할 수 없다", async () => {
  let called = false;
  const response = await handleGeminiHealthRequest({
    method: "POST",
    authorization: `Bearer ${studentToken}`,
    env: { FIREBASE_PROJECT_ID: PROJECT, GEMINI_API_KEY: "secret" },
    fetchImpl: async () => { called = true; return new Response("{}"); }
  });
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

 test("일반 교사는 운영자 문서가 없거나 비활성화되어 있으면 키 점검을 실행할 수 없다", async () => {
  for (const status of [200, 403, 404]) {
    let calls = 0;
    const result = await handleGeminiHealthRequest({ method: "POST", authorization: `Bearer ${teacherToken}`, env: {}, fetchImpl: async (url) => { calls++; assert.match(url, /platformAdmins\/teacher/); return new Response(JSON.stringify({ fields: { enabled: { booleanValue: false } } }), { status }); } });
    assert.equal(result.status, 401); assert.equal(calls, 1);
  }
});
