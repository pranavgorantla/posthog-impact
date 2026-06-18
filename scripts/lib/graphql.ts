export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

export async function githubGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string,
  opts: {
    maxRetries?: number;
    retryDelayMs?: number;
    label?: string;
  } = {}
): Promise<T> {
  const { maxRetries = 5, retryDelayMs = 30_000, label = "request" } = opts;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (res.ok) {
      const json = (await res.json()) as GQLResponse<T>;
      if (json.errors?.length) {
        throw new Error(
          `GraphQL errors on ${label}: ${json.errors.map((e) => e.message).join("; ")}`
        );
      }
      if (!json.data) {
        throw new Error(`Empty data on ${label}: ${JSON.stringify(json)}`);
      }
      return json.data;
    }

    // Decide whether to retry
    const retryable =
      res.status === 401 ||
      res.status === 403 ||
      res.status === 429 ||
      res.status >= 500;

    if (!retryable) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status} (non-retryable) on ${label}: ${body}`);
    }

    if (attempt === maxRetries) {
      const body = await res.text();
      throw new Error(
        `HTTP ${res.status} on ${label} — failed after ${maxRetries} retries: ${body}`
      );
    }

    // Honor Retry-After if present
    const retryAfterHeader = res.headers.get("Retry-After");
    const delayMs = retryAfterHeader
      ? parseInt(retryAfterHeader, 10) * 1000
      : retryDelayMs;

    console.log(
      `  [retry ${attempt}/${maxRetries}] HTTP ${res.status} on ${label}. ` +
        `Sleeping ${(delayMs / 1000).toFixed(0)}s then retrying…`
    );
    await sleep(delayMs);
  }

  // unreachable
  throw new Error("Retry loop exhausted");
}
