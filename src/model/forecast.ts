import type {
  ConfidenceLevel,
  HorizonProjection,
  PlayerForecast,
  PlayerRaw,
  ProbabilitySplit,
  ProjectionHorizon,
  SeasonScore,
  Trajectory,
} from '@/types/domain'
import { POSITION_LABELS, POSITION_METRIC_GROUP } from '@/types/domain'
import { MODEL_CONFIG } from './config'
import { ageEffect, peakAgeFor } from './ageCurve'
import { type Cohort, reliability, scoreSeason } from './scoring'
import { clamp, normalCdf, normalQuantile, round, roundToHundred } from './math'
import { metricsFor } from './metrics'

export const HORIZONS: ProjectionHorizon[] = [12, 24, 36]

/* ------------------------------------------------------------------ *
 * Age
 * ------------------------------------------------------------------ */

export function exactAgeOn(dateOfBirth: string, asOf: Date): number {
  const dob = new Date(dateOfBirth)
  const ms = asOf.getTime() - dob.getTime()
  return ms / (365.2425 * 24 * 60 * 60 * 1000)
}

/* ------------------------------------------------------------------ *
 * Probabilities
 * ------------------------------------------------------------------ */

/**
 * Convert an expected change and its uncertainty into three probabilities.
 *
 * The projected change is treated as normally distributed. "Broadly stable"
 * is a band of +/- `stableBandPoints` around no change, so the three outcomes
 * are mutually exclusive and exhaustive by construction. They are then rounded
 * by largest remainder, which guarantees they sum to exactly 100.
 */
export function changeProbabilities(
  expectedChange: number,
  sigma: number,
  band: number = MODEL_CONFIG.stableBandPoints,
): ProbabilitySplit {
  const safeSigma = Math.max(sigma, 0.25)
  const pDecline = normalCdf((-band - expectedChange) / safeSigma)
  const pImproveOrBetter = 1 - normalCdf((band - expectedChange) / safeSigma)
  const pStable = Math.max(0, 1 - pDecline - pImproveOrBetter)
  const [improve, stable, decline] = roundToHundred([pImproveOrBetter, pStable, pDecline])
  return { improve, stable, decline }
}

/**
 * Trajectory label.
 *
 * A margin is required before calling a player improving or declining. Without
 * it, a 34/33/33 split would be labelled "improving", which overstates what a
 * near-even distribution says.
 */
export function classifyTrajectory(probabilities: ProbabilitySplit): Trajectory {
  const { improve, stable, decline } = probabilities
  const margin = 8
  if (improve >= stable && improve - decline >= margin) return 'improving'
  if (decline >= stable && decline - improve >= margin) return 'declining'
  return 'stable'
}

export function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= MODEL_CONFIG.confidenceThresholds.high) return 'high'
  if (score >= MODEL_CONFIG.confidenceThresholds.moderate) return 'moderate'
  return 'low'
}

/* ------------------------------------------------------------------ *
 * Confidence
 * ------------------------------------------------------------------ */

export interface ConfidenceInputs {
  /** `null` when no season in the window published a minutes total. */
  weightedMinutes: number | null
  coverage: number
  seasonCount: number
  hasInjuryData: boolean
  exactAge: number
  /**
   * Fallback playing-time signal for seasons where a source reports
   * appearances but never published minutes. Only consulted when
   * `weightedMinutes` is null or zero, so it never displaces a real figure.
   */
  weightedAppearances?: number
}

/**
 * Continuous 0-1 confidence.
 *
 * Confidence is about the quality of the evidence, not the quality of the
 * player. A very good player with 300 minutes should still be low confidence.
 */
export function computeConfidence(inputs: ConfidenceInputs): number {
  const minutesFactor =
    inputs.weightedMinutes !== null && inputs.weightedMinutes > 0
      ? clamp(inputs.weightedMinutes / 2600, 0, 1)
      : clamp((inputs.weightedAppearances ?? 0) / (2600 / 90), 0, 1)
  const coverageFactor = clamp(inputs.coverage, 0, 1)
  const historyFactor = clamp((inputs.seasonCount - 1) / 2, 0, 1)
  const injuryFactor = inputs.hasInjuryData ? 1 : 0.5
  // Teenagers change quickly and unpredictably; the evidence ages faster.
  const volatilityFactor = inputs.exactAge < 20 ? 0.78 : inputs.exactAge < 22 ? 0.9 : 1

  const base =
    0.42 * minutesFactor +
    0.28 * coverageFactor +
    0.18 * historyFactor +
    0.12 * injuryFactor

  return clamp(base * volatilityFactor, 0.05, 0.95)
}

