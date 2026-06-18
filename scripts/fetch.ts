import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

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
// Date window
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

const now = new Date();
const end = isoDate(now);
const startDate = new Date(now);
startDate.setDate(startDate.getDate() - 90);
const start = isoDate(startDate);

console.log(`Date window: ${start} → ${end}`);

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

interface ReviewComment {
  totalCount: number;
}

interface Review {
  author: { login: string } | null;
  state: string;
  bodyText: string;
  comments: ReviewComment;
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

interface SearchResult {
  issueCount: number;
  pageInfo: PageInfo;
  nodes: PullRequest[];
}

interface RateLimit {
  remaining: number;
  cost: number;
  resetAt: string;
}

interface GraphQLResponse {
  data?: {
    rateLimit: RateLimit;
    search: SearchResult;
  };
  errors?: { message: string }[];
}

interface RawOutput {
  fetchedAt: string;
  window: { start: string; end: string };
  totalCount: number;
  lastCursor: string | null;
  hasNextPage: boolean;
  prs: PullRequest[];
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

async function graphql(
  cursor: string | null
): Promise<{ rateLimit: RateLimit; search: SearchResult }> {
  const searchQuery = `repo:PostHog/posthog is:pr is:merged merged:>=${start}`;

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { cursor, q: searchQuery },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  const json = (await res.json()) as GraphQLResponse;

  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`);
  }

  if (!json.data) {
    throw new Error(`Unexpected response: ${JSON.stringify(json)}`);
  }

  return json.data;
}

// ---------------------------------------------------------------------------
// Sanity report helpers
// ---------------------------------------------------------------------------

const CONVENTIONAL_RE = /^(fix|feat|perf|refactor|chore|docs|build|ci|test|revert)(\(.+\))?:/;

function pct(num: number, denom: number): string {
  if (denom === 0) return "0.0%";
  return ((num / denom) * 100).toFixed(1) + "%";
}

function printSanityReport(
  prs: PullRequest[],
  totalCount: number,
  rateLimit: RateLimit
): void {
  console.log("\n" + "=".repeat(60));
  console.log("SANITY REPORT");
  console.log("=".repeat(60));

  console.log(`\nWindow:          ${start} → ${end}`);
  console.log(`Total PRs found: ${totalCount}`);
  console.log(`Page 1 PRs:      ${prs.length}`);

  console.log(
    `\nRate limit:      ${rateLimit.remaining} / 5000 remaining`
  );
  console.log(`Query cost:      ${rateLimit.cost} point(s)`);
  console.log(`Resets at:       ${rateLimit.resetAt}`);

  // Linked issues
  const withLinked = prs.filter(
    (pr) => pr.closingIssuesReferences.nodes.length > 0
  ).length;
  console.log(
    `\nLinked issues:   ${withLinked}/${prs.length} (${pct(withLinked, prs.length)})`
  );

  // Labels
  const withLabels = prs.filter((pr) => pr.labels.nodes.length > 0).length;
  console.log(
    `With labels:     ${withLabels}/${prs.length} (${pct(withLabels, prs.length)})`
  );

  // Label frequency
  const labelCounts = new Map<string, number>();
  for (const pr of prs) {
    for (const lbl of pr.labels.nodes) {
      labelCounts.set(lbl.name, (labelCounts.get(lbl.name) ?? 0) + 1);
    }
  }
  const topLabels = [...labelCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (topLabels.length > 0) {
    console.log("\nTop 10 labels:");
    for (const [name, count] of topLabels) {
      console.log(`  ${String(count).padStart(3)}  ${name}`);
    }
  } else {
    console.log("\nNo labels found on page 1.");
  }

  // Conventional commits
  const withConventional = prs.filter((pr) =>
    CONVENTIONAL_RE.test(pr.title)
  ).length;
  console.log(
    `\nConventional commits: ${withConventional}/${prs.length} (${pct(withConventional, prs.length)})`
  );

  // Sample PR
  const sample =
    prs.find(
      (pr) =>
        pr.reviews.nodes.length > 0 &&
        pr.closingIssuesReferences.nodes.length > 0
    ) ??
    prs.find((pr) => pr.reviews.nodes.length > 0) ??
    prs[0];

  if (sample) {
    console.log("\n" + "-".repeat(60));
    console.log("SAMPLE PR:");
    console.log("-".repeat(60));
    console.log(JSON.stringify(sample, null, 2));
  }

  // Mode recommendation
  const linkedPct = prs.length > 0 ? withLinked / prs.length : 0;
  console.log("\n" + "=".repeat(60));
  console.log("RECOMMENDED MODE");
  console.log("=".repeat(60));

  if (linkedPct > 0.4) {
    console.log(
      `\n→ LINKED  (${pct(withLinked, prs.length)} of PRs have closing issue refs)\n` +
        `  Impact can be derived from linked issues. Use closing issue labels/titles\n` +
        `  as the primary signal for categorization.`
    );
  } else if (linkedPct >= 0.15) {
    console.log(
      `\n→ HYBRID  (${pct(withLinked, prs.length)} of PRs have closing issue refs)\n` +
        `  Reasonable linked-issue coverage but not dominant. Use linked issues where\n` +
        `  available; fall back to PR labels and title heuristics for the rest.`
    );
  } else {
    console.log(
      `\n→ LABEL   (${pct(withLinked, prs.length)} of PRs have closing issue refs)\n` +
        `  Linked-issue coverage too low to rely on. Use PR labels and conventional\n` +
        `  commit prefixes as the primary categorization signal.`
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("Fetching page 1 …");

  const { rateLimit, search } = await graphql(null);

  const prs = search.nodes.filter(
    (n): n is PullRequest => n !== null && "number" in n
  );

  const output: RawOutput = {
    fetchedAt: new Date().toISOString(),
    window: { start, end },
    totalCount: search.issueCount,
    lastCursor: search.pageInfo.endCursor,
    hasNextPage: search.pageInfo.hasNextPage,
    prs,
  };

  const dataDir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, "raw.json"),
    JSON.stringify(output, null, 2)
  );

  console.log(`Saved data/raw.json (${prs.length} PRs on page 1)`);

  printSanityReport(prs, search.issueCount, rateLimit);

  console.log("\n" + "=".repeat(60));
  console.log(
    "Sanity check complete. Inspect output above. Run\n`npm run fetch:continue` to fetch remaining pages."
  );
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
