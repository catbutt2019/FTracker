import type { Player, Position } from '@/types/domain'
import { POSITIONS } from '@/types/domain'
import { MATCHDAY_INVOLVEMENT, REQUIRED_STARTING_SLOTS } from './config'
import { buildPositionPool } from './positionStrength'
import { squadStrengthFrom } from './squad'
import { clamp, mean, round } from './math'

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
 * Selection is ranked on club form *and* recent international involvement —
 * see `MATCHDAY_INVOLVEMENT` in config.ts. This is the one place in the model
 * where selection history is an input, because this is the one question where
 * it is evidence rather than circular reasoning: who a manager picks next is
 * genuinely predicted by who he has been picking. The ability and projection
 * models remain deliberately blind to it, so they can still say a player is
 * better than his cap count implies.
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
  /** `rawScore * weight * involvement.factor` — what the XI is scored on. */
  effectiveScore: number
  /** Recent international involvement, and how much it moved this player. */
  involvement: Involvement
}

/**
 * How current a player's international record is, and the resulting nudge to
 * his selection odds. See `MATCHDAY_INVOLVEMENT` in config.ts for why this
 * applies to matchday selection only and never to the ability model.
 */
export interface Involvement {
  /**
   * Multiplier applied to the player's score for selection purposes, within
   * `1 ± MATCHDAY_INVOLVEMENT.maxSwing`. Exactly 1 when there is no evidence
   * either way.
   */
  factor: number
  /** Months since his last senior cap. `null` when he has never been capped. */
  monthsSinceLastCap: number | null
  /** International minutes in the last 12 months. `null` when unpublished. */
  minutesLast12Months: number | null
  /**
   * How much club football he is actually playing, 0-1, or `null` when nothing
   * is published either way. Only ever damps a bonus — see `clubWorkload`.
   */
  clubWorkload: number | null
  /**
   * False when neither international field was available, meaning `factor` is
   * 1 because nothing is known — not because the player is averagely involved.
   */
  hasEvidence: boolean
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30.4375)
}

/**
 * How much club football the player is actually playing, 0-1, or `null` when
 * nothing is published either way.
 *
 * Prefers a genuine rolling 12-month club figure, then falls back to the most
 * recent completed season, then to that season's appearance count. The
 * fallbacks are an approximation and worth being explicit about: a completed
 * season is not the same window as the last twelve months. It is what the
 * research pass actually supplies — `seniorStatus.clubMinutesLast12Months` is
 * null for all 89 players today — and for a player who has stopped playing
 * the two windows agree on the thing that matters.
 *
 * `appearances === 0` returns `null`, not `0`. The build script coerces a
 * missing appearance count to 0, so a genuine "never came off the bench" and
 * "the source published nothing" are indistinguishable at this point. Reading
 * that as "played no football" would invent negative evidence; a player who
 * really did sit out a season and has a published minutes figure is caught by
 * the branch above anyway.
 */
function clubWorkload(player: Player): number | null {
  const published = player.seniorStatus.clubMinutesLast12Months
  if (published !== null) {
    return clamp(published / MATCHDAY_INVOLVEMENT.fullClubMinutes, 0, 1)
  }
  const latest = player.seasons[0]
  if (!latest) return null
  if (latest.minutes !== null) {
    return clamp(latest.minutes / MATCHDAY_INVOLVEMENT.fullClubMinutes, 0, 1)
  }
  if (latest.appearances > 0) {
    return clamp(latest.appearances / MATCHDAY_INVOLVEMENT.fullClubAppearances, 0, 1)
  }
  return null
}

/**
 * Score a player's current standing in the international picture, 0-1, and
 * turn it into a bounded multiplier.
 *
 * Two independent signals, averaged over whichever are available: how recently
 * he was last capped, and how many international minutes he played in the last
 * year. Recency alone would rate a player who came on for two minutes last
 * month as fully involved; volume alone would rate a player who was a regular
 * ten months ago and has since been dropped. Together they are a reasonable
 * read on whether a manager currently regards him as a starter.
 *
 * Both are sourced fields from research round 2, so this adds no new
 * hand-entered input. A player with neither is returned as neutral.
 */
