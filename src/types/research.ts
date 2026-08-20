/**
 * Schema for the researched snapshot.
 *
 * This is a separate tier from `domain.ts` on purpose. `domain.ts` describes a
 * statistical feed — dense per-90 metrics that support percentile ranking.
 * What a web-research exercise actually yields is sparse, cited, and often
 * qualitative: a handful of verified numbers per player plus a set of claims
 * with URLs attached. Forcing that into the statistical schema would mean
 * inventing the metrics it does not contain.
 *
 * So the research snapshot keeps its own shape, and its assessments are
 * derived from a documented heuristic over evidence items rather than from the
 * percentile model. The two are not interchangeable and the interface labels
 * which one it is showing.
 */

import type { Position } from './domain'

/* ------------------------------------------------------------------ *
 * Sources
 * ------------------------------------------------------------------ */

export const SOURCE_KINDS = [
  'governing-body',
  'club-official',
  'league-official',
  'major-broadcaster',
  'national-press',
  'regional-press',
  'statistics',
  'reference',
] as const

export type SourceKind = (typeof SOURCE_KINDS)[number]

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  'governing-body': 'Governing body',
  'club-official': 'Official club',
  'league-official': 'Official league',
  'major-broadcaster': 'Major broadcaster',
  'national-press': 'National press',
  'regional-press': 'Regional press',
  statistics: 'Statistics provider',
  reference: 'Reference work',
}

export type SourceReliability = 'high' | 'medium' | 'low'

export interface ResearchSource {
  id: string
  title: string
  publisher: string
  /** Direct article URL. Search-result URLs are rejected by the validator. */
  url: string
  kind: SourceKind
  reliability: SourceReliability
  accessedDate: string
  /** Set when the page was blocked, paywalled or only partly readable. */
  accessNote: string | null
}

/* ------------------------------------------------------------------ *
 * Evidence
 * ------------------------------------------------------------------ */

export const EVIDENCE_CATEGORIES = [
  'playing-time-increase',
  'playing-time-decrease',
  'stronger-league-move',
  'weaker-league-move',
  'first-team-breakthrough',
  'successful-loan',
  'unsuccessful-loan',
  'improved-performance',
  'reduced-performance',
  'injury',
  'return-from-injury',
  'senior-call-up',
  'u21-progression',
  'loss-of-squad-place',
  'position-change',
  'contract-development',
  'transfer-development',
  'eligibility-confirmation',
] as const

export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number]

export const EVIDENCE_CATEGORY_LABELS: Record<EvidenceCategory, string> = {
  'playing-time-increase': 'Playing time increased',
  'playing-time-decrease': 'Playing time decreased',
  'stronger-league-move': 'Move to a stronger league',
  'weaker-league-move': 'Move to a weaker league',
  'first-team-breakthrough': 'First-team breakthrough',
  'successful-loan': 'Successful loan',
  'unsuccessful-loan': 'Unsuccessful loan',
  'improved-performance': 'Improved performance',
  'reduced-performance': 'Reduced performance',
  injury: 'Injury',
  'return-from-injury': 'Return from injury',
  'senior-call-up': 'Senior call-up',
  'u21-progression': 'Under-21 progression',
  'loss-of-squad-place': 'Lost squad place',
  'position-change': 'Position change',
  'contract-development': 'Contract development',
  'transfer-development': 'Transfer development',
  'eligibility-confirmation': 'Eligibility confirmed',
}

/**
 * Which way a category points, before any player-specific reading.
 *
 * Fixed per category rather than per item so that the direction cannot be
 * quietly tuned to produce a nicer-looking assessment. `neutral` categories
 * carry information about certainty and context but do not push the
 * probabilities either way.
 */
