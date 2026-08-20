/**
 * Runtime validation for the researched snapshot.
 *
 * The research files are produced by web research, not by a schema-checked
 * pipeline, so nothing about their shape is guaranteed until it is checked.
 * This module is the single place that checks it — anything that fails
 * validation is rejected before it reaches a component, rather than causing
 * an undefined-property error three renders later.
 */

import { z } from 'zod'
import { POSITIONS } from '@/types/domain'
import { EVIDENCE_CATEGORIES, SOURCE_KINDS } from '@/types/research'

const positionSchema = z.enum(POSITIONS)
const nonEmpty = z.string().min(1)

const researchSeasonSchema = z.object({
  season: nonEmpty,
  club: nonEmpty,
  league: nonEmpty,
  appearances: z.number().int().nonnegative().nullable(),
  starts: z.number().int().nonnegative().nullable(),
  minutes: z.number().int().nonnegative().nullable(),
  goals: z.number().int().nonnegative().nullable(),
  assists: z.number().int().nonnegative().nullable(),
})

export const researchPlayerSchema = z.object({
  id: nonEmpty,
  fullName: nonEmpty,
  dateOfBirth: z.string().nullable(),
  age: z.number().nullable(),
  primaryPosition: positionSchema,
  secondaryPositions: z.array(positionSchema),
  club: nonEmpty,
  league: nonEmpty,
  clubVerifiedForSeason: nonEmpty,
  level: z.enum(['senior', 'u21', 'emerging']),
  eligibilityBasis: nonEmpty,
  eligibilityStanding: z.enum([
    'capped-senior',
    'capped-youth',
    'committed-uncapped',
    'potentially-eligible-uncommitted',
  ]),
  caps: z.number().int().nonnegative().nullable(),
  goalsForIreland: z.number().int().nonnegative().nullable(),
  disambiguation: z.string().nullable(),
  lastCompletedSeason: researchSeasonSchema.nullable(),
  previousSeason: researchSeasonSchema.nullable(),
  involvement: z.enum(['starting', 'rotating', 'bench', 'out-of-squad', 'unknown']),
  loanStatus: z.string().nullable(),
  recentTransfer: z.string().nullable(),
  injuryNote: z.string().nullable(),
  internationalInvolvement: z.string().nullable(),
  unverified: z.array(z.string()),
  lastResearchedDate: nonEmpty,
})

// A search-engine result URL tells a reader nothing they can independently
// check, so the brief requires direct source URLs. Reject the obvious cases.
const disallowedUrlHosts = ['google.', 'bing.com', 'duckduckgo.com']

export const researchSourceSchema = z.object({
  id: nonEmpty,
  title: nonEmpty,
  publisher: nonEmpty,
  url: z
    .string()
    .url()
    .refine(
      (url) => !disallowedUrlHosts.some((host) => url.includes(host)),
      'Source URL must be a direct article link, not a search-engine result',
    ),
  kind: z.enum(SOURCE_KINDS),
  reliability: z.enum(['high', 'medium', 'low']),
  accessedDate: nonEmpty,
  accessNote: z.string().nullable(),
})

export const evidenceItemSchema = z.object({
  id: nonEmpty,
  playerId: nonEmpty,
  category: z.enum(EVIDENCE_CATEGORIES),
  claim: nonEmpty,
  interpretation: z.string().nullable(),
  sourceId: nonEmpty,
  publishedDate: z.string().nullable(),
  accessedDate: nonEmpty,
  primaryOrSecondary: z.enum(['primary', 'secondary']),
  corroboratedBy: z.array(z.string()),
  contradictedBy: z.array(z.string()),
  notes: z.string().nullable(),
})

export const progressionAssessmentSchema = z.object({
  playerId: nonEmpty,
  status: z.enum(['improving', 'stable', 'declining', 'emerging', 'insufficient-evidence']),
  positiveProbability: z.number().int().min(0).max(100),
  stableProbability: z.number().int().min(0).max(100),
  declineProbability: z.number().int().min(0).max(100),
  confidence: z.enum(['low', 'moderate', 'high']),
  confidenceScore: z.number().min(0).max(1),
  explanation: nonEmpty,
  positiveEvidenceIds: z.array(z.string()),
  negativeEvidenceIds: z.array(z.string()),
  missingInformation: z.array(z.string()),
  progressionScore: z.number(),
  heuristicTrace: z.array(
    z.object({
      factor: nonEmpty,
      observed: nonEmpty,
      contribution: z.number(),
    }),
  ),
})

