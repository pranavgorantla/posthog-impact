# PostHog Engineering Impact Dashboard

A data-driven dashboard ranking PostHog's top engineering contributors over a 90-day window, scored across three pillars: **Shipped Outcomes**, **Leverage on Others**, and **Codebase Reach**.

**Live dashboard:** https://posthog-impact-psi.vercel.app  
**GitHub:** https://github.com/pranavgorantla/posthog-impact

---

## Methodology

Every merged PR in `PostHog/posthog` from the last 90 days is fetched via the GitHub GraphQL Search API using 7-day sub-windows to bypass the 1,000-result search cap. PRs are parsed for conventional commit types (`feat:`, `fix:`, `perf:`, etc.) and scopes. Bot accounts are filtered via an explicit allowlist and suffix patterns (`[bot]`, `-bot`, `-app`, etc.).

Contributors who merged ≥ 5 PRs **or** gave ≥ 10 reviews form the pool (121 engineers). Each contributor is scored across three min-max normalized pillars:

- **Shipped (40%):** weighted PR count + feat count + fix count
- **Leverage (35%):** substantive reviews given + unique authors reviewed
- **Reach (25%):** distinct conventional-commit scopes + active window-weeks

Final score: `0.40 × shipped + 0.35 × leverage + 0.25 × reach`, rescaled to 0–100.

---

## Key trade-offs

- **Quantity over quality for shipping:** The model counts merged PRs and conventional commit types, not lines of code changed or test coverage. A 3-line bug fix and a 2,000-line feature both count as one PR. Engineers who ship many small fixes rank higher on the Shipped pillar than those who ship one large architectural change.

- **Review depth is approximated:** "Substantive" reviews are proxied by word count (> 20 words) rather than by whether the review unblocked a blocker or caught a security bug. A thorough one-line `LGTM` counts as non-substantive; a verbose but low-value comment counts as substantive.

- **90-day recency window ignores long-horizon work:** Engineers on a multi-quarter project that hasn't shipped yet score 0. The model optimizes for high-frequency contribution patterns, not delivery of large features.

---

## Run locally

```bash
# 1. Clone and install
git clone https://github.com/pranavgorantla/posthog-impact.git
cd posthog-impact
npm install

# 2. Set your GitHub token (needs read:org, repo scopes)
echo "GITHUB_TOKEN=ghp_your_token_here" > .env.local

# 3. Fetch 90 days of PRs (~13 × 7-day windows, takes 5–10 min)
npm run fetch:windowed

# 4. Analyze and score
npm run analyze

# 5. Run the dashboard
npm run dev
# → open http://localhost:3000
```

### Available scripts

| Script | Description |
|---|---|
| `npm run fetch:windowed` | Fetch all merged PRs via date-windowed GraphQL pagination |
| `npm run analyze` | Parse PRs, score contributors, write `public/data.json` |
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
