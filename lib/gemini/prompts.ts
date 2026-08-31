import type { SoundGaurdCategory } from "@/lib/ml/labels";

export function buildVerificationPrompt(
  category: SoundGaurdCategory,
  label: string,
  confidence: number
): string {
  return `You are the verification layer for SoundGaurd, an accessibility app that turns important environmental sounds into alerts for Deaf and hard-of-hearing users.

A local on-device audio classifier just detected:
- Raw label: "${label}"
- Mapped category: "${category}"
- Confidence: ${(confidence * 100).toFixed(0)}%

Confirm whether this classification is plausible, assign a severity, and write ONE short, accessible sentence (max 20 words) explaining what the user should know. Do not mention percentages or model names in the message.`;
}

export function buildHistorySummaryPrompt(
  history: { category: SoundGaurdCategory; timestamp: number }[]
): string {
  const lines = history
    .map((entry) => `- ${new Date(entry.timestamp).toLocaleTimeString()}: ${entry.category}`)
    .join("\n");

  return `You are SoundGaurd, an accessibility app for Deaf and hard-of-hearing users. Here is a recent log of environmental sounds detected near the user:

${lines}

In 1-2 short, plain-language sentences, summarize what has likely been happening around the user. Do not list every entry back verbatim.`;
}
