/**
 * Domain schema.
 *
 * Deliberately split into three tiers so the boundaries stay honest:
 *
 *  1. RAW      — what a data provider could plausibly supply. No opinions.
 *  2. DERIVED  — everything the forecasting model computes. Never stored in the
 *                dataset, always recomputed, so the methodology page describes
 *                code that actually runs.
 *  3. VIEW     — the joined shape the UI consumes.
 */

/* ------------------------------------------------------------------ *
 * Shared vocabulary
 * ------------------------------------------------------------------ */

export const POSITIONS = [
  'GK',
  'RB',
  'CB',
  'LB',
  'DM',
  'CM',
  'AM',
  'W',
  'ST',
] as const

export type Position = (typeof POSITIONS)[number]

export const POSITION_LABELS: Record<Position, string> = {
  GK: 'Goalkeeper',
  RB: 'Right-back',
  CB: 'Centre-back',
  LB: 'Left-back',
  DM: 'Defensive midfield',
  CM: 'Central midfield',
  AM: 'Attacking midfield',
  W: 'Winger',
  ST: 'Striker',
}

/**
 * Metric families. Positions inside a family are scored on the same metrics,
 * which is what makes cross-player percentiles meaningful.
 */
export const METRIC_GROUPS = [
  'goalkeeper',
  'defender',
  'midfielder',
  'creator',
  'forward',
] as const

export type MetricGroup = (typeof METRIC_GROUPS)[number]

