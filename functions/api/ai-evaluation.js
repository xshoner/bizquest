const LETSUR_CHAT_COMPLETIONS_URL = "https://gw.letsur.ai/v1/chat/completions";
const LETSUR_MODEL = "gemini-2.5-pro";

export async function onRequestPost({ request, env }) {
  try {
    const { prompt } = await request.json();
    if (!String(prompt || "").trim()) {
      return new Response("AI evaluation prompt is missing.", { status: 400 });
    }

    const letsurApiKey = env.LETSUR_API_KEY;
    if (!letsurApiKey) {
      return new Response("LETSUR_API_KEY environment variable is missing.", { status: 500 });
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
      return new Response(
        `Letsur API key was rejected with ${response.status}. Check the server-side LETSUR_API_KEY environment variable. ${responseText.slice(0, 500)}`,
        { status: response.status, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }

    return new Response(responseText, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json"
      }
    });
  } catch (error) {
    return new Response(error.message || "Letsur AI proxy failed.", { status: 500 });
  }
}