export const EVIDENCE_DIRECTION: Record<EvidenceCategory, 'positive' | 'negative' | 'neutral'> = {
  'playing-time-increase': 'positive',
  'playing-time-decrease': 'negative',
  'stronger-league-move': 'positive',
  'weaker-league-move': 'negative',
  'first-team-breakthrough': 'positive',
  'successful-loan': 'positive',
  'unsuccessful-loan': 'negative',
  'improved-performance': 'positive',
  'reduced-performance': 'negative',
  injury: 'negative',
  'return-from-injury': 'positive',
  'senior-call-up': 'positive',
  'u21-progression': 'positive',
  'loss-of-squad-place': 'negative',
  'position-change': 'neutral',
  'contract-development': 'neutral',
  'transfer-development': 'neutral',
  'eligibility-confirmation': 'neutral',
}

export interface EvidenceItem {
  id: string
  playerId: string
  category: EvidenceCategory
  /**
   * A bare factual statement, e.g. "Started seven of his club's previous ten
   * league matches". Must not contain a judgement.
   */
  claim: string
  /**
   * The reading of that fact, e.g. "Regular recent starts provide moderate
   * evidence of positive progression". Kept separate so the interface can show
   * observation and inference as distinct things.
   */
  interpretation: string | null
  sourceId: string
  publishedDate: string | null
  accessedDate: string
  primaryOrSecondary: 'primary' | 'secondary'
  /** Ids of other evidence items making a compatible claim. */
  corroboratedBy: string[]
  /** Ids of other evidence items making an incompatible claim. */
  contradictedBy: string[]
  notes: string | null
}

/* ------------------------------------------------------------------ *
 * Players
 * ------------------------------------------------------------------ */

/**
 * Deliberately stricter than a generic "eligible" flag. A player who has
 * chosen Ireland is a firmer planning assumption than one who merely could,
 * and the difference should never be lost in a squad count.
 */
export type EligibilityStandingResearch =
  | 'capped-senior'
  | 'capped-youth'
  | 'committed-uncapped'
  | 'potentially-eligible-uncommitted'

export const ELIGIBILITY_STANDING_LABELS: Record<EligibilityStandingResearch, string> = {
  'capped-senior': 'Capped at senior level',
  'capped-youth': 'Capped at youth level',
  'committed-uncapped': 'Committed, not yet capped',
  'potentially-eligible-uncommitted': 'Potentially eligible, uncommitted',
}

export type ResearchLevel = 'senior' | 'u21' | 'emerging'

export type Involvement = 'starting' | 'rotating' | 'bench' | 'out-of-squad' | 'unknown'

export const INVOLVEMENT_LABELS: Record<Involvement, string> = {
  starting: 'Starting regularly',
  rotating: 'Rotating',
  bench: 'Mostly benched',
  'out-of-squad': 'Out of the squad',
  unknown: 'Not established',
}

export interface ResearchSeason {
  season: string
  club: string
  league: string
  /** `null` throughout means the figure could not be verified, never zero. */
  appearances: number | null
  starts: number | null
  minutes: number | null
  goals: number | null
  assists: number | null
}

export interface ResearchPlayer {
  id: string
  fullName: string
  dateOfBirth: string | null
  /** Age at the snapshot date. `null` when the date of birth is unverified. */
  age: number | null
  primaryPosition: Position
  secondaryPositions: Position[]
  club: string
  league: string
  /**
   * Which season the club is confirmed for. In a mid-August snapshot the
   * summer window has just closed, so a club verified only for the previous
   * season is a real caveat rather than a formality.
   */
  clubVerifiedForSeason: string
  level: ResearchLevel
  eligibilityBasis: string
  eligibilityStanding: EligibilityStandingResearch
  caps: number | null
  goalsForIreland: number | null
  /** Set when another footballer shares the name, so records are never merged. */
  disambiguation: string | null
  lastCompletedSeason: ResearchSeason | null
  previousSeason: ResearchSeason | null
  involvement: Involvement
  loanStatus: string | null
  recentTransfer: string | null
  injuryNote: string | null
  internationalInvolvement: string | null
  /** What could not be confirmed, and why. Shown in the interface verbatim. */
  unverified: string[]
  lastResearchedDate: string
}

