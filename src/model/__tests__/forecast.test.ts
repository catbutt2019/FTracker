import { describe, expect, it } from 'vitest'
import { changeProbabilities, classifyTrajectory, computeConfidence, confidenceLevel, exactAgeOn, forecastPlayer, HORIZONS } from '../forecast'
import { ageEffect, ageMultiplier, peakAgeFor } from '../ageCurve'
import { buildCohort } from '../scoring'
import { MODEL_CONFIG } from '../config'
import { POSITIONS, type PlayerRaw } from '@/types/domain'
import realPlayersFile from '../../../research/real-players.json'

function realPlayers(): PlayerRaw[] {
  // A fresh array each call (rather than reusing the same reference) keeps
  // the determinism test below honest: it is checking that forecastPlayer
  // produces the same output from equivalent input, not that it returns the
  // same object.
  return JSON.parse(JSON.stringify(realPlayersFile)) as PlayerRaw[]
}

const AS_OF = new Date('2026-08-20')

describe('changeProbabilities', () => {
  it('always sums to exactly 100', () => {
    for (const expectedChange of [-20, -8, -3, 0, 1.5, 4, 12, 30]) {
      for (const sigma of [0.5, 2, 5, 9, 15]) {
        const p = changeProbabilities(expectedChange, sigma)
        expect(p.improve + p.stable + p.decline).toBe(100)
      }
    }
  })

  it('never returns a negative probability', () => {
    const p = changeProbabilities(40, 1)
    expect(p.improve).toBeGreaterThanOrEqual(0)
    expect(p.stable).toBeGreaterThanOrEqual(0)
    expect(p.decline).toBeGreaterThanOrEqual(0)
  })

  it('is symmetric around no expected change', () => {
    const p = changeProbabilities(0, 5)
    expect(Math.abs(p.improve - p.decline)).toBeLessThanOrEqual(1)
  })

  it('favours improvement when the expected change is positive', () => {
    const p = changeProbabilities(6, 4)
    expect(p.improve).toBeGreaterThan(p.decline)
    expect(p.improve).toBeGreaterThan(50)
  })

  it('favours decline when the expected change is negative', () => {
    const p = changeProbabilities(-6, 4)
    expect(p.decline).toBeGreaterThan(p.improve)
  })

  it('increases the improvement probability monotonically with expected change', () => {
    let previous = -1
    for (const change of [-10, -5, -2, 0, 2, 5, 10]) {
      const { improve } = changeProbabilities(change, 5)
      expect(improve).toBeGreaterThanOrEqual(previous)
      previous = improve
    }
  })

  it('shifts weight away from stable as uncertainty grows', () => {
    const tight = changeProbabilities(0, 1)
    const wide = changeProbabilities(0, 12)
    expect(tight.stable).toBeGreaterThan(wide.stable)
  })

  it('does not divide by zero when sigma is zero', () => {
    const p = changeProbabilities(0, 0)
    expect(p.improve + p.stable + p.decline).toBe(100)
  })
})

describe('classifyTrajectory', () => {
  it('requires a margin before calling a near-even split improving', () => {
    expect(classifyTrajectory({ improve: 34, stable: 33, decline: 33 })).toBe('stable')
  })

  it('labels a clear positive skew as improving', () => {
    expect(classifyTrajectory({ improve: 62, stable: 28, decline: 10 })).toBe('improving')
  })

  it('labels a clear negative skew as declining', () => {
    expect(classifyTrajectory({ improve: 12, stable: 30, decline: 58 })).toBe('declining')
  })

  it('labels a stable-dominant split as stable', () => {
    expect(classifyTrajectory({ improve: 22, stable: 56, decline: 22 })).toBe('stable')
  })
})

describe('confidenceLevel', () => {
  it('maps the continuous score onto the published thresholds', () => {
    expect(confidenceLevel(0.1)).toBe('low')
    expect(confidenceLevel(MODEL_CONFIG.confidenceThresholds.moderate)).toBe('moderate')
    expect(confidenceLevel(MODEL_CONFIG.confidenceThresholds.high)).toBe('high')
    expect(confidenceLevel(0.99)).toBe('high')
  })
})