/* ------------------------------------------------------------------ *
 * Explanations
 * ------------------------------------------------------------------ */

interface ExplanationInputs {
  player: PlayerRaw
  seasonScores: SeasonScore[]
  ageEffect24: number
  momentum: number
  exactAge: number
  coverage: number
  weightedMinutes: number | null
  regressionAdjustment: number
  confidence: number
}

function buildForecastReasons(input: ExplanationInputs): string[] {
  const reasons: string[] = []
  const { player, seasonScores, exactAge, ageEffect24, momentum } = input
  const latest = seasonScores[0]
  const previous = seasonScores[1]
  const position = POSITION_LABELS[player.primaryPosition]
  const peak = peakAgeFor(player.primaryPosition)

  if (ageEffect24 > 0.8) {
    reasons.push(
      `At ${Math.floor(exactAge)}, the player is still approaching the typical peak age of ${peak} for a ${position.toLowerCase()}, so the age curve alone points upward.`,
    )
  } else if (ageEffect24 < -0.8) {
    reasons.push(
      `At ${Math.floor(exactAge)}, the player is past the typical peak age of ${peak} for a ${position.toLowerCase()}, so the age curve points gently downward regardless of current form.`,
    )
  } else {
    reasons.push(
      `At ${Math.floor(exactAge)}, the player sits close to the typical peak age of ${peak} for a ${position.toLowerCase()}, so age is close to neutral in this projection.`,
    )
  }

  if (previous && momentum > 1.5) {
    reasons.push(
      `Performance score rose from ${previous.adjustedScore} to ${latest.adjustedScore} between ${previous.season} and ${latest.season}, and recent improvement is carried partly forward.`,
    )
  } else if (previous && momentum < -1.5) {
    reasons.push(
      `Performance score fell from ${previous.adjustedScore} to ${latest.adjustedScore} between ${previous.season} and ${latest.season}, which weighs against the projection.`,
    )
  } else if (previous) {
    reasons.push(
      `Output has been broadly steady across ${previous.season} and ${latest.season}, which supports a projection close to the current level.`,
    )
  }

  // Two branches because minutes are unpublished for most seasons in this
  // dataset. Without the appearances fallback, the great majority of players
  // would silently lose this line — not because their sample is thin, but
  // because the source never printed a minutes column.
  if (
    latest.minutesPercentage !== null &&
    latest.minutesPercentage >= MODEL_CONFIG.regularMinutesThreshold
  ) {
    const startsClause = latest.starts !== null ? ` and ${latest.starts} starts` : ''
    reasons.push(
      `Regular playing time at ${latest.club} — ${(latest.minutes ?? 0).toLocaleString()} minutes${startsClause} — means the underlying numbers rest on a reasonable sample.`,
    )
  } else if (
    latest.minutesPercentage === null &&
    (player.seasons[0]?.appearances ?? 0) >= MODEL_CONFIG.regularAppearancesThreshold
  ) {
    reasons.push(
      `${player.seasons[0].appearances} appearances at ${latest.club} in ${latest.season} point to a reasonable sample, though no minutes total was published for the season, so involvement cannot be graded precisely.`,
    )
  }

  if (latest.metricCoverage > 0 && latest.rawScore >= 62) {
    reasons.push(
      `Position-specific metrics place the player in the upper range of the Irish ${position.toLowerCase()} pool for ${latest.season}.`,
    )
  }

  if (player.internationalCaps > 0) {
    const minutesClause =
      player.internationalMinutes > 0
        ? ` and ${player.internationalMinutes.toLocaleString()} international minutes`
        : ''
    reasons.push(
      `${player.internationalCaps} senior cap${player.internationalCaps === 1 ? '' : 's'}${minutesClause} indicate the step up has already been made at least once.`,
    )
  }

  return reasons
}

