import { handleAiEvaluationRequest } from "../../server/aiEvaluationHandler.js";

export async function handler(event) {
  try {
    const headers = event.headers || {};
    const result = await handleAiEvaluationRequest({
      method: event.httpMethod,
      authorization: headers.authorization || headers.Authorization,
      rawBody: event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "",
      env: process.env
    });
    return { statusCode: result.status, headers: result.headers, body: result.body };
  } catch (error) {
    return { statusCode: 500, body: error.message || "AI proxy failed." };
  }
}
