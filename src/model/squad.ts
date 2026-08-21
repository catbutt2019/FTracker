import type {
  Player,
  Position,
  PositionDepth,
  ProjectionHorizon,
  SquadHorizonOutlook,
  SquadOutlook,
  SquadStrengthPoint,
} from '@/types/domain'
import { POSITION_LABELS, POSITION_TO_GROUP, POSITIONS } from '@/types/domain'
import { MODEL_CONFIG, POSITION_SQUAD_WEIGHTS, REQUIRED_STARTING_SLOTS, WEAKEST_LINK_WEIGHT } from './config'
import { HORIZONS } from './forecast'
import { buildPositionalGroupOutlooks, riskForPosition } from './positionRisk'
import { buildPositionPool, weightedStrength } from './positionStrength'
import { classifySquadStatus } from './squadStatus'
import {
  clamp,
  createRng,
  mean,
  normalQuantile,
  quantile,
  round,
  roundToHundred,
  sampleNormal,
} from './math'

/**
 * Squad strength is the weighted, formation-aware strength of each position
 * (see `positionStrength.ts`), not the mean of the whole pool.
 *
 * This matters: adding a fringe 40-rated left-back to the dataset should not
 * make the national team look weaker, because he would not play. Depth is
 * captured separately through the positional-risk assessment.
 */
export function squadStrengthFrom(scoresByPosition: Map<Position, number[]>): number {
  let weighted = 0
  let weightUsed = 0
  for (const position of POSITIONS) {
    const scores = (scoresByPosition.get(position) ?? []).slice().sort((a, b) => b - a)
    if (scores.length === 0) continue
    const slots = REQUIRED_STARTING_SLOTS[position] ?? MODEL_CONFIG.squadSlotsPerPosition
    const best = scores.slice(0, slots)
    // A position with fewer bodies than slots is penalised toward a floor
    // value, because an unfilled slot is a real weakness rather than no data.
    const filled = [...best]
    while (filled.length < slots) filled.push(Math.min(35, best[best.length - 1] ?? 35))
    // Weakest-link blend: the plain mean of the required starters, pulled
    // toward the single weakest of them, so one materially weak required
    // starter drags the position down instead of being smoothed away by a
    // stronger teammate. See `positionStrength.ts#weightedStrength`, which
    // this mirrors for the plain (unweighted-by-secondary-position) case
    // Monte Carlo simulation and history need.
    const positionStrength = mean(filled) * (1 - WEAKEST_LINK_WEIGHT) + Math.min(...filled) * WEAKEST_LINK_WEIGHT
    const weight = POSITION_SQUAD_WEIGHTS[position]
    weighted += positionStrength * weight
    weightUsed += weight
  }
  return weightUsed > 0 ? weighted / weightUsed : 0
}

function groupByPosition<T>(
  players: Player[],
  pick: (player: Player) => T,
): Map<Position, T[]> {
  const map = new Map<Position, T[]>()
  for (const position of POSITIONS) map.set(position, [])
  for (const player of players) {
    map.get(player.primaryPosition)?.push(pick(player))
    // Secondary positions are handled separately, through
    // `positionStrength.ts#buildPositionPool`/`buildGroupPool`, which apply a
    // discount rather than full-strength double-counting. The Monte Carlo
    // simulation below and the historical series only ever look at primary
    // positions, matching the pre-existing (and still current) simplification
    // that projections are not separately simulated per secondary position.
  }
  return map
}

/* ------------------------------------------------------------------ *
 * Monte Carlo
 * ------------------------------------------------------------------ */

export interface SimulationOutput {
  horizons: Record<ProjectionHorizon, SquadHorizonOutlook>
  currentStrength: number
}

