import type {
  ConfidenceLevel,
  Player,
  PositionalGroupId,
  PositionalGroupOutlook,
  PositionRiskAssessment,
  RiskLevel,
} from '@/types/domain'
import { POSITIONAL_GROUPS, POSITIONAL_GROUP_LABELS, POSITIONS, POSITION_TO_GROUP } from '@/types/domain'
import { GROUP_REQUIRED_STARTING_SLOTS, MODEL_CONFIG, RISK_CONFIG } from './config'
import { buildGroupPool, requiredStarters, weightedStrength, type WeightedPlayerScore } from './positionStrength'
import { isFutureContenderEligible } from './squadStatus'
import { mean, quantile, round } from './math'

/**
 * Five orthogonal risk dimensions per positional group, replacing the old
 * single cascading `depthRisk` check.
 *
 * The old model rewarded raw headcount: a position with several under-23s
 * "ready now" (score >= 55) and nobody over 30 came out "low risk" —
 * regardless of whether those bodies were actually any good relative to the
 * rest of the squad. That is exactly how a genuinely weak group (this
 * dataset's midfield) could be many-tracked-players deep and still never get
 * flagged. Splitting the assessment into five independent questions —
 * current quality, depth beyond the required starters, who's coming through,
 * who's trending down, and who's actually available — means a position can
 * be "strong now but exposed future", "thin but supported by strong
 * prospects", or any other honest combination, instead of being forced into
 * one verdict.
 */

function median(values: number[]): number {
  if (values.length === 0) return 0
  return quantile([...values].sort((a, b) => a - b), 0.5)
}