function buildUncertaintyReasons(input: ExplanationInputs): string[] {
  const reasons: string[] = []
  const {
    player,
    seasonScores,
    coverage,
    weightedMinutes,
    regressionAdjustment,
    exactAge,
    confidence,
  } = input
  const latest = seasonScores[0]
  const group = POSITION_METRIC_GROUP[player.primaryPosition]
  const defs = metricsFor(group)

  if (latest.missingMetrics.length > 0) {
    const names = latest.missingMetrics
      .map((key) => defs.find((d) => d.key === key)?.label ?? key)
      .join(', ')
    reasons.push(
      `There is no value for ${names} in ${latest.season}, so ${Math.round((1 - coverage) * 100)}% of the normal metric weight is unavailable and the remaining metrics carry more load than intended.`,
    )
  }

  if (weightedMinutes === null) {
    reasons.push(
      `No minutes total was published for any recent season, so the sample size behind this projection is inferred from appearances alone. An appearance may be ninety minutes or five, which widens the range.`,
    )
  } else if (weightedMinutes < 1200) {
    reasons.push(
      `Only around ${Math.round(weightedMinutes).toLocaleString()} recency-weighted minutes are available. Small samples move a lot from season to season, so the projection is deliberately wide.`,
    )
  } else if (weightedMinutes < 2000) {
    reasons.push(
      `Recency-weighted minutes of roughly ${Math.round(weightedMinutes).toLocaleString()} are a moderate rather than a strong sample, which limits confidence.`,
    )
  }

  if (Math.abs(regressionAdjustment) >= 1.5) {
    const direction = regressionAdjustment < 0 ? 'down' : 'up'
    reasons.push(
      `Because of that sample size, the observed score was pulled ${direction} by ${Math.abs(round(regressionAdjustment, 1))} points toward the positional average. The unadjusted figure would be more flattering but less reliable.`,
    )
  }

  if (seasonScores.length < 2) {
    reasons.push(
      'Only one season of data is available, so no trend can be measured and the projection rests almost entirely on the age curve.',
    )
  }

  if (player.seasons[0].injuryDays === null) {
    reasons.push(
      'No injury or availability feed is connected, so a spell out of the game would not be visible to the model.',
    )
  } else if (player.seasons[0].injuryDays > 60) {
    reasons.push(
      `${player.seasons[0].injuryDays} days were lost to injury in ${latest.season}. Availability risk is not modelled beyond lowering confidence.`,
    )
  }

  if (exactAge < 20) {
    reasons.push(
      'Players under 20 develop unevenly, and the model has no way to distinguish a genuine leap from a good few months.',
    )
  }

  if (player.nationalityStatus === 'eligible-uncommitted' || player.nationalityStatus === 'dual-eligible') {
    reasons.push(
      'The player has not committed to Ireland, so their inclusion in the pool is an assumption rather than a fact.',
    )
  }

  if (confidence < MODEL_CONFIG.confidenceThresholds.moderate) {
    reasons.push(
      'Overall confidence is low. Treat the direction of travel as a hypothesis to check against scouting, not as a finding.',
    )
  }

  if (player.currentClub.changedSinceLastSeason) {
    const from = latest.club
    const to = player.currentClub.club
    reasons.push(
      `The player has moved from ${from} to ${to} since ${latest.season}, the most recent season with any recorded performance data. ` +
        'This score and projection are still built entirely from performance at the previous club — adapting to a new team, role or league is not modelled, so treat the projection as a pre-move baseline rather than a forecast of life at the new club.',
    )
  }

  // No forecast should ever be presented without a caveat. Where the evidence
  // is genuinely strong, the honest caveat is what the model cannot see at all.
  if (reasons.length === 0) {
    reasons.push(
      'The evidence base here is comparatively strong, but the model still sees only minutes and match statistics. It has no view of tactical role, coaching, injury history beyond days lost, contract situation or the chance of a move that changes everything.',
    )
  }

  return reasons
}

/* ------------------------------------------------------------------ *
 * Main entry point
 * ------------------------------------------------------------------ */

export interface ForecastResult {
  forecast: PlayerForecast
  seasonScores: SeasonScore[]
  exactAge: number
}

/**
 * Produce a full forecast for one player.
 *
 * Pipeline, in order:
 *   1. Score each season from position-specific metric percentiles.
 *   2. Blend seasons with recency weights.
 *   3. Shrink toward the positional mean in proportion to sample weakness.
 *   4. Add the age-curve drift and a capped momentum term per horizon.
 *   5. Widen the interval as confidence falls and the horizon lengthens.
 *   6. Convert the resulting distribution into three probabilities.
 */
