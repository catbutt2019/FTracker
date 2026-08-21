import { describe, expect, it } from 'vitest'
import type { Player, Position, SeniorStatus } from '@/types/domain'
import { POSITIONS } from '@/types/domain'
import { REQUIRED_STARTING_SLOTS } from '../config'
import { buildMatchdaySelection } from '../matchdayXI'

function seniorStatus(): SeniorStatus {
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
  }
}

let idCounter = 0

function player(options: {
  id?: string
  position: Position
  score: number
  secondaryPositions?: Position[]
}): Player {
  idCounter += 1
  const { id = `p${idCounter}`, position, score, secondaryPositions = [] } = options
  return {
    id,
    name: `Player ${id}`,
    age: 26,
    minutes: 2200,
    primaryPosition: position,
    secondaryPositions,
    seniorStatus: seniorStatus(),
    forecast: {
      currentPerformanceScore: score,
      trajectory: 'stable',
      confidenceScore: 0.8,
      projections: { 24: { median: score } },
    },
  } as unknown as Player
}

/** One player per required slot, all equally rated — a complete, minimal XI. */
function completeSquad(score = 60): Player[] {
  const squad: Player[] = []
  for (const position of POSITIONS) {
    for (let i = 0; i < REQUIRED_STARTING_SLOTS[position]; i += 1) {
      squad.push(player({ position, score }))
    }
  }
  return squad
}

const TOTAL_SLOTS = POSITIONS.reduce((sum, p) => sum + REQUIRED_STARTING_SLOTS[p], 0)

describe('buildMatchdaySelection', () => {
  it('selects exactly the number of players the formation requires', () => {
    const selection = buildMatchdaySelection(completeSquad(), [])
    expect(selection.slots).toHaveLength(TOTAL_SLOTS)
    expect(TOTAL_SLOTS).toBe(11)
    expect(selection.unfilled).toEqual([])
  })

  it('never selects the same player in two positions at once', () => {
    // One versatile player eligible everywhere, alongside a full squad. He can
    // occupy at most one slot however many positions list him.
    const versatile = player({
      id: 'versatile',
      position: 'CM',
      score: 99,
      secondaryPositions: POSITIONS.filter((p) => p !== 'CM'),
    })
    const selection = buildMatchdaySelection([...completeSquad(), versatile], [])
    const ids = selection.slots.map((slot) => slot.player.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter((id) => id === 'versatile')).toHaveLength(1)
  })

  it('excludes players recorded as unavailable', () => {
    const squad = completeSquad()
    const striker = player({ id: 'star-striker', position: 'ST', score: 95 })
    const players = [...squad, striker]

    const withStriker = buildMatchdaySelection(players, [])
    expect(withStriker.slots.some((s) => s.player.id === 'star-striker')).toBe(true)

    const withoutStriker = buildMatchdaySelection(players, [
      { playerId: 'star-striker', reason: 'Injured', recordedOn: '2026-08-21' },
    ])
    expect(withoutStriker.slots.some((s) => s.player.id === 'star-striker')).toBe(false)
    expect(withoutStriker.unavailable.map((u) => u.player.id)).toEqual(['star-striker'])
  })

  it('quantifies the cost of an absence against the fully available pool', () => {
    const squad = completeSquad(60)
    const players = [...squad, player({ id: 'star-striker', position: 'ST', score: 95 })]
    const selection = buildMatchdaySelection(players, [
      { playerId: 'star-striker', reason: 'Injured', recordedOn: '2026-08-21' },
    ])

    expect(selection.strengthAtFullAvailability).toBeGreaterThan(selection.strength)
    expect(selection.strengthCostOfAbsences).toBeLessThan(0)
  })

  it('reports no cost when the absent player would not have been selected anyway', () => {
    // The honest, and common, case: a fringe player's absence changes nothing,
    // and the card must not imply it weakened the team.
    const players = [...completeSquad(60), player({ id: 'fringe', position: 'ST', score: 20 })]
    const selection = buildMatchdaySelection(players, [
      { playerId: 'fringe', reason: 'Injured', recordedOn: '2026-08-21' },
    ])

    expect(selection.strengthCostOfAbsences).toBe(0)
    expect(selection.unavailable).toHaveLength(1)
  })

  it('surfaces an unavailability id matching no tracked player instead of dropping it', () => {
    // Silently ignoring "this player is injured" would overstate the XI, so a
    // typo has to be visible.
    const selection = buildMatchdaySelection(completeSquad(), [
      { playerId: 'nobody-by-this-id', reason: 'Injured', recordedOn: '2026-08-21' },
    ])
    expect(selection.unmatchedUnavailableIds).toEqual(['nobody-by-this-id'])
    expect(selection.unavailable).toHaveLength(0)
  })

  it('reports a slot as unfilled rather than quietly fielding ten players', () => {
    const withoutKeeper = completeSquad().filter((p) => p.primaryPosition !== 'GK')
    const selection = buildMatchdaySelection(withoutKeeper, [])
    expect(selection.unfilled).toEqual(['GK'])
    expect(selection.slots).toHaveLength(TOTAL_SLOTS - 1)
  })

  it('discounts a player filling a position that is not his primary one', () => {
    // No natural left-back; a centre-back covers. His contribution must be
    // discounted, matching how the rest of the model treats secondary
    // positions, rather than counted at face value.
    const squad = completeSquad().filter((p) => p.primaryPosition !== 'LB')
    const cover = player({ id: 'cover', position: 'CB', score: 70, secondaryPositions: ['LB'] })
    const selection = buildMatchdaySelection([...squad, cover], [])

    const leftBack = selection.slots.find((slot) => slot.position === 'LB')
    expect(leftBack?.player.id).toBe('cover')
    expect(leftBack?.weight).toBeLessThan(1)
    expect(leftBack?.effectiveScore).toBeLessThan(leftBack!.rawScore)
  })

  it('assigns a dual-eligible player to the scarcer position', () => {
    // Two candidates for centre-back, none for left-back, and one of the two
    // can play both. He must go to left-back, which would otherwise be empty,
    // rather than being consumed by the position that already has cover.
    const squad = completeSquad().filter((p) => p.primaryPosition !== 'LB')
    const dual = player({ id: 'dual', position: 'CB', score: 70, secondaryPositions: ['LB'] })
    const selection = buildMatchdaySelection([...squad, dual], [])

    expect(selection.slots.find((slot) => slot.position === 'LB')?.player.id).toBe('dual')
    expect(selection.unfilled).toEqual([])
  })

  it('is deterministic across repeated calls', () => {
    const players = completeSquad()
    const a = buildMatchdaySelection(players, [])
    const b = buildMatchdaySelection(players, [])
    expect(a.slots.map((s) => `${s.position}:${s.player.id}`)).toEqual(
      b.slots.map((s) => `${s.position}:${s.player.id}`),
    )
  })
})
