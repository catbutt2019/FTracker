import { describe, expect, it } from 'vitest'
import type { EvidenceItem, ResearchPlayer, ResearchSource } from '@/types/research'
import { buildProgressionAssessment } from '../researchAssessment'

const RESEARCH_DATE = '2026-08-20'

function player(overrides: Partial<ResearchPlayer> = {}): ResearchPlayer {
  return {
    id: 'test-player',
    fullName: 'Test Player',
    dateOfBirth: '2003-01-01',
    age: 23,
    primaryPosition: 'CM',
    secondaryPositions: [],
    club: 'Test FC',
    league: 'Championship',
    clubVerifiedForSeason: '2026-27',
    level: 'senior',
    eligibilityBasis: 'Born in Dublin',
    eligibilityStanding: 'capped-senior',
    caps: 5,
    goalsForIreland: 0,
    disambiguation: null,
    lastCompletedSeason: {
      season: '2025-26',
      club: 'Test FC',
      league: 'Championship',
      appearances: 30,
      starts: 28,
      minutes: 2500,
      goals: 2,
      assists: 3,
    },
    previousSeason: null,
    involvement: 'starting',
    loanStatus: null,
    recentTransfer: null,
    injuryNote: null,
    internationalInvolvement: 'Capped in March 2026 play-off',
    unverified: [],
    lastResearchedDate: RESEARCH_DATE,
    ...overrides,
  }
}

function source(overrides: Partial<ResearchSource> = {}): ResearchSource {
  return {
    id: 'src-1',
    title: 'Test article',
    publisher: 'Test Publisher',
    url: 'https://example.com/article',
    kind: 'national-press',
    reliability: 'high',
    accessedDate: RESEARCH_DATE,
    accessNote: null,
    ...overrides,
  }
}

function evidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: 'ev-1',
    playerId: 'test-player',
    category: 'playing-time-increase',
    claim: 'Started seven of the last ten league matches.',
    interpretation: 'Regular recent starts are moderate evidence of positive progression.',
    sourceId: 'src-1',
    publishedDate: '2026-08-01',
    accessedDate: RESEARCH_DATE,
    primaryOrSecondary: 'primary',
    corroboratedBy: [],
    contradictedBy: [],
    notes: null,
    ...overrides,
  }
}

