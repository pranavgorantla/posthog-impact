import { toScoreOutOf100 } from "@/app/lib/format";

interface PillarBarProps {
  label: string;
  value: number; // 0..1
  colorVar: string; // CSS color
  tone: "shipped" | "leverage" | "reach";
}

export function PillarBar({ label, value, colorVar, tone }: PillarBarProps) {
  const pct = toScoreOutOf100(value);
  const widthPct = Math.max(2, Math.min(100, pct));
  return (
    <div className="group/bar flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-[0.08em] text-ink-500">
          {label}
        </span>
        <span className="tabular font-mono text-[12px] font-medium text-ink-700">
          {pct}
        </span>
      </div>
      <div className="relative h-[6px] w-full overflow-hidden rounded-[2px] bg-ink-100/80">
        <div
          className="absolute inset-y-0 left-0 rounded-[2px] transition-[width] duration-500 ease-out"
          style={{
            width: `${widthPct}%`,
            backgroundColor: colorVar,
          }}
          data-tone={tone}
        />
      </div>
    </div>
  );
}