function involvementOf(player: Player, asOf: Date): Involvement {
  const { lastSeniorAppearanceDate, seniorMinutesLast12Months } = player.seniorStatus

  const parsed = lastSeniorAppearanceDate ? new Date(lastSeniorAppearanceDate) : null
  const monthsSince =
    parsed && !Number.isNaN(parsed.getTime()) ? round(monthsBetween(parsed, asOf), 1) : null

  // A future-dated appearance would otherwise produce a currency above 1; a
  // clamp is cheaper than trusting every date in the file to be in the past.
  const currency =
    monthsSince === null
      ? null
      : clamp(1 - monthsSince / MATCHDAY_INVOLVEMENT.staleAfterMonths, 0, 1)

  const load =
    seniorMinutesLast12Months === null
      ? null
      : clamp(seniorMinutesLast12Months / MATCHDAY_INVOLVEMENT.fullInvolvementMinutes, 0, 1)

  const workload = clubWorkload(player)

  const signals = [currency, load].filter((value): value is number => value !== null)
  if (signals.length === 0) {
    return {
      factor: 1,
      monthsSinceLastCap: monthsSince,
      minutesLast12Months: seniorMinutesLast12Months,
      clubWorkload: workload,
      hasEvidence: false,
    }
  }

  // mean(signals) is 0-1; centre it on 0.5 so an averagely involved player is
  // unchanged, and scale to the permitted swing.
  const involvement = mean(signals)
  const raw = 1 + MATCHDAY_INVOLVEMENT.maxSwing * (2 * involvement - 1)

  // A bonus is damped by club game time; a penalty is not. The asymmetry is
  // deliberate, because the two are different kinds of claim.
  //
  // The bonus is a forward-looking inference: "he has been picked recently,
  // so he will be picked again". That inference depends on him still playing
  // football, and decays when he stops — a 37-year-old with 18 club minutes
  // last season is not a likely starter however current his last cap is. Left
  // undamped this was the whole story behind Séamus Coleman, whose +10.6%
  // involvement bonus lifted an entirely unmeasured 50.6 to an effective 56.0
  // and put him at right-back ahead of Festy Ebosele, measured 3.2 higher.
  //
  // The penalty is a direct observation: "he has not been capped in a year".
  // Club football does not make that less true, and letting good club form
  // cancel it would smuggle ability back into a selection-likelihood signal —
  // ability is already what the score itself measures. So club form can take
  // an involvement bonus away, but never hand one out.
  const factor = raw > 1 && workload !== null ? 1 + (raw - 1) * workload : raw

  return {
    factor: round(factor, 4),
    monthsSinceLastCap: monthsSince,
    minutesLast12Months: seniorMinutesLast12Months,
    clubWorkload: workload === null ? null : round(workload, 3),
    hasEvidence: true,
  }
}

export interface MatchdaySelection {
  slots: MatchdaySlot[]
  /** Slots no available player could fill at all. */
  unfilled: Position[]
  strength: number
  /**
   * The same XI recomputed as if nobody were injured or withdrawn. Free agents
   * stay excluded here too — see `buildMatchdaySelection`.
   */
  strengthAtFullAvailability: number
  /** Negative when absences cost strength. */
  strengthCostOfAbsences: number
  unavailable: MatchdayAbsence[]
  /**
   * Ids in the manual unavailability list matching no tracked player — a typo
   * or a stale id. Surfaced rather than silently dropped, because silently
   * ignoring "this player is injured" would overstate the XI.
   */
  unmatchedUnavailableIds: string[]
  /**
   * Manual entries the dataset already covers, so the hand-maintained list can
   * be pruned rather than drifting out of sync with the research behind it.
   */
  redundantManualIds: string[]
}

