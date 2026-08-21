import { describe, expect, it } from 'vitest'
import type { PlayerRaw, SeasonRecord } from '@/types/domain'
import { buildCohort, reliability, scoreMetrics, scoreSeason } from '../scoring'
import { metricsFor } from '../metrics'
import realPlayersFile from '../../../research/real-players.json'

const realPlayers = realPlayersFile as unknown as PlayerRaw[]

function season(overrides: Partial<SeasonRecord> = {}): SeasonRecord {
  return {
    season: '2025-26',
    club: 'Test FC',
    league: 'Championship',
    leagueStrength: 60,
    clubStrength: 55,
    appearances: 30,
    starts: 28,
    minutes: 2500,
    minutesPercentage: 0.73,
    goals: 4,
    assists: 3,
    positionSpecificMetrics: {
      duelSuccess: 60,
      aerialSuccess: 62,
      interceptions90: 3.1,
      progressiveDistance90: 3.6,
      errors90: 0.12,
    },
    injuryDays: 0,
    ...overrides,
  }
}

function player(overrides: Partial<PlayerRaw> = {}): PlayerRaw {
  return {
    id: 'test-1',
    name: 'Test Player',
    dateOfBirth: '2001-01-01',
    nationalityStatus: 'capped-ireland',
    nationalTeamLevel: 'senior',
    primaryPosition: 'CB',
    secondaryPositions: [],
    seasons: [season()],
    currentClub: {
      club: 'Test FC',
      league: 'Championship',
      leagueStrength: 60,
      changedSinceLastSeason: false,
      transferNote: null,
    },
    seniorStatus: {
      seniorCaps: 0,
      seniorStarts: null,
      competitiveSeniorStarts: null,
      seniorMinutes: null,
      seniorMinutesLast12Months: null,
      lastSeniorAppearanceDate: null,
      lastSeniorStartDate: null,
      recentSquadCallups: null,
      clubMinutesLast12Months: null,
      clubCompetitionLevel: 60,
      availabilityStatus: null,
    },
    internationalCaps: 5,
    internationalMinutes: 300,
    dataLastUpdated: '2026-08-20',
    ...overrides,
  }
}

/** A spread of defenders so percentiles have something real to rank against. */
function defenderCohort() {
  const players: PlayerRaw[] = [0.2, 0.4, 0.5, 0.6, 0.8].map((level, index) =>
    player({
      id: `cohort-${index}`,
      seasons: [
        season({
          positionSpecificMetrics: {
            duelSuccess: 44 + level * 29,
            aerialSuccess: 38 + level * 41,
            interceptions90: 1.1 + level * 4.1,
            progressiveDistance90: 1.4 + level * 4.8,
            errors90: 0.38 - level * 0.36,
          },
        }),
      ],
    }),
  )
  return buildCohort(players)
}

