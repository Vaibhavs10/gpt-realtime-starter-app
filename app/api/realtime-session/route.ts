import { NextResponse } from "next/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_SESSION_ENDPOINT = "https://api.openai.com/v1/realtime/sessions";
const DEFAULT_MODEL = "gpt-realtime-mini";
const SUPPORTED_MODELS = new Set(["gpt-realtime-mini", "gpt-realtime"]);
const SUPPORTED_VOICES = new Set([
  "verse",
  "alloy",
  "ember",
  "marin",
  "cedar",
]);

export async function POST(request: Request) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY in environment variables." },
      { status: 500 }
    );
  }

  try {
    const payload = await request
      .json()
      .catch(() => ({} as { instructions?: unknown }));
    const instructions =
      typeof payload?.instructions === "string"
        ? payload.instructions.trim()
        : undefined;

    const requestedModel =
      typeof payload?.model === "string" ? payload.model : undefined;
    const model =
      requestedModel && SUPPORTED_MODELS.has(requestedModel)
        ? requestedModel
        : DEFAULT_MODEL;

    const requestedVoice =
      typeof payload?.voice === "string" ? payload.voice : undefined;
    const voice =
      requestedVoice && SUPPORTED_VOICES.has(requestedVoice)
        ? requestedVoice
        : "verse";

    const sessionRequest: Record<string, unknown> = {
      model,
      modalities: ["text", "audio"],
      voice,
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 400,
        create_response: true,
      },
      input_audio_transcription: {
        model: "whisper-1",
      },
    };

    if (instructions) {
      sessionRequest.instructions = instructions;
    }

    const openAiResponse = await fetch(REALTIME_SESSION_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "realtime=v1",
      },
      body: JSON.stringify(sessionRequest),
    });

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text();
      console.error("OpenAI realtime session error:", errorText);
      return NextResponse.json(
        { error: "Failed to create realtime session.", details: errorText },
        { status: 500 }
      );
    }

    const session = await openAiResponse.json();
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error("Realtime session request failed:", error);
    return NextResponse.json(
      { error: "Unexpected error while creating realtime session." },
      { status: 500 }
    );
  }
}