function pluralise(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function assessGroupRisk(
  label: string,
  pool: WeightedPlayerScore[],
  requiredStartingSlots: number,
  currentStrength: number,
  squadMedianStrength: number,
): PositionRiskAssessment {
  if (pool.length === 0) {
    return {
      currentQualityRisk: 'high',
      depthRisk: 'high',
      successionRisk: 'high',
      trendRisk: 'none',
      availabilityRisk: 'none',
      confidence: 'low',
      overallRisk: 'critical',
      reasons: [`${label} — critical risk. No tracked player can fill this position at all.`],
    }
  }

  const reasons: string[] = []
  const leaders = requiredStarters(pool, requiredStartingSlots)

  // 1. Current quality: are the required starters themselves good enough,
  // relative to the rest of the squad — not relative to a fixed number.
  const gap = round(squadMedianStrength - currentStrength, 1)
  let currentQualityRisk: RiskLevel = 'none'
  if (gap >= RISK_CONFIG.qualityRiskHighGapPoints) currentQualityRisk = 'high'
  else if (gap >= RISK_CONFIG.qualityRiskModerateGapPoints) currentQualityRisk = 'moderate'
  if (currentQualityRisk !== 'none') {
    reasons.push(
      `${label} — ${currentQualityRisk} current-quality risk. The ${pluralise(requiredStartingSlots, 'required starting option')} here score ${gap.toFixed(1)} points below the squad's positional median, while available depth consists mainly of unproven or developing players.`,
    )
  }

  // 2. Depth: credible senior-ready cover beyond the required starters.
  //
  // Weighted, matching `weightedStrength` and `requiredStarters`. Filtering on
  // the raw score instead would count a centre-back who is merely *cover* at
  // left-back as full-strength senior-ready depth there — discounting his
  // contribution to the group's strength score while still crediting him as a
  // whole body in the depth count. Half of this dataset's full-back and winger
  // pools are secondary-position players, so that inconsistency was the
  // difference between "no depth risk" and "moderate" for both groups.
  const credible = pool.filter(
    (entry) => entry.score * entry.weight >= RISK_CONFIG.seniorReadyThreshold,
  )
  const neededWithBuffer = requiredStartingSlots + RISK_CONFIG.depthBufferSlots
  let depthRisk: RiskLevel = 'none'
  if (credible.length < requiredStartingSlots) depthRisk = 'high'
  else if (credible.length < neededWithBuffer) depthRisk = 'moderate'
  if (depthRisk !== 'none') {
    reasons.push(
      `${label} — ${depthRisk} depth risk. Only ${pluralise(credible.length, 'player')} in the pool clear the senior-ready score of ${RISK_CONFIG.seniorReadyThreshold}, short of the ${neededWithBuffer} needed to cover the ${pluralise(requiredStartingSlots, 'required starting slot')} plus one injury of cover.`,
    )
  }

  // 3. Trend: are the leading required options themselves declining.
  const decliningLeaders = leaders.filter((p) => p.forecast.trajectory === 'declining')
  const decliningFraction = leaders.length > 0 ? decliningLeaders.length / leaders.length : 0
  let trendRisk: RiskLevel = 'none'
  if (decliningFraction >= 1) trendRisk = 'high'
  else if (decliningFraction >= RISK_CONFIG.trendRiskDecliningFraction) trendRisk = 'moderate'
  if (trendRisk !== 'none') {
    reasons.push(
      `${label} — ${trendRisk} trend risk. ${decliningLeaders.length} of the ${leaders.length} required starting option(s) are currently on a declining trajectory.`,
    )
  }

  // 4. Succession: credible, future-contender-eligible replacements.
  const improvingSuccessors = pool.filter((entry) => isFutureContenderEligible(entry.player)).length
  let successionRisk: RiskLevel = 'none'
  if (improvingSuccessors === 0) {
    successionRisk = currentQualityRisk !== 'none' || depthRisk !== 'none' ? 'high' : 'moderate'
  } else if (improvingSuccessors === 1) {
    successionRisk = 'moderate'
  }
  if (successionRisk !== 'none') {
    reasons.push(
      `${label} — ${successionRisk} succession risk. Only ${pluralise(improvingSuccessors, 'player')} aged ${RISK_CONFIG.futureContenderMaxAge} or under ${improvingSuccessors === 1 ? 'is' : 'are'} on track to approach senior level within 24 months.`,
    )
  }

  // 5. Availability: are the required starters actually able to play.
  const unavailableLeaders = leaders.filter(
    (p) => p.seniorStatus.availabilityStatus === 'injured' || p.seniorStatus.availabilityStatus === 'unavailable',
  )
  let availabilityRisk: RiskLevel = 'none'
  if (unavailableLeaders.length >= requiredStartingSlots) availabilityRisk = 'high'
  else if (unavailableLeaders.length > 0) availabilityRisk = 'moderate'
  if (availabilityRisk !== 'none') {
    reasons.push(
      `${label} — ${availabilityRisk} availability risk. ${pluralise(unavailableLeaders.length, 'required starting option')} currently flagged injured or unavailable.`,
    )
  }

  // Confidence: how much the underlying player forecasts can be trusted.
  // Most `SeniorStatus` fields are null for this pool (see its doc comment),
  // so confidence is grounded in what we do have — each leader's own
  // forecast confidence — rather than invented from absent fields.
  const confidenceScores = leaders.map((p) => p.forecast.confidenceScore)
  const meanConfidence = confidenceScores.length > 0 ? mean(confidenceScores) : 0
  let confidence: ConfidenceLevel = 'low'
  if (meanConfidence >= MODEL_CONFIG.confidenceThresholds.high) confidence = 'high'
  else if (meanConfidence >= MODEL_CONFIG.confidenceThresholds.moderate) confidence = 'moderate'

  const dimensions = [currentQualityRisk, depthRisk, trendRisk, successionRisk, availabilityRisk]
  const overallRisk: PositionRiskAssessment['overallRisk'] = dimensions.includes('high')
    ? 'high'
    : dimensions.includes('moderate')
      ? 'moderate'
      : 'low'

  return {
    currentQualityRisk,
    depthRisk,
    successionRisk,
    trendRisk,
    availabilityRisk,
    confidence,
    overallRisk,
    reasons,
  }
}

/**
 * Risk-assess every positional group, judged against the median strength
 * across all six groups — a position is only "weak" relative to the rest of
 * this squad, not against an arbitrary fixed number.
 */
export function buildPositionalGroupOutlooks(players: Player[]): PositionalGroupOutlook[] {
  const pools = new Map<PositionalGroupId, WeightedPlayerScore[]>()
  const strengths = new Map<PositionalGroupId, number>()

  for (const group of POSITIONAL_GROUPS) {
    const pool = buildGroupPool(players, group)
    pools.set(group, pool)
    strengths.set(group, weightedStrength(pool, GROUP_REQUIRED_STARTING_SLOTS[group]))
  }

  const squadMedianStrength = round(median([...strengths.values()]), 1)

  return POSITIONAL_GROUPS.map((group) => {
    const requiredStartingSlots = GROUP_REQUIRED_STARTING_SLOTS[group]
    const pool = pools.get(group) ?? []
    const currentStrength = round(strengths.get(group) ?? 0, 1)
    const label = POSITIONAL_GROUP_LABELS[group]
    const risk = assessGroupRisk(label, pool, requiredStartingSlots, currentStrength, squadMedianStrength)

    return {
      group,
      label,
      positions: POSITIONS.filter((position) => POSITION_TO_GROUP[position] === group),
      requiredStartingSlots,
      currentStrength,
      squadMedianStrength,
      risk,
    }
  })
}

/** Look up a granular position's inherited group-level risk verdict. */
export function riskForPosition(
  groupOutlooks: PositionalGroupOutlook[],
  position: (typeof POSITIONS)[number],
): PositionRiskAssessment {
  const group = POSITION_TO_GROUP[position]
  const outlook = groupOutlooks.find((g) => g.group === group)
  if (!outlook) {
    return {
      currentQualityRisk: 'none',
      depthRisk: 'none',
      successionRisk: 'none',
      trendRisk: 'none',
      availabilityRisk: 'none',
      confidence: 'low',
      overallRisk: 'low',
      reasons: [],
    }
  }
  return outlook.risk
}
