// Run with: node server/aiEvaluationHandler.test.mjs
// Exercises the proxy handler with a mocked fetch (no network, no real keys).
import assert from "node:assert/strict";
import { decodeFirestoreFields, handleAiEvaluationRequest } from "./aiEvaluationHandler.js";
import { withDerivedInvestments, isValidInvestmentRecord } from "../src/lib/game.js";
import { onRequest } from "../functions/api/ai-evaluation.js";

const PROJECT = "startup-5ec16";
const OWNER = "teacherUid123";

function makeToken(payload) {
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${enc({ alg: "RS256" })}.${enc(payload)}.signature`;
}

const teacherToken = makeToken({ sub: OWNER, aud: PROJECT, firebase: { sign_in_provider: "password" } });
const otherTeacherToken = makeToken({ sub: "someoneElse", aud: PROJECT, firebase: { sign_in_provider: "password" } });
const anonToken = makeToken({ sub: "anon1", aud: PROJECT, firebase: { sign_in_provider: "anonymous" } });

const roomDocument = {
  fields: {
    ownerUid: { stringValue: OWNER },
    status: { stringValue: "AI_EVALUATION" },
    teams: {
      mapValue: {
        fields: {
          A: {
            mapValue: {
              fields: {
                teamName: { stringValue: "팀 A" },
                ideaSubmitted: { booleanValue: true },
                trendCard: { mapValue: { fields: { title: { stringValue: "1인가구 증가" } } } },
                techCard: { mapValue: { fields: { title: { stringValue: "인공지능" } } } },
                idea: {
                  mapValue: {
                    fields: {
                      serviceName: { stringValue: "혼밥 메이트" },
                      problem: { stringValue: "혼자 사는 사람들이 매일 식사 준비에 시간을 많이 쓰고 영양 균형이 무너진다" },
                      solution: { stringValue: "AI가 냉장고 재료와 취향을 분석해 10분 레시피와 장보기 목록을 자동 추천한다" },
                      product: { stringValue: "스마트폰 앱과 구독형 밀키트 배송을 결합한 서비스" },
                      tagline: { stringValue: "혼자여도 잘 먹자" },
                      customers: { arrayValue: { values: [{ stringValue: "1인 가구 직장인" }] } },
                      revenueModels: { arrayValue: { values: [{ stringValue: "구독" }] } },
                      marketingStrategies: { arrayValue: { values: [{ stringValue: "인스타그램" }] } }
                    }
                  }
                }
              }
            }
          },
          B: {
            mapValue: {
              fields: {
                teamName: { stringValue: "팀 B" },
                ideaSubmitted: { booleanValue: true },
                idea: { mapValue: { fields: { serviceName: { stringValue: "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ" } } } }
              }
            }
          },
          C: { mapValue: { fields: { teamName: { stringValue: "팀 C" }, ideaSubmitted: { booleanValue: false } } } }
        }
      }
    }
  }
};

const geminiBody = JSON.stringify({
  candidates: [{ content: { parts: [{ text: "```json\n" + JSON.stringify({
    factors: { F01: { grade: "양호", reason: "고객이 분명하다" }, F02: { grade: "취약", reason: "경쟁 분석 부족" }, F99: { grade: "양호" } },
    opinion: "좋은 출발입니다."
  }) + "\n```" }] } }]
});

