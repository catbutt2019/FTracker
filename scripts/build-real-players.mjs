#!/usr/bin/env node
/**
 * Builds `research/real-players.json` — a `PlayerRaw[]` array, in the exact
 * shape `src/types/domain.ts` defines — from two inputs:
 *
 *   1. research/irish-players-research.json   (identity, eligibility, caps,
 *      season club/league/appearances/goals/assists — the "who and where")
 *   2. research/player-metrics-batch-{1..4}.json (dateOfBirth backfill,
 *      season-stat backfill, and position-specific per-90 advanced metrics —
 *      the "how well", gathered separately because it needed FBref/
 *      Transfermarkt lookups the base research pass didn't do)
 *
 * This is a standalone build step rather than app code because the merge
 * involves judgement calls (league-string cleanup, dropping players with no
 * usable data) that belong in one auditable place, not scattered through a
 * runtime adapter. Run with `node scripts/build-real-players.mjs` whenever
 * the research/ or player-metrics-batch-*.json files change.
 *
 * Every numeric field either comes from a cited source in the batch files or
 * is one of two explicit, documented neutral defaults (club strength 55,
 * league strength 60) used when we have no real-world equivalent. Nothing is
 * invented at the player level: if a player has no dateOfBirth and no season
 * record anywhere, they are dropped rather than papered over, and the drop is
 * logged.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const RESEARCH_DIR = path.join(ROOT, 'research')

// Discovered rather than listed, so adding a research batch is a matter of
// dropping the file in `research/`. The previous hardcoded [1, 2, 3, 4] meant a
// new batch was silently ignored until someone remembered to extend the array —
// a failure that looks exactly like the research finding nothing.
//
// Sorted numerically, not lexically, so batch-10 lands after batch-9 rather
// than after batch-1. Order decides precedence in `mergeBatchEntries`: earlier
// files win a genuine conflict, so this needs to stay stable and obvious.
const BATCH_FILES = readdirSync(RESEARCH_DIR)
  .map((name) => name.match(/^player-metrics-batch-(\d+)\.json$/))
  .filter((match) => match !== null)
  .sort((a, b) => Number(a[1]) - Number(b[1]))
  .map((match) => path.join(RESEARCH_DIR, match[0]))
// Round 2 is a strict superset of round 1: identical in all 31 original
// player fields, plus a sourced `seniorStatus` block per player, plus 20
// backfilled dates of birth and corrected `caps`. Round 1 is kept on disk as
// the provenance record for the fields round 2 did not revisit, but is no
// longer read — pointing at both and merging would only invite the two to
// drift.
const BASE_FILE = path.join(RESEARCH_DIR, 'irish-players-research-round-2.json')
const OUT_FILE = path.join(RESEARCH_DIR, 'real-players.json')

/* ------------------------------------------------------------------ *
 * League strength + assumed season length
 * (kept in sync by hand with src/model/leagueTiers.ts, since this script
 * runs under plain Node and that file exports for the Vite/TS app only)
 * ------------------------------------------------------------------ */

const LEAGUE_STRENGTHS = [
  ['premier league', 93],
  ['la liga', 90],
  ['primera division', 90],
  ['bundesliga 2', 68],
  ['2. bundesliga', 68],
  ['bundesliga', 88],
  ['serie a', 86],
  ['serie b', 66],
  ['ligue 1', 82],
  ['ligue 2', 62],
  ['primeira liga', 74],
  ['championship', 75],
  ['eredivisie', 72],
  ['eerste divisie', 55],
  ['jupiler pro league', 68],
  ['belgian pro league', 68],
  ['scottish premiership', 61],
  ['league one', 57],
  ['league two', 47],
  ['league of ireland premier division', 45],
  ['premier division', 45],
  ['scottish championship', 44],
  ['national league', 38],
  ['league of ireland first division', 32],
  ['first division', 32],
  ['premier league 2', 30],
  ['u21 premier league', 30],
  ['u18 premier league', 22],
  ['professional development league', 24],
  ['efl trophy', 26],
  ['academy', 20],
  ['turkish', 65],
  ['eliteserien', 55],
  ['3 liga', 50],
  ['segunda', 70],
  ['belgian challenger', 35],
  ['mls', 68],
]
const NEUTRAL_LEAGUE_STRENGTH = 60
const NEUTRAL_CLUB_STRENGTH = 55

