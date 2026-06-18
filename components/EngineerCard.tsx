import { Top5Entry } from "@/app/types";
import { toScoreOutOf100 } from "@/app/lib/format";
import { pickDistinguishingStats } from "@/app/lib/stats";
import { PillarBar } from "./PillarBar";

interface EngineerCardProps {
  entry: Top5Entry;
  rank: number;
  pool: Top5Entry[];
}

const PILLAR_COLORS = {
  shipped: "#5a6b85",
  leverage: "#6f72a8",
  reach: "#5d8b86",
} as const;

export function EngineerCard({ entry, rank, pool }: EngineerCardProps) {
  const stats = pickDistinguishingStats(entry, pool);
  const score100 = toScoreOutOf100(entry.score);
  const isTop = rank === 1;

  return (
    <article
      className={[
        "group relative flex flex-col rounded-md border bg-white p-5 transition",
        "shadow-card hover:shadow-card-hover hover:-translate-y-[1px]",
        isTop ? "border-accent/30" : "border-ink-200",
      ].join(" ")}
    >
      {/* Top-1 accent stripe */}
      {isTop && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[2px] rounded-t-md bg-accent/80"
        />
      )}

      {/* Rank + avatar row */}
      <header className="mb-4 flex items-start justify-between">
        <div
          className={[
            "flex h-[26px] min-w-[26px] items-center justify-center rounded-[3px] px-[6px] font-mono text-[12px] font-medium tabular",
            isTop
              ? "bg-accent text-white"
              : "bg-ink-100 text-ink-700",
          ].join(" ")}
          aria-label={`Rank ${rank}`}
        >
          {rank}
        </div>
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={entry.avatar_url}
            alt={`${entry.login} avatar`}
            width={28}
            height={28}
            className="h-7 w-7 rounded-full border border-ink-200 bg-ink-100"
          />
          <a
            href={`https://github.com/${entry.login}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group/link inline-flex items-center gap-1 text-[13px] font-medium text-ink-800 hover:text-ink-900"
            title={`Open @${entry.login} on GitHub`}
          >
            <span>{entry.login}</span>
            <svg
              className="h-3 w-3 text-ink-400 transition group-hover/link:text-ink-700"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden
            >
              <path
                d="M4 2h6v6M10 2L4 8M4 6v4H2V4h4"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>
      </header>

      {/* Score */}
      <div className="mb-4 flex items-baseline gap-2">
        <div className="font-mono text-[44px] font-medium leading-none tracking-[-0.02em] text-ink-900 tabular">
          {score100}
        </div>
        <div className="text-[11px] uppercase tracking-[0.08em] text-ink-400">
          impact score
        </div>
      </div>

      {/* Pillar bars */}
      <div className="mb-4 flex flex-col gap-2.5">
        <PillarBar
          label="Shipped outcomes"
          value={entry.pillars.shipped}
          colorVar={PILLAR_COLORS.shipped}
          tone="shipped"
        />
        <PillarBar
          label="Leverage on others"
          value={entry.pillars.leverage}
          colorVar={PILLAR_COLORS.leverage}
          tone="leverage"
        />
        <PillarBar
          label="Codebase reach"
          value={entry.pillars.reach}
          colorVar={PILLAR_COLORS.reach}
          tone="reach"
        />
      </div>

      {/* Narrative */}
      <p className="mb-3 line-clamp-3 text-[12.5px] italic leading-[1.45] text-ink-600">
        {entry.narrative}
      </p>

      {/* Primary scopes */}
      {entry.primary_scopes?.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {entry.primary_scopes.map((scope) => (
            <span
              key={scope}
              className="rounded-[3px] bg-ink-100 px-[6px] py-[2px] font-mono text-[10.5px] leading-none text-ink-600"
            >
              {scope}
            </span>
          ))}
        </div>
      )}

      {/* 2x2 stat grid */}
      <div className="mt-auto grid grid-cols-2 gap-x-3 gap-y-3 border-t border-ink-100 pt-4">
        {stats.map((s) => (
          <div key={s.key} className="flex flex-col gap-0.5">
            <div className="font-mono text-[18px] font-medium leading-none tracking-[-0.01em] text-ink-900 tabular">
              {s.displayValue}
            </div>
            <div className="text-[11.5px] font-medium leading-tight text-ink-700">
              {s.label}
            </div>
            <div className="text-[10.5px] leading-tight text-ink-400">
              {s.helper}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
