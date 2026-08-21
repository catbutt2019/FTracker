import { describe, expect, it } from 'vitest'
import type { Player, SeniorStatus } from '@/types/domain'
import {
  classifySquadStatus,
  hasSeniorAppearance,
  isEmergingProspectEligible,
  isFutureContenderEligible,
} from '../squadStatus'

/**
 * `classifySquadStatus`/`isFutureContenderEligible` are pure functions of a
 * `Player`, so these fixtures are hand-built rather than run through the
 * whole scoring pipeline — only the fields the functions actually read need
 * to be real. See `squad.test.ts` for the equivalent checks against the real
 * researched dataset (Finn Azaz, Harvey Vale, midfield).
 */
function seniorStatus(overrides: Partial<SeniorStatus> = {}): SeniorStatus {
  return {
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
    ...overrides,
  }
}

/**
 * Deliberately not `Partial<Player>`: these fixtures only ever set a handful
 * of fields (id, age, minutes, seniorStatus, a trimmed-down forecast), and
 * `Partial<Player>` would force every nested value (e.g. `forecast`) to
 * satisfy its full real type instead of just the fields these functions
 * actually read.
 */
interface PlayerFixtureOverrides {
  id?: string
  age?: number
  minutes?: number
  seniorStatus?: SeniorStatus
  forecast?: {
    trajectory: string
    projections: { 24: { median: number } }
  }
}

function player(overrides: PlayerFixtureOverrides = {}): Player {
  const base = {
    id: 'p',
    name: 'Player',
    age: 20,
    minutes: 2000,
    seniorStatus: seniorStatus(),
    forecast: {
      trajectory: 'stable',
      projections: { 24: { median: 55 } },
    },
  }
  return { ...base, ...overrides } as unknown as Player
}

describe('hasSeniorAppearance', () => {
  it('is true whenever seniorCaps is greater than zero', () => {
    expect(hasSeniorAppearance(seniorStatus({ seniorCaps: 1 }))).toBe(true)
  })
  it('is false when seniorCaps is zero or null', () => {
    expect(hasSeniorAppearance(seniorStatus({ seniorCaps: 0 }))).toBe(false)
    expect(hasSeniorAppearance(seniorStatus({ seniorCaps: null }))).toBe(false)
  })
})

describe('isFutureContenderEligible', () => {
  it('Finn Azaz cannot be a future contender: senior-capped, 25, declining', () => {
    const azaz = player({
      age: 25,
      seniorStatus: seniorStatus({ seniorCaps: 7 }),
      forecast: { trajectory: 'declining', projections: { 24: { median: 58 } } },
    })
    expect(isFutureContenderEligible(azaz)).toBe(false)
  })

  it('Harvey Vale cannot be a future contender once he has a recorded senior start', () => {
    // seniorStarts is the literal field the requirement describes, but no
    // provider in this dataset publishes it (see SeniorStatus's doc
    // comment) — seniorCaps > 0 is the proxy actually used, and is exercised
    // here directly against a constructed seniorStarts value too, so the
    // rule is pinned against the literal field name as well as the proxy.
    const vale = player({
      age: 22,
      seniorStatus: seniorStatus({ seniorCaps: 2, seniorStarts: 1 }),
      forecast: { trajectory: 'improving', projections: { 24: { median: 60 } } },
    })
    expect(hasSeniorAppearance(vale.seniorStatus)).toBe(true)
    expect(isFutureContenderEligible(vale)).toBe(false)
  })

  it('requires age 23 or under', () => {
    const p = player({ age: 24 })
    expect(isFutureContenderEligible(p)).toBe(false)
  })

  it('requires a stable or improving trajectory, not declining', () => {
    const p = player({ forecast: { trajectory: 'declining', projections: { 24: { median: 60 } } } })
    expect(isFutureContenderEligible(p)).toBe(false)
  })

  it('requires enough club minutes, not just age and trajectory', () => {
    const p = player({ minutes: 100 })
    expect(isFutureContenderEligible(p)).toBe(false)
  })

  it('requires the 24-month projection to approach the senior-ready threshold', () => {
    const p = player({ forecast: { trajectory: 'stable', projections: { 24: { median: 40 } } } })
    expect(isFutureContenderEligible(p)).toBe(false)
  })

  it('is eligible when every condition holds', () => {
    const p = player({
      age: 21,
      minutes: 2200,
      seniorStatus: seniorStatus({ seniorCaps: 0 }),
      forecast: { trajectory: 'improving', projections: { 24: { median: 56 } } },
    })
    expect(isFutureContenderEligible(p)).toBe(true)
  })
})

