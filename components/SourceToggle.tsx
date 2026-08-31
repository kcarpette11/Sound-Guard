import { memo } from "react";

interface SourceToggleProps {
  deviceAudio: boolean;
  disabled: boolean;
  onChange: (deviceAudio: boolean) => void;
}

function SourceToggle({ deviceAudio, disabled, onChange }: SourceToggleProps) {
  return (
    <div className="flex w-full items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white/70 px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-col gap-0.5">
        <span className="flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-100">
          <span>{deviceAudio ? "💻" : "🎤"}</span>
          {deviceAudio ? "Device audio" : "Microphone"}
        </span>
        <span className="text-xs text-zinc-400">
          {deviceAudio
            ? "Listening to sound playing on this computer"
            : "Listening to sound around you"}
        </span>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={deviceAudio}
        aria-label="Listen to device audio instead of the microphone"
        disabled={disabled}
        onClick={() => onChange(!deviceAudio)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          deviceAudio ? "bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-700"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
            deviceAudio ? "left-6" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

export default memo(SourceToggle);
