/**
 * The documented heuristic behind the research snapshot's progression
 * assessments.
 *
 * This is not the statistical model in `forecast.ts` — there is no percentile
 * data behind a web-research snapshot, so there is nothing to regress or
 * project. What there is instead is a set of dated, sourced claims, and this
 * module turns those into a score by a fixed, inspectable arithmetic: every
 * evidence item contributes a signed number of points, every contribution is
 * recorded in `heuristicTrace`, and the three probabilities are read off the
 * sum. A user can add up the trace themselves and get the same answer the
 * interface shows.
 *
 * Two things this heuristic deliberately does NOT do, because the brief rules
 * them out explicitly:
 *  - it never treats youth alone as evidence of improvement, or age alone as
 *    evidence of decline — the age-curve factor is capped small enough that it
 *    can nudge a score but never manufacture a status on its own;
 *  - it never treats an absence of news as evidence of decline — a player
 *    with zero relevant evidence gets `insufficient-evidence`, not `stable`
 *    and not `declining`.
 */

import type { Position } from '@/types/domain'
import type {
  EvidenceCategory,
  EvidenceItem,
  HeuristicFactor,
  ProgressionAssessment,
  ProgressionStatus,
  ResearchPlayer,
  ResearchSource,
} from '@/types/research'
import { EVIDENCE_DIRECTION } from '@/types/research'
import { ageMultiplier, peakAgeFor } from './ageCurve'
import { changeProbabilities } from './forecast'
import { clamp, round } from './math'

/**
 * How many points a single item in this category is worth at full strength
 * (published recently, from a highly-reliable primary source). Neutral
 * categories score 0 because they describe a fact about the player's
 * situation rather than a direction of travel — a transfer or an eligibility
 * confirmation is not itself progress or regress.
 */
export const EVIDENCE_CATEGORY_WEIGHT: Record<EvidenceCategory, number> = {
  'playing-time-increase': 8,
  'playing-time-decrease': 8,
  'stronger-league-move': 10,
  'weaker-league-move': 10,
  'first-team-breakthrough': 12,
  'successful-loan': 7,
  'unsuccessful-loan': 7,
  'improved-performance': 9,
  'reduced-performance': 9,
  injury: 6,
  'return-from-injury': 5,
  'senior-call-up': 10,
  'u21-progression': 5,
  'loss-of-squad-place': 10,
  'position-change': 0,
  'contract-development': 0,
  'transfer-development': 0,
  'eligibility-confirmation': 0,
}

/** Emerging status is only ever available to non-senior players. */
const EMERGING_SIGNAL_CATEGORIES: ReadonlySet<EvidenceCategory> = new Set([
  'first-team-breakthrough',
  'senior-call-up',
  'u21-progression',
])

export const RESEARCH_HEURISTIC_CONFIG = {
  /** Points either side of zero treated as "no real movement". */
  stableBandPoints: 4,
  /** Standard deviation of the probability split at full (1.0) confidence. */
  minSigma: 6,
  /** Standard deviation at zero confidence — wide, because there is nothing to go on. */
  maxSigma: 15,
  /** Age-curve nudge is capped at this many points either way, so it can never dominate. */
  maxAgeEffectPoints: 2,
  /** Below this confidence score, status collapses to a plain "insufficient evidence" read. */
  confidenceThresholds: { moderate: 0.4, high: 0.7 },
} as const

function monthsBetween(earlier: string | null, later: string): number {
  if (!earlier) return 36 // Treat an unknown date as old, not as recent.
  const from = new Date(earlier).getTime()
  const to = new Date(later).getTime()
  if (Number.isNaN(from) || Number.isNaN(to)) return 36
  return Math.max(0, (to - from) / (1000 * 60 * 60 * 24 * 30.44))
}

/** Older evidence carries less weight — a fact about last season fades in relevance. */
function recencyFactor(publishedDate: string | null, researchDate: string): number {
  const age = monthsBetween(publishedDate, researchDate)
  if (age <= 3) return 1
  if (age <= 6) return 0.85
  if (age <= 12) return 0.65
  if (age <= 24) return 0.4
  return 0.25
}

