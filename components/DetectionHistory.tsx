import { memo } from "react";
import { CATEGORY_META } from "@/lib/ml/labels";
import type { Detection } from "@/lib/alerts/alertEngine";

interface DetectionHistoryProps {
  history: Detection[];
}

function DetectionHistory({ history }: DetectionHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
        <span className="text-2xl opacity-60">👂</span>
        <p className="text-sm text-zinc-400">
          Detected sounds will appear here once SoundGaurd hears something important.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex w-full flex-col gap-2 overflow-y-auto">
      {history.map((detection) => {
        const meta = CATEGORY_META[detection.category];
        return (
          <li
            key={detection.id}
            className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${meta.chipBg} ${meta.accent}`}
            >
              {meta.emoji}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
                {meta.title}
              </span>
              <span className="text-xs text-zinc-400">
                {new Date(detection.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.chipBg} ${meta.accent}`}
            >
              {Math.round(detection.confidence * 100)}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default memo(DetectionHistory);
