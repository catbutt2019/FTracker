import type { Player, SeniorStatus } from '@/types/domain'
import { RISK_CONFIG } from './config'

/**
 * Player-level squad-status classification.
 *
 * Bugs this file exists to fix: Finn Azaz (25, senior-capped, currently
 * declining) and Harvey Vale (already started for senior Ireland) were both
 * shown as "potential future starters" — a category that should be reserved
 * for players who have never appeared for the senior side. The old logic
 * only asked "is this player's 24-month projection above 52", which is a
 * question about *ability*, not about whether the player has already
 * crossed the threshold this category exists to describe.
 *
 * Neither player is special-cased below. `hasSeniorAppearance` and
 * `isFutureContenderEligible` are the only two rules that decide this, and
 * both players are covered purely as a consequence of having senior caps.
 * See `__tests__/squadStatus.test.ts` for the regression tests that pin this.
 *
 * Categories are assigned by priority so they are mechanically mutually
 * exclusive within one position's pool — each step below only ever
 * classifies players not already claimed by an earlier step:
 *
 *   1. highestRatedCurrent — top `requiredStartingSlots` by current score,
 *      from the whole pool. Not called "first choice": the dataset has no
 *      reliable recent-selection/start-recency evidence, so this is honestly
 *      a model ranking, not a claim about actual team selection.
 *   2. seniorContenders    — has a recorded senior appearance (proxy: at
 *      least one senior cap), and not already in (1).
 *   3. futureContenders    — no senior appearance, age 23 or under, stable
 *      or improving, enough club minutes, and projected to approach the
 *      senior-ready threshold within 24 months. See
 *      `isFutureContenderEligible`.
 *   4. emergingProspects   — age 21 or under and not already classified
 *      above (typically: too little evidence yet to say they're on track,
 *      rather than ruled out).
 *
 * A player who fits none of these (e.g. an uncapped 26-year-old fringe
 * player) simply appears in no category, exactly as under the old model —
 * exhaustiveness was never a requirement, only mutual exclusivity.
 */

/**
 * Whether the player has ever recorded a senior appearance for Ireland.
 *
 * `seniorStatus.seniorStarts` is the field that would answer this precisely,
 * but it is not populated in any available source (see `SeniorStatus`'s
 * doc comment) — no provider publishes senior-start-by-player data for this
 * pool. `seniorCaps` is the best available proxy: it is only ever non-zero
 * when the research pass's `eligibilityStanding` was genuinely
 * `capped-senior`, which requires having actually played for the senior
 * team. A cap without an appearance is not a real possibility in football,
 * so this proxy is sound even though it is not the literal field the
 * category rules describe.
 */
export function hasSeniorAppearance(seniorStatus: SeniorStatus): boolean {
  return (seniorStatus.seniorCaps ?? 0) > 0
}

/**
 * Future-contender eligibility, exported standalone so it can be unit-tested
 * directly against fixtures rather than only indirectly through a full
 * position pool.
 *
 * All five conditions are required. Age or trajectory alone are not enough —
 * a young, improving player who barely plays for his club is not close to
 * senior football regardless of how promising he looks in the metrics that
 * do exist, and a young player who is already declining is not "future"
 * anything.
 */
export function isFutureContenderEligible(player: Player): boolean {
  if (hasSeniorAppearance(player.seniorStatus)) return false
  if (player.age > RISK_CONFIG.futureContenderMaxAge) return false
  if (player.forecast.trajectory === 'declining') return false
  if (player.minutes < RISK_CONFIG.futureContenderMinClubMinutes) return false
  if (player.forecast.projections[24].median < RISK_CONFIG.futureContenderProjectionThreshold) {
    return false
  }
  return true
}

export function isEmergingProspectEligible(player: Player): boolean {
  return !hasSeniorAppearance(player.seniorStatus) && player.age <= RISK_CONFIG.emergingProspectMaxAge
}

export interface SquadStatusGroups {
  highestRatedCurrent: Player[]
  seniorContenders: Player[]
  futureContenders: Player[]
  emergingProspects: Player[]
}

/**
 * Classify one position's player pool into the four mutually exclusive
 * categories described above.
 *
 * `pool` is expected already sorted however the caller wants ties broken for
 * the `highestRatedCurrent` cut — callers pass players sorted by current
 * performance score, descending.
 */
export function classifySquadStatus(pool: Player[], requiredStartingSlots: number): SquadStatusGroups {
  const highestRatedCurrent = pool.slice(0, requiredStartingSlots)
  const claimed = new Set(highestRatedCurrent.map((p) => p.id))

  const remaining = pool.filter((p) => !claimed.has(p.id))

  const seniorContenders = remaining.filter((p) => hasSeniorAppearance(p.seniorStatus))
  for (const p of seniorContenders) claimed.add(p.id)

  const futureContenders = remaining
    .filter((p) => !claimed.has(p.id) && isFutureContenderEligible(p))
    .sort((a, b) => b.forecast.projections[24].median - a.forecast.projections[24].median)
    .slice(0, 3)
  for (const p of futureContenders) claimed.add(p.id)

  const emergingProspects = remaining
    .filter((p) => !claimed.has(p.id) && isEmergingProspectEligible(p))
    .sort((a, b) => b.forecast.projections[24].median - a.forecast.projections[24].median)
    .slice(0, 3)

  return { highestRatedCurrent, seniorContenders, futureContenders, emergingProspects }
}