const RELIABILITY_FACTOR: Record<ResearchSource['reliability'], number> = {
  high: 1,
  medium: 0.75,
  low: 0.5,
}

function sourceFor(item: EvidenceItem, sources: ResearchSource[]): ResearchSource | undefined {
  return sources.find((s) => s.id === item.sourceId)
}

/**
 * A single evidence item's signed contribution to the progression score.
 *
 * `null` reliability (source not found) is treated as low — a claim without a
 * traceable source should never carry full weight.
 */
function evidenceContribution(
  item: EvidenceItem,
  sources: ResearchSource[],
  researchDate: string,
): number {
  const direction = EVIDENCE_DIRECTION[item.category]
  if (direction === 'neutral') return 0
  const sign = direction === 'positive' ? 1 : -1
  const base = EVIDENCE_CATEGORY_WEIGHT[item.category]
  const source = sourceFor(item, sources)
  const reliability = source ? RELIABILITY_FACTOR[source.reliability] : RELIABILITY_FACTOR.low
  const recency = recencyFactor(item.publishedDate, researchDate)
  const primary = item.primaryOrSecondary === 'primary' ? 1 : 0.8
  // A contradicted claim is not thrown away — a reader should still see it —
  // but it should not push the score as hard as an uncontested one.
  const contested = item.contradictedBy.length > 0 ? 0.6 : 1
  return sign * base * reliability * recency * primary * contested
}

/**
 * Small, capped nudge from the positional age curve. Deliberately weak: it
 * describes a prior about the shape of a typical career, not a finding about
 * this player, and the brief is explicit that age alone must never manufacture
 * a status.
 */
function ageCurveContribution(
  position: Position,
  age: number | null,
  hasDirectionalEvidence: boolean,
): { contribution: number; observed: string } {
  if (age === null) {
    return { contribution: 0, observed: 'Date of birth not verified — age curve not applied.' }
  }
  const now = ageMultiplier(position, age)
  const oneYearOn = ageMultiplier(position, age + 1)
  const slope = oneYearOn - now // negative once past peak
  const peak = peakAgeFor(position)
  // Only let the curve nudge a score that evidence has already pointed
  // somewhere — on its own it should not turn silence into a verdict.
  if (!hasDirectionalEvidence) {
    return {
      contribution: 0,
      observed: `Age ${age} against a typical peak of ${peak} for the position — not applied without other directional evidence.`,
    }
  }
  const raw = slope * 40 // scale a ~1-2%/year slope into low single-digit points
  const contribution = clamp(raw, -RESEARCH_HEURISTIC_CONFIG.maxAgeEffectPoints, RESEARCH_HEURISTIC_CONFIG.maxAgeEffectPoints)
  const phase = age < peak ? 'before the typical peak age' : age > peak ? 'past the typical peak age' : 'at the typical peak age'
  return {
    contribution: round(contribution, 2),
    observed: `Age ${age} is ${phase} (${peak}) for ${position}.`,
  }
}

/**
 * Confidence in the assessment, 0-1.
 *
 * Every reduction here corresponds to a rule from the brief: unverifiable
 * statistics, single-source evidence, disagreement between sources, a recent
 * club change, and thin senior minutes all reduce confidence rather than
 * blocking an assessment outright.
 */