describe('buildProgressionAssessment', () => {
  it('always returns probabilities that sum to exactly 100', () => {
    const cases: [ResearchPlayer, EvidenceItem[], ResearchSource[]][] = [
      [player(), [], []],
      [player(), [evidence()], [source()]],
      [
        player(),
        [evidence({ category: 'loss-of-squad-place' }), evidence({ id: 'ev-2', category: 'injury' })],
        [source()],
      ],
    ]
    for (const [p, ev, src] of cases) {
      const result = buildProgressionAssessment({ player: p, evidence: ev, sources: src, researchDate: RESEARCH_DATE })
      expect(result.positiveProbability + result.stableProbability + result.declineProbability).toBe(100)
    }
  })

  it('reports insufficient evidence when nothing directional was found, not stable or declining', () => {
    const result = buildProgressionAssessment({
      player: player(),
      evidence: [],
      sources: [],
      researchDate: RESEARCH_DATE,
    })
    expect(result.status).toBe('insufficient-evidence')
    expect(result.confidence).toBe('low')
  })

  it('does not treat a neutral-only evidence set as directional', () => {
    // Eligibility confirmation and a contract update describe the player's
    // situation but say nothing about whether they are progressing.
    const result = buildProgressionAssessment({
      player: player(),
      evidence: [
        evidence({ id: 'ev-1', category: 'eligibility-confirmation' }),
        evidence({ id: 'ev-2', category: 'contract-development' }),
      ],
      sources: [source()],
      researchDate: RESEARCH_DATE,
    })
    expect(result.status).toBe('insufficient-evidence')
  })

  it('leans improving when positive evidence dominates', () => {
    const result = buildProgressionAssessment({
      player: player(),
      evidence: [
        evidence({ id: 'ev-1', category: 'playing-time-increase' }),
        evidence({ id: 'ev-2', category: 'stronger-league-move' }),
        evidence({ id: 'ev-3', category: 'improved-performance' }),
      ],
      sources: [source()],
      researchDate: RESEARCH_DATE,
    })
    expect(result.status).toBe('improving')
    expect(result.positiveProbability).toBeGreaterThan(result.declineProbability)
  })

  it('leans declining when negative evidence dominates', () => {
    const result = buildProgressionAssessment({
      player: player(),
      evidence: [
        evidence({ id: 'ev-1', category: 'loss-of-squad-place' }),
        evidence({ id: 'ev-2', category: 'weaker-league-move' }),
        evidence({ id: 'ev-3', category: 'reduced-performance' }),
      ],
      sources: [source()],
      researchDate: RESEARCH_DATE,
    })
    expect(result.status).toBe('declining')
    expect(result.declineProbability).toBeGreaterThan(result.positiveProbability)
  })

  it('stays stable when positive and negative evidence roughly balance', () => {
    const result = buildProgressionAssessment({
      player: player(),
      evidence: [
        evidence({ id: 'ev-1', category: 'playing-time-increase' }),
        evidence({ id: 'ev-2', category: 'playing-time-decrease' }),
      ],
      sources: [source()],
      researchDate: RESEARCH_DATE,
    })
    expect(result.status).toBe('stable')
  })

  it('labels a non-senior breakthrough as emerging rather than plain improving', () => {
    const result = buildProgressionAssessment({
      player: player({ level: 'u21', id: 'young-player' }),
      evidence: [evidence({ playerId: 'young-player', category: 'first-team-breakthrough' })],
      sources: [source()],
      researchDate: RESEARCH_DATE,
    })
    expect(result.status).toBe('emerging')
  })

  it('does not label a senior player emerging even with breakthrough-shaped evidence', () => {
    const result = buildProgressionAssessment({
      player: player({ level: 'senior' }),
      evidence: [evidence({ category: 'first-team-breakthrough' })],
      sources: [source()],
      researchDate: RESEARCH_DATE,
    })
    expect(result.status).not.toBe('emerging')
  })

  it('does not let age alone create a status when there is no directional evidence', () => {
    // Regression guard for an explicit brief requirement: youth must not imply
    // improvement and age must not imply decline, on their own.
    const young = buildProgressionAssessment({
      player: player({ age: 19, id: 'young' }),
      evidence: [],
      sources: [],
      researchDate: RESEARCH_DATE,
    })
    const old = buildProgressionAssessment({
      player: player({ age: 34, id: 'old' }),
      evidence: [],
      sources: [],
      researchDate: RESEARCH_DATE,
    })
    expect(young.status).toBe('insufficient-evidence')
    expect(old.status).toBe('insufficient-evidence')
  })

  it('reduces confidence when all evidence comes from a single source', () => {
    const singleSource = buildProgressionAssessment({
      player: player(),
      evidence: [
        evidence({ id: 'ev-1', sourceId: 'src-1' }),
        evidence({ id: 'ev-2', sourceId: 'src-1', category: 'improved-performance' }),
      ],
      sources: [source()],
      researchDate: RESEARCH_DATE,
    })
    const twoSources = buildProgressionAssessment({
      player: player(),
      evidence: [
        evidence({ id: 'ev-1', sourceId: 'src-1' }),
        evidence({ id: 'ev-2', sourceId: 'src-2', category: 'improved-performance' }),
      ],
      sources: [source({ id: 'src-1' }), source({ id: 'src-2', publisher: 'Other Publisher' })],
      researchDate: RESEARCH_DATE,
    })
    expect(twoSources.confidenceScore).toBeGreaterThan(singleSource.confidenceScore)
  })

  it('reduces confidence when a claim is contradicted', () => {
    const contested = buildProgressionAssessment({
      player: player(),
      evidence: [evidence({ contradictedBy: ['ev-2'] })],
      sources: [source()],
      researchDate: RESEARCH_DATE,
    })
    const uncontested = buildProgressionAssessment({
      player: player(),
      evidence: [evidence()],
      sources: [source()],
      researchDate: RESEARCH_DATE,
    })
    expect(contested.confidenceScore).toBeLessThan(uncontested.confidenceScore)
  })

  it('reduces confidence for older evidence than for recent evidence', () => {
    const recent = buildProgressionAssessment({
      player: player(),
      evidence: [evidence({ publishedDate: '2026-08-01' })],
      sources: [source()],
      researchDate: RESEARCH_DATE,
    })
    const old = buildProgressionAssessment({
      player: player(),
      evidence: [evidence({ publishedDate: '2024-01-01' })],
      sources: [source()],
      researchDate: RESEARCH_DATE,
    })
    expect(recent.confidenceScore).toBeGreaterThan(old.confidenceScore)
  })

  it('produces a heuristic trace whose contributions sum to the progression score', () => {
    const result = buildProgressionAssessment({
      player: player(),
      evidence: [
        evidence({ id: 'ev-1', category: 'playing-time-increase' }),
        evidence({ id: 'ev-2', category: 'injury' }),
      ],
      sources: [source()],
      researchDate: RESEARCH_DATE,
    })
    const traceSum = result.heuristicTrace.reduce((sum, t) => sum + t.contribution, 0)
    expect(traceSum).toBeCloseTo(result.progressionScore, 5)
  })

  it('only credits evidence belonging to the player being assessed', () => {
    const result = buildProgressionAssessment({
      player: player({ id: 'player-a' }),
      evidence: [
        evidence({ id: 'ev-1', playerId: 'player-a', category: 'playing-time-increase' }),
        evidence({ id: 'ev-2', playerId: 'player-b', category: 'loss-of-squad-place' }),
      ],
      sources: [source()],
      researchDate: RESEARCH_DATE,
    })
    expect(result.negativeEvidenceIds).toEqual([])
    expect(result.positiveEvidenceIds).toEqual(['ev-1'])
  })

  it('lowers confidence for a player with limited recent senior minutes', () => {
    const fewMinutes = buildProgressionAssessment({
      player: player({
        lastCompletedSeason: {
          season: '2025-26',
          club: 'Test FC',
          league: 'Championship',
          appearances: 8,
          starts: 2,
          minutes: 200,
          goals: 0,
          assists: 0,
        },
      }),
      evidence: [evidence()],
      sources: [source()],
      researchDate: RESEARCH_DATE,
    })
    const manyMinutes = buildProgressionAssessment({
      player: player(),
      evidence: [evidence()],
      sources: [source()],
      researchDate: RESEARCH_DATE,
    })
    expect(fewMinutes.confidenceScore).toBeLessThan(manyMinutes.confidenceScore)
  })

  it('records missing information about unverified fields and unconfirmed club season', () => {
    const result = buildProgressionAssessment({
      player: player({ unverified: ['Minutes for 2025-26 could not be confirmed'], clubVerifiedForSeason: '2025-26' }),
      evidence: [evidence()],
      sources: [source()],
      researchDate: RESEARCH_DATE,
    })
    expect(result.missingInformation).toContain('Minutes for 2025-26 could not be confirmed')
    expect(result.missingInformation.some((m) => m.includes('2025-26'))).toBe(true)
  })
})