/**
 * Simulate squad strength at each horizon.
 *
 * Each player's future score is drawn from their own projection distribution,
 * reconstructed from the published 80% interval. Draws are then correlated
 * through a single shared factor:
 *
 *     draw_i = median_i + sigma_i * ( sqrt(rho) * Z_shared + sqrt(1-rho) * Z_i )
 *
 * This preserves each player's own marginal distribution exactly — so the
 * numbers on a player page and the numbers feeding the squad forecast agree —
 * while stopping the aggregate spread from collapsing. With 40 independent
 * players the squad range would come out around a point wide, which would
 * present a coarse model as a precise one.
 */
export function simulateSquad(players: Player[]): SimulationOutput {
  const rng = createRng(MODEL_CONFIG.simulationSeed)
  const z90 = normalQuantile(0.9)
  const rho = MODEL_CONFIG.playerCorrelation
  const sharedLoading = Math.sqrt(rho)
  const idiosyncraticLoading = Math.sqrt(1 - rho)

  const currentByPosition = groupByPosition(players, (p) => p.forecast.currentPerformanceScore)
  const currentStrength = squadStrengthFrom(currentByPosition)

  const horizons = {} as Record<ProjectionHorizon, SquadHorizonOutlook>

  for (const horizon of HORIZONS) {
    const results: number[] = []
    let improved = 0
    let declined = 0

    for (let sim = 0; sim < MODEL_CONFIG.simulations; sim += 1) {
      const sampled = new Map<Position, number[]>()
      for (const position of POSITIONS) sampled.set(position, [])

      // One shared shock per simulation, representing conditions that move the
      // whole pool together.
      const shared = sampleNormal(rng, 0, 1)

      for (const player of players) {
        const projection = player.forecast.projections[horizon]
        const sigma = Math.max((projection.high - projection.low) / (2 * z90), 0.5)
        const z = sharedLoading * shared + idiosyncraticLoading * sampleNormal(rng, 0, 1)
        const draw = clamp(projection.median + sigma * z, 1, 99)
        sampled.get(player.primaryPosition)?.push(draw)
      }

      const strength = squadStrengthFrom(sampled)
      results.push(strength)
      const delta = strength - currentStrength
      if (delta > MODEL_CONFIG.squadStableBandPoints) improved += 1
      else if (delta < -MODEL_CONFIG.squadStableBandPoints) declined += 1
    }

    results.sort((a, b) => a - b)
    const total = results.length
    const [improveProbability, stableProbability, declineProbability] = roundToHundred([
      improved / total,
      (total - improved - declined) / total,
      declined / total,
    ])

    horizons[horizon] = {
      horizonMonths: horizon,
      improveProbability,
      stableProbability,
      declineProbability,
      low: round(quantile(results, 0.1), 1),
      median: round(quantile(results, 0.5), 1),
      high: round(quantile(results, 0.9), 1),
    }
  }

  return { horizons, currentStrength: round(currentStrength, 1) }
}

/* ------------------------------------------------------------------ *
 * Depth
 * ------------------------------------------------------------------ */

/**
 * Build one position's depth card: the four squad-status categories (see
 * `squadStatus.ts`), formation-aware current/projected strength (see
 * `positionStrength.ts`), and the risk verdict inherited from this
 * position's positional group (see `positionRisk.ts`).
 *
 * The risk verdict is deliberately computed once per group and inherited by
 * every granular position inside it — a lone central-midfield slot cannot
 * honestly be judged "fine" in isolation when the three-player midfield
 * unit it belongs to is the squad's weakest area; see the module comment on
 * `positionRisk.ts`.
 */
