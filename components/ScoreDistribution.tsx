"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  Tooltip,
} from "recharts";
import type { DashboardData } from "@/app/types";
import { toScoreOutOf100 } from "@/app/lib/format";

const BIN_WIDTH = 10;
const NUM_BINS = 10;

interface BinData {
  label: string;
  count: number;
  top5Labels: string[];
  binIndex: number;
}

function buildBins(poolScores: number[], top5: { login: string; score: number }[]): BinData[] {
  const bins: BinData[] = Array.from({ length: NUM_BINS }, (_, i) => ({
    label: `${i * BIN_WIDTH}–${(i + 1) * BIN_WIDTH - 1}`,
    count: 0,
    top5Labels: [],
    binIndex: i,
  }));

  for (const s of poolScores) {
    const s100 = Math.round(s * 100);
    const i = Math.min(NUM_BINS - 1, Math.floor(s100 / BIN_WIDTH));
    bins[i].count++;
  }

  for (const e of top5) {
    const s100 = toScoreOutOf100(e.score);
    const i = Math.min(NUM_BINS - 1, Math.floor(s100 / BIN_WIDTH));
    bins[i].top5Labels.push(`${e.login} (${s100})`);
  }

  return bins;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: BinData }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const bin = payload[0].payload;
  return (
    <div className="rounded-md border border-ink-200 bg-white/95 px-3 py-2 text-[11.5px] shadow-card-hover backdrop-blur">
      <div className="mb-1 font-mono text-[11px] text-ink-400">{bin.label}</div>
      <div className="font-medium text-ink-900">
        {bin.count} contributor{bin.count !== 1 ? "s" : ""}
      </div>
      {bin.top5Labels.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {bin.top5Labels.map((l) => (
            <div key={l} className="font-mono text-[11px] text-accent">
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ScoreDistributionProps {
  data: DashboardData;
}

export function ScoreDistribution({ data }: ScoreDistributionProps) {
  if (!data.pool_scores?.length) return null;

  const top5ForBins = data.top_5.map((e) => ({ login: e.login, score: e.score }));
  const bins = buildBins(data.pool_scores, top5ForBins);
  const top5BinIndices = new Set(
    bins.filter((b) => b.top5Labels.length > 0).map((b) => b.binIndex)
  );

  const s2 = toScoreOutOf100(data.top_5[1]?.score ?? 0);
  const s3 = toScoreOutOf100(data.top_5[2]?.score ?? 0);
  const gap = s2 - s3;

  return (
    <section className="rounded-md border border-ink-200 bg-white p-5 shadow-card">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-[14px] font-medium tracking-[-0.005em] text-ink-900">
          Top 5 in context
        </h2>
        <span className="text-[11.5px] text-ink-500">
          {data.pool_size} active contributors · scores 0–100
        </span>
      </div>
      <p className="mb-4 text-[12px] text-ink-400">
        Where each rank falls among all {data.pool_size} contributors. Highlighted bins contain top-5 engineers.
      </p>

      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={bins}
            margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
            barCategoryGap="14%"
          >
            <CartesianGrid vertical={false} stroke="#eeeef1" />
            <XAxis
              dataKey="label"
              tick={{
                fontSize: 10.5,
                fill: "#83858f",
                fontFamily: "var(--font-jetbrains, monospace)",
              }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{
                fontSize: 10.5,
                fill: "#83858f",
                fontFamily: "var(--font-jetbrains, monospace)",
              }}
              axisLine={false}
              tickLine={false}
              width={24}
            />
            <Tooltip
              cursor={{ fill: "rgba(15,16,20,0.04)" }}
              content={<CustomTooltip />}
            />
            <Bar dataKey="count" radius={[2, 2, 0, 0]} maxBarSize={48}>
              {bins.map((b) => (
                <Cell
                  key={b.binIndex}
                  fill={top5BinIndices.has(b.binIndex) ? "#6f72a8" : "#d4d7e0"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top-5 score legend */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {data.top_5.map((e, i) => (
          <span key={e.login} className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="inline-block h-[7px] w-[7px] rounded-[1px] bg-accent/70" />
            <span className="text-ink-500">#{i + 1}</span>
            <span className="text-ink-800">{e.login}</span>
            <span className="text-ink-400">({toScoreOutOf100(e.score)})</span>
          </span>
        ))}
      </div>

      <p className="mt-2.5 font-mono text-[11px] text-ink-400">
        {gap}-point gap between #{2} ({s2}) and #{3} ({s3}) — top two are clear outliers
      </p>
    </section>
  );
}