const SEASON_GAME_COUNTS = [
  ['championship', 46],
  ['league one', 46],
  ['league two', 46],
  ['national league', 46],
  ['league of ireland', 36],
  ['segunda', 42],
  ['eredivisie', 34],
  ['bundesliga', 34],
  ['serie a', 38],
  ['ligue 1', 34],
  ['la liga', 38],
  ['primera division', 38],
  ['premier league', 38],
  ['primeira liga', 34],
  ['scottish premiership', 38],
  ['eliteserien', 30],
  ['turkish', 38],
  ['mls', 34],
  ['belgian challenger', 30],
]
const DEFAULT_SEASON_GAMES = 38

function normalise(str) {
  return (str ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function leagueStrength(league) {
  if (!league) return null
  const key = normalise(league)
  const match = [...LEAGUE_STRENGTHS].sort((a, b) => b[0].length - a[0].length).find(([p]) => key.includes(p))
  return match ? match[1] : null
}

function assumedSeasonMinutes(league) {
  if (!league) return DEFAULT_SEASON_GAMES * 90
  const key = normalise(league)
  const match = [...SEASON_GAME_COUNTS].sort((a, b) => b[0].length - a[0].length).find(([p]) => key.includes(p))
  return (match ? match[1] : DEFAULT_SEASON_GAMES) * 90
}

/* ------------------------------------------------------------------ *
 * Eligibility mapping (research schema -> domain EligibilityStatus)
 * ------------------------------------------------------------------ */

function mapEligibility(standing, seniorCaps) {
  // A sourced cap count outranks the prose standing label. Round 1 records
  // Robbie Brady (71 senior caps) as `committed-uncapped`, which would map to
  // `declared-ireland` and present one of Ireland's most-capped players as
  // having never been capped. Holding an actual cap is the definition of
  // capped, so it settles the question regardless of the label.
  if ((seniorCaps ?? 0) > 0) return 'capped-ireland'

  switch (standing) {
    case 'capped-senior':
    case 'capped-youth':
      return 'capped-ireland'
    case 'committed-uncapped':
    // A player named to the senior squad has been selected and called up —
    // a stronger signal of commitment than merely "eligible", even though no
    // cap has been won yet. Treated the same as committed-uncapped.
    case 'senior-squad-uncapped':
      return 'declared-ireland'
    case 'potentially-eligible-uncommitted':
      return 'eligible-uncommitted'
    default:
      return 'eligible-uncommitted'
  }
}

/* ------------------------------------------------------------------ *
 * Metric-group mapping (kept in sync by hand with
 * src/types/domain.ts#POSITION_METRIC_GROUP, for the same reason as the
 * league-strength table above: this script runs under plain Node).
 * ------------------------------------------------------------------ */

const POSITION_METRIC_GROUP = {
  GK: 'goalkeeper',
  RB: 'defender',
  CB: 'defender',
  LB: 'defender',
  DM: 'midfielder',
  CM: 'midfielder',
  AM: 'creator',
  W: 'creator',
  ST: 'forward',
}

function round2(n) {
  return Math.round(n * 100) / 100
}

function numOrNull(v) {
  return typeof v === 'number' && !Number.isNaN(v) ? v : null
}

function firstDefined(...values) {
  for (const v of values) {
    if (v !== null && v !== undefined) return v
  }
  return null
}

/**
 * Add two per-90 rates only when both are known, and return `null` otherwise.
 *
 * The tempting version of this returns whichever addend exists. Don't: it puts
 * two different quantities into one distribution. A composite metric is ranked
 * against every other player's value for the same metric, so a player with only
 * one addend published is compared, on the same scale, against players whose
 * value is a sum of two. Missing data then reads as poor performance.
 *
 * This is not hypothetical. Jake O'Brien's 2025-26 interceptions and blocks
 * were summed to 0.43 (interceptions only, blocks unpublished) while Nathan
 * Collins's summed to 2.45 (1.15 + 1.30), which put O'Brien in the 4th
 * percentile of a metric he had not actually underperformed on and dropped a
 * 3,124-minute Premier League centre-back below squad members with no recorded
 * minutes at all.
 *
 * Returning `null` hands the season to the scoring model's missing-metric path,
 * which drops the metric and renormalises the remaining weights, rather than
 * inventing a comparison that the data cannot support.
 */
function sumIfBoth(a, b) {
  if (a != null && b != null) return round2(a + b)
  return null
}

/**
 * Combine two metrics-batch entries for the same player, field by field.
 *
 * This used to be `keeping the first` — a later batch mentioning a player
 * already seen was discarded whole. That looks harmless while each batch covers
 * a distinct set of players, which was true of batches 1-4, and it quietly
 * destroys a later research pass the moment one revisits a player. 63 of the 89
 * players in the research file already appear in batches 1-4, and 59 of those
 * carry at most one non-null metric, so a follow-up batch aimed at exactly that
 * gap would have been thrown away for two thirds of the squad.
 *
 * Filling a gap and contradicting a sourced figure are different events and are
 * treated differently:
 *
 *  - A field the earlier entry left null or absent is filled from the later one.
 *  - A field both entries supply, with different values, keeps the earlier value
 *    and warns. Later is not automatically better, and silently replacing a
 *    cited number is how a dataset stops being auditable. The warning is the
 *    prompt to go and reconcile the two sources by hand.
 *
 * Sources are unioned so provenance survives the merge.
 */
function mergeBatchEntries(existing, incoming, file) {
  const label = path.basename(file)
  const merged = { ...existing }

  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'metrics' || key === 'seasonStats' || key === 'sources') continue
    if (merged[key] === null || merged[key] === undefined) merged[key] = value
  }

  for (const group of ['metrics', 'seasonStats']) {
    const before = existing[group] ?? {}
    const after = incoming[group] ?? {}
    const out = { ...before }
    for (const [key, value] of Object.entries(after)) {
      if (value === null || value === undefined) continue
      const current = out[key]
      if (current === null || current === undefined) {
        out[key] = value
      } else if (current !== value) {
        console.warn(
          `Conflict for "${existing.id}" ${group}.${key}: keeping ${current}, ` +
            `${label} says ${value}. Reconcile by hand.`,
        )
      }
    }
    if (Object.keys(out).length > 0) merged[group] = out
  }

  const sources = [...new Set([...(existing.sources ?? []), ...(incoming.sources ?? [])])]
  if (sources.length > 0) merged.sources = sources

  const notes = [existing.notes, incoming.notes].filter(Boolean)
  if (notes.length > 0) merged.notes = notes.join(' | ')

  return merged
}