function computeConfidence(
  player: ResearchPlayer,
  relevantEvidence: EvidenceItem[],
  sources: ResearchSource[],
  researchDate: string,
): { score: number; reasons: string[] } {
  const reasons: string[] = []
  if (relevantEvidence.length === 0) return { score: 0, reasons: ['No directional evidence found.'] }

  // Saturating count term: 1 item is thin, 4+ is as good as this model gets.
  const countTerm = 1 - Math.exp(-relevantEvidence.length / 3)

  const avgRecency =
    relevantEvidence.reduce((sum, e) => sum + recencyFactor(e.publishedDate, researchDate), 0) /
    relevantEvidence.length

  const avgReliability =
    relevantEvidence.reduce((sum, e) => {
      const source = sourceFor(e, sources)
      return sum + (source ? RELIABILITY_FACTOR[source.reliability] : RELIABILITY_FACTOR.low)
    }, 0) / relevantEvidence.length

  const distinctSources = new Set(relevantEvidence.map((e) => e.sourceId)).size
  if (distinctSources === 1 && relevantEvidence.length > 1) {
    reasons.push('All evidence traces back to a single source.')
  }
  const sourceDiversityTerm = distinctSources === 1 ? 0.6 : 1

  const contradicted = relevantEvidence.some((e) => e.contradictedBy.length > 0)
  if (contradicted) reasons.push('At least one claim is contradicted by another source.')
  const contradictionTerm = contradicted ? 0.7 : 1

  if (player.unverified.length > 0) {
    reasons.push(`${player.unverified.length} field(s) could not be verified.`)
  }
  const unverifiedTerm = clamp(1 - player.unverified.length * 0.08, 0.5, 1)

  if (player.recentTransfer) {
    reasons.push('Player changed club recently, so current-club evidence is still settling.')
  }
  const transferTerm = player.recentTransfer ? 0.85 : 1

  const lastSeasonMinutes = player.lastCompletedSeason?.minutes ?? null
  if (lastSeasonMinutes !== null && lastSeasonMinutes < 450) {
    reasons.push('Limited senior minutes in the last completed season.')
  }
  const minutesTerm = lastSeasonMinutes !== null && lastSeasonMinutes < 450 ? 0.85 : 1

  if (avgRecency < 0.5) reasons.push('Most evidence is more than a year old.')

  const score = clamp(
    countTerm *
      (0.4 + 0.6 * avgReliability) *
      (0.5 + 0.5 * avgRecency) *
      sourceDiversityTerm *
      contradictionTerm *
      unverifiedTerm *
      transferTerm *
      minutesTerm,
    0,
    1,
  )
  return { score: round(score, 3), reasons }
}

function confidenceLabel(score: number): 'low' | 'moderate' | 'high' {
  if (score >= RESEARCH_HEURISTIC_CONFIG.confidenceThresholds.high) return 'high'
  if (score >= RESEARCH_HEURISTIC_CONFIG.confidenceThresholds.moderate) return 'moderate'
  return 'low'
}

function sigmaFor(confidenceScore: number): number {
  const { minSigma, maxSigma } = RESEARCH_HEURISTIC_CONFIG
  return maxSigma - confidenceScore * (maxSigma - minSigma)
}

function statusFor(
  progressionScore: number,
  confidenceScore: number,
  player: ResearchPlayer,
  relevantEvidence: EvidenceItem[],
): ProgressionStatus {
  if (relevantEvidence.length === 0 || confidenceScore === 0) return 'insufficient-evidence'

  const isEmergingCandidate =
    player.level !== 'senior' &&
    relevantEvidence.some(
      (e) => EMERGING_SIGNAL_CATEGORIES.has(e.category) && EVIDENCE_DIRECTION[e.category] !== 'negative',
    )
  if (isEmergingCandidate && progressionScore >= 0) return 'emerging'

  const band = RESEARCH_HEURISTIC_CONFIG.stableBandPoints
  if (progressionScore > band) return 'improving'
  if (progressionScore < -band) return 'declining'
  return 'stable'
}

