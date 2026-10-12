import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

interface ChatRequestBody {
  message: string;
  language?: string;
}

const END_PHRASE = "end session";

export async function chat(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return { status: 400, jsonBody: { error: "Expected JSON body with a 'message' field." } };
  }

  const userMessage = (body.message || "").trim();
  const language = body.language || "Spanish";

  if (!userMessage) {
    return { status: 400, jsonBody: { error: "Missing 'message' field." } };
  }

  // Check for the hands-free stop phrase before sending anything to Claude
  if (userMessage.toLowerCase().includes(END_PHRASE)) {
    return { jsonBody: { endSession: true, reply: "Session ended. Great practice today." } };
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    context.error("CLAUDE_API_KEY is not set in local.settings.json");
    return { status: 500, jsonBody: { error: "Server misconfigured: missing API key." } };
  }

  const systemPrompt = `You are a friendly, patient ${language} conversation tutor speaking with a learner who is practicing hands-free while driving. They cannot read text, so every correction, translation, or clarification must be spoken naturally as part of your reply — never use brackets, symbols, or written annotations.

Keep responses short (1-3 sentences), conversational, and at an appropriate difficulty level. If the learner makes a grammar or vocabulary mistake, gently restate the corrected version naturally in your reply before continuing the conversation, the way a patient native speaker would. Stay in ${language} unless the learner seems completely lost, in which case briefly clarify in English.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      context.error(`Claude API error: ${response.status} ${errText}`);
      return { status: 502, jsonBody: { error: "Claude API request failed." } };
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text ?? "Sorry, I didn't catch that.";

    return { jsonBody: { endSession: false, reply } };
  } catch (err) {
    context.error("Error calling Claude API", err);
    return { status: 500, jsonBody: { error: "Unexpected server error." } };
  }
}

app.http("chat", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: chat,
});