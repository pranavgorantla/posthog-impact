"use client";

import { useState } from "react";
import {
  DashboardData,
  CCType,
} from "@/app/types";
import { formatGeneratedAt, formatWindow } from "@/app/lib/format";

interface MethodologyProps {
  data: DashboardData;
}

const TYPE_ORDER: CCType[] = [
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "chore",
  "docs",
  "test",
  "build",
  "ci",
  "style",
  "other",
];

function computeCcCoverage(data: DashboardData): number {
  // Approximate coverage by summing top_5 breakdowns (best proxy we have
  // in the published artifact). 0% in degraded data, ~100% in healthy data.
  let total = 0;
  let categorized = 0;
  for (const e of data.top_5) {
    for (const [type, count] of Object.entries(e.raw_metrics.prs_by_type)) {
      total += count;
      if (type !== "other") categorized += count;
    }
  }
  if (total === 0) return 0;
  return Math.round((categorized / total) * 100);
}

export function Methodology({ data }: MethodologyProps) {
  const [open, setOpen] = useState(false);
  const ccCoverage = computeCcCoverage(data);

  return (
    <section className="rounded-md border border-ink-200 bg-white shadow-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-md px-5 py-3 text-left transition hover:bg-ink-50/60"
      >
        <span className="flex items-center gap-2.5 text-[13px] font-medium text-ink-800">
          <svg
            className={`h-3 w-3 text-ink-500 transition-transform ${open ? "rotate-90" : ""}`}
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden
          >
            <path
              d="M4 2l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          How is this calculated?
        </span>
        <span className="font-mono text-[11px] text-ink-400">
          {open ? "hide" : "show"}
        </span>
      </button>

      {open && (
        <div className="grid grid-cols-12 gap-x-8 gap-y-6 border-t border-ink-100 px-5 py-5 text-[12.5px] leading-[1.55] text-ink-600">
          {/* Formula */}
          <div className="col-span-12 md:col-span-7">
            <h3 className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-500">
              Three-pillar formula
            </h3>
            <code className="block rounded-[3px] border border-ink-200 bg-ink-50/50 px-3 py-2 font-mono text-[12px] text-ink-800">
              score = 0.40 × shipped + 0.35 × leverage + 0.25 × reach
            </code>
            <p className="mt-3">
              Each pillar is the average of its component metrics, min-max
              normalized across the contributor pool ({data.pool_size} active
              contributors who met{" "}
              <span className="font-mono text-ink-700">
                {data.methodology.pool_filter}
              </span>
              ).
            </p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-ink-600">
              <li>
                <span className="font-medium text-ink-700">Shipped:</span>{" "}
                weighted PR count, feat count, fix count.
              </li>
              <li>
                <span className="font-medium text-ink-700">Leverage:</span>{" "}
                substantive reviews, unique authors reviewed.
              </li>
              <li>
                <span className="font-medium text-ink-700">Reach:</span>{" "}
                distinct CC scopes touched, active weeks.
              </li>
            </ul>
          </div>

          {/* Weights table */}
          <div className="col-span-12 md:col-span-5">
            <h3 className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-500">
              Conventional-commit weights
            </h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[12px]">
              {TYPE_ORDER.map((t) => (
                <div
                  key={t}
                  className="flex items-baseline justify-between border-b border-dotted border-ink-100 py-1"
                >
                  <span className="text-ink-700">{t}:</span>
                  <span className="tabular text-ink-900">
                    {(data.methodology.weights[t] ?? 0).toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Bot exclusion */}
          <div className="col-span-12 md:col-span-7">
            <h3 className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-500">
              Bot exclusion
            </h3>
            <p>
              Excluded{" "}
              <span className="font-mono text-ink-900">
                {data.bot_filter_excluded.toLocaleString()}
              </span>{" "}
              bot-authored PRs using an explicit allowlist plus suffix patterns:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.methodology.bot_patterns.map((p) => (
                <code
                  key={p}
                  className="rounded-[2px] border border-ink-200 bg-ink-50/60 px-1.5 py-0.5 font-mono text-[11px] text-ink-700"
                >
                  {p}
                </code>
              ))}
            </div>
          </div>

          {/* Honest note */}
          <div className="col-span-12 md:col-span-5">
            <h3 className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-500">
              What we don&rsquo;t use
            </h3>
            <p>
              <span className="font-mono text-ink-900">0%</span> of PRs in this
              window had linked closing issues, so we categorize by conventional
              commit type{" "}
              <span className="font-mono text-ink-900">({ccCoverage}%</span>{" "}
              coverage) and scope rather than GitHub Issue labels.
            </p>
          </div>

          {/* Run summary */}
          <div className="col-span-12 border-t border-ink-100 pt-4">
            <div className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-[11.5px] text-ink-500">
              <span>
                <span className="text-ink-400">window: </span>
                <span className="text-ink-700">
                  {formatWindow(data.window.start, data.window.end)}
                </span>
              </span>
              <span>
                <span className="text-ink-400">PRs analyzed: </span>
                <span className="text-ink-700">
                  {data.total_prs_analyzed.toLocaleString()}
                </span>
              </span>
              <span>
                <span className="text-ink-400">pool: </span>
                <span className="text-ink-700">{data.pool_size}</span>
              </span>
              <span>
                <span className="text-ink-400">generated: </span>
                <span className="text-ink-700">
                  {formatGeneratedAt(data.generated_at)}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
