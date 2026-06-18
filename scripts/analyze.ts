import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Label {
  name: string;
}

interface IssueRef {
  number: number;
  labels: { nodes: Label[] };
}

interface Review {
  author: { login: string } | null;
  state: string;
  bodyText: string;
  comments: { totalCount: number };
}

interface PRFile {
  path: string;
}

interface PullRequest {
  number: number;
  title: string;
  bodyText: string;
  url: string;
  author: { login: string } | null;
  mergedAt: string;
  createdAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  labels: { nodes: Label[] };
  files: { nodes: PRFile[] };
  closingIssuesReferences: { nodes: IssueRef[] };
  reviews: { nodes: Review[] };
}

interface RawData {
  fetchedAt: string;
  window: { start: string; end: string };
  totalCount: number;
  prs: PullRequest[];
}

// ---------------------------------------------------------------------------
// Bot filter
// ---------------------------------------------------------------------------

const BOT_EXPLICIT = new Set([
  "dependabot",
  "renovate",
  "github-actions",
  "posthog-bot",
  "mendral-app",
  "stamphog",
  "inkeep",
  "snyk-bot",
  "codecov",
  "sentry-io",
  "posthog-contributions-bot",
  // additional bots observed in page-1 data
  "chatgpt-codex-connector",
  "copilot-pull-request-reviewer",
  "greptile-apps",
  "veria-ai",
]);

function isBot(login: string | null | undefined): boolean {
  if (!login) return true;
  const l = login.toLowerCase();
  return (
    BOT_EXPLICIT.has(l) ||
    l.endsWith("[bot]") ||
    l.endsWith("-bot") ||
    l.endsWith("-app") ||
    l.endsWith("-apps") ||
    l.endsWith("-actions") ||
    l.endsWith("-ai")
  );
}

// ---------------------------------------------------------------------------
// Conventional commit parsing
// ---------------------------------------------------------------------------

const CC_RE =
  /^(feat|fix|perf|refactor|revert|chore|docs|test|build|ci|style)(?:\(([^)]+)\))?(!):\s*(.+)/;

type CCType =
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

interface ParsedCC {
  type: CCType;
  scope: string | null;
  breaking: boolean;
  subject: string;
}

function parseCC(title: string): ParsedCC {
  const m = CC_RE.exec(title);
  if (!m) return { type: "other", scope: null, breaking: false, subject: title };
  return {
    type: m[1] as CCType,
    scope: m[2] ?? null,
    breaking: m[3] === "!",
    subject: m[4],
  };
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

const WEIGHTS: Record<CCType, number> = {
  feat: 1.0,
  fix: 1.0,
  perf: 1.0,
  refactor: 0.6,
  revert: 0.6,
  chore: 0.2,
  docs: 0.2,
  test: 0.2,
  build: 0.2,
  ci: 0.2,
  style: 0.2,
  other: 0.3,
};

// ---------------------------------------------------------------------------
// ISO week
// ---------------------------------------------------------------------------

function isoWeek(dateStr: string): string {
  const d = new Date(dateStr);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const week1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const weekNum =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getUTCDay() + 6) % 7)) /
        7
    );
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Median
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

interface AuthorStats {
  login: string;
  prs_total: number;
  prs_by_type: Record<CCType, number>;
  weighted_shipped_score: number;
  feat_count: number;
  fix_count: number;
  distinct_scopes: Set<string>;
  active_weeks: Set<string>;
  merge_times_hours: number[];
  reviews_given: number;
  substantive_reviews_given: number;
  unique_authors_reviewed: Set<string>;
}

function emptyStats(login: string): AuthorStats {
  return {
    login,
    prs_total: 0,
    prs_by_type: {
      feat: 0, fix: 0, perf: 0, refactor: 0, revert: 0,
      chore: 0, docs: 0, test: 0, build: 0, ci: 0, style: 0, other: 0,
    },
    weighted_shipped_score: 0,
    feat_count: 0,
    fix_count: 0,
    distinct_scopes: new Set(),
    active_weeks: new Set(),
    merge_times_hours: [],
    reviews_given: 0,
    substantive_reviews_given: 0,
    unique_authors_reviewed: new Set(),
  };
}

// ---------------------------------------------------------------------------
// Min-max normalizer
// ---------------------------------------------------------------------------

function minMaxNorm(values: number[]): (v: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return () => 0;
  return (v) => (v - min) / (max - min);
}

