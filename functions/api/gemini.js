export async function onRequestPost({ request, env }) {
  try {
    const { requestBody } = await request.json();
    const geminiApiKey = env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return new Response("GEMINI_API_KEY environment variable is missing.", { status: 500 });
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiApiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    if (response.status === 403) {
      return new Response(
        `Gemini API key was rejected with 403. Use a server-side Gemini key in GEMINI_API_KEY with API restrictions for Generative Language API only, and no HTTP referrer website restriction. Original response: ${responseText.slice(0, 500)}`,
        { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }

    return new Response(responseText, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json"
      }
    });
  } catch (error) {
    return new Response(error.message || "Gemini proxy failed.", { status: 500 });
  }
}
