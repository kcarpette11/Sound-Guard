import type { VerificationResponse } from "@/lib/gemini/schema";

interface GeminiVerificationProps {
  status: "idle" | "loading" | "done" | "error" | "quota";
  result: VerificationResponse | null;
}

export default function GeminiVerification({ status, result }: GeminiVerificationProps) {
  if (status === "idle") return null;

  return (
    <div className="w-full rounded-xl bg-black/10 p-3 text-left backdrop-blur-sm dark:bg-white/10">
      {status === "loading" && (
        <p className="text-sm text-white/80">✨ Verifying with Gemini…</p>
      )}
      {status === "error" && (
        <p className="text-sm text-white/80">✨ Gemini verification unavailable right now.</p>
      )}
      {status === "quota" && (
        <p className="text-sm text-white/80">
          ✨ Gemini daily limit reached — the alert above is unaffected.
        </p>
      )}
      {status === "done" && result && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
            {result.verified ? "✨ Gemini verified" : "✨ Gemini review"}
          </p>
          <p className="text-sm text-white">{result.message}</p>
        </div>
      )}
    </div>
  );
}
