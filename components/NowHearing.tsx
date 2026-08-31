import { memo } from "react";
import { CATEGORY_META } from "@/lib/ml/labels";
import type { DominantSound } from "@/lib/alerts/alertEngine";

interface NowHearingProps {
  isListening: boolean;
  dominant: DominantSound | null;
}

function NowHearing({ isListening, dominant }: NowHearingProps) {
  if (!isListening) return null;

  const meta = dominant ? CATEGORY_META[dominant.category] : null;
  const percent = dominant ? Math.round(dominant.score * 100) : 0;

  return (
    <div className="flex w-full max-w-md flex-col gap-2.5 rounded-2xl border border-zinc-200 bg-white/80 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Now hearing
      </span>

      {meta && dominant ? (
        <>
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl ${meta.chipBg} ${meta.accent}`}
            >
              {meta.emoji}
            </span>
            <span className="flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
              {meta.title}
            </span>
            <span className={`text-sm font-semibold tabular-nums ${meta.accent}`}>
              {percent}%
            </span>
          </div>
          <div
            className={`h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800 ${meta.accent}`}
          >
            <div
              className="h-full rounded-full bg-current transition-all duration-300"
              style={{ width: `${Math.max(4, percent)}%` }}
            />
          </div>
        </>
      ) : (
        <p className="py-1 text-sm text-zinc-400">
          Nothing important right now — monitoring your surroundings.
        </p>
      )}
    </div>
  );
}

export default memo(NowHearing);