function prune(obj) {
  const out = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined) out[key] = value
  }
  return out
}

/**
 * A goal-involvement rate, always computable from box-score totals alone
 * (goals + assists per 90, or per appearance when minutes aren't known).
 * This exists specifically so that seasons with no advanced
 * positionSpecificMetrics at all — which is every historical season today —
 * still contribute one real, non-fabricated signal to scoreSeason() instead
 * of falling back to a flat neutral 50. It is intentionally excluded from the
 * goalkeeper metric group: a goalkeeper recording zero goals or assists says
 * nothing about their performance, whereas it is a real (if partial) signal
 * for every outfield position.
 */
function goalInvolvement90({ appearances, minutes, goals, assists }) {
  const total = (goals ?? 0) + (assists ?? 0)
  if (minutes && minutes > 0) return round2(total / (minutes / 90))
  if (appearances && appearances > 0) return round2(total / appearances)
  return null
}

/**
 * Translates the richer `latestPositionMetrics.metrics` block from the
 * research file (a different field-naming scheme, scoped to each player's
 * latest completed season only) into the app's own METRIC_DEFINITIONS key
 * names for that player's metric group. Only maps fields that are genuinely
 * the same measurement under a different name — e.g. groundDuelWinPercentage
 * is exactly "duelSuccess" — and deliberately leaves fields unmapped where
 * the closest available figure isn't actually the same thing (e.g. total
 * goals aren't "non-penalty goals", and a defensive final-third recovery
 * rate isn't "final-third involvement"). Unmapped keys are just missing
 * metrics, handled the same way scoreSeason() already handles any gap:
 * dropped and reweighted, never guessed at.
 */
