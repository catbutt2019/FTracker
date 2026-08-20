# Research methodology

This document describes how the research snapshot in this folder
(`irish-players-research.json`, `player-evidence.json`, `research-sources.json`,
`research-gaps.json`) was produced, and exactly how the progression
assessments and national-pool outlook shown in the application are computed
from it. It is a companion to the statistical model's own methodology page
in the app (`src/pages/Methodology.tsx`) — the two are separate tiers with
different evidence and should never be read as the same kind of claim.

## What this is, and is not

This is a **one-time, dated research snapshot**, not a live feed and not a
statistical model. It was assembled by web research against FAI, UEFA, club,
league and reputable press sources on **2026-08-20** (`researchDate` in
`irish-players-research.json`), and it will go stale the moment any of those
facts change. It is not re-derived from match data, has no percentile
scoring, and carries no accuracy claim — it is a structured, sourced,
cited read of what was publicly reported at the time of research.

It explicitly does **not** estimate the probability of Ireland qualifying
for any tournament. There is no fixture list, no opponent strength and no
qualification model anywhere in this snapshot or in the code that derives
from it (`src/model/researchAssessment.ts`, `src/model/researchOutlook.ts`).
"The pool at a position is strengthening" and "Ireland will qualify" are
different claims, and only the first is ever made here.

## Scope

- **63 players** across three tiers: capped seniors, U21 internationals, and
  emerging prospects not yet capped at either level.
- Eligibility basis is recorded per player (`eligibilityBasis`) and a
  four-way standing is derived (`eligibilityStanding`): capped-senior,
  capped-youth, committed-uncapped, or potentially-eligible-uncommitted. A
  player who has merely *not yet declared* for another association is kept
  in the weakest of these categories rather than being treated as a settled
  Ireland player.
- Research was split into four independently-researched groups (by broad
  positional/age remit) and merged by `scripts/merge-research.mjs`, which
  reconciles player and source IDs across the four files, deduplicates
  players who were independently discovered by more than one group (keeping
  the first), and deduplicates sources by URL.

## Sourcing rules

- Every fact in `irish-players-research.json` and every claim in
  `player-evidence.json` must trace to an entry in `research-sources.json`
  with a **direct article URL** — the runtime schema
  (`src/data/research/schema.ts`) rejects any source whose URL is a
  search-engine results page (Google, Bing, DuckDuckGo).
- Each source records a `kind` (governing body, official club/league site,
  major broadcaster, national/regional press, statistics provider, or
  reference work) and a `reliability` (high/medium/low), both of which feed
  the assessment heuristic below.
- **Nothing is invented.** Where a fact could not be verified, the field is
  set to `null` (for a single value) or the player carries an entry in
  `unverified: string[]` explaining what is missing and why — never a
  guessed number or a plausible-sounding placeholder. `clubVerifiedForSeason`
  records the season a club is actually confirmed for, which matters
  specifically because this snapshot was taken shortly after a transfer
  window closed.
- Where two sources disagreed on a detail (e.g. an appearance count), both
  readings are recorded in the evidence item's `notes` rather than silently
  picking one.

## The evidence model

Every sourced claim about a player is its own record in
`player-evidence.json`, not folded into the player record, so that:

- the **fact** (`claim`, e.g. "started seven of the last ten league
  matches") is kept separate from the **reading** of it (`interpretation`,
  e.g. "provides moderate evidence of positive progression");
- each claim carries its own source, `publishedDate`, `accessedDate`, and
  whether it is `primary` (the source itself, e.g. a club statement) or
  `secondary` (reporting on it);
- claims can point at other evidence items that corroborate or contradict
  them (`corroboratedBy` / `contradictedBy`), so disagreement between
  sources is visible rather than resolved by omission.

Each claim is assigned one of 18 fixed categories (`EvidenceCategory` in
`src/types/research.ts`), and each category has a **fixed direction** —
positive, negative, or neutral — set once in `EVIDENCE_DIRECTION`, not
per-item. This is deliberate: the direction of a category cannot be quietly
tuned per player to produce a nicer-looking assessment. Categories such as
`position-change`, `contract-development`, `transfer-development` and
`eligibility-confirmation` are neutral — they describe a change in a
player's situation without implying it is progress or regress.

## The progression heuristic

This is a documented, fixed arithmetic over evidence — not a fitted or
validated model — implemented in `src/model/researchAssessment.ts` and
covered by unit tests in `src/model/__tests__/researchAssessment.test.ts`.
Every step that contributes to a player's score is recorded as a row in
that player's `heuristicTrace`, and the rows sum to exactly the
`progressionScore` shown, so a reader can reconstruct the arithmetic by
hand from the interface.

**Per-item contribution.** Each non-neutral evidence item contributes:

