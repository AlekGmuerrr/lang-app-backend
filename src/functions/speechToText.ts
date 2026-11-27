import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

const LANGUAGE_CODES: Record<string, string> = {
  spanish: "es-ES",
  french: "fr-FR",
  german: "de-DE",
  italian: "it-IT",
  japanese: "ja-JP",
};

export async function speechToText(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const speechKey = process.env.AZURE_SPEECH_KEY;
  const speechRegion = process.env.AZURE_SPEECH_REGION;

  if (!speechKey || !speechRegion) {
    context.error("Azure Speech credentials are not set.");
    return { status: 500, jsonBody: { error: "Server misconfigured: missing Azure Speech credentials." } };
  }

  const languageParam = (request.query.get("language") || "spanish").toLowerCase();
  const languageCode = LANGUAGE_CODES[languageParam] || "es-ES";

  const audioBuffer = Buffer.from(await request.arrayBuffer());
  if (!audioBuffer || audioBuffer.length === 0) {
    return { status: 400, jsonBody: { error: "No audio data received." } };
  }

  const url = `https://${speechRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${languageCode}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": speechKey,
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        "Accept": "application/json",
      },
      body: audioBuffer,
    });

    if (!response.ok) {
      const errText = await response.text();
      context.error(`Azure STT error: ${response.status} ${errText}`);
      return { status: 502, jsonBody: { error: "Speech-to-text request failed." } };
    }

    const data: any = await response.json();

    if (data.RecognitionStatus !== "Success" || !data.DisplayText) {
      return { jsonBody: { transcript: "", recognized: false } };
    }

    return { jsonBody: { transcript: data.DisplayText, recognized: true } };
  } catch (err) {
    context.error("Error calling Azure STT", err);
    return { status: 500, jsonBody: { error: "Unexpected server error." } };
  }
}

app.http("speechToText", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: speechToText,
});