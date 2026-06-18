import { formatGeneratedAt, formatWindow } from "@/app/lib/format";

interface HeaderProps {
  windowStart: string;
  windowEnd: string;
  totalPrs: number;
  poolSize: number;
  generatedAt: string;
}

export function Header({
  windowStart,
  windowEnd,
  totalPrs,
  poolSize,
  generatedAt,
}: HeaderProps) {
  return (
    <header className="border-b border-ink-200/70 bg-white/70 backdrop-blur-sm">
      <div className="mx-auto flex h-[80px] max-w-[1400px] items-center justify-between px-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-[20px] font-medium leading-none tracking-[-0.012em] text-ink-900">
            PostHog Engineering Impact
          </h1>
          <p className="tabular text-[13px] leading-none text-ink-500">
            <span className="font-mono">{formatWindow(windowStart, windowEnd)}</span>
            <span className="mx-2 text-ink-300">·</span>
            <span className="font-mono">{totalPrs.toLocaleString()}</span> merged PRs
            <span className="mx-2 text-ink-300">·</span>
            <span className="font-mono">{poolSize}</span> active contributors
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.08em] text-ink-400">
          <span className="font-mono normal-case tracking-normal text-[12px] text-ink-500">
            Generated {formatGeneratedAt(generatedAt)}
          </span>
          <span
            className="relative flex h-2 w-2"
            aria-label="live indicator"
            title="Latest data"
          >
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        </div>
      </div>
    </header>
  );
}