function explanationFor(
  status: ProgressionStatus,
  confidence: 'low' | 'moderate' | 'high',
  player: ResearchPlayer,
  positive: EvidenceItem[],
  negative: EvidenceItem[],
): string {
  const name = player.fullName
  if (status === 'insufficient-evidence') {
    return `No sourced evidence of a change in ${name}'s situation was found in this research pass. This is not evidence of decline — it means the research did not turn up a relevant claim either way.`
  }
  const lead: Record<ProgressionStatus, string> = {
    improving: `${name} shows more positive than negative evidence`,
    declining: `${name} shows more negative than positive evidence`,
    stable: `${name}'s positive and negative evidence roughly balance`,
    emerging: `${name} is a non-senior player with recent evidence of breaking into first-team or international football`,
    'insufficient-evidence': '',
  }
  const positiveNote = positive.length > 0 ? `${positive.length} positive item(s)` : 'no positive items'
  const negativeNote = negative.length > 0 ? `${negative.length} negative item(s)` : 'no negative items'
  return `${lead[status]} (${positiveNote}, ${negativeNote}). Confidence is ${confidence}.`
}

export interface BuildAssessmentInput {
  player: ResearchPlayer
  evidence: EvidenceItem[]
  sources: ResearchSource[]
  researchDate: string
}

export function buildProgressionAssessment({
  player,
  evidence,
  sources,
  researchDate,
}: BuildAssessmentInput): ProgressionAssessment {
  const playerEvidence = evidence.filter((e) => e.playerId === player.id)
  const relevantEvidence = playerEvidence.filter((e) => EVIDENCE_DIRECTION[e.category] !== 'neutral')

  const trace: HeuristicFactor[] = []

  for (const item of playerEvidence) {
    const contribution = round(evidenceContribution(item, sources, researchDate), 2)
    trace.push({
      factor: `Evidence: ${item.category}`,
      observed: item.claim,
      contribution,
    })
  }

  const { contribution: ageContribution, observed: ageObserved } = ageCurveContribution(
    player.primaryPosition,
    player.age,
    relevantEvidence.length > 0,
  )
  trace.push({ factor: 'Positional age curve', observed: ageObserved, contribution: ageContribution })

  const progressionScore = round(trace.reduce((sum, t) => sum + t.contribution, 0), 2)

  const { score: confidenceScore, reasons: confidenceReasons } = computeConfidence(
    player,
    relevantEvidence,
    sources,
    researchDate,
  )
  const confidence = confidenceLabel(confidenceScore)

  const status = statusFor(progressionScore, confidenceScore, player, relevantEvidence)

  const split =
    status === 'insufficient-evidence'
      ? { improve: 34, stable: 33, decline: 33 }
      : changeProbabilities(progressionScore, sigmaFor(confidenceScore), RESEARCH_HEURISTIC_CONFIG.stableBandPoints)

  const positiveEvidence = relevantEvidence.filter((e) => EVIDENCE_DIRECTION[e.category] === 'positive')
  const negativeEvidence = relevantEvidence.filter((e) => EVIDENCE_DIRECTION[e.category] === 'negative')

  const missingInformation = [...player.unverified]
  if (relevantEvidence.length === 0) {
    missingInformation.push('No directional evidence (playing time, form, level change, injury or call-up) was found.')
  }
  if (player.clubVerifiedForSeason !== '2026-27') {
    missingInformation.push(`Current club confirmed only for ${player.clubVerifiedForSeason}, not the 2026-27 season.`)
  }

  return {
    playerId: player.id,
    status,
    positiveProbability: split.improve,
    stableProbability: split.stable,
    declineProbability: split.decline,
    confidence,
    confidenceScore,
    explanation: explanationFor(status, confidence, player, positiveEvidence, negativeEvidence),
    positiveEvidenceIds: positiveEvidence.map((e) => e.id),
    negativeEvidenceIds: negativeEvidence.map((e) => e.id),
    missingInformation: [...missingInformation, ...confidenceReasons],
    progressionScore,
    heuristicTrace: trace,
  }
}

export function buildAllAssessments(
  players: ResearchPlayer[],
  evidence: EvidenceItem[],
  sources: ResearchSource[],
  researchDate: string,
): Record<string, ProgressionAssessment> {
  const result: Record<string, ProgressionAssessment> = {}
  for (const player of players) {
    result[player.id] = buildProgressionAssessment({ player, evidence, sources, researchDate })
  }
  return result
}
