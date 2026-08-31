import { CATEGORY_META } from "@/lib/ml/labels";
import type { Detection } from "@/lib/alerts/alertEngine";
import type { VerificationResponse } from "@/lib/gemini/schema";
import GeminiVerification from "./GeminiVerification";

interface AlertOverlayProps {
  detection: Detection;
  geminiStatus: "idle" | "loading" | "done" | "error" | "quota";
  geminiResult: VerificationResponse | null;
  onDismiss: () => void;
}

export default function AlertOverlay({
  detection,
  geminiStatus,
  geminiResult,
  onDismiss,
}: AlertOverlayProps) {
  const meta = CATEGORY_META[detection.category];

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center text-white ${meta.gradient}`}
      role="alertdialog"
      aria-live="assertive"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-[2rem] border border-white/25 bg-white/10 p-10 shadow-2xl backdrop-blur-xl">
        <div className="relative flex h-28 w-28 items-center justify-center">
          <span className="absolute h-full w-full animate-ping rounded-full bg-white/20" />
          <span className="absolute h-full w-full rounded-full bg-white/10" />
          <span className={`relative text-6xl ${meta.iconAnimation}`}>{meta.emoji}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <h2 className="text-2xl font-bold sm:text-3xl">{meta.title}</h2>
          <p className="text-base text-white/80">
            {Math.round(detection.confidence * 100)}% confidence detection
          </p>
        </div>

        <GeminiVerification status={geminiStatus} result={geminiResult} />

        <button
          type="button"
          onClick={onDismiss}
          className="mt-2 rounded-full bg-white px-8 py-3 text-sm font-semibold text-zinc-900 shadow-lg transition hover:bg-white/90 active:scale-95"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
