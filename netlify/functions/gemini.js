export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { requestBody } = JSON.parse(event.body || "{}");
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return { statusCode: 500, body: "GEMINI_API_KEY environment variable is missing." };
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiApiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    if (response.status === 403) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: `Gemini API key was rejected with 403. Use a server-side Gemini key in GEMINI_API_KEY with API restrictions for Generative Language API only, and no HTTP referrer website restriction. Original response: ${responseText.slice(0, 500)}`
      };
    }

    return {
      statusCode: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
      body: responseText
    };
  } catch (error) {
    return { statusCode: 500, body: error.message || "Gemini proxy failed." };
  }
}