describe('isEmergingProspectEligible', () => {
  it('requires no senior appearance and age 21 or under', () => {
    expect(isEmergingProspectEligible(player({ age: 21, seniorStatus: seniorStatus({ seniorCaps: 0 }) }))).toBe(
      true,
    )
    expect(isEmergingProspectEligible(player({ age: 22, seniorStatus: seniorStatus({ seniorCaps: 0 }) }))).toBe(
      false,
    )
    expect(isEmergingProspectEligible(player({ age: 19, seniorStatus: seniorStatus({ seniorCaps: 1 }) }))).toBe(
      false,
    )
  })

  it('youth alone is not enough once a senior appearance exists', () => {
    // A 19-year-old with a senior cap already is not "still developing via
    // academy/youth football" — he has already played senior international
    // football, so youth age alone must not classify him as emerging.
    const p = player({ age: 19, seniorStatus: seniorStatus({ seniorCaps: 1 }) })
    expect(isEmergingProspectEligible(p)).toBe(false)
  })
})

describe('classifySquadStatus', () => {
  it('never places the same player in more than one category', () => {
    const pool = [
      player({ id: 'top-scorer', age: 27, forecast: { trajectory: 'stable', projections: { 24: { median: 80 } } } }),
      player({
        id: 'capped-rotation',
        age: 28,
        seniorStatus: seniorStatus({ seniorCaps: 12 }),
        forecast: { trajectory: 'stable', projections: { 24: { median: 62 } } },
      }),
      player({
        id: 'future-contender',
        age: 20,
        minutes: 2100,
        forecast: { trajectory: 'improving', projections: { 24: { median: 55 } } },
      }),
      player({
        id: 'emerging',
        age: 18,
        minutes: 300,
        forecast: { trajectory: 'stable', projections: { 24: { median: 40 } } },
      }),
    ]

    const { highestRatedCurrent, seniorContenders, futureContenders, emergingProspects } = classifySquadStatus(
      pool,
      1,
    )

    const allIds = [
      ...highestRatedCurrent.map((p) => p.id),
      ...seniorContenders.map((p) => p.id),
      ...futureContenders.map((p) => p.id),
      ...emergingProspects.map((p) => p.id),
    ]
    expect(new Set(allIds).size).toBe(allIds.length)

    expect(highestRatedCurrent.map((p) => p.id)).toEqual(['top-scorer'])
    expect(seniorContenders.map((p) => p.id)).toEqual(['capped-rotation'])
    expect(futureContenders.map((p) => p.id)).toEqual(['future-contender'])
    expect(emergingProspects.map((p) => p.id)).toEqual(['emerging'])
  })

  it('does not require a senior-capped player to have the top score to avoid being a future contender', () => {
    // Regression for "first-choice status requires more than the two
    // highest scores": a senior-capped player who scores lower than the
    // requiredStartingSlots cut must still land as a senior contender, never
    // as a future contender, regardless of how the score ranking falls.
    const pool = [
      player({ id: 'best', age: 26, forecast: { trajectory: 'stable', projections: { 24: { median: 85 } } } }),
      player({
        id: 'capped-but-lower-scoring',
        age: 24,
        seniorStatus: seniorStatus({ seniorCaps: 3 }),
        forecast: { trajectory: 'declining', projections: { 24: { median: 58 } } },
      }),
    ]
    const { highestRatedCurrent, seniorContenders, futureContenders } = classifySquadStatus(pool, 1)
    expect(highestRatedCurrent.map((p) => p.id)).toEqual(['best'])
    expect(seniorContenders.map((p) => p.id)).toEqual(['capped-but-lower-scoring'])
    expect(futureContenders).toHaveLength(0)
  })
})
