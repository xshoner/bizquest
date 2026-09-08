import { handleGeminiHealthRequest } from "../../server/geminiHealthHandler.js";

export async function onRequest({ request, env }) {
  const result = await handleGeminiHealthRequest({
    method: request.method,
    authorization: request.headers.get("Authorization"),
    env
  });
  return new Response(result.body, { status: result.status, headers: result.headers });
}
