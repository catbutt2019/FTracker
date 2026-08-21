import { describe, expect, it } from 'vitest'
import type { Player, Position, SeniorStatus, Trajectory } from '@/types/domain'
import { buildPositionalGroupOutlooks } from '../positionRisk'
import { buildGroupPool, buildPositionPool, weightedStrength } from '../positionStrength'

/**
 * `buildPositionalGroupOutlooks` and the pool builders it depends on are pure
 * functions of a `Player[]`, so fixtures are hand-built rather than run
 * through the whole pipeline. See `squad.test.ts` for the equivalent checks
 * against the real researched dataset.
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

let idCounter = 0

interface PlayerFixtureOptions {
  id?: string
  position: Position
  secondaryPositions?: Position[]
  score: number
  /** Defaults to `score` — override to separate "now" from "24-month projection". */
  projectionMedian?: number
  age?: number
  minutes?: number
  trajectory?: Trajectory
  seniorCaps?: number | null
  availabilityStatus?: SeniorStatus['availabilityStatus']
}

function player(options: PlayerFixtureOptions): Player {
  idCounter += 1
  const {
    id = `p${idCounter}`,
    position,
    secondaryPositions = [],
    score,
    projectionMedian = score,
    age = 26,
    minutes = 2200,
    trajectory = 'stable',
    seniorCaps = 0,
    availabilityStatus = null,
  } = options
  return {
    id,
    name: `Player ${id}`,
    age,
    minutes,
    primaryPosition: position,
    secondaryPositions,
    seniorStatus: seniorStatus({ seniorCaps, availabilityStatus }),
    forecast: {
      currentPerformanceScore: score,
      trajectory,
      confidenceScore: 0.8,
      projections: { 24: { median: projectionMedian } },
    },
  } as unknown as Player
}

/** A believable strong player filling one required slot in a given group. */
function strongPlayer(position: Position, score = 65): Player {
  return player({ position, score })
}

describe('buildGroupPool / weightedStrength — secondary-position weighting', () => {
  it('discounts a secondary-position player rather than counting them at full strength', () => {
    const p = player({ position: 'CB', score: 70, secondaryPositions: ['LB'] })
    const primaryPool = buildPositionPool([p], 'CB')
    const secondaryPool = buildPositionPool([p], 'LB')
    expect(primaryPool[0].weight).toBe(1)
    expect(secondaryPool[0].weight).toBeLessThan(1)
    expect(secondaryPool[0].weight).toBeGreaterThan(0)
  })

  it('never double-counts one player as two full-strength bodies across positions in the same group', () => {
    // Primary at RB, secondary at LB — both fullback-group positions. A naive
    // pool built by concatenating buildPositionPool for every position in the
    // group would list this player twice; buildGroupPool must dedupe by id.
    const p = player({ position: 'RB', score: 70, secondaryPositions: ['LB'] })
    const pool = buildGroupPool([p], 'fullback')
    expect(pool).toHaveLength(1)
    expect(pool[0].weight).toBe(1)
  })

  it('keeps the best applicable weight when de-duplicating, regardless of encounter order', () => {
    // Primary at LB (encountered second, since buildGroupPool walks RB then
    // LB), secondary at RB (encountered first, discounted). The final weight
    // must be the primary one, not whichever position was scanned first.
    const p = player({ position: 'LB', score: 70, secondaryPositions: ['RB'] })
    const pool = buildGroupPool([p], 'fullback')
    expect(pool).toHaveLength(1)
    expect(pool[0].weight).toBe(1)
  })

  it('a discounted secondary player pulls group strength down relative to an equally-scored primary one', () => {
    const primary = player({ position: 'CB', score: 70 })
    const secondary = player({ position: 'CB', score: 70, secondaryPositions: ['LB'] })
    const poolFullback = buildGroupPool([secondary], 'fullback')
    const poolCentreback = buildGroupPool([primary], 'centreback')
    const secondaryStrength = weightedStrength(poolFullback, 1)
    const primaryStrength = weightedStrength(poolCentreback, 1)
    expect(secondaryStrength).toBeLessThan(primaryStrength)
  })
})

