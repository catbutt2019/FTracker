/**
 * Aggregates individual research assessments into the national-team-level
 * read: which positions are deepening, which lean on ageing players, and
 * whether the pool as a whole looks like it is strengthening.
 *
 * There is no percentile ability score in the research snapshot, so "depth"
 * here is a headcount-and-involvement measure, not a quality measure — a
 * position can look deep on paper while every player in it is mediocre. The
 * interface and the methodology page must not blur that distinction.
 *
 * Explicitly out of scope, per the brief: this module says nothing about
 * qualification for any tournament. It has no fixture list, no opponent
 * strength and no competition format, and manufacturing a number without
 * them would be worse than saying nothing.
 */

import { POSITIONS, POSITION_LABELS } from '@/types/domain'
import type { Position } from '@/types/domain'
import type {
  EvidenceItem,
  PoolOutlookResearch,
  PositionOutlookResearch,
  ProgressionAssessment,
  ResearchPlayer,
} from '@/types/research'
import { mean } from './math'

/** Senior minutes at or above this in the last completed season count as "getting minutes". */
const SENIOR_MINUTES_THRESHOLD = 450
/** Age at or above which a squad's reliance on a player is treated as an ageing dependency. */
const AGEING_AGE_THRESHOLD = 30
/** Below this many assessed players, a directional read is not attempted. */
const MIN_MEANINGFUL_ASSESSMENTS = 5
/** Net weighted direction beyond which the pool is called strengthening or weakening. */
const DIRECTION_THRESHOLD = 0.15

const IMPROVING_STATUSES = new Set(['improving', 'emerging'])

function hasEvidence(playerId: string, evidence: EvidenceItem[], category: EvidenceItem['category']): boolean {
  return evidence.some((e) => e.playerId === playerId && e.category === category)
}

function buildPositionOutlook(
  position: Position,
  players: ResearchPlayer[],
  assessments: Record<string, ProgressionAssessment>,
): PositionOutlookResearch {
  const positionPlayers = players.filter((p) => p.primaryPosition === position)
  const seniorPlayers = positionPlayers.filter((p) => p.level === 'senior')
  const emergingPlayers = positionPlayers.filter((p) => p.level !== 'senior')

  const knownAges = positionPlayers.map((p) => p.age).filter((age): age is number => age !== null)
  const averageAge = knownAges.length > 0 ? mean(knownAges) : null

  const statuses = positionPlayers.map((p) => assessments[p.id]?.status)
  const improvingCount = statuses.filter((s) => s !== undefined && IMPROVING_STATUSES.has(s)).length
  const decliningCount = statuses.filter((s) => s === 'declining').length

  const seniorAges = seniorPlayers.map((p) => p.age).filter((age): age is number => age !== null)
  const dependsOnAgeingPlayers =
    seniorPlayers.length > 0 &&
    seniorAges.length > 0 &&
    mean(seniorAges) >= AGEING_AGE_THRESHOLD &&
    emergingPlayers.length === 0

  let assessment: PositionOutlookResearch['assessment']
  let reason: string
  if (positionPlayers.length === 0) {
    assessment = 'insufficient-evidence'
    reason = 'No researched players were placed in this position.'
  } else if (dependsOnAgeingPlayers) {
    assessment = 'thinning'
    reason = `The senior options average ${Math.round(mean(seniorAges))} years old with no emerging player yet researched behind them.`
  } else if (improvingCount > decliningCount && emergingPlayers.length > 0) {
    assessment = 'improving-depth'
    reason = `${improvingCount} of ${positionPlayers.length} researched players show positive evidence, including ${emergingPlayers.length} emerging option(s).`
  } else if (decliningCount > improvingCount) {
    assessment = 'thinning'
    reason = `${decliningCount} of ${positionPlayers.length} researched players show negative evidence and only ${improvingCount} show positive evidence.`
  } else {
    assessment = 'holding'
    reason = `${positionPlayers.length} player(s) researched with no clear net direction (${improvingCount} positive, ${decliningCount} negative).`
  }

  return {
    position,
    label: POSITION_LABELS[position],
    playerCount: positionPlayers.length,
    seniorCount: seniorPlayers.length,
    emergingCount: emergingPlayers.length,
    averageAge,
    improvingCount,
    decliningCount,
    dependsOnAgeingPlayers,
    assessment,
    reason,
  }
}

/**
 * Headcount-weighted depth score used only to rank positions relative to each
 * other, not to state anyone's ability. A nailed-on starter counts for more
 * than a bench option because a place that depends on one fringe player is
 * thinner than the same headcount suggests.
 */
const INVOLVEMENT_WEIGHT: Record<ResearchPlayer['involvement'], number> = {
  starting: 1,
  rotating: 0.6,
  bench: 0.3,
  'out-of-squad': 0.1,
  unknown: 0.3,
}

