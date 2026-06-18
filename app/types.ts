export type CCType =
  | "feat"
  | "fix"
  | "perf"
  | "refactor"
  | "revert"
  | "chore"
  | "docs"
  | "test"
  | "build"
  | "ci"
  | "style"
  | "other";

export interface Pillars {
  shipped: number;
  leverage: number;
  reach: number;
}

export interface RawMetrics {
  prs_total: number;
  prs_by_type: Record<CCType, number>;
  weighted_shipped_score: number;
  feat_count: number;
  fix_count: number;
  distinct_scopes: string[];
  distinct_scopes_count: number;
  active_weeks: string[];
  active_weeks_count: number;
  reviews_given: number;
  substantive_reviews_given: number;
  unique_authors_reviewed: number;
  median_time_to_merge_hours: number;
}

export interface Top5Entry {
  login: string;
  avatar_url: string;
  score: number;
  pillars: Pillars;
  raw_metrics: RawMetrics;
  narrative: string;
}

export interface Top30Entry {
  login: string;
  score: number;
  pillars: Pillars;
}

export interface Methodology {
  weights: Record<CCType, number>;
  conventional_commit_types: string[];
  bot_patterns: string[];
  score_formula: string;
  pool_filter: string;
}

export interface DashboardData {
  generated_at: string;
  window: { start: string; end: string };
  pool_size: number;
  total_prs_analyzed: number;
  bot_filter_excluded: number;
  methodology: Methodology;
  top_5: Top5Entry[];
  top_30_for_chart: Top30Entry[];
}