export function buildPositionDepth(
  players: Player[],
  position: Position,
  groupOutlooks: ReturnType<typeof buildPositionalGroupOutlooks>,
  horizon: ProjectionHorizon = 24,
): PositionDepth {
  const pool = players
    .filter((p) => p.primaryPosition === position)
    .sort((a, b) => b.forecast.currentPerformanceScore - a.forecast.currentPerformanceScore)

  const requiredStartingSlots = REQUIRED_STARTING_SLOTS[position]
  const { highestRatedCurrent, seniorContenders, futureContenders, emergingProspects } = classifySquadStatus(
    pool,
    requiredStartingSlots,
  )

  const weightedPool = buildPositionPool(players, position)
  const currentStrength = weightedStrength(weightedPool, requiredStartingSlots)

  const bestProjected = pool
    .map((p) => p.forecast.projections[horizon])
    .sort((a, b) => b.median - a.median)
    .slice(0, requiredStartingSlots)

  const risk = riskForPosition(groupOutlooks, position)
  const positionalGroup = POSITION_TO_GROUP[position]
  const depthRiskReason =
    risk.reasons.length > 0
      ? risk.reasons.join(' ')
      : `No dimension of risk — current quality, depth, succession, trend or availability — is currently flagged for the ${POSITION_LABELS[position]} position's group, relative to the rest of the squad.`

  return {
    position,
    label: POSITION_LABELS[position],
    positionalGroup,
    requiredStartingSlots,
    highestRatedCurrent,
    seniorContenders,
    futureContenders,
    emergingProspects,
    averageAge: pool.length ? round(mean(pool.map((p) => p.age)), 1) : 0,
    currentStrength: round(currentStrength, 1),
    projectedStrength: bestProjected.length ? round(mean(bestProjected.map((p) => p.median)), 1) : 0,
    projectedLow: bestProjected.length ? round(mean(bestProjected.map((p) => p.low)), 1) : 0,
    projectedHigh: bestProjected.length ? round(mean(bestProjected.map((p) => p.high)), 1) : 0,
    risk,
    depthRisk: risk.overallRisk,
    depthRiskReason,
    playerCount: pool.length,
  }
}

/* ------------------------------------------------------------------ *
 * History and assembly
 * ------------------------------------------------------------------ */

/**
 * Reconstruct historical squad strength from the season scores already held for
 * each player, then extend it with the simulated projection.
 *
 * Historical points only include players who actually have data for that
 * season, so early seasons rest on a smaller pool. That is a real limitation
 * and is stated on the methodology page.
 */
