export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { requestBody, apiKey } = JSON.parse(event.body || "{}");
    const geminiApiKey = process.env.GEMINI_API_KEY || apiKey;
    if (!geminiApiKey) {
      return { statusCode: 500, body: "GEMINI_API_KEY environment variable is missing." };
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiApiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    return {
      statusCode: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
      body: await response.text()
    };
  } catch (error) {
    return { statusCode: 500, body: error.message || "Gemini proxy failed." };
  }
}
