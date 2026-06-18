import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { githubGraphQL, sleep } from "./lib/graphql.js";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const envPath = path.resolve(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("Error: .env.local not found");
  process.exit(1);
}
dotenv.config({ path: envPath });

const token = process.env.GITHUB_TOKEN;
if (!token || token === "PASTE_TOKEN_HERE") {
  console.error("Error: GITHUB_TOKEN is missing or not set in .env.local");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

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

// Build non-overlapping 7-day windows covering [start, end] inclusive.
function buildWindows(
  start: Date,
  end: Date,
  daysPerWindow: number
): Array<{ start: string; end: string }> {
  const windows: Array<{ start: string; end: string }> = [];
  const cur = new Date(start);
  cur.setUTCHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setUTCHours(0, 0, 0, 0);

  while (cur <= endDay) {
    const winStart = new Date(cur);
    const winEnd = new Date(cur);
    winEnd.setUTCDate(winEnd.getUTCDate() + daysPerWindow - 1);
    if (winEnd > endDay) winEnd.setTime(endDay.getTime());

    windows.push({ start: isoDate(winStart), end: isoDate(winEnd) });
    cur.setUTCDate(cur.getUTCDate() + daysPerWindow);
  }

  return windows;
}

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

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface RateLimit {
  remaining: number;
  cost: number;
  resetAt: string;
}

interface GQLData {
  rateLimit: RateLimit;
  search: {
    issueCount: number;
    pageInfo: PageInfo;
    nodes: PullRequest[];
  };
}

interface WindowedRawOutput {
  fetchedAt: string;
  window: { start: string; end: string };
  totalCount: number;
  lastCursor: null;
  hasNextPage: false;
  prs: PullRequest[];
  meta: {
    windowDays: number;
    windows: Array<{ start: string; end: string; prs: number; issueCount: number }>;
    rateLimitRemaining: number;
  };
}

// ---------------------------------------------------------------------------
// GraphQL query
// ---------------------------------------------------------------------------

const QUERY = `
  query($cursor: String, $q: String!) {
    rateLimit { remaining cost resetAt }
    search(query: $q, type: ISSUE, first: 50, after: $cursor) {
      issueCount
      pageInfo { hasNextPage endCursor }
      nodes {
        ... on PullRequest {
          number
          title
          bodyText
          url
          author { login }
          mergedAt
          createdAt
          additions
          deletions
          changedFiles
          labels(first: 20) { nodes { name } }
          files(first: 100) { nodes { path } }
          closingIssuesReferences(first: 20) {
            nodes { number labels(first: 20) { nodes { name } } }
          }
          reviews(first: 50) {
            nodes {
              author { login }
              state
              bodyText
              comments { totalCount }
            }
          }
        }
      }
    }
  }
`;

async function fetchPage(
  cursor: string | null,
  searchQuery: string,
  label: string
): Promise<GQLData> {
  return githubGraphQL<GQLData>(
    QUERY,
    { cursor, q: searchQuery },
    token!,
    { maxRetries: 5, retryDelayMs: 30_000, label }
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const RAW_PATH = path.resolve(process.cwd(), "data", "raw.json");
const PAGE_SLEEP_MS = 800;
const RATE_LIMIT_FLOOR = 200;
const WINDOW_DAYS = 7;

async function main(): Promise<void> {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - 90);

  const overallStart = isoDate(startDate);
  const overallEnd = isoDate(now);

  const windows = buildWindows(startDate, now, WINDOW_DAYS);

  console.log(`\nDate range:  ${overallStart} → ${overallEnd}`);
  console.log(`Windows:     ${windows.length} × ${WINDOW_DAYS}-day chunks`);
  console.log(`Throttle:    ${PAGE_SLEEP_MS}ms between pages`);
  console.log(`Rate floor:  abort if remaining < ${RATE_LIMIT_FLOOR}\n`);

  // Deduplicate by PR number across windows (shouldn't overlap, but just in case)
  const prMap = new Map<number, PullRequest>();
  const windowMeta: WindowedRawOutput["meta"]["windows"] = [];
  let lastRateLimit: RateLimit | null = null;
  let isFirstRequest = true;

  for (const [winIdx, win] of windows.entries()) {
    const winLabel = `window ${winIdx + 1}/${windows.length}`;
    const searchQuery = `repo:PostHog/posthog is:pr is:merged merged:${win.start}..${win.end}`;

    let cursor: string | null = null;
    let hasNextPage = true;
    let winPRsBefore = prMap.size;
    let pageNum = 0;
    let winIssueCount = 0;

    while (hasNextPage) {
      if (!isFirstRequest) await sleep(PAGE_SLEEP_MS);
      isFirstRequest = false;
      pageNum++;

      let data: GQLData;
      try {
        data = await fetchPage(cursor, searchQuery, `${winLabel} p${pageNum}`);
      } catch (err) {
        console.error(
          `\nFatal on ${winLabel} p${pageNum}: ${err instanceof Error ? err.message : String(err)}`
        );
        console.error(
          `Partial state: ${prMap.size} PRs collected. Aborting.`
        );
        process.exit(1);
      }

      const { rateLimit, search } = data;
      lastRateLimit = rateLimit;
      winIssueCount = search.issueCount;

      const newPrs = search.nodes.filter(
        (n): n is PullRequest =>
          n !== null && typeof n === "object" && "number" in n
      );

      let newCount = 0;
      for (const pr of newPrs) {
        if (!prMap.has(pr.number)) {
          prMap.set(pr.number, pr);
          newCount++;
        }
      }

      hasNextPage = search.pageInfo.hasNextPage;
      cursor = search.pageInfo.endCursor;

      process.stdout.write(
        `  [${winLabel}] p${pageNum}: +${newCount} PRs` +
          ` (total: ${prMap.size})` +
          ` · rl: ${rateLimit.remaining}/5000 cost:${rateLimit.cost}` +
          (hasNextPage ? "" : "  ✓") +
          "\n"
      );

      if (rateLimit.remaining < RATE_LIMIT_FLOOR) {
        console.error(
          `\nAborting: rate limit critically low (${rateLimit.remaining} remaining). ` +
            `Resets at ${rateLimit.resetAt}.`
        );
        process.exit(1);
      }
    }

    const winPRs = prMap.size - winPRsBefore;
    console.log(
      `Window ${String(winIdx + 1).padStart(2)}/${windows.length}: ` +
        `${win.start} → ${win.end} · ${winPRs} PRs · ` +
        `rl ${lastRateLimit?.remaining ?? "?"}`
    );

    windowMeta.push({
      start: win.start,
      end: win.end,
      prs: winPRs,
      issueCount: winIssueCount,
    });
  }

  // ── Build output ──────────────────────────────────────────────────────────
  const allPrs = [...prMap.values()].sort(
    (a, b) => new Date(b.mergedAt).getTime() - new Date(a.mergedAt).getTime()
  );

  const output: WindowedRawOutput = {
    fetchedAt: new Date().toISOString(),
    window: { start: overallStart, end: overallEnd },
    totalCount: allPrs.length,
    lastCursor: null,
    hasNextPage: false,
    prs: allPrs,
    meta: {
      windowDays: WINDOW_DAYS,
      windows: windowMeta,
      rateLimitRemaining: lastRateLimit?.remaining ?? 0,
    },
  };

  const dataDir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(RAW_PATH, JSON.stringify(output, null, 2));

  // ── Sanity report ─────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(64));
  console.log("SANITY REPORT");
  console.log("=".repeat(64));
  console.log(`Total PRs collected:  ${allPrs.length}`);
  console.log(`Windows fetched:      ${windows.length}`);
  console.log(
    `Rate limit remaining: ${lastRateLimit?.remaining ?? "?"}/5000 ` +
      `(resets: ${lastRateLimit?.resetAt ?? "?"})`
  );

  // Date distribution by ISO week
  const weekCounts = new Map<string, number>();
  for (const pr of allPrs) {
    const wk = isoWeek(pr.mergedAt);
    weekCounts.set(wk, (weekCounts.get(wk) ?? 0) + 1);
  }
  const maxWkCount = Math.max(...weekCounts.values());
  const barScale = Math.max(1, Math.ceil(maxWkCount / 40));

  console.log("\nPRs per ISO week (each █ ≈ " + barScale + " PRs):");
  [...weekCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([wk, cnt]) => {
      const bar = "█".repeat(Math.round(cnt / barScale));
      console.log(`  ${wk}  ${String(cnt).padStart(4)}  ${bar}`);
    });

  console.log("\nWindow breakdown:");
  windowMeta.forEach((w, i) => {
    console.log(
      `  ${String(i + 1).padStart(2)}. ${w.start} → ${w.end}  ` +
        `${String(w.prs).padStart(4)} PRs  (index: ${w.issueCount})`
    );
  });

  console.log("\n" + "=".repeat(64));
  console.log(
    "FETCH COMPLETE\n" +
      `Collected ${allPrs.length} PRs across ${windows.length} windows.\n` +
      "data/raw.json updated.\n\n" +
      "Run `npm run analyze` to score contributors on the full dataset."
  );
  console.log("=".repeat(64));
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