function deriveLatestMetrics(player) {
  const latest = player.latestPositionMetrics
  if (!latest?.metrics) return null
  // Guard against attaching this season's advanced metrics to the wrong
  // season slot if the two research passes ever disagree on which season is
  // "latest completed".
  if (!player.lastCompletedSeason || player.lastCompletedSeason.season !== latest.season) return null

  const group = POSITION_METRIC_GROUP[player.primaryPosition]
  const m = latest.metrics
  let derived = {}

  if (group === 'goalkeeper') {
    derived = {
      savePercentage: numOrNull(m.savePercentage),
      goalsPrevented90: numOrNull(m.goalsPrevented),
      longPassAccuracy: numOrNull(m.longBallAccuracyPercentage),
    }
  } else if (group === 'defender') {
    derived = {
      duelSuccess: numOrNull(m.groundDuelWinPercentage),
      aerialSuccess: numOrNull(m.aerialDuelWinPercentage),
      // Interceptions only. Blocks used to be added in here, but they are
      // published for just 3 of the 26 defenders in the research file, so the
      // sum described 3 players on one scale and 8 on another. `interceptions90`
      // now means what its name says. Blocks are dropped rather than promoted to
      // their own metric: a 3-value distribution cannot produce a percentile
      // that means anything.
      interceptions90: numOrNull(m.interceptionsPer90),
      tackles90: numOrNull(m.tacklesPer90),
      clearances90: numOrNull(m.clearancesPer90),
    }
  } else if (group === 'midfielder') {
    derived = {
      passCompletion: numOrNull(m.passCompletionPercentage),
      // Prefer the provider's own combined figure; fall back to adding the parts
      // only when both parts exist. Half a composite is not a smaller composite,
      // it is an unknown one.
      defensiveActions90: firstDefined(
        numOrNull(m.tacklesPlusInterceptionsPer90),
        sumIfBoth(numOrNull(m.tacklesPer90), numOrNull(m.interceptionsPer90)),
      ),
    }
  } else if (group === 'creator') {
    derived = {
      expectedAssists90: numOrNull(m.expectedAssistsPer90),
      progressiveCarries90: numOrNull(m.progressiveCarriesPer90),
      chancesCreated90: numOrNull(m.keyPassesPer90),
    }
  } else if (group === 'forward') {
    derived = {
      expectedGoals90: firstDefined(numOrNull(m.nonPenaltyExpectedGoalsPer90), numOrNull(m.expectedGoalsPer90)),
      shots90: numOrNull(m.shotsPer90),
      chanceConversion: numOrNull(m.shotConversionPercentage),
    }
  }

  return prune(derived)
}

/**
 * Research-file `currentClubStatus.verificationStatus` values that represent
 * a genuine move away from the club/league in `lastCompletedSeason` — a
 * completed transfer, a new loan, a loan recall, or a confirmed departure.
 * Everything else (rumours, rejected bids, a re-confirmed incumbent club, or
 * an agreed-but-not-yet-effective future transfer) means the player has not
 * actually changed club yet, whatever the transfer gossip says.
 *
 * Kept as an allowlist rather than a denylist so an unrecognised status value
 * in a future research file falls back to comparing club names directly
 * (see `buildCurrentClub`) instead of silently assuming nothing changed.
 */
const CHANGED_CLUB_STATUSES = new Set([
  'completed-transfer-confirmed',
  'completed-loan-confirmed',
  'loan-ended-returned-to-parent',
  'loan-recalled-current-club-confirmed',
  'departure-confirmed-next-step-unconfirmed',
])

/**
 * Current club/league, kept independent of the season history so a transfer
 * shows up immediately without waiting for (or fabricating) a season's worth
 * of performance data at the new club. See `CurrentClub` in src/types/domain.ts.
 */
function buildCurrentClub(p) {
  const status = p.currentClubStatus ?? null
  const club = status?.club ?? p.club ?? p.lastCompletedSeason?.club ?? 'Unknown'
  const league = status?.league ?? p.league ?? p.lastCompletedSeason?.league ?? 'Unknown'
  const lastSeasonClub = p.lastCompletedSeason?.club ?? null

  const changedSinceLastSeason = status
    ? CHANGED_CLUB_STATUSES.has(status.verificationStatus)
    : normalise(club) !== normalise(lastSeasonClub ?? '')

  return {
    club,
    league,
    leagueStrength: leagueStrength(league) ?? NEUTRAL_LEAGUE_STRENGTH,
    changedSinceLastSeason,
    transferNote: status?.latestTransferUpdate ?? p.recentTransfer ?? null,
  }
}