describe('scoreSeason', () => {
  it('scores a strong season above a weak one', () => {
    const cohort = defenderCohort()
    const weak = scoreSeason(
      season({
        positionSpecificMetrics: {
          duelSuccess: 45,
          aerialSuccess: 39,
          interceptions90: 1.2,
          progressiveDistance90: 1.5,
          errors90: 0.36,
        },
      }),
      'defender',
      cohort,
    )
    const strong = scoreSeason(
      season({
        positionSpecificMetrics: {
          duelSuccess: 72,
          aerialSuccess: 78,
          interceptions90: 5.1,
          progressiveDistance90: 6.1,
          errors90: 0.02,
        },
      }),
      'defender',
      cohort,
    )
    expect(strong.rawScore).toBeGreaterThan(weak.rawScore)
  })

  it('inverts metrics where a lower value is better', () => {
    const cohort = defenderCohort()
    const base = {
      duelSuccess: 58,
      aerialSuccess: 58,
      interceptions90: 3,
      progressiveDistance90: 3.5,
    }
    const fewErrors = scoreSeason(
      season({ positionSpecificMetrics: { ...base, errors90: 0.02 } }),
      'defender',
      cohort,
    )
    const manyErrors = scoreSeason(
      season({ positionSpecificMetrics: { ...base, errors90: 0.38 } }),
      'defender',
      cohort,
    )
    expect(fewErrors.rawScore).toBeGreaterThan(manyErrors.rawScore)
  })

  it('reports missing metrics instead of substituting a value for them', () => {
    const cohort = defenderCohort()
    const result = scoreSeason(
      season({
        positionSpecificMetrics: {
          duelSuccess: 60,
          aerialSuccess: null,
          interceptions90: 3.1,
          tackles90: 1.9,
          clearances90: null,
          progressiveDistance90: null,
          errors90: 0.12,
          goalInvolvement90: 0.2,
        },
      }),
      'defender',
      cohort,
    )
    expect(result.missingMetrics).toEqual([
      'aerialSuccess',
      'clearances90',
      'progressiveDistance90',
    ])
    expect(result.metricCoverage).toBeLessThan(1)
    expect(result.metricCoverage).toBeGreaterThan(0)
  })

  it('renormalises the remaining weights so a sparse season is not dragged toward zero', () => {
    const cohort = defenderCohort()
    const full = scoreSeason(
      season({
        positionSpecificMetrics: {
          duelSuccess: 72,
          aerialSuccess: 78,
          interceptions90: 5.1,
          progressiveDistance90: 6.1,
          errors90: 0.02,
        },
      }),
      'defender',
      cohort,
    )
    const sparse = scoreSeason(
      season({
        positionSpecificMetrics: {
          duelSuccess: 72,
          aerialSuccess: null,
          interceptions90: null,
          progressiveDistance90: null,
          errors90: null,
        },
      }),
      'defender',
      cohort,
    )
    // Both are top-of-cohort on the metrics that exist, so the scores should be
    // comparable. Only the reported coverage differs.
    expect(Math.abs(sparse.rawScore - full.rawScore)).toBeLessThan(20)
    expect(sparse.metricCoverage).toBeLessThan(full.metricCoverage)
  })

  const NO_METRICS = {
    duelSuccess: null,
    aerialSuccess: null,
    interceptions90: null,
    tackles90: null,
    clearances90: null,
    progressiveDistance90: null,
    errors90: null,
    goalInvolvement90: null,
  }

  it('falls back to a neutral score when no metric at all is supplied', () => {
    const cohort = defenderCohort()
    const result = scoreSeason(
      season({ positionSpecificMetrics: { ...NO_METRICS } }),
      'defender',
      cohort,
    )
    expect(result.rawScore).toBe(50)
    expect(result.metricCoverage).toBe(0)
  })

  it('never applies a league or club adjustment to a season with no metric', () => {
    // The neutral 50 above is a placeholder for "nothing was measured", not an
    // observation. A league adjustment corrects an observation for the standard
    // of opposition it was achieved against, so applying it to the placeholder
    // states that an unmeasured player is above average because his club is.
    //
    // This was live: it gave every unmeasured Premier League player 59.1 and
    // every unmeasured League One player 49.2, ranking a third of the dataset
    // purely by division — above players with real evidence against them.
    const cohort = defenderCohort()
    const scores = [30, 60, 93].map(
      (leagueStrength) =>
        scoreSeason(
          season({ leagueStrength, positionSpecificMetrics: { ...NO_METRICS } }),
          'defender',
          cohort,
        ).adjustedScore,
    )

    expect(new Set(scores).size, `league strength changed the score: ${scores.join(', ')}`).toBe(1)
    expect(scores[0]).toBeCloseTo(cohort.groupMeans.defender, 1)

    // Contrast: with even one metric present there *is* an observation, so the
    // adjustment must apply. This is what keeps the assertion above a statement
    // about missing data rather than an accidental disabling of league context.
    const measured = [30, 93].map(
      (leagueStrength) =>
        scoreSeason(
          season({
            leagueStrength,
            positionSpecificMetrics: { ...NO_METRICS, duelSuccess: 60 },
          }),
          'defender',
          cohort,
        ).adjustedScore,
    )
    expect(measured[1]).toBeGreaterThan(measured[0])
  })

  it('rates the same performance higher when it happens in a stronger league', () => {
    const cohort = defenderCohort()
    const metrics = {
      duelSuccess: 60,
      aerialSuccess: 62,
      interceptions90: 3.1,
      progressiveDistance90: 3.6,
      errors90: 0.12,
    }
    const weakLeague = scoreSeason(
      season({ leagueStrength: 45, positionSpecificMetrics: metrics }),
      'defender',
      cohort,
    )
    const strongLeague = scoreSeason(
      season({ leagueStrength: 93, positionSpecificMetrics: metrics }),
      'defender',
      cohort,
    )
    expect(strongLeague.adjustedScore).toBeGreaterThan(weakLeague.adjustedScore)
    expect(weakLeague.rawScore).toBe(strongLeague.rawScore)
  })

  it('shrinks a small-sample season further than a full one', () => {
    const cohort = defenderCohort()
    const strongMetrics = {
      duelSuccess: 72,
      aerialSuccess: 78,
      interceptions90: 5.1,
      progressiveDistance90: 6.1,
      errors90: 0.02,
    }
    const fullSeason = scoreSeason(
      season({ minutes: 3200, positionSpecificMetrics: strongMetrics }),
      'defender',
      cohort,
    )
    const cameoSeason = scoreSeason(
      season({ minutes: 180, positionSpecificMetrics: strongMetrics }),
      'defender',
      cohort,
    )
    expect(fullSeason.adjustedScore).toBe(cameoSeason.adjustedScore)
    expect(cameoSeason.shrunkScore).toBeLessThan(fullSeason.shrunkScore)
  })

  it('keeps scores inside the 1-99 range even at the extremes', () => {
    const cohort = defenderCohort()
    const result = scoreSeason(
      season({
        leagueStrength: 100,
        clubStrength: 100,
        positionSpecificMetrics: {
          duelSuccess: 99,
          aerialSuccess: 99,
          interceptions90: 12,
          progressiveDistance90: 12,
          errors90: 0,
        },
      }),
      'defender',
      cohort,
    )
    expect(result.adjustedScore).toBeLessThanOrEqual(99)
    expect(result.adjustedScore).toBeGreaterThanOrEqual(1)
  })
})