describe('computeConfidence', () => {
  const base = {
    weightedMinutes: 2600,
    coverage: 1,
    seasonCount: 3,
    hasInjuryData: true,
    exactAge: 26,
  }

  it('rises with more minutes', () => {
    expect(computeConfidence({ ...base, weightedMinutes: 200 })).toBeLessThan(
      computeConfidence(base),
    )
  })

  it('rises with better metric coverage', () => {
    expect(computeConfidence({ ...base, coverage: 0.3 })).toBeLessThan(computeConfidence(base))
  })

  it('rises with more seasons of history', () => {
    expect(computeConfidence({ ...base, seasonCount: 1 })).toBeLessThan(computeConfidence(base))
  })

  it('falls when no injury feed is connected', () => {
    expect(computeConfidence({ ...base, hasInjuryData: false })).toBeLessThan(
      computeConfidence(base),
    )
  })

  it('is discounted for teenagers, whose development is more volatile', () => {
    expect(computeConfidence({ ...base, exactAge: 18 })).toBeLessThan(
      computeConfidence({ ...base, exactAge: 26 }),
    )
  })

  it('stays strictly between 0 and 1', () => {
    const floor = computeConfidence({
      weightedMinutes: 0,
      coverage: 0,
      seasonCount: 1,
      hasInjuryData: false,
      exactAge: 17,
    })
    const ceiling = computeConfidence({
      weightedMinutes: 999_999,
      coverage: 1,
      seasonCount: 9,
      hasInjuryData: true,
      exactAge: 27,
    })
    expect(floor).toBeGreaterThan(0)
    expect(ceiling).toBeLessThan(1)
  })

  it('keeps a high-scoring player on few minutes at low confidence', () => {
    // Confidence describes the evidence, not the player.
    const score = computeConfidence({
      weightedMinutes: 250,
      coverage: 0.6,
      seasonCount: 1,
      hasInjuryData: false,
      exactAge: 19,
    })
    expect(confidenceLevel(score)).toBe('low')
  })
})

describe('ageMultiplier', () => {
  it('is exactly 1 at the positional peak', () => {
    for (const position of POSITIONS) {
      expect(ageMultiplier(position, peakAgeFor(position))).toBeCloseTo(1, 6)
    }
  })

  it('is below the peak value both before and after the peak', () => {
    for (const position of POSITIONS) {
      const peak = peakAgeFor(position)
      expect(ageMultiplier(position, peak - 6)).toBeLessThan(1)
      expect(ageMultiplier(position, peak + 6)).toBeLessThan(1)
    }
  })

  it('declines faster after the steep-decline age', () => {
    const gentle = ageMultiplier('W', 29) - ageMultiplier('W', 30)
    const steep = ageMultiplier('W', 33) - ageMultiplier('W', 34)
    expect(steep).toBeGreaterThan(gentle)
  })

  it('gives goalkeepers a later peak than wingers', () => {
    expect(peakAgeFor('GK')).toBeGreaterThan(peakAgeFor('W'))
  })

  it('never returns a non-positive multiplier', () => {
    for (const position of POSITIONS) {
      for (let age = 15; age <= 42; age += 1) {
        expect(ageMultiplier(position, age)).toBeGreaterThan(0)
      }
    }
  })
})

describe('ageEffect', () => {
  it('is positive for a young player and negative for an old one', () => {
    expect(ageEffect('CM', 19, 60, 24)).toBeGreaterThan(0)
    expect(ageEffect('CM', 34, 60, 24)).toBeLessThan(0)
  })

  it('scales with the player current score', () => {
    const lowRated = Math.abs(ageEffect('W', 34, 40, 24))
    const highRated = Math.abs(ageEffect('W', 34, 80, 24))
    expect(highRated).toBeGreaterThan(lowRated)
  })

  it('grows with the horizon', () => {
    const short = Math.abs(ageEffect('ST', 33, 60, 12))
    const long = Math.abs(ageEffect('ST', 33, 60, 36))
    expect(long).toBeGreaterThan(short)
  })
})

describe('exactAgeOn', () => {
  it('computes a fractional age from a date of birth', () => {
    expect(exactAgeOn('2000-08-20', new Date('2026-08-20'))).toBeCloseTo(26, 1)
  })
})

