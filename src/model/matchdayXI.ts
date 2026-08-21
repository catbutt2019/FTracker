import type { Player, Position } from '@/types/domain'
import { POSITIONS } from '@/types/domain'
import { REQUIRED_STARTING_SLOTS } from './config'
import { buildPositionPool } from './positionStrength'
import { squadStrengthFrom } from './squad'
import { round } from './math'

/**
 * Strongest available XI for a single fixture.
 *
 * Distinct from everything else in this model, which describes a *pool* over
 * months and years. This answers a narrower question — who would play this
 * week, and what does the resulting XI score — using each player's current
 * score rather than any projection, because a fixture weeks away is far inside
 * the shortest projection horizon (12 months) and a projection would only add
 * noise.
 *
 * What this deliberately does **not** do: model the opponent. There is no
 * opponent dataset, so the XI is Ireland's strength in isolation. Naming a
 * fixture is a label for *when* and *who is unavailable*, not a prediction
 * about a result.
 */

export interface MatchdaySlot {
  position: Position
  player: Player
  /** 1 when this is the player's primary position, discounted when it isn't. */
  weight: number
  /** The player's own score, before the out-of-position discount. */
  rawScore: number
  /** `rawScore * weight` — what the XI is actually scored on. */
  effectiveScore: number
}

export interface MatchdaySelection {
  slots: MatchdaySlot[]
  /** Slots no available player could fill at all. */
  unfilled: Position[]
  strength: number
  /** The same XI recomputed as if nobody were unavailable. */
  strengthAtFullAvailability: number
  /** Negative when absences cost strength. */
  strengthCostOfAbsences: number
  unavailable: { player: Player; reason: string; recordedOn: string }[]
  /**
   * Ids in the manual unavailability list matching no tracked player — a typo
   * or a stale id. Surfaced rather than silently dropped, because silently
   * ignoring "this player is injured" would overstate the XI.
   */
  unmatchedUnavailableIds: string[]
}

/**
 * Fill each position's required slots greedily, scarcest position first.
 *
 * This is a heuristic, not a globally optimal assignment. A player eligible in
 * two positions can only occupy one, which makes optimal selection an
 * assignment problem; solving it properly would be defensible but is harder to
 * explain, and this model's whole premise is that a reader can follow the
 * reasoning. Scarcest-first ordering captures most of the benefit: a position
 * with only one candidate claims him before a position with six candidates can
 * consume him as cover.
 */
function selectSlots(available: Player[]): { slots: MatchdaySlot[]; unfilled: Position[] } {
  const candidatesByPosition = new Map(
    POSITIONS.map((position) => {
      const pool = buildPositionPool(available, position)
        .slice()
        .sort((a, b) => b.score * b.weight - a.score * a.weight)
      return [position, pool] as const
    }),
  )

  const order = [...POSITIONS].sort((a, b) => {
    const scarcity =
      (candidatesByPosition.get(a)?.length ?? 0) - (candidatesByPosition.get(b)?.length ?? 0)
    if (scarcity !== 0) return scarcity
    const slots = REQUIRED_STARTING_SLOTS[b] - REQUIRED_STARTING_SLOTS[a]
    if (slots !== 0) return slots
    // Positional order as the final tie-break, so selection is deterministic.
    return POSITIONS.indexOf(a) - POSITIONS.indexOf(b)
  })

  const used = new Set<string>()
  const slots: MatchdaySlot[] = []
  const unfilled: Position[] = []

  for (const position of order) {
    const required = REQUIRED_STARTING_SLOTS[position]
    const candidates = candidatesByPosition.get(position) ?? []
    let filled = 0
    for (const candidate of candidates) {
      if (filled >= required) break
      if (used.has(candidate.player.id)) continue
      used.add(candidate.player.id)
      slots.push({
        position,
        player: candidate.player,
        weight: candidate.weight,
        rawScore: round(candidate.score, 1),
        effectiveScore: round(candidate.score * candidate.weight, 1),
      })
      filled += 1
    }
    for (let i = filled; i < required; i += 1) unfilled.push(position)
  }

  // Present in formation order rather than the scarcity order used to select.
  slots.sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position))
  return { slots, unfilled }
}

/**
 * Score an XI on the same scale as the headline squad-strength figure, by
 * reusing `squadStrengthFrom` — so "XI strength 63.2" and "squad strength
 * 64.1" are directly comparable rather than two unrelated numbers that happen
 * to share a range. Out-of-position players contribute their discounted
 * score, and an unfilled slot is padded toward a floor by `squadStrengthFrom`
 * rather than skipped.
 */
function strengthOf(slots: MatchdaySlot[]): number {
  const byPosition = new Map<Position, number[]>()
  for (const position of POSITIONS) byPosition.set(position, [])
  for (const slot of slots) byPosition.get(slot.position)?.push(slot.effectiveScore)
  return round(squadStrengthFrom(byPosition), 1)
}

export function buildMatchdaySelection(
  players: Player[],
  unavailability: { playerId: string; reason: string; recordedOn: string }[],
): MatchdaySelection {
  const byId = new Map(players.map((p) => [p.id, p]))

  const unavailable: MatchdaySelection['unavailable'] = []
  const unmatchedUnavailableIds: string[] = []
  for (const entry of unavailability) {
    const player = byId.get(entry.playerId)
    if (!player) {
      unmatchedUnavailableIds.push(entry.playerId)
      continue
    }
    unavailable.push({ player, reason: entry.reason, recordedOn: entry.recordedOn })
  }

  const unavailableIds = new Set(unavailable.map((u) => u.player.id))
  const available = players.filter((p) => !unavailableIds.has(p.id))

  const { slots, unfilled } = selectSlots(available)
  const strength = strengthOf(slots)
  const strengthAtFullAvailability = strengthOf(selectSlots(players).slots)

  return {
    slots,
    unfilled,
    strength,
    strengthAtFullAvailability,
    strengthCostOfAbsences: round(strength - strengthAtFullAvailability, 1),
    unavailable,
    unmatchedUnavailableIds,
  }
}
