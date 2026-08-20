# Irish Player Progression Tracker

An experimental React/TypeScript app for tracking and forecasting the
progression of Republic of Ireland-eligible footballers. It has two
independent tiers, each with its own methodology page and its own evidence,
and they are never blended:

1. **Statistical model** — an unfitted, transparent scoring model applied to
   a **demonstration dataset of fictional players**. Every number here is
   illustrative. See [`src/pages/Methodology.tsx`](src/pages/Methodology.tsx)
   (rendered at `/methodology`) for the exact formulas.
2. **Research snapshot** — a one-time, dated, sourced web-research pass
   covering 63 real ROI-eligible players, with per-claim evidence, source
   links, and a documented heuristic that produces a 5-way progression
   status and probabilities. See
   [`research/research-methodology.md`](research/research-methodology.md)
   and [`research/research-gaps.md`](research/research-gaps.md), also
   rendered in-app on the Methodology page.

The demonstration-data banner and the "research snapshot" labelling exist
specifically so these two tiers, and the fictional-vs-real distinction, are
never ambiguous to a reader.

## Pages

| Route | Page | Tier |
| --- | --- | --- |
| `/` | Outlook | Statistical model |
| `/players`, `/players/:id` | Player explorer / detail | Statistical model |
| `/depth` | Position depth | Statistical model |
| `/research` | Research dashboard (pool/position outlook) | Research snapshot |
| `/research/players`, `/research/players/:id` | Research player explorer / detail, evidence timelines | Research snapshot |
| `/methodology` | Both tiers' methodology, assumptions, and limitations | Both |

## Setup

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # type-checks then builds to dist/
npm run typecheck
npm run test
```

## Data

- **Statistical model data** comes from `src/data/adapters`. The active
  source is selected by the `VITE_DATA_SOURCE` env var (defaults to `demo`).
  The `demo` adapter (`src/data/adapters/demoAdapter.ts`) generates a
  synthetic dataset — no real players. Replacing it with a real feed means
  writing one new implementation of the `DataSource` interface
  (`src/data/adapters/types.ts`) and registering it in
  `src/data/adapters/index.ts`; nothing else in the app needs to change.
- **Research snapshot data** is static and bundled at build time from the
  repo-root `research/` folder (`irish-players-research.json`,
  `player-evidence.json`, `research-sources.json`, `research-gaps.json`),
  loaded and validated in `src/data/research/loadSnapshot.ts`. Refreshing it
  means re-running the research process described in
  `research/research-methodology.md` and re-running
  `scripts/merge-research.mjs`, not editing app code.

## Deploying to GitHub Pages

`vite.config.ts` already uses a relative `base: './'` so the build is
portable to any GitHub Pages project path, and the app uses `HashRouter` so
deep links work without server-side rewrite rules. Pushing to `main` runs
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds
and publishes `dist/` via GitHub Pages. Enable Pages once for the repo under
**Settings → Pages → Source → GitHub Actions**.

## Limitations

Both tiers are explicitly non-authoritative: the statistical model is an
unfitted illustrative scoring exercise over fictional players, and the
research snapshot is a dated, manually-sourced pass that goes stale as soon
as any underlying fact changes and makes no qualification claims of any
kind. See `/methodology` in the running app for the full detail.
