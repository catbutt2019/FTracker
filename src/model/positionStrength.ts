import type { Player, Position, PositionalGroupId } from '@/types/domain'
import { POSITIONS, POSITION_TO_GROUP } from '@/types/domain'
import { SECONDARY_POSITION_WEIGHT, WEAKEST_LINK_WEIGHT } from './config'
import { mean } from './math'

/**
 * Formation-aware position strength.
 *
 * Replaces the old assumption that every position's strength is the mean of
 * its best two players. That flattened a winger slot (needs two starters)
 * and a striker slot (needs one) to the same shape, and — because it always
 * took exactly two players regardless of how many a position's role
 * actually requires — let a weak three-player midfield unit be judged on
 * only its best two, hiding a genuinely weak third starter.
 */

export interface WeightedPlayerScore {
  player: Player
  score: number
  /** 1 for a primary-position player, `SECONDARY_POSITION_WEIGHT` otherwise. */
  weight: number
}

/**
 * Every player who could credibly fill `position`, primary players at full
 * weight and secondary-position players discounted — present, but not
 * counted as if they were full-strength depth for two positions at once.
 */
export function buildPositionPool(players: Player[], position: Position): WeightedPlayerScore[] {
  const pool: WeightedPlayerScore[] = []
  for (const player of players) {
    if (player.primaryPosition === position) {
      pool.push({ player, score: player.forecast.currentPerformanceScore, weight: 1 })
    } else if (player.secondaryPositions.includes(position)) {
      pool.push({
        player,
        score: player.forecast.currentPerformanceScore,
        weight: SECONDARY_POSITION_WEIGHT,
      })
    }
  }
  return pool
}

/**
 * Every player who could credibly fill any position within `group` (e.g.
 * DM/CM/AM for 'midfield'), de-duplicated by player so someone who is
 * primary in one of the group's positions and secondary in another is only
 * counted once, at their best applicable weight.
 */
export function buildGroupPool(players: Player[], group: PositionalGroupId): WeightedPlayerScore[] {
  const positionsInGroup = POSITIONS.filter((p) => POSITION_TO_GROUP[p] === group)
  const byPlayerId = new Map<string, WeightedPlayerScore>()
  for (const position of positionsInGroup) {
    for (const entry of buildPositionPool(players, position)) {
      const existing = byPlayerId.get(entry.player.id)
      if (!existing || entry.weight > existing.weight) {
        byPlayerId.set(entry.player.id, entry)
      }
    }
  }
  return [...byPlayerId.values()]
}

/**
 * Strength from a weighted pool and the number of players actually required
 * to start there.
 *
 * `mean(topN) * (1 - WEAKEST_LINK_WEIGHT) + min(topN) * WEAKEST_LINK_WEIGHT`:
 * a plain mean of the required starters (the old two-slot behaviour,
 * generalised to N slots) blended with the single weakest of them, so one
 * materially weak required starter pulls the score down instead of being
 * smoothed away by a strong teammate. An unfilled slot is padded with a
 * floor value — an empty slot is a real weakness, not a missing data point.
 */
export function weightedStrength(pool: WeightedPlayerScore[], requiredStartingSlots: number): number {
  if (pool.length === 0) return 0
  const effective = pool.map((entry) => entry.score * entry.weight).sort((a, b) => b - a)
  const filled = effective.slice(0, requiredStartingSlots)
  while (filled.length < requiredStartingSlots) {
    filled.push(Math.min(35, filled[filled.length - 1] ?? 35))
  }
  const average = mean(filled)
  const worst = Math.min(...filled)
  return average * (1 - WEAKEST_LINK_WEIGHT) + worst * WEAKEST_LINK_WEIGHT
}

/** The players actually occupying the required starting slots, by raw score. */
export function requiredStarters(pool: WeightedPlayerScore[], requiredStartingSlots: number): Player[] {
  return [...pool]
    .sort((a, b) => b.score * b.weight - a.score * a.weight)
    .slice(0, requiredStartingSlots)
    .map((entry) => entry.player)
}