export const positionOutlookSchema = z.object({
  position: positionSchema,
  label: nonEmpty,
  playerCount: z.number().int().nonnegative(),
  seniorCount: z.number().int().nonnegative(),
  emergingCount: z.number().int().nonnegative(),
  averageAge: z.number().nullable(),
  improvingCount: z.number().int().nonnegative(),
  decliningCount: z.number().int().nonnegative(),
  dependsOnAgeingPlayers: z.boolean(),
  assessment: z.enum(['improving-depth', 'holding', 'thinning', 'insufficient-evidence']),
  reason: nonEmpty,
})

export const poolOutlookSchema = z.object({
  direction: z.enum(['strengthening', 'broadly-stable', 'weakening', 'insufficient-evidence']),
  uncertainty: nonEmpty,
  drivers: z.array(z.string()),
  strongestPositions: z.array(positionSchema),
  weakestPositions: z.array(positionSchema),
  improvingDepthPositions: z.array(positionSchema),
  ageingDependentPositions: z.array(positionSchema),
  emergingWithSeniorMinutes: z.number().int().nonnegative(),
  seniorsGainingMinutes: z.number().int().nonnegative(),
  seniorsLosingMinutes: z.number().int().nonnegative(),
  movedToStrongerLeague: z.number().int().nonnegative(),
  interruptedByInjury: z.number().int().nonnegative(),
  potentialFutureSeniors: z.number().int().nonnegative(),
  byPosition: z.array(positionOutlookSchema),
})

export const researchRawDataSchema = z.object({
  researchDate: nonEmpty,
  label: nonEmpty,
  players: z.array(researchPlayerSchema),
  evidence: z.array(evidenceItemSchema),
  sources: z.array(researchSourceSchema),
  gaps: z.array(z.string()),
})

export class ResearchValidationError extends Error {
  constructor(readonly issues: z.ZodIssue[]) {
    super(
      `Research snapshot failed validation:\n${issues
        .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
        .join('\n')}`,
    )
    this.name = 'ResearchValidationError'
  }
}

/**
 * Validates cross-referential integrity that zod's shape checks cannot
 * express alone: every evidence item must point at a player and a source
 * that actually exist. A dangling reference here means the merge step
 * upstream made a mistake — two IDs that were meant to match, didn't.
 */
function validateReferences(data: z.infer<typeof researchRawDataSchema>): string[] {
  const errors: string[] = []
  const playerIds = new Set(data.players.map((p) => p.id))
  const sourceIds = new Set(data.sources.map((s) => s.id))
  const evidenceIds = new Set(data.evidence.map((e) => e.id))

  for (const item of data.evidence) {
    if (!playerIds.has(item.playerId)) {
      errors.push(`evidence ${item.id} references unknown player ${item.playerId}`)
    }
    if (!sourceIds.has(item.sourceId)) {
      errors.push(`evidence ${item.id} references unknown source ${item.sourceId}`)
    }
    for (const id of [...item.corroboratedBy, ...item.contradictedBy]) {
      if (!evidenceIds.has(id)) {
        errors.push(`evidence ${item.id} references unknown evidence ${id}`)
      }
    }
  }

  return errors
}

export function parseResearchRawData(data: unknown): z.infer<typeof researchRawDataSchema> {
  const result = researchRawDataSchema.safeParse(data)
  if (!result.success) {
    throw new ResearchValidationError(result.error.issues)
  }
  const referenceErrors = validateReferences(result.data)
  if (referenceErrors.length > 0) {
    throw new ResearchValidationError(
      referenceErrors.map((message) => ({
        code: 'custom' as const,
        path: [],
        message,
      })),
    )
  }
  return result.data
}