describe('scoreMetrics', () => {
  it('returns one entry per defined metric, with nulls preserved', () => {
    const cohort = defenderCohort()
    const metrics = scoreMetrics(
      season({
        positionSpecificMetrics: {
          duelSuccess: 60,
          aerialSuccess: null,
          interceptions90: 3.1,
          progressiveDistance90: 3.6,
          errors90: 0.12,
        },
      }),
      'defender',
      cohort,
    )
    expect(metrics).toHaveLength(metricsFor('defender').length)
    const aerial = metrics.find((m) => m.key === 'aerialSuccess')
    expect(aerial?.value).toBeNull()
    expect(aerial?.percentile).toBeNull()
  })
})

describe('reliability', () => {
  it('increases with minutes played', () => {
    expect(reliability(300, 1)).toBeLessThan(reliability(1500, 1))
    expect(reliability(1500, 1)).toBeLessThan(reliability(3000, 1))
  })

  it('increases with metric coverage', () => {
    expect(reliability(2000, 0.4)).toBeLessThan(reliability(2000, 1))
  })

  it('is capped below 1, so no forecast is ever treated as certain', () => {
    expect(reliability(100_000, 1)).toBeLessThan(1)
    expect(reliability(100_000, 1)).toBeLessThanOrEqual(0.92)
  })

  it('treats a full season with only half the metrics as weaker evidence than a full one', () => {
    const fullData = reliability(3000, 1)
    const halfData = reliability(3000, 0.5)
    expect(halfData).toBeLessThan(fullData)
  })
})

describe('buildCohort', () => {
  it('collects distributions for each metric group present in the data', () => {
    const cohort = buildCohort(realPlayers)
    for (const group of ['goalkeeper', 'defender', 'midfielder', 'creator', 'forward']) {
      expect(cohort.distributions[group]).toBeDefined()
      expect(cohort.groupMeans[group]).toBeGreaterThan(0)
    }
  })

  it('excludes missing values from the distributions rather than counting them as zero', () => {
    const cohort = buildCohort(realPlayers)
    for (const metrics of Object.values(cohort.distributions)) {
      for (const values of Object.values(metrics)) {
        expect(values.every((v) => typeof v === 'number' && !Number.isNaN(v))).toBe(true)
      }
    }
  })

  it('sorts each distribution ascending', () => {
    const cohort = buildCohort(realPlayers)
    for (const metrics of Object.values(cohort.distributions)) {
      for (const values of Object.values(metrics)) {
        const sorted = [...values].sort((a, b) => a - b)
        expect(values).toEqual(sorted)
      }
    }
  })
})