export function forecastPlayer(
  player: PlayerRaw,
  cohort: Cohort,
  asOf: Date,
): ForecastResult {
  const group = POSITION_METRIC_GROUP[player.primaryPosition]
  const seasonScores = player.seasons.map((s) => scoreSeason(s, group, cohort))
  const exactAge = exactAgeOn(player.dateOfBirth, asOf)

  // 2. Recency-weighted blend.
  const weights: readonly number[] = MODEL_CONFIG.seasonRecencyWeights
  let scoreSum = 0
  let weightSum = 0
  let minutesSum = 0
  // Tracked separately from `weightSum` so that seasons with no published
  // minutes are excluded from the average rather than averaged in as zeros.
  // Diluting a real 3,000-minute season with two unpublished ones would
  // report a 1,000-minute sample and collapse the player's confidence on the
  // strength of data that was never missing in the first place.
  let minutesWeightSum = 0
  let appearancesSum = 0
  let coverageSum = 0
  seasonScores.forEach((season, index) => {
    const weight = weights[index] ?? 0
    if (weight === 0) return
    scoreSum += season.adjustedScore * weight
    coverageSum += season.metricCoverage * weight
    if (season.minutes !== null) {
      minutesSum += season.minutes * weight
      minutesWeightSum += weight
    }
    appearancesSum += (player.seasons[index]?.appearances ?? 0) * weight
    weightSum += weight
  })
  const observedScore = weightSum > 0 ? scoreSum / weightSum : 50
  const coverage = weightSum > 0 ? coverageSum / weightSum : 0
  const weightedMinutes = minutesWeightSum > 0 ? minutesSum / minutesWeightSum : null
  const weightedAppearances = weightSum > 0 ? appearancesSum / weightSum : 0

  // 3. Regression to the mean.
  const groupMean = cohort.groupMeans[group] ?? 50
  const rel = reliability(weightedMinutes, coverage, weightedAppearances)
  const currentScore = clamp(groupMean + rel * (observedScore - groupMean), 1, 99)
  const regressionAdjustment = currentScore - observedScore

  const previousSeason = seasonScores[1] ?? null
  const previousScore = previousSeason ? previousSeason.adjustedScore : null
  const seasonOnSeasonChange =
    previousScore === null ? null : round(seasonScores[0].adjustedScore - previousScore, 1)

  // 4. Momentum, capped so one strong season cannot dominate the projection.
  const rawMomentum = seasonOnSeasonChange ?? 0
  const momentum = clamp(
    rawMomentum * MODEL_CONFIG.momentumCarryover * rel,
    -MODEL_CONFIG.momentumCap,
    MODEL_CONFIG.momentumCap,
  )

  const confidence = computeConfidence({
    weightedMinutes,
    weightedAppearances,
    coverage,
    seasonCount: seasonScores.length,
    hasInjuryData: player.seasons.some((s) => s.injuryDays !== null),
    exactAge,
  })

  const ageEffect24 = ageEffect(player.primaryPosition, exactAge, currentScore, 24)

  const projections = {} as Record<ProjectionHorizon, HorizonProjection>
  for (const horizon of HORIZONS) {
    const horizonScale = horizon / MODEL_CONFIG.horizonSigmaReference
    const drift = ageEffect(player.primaryPosition, exactAge, currentScore, horizon)
    // Momentum decays rather than compounding: form is a short-term signal.
    const momentumTerm = momentum * Math.min(1, horizonScale) * (horizon === 36 ? 0.8 : 1)
    const expectedChange = drift + momentumTerm

    // 5. Uncertainty grows with the square root of time, and a weak evidence
    // base adds a flat penalty on top.
    const sigma =
      (MODEL_CONFIG.baseProjectionSigma +
        (1 - confidence) * MODEL_CONFIG.lowConfidenceSigmaPenalty) *
      Math.sqrt(horizonScale)

    const median = clamp(currentScore + expectedChange, 1, 99)
    // 80% interval. Stated explicitly in the UI so the range is interpretable.
    const z = normalQuantile(0.9)
    projections[horizon] = {
      horizonMonths: horizon,
      low: round(clamp(median - z * sigma, 1, 99), 1),
      median: round(median, 1),
      high: round(clamp(median + z * sigma, 1, 99), 1),
      probabilities: changeProbabilities(expectedChange, sigma),
    }
  }

  const headline = projections[24]
  const explanationInputs: ExplanationInputs = {
    player,
    seasonScores,
    ageEffect24,
    momentum,
    exactAge,
    coverage,
    weightedMinutes,
    regressionAdjustment,
    confidence,
  }

  const forecast: PlayerForecast = {
    currentPerformanceScore: round(currentScore, 1),
    previousPerformanceScore: previousScore,
    seasonOnSeasonChange,
    observedScore: round(observedScore, 1),
    regressionAdjustment: round(regressionAdjustment, 1),
    projections,
    projectedPerformanceLow: headline.low,
    projectedPerformanceMedian: headline.median,
    projectedPerformanceHigh: headline.high,
    improvementProbability: headline.probabilities.improve,
    stableProbability: headline.probabilities.stable,
    declineProbability: headline.probabilities.decline,
    predictionConfidence: confidenceLevel(confidence),
    confidenceScore: round(confidence, 3),
    trajectory: classifyTrajectory(headline.probabilities),
    forecastReasons: buildForecastReasons(explanationInputs),
    uncertaintyReasons: buildUncertaintyReasons(explanationInputs),
    ageEffect: round(ageEffect24, 2),
    momentumEffect: round(momentum, 2),
  }

  return { forecast, seasonScores, exactAge }
}
