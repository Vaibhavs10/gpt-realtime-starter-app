import { NextResponse, type NextRequest } from "next/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = "gpt-realtime-mini";
const REALTIME_SESSION_ENDPOINT = "https://api.openai.com/v1/realtime/sessions";

export async function POST(_request: NextRequest) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY in environment variables." },
      { status: 500 }
    );
  }

  try {
    const openAiResponse = await fetch(REALTIME_SESSION_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "realtime=v1",
      },
      body: JSON.stringify({
        model: MODEL,
        modalities: ["text"],
        // Voice is optional, but making it explicit helps when you upgrade to audio later.
        voice: "verse",
      }),
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
