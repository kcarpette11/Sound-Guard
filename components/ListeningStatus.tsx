import { levelToFraction } from "@/lib/audio/level";

interface ListeningStatusProps {
  isListening: boolean;
  level: number;
  deviceAudio: boolean;
}

const BAR_COUNT = 24;

function barColor(fraction: number): string {
  if (fraction > 0.85) return "bg-red-500";
  if (fraction > 0.6) return "bg-amber-500";
  return "bg-emerald-500";
}

export default function ListeningStatus({
  isListening,
  level,
  deviceAudio,
}: ListeningStatusProps) {
  // Raw linear RMS barely moves for normal speech volume — dB scaling
  // matches how level meters are perceived and stays responsive at
  // conversational volume, not just very loud sounds.
  const normalized = levelToFraction(level);
  const activeBars = Math.round(normalized * BAR_COUNT);

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-zinc-200 bg-white/80 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {deviceAudio ? "Device audio input" : "Microphone input"}
      </span>

      <div
        className="flex h-12 w-full items-end justify-center gap-[3px]"
        role="meter"
        aria-label={deviceAudio ? "Device audio input level" : "Microphone input level"}
        aria-valuenow={Math.round(normalized * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {Array.from({ length: BAR_COUNT }).map((_, i) => {
          const barFraction = (i + 1) / BAR_COUNT;
          const isActive = isListening && i < activeBars;
          return (
            <span
              key={i}
              className={`w-1.5 rounded-full transition-all duration-75 ease-out ${
                isActive ? barColor(barFraction) : "bg-zinc-200 dark:bg-zinc-800"
              }`}
              style={{ height: `${16 + barFraction * 84}%` }}
            />
          );
        })}
      </div>

      <span className="text-[11px] text-zinc-400">
        {isListening ? "Reacting to sound in real time" : "Idle — start listening to activate"}
      </span>
    </div>
  );
}