/* ------------------------------------------------------------------ *
 * Load inputs
 * ------------------------------------------------------------------ */

const base = JSON.parse(readFileSync(BASE_FILE, 'utf-8'))
const metricsById = new Map()
for (const file of BATCH_FILES) {
  let entries = []
  try {
    entries = JSON.parse(readFileSync(file, 'utf-8'))
  } catch (err) {
    console.warn(`Could not read ${file}: ${err.message}`)
    continue
  }
  for (const entry of entries) {
    const existing = metricsById.get(entry.id)
    metricsById.set(entry.id, existing ? mergeBatchEntries(existing, entry, file) : entry)
  }
}

console.log(`Loaded ${base.players.length} base players, ${metricsById.size} metrics-batch entries.`)

/* ------------------------------------------------------------------ *
 * Build one SeasonRecord
 * ------------------------------------------------------------------ */

function buildSeasonRecord(record, batchStats, batchMetrics, includeGoalInvolvement) {
  if (!record) return null
  const league = record.league
  const appearances = record.appearances ?? batchStats?.appearances ?? null
  const starts = record.starts ?? batchStats?.starts ?? null
  const minutes = record.minutes ?? batchStats?.minutes ?? null
  const goals = record.goals ?? batchStats?.goals ?? null
  const assists = record.assists ?? batchStats?.assists ?? null

  if (appearances === null && minutes === null && goals === null && assists === null) {
    // Nothing usable in this slot at all (e.g. a "previousSeason" stub that's
    // just a club/league placeholder). Treat as absent rather than a season
    // of zeros, which would misleadingly read as "played and did nothing".
    return null
  }

  const denom = assumedSeasonMinutes(league)
  const minutesPercentage =
    minutes != null ? Math.min(1, Math.round((minutes / denom) * 1000) / 1000) : null

  // Every outfield season gets a goalInvolvement90 figure computed directly
  // from this season's own appearances/minutes/goals/assists — real,
  // never-fabricated box-score data — so that seasons with no advanced
  // positionSpecificMetrics (every historical season today) still give
  // scoreSeason() at least one real signal instead of falling back to a
  // flat neutral 50. Goalkeepers are excluded: zero goals/assists says
  // nothing about a goalkeeper's performance.
  const metrics = { ...(batchMetrics ?? {}) }
  if (includeGoalInvolvement) {
    const gi = goalInvolvement90({
      appearances: appearances ?? 0,
      minutes: minutes ?? 0,
      goals: goals ?? 0,
      assists: assists ?? 0,
    })
    if (gi !== null) metrics.goalInvolvement90 = gi
  }

  return {
    season: record.season ?? 'unknown',
    club: record.club ?? 'unknown',
    league: league ?? 'unknown',
    leagueStrength: leagueStrength(league) ?? NEUTRAL_LEAGUE_STRENGTH,
    clubStrength: NEUTRAL_CLUB_STRENGTH,
    appearances: appearances ?? 0,
    // `null`, not 0, when the source published appearances but no starts or
    // minutes. This is the overwhelmingly common case in the research file:
    // most seasons carry `"minutes": null` alongside a real appearance count.
    // Coercing that to 0 asserted a fact the research pass never found, and
    // made a 35-appearance Premier League season indistinguishable from a
    // player who never came off the bench — see SeasonRecord in
    // src/types/domain.ts, and `reliability()` in src/model/scoring.ts, whose
    // appearances fallback exists precisely to handle the honest `null`.
    starts,
    minutes,
    minutesPercentage,
    goals: goals ?? 0,
    assists: assists ?? 0,
    positionSpecificMetrics: metrics,
    injuryDays: null,
  }
}