describe('buildPositionalGroupOutlooks', () => {
  function balancedSquad(midfield: Player[]): Player[] {
    return [
      strongPlayer('GK'),
      strongPlayer('RB'),
      strongPlayer('LB'),
      strongPlayer('CB', 66),
      strongPlayer('CB', 64),
      strongPlayer('W', 66),
      strongPlayer('W', 64),
      strongPlayer('ST'),
      ...midfield,
    ]
  }

  it('flags midfield as depth-risky even though it has more tracked players than any other group', () => {
    // Six tracked DM/CM/AM players — twice the required three slots — but
    // none of them clears the senior-ready threshold. Raw headcount must not
    // read as "well stocked".
    const weakMidfield = [
      player({ position: 'DM', score: 40 }),
      player({ position: 'CM', score: 42 }),
      player({ position: 'AM', score: 38 }),
      player({ position: 'DM', score: 41 }),
      player({ position: 'CM', score: 39 }),
      player({ position: 'AM', score: 37 }),
    ]
    const players = balancedSquad(weakMidfield)
    const outlooks = buildPositionalGroupOutlooks(players)
    const midfield = outlooks.find((o) => o.group === 'midfield')!

    expect(midfield.risk.depthRisk).toBe('high')
    expect(midfield.risk.currentQualityRisk).not.toBe('none')
    expect(midfield.risk.overallRisk).toBe('high')
    expect(midfield.risk.reasons.length).toBeGreaterThan(0)
  })

  it('reports "no risk" for a group only once every dimension genuinely clears its threshold', () => {
    // Strong, deep, non-declining, available, with two credible successors —
    // every one of the five dimensions must be individually clean for
    // overallRisk to read as low with no reasons attached.
    const solidMidfield = [
      player({ position: 'DM', score: 66 }),
      player({ position: 'CM', score: 64 }),
      player({ position: 'AM', score: 63 }),
      player({ position: 'CM', score: 60 }), // extra senior-ready cover beyond the 3 required
      player({
        position: 'DM',
        score: 22,
        age: 20,
        trajectory: 'improving',
        minutes: 1500,
        projectionMedian: 56,
      }),
      player({
        position: 'DM',
        score: 25,
        age: 21,
        trajectory: 'improving',
        minutes: 1200,
        projectionMedian: 55,
      }),
    ]
    const players = balancedSquad(solidMidfield)
    const outlooks = buildPositionalGroupOutlooks(players)
    const midfield = outlooks.find((o) => o.group === 'midfield')!

    expect(midfield.risk.currentQualityRisk).toBe('none')
    expect(midfield.risk.depthRisk).toBe('none')
    expect(midfield.risk.trendRisk).toBe('none')
    expect(midfield.risk.successionRisk).toBe('none')
    expect(midfield.risk.availabilityRisk).toBe('none')
    expect(midfield.risk.overallRisk).toBe('low')
    expect(midfield.risk.reasons).toHaveLength(0)
  })

  it('flags a single tripped dimension as moderate-or-worse, not silently rounding it away to low', () => {
    // Identical to the clean scenario, but every required starter is now
    // declining — trendRisk alone must push this off "low" even though
    // quality, depth and succession stay clean.
    const decliningButOtherwiseSolidMidfield = [
      player({ position: 'DM', score: 66, trajectory: 'declining' }),
      player({ position: 'CM', score: 64, trajectory: 'declining' }),
      player({ position: 'AM', score: 63, trajectory: 'declining' }),
      player({ position: 'CM', score: 60 }),
      player({
        position: 'DM',
        score: 22,
        age: 20,
        trajectory: 'improving',
        minutes: 1500,
        projectionMedian: 56,
      }),
      player({
        position: 'DM',
        score: 25,
        age: 21,
        trajectory: 'improving',
        minutes: 1200,
        projectionMedian: 55,
      }),
    ]
    const players = balancedSquad(decliningButOtherwiseSolidMidfield)
    const outlooks = buildPositionalGroupOutlooks(players)
    const midfield = outlooks.find((o) => o.group === 'midfield')!

    expect(midfield.risk.currentQualityRisk).toBe('none')
    expect(midfield.risk.depthRisk).toBe('none')
    expect(midfield.risk.successionRisk).toBe('none')
    expect(midfield.risk.trendRisk).toBe('high')
    expect(midfield.risk.overallRisk).not.toBe('low')
    expect(midfield.risk.reasons.length).toBeGreaterThan(0)
  })

  it('judges every DM/CM/AM position as one midfield unit rather than three isolated slots', () => {
    const weakMidfield = [
      player({ position: 'DM', score: 40 }),
      player({ position: 'CM', score: 42 }),
      player({ position: 'AM', score: 38 }),
    ]
    const players = balancedSquad(weakMidfield)
    const outlooks = buildPositionalGroupOutlooks(players)
    const midfield = outlooks.find((o) => o.group === 'midfield')!
    expect(midfield.positions).toEqual(expect.arrayContaining(['DM', 'CM', 'AM']))
    expect(midfield.requiredStartingSlots).toBe(3)
  })

  it('returns critical risk for a group with no tracked player at all', () => {
    const players = balancedSquad([])
    const outlooks = buildPositionalGroupOutlooks(players)
    const midfield = outlooks.find((o) => o.group === 'midfield')!
    expect(midfield.risk.overallRisk).toBe('critical')
  })
})