function mockFetch({ firestoreStatus = 200, geminiStatus = 200, geminiText = geminiBody } = {}) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, init });
    if (String(url).startsWith("https://firestore.googleapis.com/")) {
      assert.equal(init.headers.Authorization.startsWith("Bearer "), true, "Firestore call must forward the ID token");
      return new Response(firestoreStatus === 200 ? JSON.stringify(roomDocument) : "denied", { status: firestoreStatus });
    }
    if (String(url).startsWith("https://generativelanguage.googleapis.com/")) {
      assert.match(String(url), /models\/gemini-2\.5-flash:generateContent$/);
      assert.equal(init.headers["x-goog-api-key"], "test-key");
      const body = JSON.parse(init.body);
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      calls.prompt = body.contents[0].parts[0].text;
      return new Response(geminiText, { status: geminiStatus, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  impl.calls = calls;
  return impl;
}

function mockFallbackFetch(firstStatus, firstText = "temporary failure", secondStatus = 200) {
  const calls = [];
  const impl = async (url, init = {}) => {
    if (String(url).startsWith("https://firestore.googleapis.com/")) {
      return new Response(JSON.stringify(roomDocument), { status: 200 });
    }
    const apiKey = init.headers["x-goog-api-key"];
    calls.push(apiKey);
    const status = apiKey === "primary-key" ? firstStatus : secondStatus;
    const bodyText = apiKey === "primary-key" ? firstText : (status === 200 ? geminiBody : "secondary failure");
    return new Response(bodyText, { status, headers: { "Content-Type": "application/json" } });
  };
  impl.geminiCalls = calls;
  return impl;
}

const env = { GEMINI_API_KEY: "test-key", FIREBASE_PROJECT_ID: PROJECT };
const body = (teamKey = "A") => JSON.stringify({ ownerUid: OWNER, roomId: "ABC123", teamKey });

async function run() {
  // Firestore value decoding
  assert.deepEqual(decodeFirestoreFields({ a: { integerValue: "3" }, b: { arrayValue: { values: [{ stringValue: "x" }] } }, c: { nullValue: null } }), { a: 3, b: ["x"], c: null });

  // 405 / missing key / missing token
  assert.equal((await handleAiEvaluationRequest({ method: "GET", env, rawBody: "", fetchImpl: mockFetch() })).status, 405);
  assert.equal((await handleAiEvaluationRequest({ method: "POST", env: {}, rawBody: body(), fetchImpl: mockFetch() })).status, 500);
  assert.equal((await handleAiEvaluationRequest({ method: "POST", env, rawBody: body(), fetchImpl: mockFetch() })).status, 401);

  // Anonymous student tokens are rejected before any network call
  {
    const fetchImpl = mockFetch();
    const res = await handleAiEvaluationRequest({ method: "POST", env, authorization: `Bearer ${anonToken}`, rawBody: body(), fetchImpl });
    assert.equal(res.status, 403);
    assert.equal(fetchImpl.calls.length, 0);
  }

  // A different teacher cannot evaluate someone else's room
  {
    const fetchImpl = mockFetch();
    const res = await handleAiEvaluationRequest({ method: "POST", env, authorization: `Bearer ${otherTeacherToken}`, rawBody: body(), fetchImpl });
    assert.equal(res.status, 403);
    assert.equal(fetchImpl.calls.length, 0);
  }

  // Firestore rejecting the token → 401, Gemini never called
  {
    const fetchImpl = mockFetch({ firestoreStatus: 403 });
    const res = await handleAiEvaluationRequest({ method: "POST", env, authorization: `Bearer ${teacherToken}`, rawBody: body(), fetchImpl });
    assert.equal(res.status, 401);
    assert.equal(fetchImpl.calls.length, 1);
  }

  // Invalid ids / malformed body
  assert.equal((await handleAiEvaluationRequest({ method: "POST", env, authorization: `Bearer ${teacherToken}`, rawBody: "{not json", fetchImpl: mockFetch() })).status, 400);
  assert.equal((await handleAiEvaluationRequest({ method: "POST", env, authorization: `Bearer ${teacherToken}`, rawBody: JSON.stringify({ ownerUid: OWNER, roomId: "../x", teamKey: "A" }), fetchImpl: mockFetch() })).status, 400);

  // Happy path: prompt built server-side, JSON fence stripped, unknown factor ignored, grades normalized
  {
    const fetchImpl = mockFetch();
    const res = await handleAiEvaluationRequest({ method: "POST", env, authorization: `Bearer ${teacherToken}`, rawBody: body(), fetchImpl });
    assert.equal(res.status, 200, res.body);
    const payload = JSON.parse(res.body);
    assert.equal(payload.source, "gemini");
    assert.equal(payload.evaluation.model, "gemini-2.5-flash");
    assert.equal(payload.evaluation.factors.F01.grade, "양호");
    assert.equal(payload.evaluation.factors.F02.grade, "취약");
    assert.equal(payload.evaluation.factors.F03.grade, "보통");
    assert.equal("F99" in payload.evaluation.factors, false);
    assert.equal(payload.evaluation.opinion, "좋은 출발입니다.");
    assert.equal(fetchImpl.calls.length, 2, "only Firestore and Google Gemini are called");
    assert.match(fetchImpl.calls.prompt, /혼밥 메이트/);
    assert.match(fetchImpl.calls.prompt, /팀 B/, "other submitted teams appear in comparison context");
    assert.doesNotMatch(fetchImpl.calls.prompt, /팀 C \|/, "unsubmitted teams are excluded");
  }

  // Team that failed the quality pre-check → deterministic result without calling Gemini
  {
    const fetchImpl = mockFetch();
    const res = await handleAiEvaluationRequest({ method: "POST", env, authorization: `Bearer ${teacherToken}`, rawBody: body("B"), fetchImpl });
    assert.equal(res.status, 200);
    const payload = JSON.parse(res.body);
    assert.equal(payload.source, "quality-check");
    assert.equal(payload.evaluation.factors.F01.grade, "취약");
    assert.equal(fetchImpl.calls.length, 1, "only the Firestore read happened");
  }

  // Unsubmitted team → 409; unknown team → 404
  assert.equal((await handleAiEvaluationRequest({ method: "POST", env, authorization: `Bearer ${teacherToken}`, rawBody: body("C"), fetchImpl: mockFetch() })).status, 409);
  assert.equal((await handleAiEvaluationRequest({ method: "POST", env, authorization: `Bearer ${teacherToken}`, rawBody: body("Z"), fetchImpl: mockFetch() })).status, 404);

  // Gemini failures surface as 502 so the client can fall back
  {
    const res = await handleAiEvaluationRequest({ method: 'POST', env, authorization: `Bearer ${teacherToken}`, rawBody: body(), fetchImpl: mockFetch({ geminiStatus: 400, geminiText: JSON.stringify({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }) }) });
    assert.equal(res.status, 502);
    assert.match(res.body, /GEMINI_API_KEY/);
    assert.match(res.body, /다시 배포/);
    assert.doesNotMatch(res.body, /test-key/);
    const trimmed = await handleAiEvaluationRequest({ method: 'POST', env: { ...env, GEMINI_API_KEY: ' test-key\n' }, authorization: `Bearer ${teacherToken}`, rawBody: body(), fetchImpl: mockFetch() });
    assert.equal(trimmed.status, 200);
  }
  assert.equal((await handleAiEvaluationRequest({ method: "POST", env, authorization: `Bearer ${teacherToken}`, rawBody: body(), fetchImpl: mockFetch({ geminiStatus: 401 }) })).status, 502);
  assert.equal((await handleAiEvaluationRequest({ method: "POST", env, authorization: `Bearer ${teacherToken}`, rawBody: body(), fetchImpl: mockFetch({ geminiText: "not json" }) })).status, 502);

  // Quota, rejected/invalid keys and transient Gemini failures move to the next configured key.
  for (const [status, responseText] of [
    [429, "quota exceeded"],
    [401, "unauthorized"],
    [403, "forbidden"],
    [400, JSON.stringify({ error: { message: "API_KEY_INVALID" } })],
    [500, "internal error"],
    [503, "temporarily unavailable"]
  ]) {
    const fetchImpl = mockFallbackFetch(status, responseText);
    const fallbackEnv = { ...env, GEMINI_API_KEY: "primary-key", GEMINI_API_KEY_2: "secondary-key" };
    const response = await handleAiEvaluationRequest({ method: "POST", env: fallbackEnv, authorization: `Bearer ${teacherToken}`, rawBody: body(), fetchImpl });
    assert.equal(response.status, 200, `status ${status} should use the fallback key`);
    assert.deepEqual(fetchImpl.geminiCalls, ["primary-key", "secondary-key"]);
  }

  // Ordinary 400 responses are request errors and must not consume another key.
  {
    const fetchImpl = mockFallbackFetch(400, "bad request");
    const fallbackEnv = { ...env, GEMINI_API_KEY: "primary-key", GEMINI_API_KEY_2: "secondary-key" };
    const response = await handleAiEvaluationRequest({ method: "POST", env: fallbackEnv, authorization: `Bearer ${teacherToken}`, rawBody: body(), fetchImpl });
    assert.equal(response.status, 502);
    assert.deepEqual(fetchImpl.geminiCalls, ["primary-key"]);
  }

  // If every key is rejected, the final key response and a safe attempt count are returned.
  {
    const fetchImpl = mockFallbackFetch(403, "primary rejected", 403);
    const fallbackEnv = { ...env, GEMINI_API_KEY: "primary-key", GEMINI_API_KEY_2: "secondary-key" };
    const response = await handleAiEvaluationRequest({ method: "POST", env: fallbackEnv, authorization: `Bearer ${teacherToken}`, rawBody: body(), fetchImpl });
    assert.equal(response.status, 502);
    assert.match(response.body, /키 2개 중 2개 실패/);
    assert.doesNotMatch(response.body, /primary-key|secondary-key/);
  }

  // Cloudflare entry point forwards its secret binding and bearer token to the same handler.
  {
    const originalFetch = globalThis.fetch;
    const fetchImpl = mockFetch();
    globalThis.fetch = fetchImpl;
    try {
      const response = await onRequest({ env, request: new Request('https://bizquest.pages.dev/api/ai-evaluation', {
        method: 'POST', headers: { Authorization: `Bearer ${teacherToken}` }, body: body()
      }) });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).evaluation.model, 'gemini-2.5-flash');
      assert.equal(fetchImpl.calls.length, 2);
      const get = await onRequest({ env, request: new Request('https://bizquest.pages.dev/api/ai-evaluation') });
      assert.equal(get.status, 405);
    } finally { globalThis.fetch = originalFetch; }
  }

  // Thinking parts must not corrupt the model's final JSON answer.
  {
    const completion = JSON.parse(geminiBody);
    completion.candidates[0].content.parts.unshift({ thought: true, text: 'internal reasoning' });
    const response = await handleAiEvaluationRequest({ method: 'POST', env, authorization: `Bearer ${teacherToken}`, rawBody: body(), fetchImpl: mockFetch({ geminiText: JSON.stringify(completion) }) });
    assert.equal(response.status, 200);
  }

  // Derived investments: budget/self-investment violations are ignored, totals computed on read
  {
    const teams = { A: { teamName: "A" }, B: { teamName: "B" } };
    const students = {
      s1: { team: "A", investmentSubmitted: true, investments: { B: 30000000 } },
      s2: { team: "B", investmentSubmitted: true, investments: { A: 60000000 } }, // over budget → ignored
      s3: { team: "B", investmentSubmitted: true, investments: { B: 10000000 } }, // self → ignored
      s4: { team: "A", investmentSubmitted: false, investments: { B: 10000000 } } // not submitted → ignored
    };
    assert.equal(isValidInvestmentRecord(students.s1, teams), true);
    assert.equal(isValidInvestmentRecord(students.s2, teams), false);
    const derived = withDerivedInvestments(teams, students, "INVESTMENT");
    assert.equal(derived.A.investmentsReceived, 0);
    assert.equal(derived.B.investmentsReceived, 30000000);
    // Frozen once the simulation runs
    const frozen = withDerivedInvestments({ A: { investmentsReceived: 5 } }, students, "SIMULATION");
    assert.equal(frozen.A.investmentsReceived, 5);
  }

  console.log("aiEvaluationHandler tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
