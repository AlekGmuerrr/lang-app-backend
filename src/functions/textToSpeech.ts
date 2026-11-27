import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

const VOICE_MAP: Record<string, string> = {
  spanish: "es-ES-ElviraNeural",
  french: "fr-FR-DeniseNeural",
  german: "de-DE-KatjaNeural",
  italian: "it-IT-ElsaNeural",
  japanese: "ja-JP-NanamiNeural",
};

const LOCALE_MAP: Record<string, string> = {
  spanish: "es-ES",
  french: "fr-FR",
  german: "de-DE",
  italian: "it-IT",
  japanese: "ja-JP",
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function textToSpeech(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const speechKey = process.env.AZURE_SPEECH_KEY;
  const speechRegion = process.env.AZURE_SPEECH_REGION;

  if (!speechKey || !speechRegion) {
    context.error("Azure Speech credentials are not set.");
    return { status: 500, jsonBody: { error: "Server misconfigured: missing Azure Speech credentials." } };
  }

  let body: { text?: string; language?: string };
  try {
    body = (await request.json()) as { text?: string; language?: string };
  } catch {
    return { status: 400, jsonBody: { error: "Expected JSON body with a 'text' field." } };
  }

  const text = (body.text || "").trim();
  if (!text) {
    return { status: 400, jsonBody: { error: "Missing 'text' field." } };
  }

  const languageKey = (body.language || "spanish").toLowerCase();
  const voice = VOICE_MAP[languageKey] || VOICE_MAP.spanish;
  const locale = LOCALE_MAP[languageKey] || LOCALE_MAP.spanish;

  const ssml = `<speak version="1.0" xml:lang="${locale}"><voice name="${voice}">${escapeXml(text)}</voice></speak>`;
  const url = `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": speechKey,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
        "User-Agent": "language-app-backend",
      },
      body: ssml,
    });

    if (!response.ok) {
      const errText = await response.text();
      context.error(`Azure TTS error: ${response.status} ${errText}`);
      return { status: 502, jsonBody: { error: "Text-to-speech request failed." } };
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    return { status: 200, headers: { "Content-Type": "audio/mpeg" }, body: audioBuffer };
  } catch (err) {
    context.error("Error calling Azure TTS", err);
    return { status: 500, jsonBody: { error: "Unexpected server error." } };
  }
}

app.http("textToSpeech", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: textToSpeech,
});