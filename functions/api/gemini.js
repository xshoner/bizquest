export async function onRequestPost({ request, env }) {
  try {
    const { requestBody, apiKey } = await request.json();
    const geminiApiKey = env.GEMINI_API_KEY || apiKey;
    if (!geminiApiKey) {
      return new Response("GEMINI_API_KEY environment variable is missing.", { status: 500 });
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiApiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json"
      }
    });
  } catch (error) {
    return new Response(error.message || "Gemini proxy failed.", { status: 500 });
  }
}