function depthScore(position: Position, players: ResearchPlayer[]): number {
  return players
    .filter((p) => p.primaryPosition === position)
    .reduce((sum, p) => sum + INVOLVEMENT_WEIGHT[p.involvement], 0)
}

export function buildResearchOutlook(
  players: ResearchPlayer[],
  evidence: EvidenceItem[],
  assessments: Record<string, ProgressionAssessment>,
): PoolOutlookResearch {
  const byPosition = POSITIONS.map((position) => buildPositionOutlook(position, players, assessments))

  const rankedByDepth = [...POSITIONS].sort((a, b) => depthScore(b, players) - depthScore(a, players))
  const strongestPositions = rankedByDepth.slice(0, 2)
  const weakestPositions = [...rankedByDepth].reverse().slice(0, 2)

  const improvingDepthPositions = byPosition
    .filter((p) => p.assessment === 'improving-depth')
    .map((p) => p.position)
  const ageingDependentPositions = byPosition.filter((p) => p.dependsOnAgeingPlayers).map((p) => p.position)

  const emergingWithSeniorMinutes = players.filter(
    (p) => p.level !== 'senior' && (p.lastCompletedSeason?.minutes ?? 0) >= SENIOR_MINUTES_THRESHOLD,
  ).length

  const seniorsGainingMinutes = players.filter(
    (p) => p.level === 'senior' && hasEvidence(p.id, evidence, 'playing-time-increase'),
  ).length
  const seniorsLosingMinutes = players.filter(
    (p) => p.level === 'senior' && hasEvidence(p.id, evidence, 'playing-time-decrease'),
  ).length
  const movedToStrongerLeague = players.filter((p) => hasEvidence(p.id, evidence, 'stronger-league-move')).length
  const interruptedByInjury = players.filter((p) => hasEvidence(p.id, evidence, 'injury')).length
  const potentialFutureSeniors = players.filter(
    (p) => p.level !== 'senior' && assessments[p.id] && IMPROVING_STATUSES.has(assessments[p.id].status),
  ).length

  const assessed = players
    .map((p) => assessments[p.id])
    .filter((a): a is ProgressionAssessment => a !== undefined && a.status !== 'insufficient-evidence')

  let direction: PoolOutlookResearch['direction']
  let uncertainty: string
  if (assessed.length < MIN_MEANINGFUL_ASSESSMENTS) {
    direction = 'insufficient-evidence'
    uncertainty = `Only ${assessed.length} of ${players.length} researched players had enough evidence for a directional read. Too little to characterise the pool as a whole.`
  } else {
    const weightedNet = assessed.reduce((sum, a) => {
      const sign = IMPROVING_STATUSES.has(a.status) ? 1 : a.status === 'declining' ? -1 : 0
      return sum + sign * a.confidenceScore
    }, 0)
    const netFraction = weightedNet / assessed.length
    if (netFraction > DIRECTION_THRESHOLD) direction = 'strengthening'
    else if (netFraction < -DIRECTION_THRESHOLD) direction = 'weakening'
    else direction = 'broadly-stable'
    uncertainty = `Based on ${assessed.length} of ${players.length} researched players with a directional assessment; a confidence-weighted net score of ${netFraction.toFixed(2)} against a threshold of ±${DIRECTION_THRESHOLD}. This is a qualitative read of dated evidence, not a measurement.`
  }

  const drivers: string[] = []
  if (seniorsGainingMinutes > 0) drivers.push(`${seniorsGainingMinutes} senior player(s) with sourced evidence of increased club playing time`)
  if (seniorsLosingMinutes > 0) drivers.push(`${seniorsLosingMinutes} senior player(s) with sourced evidence of reduced club playing time`)
  if (movedToStrongerLeague > 0) drivers.push(`${movedToStrongerLeague} player(s) who moved to a stronger league`)
  if (interruptedByInjury > 0) drivers.push(`${interruptedByInjury} player(s) with a sourced injury interruption`)
  if (emergingWithSeniorMinutes > 0) drivers.push(`${emergingWithSeniorMinutes} emerging player(s) already getting senior club minutes`)
  if (ageingDependentPositions.length > 0) {
    drivers.push(`${ageingDependentPositions.length} position(s) depend on players aged ${AGEING_AGE_THRESHOLD}+ with no researched emerging cover`)
  }

  return {
    direction,
    uncertainty,
    drivers,
    strongestPositions,
    weakestPositions,
    improvingDepthPositions,
    ageingDependentPositions,
    emergingWithSeniorMinutes,
    seniorsGainingMinutes,
    seniorsLosingMinutes,
    movedToStrongerLeague,
    interruptedByInjury,
    potentialFutureSeniors,
    byPosition,
  }
}
