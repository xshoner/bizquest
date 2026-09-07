import { handleAiEvaluationRequest } from "../../server/aiEvaluationHandler.js";

// Handle every method so unsupported requests cannot fall through to the SPA HTML.
export async function onRequest({ request, env }) {
  try {
    const result = await handleAiEvaluationRequest({
      method: request.method,
      authorization: request.headers.get("Authorization"),
      rawBody: await request.text(),
      env
    });
    return new Response(result.body, { status: result.status, headers: result.headers });
  } catch (error) {
    return new Response("Gemini 평가 서버에서 요청을 처리하지 못했습니다.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
}
