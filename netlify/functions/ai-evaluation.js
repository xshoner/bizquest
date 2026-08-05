const LETSUR_CHAT_COMPLETIONS_URL = "https://gw.letsur.ai/v1/chat/completions";
const LETSUR_MODEL = "gemini-2.5-pro";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { prompt } = JSON.parse(event.body || "{}");
    if (!String(prompt || "").trim()) {
      return { statusCode: 400, body: "AI evaluation prompt is missing." };
    }

    const letsurApiKey = process.env.LETSUR_API_KEY;
    if (!letsurApiKey) {
      return { statusCode: 500, body: "LETSUR_API_KEY environment variable is missing." };
    }

    const response = await fetch(LETSUR_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${letsurApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: LETSUR_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.25,
        response_format: { type: "json_object" }
      })
    });

    const responseText = await response.text();
    if (response.status === 401 || response.status === 403) {
      return {
        statusCode: response.status,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: `Letsur API key was rejected with ${response.status}. Check the server-side LETSUR_API_KEY environment variable. ${responseText.slice(0, 500)}`
      };
    }

    return {
      statusCode: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
      body: responseText
    };
  } catch (error) {
    return { statusCode: 500, body: error.message || "Letsur AI proxy failed." };
  }
}
