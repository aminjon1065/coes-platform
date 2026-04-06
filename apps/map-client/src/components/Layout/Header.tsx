export function Header() {
  return (
    <header className="flex-shrink-0 h-12 bg-brand-900 border-b border-brand-800
      flex items-center px-4 gap-3 z-30 shadow-md">
      {/* CoESCD emblem placeholder */}
      <div className="w-7 h-7 bg-brand-600 rounded-full flex items-center justify-center
        text-white text-xs font-bold flex-shrink-0">
        Т
      </div>

      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-semibold text-white leading-none truncate">
          CoESCD — Operational Map
        </h1>
        <p className="text-xs text-brand-300 leading-none mt-0.5 truncate">
          Committee of Emergency Situations and Civil Defense
        </p>
      </div>

      {/* Right-side status indicator */}
      <div className="flex items-center gap-1.5 text-xs text-brand-300 flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        <span className="hidden sm:inline">Live</span>
      </div>
    </header>
  );
}
