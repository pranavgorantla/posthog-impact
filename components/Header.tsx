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
          <a
            href="https://github.com/pranavgorantla/posthog-impact"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 font-mono normal-case tracking-normal text-[12px] text-ink-400 hover:text-ink-700 transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="currentColor"
              aria-hidden
            >
              <path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.483 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.021C22 6.484 17.522 2 12 2z" />
            </svg>
            view source
          </a>
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
