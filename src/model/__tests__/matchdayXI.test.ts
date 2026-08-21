import { describe, expect, it } from 'vitest'
import type { Player, Position, SeniorStatus } from '@/types/domain'
import { POSITIONS } from '@/types/domain'
import { MATCHDAY_INVOLVEMENT, REQUIRED_STARTING_SLOTS } from '../config'
import { buildMatchdaySelection } from '../matchdayXI'

function seniorStatus(overrides: Partial<SeniorStatus> = {}): SeniorStatus {
  return {
    seniorCaps: 0,
    seniorStarts: null,
    competitiveSeniorStarts: null,
    seniorMinutes: null,
    // Null by default, so a fixture that says nothing about internationals
    // gets the neutral involvement factor and these tests stay about whatever
    // they are actually testing.
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

function player(options: {
  id?: string
  position: Position
  score: number
  secondaryPositions?: Position[]
  availabilityStatus?: SeniorStatus['availabilityStatus']
  seniorMinutesLast12Months?: number | null
  lastSeniorAppearanceDate?: string | null
  /** No club at all. See `CurrentClub.unattached`. */
  unattached?: boolean
  /**
   * Club minutes in the most recent completed season. `null` by default — and
   * with no season record either, `clubWorkload` returns null and the
   * involvement bonus is undamped, so every test that predates the damper
   * keeps testing exactly what it used to.
   */
  clubMinutes?: number | null
}): Player {
  idCounter += 1
  const {
    id = `p${idCounter}`,
    position,
    score,
    secondaryPositions = [],
    availabilityStatus = null,
    seniorMinutesLast12Months = null,
    lastSeniorAppearanceDate = null,
    unattached = false,
    clubMinutes = null,
  } = options
  return {
    id,
    name: `Player ${id}`,
    age: 26,
    minutes: 2200,
    primaryPosition: position,
    secondaryPositions,
    currentClub: {
      club: unattached ? 'Unattached' : 'Test FC',
      league: unattached ? 'Free agent' : 'Test League',
      leagueStrength: 60,
      changedSinceLastSeason: false,
      unattached,
      transferNote: null,
    },
    seasons:
      clubMinutes === null ? [] : [{ season: '2025-26', minutes: clubMinutes, appearances: 0 }],
    seniorStatus: seniorStatus({
      availabilityStatus,
      seniorMinutesLast12Months,
      lastSeniorAppearanceDate,
    }),
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

/**
 * Fixed so the international-involvement adjustment is deterministic. Every
 * date in these fixtures is expressed relative to this, not to "now".
 */
const AS_OF = '2026-08-21'

describe('buildMatchdaySelection', () => {
  it('selects exactly the number of players the formation requires', () => {
    const selection = buildMatchdaySelection(completeSquad(), [], AS_OF)
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
    const selection = buildMatchdaySelection([...completeSquad(), versatile], [], AS_OF)
    const ids = selection.slots.map((slot) => slot.player.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter((id) => id === 'versatile')).toHaveLength(1)
  })

  it('excludes players recorded as unavailable', () => {
    const squad = completeSquad()
    const striker = player({ id: 'star-striker', position: 'ST', score: 95 })
    const players = [...squad, striker]

    const withStriker = buildMatchdaySelection(players, [], AS_OF)
    expect(withStriker.slots.some((s) => s.player.id === 'star-striker')).toBe(true)

    const withoutStriker = buildMatchdaySelection(players, [
      { playerId: 'star-striker', reason: 'Injured', recordedOn: '2026-08-21' },
    ], AS_OF)
    expect(withoutStriker.slots.some((s) => s.player.id === 'star-striker')).toBe(false)
    expect(withoutStriker.unavailable.map((u) => u.player.id)).toEqual(['star-striker'])
  })

  it('quantifies the cost of an absence against the fully available pool', () => {
    const squad = completeSquad(60)
    const players = [...squad, player({ id: 'star-striker', position: 'ST', score: 95 })]
    const selection = buildMatchdaySelection(players, [
      { playerId: 'star-striker', reason: 'Injured', recordedOn: '2026-08-21' },
    ], AS_OF)

    expect(selection.strengthAtFullAvailability).toBeGreaterThan(selection.strength)
    expect(selection.strengthCostOfAbsences).toBeLessThan(0)
  })

  it('reports no cost when the absent player would not have been selected anyway', () => {
    // The honest, and common, case: a fringe player's absence changes nothing,
    // and the card must not imply it weakened the team.
    const players = [...completeSquad(60), player({ id: 'fringe', position: 'ST', score: 20 })]
    const selection = buildMatchdaySelection(players, [
      { playerId: 'fringe', reason: 'Injured', recordedOn: '2026-08-21' },
    ], AS_OF)

    expect(selection.strengthCostOfAbsences).toBe(0)
    expect(selection.unavailable).toHaveLength(1)
  })

  it('surfaces an unavailability id matching no tracked player instead of dropping it', () => {
    // Silently ignoring "this player is injured" would overstate the XI, so a
    // typo has to be visible.
    const selection = buildMatchdaySelection(completeSquad(), [
      { playerId: 'nobody-by-this-id', reason: 'Injured', recordedOn: '2026-08-21' },
    ], AS_OF)
    expect(selection.unmatchedUnavailableIds).toEqual(['nobody-by-this-id'])
    expect(selection.unavailable).toHaveLength(0)
  })

  it('reports a slot as unfilled rather than quietly fielding ten players', () => {
    const withoutKeeper = completeSquad().filter((p) => p.primaryPosition !== 'GK')
    const selection = buildMatchdaySelection(withoutKeeper, [], AS_OF)
    expect(selection.unfilled).toEqual(['GK'])
    expect(selection.slots).toHaveLength(TOTAL_SLOTS - 1)
  })

  it('discounts a player filling a position that is not his primary one', () => {
    // No natural left-back; a centre-back covers. His contribution must be
    // discounted, matching how the rest of the model treats secondary
    // positions, rather than counted at face value.
    const squad = completeSquad().filter((p) => p.primaryPosition !== 'LB')
    const cover = player({ id: 'cover', position: 'CB', score: 70, secondaryPositions: ['LB'] })
    const selection = buildMatchdaySelection([...squad, cover], [], AS_OF)

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
    const selection = buildMatchdaySelection([...squad, dual], [], AS_OF)

    expect(selection.slots.find((slot) => slot.position === 'LB')?.player.id).toBe('dual')
    expect(selection.unfilled).toEqual([])
  })

  it('excludes a player the dataset itself records as injured, with no manual entry', () => {
    // The point of research round 2 populating `availabilityStatus`: an
    // absence should not depend on someone remembering to type it in.
    const striker = player({
      id: 'crocked',
      position: 'ST',
      score: 95,
      availabilityStatus: 'injured',
    })
    const selection = buildMatchdaySelection([...completeSquad(), striker], [], AS_OF)

    expect(selection.slots.some((s) => s.player.id === 'crocked')).toBe(false)
    expect(selection.unavailable.map((u) => [u.player.id, u.source])).toEqual([
      ['crocked', 'researched'],
    ])
    expect(selection.strengthCostOfAbsences).toBeLessThan(0)
  })

  it('reports a manual entry the dataset already covers as redundant, not twice', () => {
    // Otherwise the hand-maintained list silently accumulates entries that
    // research has since superseded, and the card double-counts the absence.
    const striker = player({
      id: 'crocked',
      position: 'ST',
      score: 95,
      availabilityStatus: 'injured',
    })
    const selection = buildMatchdaySelection([...completeSquad(), striker], [
      { playerId: 'crocked', reason: 'Injured', recordedOn: '2026-08-21' },
    ], AS_OF)

    expect(selection.unavailable).toHaveLength(1)
    expect(selection.unavailable[0].source).toBe('researched')
    expect(selection.redundantManualIds).toEqual(['crocked'])
  })

  it('keeps a manual absence the dataset does not corroborate', () => {
    // The Jaden Umeh case: asserted by hand, `availabilityStatus: null` in the
    // data. Dropping it would overstate the XI.
    const striker = player({ id: 'hand-entered', position: 'ST', score: 95 })
    const selection = buildMatchdaySelection([...completeSquad(), striker], [
      { playerId: 'hand-entered', reason: 'Injured', recordedOn: '2026-08-21' },
    ], AS_OF)

    expect(selection.slots.some((s) => s.player.id === 'hand-entered')).toBe(false)
    expect(selection.unavailable[0].source).toBe('manual')
    expect(selection.redundantManualIds).toEqual([])
  })

  it('prefers the more recently capped of two near-equal candidates', () => {
    // The Doherty/Coleman case that prompted this. Two right-backs within two
    // points of each other on club form: one played a full year of
    // internationals and was capped ten weeks ago, the other has 69 minutes
    // and has not featured since the previous September. Club form alone
    // cannot separate them, and picked the peripheral one.
    const squad = completeSquad().filter((p) => p.primaryPosition !== 'RB')
    const current = player({
      id: 'current',
      position: 'RB',
      score: 53,
      seniorMinutesLast12Months: 656,
      lastSeniorAppearanceDate: '2026-06-06',
    })
    const peripheral = player({
      id: 'peripheral',
      position: 'RB',
      score: 55,
      seniorMinutesLast12Months: 69,
      lastSeniorAppearanceDate: '2025-09-06',
    })
    const selection = buildMatchdaySelection([...squad, current, peripheral], [], AS_OF)

    expect(selection.slots.find((s) => s.position === 'RB')?.player.id).toBe('current')
  })

  it('does not let involvement overturn a genuine gap in ability', () => {
    // The guard that keeps this an ability model with a selection nudge rather
    // than a model of who the manager happens to favour. A 40-point gap must
    // survive maximal involvement on one side and none at all on the other.
    const squad = completeSquad().filter((p) => p.primaryPosition !== 'ST')
    const better = player({ id: 'better', position: 'ST', score: 90 })
    const favoured = player({
      id: 'favoured',
      position: 'ST',
      score: 50,
      seniorMinutesLast12Months: 2000,
      lastSeniorAppearanceDate: AS_OF,
    })
    const selection = buildMatchdaySelection([...squad, better, favoured], [], AS_OF)

    expect(selection.slots.find((s) => s.position === 'ST')?.player.id).toBe('better')
  })

  it('treats a player with no international record as neutral, not as a negative', () => {
    // Otherwise the XI becomes a model of the status quo, structurally unable
    // to surface a player nobody has picked yet — which is most of the point.
    const uncapped = player({ id: 'uncapped', position: 'ST', score: 70 })
    const selection = buildMatchdaySelection([...completeSquad(), uncapped], [], AS_OF)

    const slot = selection.slots.find((s) => s.player.id === 'uncapped')
    expect(slot).toBeDefined()
    expect(slot!.involvement.hasEvidence).toBe(false)
    expect(slot!.involvement.factor).toBe(1)
    expect(slot!.effectiveScore).toBe(slot!.rawScore)
  })

  it('bounds the involvement adjustment by the configured swing', () => {
    const maxed = player({
      id: 'maxed',
      position: 'ST',
      score: 60,
      seniorMinutesLast12Months: 99999,
      lastSeniorAppearanceDate: AS_OF,
    })
    const stale = player({
      id: 'stale',
      position: 'GK',
      score: 60,
      seniorMinutesLast12Months: 0,
      lastSeniorAppearanceDate: '2000-01-01',
    })
    const selection = buildMatchdaySelection([maxed, stale], [], AS_OF)

    for (const slot of selection.slots) {
      expect(slot.involvement.factor).toBeGreaterThanOrEqual(1 - MATCHDAY_INVOLVEMENT.maxSwing)
      expect(slot.involvement.factor).toBeLessThanOrEqual(1 + MATCHDAY_INVOLVEMENT.maxSwing)
    }
    expect(selection.slots.find((s) => s.player.id === 'maxed')?.involvement.factor).toBeCloseTo(
      1 + MATCHDAY_INVOLVEMENT.maxSwing,
      4,
    )
    expect(selection.slots.find((s) => s.player.id === 'stale')?.involvement.factor).toBeCloseTo(
      1 - MATCHDAY_INVOLVEMENT.maxSwing,
      4,
    )
  })

  it('strips a free agent of his involvement bonus without excluding him', () => {
    // Séamus Coleman's case. He and this comparison player have identical,
    // maximally current international records; only one of them still has a
    // club. Being unattached is read as zero current club football, so the
    // "he keeps getting picked, so he will be picked again" bonus goes — but
    // it is only ever damped to neutral, never turned into a penalty.
    const clubless = player({
      id: 'clubless',
      position: 'RB',
      score: 60,
      seniorMinutesLast12Months: 810,
      lastSeniorAppearanceDate: AS_OF,
      unattached: true,
      // Last season's minutes are deliberately generous, to prove they are
      // ignored: what he played before losing his club does not describe what
      // he is playing now.
      clubMinutes: MATCHDAY_INVOLVEMENT.fullClubMinutes,
    })
    const employed = player({
      id: 'employed',
      position: 'GK',
      score: 60,
      seniorMinutesLast12Months: 810,
      lastSeniorAppearanceDate: AS_OF,
      clubMinutes: MATCHDAY_INVOLVEMENT.fullClubMinutes,
    })
    const selection = buildMatchdaySelection([clubless, employed], [], AS_OF)

    const free = selection.slots.find((s) => s.player.id === 'clubless')!
    expect(free.involvement.clubWorkload).toBe(0)
    expect(free.involvement.factor).toBe(1)
    expect(free.effectiveScore).toBe(free.rawScore)
    expect(selection.slots.find((s) => s.player.id === 'employed')!.involvement.factor).toBeCloseTo(
      1 + MATCHDAY_INVOLVEMENT.maxSwing,
      4,
    )
  })

  it('still picks a free agent who is the best option at his position', () => {
    // The guard against overcorrecting. Will Smallbone is 26 and a senior
    // international who happens to be between contracts in August; an
    // exclusion would have treated him exactly like a 37-year-old winding
    // down. Losing a selection bonus is proportionate; losing eligibility is
    // not, so no amount of being unattached may keep a clearly better player
    // out of the XI.
    const squad = completeSquad().filter((p) => p.primaryPosition !== 'CM')
    const clubless = player({ id: 'clubless', position: 'CM', score: 90, unattached: true })
    const employed = player({ id: 'employed', position: 'CM', score: 50 })
    const selection = buildMatchdaySelection([...squad, clubless, employed], [], AS_OF)

    expect(selection.slots.find((s) => s.position === 'CM')?.player.id).toBe('clubless')
    expect(selection.unavailable.map((u) => u.player.id)).not.toContain('clubless')
  })

  it('records a free agent as unavailable only when something else makes him so', () => {
    // Having no club is not an absence; an injury still is, even for a player
    // who also has no club.
    const clubless = player({ id: 'clubless', position: 'ST', score: 60, unattached: true })
    const injuredAndClubless = player({
      id: 'both',
      position: 'W',
      score: 60,
      unattached: true,
      availabilityStatus: 'injured',
    })
    const selection = buildMatchdaySelection(
      [...completeSquad(), clubless, injuredAndClubless],
      [],
      AS_OF,
    )

    expect(selection.unavailable.map((u) => u.player.id)).toEqual(['both'])
    expect(selection.unavailable[0].reason).toBe('Injured')
  })

  it('damps the involvement bonus for a player who is barely playing club football', () => {
    // The Coleman case proper. Both these players have an identical, maximally
    // current international record; they differ only in whether they are still
    // playing. The one who is not must not be carried into the XI by a
    // selection-history bonus that assumes he still is.
    const idle = player({
      id: 'idle',
      position: 'RB',
      score: 60,
      seniorMinutesLast12Months: 810,
      lastSeniorAppearanceDate: AS_OF,
      clubMinutes: 18,
    })
    const playing = player({
      id: 'playing',
      position: 'GK',
      score: 60,
      seniorMinutesLast12Months: 810,
      lastSeniorAppearanceDate: AS_OF,
      clubMinutes: MATCHDAY_INVOLVEMENT.fullClubMinutes,
    })
    const selection = buildMatchdaySelection([idle, playing], [], AS_OF)

    const idleFactor = selection.slots.find((s) => s.player.id === 'idle')!.involvement.factor
    const playingFactor = selection.slots.find((s) => s.player.id === 'playing')!.involvement.factor

    expect(playingFactor).toBeCloseTo(1 + MATCHDAY_INVOLVEMENT.maxSwing, 4)
    // Scaled by 18/1800, so almost all of the bonus is gone but none of it is
    // turned into a penalty — absence of club football is not evidence of
    // being bad, only of being unlikely to be picked.
    expect(idleFactor).toBeLessThan(playingFactor)
    expect(idleFactor).toBeGreaterThanOrEqual(1)
    expect(idleFactor).toBeCloseTo(1 + MATCHDAY_INVOLVEMENT.maxSwing * (18 / 1800), 4)
  })

  it('does not let club football soften an involvement penalty', () => {
    // The asymmetry. A stale international record is a direct observation that
    // club form cannot contradict; if playing well could cancel the penalty,
    // ability would be entering the selection signal twice, having already
    // been counted in the score itself.
    const stale = player({
      id: 'stale',
      position: 'ST',
      score: 60,
      seniorMinutesLast12Months: 0,
      lastSeniorAppearanceDate: '2000-01-01',
      clubMinutes: 3000,
    })
    const selection = buildMatchdaySelection([stale], [], AS_OF)

    expect(selection.slots[0].involvement.factor).toBeCloseTo(1 - MATCHDAY_INVOLVEMENT.maxSwing, 4)
  })

  it('leaves the involvement bonus intact when no club game time is published', () => {
    // Most seasons in this dataset carry no minutes figure. Reading that
    // silence as "played nothing" would quietly demote every player whose
    // source happens not to publish minutes.
    const noData = player({
      id: 'no-data',
      position: 'ST',
      score: 60,
      seniorMinutesLast12Months: 810,
      lastSeniorAppearanceDate: AS_OF,
      clubMinutes: null,
    })
    const selection = buildMatchdaySelection([noData], [], AS_OF)

    expect(selection.slots[0].involvement.clubWorkload).toBeNull()
    expect(selection.slots[0].involvement.factor).toBeCloseTo(1 + MATCHDAY_INVOLVEMENT.maxSwing, 4)
  })

  it('is deterministic across repeated calls', () => {
    const players = completeSquad()
    const a = buildMatchdaySelection(players, [], AS_OF)
    const b = buildMatchdaySelection(players, [], AS_OF)
    expect(a.slots.map((s) => `${s.position}:${s.player.id}`)).toEqual(
      b.slots.map((s) => `${s.position}:${s.player.id}`),
    )
  })
})