/* ------------------------------------------------------------------ *
 * Avatar selection
 *
 * The research pass attaches one candidate image per player, each with a
 * verificationStatus. Only "verified-from-named-source" images are used —
 * the handful marked "manual-review-required" (mostly signing-day or
 * editorial photos where a human hasn't confirmed the face in the crop is
 * actually this player) fall back to the initials avatar instead of risking
 * showing the wrong person.
 *
 * Every image here is a hotlinked third-party photo with
 * rightsStatus "prototype-only-rights-not-cleared" (per
 * avatarMethodology in the research file) — fine for this prototype, but
 * not something to treat as production-cleared without a licensing pass.
 * ------------------------------------------------------------------ */

function selectAvatarUrl(avatar) {
  if (!avatar?.imageUrl) return null
  if (avatar.verificationStatus !== 'verified-from-named-source') return null
  return avatar.imageUrl
}

/* ------------------------------------------------------------------ *
 * Senior-team status
 *
 * Structured evidence for the senior/future-contender/emerging-prospect
 * classification in src/model/squadStatus.ts. Deliberately built from the
 * raw research object, before buildSeasonRecord()'s `?? 0` defaulting has
 * collapsed "not published" into "zero" — see that function's fields above.
 * Every field that has no genuine source stays `null` rather than 0, so the
 * model can lower confidence instead of silently treating "unknown" as
 * "none". `internationalInvolvement`/`injuryNote` are free-text prose and are
 * never parsed into these fields, by design.
 * ------------------------------------------------------------------ */

function buildSeniorStatus(p) {
  // Round 2 researched this block per-player, with a source URL per field and
  // an explicit `null` wherever no citable value was found. Where it has a
  // value, it wins outright: it is sourced, whereas everything below is
  // inferred from adjacent fields.
  const researched = p.seniorStatus ?? {}

  // Previously: `p.eligibilityStanding === 'capped-senior' ? (p.caps ?? null) : 0`.
  //
  // That `: 0` was the single largest source of wrong output in this model. It
  // turned "this pass found no cap count" into the positive assertion "has
  // never played for Ireland", which `hasSeniorAppearance` in
  // src/model/squadStatus.ts reads as `(seniorCaps ?? 0) > 0`. Seventeen
  // senior-level players were flattened to zero caps that way — Robbie Brady
  // (71 caps) and Jayson Molumby (36) among them — and three of those then
  // resurfaced as "potential future starters", the exact misclassification the
  // squad-status rewrite existed to remove.
  //
  // The standing label cannot be trusted to gate this either: round 1 records
  // Brady as `committed-uncapped`. A sourced cap count is stronger evidence
  // than a prose label, so the researched value is used directly and `null`
  // stays `null` — unknown, with confidence lowered downstream, rather than a
  // fabricated zero.
  const seniorCaps = numOrNull(researched.seniorCaps)

  const lastSeason = p.lastCompletedSeason ?? null
  const appearances = lastSeason?.appearances ?? null
  const minutes = lastSeason?.minutes ?? null
  // appearances > 0 with minutes === 0 is not a real football outcome — it
  // means the provider published appearances but never published minutes.
  // Treating that as "0 minutes" would silently invent a fact; null is honest.
  const clubMinutesLast12Months =
    minutes !== null && !(appearances && appearances > 0 && minutes === 0) ? minutes : null

  return {
    seniorCaps,
    // Researched in round 2 where a source published them, and still `null`
    // otherwise — never inferred from caps, involvement or free-text notes,
    // so squadStatus.ts and positionRisk.ts reduce confidence instead of
    // assuming zero. `seniorMinutes` (career) and `recentSquadCallups` came
    // back null for all 89: no provider publishes them per player.
    seniorStarts: numOrNull(researched.seniorStarts),
    competitiveSeniorStarts: numOrNull(researched.competitiveSeniorStarts),
    seniorMinutes: numOrNull(researched.seniorMinutes),
    seniorMinutesLast12Months: numOrNull(researched.seniorMinutesLast12Months),
    lastSeniorAppearanceDate: researched.lastSeniorAppearanceDate ?? null,
    lastSeniorStartDate: researched.lastSeniorStartDate ?? null,
    recentSquadCallups: numOrNull(researched.recentSquadCallups),
    // Round 2 returned `null` for this field for every player, so the round-1
    // derivation from last completed season minutes is kept rather than
    // discarding 16 real values for nothing.
    clubMinutesLast12Months: numOrNull(researched.clubMinutesLast12Months) ?? clubMinutesLast12Months,
    // Genuinely derived rather than researched — a property of the league, not
    // of the player — so no round-2 equivalent exists or is wanted.
    clubCompetitionLevel: leagueStrength(lastSeason?.league ?? p.league) ?? NEUTRAL_LEAGUE_STRENGTH,
    availabilityStatus: researched.availabilityStatus ?? null,
  }
}