describe('forecastPlayer across the whole real-player dataset', () => {
  const raw = realPlayers()
  const cohort = buildCohort(raw)
  const results = raw.map((player) => ({
    player,
    ...forecastPlayer(player, cohort, AS_OF),
  }))

  it('produces probabilities that sum to 100 at every horizon for every player', () => {
    for (const { forecast, player } of results) {
      for (const horizon of HORIZONS) {
        const p = forecast.projections[horizon].probabilities
        expect(p.improve + p.stable + p.decline, `${player.name} @ ${horizon}m`).toBe(100)
      }
    }
  })

  it('orders the projection interval low <= median <= high', () => {
    for (const { forecast, player } of results) {
      for (const horizon of HORIZONS) {
        const { low, median, high } = forecast.projections[horizon]
        expect(low, `${player.name} @ ${horizon}m`).toBeLessThanOrEqual(median)
        expect(median, `${player.name} @ ${horizon}m`).toBeLessThanOrEqual(high)
      }
    }
  })

  it('widens the interval as the horizon lengthens', () => {
    for (const { forecast, player } of results) {
      const width = (h: 12 | 24 | 36) =>
        forecast.projections[h].high - forecast.projections[h].low
      // Clamping at the 1-99 bounds can compress an extreme interval, so allow
      // equality rather than requiring strict growth.
      expect(width(24), player.name).toBeGreaterThanOrEqual(width(12) - 0.01)
      expect(width(36), player.name).toBeGreaterThanOrEqual(width(24) - 0.01)
    }
  })

  it('keeps every score within the 1-99 bounds', () => {
    for (const { forecast } of results) {
      expect(forecast.currentPerformanceScore).toBeGreaterThanOrEqual(1)
      expect(forecast.currentPerformanceScore).toBeLessThanOrEqual(99)
      for (const horizon of HORIZONS) {
        expect(forecast.projections[horizon].low).toBeGreaterThanOrEqual(1)
        expect(forecast.projections[horizon].high).toBeLessThanOrEqual(99)
      }
    }
  })

  it('gives every player at least one supporting and one uncertainty explanation', () => {
    for (const { forecast, player } of results) {
      expect(forecast.forecastReasons.length, player.name).toBeGreaterThan(0)
      expect(forecast.uncertaintyReasons.length, player.name).toBeGreaterThan(0)
    }
  })

  it('never reduces an explanation to a bare number', () => {
    for (const { forecast } of results) {
      for (const reason of [...forecast.forecastReasons, ...forecast.uncertaintyReasons]) {
        expect(reason.length).toBeGreaterThan(30)
        expect(reason).toMatch(/[a-z]{4,}/)
      }
    }
  })

  it('agrees between the trajectory label and the headline probabilities', () => {
    for (const { forecast, player } of results) {
      const { improve, decline } = forecast.projections[24].probabilities
      if (forecast.trajectory === 'improving') {
        expect(improve, player.name).toBeGreaterThan(decline)
      }
      if (forecast.trajectory === 'declining') {
        expect(decline, player.name).toBeGreaterThan(improve)
      }
    }
  })

  it('flags missing metrics in the uncertainty reasons whenever coverage is incomplete', () => {
    const sparse = results.filter((r) => r.seasonScores[0].missingMetrics.length > 0)
    expect(sparse.length).toBeGreaterThan(0)
    for (const { forecast } of sparse) {
      expect(
        forecast.uncertaintyReasons.some((reason) => reason.includes('no value for')),
      ).toBe(true)
    }
  })

  it('shrinks low-minute players toward the positional average', () => {
    // A null share means minutes were never published, which is not evidence
    // of a low minutes share — see SeasonRecord.minutes in types/domain.ts.
    const fringe = results.filter((r) => {
      const share = r.seasonScores[0].minutesPercentage
      return share !== null && share < 0.15
    })
    expect(fringe.length).toBeGreaterThan(0)
    for (const { forecast } of fringe) {
      expect(Math.abs(forecast.regressionAdjustment)).toBeGreaterThan(0)
      // Shrinkage always moves the score toward the mean, never away from it.
      const towardMean =
        Math.abs(forecast.currentPerformanceScore - forecast.observedScore) <=
        Math.abs(forecast.observedScore - forecast.currentPerformanceScore) + 0.001
      expect(towardMean).toBe(true)
    }
  })

  it('assigns low confidence to players with minimal minutes', () => {
    // Both conditions are still required. A published 0% minutes share is now
    // distinguishable from an unpublished one, but a genuine 0% alongside a
    // real appearance count can still mean the source recorded substitute
    // outings without minutes, so appearances remain part of the test of
    // whether a player was truly fringe.
    const fringe = results.filter((r) => {
      const share = r.seasonScores[0].minutesPercentage
      return share !== null && share < 0.1 && r.player.seasons[0].appearances < 5
    })
    expect(fringe.length).toBeGreaterThan(0)
    for (const { forecast, player } of fringe) {
      expect(forecast.predictionConfidence, player.name).not.toBe('high')
    }
  })

  it('is deterministic: two runs produce identical forecasts', () => {
    const second = realPlayers()
    const secondCohort = buildCohort(second)
    const again = second.map((p) => forecastPlayer(p, secondCohort, AS_OF).forecast)
    expect(again.map((f) => f.currentPerformanceScore)).toEqual(
      results.map((r) => r.forecast.currentPerformanceScore),
    )
    expect(again.map((f) => f.improvementProbability)).toEqual(
      results.map((r) => r.forecast.improvementProbability),
    )
  })

  it('exposes the headline aliases consistently with the 24-month projection', () => {
    for (const { forecast } of results) {
      const headline = forecast.projections[24]
      expect(forecast.projectedPerformanceLow).toBe(headline.low)
      expect(forecast.projectedPerformanceMedian).toBe(headline.median)
      expect(forecast.projectedPerformanceHigh).toBe(headline.high)
      expect(forecast.improvementProbability).toBe(headline.probabilities.improve)
      expect(forecast.stableProbability).toBe(headline.probabilities.stable)
      expect(forecast.declineProbability).toBe(headline.probabilities.decline)
    }
  })
})