export interface MatchdayAbsence {
  player: Player
  reason: string
  /** `null` for researched absences, which carry the dataset's own date. */
  recordedOn: string | null
  /**
   * Where the absence came from. `researched` means the round-2 pass sourced
   * `seniorStatus.availabilityStatus`; `manual` means a person typed it into
   * `src/data/nextFixture.ts` with no citation. Kept distinct so the UI can
   * say which, rather than presenting a sourced fact and an assertion as
   * equally solid.
   */
  source: 'researched' | 'manual'
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
function selectSlots(
  available: Player[],
  asOf: Date,
): { slots: MatchdaySlot[]; unfilled: Position[] } {
  // Computed once per player rather than once per (player, position) pair: a
  // player's international standing does not depend on which slot is being
  // filled, and recomputing it per position would parse the same date up to
  // three times for a versatile player.
  const involvementById = new Map(
    available.map((player) => [player.id, involvementOf(player, asOf)] as const),
  )
  const rank = (entry: { player: Player; score: number; weight: number }) =>
    entry.score * entry.weight * (involvementById.get(entry.player.id)?.factor ?? 1)

  const candidatesByPosition = new Map(
    POSITIONS.map((position) => {
      const pool = buildPositionPool(available, position)
        .slice()
        .sort((a, b) => rank(b) - rank(a))
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
      const involvement = involvementById.get(candidate.player.id) ?? {
        factor: 1,
        monthsSinceLastCap: null,
        minutesLast12Months: null,
        clubWorkload: null,
        hasEvidence: false,
      }
      slots.push({
        position,
        player: candidate.player,
        weight: candidate.weight,
        rawScore: round(candidate.score, 1),
        effectiveScore: round(candidate.score * candidate.weight * involvement.factor, 1),
        involvement,
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
  asOfDate: string,
): MatchdaySelection {
  const asOf = new Date(asOfDate)
  const byId = new Map(players.map((p) => [p.id, p]))

  // Researched availability first. Round 2 populated
  // `seniorStatus.availabilityStatus` from cited sources, so it outranks the
  // hand-maintained list and needs no human upkeep.
  //
  // Having no club counts here too. A free agent is not injured, but he is
  // equally not pickable: he is not training with a team, playing competitive
  // football, or accumulating any evidence at all. Note this is a statement
  // about selectability only — `currentClub.unattached` is deliberately
  // invisible to the ability and projection models, which continue to rate
  // these players on what they did when they last played.
  const unavailable: MatchdayAbsence[] = []
  const seen = new Set<string>()
  for (const player of players) {
    const status = player.seniorStatus.availabilityStatus
    const absent = status === 'injured' || status === 'unavailable'
    if (!absent && !player.currentClub.unattached) continue
    seen.add(player.id)
    unavailable.push({
      player,
      // Injury is the more specific fact when a player is both, so it wins.
      reason: status === 'injured' ? 'Injured' : status === 'unavailable' ? 'Unavailable' : 'No club',
      recordedOn: null,
      source: 'researched',
    })
  }

  // Then manual overrides, for absences no source in the research pass covers.
  const unmatchedUnavailableIds: string[] = []
  const redundantManualIds: string[] = []
  for (const entry of unavailability) {
    const player = byId.get(entry.playerId)
    if (!player) {
      unmatchedUnavailableIds.push(entry.playerId)
      continue
    }
    if (seen.has(entry.playerId)) {
      redundantManualIds.push(entry.playerId)
      continue
    }
    seen.add(entry.playerId)
    unavailable.push({
      player,
      reason: entry.reason,
      recordedOn: entry.recordedOn,
      source: 'manual',
    })
  }

  const unavailableIds = new Set(unavailable.map((u) => u.player.id))
  const available = players.filter((p) => !unavailableIds.has(p.id))

  const { slots, unfilled } = selectSlots(available, asOf)
  const strength = strengthOf(slots)
  // Free agents stay out of the full-availability counterfactual. "If nobody
  // were unavailable" means "if nobody were injured or withdrawn" — a question
  // about a squad recovering. Being clubless is not a condition anyone
  // recovers from between now and kick-off, so putting free agents back in
  // would inflate the baseline and misattribute the gap to absences.
  const selectable = players.filter((p) => !p.currentClub.unattached)
  const strengthAtFullAvailability = strengthOf(selectSlots(selectable, asOf).slots)

  return {
    slots,
    unfilled,
    strength,
    strengthAtFullAvailability,
    strengthCostOfAbsences: round(strength - strengthAtFullAvailability, 1),
    unavailable,
    unmatchedUnavailableIds,
    redundantManualIds,
  }
}
