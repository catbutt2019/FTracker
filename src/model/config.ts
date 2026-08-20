import type { Position } from '@/types/domain'

/**
 * Every tunable number in the model lives here, so the methodology page can
 * quote real values and a reviewer can audit the assumptions in one place.
 * None of these are empirically fitted — they are transparent priors.
 */
export const MODEL_CONFIG = {
  version: '0.1.0-experimental',

  /**
   * Recency weights applied to season scores, most recent first. A player is
   * mostly what they are now, but one season alone is a small sample.
   */
  seasonRecencyWeights: [0.6, 0.27, 0.13],

  /**
   * Regression to the mean. A player with few minutes gets pulled toward the
   * cohort average; `reliabilityMinutes` is the minutes total at which we treat
   * the observed score as roughly half-trustworthy on its own.
   */
  reliabilityMinutes: 900,
  /** Ceiling on how much weight observed performance can ever carry. */
  maxReliability: 0.92,

  /**
   * League context. A score of 100 in a weak league is not equivalent to 100 in
   * a strong one, so scores are nudged toward the standard of opposition faced.
   */
  leagueAdjustmentStrength: 0.22,
  clubAdjustmentStrength: 0.06,
  /** League strength at or above which a league counts as "strong" in the UI. */
  strongLeagueThreshold: 74,

  /** Points of change treated as "broadly stable" rather than real movement. */
  stableBandPoints: 3.5,

  /**
   * Base standard deviation of a 24-month projection, in score points, before
   * confidence and age adjustments.
   */
  baseProjectionSigma: 5.2,
  /** Extra sigma applied at zero confidence. */
  lowConfidenceSigmaPenalty: 6.5,
  /** Sigma scales with the square root of the horizon relative to 24 months. */
  horizonSigmaReference: 24,

  /** Momentum: how strongly last season's change carries forward. */
  momentumCarryover: 0.34,
  /** Cap on the momentum contribution, in points, to stop runaway projections. */
  momentumCap: 5,

  /** Confidence thresholds on the 0-1 continuous confidence score. */
  confidenceThresholds: { moderate: 0.45, high: 0.72 },

  /** Minutes share at or above which a player counts as regularly playing. */
  regularMinutesThreshold: 0.6,

  /** Monte Carlo settings for the squad forecast. */
  simulations: 2000,
  simulationSeed: 20260820,
  /**
   * Correlation between players' outcomes in a simulation, 0-1.
   *
   * Treating 40 players as independent is the single biggest way a model like
   * this can lie: averaging independent draws collapses the spread, and the
   * squad forecast comes out looking far more certain than any honest reading
   * of it allows. In reality a good youth intake, a change of manager or a
   * shift in which leagues Irish players end up in moves many of them at once.
   */
  playerCorrelation: 0.5,
  /** Squad strength must move by more than this for a sim to count as improved. */
  squadStableBandPoints: 1.5,

  /** Players considered per position when building a notional squad. */
  squadSlotsPerPosition: 2,
} as const

/**
 * Age curves, expressed as a multiplier on peak ability by age.
 *
 * Assumption: goalkeepers and centre-backs peak later and decline more slowly;
 * wide and forward roles that lean on acceleration decline earlier. Values are
 * illustrative priors, not fitted parameters.
 */
export interface AgeCurve {
  peakAge: number
  /** Ability lost per year before the peak, as a fraction of peak. */
  riseRate: number
  /** Ability lost per year after the peak, as a fraction of peak. */
  declineRate: number
  /** Age at which decline steepens. */
  steepDeclineAge: number
  steepDeclineMultiplier: number
}

export const AGE_CURVES: Record<Position, AgeCurve> = {
  GK: { peakAge: 30, riseRate: 0.014, declineRate: 0.008, steepDeclineAge: 35, steepDeclineMultiplier: 2.2 },
  CB: { peakAge: 28, riseRate: 0.018, declineRate: 0.011, steepDeclineAge: 33, steepDeclineMultiplier: 2.1 },
  RB: { peakAge: 27, riseRate: 0.02, declineRate: 0.015, steepDeclineAge: 31, steepDeclineMultiplier: 2.3 },
  LB: { peakAge: 27, riseRate: 0.02, declineRate: 0.015, steepDeclineAge: 31, steepDeclineMultiplier: 2.3 },
  DM: { peakAge: 28, riseRate: 0.018, declineRate: 0.012, steepDeclineAge: 32, steepDeclineMultiplier: 2.0 },
  CM: { peakAge: 27, riseRate: 0.019, declineRate: 0.013, steepDeclineAge: 31, steepDeclineMultiplier: 2.1 },
  AM: { peakAge: 26.5, riseRate: 0.021, declineRate: 0.015, steepDeclineAge: 31, steepDeclineMultiplier: 2.2 },
  W: { peakAge: 26, riseRate: 0.023, declineRate: 0.018, steepDeclineAge: 30, steepDeclineMultiplier: 2.4 },
  ST: { peakAge: 27, riseRate: 0.021, declineRate: 0.016, steepDeclineAge: 31, steepDeclineMultiplier: 2.2 },
}

/**
 * Relative importance of each position when aggregating a squad-strength score.
 * Central spine roles are weighted slightly higher because a weakness there is
 * harder to hide. Wingers and strikers share a pool of attacking places.
 */
export const POSITION_SQUAD_WEIGHTS: Record<Position, number> = {
  GK: 1.0,
  RB: 0.85,
  CB: 1.15,
  LB: 0.85,
  DM: 1.0,
  CM: 1.1,
  AM: 0.9,
  W: 1.0,
  ST: 1.05,
}
