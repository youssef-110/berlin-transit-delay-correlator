export function Logo({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="relative grid place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-emerald-400 shadow-lg shadow-indigo-500/30"
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 12h4l2.5-6 4 12 3-8 1.5 2H22" />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-tight text-white">VBB Pulse</div>
        <div className="text-[10.5px] font-medium text-slate-400">Berlin · Potsdam</div>
      </div>
    </div>
  );
}

export function lineColorClass(line: string): string {
  const l = line.toUpperCase();
  if (l.startsWith("S")) return "bg-sbahn";
  if (l.startsWith("U")) return "bg-ubahn";
  if (l.startsWith("RE") || l.startsWith("RB") || l.startsWith("FEX")) return "bg-regio";
  if (l.startsWith("M") || /^\d{2}$/.test(l)) return "bg-tram";
  return "bg-bus";
}

export function LineBadge({ line, size = "md" }: { line: string; size?: "sm" | "md" | "lg" }) {
  const s = size === "lg" ? "min-w-14 px-3 py-1.5 text-lg" : size === "sm" ? "min-w-9 px-1.5 py-0.5 text-[11px]" : "min-w-11 px-2 py-1 text-sm";
  return <span className={`inline-flex items-center justify-center rounded-md font-extrabold tracking-tight text-white shadow-sm ${lineColorClass(line)} ${s}`}>{line}</span>;
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-white/30 border-t-white ${className}`}
      aria-hidden="true"
    />
  );
}