/* ------------------------------------------------------------------ *
 * Assessment
 * ------------------------------------------------------------------ */

export type ProgressionStatus =
  | 'improving'
  | 'stable'
  | 'declining'
  | 'emerging'
  | 'insufficient-evidence'

export const PROGRESSION_STATUS_LABELS: Record<ProgressionStatus, string> = {
  improving: 'Improving',
  stable: 'Stable',
  declining: 'Declining',
  emerging: 'Emerging',
  'insufficient-evidence': 'Insufficient evidence',
}

/**
 * One line of the heuristic's working.
 *
 * Every factor the heuristic consults emits a trace row, including the ones
 * that contributed nothing. That makes the arithmetic reconstructable from the
 * interface: the sum of `contribution` is the score the probabilities came
 * from, so a user can check the assessment rather than trust it.
 */
export interface HeuristicFactor {
  factor: string
  /** What the heuristic saw, in plain language. */
  observed: string
  /** Signed points added to the progression score. */
  contribution: number
}

export interface ProgressionAssessment {
  playerId: string
  status: ProgressionStatus
  /** Integer percentages that always sum to exactly 100. */
  positiveProbability: number
  stableProbability: number
  declineProbability: number
  confidence: 'low' | 'moderate' | 'high'
  /** 0-1 continuous value behind `confidence`. */
  confidenceScore: number
  explanation: string
  positiveEvidenceIds: string[]
  negativeEvidenceIds: string[]
  missingInformation: string[]
  /** Signed total of the trace contributions. */
  progressionScore: number
  heuristicTrace: HeuristicFactor[]
}

/* ------------------------------------------------------------------ *
 * Snapshot
 * ------------------------------------------------------------------ */

export interface PositionOutlookResearch {
  position: Position
  label: string
  playerCount: number
  seniorCount: number
  emergingCount: number
  /** Mean age of players with a verified date of birth. `null` if none have one. */
  averageAge: number | null
  improvingCount: number
  decliningCount: number
  /** Set when the position leans on players aged 30 or over. */
  dependsOnAgeingPlayers: boolean
  assessment: 'improving-depth' | 'holding' | 'thinning' | 'insufficient-evidence'
  reason: string
}

export interface PoolOutlookResearch {
  direction: 'strengthening' | 'broadly-stable' | 'weakening' | 'insufficient-evidence'
  /** Plain-language statement of how wide the uncertainty is. */
  uncertainty: string
  drivers: string[]
  strongestPositions: Position[]
  weakestPositions: Position[]
  improvingDepthPositions: Position[]
  ageingDependentPositions: Position[]
  emergingWithSeniorMinutes: number
  seniorsGainingMinutes: number
  seniorsLosingMinutes: number
  movedToStrongerLeague: number
  interruptedByInjury: number
  potentialFutureSeniors: number
  byPosition: PositionOutlookResearch[]
}

/**
 * What the research files on disk actually contain: raw, sourced facts.
 *
 * Mirrors the RAW tier in `domain.ts` — no assessment or outlook lives here,
 * because those are computed, not researched, and recomputing them from this
 * data is how the methodology page can honestly describe code that runs
 * rather than a number that was baked into a JSON file by hand.
 */
export interface ResearchRawData {
  /** The date the research was carried out. Displayed, not buried. */
  researchDate: string
  label: string
  players: ResearchPlayer[]
  evidence: EvidenceItem[]
  sources: ResearchSource[]
  /** Named gaps in the research itself, surfaced on the methodology page. */
  gaps: string[]
}

/** The raw data plus everything `researchAssessment.ts` / `researchOutlook.ts` derive from it. */
export interface ResearchSnapshot extends ResearchRawData {
  assessments: Record<string, ProgressionAssessment>
  outlook: PoolOutlookResearch
}
