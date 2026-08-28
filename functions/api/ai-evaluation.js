import { handleAiEvaluationRequest } from "../../server/aiEvaluationHandler.js";

// Cloudflare Pages Function. Non-POST methods get an automatic 405 from Pages.
export async function onRequestPost({ request, env }) {
  try {
    const result = await handleAiEvaluationRequest({
      method: request.method,
      authorization: request.headers.get("Authorization"),
      rawBody: await request.text(),
      env
    });
    return new Response(result.body, { status: result.status, headers: result.headers });
  } catch (error) {
    return new Response(error.message || "AI proxy failed.", { status: 500 });
  }
}