/** The most frequent string in a list, ties broken by first occurrence. */
function mostCommon(values: string[]): string {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best = values[0]
  let bestCount = 0
  for (const value of values) {
    const count = counts.get(value) ?? 0
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

export function buildHistory(
  players: Player[],
  horizons: Record<ProjectionHorizon, SquadHorizonOutlook>,
  currentStrength: number,
): SquadStrengthPoint[] {
  // Bucket by each player's own recency index (0 = their most recently
  // completed season, 1 = the one before that, ...), not by matching season
  // label strings across players. Labels are not a reliable join key once
  // players come from leagues with different season conventions — a
  // calendar-year league (e.g. MLS: "2025") and a split-year league (e.g.
  // "2025-26") can both be a player's most recent season at the same point
  // in time, but their labels never compare equal or sort adjacently, which
  // would otherwise scatter one real "current" snapshot across several
  // near-empty historical points.
  const maxSeasonCount = players.reduce((max, p) => Math.max(max, p.seasonScores.length), 0)

  const observed: SquadStrengthPoint[] = []
  for (let index = maxSeasonCount - 1; index >= 0; index -= 1) {
    const byPosition = new Map<Position, number[]>()
    for (const position of POSITIONS) byPosition.set(position, [])
    const labels: string[] = []
    for (const player of players) {
      const seasonScore = player.seasonScores[index]
      if (!seasonScore) continue
      // The most recent season (index 0) uses the player's blended
      // currentPerformanceScore rather than that single season's own
      // shrunkScore, so this point is computed on exactly the same basis as
      // currentStrength below. Older seasons have no such blend to draw on —
      // there is no "current score as of two years ago" — so they fall back
      // to that season's own shrunk score.
      const value = index === 0 ? player.forecast.currentPerformanceScore : seasonScore.shrunkScore
      byPosition.get(player.primaryPosition)?.push(value)
      labels.push(seasonScore.season)
    }
    if (labels.length === 0) continue
    observed.push({
      season: mostCommon(labels),
      observed: round(squadStrengthFrom(byPosition), 1),
      projectedMedian: null,
      projectedLow: null,
      projectedHigh: null,
      kind: 'observed' as const,
    })
  }

  const lastSeason = observed[observed.length - 1]?.season ?? '2025-26'
  const startYear = Number(lastSeason.slice(0, 4))
  const seasonLabel = (offsetYears: number) => {
    const y = startYear + offsetYears
    return `${y}-${String((y + 1) % 100).padStart(2, '0')}`
  }

  // Join point: the projection line starts at the current observed value so the
  // two series meet rather than appearing as a discontinuity.
  if (observed.length > 0) {
    const last = observed[observed.length - 1]
    last.projectedMedian = currentStrength
    last.projectedLow = currentStrength
    last.projectedHigh = currentStrength
  }

  const projected: SquadStrengthPoint[] = HORIZONS.map((horizon) => ({
    season: seasonLabel(horizon / 12),
    observed: null,
    projectedMedian: horizons[horizon].median,
    projectedLow: horizons[horizon].low,
    projectedHigh: horizons[horizon].high,
    kind: 'projected' as const,
  }))

  return [...observed, ...projected]
}

export function buildSquadOutlook(players: Player[], asOfIso: string): SquadOutlook {
  const { horizons, currentStrength } = simulateSquad(players)
  const positionalGroups = buildPositionalGroupOutlooks(players)
  const depthByPosition = POSITIONS.map((position) => buildPositionDepth(players, position, positionalGroups))
  const history = buildHistory(players, horizons, currentStrength)

  const observedPoints = history.filter((p) => p.observed !== null)
  const previousSeasonStrength =
    observedPoints.length >= 2
      ? (observedPoints[observedPoints.length - 2].observed as number)
      : currentStrength

  const strengthening = depthByPosition
    .filter((d) => d.playerCount > 0 && d.projectedStrength - d.currentStrength >= 1)
    .sort((a, b) => b.projectedStrength - b.currentStrength - (a.projectedStrength - a.currentStrength))

  const atRisk = depthByPosition
    .filter(
      (d) =>
        d.playerCount > 0 &&
        (d.projectedStrength - d.currentStrength <= -1 ||
          d.depthRisk === 'high' ||
          d.depthRisk === 'critical'),
    )
    .sort((a, b) => a.projectedStrength - a.currentStrength - (b.projectedStrength - b.currentStrength))

  const highRiskGroups = positionalGroups.filter(
    (g) => g.risk.overallRisk === 'high' || g.risk.overallRisk === 'critical',
  )
  const monitorGroups = positionalGroups.filter((g) => g.risk.overallRisk === 'moderate')
  const lowRiskGroups = positionalGroups.filter((g) => g.risk.overallRisk === 'low')

  return {
    currentStrength,
    previousSeasonStrength: round(previousSeasonStrength, 1),
    changeFromPreviousSeason: round(currentStrength - previousSeasonStrength, 1),
    averageSquadAge: round(
      mean(players.filter((p) => p.nationalTeamLevel === 'senior').map((p) => p.exactAge)),
      1,
    ),
    regularMinutesCount: players.filter(
      (p) => p.minutesPercentage >= MODEL_CONFIG.regularMinutesThreshold,
    ).length,
    strongLeagueCount: players.filter(
      (p) => p.leagueStrength >= MODEL_CONFIG.strongLeagueThreshold,
    ).length,
    emergingPipelineCount: players.filter(
      (p) => p.age <= 21 && p.forecast.projections[24].median >= 52,
    ).length,
    poolSize: players.length,
    horizons,
    history,
    depthByPosition,
    strengthening,
    atRisk,
    positionalGroups,
    highRiskGroups,
    monitorGroups,
    lowRiskGroups,
    simulations: MODEL_CONFIG.simulations,
    dataLastUpdated: asOfIso,
  }
}
