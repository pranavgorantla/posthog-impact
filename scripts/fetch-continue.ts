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
// Types (shared with fetch.ts)
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

interface RateLimit {
  remaining: number;
  cost: number;
  resetAt: string;
}

interface GraphQLResponse {
  data?: {
    rateLimit: RateLimit;
    search: {
      issueCount: number;
      pageInfo: PageInfo;
      nodes: PullRequest[];
    };
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
// GraphQL
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
  cursor: string,
  searchQuery: string
): Promise<{
  rateLimit: RateLimit;
  search: { issueCount: number; pageInfo: PageInfo; nodes: PullRequest[] };
}> {
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
    throw new Error(
      `GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`
    );
  }

  if (!json.data) {
    throw new Error(`Unexpected response: ${JSON.stringify(json)}`);
  }

  return json.data;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const RAW_PATH = path.resolve(process.cwd(), "data", "raw.json");

async function main(): Promise<void> {
  if (!fs.existsSync(RAW_PATH)) {
    console.error(
      "Error: data/raw.json not found. Run `npm run fetch` first."
    );
    process.exit(1);
  }

  const stored = JSON.parse(fs.readFileSync(RAW_PATH, "utf8")) as RawOutput;

  if (!stored.hasNextPage) {
    console.log("All pages already fetched (hasNextPage is false). Nothing to do.");
    process.exit(0);
  }

  if (!stored.lastCursor) {
    console.error("Error: lastCursor is null but hasNextPage is true — data may be corrupt.");
    process.exit(1);
  }

  const { window: win } = stored;
  const searchQuery = `repo:PostHog/posthog is:pr is:merged merged:>=${win.start}`;

  console.log(`Resuming from cursor: ${stored.lastCursor}`);
  console.log(`Already have: ${stored.prs.length} PRs`);
  console.log(`Total expected: ${stored.totalCount}`);

  let cursor: string = stored.lastCursor;
  let hasNextPage = true;
  let pageNum = 1;
  const allPrs = [...stored.prs];

  while (hasNextPage) {
    console.log(`\nFetching page ${pageNum} (cursor: ${cursor}) …`);

    const { rateLimit, search } = await graphql(cursor, searchQuery);

    const newPrs = search.nodes.filter(
      (n): n is PullRequest => n !== null && "number" in n
    );
    allPrs.push(...newPrs);

    hasNextPage = search.pageInfo.hasNextPage;
    const nextCursor = search.pageInfo.endCursor;

    console.log(
      `  Got ${newPrs.length} PRs  |  total so far: ${allPrs.length}  |  ` +
        `rate limit: ${rateLimit.remaining}/5000 (cost: ${rateLimit.cost}, resets: ${rateLimit.resetAt})`
    );

    // Write after every page so progress is never lost
    const updated: RawOutput = {
      fetchedAt: new Date().toISOString(),
      window: win,
      totalCount: search.issueCount,
      lastCursor: nextCursor,
      hasNextPage,
      prs: allPrs,
    };
    fs.writeFileSync(RAW_PATH, JSON.stringify(updated, null, 2));

    if (rateLimit.remaining < 100) {
      console.error(
        `\nAborting: rate limit too low (${rateLimit.remaining} remaining). ` +
          `Resets at ${rateLimit.resetAt}. Re-run after reset.`
      );
      process.exit(1);
    }

    if (!hasNextPage || !nextCursor) break;
    cursor = nextCursor;
    pageNum++;
  }

  console.log(
    `\nDone. Fetched all ${allPrs.length} PRs (of ${stored.totalCount} total). data/raw.json updated.`
  );
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
