import fs from "node:fs";
import path from "node:path";
import { Header } from "@/components/Header";
import { EngineerCard } from "@/components/EngineerCard";
import { ScoreDistribution } from "@/components/ScoreDistribution";
import { Methodology } from "@/components/Methodology";
import { DashboardData } from "@/app/types";

export const dynamic = "force-dynamic";

function loadData(): DashboardData | null {
  const p = path.resolve(process.cwd(), "public", "data.json");
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as DashboardData;
    if (!parsed || !Array.isArray(parsed.top_5)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function EmptyState() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gridlines">
      <div className="max-w-md rounded-md border border-ink-200 bg-white p-8 text-center shadow-card">
        <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-ink-200 bg-ink-50 font-mono text-[14px] text-ink-500">
          !
        </div>
        <h1 className="mb-2 text-[16px] font-medium text-ink-900">
          No data yet
        </h1>
        <p className="mb-4 text-[13px] leading-[1.55] text-ink-600">
          <code className="rounded-[2px] bg-ink-100 px-1.5 py-0.5 font-mono text-[12px]">
            public/data.json
          </code>{" "}
          wasn&rsquo;t found or didn&rsquo;t parse.
        </p>
        <code className="block rounded-[3px] border border-ink-200 bg-ink-50/60 px-3 py-2 font-mono text-[12px] text-ink-800">
          npm run analyze
        </code>
      </div>
    </main>
  );
}

export default function Page() {
  const data = loadData();
  if (!data) return <EmptyState />;

  const cards = data.top_5.slice(0, 5);
  const undersized = cards.length < 5;

  return (
    <main className="min-h-screen bg-gridlines">
      <Header
        windowStart={data.window.start}
        windowEnd={data.window.end}
        totalPrs={data.total_prs_analyzed}
        poolSize={data.pool_size}
        generatedAt={data.generated_at}
      />

      <div className="mx-auto max-w-[1400px] px-8 py-6">
        {undersized && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-[12.5px] text-amber-900">
            Only{" "}
            <span className="font-mono">{cards.length}</span> contributor
            {cards.length === 1 ? "" : "s"} qualified for the top 5 in this run.
            Rendering what we have.
          </div>
        )}

        {/* Top 5 cards */}
        <section
          className="mb-6 grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${Math.max(cards.length, 1)}, minmax(0, 1fr))`,
          }}
        >
          {cards.map((entry, i) => (
            <EngineerCard
              key={entry.login}
              entry={entry}
              rank={i + 1}
              pool={cards}
            />
          ))}
        </section>

        {/* Score distribution */}
        <div className="mb-6">
          <ScoreDistribution data={data} />
        </div>

        {/* Methodology */}
        <Methodology data={data} />

        <footer className="mt-6 text-center font-mono text-[10.5px] text-ink-400">
          posthog-impact · scored against {data.pool_size} contributors with{" "}
          {data.methodology.pool_filter}
        </footer>
      </div>
    </main>
  );
}