// ---------------------------------------------------------------------------
// Narrative generation
// ---------------------------------------------------------------------------

function generateNarrative(
  stats: AuthorStats,
  norms: {
    shipped: number;
    leverage: number;
    reach: number;
    feat: number;
    fix: number;
    substantive: number;
    unique_reviewed: number;
    scopes: number;
    weeks: number;
  }
): string {
  const scopeCount = stats.distinct_scopes.size;
  const weekCount = stats.active_weeks.size;
  const reviewedCount = stats.unique_authors_reviewed.size;
  const substReviews = stats.substantive_reviews_given;

  // High leverage but moderate shipping
  if (norms.leverage > 0.7 && norms.shipped < 0.5) {
    return `Heavy reviewer — substantive feedback on ${substReviews} PRs from ${reviewedCount} different authors, with moderate own shipping.`;
  }
  // Prolific shipper, light reviewer
  if (norms.shipped > 0.7 && norms.leverage < 0.3) {
    return `Prolific shipper (${stats.prs_total} PRs, ${stats.feat_count} features, ${stats.fix_count} fixes) with light review activity.`;
  }
  // Feature builder with high reach
  if (norms.feat > 0.6 && norms.reach > 0.6) {
    return `Feature builder across ${scopeCount} area${scopeCount !== 1 ? "s" : ""} of the codebase, active across ${weekCount} weeks.`;
  }
  // Fix + feat balance
  if (norms.feat > 0.4 && norms.fix > 0.4) {
    return `Ships both fixes and features steadily — ${stats.feat_count} features and ${stats.fix_count} fixes across ${weekCount} active weeks.`;
  }
  // High everything
  if (norms.shipped > 0.6 && norms.leverage > 0.5 && norms.reach > 0.5) {
    return `Across-the-board contributor: ${stats.prs_total} PRs shipped, ${substReviews} substantive reviews, active in ${scopeCount} scopes.`;
  }
  // High reach, moderate ship
  if (norms.reach > 0.7) {
    return `Wide-reaching contributor — touches ${scopeCount} distinct area${scopeCount !== 1 ? "s" : ""} over ${weekCount} active weeks.`;
  }
  // Default: describe by primary type
  const topType = (Object.entries(stats.prs_by_type) as [CCType, number][])
    .sort((a, b) => b[1] - a[1])[0];
  return `Steady contributor — ${stats.prs_total} PRs merged, primarily \`${topType[0]}:\` commits across ${weekCount} active weeks.`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const RAW_PATH = path.resolve(process.cwd(), "data", "raw.json");
const OUT_PATH = path.resolve(process.cwd(), "public", "data.json");

function main(): void {
  if (!fs.existsSync(RAW_PATH)) {
    console.error("Error: data/raw.json not found. Run `npm run fetch` first.");
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(RAW_PATH, "utf8")) as RawData;
  const allPrs = raw.prs;

  console.log(`\nLoaded ${allPrs.length} PRs from data/raw.json`);
  console.log(`Window: ${raw.window.start} → ${raw.window.end}`);
  console.log(`Total in search index: ${raw.totalCount}`);

  // ── Pass 1: author aggregation ──────────────────────────────────────────
  const statsMap = new Map<string, AuthorStats>();

  function getStats(login: string): AuthorStats {
    if (!statsMap.has(login)) statsMap.set(login, emptyStats(login));
    return statsMap.get(login)!;
  }

  let botAuthoredCount = 0;

  for (const pr of allPrs) {
    const authorLogin = pr.author?.login ?? null;
    if (isBot(authorLogin)) {
      botAuthoredCount++;
      continue;
    }
    const login = authorLogin!;
    const cc = parseCC(pr.title);
    const s = getStats(login);

    s.prs_total++;
    s.prs_by_type[cc.type]++;
    s.weighted_shipped_score += WEIGHTS[cc.type];
    if (cc.type === "feat") s.feat_count++;
    if (cc.type === "fix") s.fix_count++;
    if (cc.scope) s.distinct_scopes.add(cc.scope);
    s.active_weeks.add(isoWeek(pr.mergedAt));

    const mergeHours =
      (new Date(pr.mergedAt).getTime() - new Date(pr.createdAt).getTime()) /
      3600000;
    s.merge_times_hours.push(mergeHours);
  }

  // ── Pass 2: review aggregation ─────────────────────────────────────────
  for (const pr of allPrs) {
    const prAuthorLogin = pr.author?.login ?? null;
    if (isBot(prAuthorLogin)) continue; // skip PRs by bots
    const prAuthor = prAuthorLogin!;

    for (const review of pr.reviews.nodes) {
      const reviewerLogin = review.author?.login ?? null;
      if (isBot(reviewerLogin)) continue;
      if (reviewerLogin === prAuthor) continue; // no self-review credit

      const rs = getStats(reviewerLogin!);
      rs.reviews_given++;
      if (review.bodyText.length > 100 || review.comments.totalCount >= 2) {
        rs.substantive_reviews_given++;
      }
      rs.unique_authors_reviewed.add(prAuthor);
    }
  }

  const totalAuthors = statsMap.size;
  console.log(`\nUnique non-bot authors/reviewers found: ${totalAuthors}`);
  console.log(`Bot-authored PRs excluded: ${botAuthoredCount}`);

  // Always print all unique logins so bot filter can be eyeballed
  console.log("\n── All unique logins in dataset (pre-pool-filter) ──");
  [...statsMap.values()]
    .sort((a, b) => b.prs_total - a.prs_total)
    .forEach((s) =>
      console.log(
        `  ${s.login.padEnd(32)} prs=${s.prs_total}  reviews=${s.reviews_given}`
      )
    );

  // ── Pool filter ─────────────────────────────────────────────────────────
  const pool = [...statsMap.values()].filter(
    (s) => s.prs_total >= 5 || s.reviews_given >= 10
  );
  console.log(`\nPool (prs≥5 OR reviews≥10): ${pool.length} contributors`);
  if (pool.length === 0) {
    console.log(
      "  (Pool empty — not enough data on this page. Run `npm run fetch:continue` to get the full dataset.)"
    );
  }

  // ── Normalization helpers ───────────────────────────────────────────────
  function makeNorm(getter: (s: AuthorStats) => number) {
    const vals = pool.map(getter);
    return minMaxNorm(vals);
  }

  const normShipped = makeNorm((s) => s.weighted_shipped_score);
  const normFeat = makeNorm((s) => s.feat_count);
  const normFix = makeNorm((s) => s.fix_count);
  const normSubstReviews = makeNorm((s) => s.substantive_reviews_given);
  const normUniqueReviewed = makeNorm((s) => s.unique_authors_reviewed.size);
  const normScopes = makeNorm((s) => s.distinct_scopes.size);
  const normWeeks = makeNorm((s) => s.active_weeks.size);

  function computeScore(s: AuthorStats): {
    score: number;
    pillars: { shipped: number; leverage: number; reach: number };
    norms: {
      shipped: number; leverage: number; reach: number;
      feat: number; fix: number; substantive: number;
      unique_reviewed: number; scopes: number; weeks: number;
    };
  } {
    const shipped =
      (normShipped(s.weighted_shipped_score) +
        normFeat(s.feat_count) +
        normFix(s.fix_count)) /
      3;
    const leverage =
      (normSubstReviews(s.substantive_reviews_given) +
        normUniqueReviewed(s.unique_authors_reviewed.size)) /
      2;
    const reach =
      (normScopes(s.distinct_scopes.size) +
        normWeeks(s.active_weeks.size)) /
      2;

    const score = 0.4 * shipped + 0.35 * leverage + 0.25 * reach;
    return {
      score,
      pillars: { shipped, leverage, reach },
      norms: {
        shipped, leverage, reach,
        feat: normFeat(s.feat_count),
        fix: normFix(s.fix_count),
        substantive: normSubstReviews(s.substantive_reviews_given),
        unique_reviewed: normUniqueReviewed(s.unique_authors_reviewed.size),
        scopes: normScopes(s.distinct_scopes.size),
        weeks: normWeeks(s.active_weeks.size),
      },
    };
  }

  // ── Score and sort ──────────────────────────────────────────────────────
  const scored = pool
    .map((s) => {
      const { score, pillars, norms } = computeScore(s);
      return { stats: s, score, pillars, norms };
    })
    .sort((a, b) => b.score - a.score);

  const top30 = scored.slice(0, 30);
  const top5 = scored.slice(0, 5);

  // ── Stdout: top-30 logins ───────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("TOP 30 LOGINS (eyeball bot check)");
  console.log("=".repeat(60));
  top30.forEach((e, i) => {
    const s = e.stats;
    console.log(
      `${String(i + 1).padStart(2)}. ${e.stats.login.padEnd(30)} ` +
        `score=${e.score.toFixed(3)}  prs=${s.prs_total}  ` +
        `feat=${s.feat_count}  fix=${s.fix_count}  ` +
        `reviews=${s.reviews_given}  substReviews=${s.substantive_reviews_given}`
    );
  });

  // ── Stdout: top-5 full breakdown ────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("TOP 5 FULL BREAKDOWN");
  console.log("=".repeat(60));

  for (const { stats: s, score, pillars } of top5) {
    console.log(`\n── ${s.login} (score: ${score.toFixed(3)}) ──`);
    console.log(
      `   Pillars: shipped=${pillars.shipped.toFixed(3)}  leverage=${pillars.leverage.toFixed(3)}  reach=${pillars.reach.toFixed(3)}`
    );
    console.log(`   PRs total: ${s.prs_total}`);
    console.log(`   By type:   ${JSON.stringify(s.prs_by_type)}`);
    console.log(`   Weighted shipped score: ${s.weighted_shipped_score.toFixed(2)}`);
    console.log(`   Distinct scopes (${s.distinct_scopes.size}): ${[...s.distinct_scopes].slice(0, 10).join(", ")}`);
    console.log(`   Active weeks (${s.active_weeks.size}): ${[...s.active_weeks].sort().join(", ")}`);
    console.log(`   Reviews given: ${s.reviews_given}  (substantive: ${s.substantive_reviews_given})`);
    console.log(`   Unique authors reviewed: ${s.unique_authors_reviewed.size}`);
    console.log(`   Median time-to-merge: ${median(s.merge_times_hours).toFixed(1)}h`);
  }

  // ── Build public/data.json ─────────────────────────────────────────────
  const top5Output = top5.map(({ stats: s, score, pillars, norms }) => ({
    login: s.login,
    avatar_url: `https://github.com/${s.login}.png`,
    score: parseFloat(score.toFixed(4)),
    pillars: {
      shipped: parseFloat(pillars.shipped.toFixed(4)),
      leverage: parseFloat(pillars.leverage.toFixed(4)),
      reach: parseFloat(pillars.reach.toFixed(4)),
    },
    raw_metrics: {
      prs_total: s.prs_total,
      prs_by_type: s.prs_by_type,
      weighted_shipped_score: parseFloat(s.weighted_shipped_score.toFixed(2)),
      feat_count: s.feat_count,
      fix_count: s.fix_count,
      distinct_scopes: [...s.distinct_scopes],
      distinct_scopes_count: s.distinct_scopes.size,
      active_weeks: [...s.active_weeks].sort(),
      active_weeks_count: s.active_weeks.size,
      reviews_given: s.reviews_given,
      substantive_reviews_given: s.substantive_reviews_given,
      unique_authors_reviewed: s.unique_authors_reviewed.size,
      median_time_to_merge_hours: parseFloat(
        median(s.merge_times_hours).toFixed(1)
      ),
    },
    narrative: generateNarrative(s, norms),
  }));

  const top30Output = top30.map(({ stats: s, score, pillars }) => ({
    login: s.login,
    score: parseFloat(score.toFixed(4)),
    pillars: {
      shipped: parseFloat(pillars.shipped.toFixed(4)),
      leverage: parseFloat(pillars.leverage.toFixed(4)),
      reach: parseFloat(pillars.reach.toFixed(4)),
    },
  }));

  const output = {
    generated_at: new Date().toISOString(),
    window: raw.window,
    pool_size: pool.length,
    total_prs_analyzed: allPrs.length - botAuthoredCount,
    bot_filter_excluded: botAuthoredCount,
    methodology: {
      weights: WEIGHTS,
      conventional_commit_types: Object.keys(WEIGHTS),
      bot_patterns: [
        "endsWith [bot]",
        "endsWith -bot",
        "endsWith -app",
        "endsWith -apps",
        "endsWith -actions",
        "endsWith -ai",
        "explicit list",
      ],
      score_formula:
        "0.40 * shipped_norm + 0.35 * leverage_norm + 0.25 * reach_norm",
      pool_filter: "prs_total >= 5 OR reviews_given >= 10",
    },
    top_5: top5Output,
    top_30_for_chart: top30Output,
  };

  const publicDir = path.resolve(process.cwd(), "public");
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nWrote public/data.json (pool=${pool.length}, top30 written)`);
}

main();
