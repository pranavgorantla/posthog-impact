"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Top5Entry } from "@/app/types";
import { toScoreOutOf100 } from "@/app/lib/format";

interface PillarChartProps {
  top5: Top5Entry[];
}

const PILLAR_COLORS = {
  shipped: "#5a6b85",
  leverage: "#6f72a8",
  reach: "#5d8b86",
} as const;

interface TooltipPayload {
  active?: boolean;
  payload?: Array<{
    dataKey: string;
    value: number;
    payload: { login: string; shipped: number; leverage: number; reach: number };
  }>;
  label?: string;
}

function ChartTooltip({ active, payload }: TooltipPayload) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-ink-200 bg-white/95 px-3 py-2.5 text-[11.5px] shadow-card-hover backdrop-blur">
      <div className="mb-1.5 font-mono text-[12px] font-medium text-ink-900">
        @{row.login}
      </div>
      <div className="flex flex-col gap-1">
        <Row label="Shipped outcomes" value={row.shipped} color={PILLAR_COLORS.shipped} />
        <Row label="Leverage on others" value={row.leverage} color={PILLAR_COLORS.leverage} />
        <Row label="Codebase reach" value={row.reach} color={PILLAR_COLORS.reach} />
      </div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="flex items-center gap-2 text-ink-600">
        <span
          className="block h-[8px] w-[8px] rounded-[1px]"
          style={{ backgroundColor: color }}
        />
        {label}
      </div>
      <span className="tabular font-mono text-ink-900">{value}</span>
    </div>
  );
}

export function PillarChart({ top5 }: PillarChartProps) {
  // Rank #1 appears at the top of the chart (data[0] is top in Recharts vertical layout).
  const data = top5.map((e) => ({
    login: e.login,
    shipped: toScoreOutOf100(e.pillars.shipped),
    leverage: toScoreOutOf100(e.pillars.leverage),
    reach: toScoreOutOf100(e.pillars.reach),
  }));

  return (
    <section className="rounded-md border border-ink-200 bg-white p-5 shadow-card">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-[14px] font-medium tracking-[-0.005em] text-ink-900">
          Where each engineer&rsquo;s score comes from
        </h2>
        <div className="flex items-center gap-4 text-[11px] text-ink-500">
          <Legend label="Shipped outcomes" color={PILLAR_COLORS.shipped} />
          <Legend label="Leverage on others" color={PILLAR_COLORS.leverage} />
          <Legend label="Codebase reach" color={PILLAR_COLORS.reach} />
        </div>
      </div>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
            barCategoryGap="22%"
            barGap={2}
          >
            <CartesianGrid horizontal={false} stroke="#eeeef1" />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "#83858f", fontFamily: "var(--font-jetbrains)" }}
              axisLine={false}
              tickLine={false}
              ticks={[0, 25, 50, 75, 100]}
            />
            <YAxis
              type="category"
              dataKey="login"
              tick={{ fontSize: 12, fill: "#43454e", fontFamily: "var(--font-jetbrains)" }}
              axisLine={false}
              tickLine={false}
              width={120}
            />
            <Tooltip
              cursor={{ fill: "rgba(15,16,20,0.03)" }}
              content={<ChartTooltip />}
            />
            <Bar
              dataKey="shipped"
              fill={PILLAR_COLORS.shipped}
              radius={[0, 2, 2, 0]}
              maxBarSize={11}
            />
            <Bar
              dataKey="leverage"
              fill={PILLAR_COLORS.leverage}
              radius={[0, 2, 2, 0]}
              maxBarSize={11}
            />
            <Bar
              dataKey="reach"
              fill={PILLAR_COLORS.reach}
              radius={[0, 2, 2, 0]}
              maxBarSize={11}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Legend({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="block h-[8px] w-[8px] rounded-[1px]"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </span>
  );
}
