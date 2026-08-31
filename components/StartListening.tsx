import { memo } from "react";

interface StartListeningProps {
  isListening: boolean;
  isRequestingMic: boolean;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
}

function StartListening({
  isListening,
  isRequestingMic,
  error,
  onStart,
  onStop,
}: StartListeningProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex items-center justify-center">
        {isListening && (
          <span className="absolute h-24 w-24 animate-ping rounded-full bg-emerald-400/30" />
        )}
        <button
          type="button"
          onClick={isListening ? onStop : onStart}
          disabled={isRequestingMic}
          className={`relative flex h-20 w-20 items-center justify-center rounded-full text-3xl shadow-lg shadow-black/10 ring-4 transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-black/40 ${
            isListening
              ? "bg-red-600 text-white ring-red-500/20"
              : "bg-emerald-600 text-white ring-emerald-500/20 hover:bg-emerald-500"
          }`}
          aria-label={isListening ? "Stop listening" : "Start listening"}
        >
          {isRequestingMic ? "…" : isListening ? "■" : "🎤"}
        </button>
      </div>
      <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        {isRequestingMic
          ? "Requesting microphone…"
          : isListening
            ? "Listening — tap to stop"
            : "Tap to start listening"}
      </span>
      {error && <span className="max-w-xs text-center text-sm text-red-500">{error}</span>}
    </div>
  );
}

export default memo(StartListening);