/* ------------------------------------------------------------------ *
 * Build PlayerRaw[]
 * ------------------------------------------------------------------ */

const players = []
const dropped = []
let avatarsUsed = 0
let avatarsSkipped = 0

for (const p of base.players) {
  const batch = metricsById.get(p.id) ?? null
  const dateOfBirth = p.dateOfBirth ?? batch?.dateOfBirth ?? null

  // The most-recently-researched season slot is where the batch's advanced
  // metrics apply (the batches were briefed to research "the most recently
  // completed season", matching lastCompletedSeason), now topped up with the
  // richer latestPositionMetrics block from the main research file where its
  // season lines up. Older seasons carry real appearance/minutes/goals/
  // assists where the research pass found them, but never the position-
  // specific advanced metrics, which were only ever researched for the
  // latest season — scoring.ts reweights around the gap rather than
  // treating it as zero, and goalInvolvement90 below gives every outfield
  // season at least one real signal regardless.
  const includeGoalInvolvement = p.primaryPosition !== 'GK'
  const lastSeasonMetrics = { ...(batch?.metrics ?? {}), ...(deriveLatestMetrics(p) ?? {}) }
  const lastSeason = buildSeasonRecord(
    p.lastCompletedSeason,
    batch?.seasonStats,
    lastSeasonMetrics,
    includeGoalInvolvement,
  )
  const previousSeason = buildSeasonRecord(p.previousSeason, null, null, includeGoalInvolvement)
  const thirdSeason = buildSeasonRecord(p.thirdMostRecentSeason, null, null, includeGoalInvolvement)
  const seasons = [lastSeason, previousSeason, thirdSeason].filter(Boolean)

  if (!dateOfBirth) {
    dropped.push(`${p.id}: no dateOfBirth found in research or metrics batches`)
    continue
  }
  if (seasons.length === 0) {
    dropped.push(`${p.id}: no usable season record (no appearances/minutes/goals/assists anywhere)`)
    continue
  }

  const avatarUrl = selectAvatarUrl(p.avatar)
  if (avatarUrl) avatarsUsed += 1
  else avatarsSkipped += 1

  const seniorStatus = buildSeniorStatus(p)

  players.push({
    id: p.id,
    name: p.fullName,
    dateOfBirth,
    nationalityStatus: mapEligibility(p.eligibilityStanding, seniorStatus.seniorCaps),
    nationalTeamLevel: p.level,
    primaryPosition: p.primaryPosition,
    secondaryPositions: p.secondaryPositions ?? [],
    seasons,
    currentClub: buildCurrentClub(p),
    seniorStatus,
    // Includes youth caps, so it is >= seniorStatus.seniorCaps by definition.
    // Falling back to the researched senior count keeps that invariant when
    // the legacy field is null but a senior cap total was sourced — otherwise
    // a capped senior would report fewer total caps than senior caps.
    internationalCaps: p.caps ?? seniorStatus.seniorCaps ?? 0,
    // No real per-appearance minutes feed exists for international caps.
    // Left at 0 rather than estimated; forecast.ts/PlayerDetail.tsx are
    // adjusted to omit the "N international minutes" clause when this is 0
    // instead of printing a false "0 minutes" alongside real caps.
    internationalMinutes: 0,
    avatarUrl,
    dataLastUpdated: p.lastResearchedDate ?? base.researchDate,
  })
}

writeFileSync(OUT_FILE, JSON.stringify(players, null, 2))

console.log(`Wrote ${players.length} players to ${path.relative(ROOT, OUT_FILE)}.`)
if (dropped.length > 0) {
  console.log(`\nDropped ${dropped.length} player(s) for lacking a usable dateOfBirth or season record:`)
  for (const line of dropped) console.log(`  - ${line}`)
}
console.log(
  `\nAvatars: ${avatarsUsed} verified-source photo(s) used, ${avatarsSkipped} left as initials ` +
    `(no image, or manual-review-required).`,
)