export const POSITION_METRIC_GROUP: Record<Position, MetricGroup> = {
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

export type NationalTeamLevel = 'senior' | 'u21' | 'emerging'

export const NATIONAL_TEAM_LEVEL_LABELS: Record<NationalTeamLevel, string> = {
  senior: 'Senior international',
  u21: 'Under-21',
  emerging: 'Emerging',
}

/**
 * Positional groups used specifically for cross-position risk comparison.
 *
 * The nine granular `Position` values are the right resolution for depth
 * charts, but a formation doesn't field three independent one-slot "central
 * midfield" units — it fields one three-slot midfield unit. Flattening
 * DM/CM/AM (and RB/LB, and the two wide slots) into one group lets
 * `positionRisk.ts` judge "is midfield weak" as a single question about a
 * three-player unit, rather than three separate one-player questions that
 * each look individually fine.
 */
export const POSITIONAL_GROUPS = [
  'goalkeeper',
  'fullback',
  'centreback',
  'midfield',
  'wide',
  'forward',
] as const

export type PositionalGroupId = (typeof POSITIONAL_GROUPS)[number]

export const POSITIONAL_GROUP_LABELS: Record<PositionalGroupId, string> = {
  goalkeeper: 'Goalkeeper',
  fullback: 'Full-back / wing-back',
  centreback: 'Centre-back',
  midfield: 'Midfield',
  wide: 'Winger / wide forward',
  forward: 'Striker',
}

export const POSITION_TO_GROUP: Record<Position, PositionalGroupId> = {
  GK: 'goalkeeper',
  RB: 'fullback',
  LB: 'fullback',
  CB: 'centreback',
  DM: 'midfield',
  CM: 'midfield',
  AM: 'midfield',
  W: 'wide',
  ST: 'forward',
}

/**
 * Mutually exclusive squad-status categories for a player within one
 * position's depth pool. See `src/model/squadStatus.ts` for the
 * classification rules, and its module comment for why each category means
 * exactly what it says and no more.
 */
export const SQUAD_STATUS_CATEGORIES = [
  'highest-rated-current',
  'senior-contender',
  'future-contender',
  'emerging-prospect',
] as const

export type SquadStatusCategory = (typeof SQUAD_STATUS_CATEGORIES)[number]

export const SQUAD_STATUS_LABELS: Record<SquadStatusCategory, string> = {
  'highest-rated-current': 'Highest-rated current options',
  'senior-contender': 'Senior contender / rotation option',
  'future-contender': 'Future contender',
  'emerging-prospect': 'Emerging prospect',
}

export type RiskLevel = 'none' | 'moderate' | 'high'

/** Availability as of the research snapshot. `null` when no feed covers it. */
export type AvailabilityStatus = 'available' | 'injured' | 'unavailable' | null

/**
 * How the player qualifies. Kept explicit because eligibility routes carry
 * real uncertainty: a declared player is a firmer planning assumption than an
 * eligible-but-uncommitted one.
 */
export type EligibilityStatus =
  | 'capped-ireland'
  | 'declared-ireland'
  | 'eligible-uncommitted'
  | 'dual-eligible'

export const ELIGIBILITY_LABELS: Record<EligibilityStatus, string> = {
  'capped-ireland': 'Capped for Ireland',
  'declared-ireland': 'Declared for Ireland',
  'eligible-uncommitted': 'Eligible, uncommitted',
  'dual-eligible': 'Dual eligible',
}

export type PlayingTimeStatus =
  | 'nailed-on'
  | 'rotation'
  | 'fringe'
  | 'minimal'
  /** Appearances are known but minutes are not, so involvement can't be graded. */
  | 'unknown'

export const PLAYING_TIME_LABELS: Record<PlayingTimeStatus, string> = {
  'nailed-on': 'Regular starter',
  rotation: 'Rotation',
  fringe: 'Fringe',
  minimal: 'Minimal minutes',
  unknown: 'Minutes not published',
}

export type Trajectory = 'improving' | 'stable' | 'declining'

export type ConfidenceLevel = 'low' | 'moderate' | 'high'

export type ProjectionHorizon = 12 | 24 | 36

/* ------------------------------------------------------------------ *
 * 1. RAW
 * ------------------------------------------------------------------ */

/** Metric values are keyed by MetricDefinition.key. `null` means "not supplied". */
export type MetricSample = Record<string, number | null>

export interface SeasonRecord {
  season: string
  club: string
  league: string
  /** 0-100. Contextual strength of the competition. See model/leagues.ts. */
  leagueStrength: number
  /** 0-100. Standing of the club within its own league. */
  clubStrength: number
  appearances: number
  /**
   * `null`, not 0, when the source published appearances but never starts.
   * Sources routinely omit both starts and minutes while publishing
   * appearances; encoding that as zero asserts a bench season that may not
   * have happened.
   */
  starts: number | null
  /**
   * `null`, not 0, when the source never published a minutes total.
   *
   * The distinction matters: 0 means "was in the squad and did not play",
   * `null` means "we do not know how much he played". Collapsing the second
   * into the first made a 35-appearance Premier League season read as a player
   * who never got on the pitch. Consumers must handle `null` — `reliability()`
   * in model/scoring.ts falls back to appearances for exactly this case.
   */
  minutes: number | null
  /** Share of available league minutes played, 0-1. `null` when minutes are unknown. */
  minutesPercentage: number | null
  goals: number
  assists: number
  /** Position-specific, per-90 where rate-based. Sparse by design. */
  positionSpecificMetrics: MetricSample
  /** Days unavailable through injury. `null` when the provider has no feed. */
  injuryDays: number | null
}

/**
 * Where a player is right now, independent of `seasons` — which only ever
 * records *completed* seasons. A transfer window can move a player to a new
 * club/league before a single minute has been played there, so the two are
 * deliberately kept apart: `seasons` (and everything scored from it) never
 * changes on transfer news alone, but the club shown in the UI should.
 */
export interface CurrentClub {
  club: string
  league: string
  /** 0-100, same scale and lookup as SeasonRecord.leagueStrength. */
  leagueStrength: number
  /**
   * True when this club/league differs from `seasons[0]` — i.e. a confirmed
   * transfer, loan move or departure happened after the most recent season
   * there is any performance data for.
   */
  changedSinceLastSeason: boolean
  /**
   * True when the player has no club at all — a confirmed free agent, not a
   * player who has already signed elsewhere but not yet played.
   *
   * Consumed by `buildMatchdaySelection`, which treats having no club as a
   * reason a player cannot be picked, the same way an injury is. The ability
   * and projection models ignore it entirely: being unattached says nothing
   * about how good a player is, only about whether he is selectable.
   *
   * `false` rather than `null` when the research pass recorded no club status
   * at all. An unknown contract situation is much more likely to be "quietly
   * under contract" than "clubless", and defaulting to `true` would drop
   * players out of the XI on missing data.
   */
  unattached: boolean
  /** Free-text context on the move, when the research pass found one. */
  transferNote: string | null
}

/**
 * Structured, observed senior-national-team evidence, kept separate from
 * `nationalTeamLevel`/`internationalCaps` on purpose.
 *
 * `nationalTeamLevel` and `internationalCaps` describe standing loosely
 * enough to have previously let a 25-year-old senior international who is
 * out of form (Finn Azaz) and a player who has already started for the
 * senior team (Harvey Vale) both be classified as "potential future
 * starters" — a status that should be reserved for players who have never
 * started for the senior side. Every field here is either a real number
 * sourced from the research pass, or `null` when no feed covers it — never a
 * fabricated zero. Consumers (see `squadStatus.ts`) must treat `null` as
 * "unknown, so lower confidence", not as "zero, so no evidence".
 */
export interface SeniorStatus {
  /** Caps only ever counted when `eligibilityStanding` was genuinely senior. */
  seniorCaps: number | null
  seniorStarts: number | null
  /** Starts in competitive (non-friendly) senior fixtures. */
  competitiveSeniorStarts: number | null
  seniorMinutes: number | null
  seniorMinutesLast12Months: number | null
  lastSeniorAppearanceDate: string | null
  lastSeniorStartDate: string | null
  /** Count of senior squad call-ups in the last 12 months, selection or not. */
  recentSquadCallups: number | null
  /** Club minutes in the last 12 months. `null`, not 0, when unpublished. */
  clubMinutesLast12Months: number | null
  /** 0-100, same scale as `SeasonRecord.leagueStrength`. */
  clubCompetitionLevel: number | null
  availabilityStatus: AvailabilityStatus
}

export interface PlayerRaw {
  id: string
  name: string
  dateOfBirth: string
  nationalityStatus: EligibilityStatus
  nationalTeamLevel: NationalTeamLevel
  primaryPosition: Position
  secondaryPositions: Position[]
  /** Most recent season first. */
  seasons: SeasonRecord[]
  /** Structured senior-team evidence. See `SeniorStatus`. */
  seniorStatus: SeniorStatus
  /**
   * Current club/league as of the research snapshot, which may already
   * differ from `seasons[0]` (see `CurrentClub`). Scoring and forecasting
   * never read this — only display and squad-composition aggregates do.
   */
  currentClub: CurrentClub
  internationalCaps: number
  internationalMinutes: number
  /**
   * A verified-source player photo, or null to fall back to the initials
   * avatar. Selection happens at build time in build-real-players.mjs — only
   * images the research pass marked "verified-from-named-source" ever reach
   * this field. These are hotlinked third-party photos with rights status
   * "prototype-only-rights-not-cleared"; fine for this prototype, not
   * production-cleared.
   */
  avatarUrl?: string | null
  dataLastUpdated: string
}

/* ------------------------------------------------------------------ *
 * 2. DERIVED
 * ------------------------------------------------------------------ */

export interface MetricScore {
  key: string
  label: string
  description: string
  /** Raw value as supplied, `null` when missing. */
  value: number | null
  unit: string
  /** 0-100 rank within the player's metric-group cohort. `null` when missing. */
  percentile: number | null
  higherIsBetter: boolean
  weight: number
}

export interface SeasonScore {
  season: string
  club: string
  league: string
  minutes: number | null
  starts: number | null
  minutesPercentage: number | null
  /** 0-100 weighted blend of available metric percentiles. */
  rawScore: number
  /** rawScore after league and club context adjustment. */
  adjustedScore: number
  /**
   * adjustedScore after regression to the mean for this season's own sample
   * size. Used for the squad-strength history so that historical points are
   * computed the same way as the current score and the chart stays continuous.
   */
  shrunkScore: number
  /** Share of metric weight actually supplied, 0-1. */
  metricCoverage: number
  /** Keys the provider did not supply for this season. */
  missingMetrics: string[]
}

export interface ProbabilitySplit {
  /** Integer percentages that always sum to exactly 100. */
  improve: number
  stable: number
  decline: number
}

export interface HorizonProjection {
  horizonMonths: ProjectionHorizon
  low: number
  median: number
  high: number
  probabilities: ProbabilitySplit
}

export interface PlayerForecast {
  /** Sample-size-shrunk estimate of present ability, 0-100. */
  currentPerformanceScore: number
  previousPerformanceScore: number | null
  seasonOnSeasonChange: number | null
  /** Pre-shrinkage score, exposed so the UI can show what regression did. */
  observedScore: number
  /** How far shrinkage pulled the observed score toward the cohort mean. */
  regressionAdjustment: number
  projections: Record<ProjectionHorizon, HorizonProjection>
  /** Convenience alias for the 24-month horizon, the headline view. */
  projectedPerformanceLow: number
  projectedPerformanceMedian: number
  projectedPerformanceHigh: number
  improvementProbability: number
  stableProbability: number
  declineProbability: number
  predictionConfidence: ConfidenceLevel
  /** 0-1 continuous score behind predictionConfidence. */
  confidenceScore: number
  trajectory: Trajectory
  forecastReasons: string[]
  uncertaintyReasons: string[]
  /** Expected drift from the positional age curve alone, over 24 months. */
  ageEffect: number
  /** Expected drift attributable to recent form momentum, over 24 months. */
  momentumEffect: number
}

/* ------------------------------------------------------------------ *
 * 3. VIEW
 * ------------------------------------------------------------------ */

export interface Player extends PlayerRaw {
  age: number
  /** Fractional age, used by the age curves. */
  exactAge: number
  club: string
  league: string
  season: string
  leagueStrength: number
  clubStrength: number
  appearances: number
  starts: number | null
  minutes: number | null
  minutesPercentage: number | null
  goals: number
  assists: number
  injuryDays: number | null
  playingTimeStatus: PlayingTimeStatus
  metricGroup: MetricGroup
  metrics: MetricScore[]
  seasonScores: SeasonScore[]
  forecast: PlayerForecast
  /** Percentile of currentPerformanceScore within the whole Irish pool. */
  poolPercentile: number
}

/* ------------------------------------------------------------------ *
 * Squad-level types
 * ------------------------------------------------------------------ */

/**
 * The five orthogonal risk dimensions for one positional group, plus a
 * confidence rating and a rolled-up overall level.
 *
 * These are deliberately independent: a position can be `currentQualityRisk:
 * 'high'` while `successionRisk: 'none'` (weak now, strong pipeline behind
 * it), or the reverse (strong now, nobody credible coming through). Collapsing
 * them into one number was the root cause of "well stocked" verdicts that
 * were really just "many bodies, low quality" — see `positionRisk.ts`.
 */
export interface PositionRiskAssessment {
  /** Required starters scoring materially below the squad-wide median. */
  currentQualityRisk: RiskLevel
  /** Too few credible senior-ready players beyond the required starters. */
  depthRisk: RiskLevel
  /** Too few improving/future-contender-eligible players coming through. */
  successionRisk: RiskLevel
  /** Half or more of the required starters on a declining trajectory. */
  trendRisk: RiskLevel
  /** Required starters flagged injured/unavailable. */
  availabilityRisk: RiskLevel
  confidence: ConfidenceLevel
  /** Highest of the five dimensions, mapped onto the existing badge scale. */
  overallRisk: 'low' | 'moderate' | 'high' | 'critical'
  /** Human-readable cause for each dimension currently at 'moderate'/'high'. */
  reasons: string[]
}

export interface PositionDepth {
  position: Position
  label: string
  positionalGroup: PositionalGroupId
  /** Players actually needed to start here, from the formation config. */
  requiredStartingSlots: number
  /**
   * The model's best-scoring current options. Deliberately not called
   * "first choice" — the dataset has no reliable recent-selection evidence
   * (no published start dates/call-up recency), so this is a ranking by
   * model score, not a claim about who Ireland's manager would actually pick.
   */
  highestRatedCurrent: Player[]
  /** Senior-capped or already started, but not among `highestRatedCurrent`. */
  seniorContenders: Player[]
  /** No senior start, age 23 or under, on an improving/stable trajectory. */
  futureContenders: Player[]
  /** Age 21 or under, not yet meeting the future-contender bar. */
  emergingProspects: Player[]
  averageAge: number
  currentStrength: number
  projectedStrength: number
  projectedLow: number
  projectedHigh: number
  risk: PositionRiskAssessment
  /** Mirrors `risk.overallRisk` — kept so existing badge components need no changes. */
  depthRisk: 'low' | 'moderate' | 'high' | 'critical'
  /** Mirrors `risk.reasons` joined into one paragraph. */
  depthRiskReason: string
  playerCount: number
}

export interface PositionalGroupOutlook {
  group: PositionalGroupId
  label: string
  positions: Position[]
  requiredStartingSlots: number
  currentStrength: number
  /** Median currentStrength across all six positional groups. */
  squadMedianStrength: number
  risk: PositionRiskAssessment
}

export interface SquadHorizonOutlook {
  horizonMonths: ProjectionHorizon
  improveProbability: number
  stableProbability: number
  declineProbability: number
  /** 10th percentile of simulated squad strength. */
  low: number
  median: number
  /** 90th percentile of simulated squad strength. */
  high: number
}

export interface SquadStrengthPoint {
  season: string
  /** Present for historical seasons only. */
  observed: number | null
  /** Present for projected seasons only, plus the join point. */
  projectedMedian: number | null
  projectedLow: number | null
  projectedHigh: number | null
  kind: 'observed' | 'projected'
}

export interface SquadOutlook {
  currentStrength: number
  previousSeasonStrength: number
  changeFromPreviousSeason: number
  averageSquadAge: number
  /** Counted over `minutesKnownCount`, not `poolSize`. */
  regularMinutesCount: number
  /** Players whose league minutes were actually published by a source. */
  minutesKnownCount: number
  strongLeagueCount: number
  emergingPipelineCount: number
  poolSize: number
  horizons: Record<ProjectionHorizon, SquadHorizonOutlook>
  history: SquadStrengthPoint[]
  depthByPosition: PositionDepth[]
  /** @deprecated Positions projected to strengthen. Granular, trend-only. */
  strengthening: PositionDepth[]
  /** @deprecated Superseded by `highRiskGroups`/`monitorGroups` below. */
  atRisk: PositionDepth[]
  positionalGroups: PositionalGroupOutlook[]
  /** Groups with `risk.overallRisk` of 'high' or 'critical'. */
  highRiskGroups: PositionalGroupOutlook[]
  /** Groups with `risk.overallRisk` of 'moderate'. */
  monitorGroups: PositionalGroupOutlook[]
  lowRiskGroups: PositionalGroupOutlook[]
  simulations: number
  dataLastUpdated: string
}
