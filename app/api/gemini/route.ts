import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { verificationResponseSchema } from "@/lib/gemini/schema";
import { buildVerificationPrompt } from "@/lib/gemini/prompts";
import type { SoundGaurdCategory } from "@/lib/ml/labels";

interface VerificationRequestBody {
  category: SoundGaurdCategory;
  label: string;
  confidence: number;
}

function isValidBody(body: unknown): body is VerificationRequestBody {
  if (!body || typeof body !== "object") return false;
  const candidate = body as Record<string, unknown>;
  return (
    typeof candidate.category === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.confidence === "number"
  );
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!isValidBody(body)) {
    return NextResponse.json(
      { error: "Expected { category, label, confidence } in request body." },
      { status: 400 }
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: buildVerificationPrompt(body.category, body.label, body.confidence),
      config: {
        responseMimeType: "application/json",
        responseSchema: verificationResponseSchema,
      },
    });

    const text = response.text;
    if (!text) {
      return NextResponse.json({ error: "Gemini returned an empty response." }, { status: 502 });
    }

    return NextResponse.json(JSON.parse(text));
  } catch (error) {
    console.error("Gemini verification failed", error);

    // The free tier allows a limited number of requests per day. Surface that
    // distinctly so the UI can explain the real reason instead of implying
    // the sound itself could not be verified.
    const status = (error as { status?: number })?.status;
    if (status === 429) {
      return NextResponse.json(
        { error: "Gemini daily quota reached.", quotaExceeded: true },
        { status: 429 }
      );
    }

    return NextResponse.json({ error: "Gemini verification failed." }, { status: 502 });
  }
}
