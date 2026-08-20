import { describe, expect, it } from 'vitest'
import { POSITIONS } from '@/types/domain'
import type { EvidenceItem, ProgressionAssessment, ResearchPlayer } from '@/types/research'
import { buildResearchOutlook } from '../researchOutlook'

function player(overrides: Partial<ResearchPlayer>): ResearchPlayer {
  return {
    id: overrides.id ?? 'p',
    fullName: 'Player',
    dateOfBirth: null,
    age: 25,
    primaryPosition: 'CM',
    secondaryPositions: [],
    club: 'Club',
    league: 'League',
    clubVerifiedForSeason: '2026-27',
    level: 'senior',
    eligibilityBasis: 'Born in Ireland',
    eligibilityStanding: 'capped-senior',
    caps: 1,
    goalsForIreland: 0,
    disambiguation: null,
    lastCompletedSeason: null,
    previousSeason: null,
    involvement: 'starting',
    loanStatus: null,
    recentTransfer: null,
    injuryNote: null,
    internationalInvolvement: null,
    unverified: [],
    lastResearchedDate: '2026-08-20',
    ...overrides,
  }
}

function assessment(overrides: Partial<ProgressionAssessment>): ProgressionAssessment {
  return {
    playerId: overrides.playerId ?? 'p',
    status: 'stable',
    positiveProbability: 33,
    stableProbability: 34,
    declineProbability: 33,
    confidence: 'moderate',
    confidenceScore: 0.5,
    explanation: '',
    positiveEvidenceIds: [],
    negativeEvidenceIds: [],
    missingInformation: [],
    progressionScore: 0,
    heuristicTrace: [],
    ...overrides,
  }
}

describe('buildResearchOutlook', () => {
  it('covers every position, even ones with no researched players', () => {
    const outlook = buildResearchOutlook([], [], {})
    expect(outlook.byPosition).toHaveLength(POSITIONS.length)
    expect(outlook.byPosition.every((p) => p.assessment === 'insufficient-evidence')).toBe(true)
    expect(outlook.direction).toBe('insufficient-evidence')
  })

  it('calls the pool direction insufficient-evidence below the meaningful-assessment floor', () => {
    const players = [player({ id: 'a' }), player({ id: 'b' })]
    const assessments = {
      a: assessment({ playerId: 'a', status: 'improving' }),
      b: assessment({ playerId: 'b', status: 'improving' }),
    }
    const outlook = buildResearchOutlook(players, [], assessments)
    expect(outlook.direction).toBe('insufficient-evidence')
  })

  it('calls the pool strengthening when confident positive assessments dominate', () => {
    const players = Array.from({ length: 6 }, (_, i) => player({ id: `p${i}` }))
    const assessments: Record<string, ProgressionAssessment> = {}
    for (const p of players) {
      assessments[p.id] = assessment({ playerId: p.id, status: 'improving', confidenceScore: 0.8 })
    }
    const outlook = buildResearchOutlook(players, [], assessments)
    expect(outlook.direction).toBe('strengthening')
  })

  it('flags a position as thinning when its senior players are old with no emerging cover', () => {
    const players = [
      player({ id: 'a', primaryPosition: 'CB', level: 'senior', age: 32 }),
      player({ id: 'b', primaryPosition: 'CB', level: 'senior', age: 33 }),
    ]
    const outlook = buildResearchOutlook(players, [], {})
    const cb = outlook.byPosition.find((p) => p.position === 'CB')
    expect(cb?.dependsOnAgeingPlayers).toBe(true)
    expect(cb?.assessment).toBe('thinning')
    expect(outlook.ageingDependentPositions).toContain('CB')
  })

  it('does not flag ageing dependency when an emerging player is researched behind the senior options', () => {
    const players = [
      player({ id: 'a', primaryPosition: 'CB', level: 'senior', age: 32 }),
      player({ id: 'b', primaryPosition: 'CB', level: 'emerging', age: 19 }),
    ]
    const outlook = buildResearchOutlook(players, [], {})
    const cb = outlook.byPosition.find((p) => p.position === 'CB')
    expect(cb?.dependsOnAgeingPlayers).toBe(false)
  })

  it('counts emerging players with senior club minutes from lastCompletedSeason alone', () => {
    const players = [
      player({
        id: 'a',
        level: 'emerging',
        lastCompletedSeason: {
          season: '2025-26',
          club: 'Club',
          league: 'League',
          appearances: 20,
          starts: 18,
          minutes: 1500,
          goals: 1,
          assists: 1,
        },
      }),
      player({ id: 'b', level: 'emerging', lastCompletedSeason: null }),
    ]
    const outlook = buildResearchOutlook(players, [], {})
    expect(outlook.emergingWithSeniorMinutes).toBe(1)
  })

  it('derives movement counts directly from evidence categories', () => {
    const players = [player({ id: 'a', level: 'senior' }), player({ id: 'b', level: 'senior' })]
    const evidence: EvidenceItem[] = [
      {
        id: 'e1',
        playerId: 'a',
        category: 'playing-time-increase',
        claim: '',
        interpretation: null,
        sourceId: 's',
        publishedDate: null,
        accessedDate: '2026-08-20',
        primaryOrSecondary: 'primary',
        corroboratedBy: [],
        contradictedBy: [],
        notes: null,
      },
      {
        id: 'e2',
        playerId: 'b',
        category: 'injury',
        claim: '',
        interpretation: null,
        sourceId: 's',
        publishedDate: null,
        accessedDate: '2026-08-20',
        primaryOrSecondary: 'primary',
        corroboratedBy: [],
        contradictedBy: [],
        notes: null,
      },
    ]
    const outlook = buildResearchOutlook(players, evidence, {})
    expect(outlook.seniorsGainingMinutes).toBe(1)
    expect(outlook.interruptedByInjury).toBe(1)
    expect(outlook.seniorsLosingMinutes).toBe(0)
  })

  it('never claims a strongest and weakest position that do not exist among the nine positions', () => {
    const outlook = buildResearchOutlook([player({ id: 'a', primaryPosition: 'ST' })], [], {})
    for (const position of [...outlook.strongestPositions, ...outlook.weakestPositions]) {
      expect(POSITIONS).toContain(position)
    }
  })
})
