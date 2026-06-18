import { RawMetrics, Top5Entry } from "@/app/types";
import { formatHours } from "@/app/lib/format";

export interface StatDef {
  key: string;
  label: string;
  helper: string;
  getter: (m: RawMetrics) => number;
  format: (v: number) => string;
  higherIsBetter: boolean;
}

const STAT_DEFS: StatDef[] = [
  {
    key: "feat_count",
    label: "Features shipped",
    helper: "PRs with 'feat:' prefix",
    getter: (m) => m.feat_count,
    format: (v) => v.toLocaleString(),
    higherIsBetter: true,
  },
  {
    key: "fix_count",
    label: "Bugfixes shipped",
    helper: "PRs with 'fix:' prefix",
    getter: (m) => m.fix_count,
    format: (v) => v.toLocaleString(),
    higherIsBetter: true,
  },
  {
    key: "prs_total",
    label: "PRs merged",
    helper: "All merged PRs in window",
    getter: (m) => m.prs_total,
    format: (v) => v.toLocaleString(),
    higherIsBetter: true,
  },
  {
    key: "weighted_shipped_score",
    label: "Weighted ship score",
    helper: "PRs × CC type weight (feat=1.0)",
    getter: (m) => m.weighted_shipped_score,
    format: (v) => v.toFixed(1),
    higherIsBetter: true,
  },
  {
    key: "distinct_scopes_count",
    label: "Code areas touched",
    helper: "Distinct CC scopes in PR titles",
    getter: (m) => m.distinct_scopes_count,
    format: (v) => v.toLocaleString(),
    higherIsBetter: true,
  },
  {
    key: "active_weeks_count",
    label: "Active weeks",
    helper: "ISO weeks with ≥1 merged PR",
    getter: (m) => m.active_weeks_count,
    format: (v) => v.toLocaleString(),
    higherIsBetter: true,
  },
  {
    key: "substantive_reviews_given",
    label: "Substantive reviews",
    helper: ">100 char body or ≥2 inline comments",
    getter: (m) => m.substantive_reviews_given,
    format: (v) => v.toLocaleString(),
    higherIsBetter: true,
  },
  {
    key: "reviews_given",
    label: "Reviews given",
    helper: "All reviews submitted in window",
    getter: (m) => m.reviews_given,
    format: (v) => v.toLocaleString(),
    higherIsBetter: true,
  },
  {
    key: "unique_authors_reviewed",
    label: "Authors reviewed",
    helper: "Distinct devs whose PRs they reviewed",
    getter: (m) => m.unique_authors_reviewed,
    format: (v) => v.toLocaleString(),
    higherIsBetter: true,
  },
  {
    key: "median_time_to_merge_hours",
    label: "Median time to merge",
    helper: "Own PRs, open → merged",
    getter: (m) => m.median_time_to_merge_hours,
    format: (v) => formatHours(v),
    higherIsBetter: false,
  },
];

export interface DistinguishingStat extends StatDef {
  rawValue: number;
  displayValue: string;
}

export function pickDistinguishingStats(
  engineer: Top5Entry,
  pool: Top5Entry[]
): DistinguishingStat[] {
  // Pre-compute min/max per stat across pool
  const ranges = new Map<string, { min: number; max: number }>();
  for (const def of STAT_DEFS) {
    const vals = pool.map((p) => def.getter(p.raw_metrics));
    ranges.set(def.key, { min: Math.min(...vals), max: Math.max(...vals) });
  }

  type Scored = { def: StatDef; raw: number; strength: number };
  const scored: Scored[] = STAT_DEFS.map((def) => {
    const raw = def.getter(engineer.raw_metrics);
    const { min, max } = ranges.get(def.key)!;
    let strength: number;
    if (max === min) {
      strength = -Infinity; // degenerate stat — never pick
    } else if (def.higherIsBetter) {
      strength = (raw - min) / (max - min);
    } else {
      strength = (max - raw) / (max - min);
    }
    // Hide higher-is-better stats where the engineer has 0 — uninformative
    if (def.higherIsBetter && raw === 0) strength = -Infinity;
    return { def, raw, strength };
  });

  // Sort by strength (most distinguishing first), then by raw value desc as tiebreaker
  scored.sort((a, b) => {
    if (b.strength !== a.strength) return b.strength - a.strength;
    return b.raw - a.raw;
  });

  // Take top 4 with finite strength; pad with usable fallbacks if needed
  const usable = scored.filter((s) => s.strength !== -Infinity);
  let chosen = usable.slice(0, 4);

  if (chosen.length < 4) {
    // Fall back to stats that at least have a non-zero value for this engineer
    const fallbacks = scored.filter(
      (s) => !chosen.includes(s) && s.raw > 0
    );
    chosen = [...chosen, ...fallbacks].slice(0, 4);
  }
  if (chosen.length < 4) {
    // Last resort: pad with median_time_to_merge / prs_total even if degenerate
    const padded = scored.filter((s) => !chosen.includes(s));
    chosen = [...chosen, ...padded].slice(0, 4);
  }

  return chosen.map((s) => ({
    ...s.def,
    rawValue: s.raw,
    displayValue: s.def.format(s.raw),
  }));
}
