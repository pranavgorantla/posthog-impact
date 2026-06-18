import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

const envPath = path.resolve(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("Error: .env.local file not found");
  process.exit(1);
}
dotenv.config({ path: envPath });

const token = process.env.GITHUB_TOKEN;

if (!token || token === "PASTE_TOKEN_HERE") {
  console.error(
    "Error: GITHUB_TOKEN is missing or not set.\nOpen .env.local and replace PASTE_TOKEN_HERE with your GitHub personal access token."
  );
  process.exit(1);
}

const query = `{
  viewer { login }
  rateLimit { remaining limit resetAt }
}`;

async function main() {
  let res: Response;
  try {
    res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });
  } catch (err) {
    console.error("Error: Network request failed.", err);
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`Error: GitHub API returned HTTP ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const json = (await res.json()) as {
    data?: { viewer: { login: string }; rateLimit: { remaining: number; limit: number; resetAt: string } };
    errors?: { message: string }[];
  };

  if (json.errors?.length) {
    console.error("Error: GitHub API returned errors:");
    json.errors.forEach((e) => console.error(" -", e.message));
    process.exit(1);
  }

  if (!json.data) {
    console.error("Error: Unexpected response from GitHub API:", JSON.stringify(json));
    process.exit(1);
  }

  const { viewer, rateLimit } = json.data;
  console.log(`Authenticated as: ${viewer.login}`);
  console.log(`Rate limit: ${rateLimit.remaining} / ${rateLimit.limit} remaining (resets at ${rateLimit.resetAt})`);
}

main();