```
contribution = sign × categoryWeight × sourceReliability × recency × primaryOrSecondary × contested
```

- `sign` is +1 for a positive-direction category, -1 for negative.
- `categoryWeight` (0-12) reflects how large a signal the category
  typically is — e.g. a first-team breakthrough (12) or a senior call-up
  (10) is weighted higher than an injury (6) or a return from injury (5).
  Neutral categories weight 0 and never move the score.
- `sourceReliability` is 1.0 / 0.75 / 0.5 for high/medium/low-reliability
  sources (0.5 if the source cannot be found at all).
- `recency` decays from 1.0 (≤3 months old) down to 0.25 (>24 months old),
  and an unknown publish date is treated as old (36 months), never as
  recent.
- `primaryOrSecondary` is 1.0 for a primary source, 0.8 for reporting on one.
- `contested` is 0.6 if another evidence item contradicts this one, 1.0
  otherwise — a contested claim is never discarded, only damped.

**Age curve.** A small, capped nudge (±2 points maximum) derived from the
same positional age curves as the statistical model
(`src/model/ageCurve.ts`), but only ever applied when the player already
has at least one piece of directional evidence. This is the direct
implementation of the brief's central safety rule: **age or youth alone
never creates a status.** A 19-year-old or a 34-year-old with zero sourced
evidence both resolve to `insufficient-evidence`, never to `stable`,
`improving` or `declining` — this is enforced by an explicit regression
test.

**Status.** The summed `progressionScore` is compared against a ±4-point
stable band: above it is `improving`, below it `declining`, inside it
`stable`. A non-senior player with breakthrough-shaped evidence (first-team
breakthrough, senior call-up, or U21 progression, and a non-negative score)
is labelled `emerging` instead. A player with **no relevant evidence at
all** — not a small amount, none — is `insufficient-evidence`, regardless of
age, position or club. Absence of news is never read as decline.

**Confidence** (0-1, reported as low/moderate/high at 0.4/0.7) is a
multiplicative combination of:

- a saturating count term (one item is thin; four or more is as good as
  this model gets);
- average source reliability and average recency of the relevant evidence;
- a source-diversity penalty when every item traces back to one source;
- a contradiction penalty when any item is contradicted;
- a penalty scaled to the number of the player's unverified fields;
- a penalty for a recent club change (current-club evidence still settling);
- a penalty for fewer than 450 minutes in the last completed season.

Each of these reasons is surfaced in plain language in the assessment's
`missingInformation`, not just folded into a single number.

**Probabilities.** The `progressionScore` and a confidence-derived standard
deviation (6 points at full confidence, widening to 15 at zero confidence)
are fed through the same normal-distribution machinery the statistical
model uses (`changeProbabilities` in `src/model/forecast.ts`), against the
same ±4-point stable band. The three probabilities are read off that
distribution and rounded by largest remainder so they always sum to exactly
100. A player with `insufficient-evidence` status is given a flat 34/33/33
split rather than a computed one, since there is nothing to compute from.

## The pool outlook

`src/model/researchOutlook.ts` aggregates the per-player assessments into a
position-by-position and pool-wide read (`PoolOutlookResearch`). Two things
worth stating plainly, because the interface must not blur them:

- **"Depth" here is a headcount-and-involvement measure, not an ability
  measure.** A position can look deep on paper (many players, most starting
  regularly for their clubs) while every player in it is mediocre — this
  snapshot has no percentile scoring to say otherwise.
- A position is flagged as **depending on ageing players**
  (`dependsOnAgeingPlayers`) only when its senior options average 30 or
  older *and* no emerging player has been researched behind them — both
  conditions, not either.

A pool-wide `direction` (strengthening / broadly-stable / weakening) is only
attempted once at least 5 players have a directional assessment; below that
the outlook reports `insufficient-evidence` rather than a number built on
too little. Where a direction is given, it comes from a confidence-weighted
net score of improving-vs-declining assessments against a fixed threshold,
and the `uncertainty` field states the exact fraction of players it is
based on so the reader can judge how much weight to put on it.

As stated above, and repeated here because it is the most important
limitation: **this module says nothing about qualification for any
tournament.**

## Known limitations

- This is a single research pass at a point in time, not a monitored feed.
  Any transfer, injury or squad announcement after 2026-08-20 is not
  reflected.
- Coverage across the four research groups was uneven under time
  constraints; see `research-gaps.md` for players who were named in a squad
  list but could not be researched to a standard fit for inclusion, and for
  players who were deliberately omitted rather than guessed at.
- The heuristic's category weights and confidence terms are hand-set, like
  the statistical model's priors — they have not been fitted or backtested
  against outcomes.
- Involvement (`starting`/`rotating`/`bench`/`out-of-squad`/`unknown`) is a
  qualitative read of the most recent reporting found, not a computed stat.
