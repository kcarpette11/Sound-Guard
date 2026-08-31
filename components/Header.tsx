interface HeaderProps {
  isListening: boolean;
}

export default function Header({ isListening }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-zinc-200/70 bg-white/70 px-6 py-4 backdrop-blur-md dark:border-zinc-800/70 dark:bg-black/60">
      <div className="flex items-center gap-2.5">
        <span className="text-2xl">🛡️</span>
        <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          SoundGaurd
        </span>
      </div>

      {isListening ? (
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live
        </span>
      ) : (
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          Sound alerts, made visible
        </span>
      )}
    </header>
  );
}
