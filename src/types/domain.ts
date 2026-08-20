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

export const PLAYING_TIME_LABELS: Record<PlayingTimeStatus, string> = {
  'nailed-on': 'Regular starter',
  rotation: 'Rotation',
  fringe: 'Fringe',
  minimal: 'Minimal minutes',
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
  starts: number
  minutes: number
  /** Share of available league minutes played, 0-1. */
  minutesPercentage: number
  goals: number
  assists: number
  /** Position-specific, per-90 where rate-based. Sparse by design. */
  positionSpecificMetrics: MetricSample
  /** Days unavailable through injury. `null` when the provider has no feed. */
  injuryDays: number | null
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
  internationalCaps: number
  internationalMinutes: number
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
  minutes: number
  starts: number
  minutesPercentage: number
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
  starts: number
  minutes: number
  minutesPercentage: number
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

export interface PositionDepth {
  position: Position
  label: string
  firstChoice: Player[]
  futureStarters: Player[]
  emerging: Player[]
  averageAge: number
  currentStrength: number
  projectedStrength: number
  projectedLow: number
  projectedHigh: number
  depthRisk: 'low' | 'moderate' | 'high' | 'critical'
  depthRiskReason: string
  playerCount: number
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
  regularMinutesCount: number
  strongLeagueCount: number
  emergingPipelineCount: number
  poolSize: number
  horizons: Record<ProjectionHorizon, SquadHorizonOutlook>
  history: SquadStrengthPoint[]
  depthByPosition: PositionDepth[]
  strengthening: PositionDepth[]
  atRisk: PositionDepth[]
  simulations: number
  dataLastUpdated: string
}
