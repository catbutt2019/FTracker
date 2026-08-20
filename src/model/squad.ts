import type {
  Player,
  Position,
  PositionDepth,
  ProjectionHorizon,
  SquadHorizonOutlook,
  SquadOutlook,
  SquadStrengthPoint,
} from '@/types/domain'
import { POSITIONS, POSITION_LABELS } from '@/types/domain'
import { MODEL_CONFIG, POSITION_SQUAD_WEIGHTS } from './config'
import { HORIZONS } from './forecast'
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
 * Squad strength is the weighted mean of the best N players available in each
 * position, not the mean of the whole pool.
 *
 * This matters: adding a fringe 40-rated left-back to the dataset should not
 * make the national team look weaker, because he would not play. Depth is
 * captured separately through the depth-risk measure.
 */
export function squadStrengthFrom(
  scoresByPosition: Map<Position, number[]>,
  slots = MODEL_CONFIG.squadSlotsPerPosition,
): number {
  let weighted = 0
  let weightUsed = 0
  for (const position of POSITIONS) {
    const scores = (scoresByPosition.get(position) ?? []).slice().sort((a, b) => b - a)
    if (scores.length === 0) continue
    const best = scores.slice(0, slots)
    // A position with fewer bodies than slots is penalised toward a floor
    // value, because an unfilled slot is a real weakness rather than no data.
    const filled = [...best]
    while (filled.length < slots) filled.push(Math.min(35, best[best.length - 1] ?? 35))
    const weight = POSITION_SQUAD_WEIGHTS[position]
    weighted += mean(filled) * weight
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
    // Secondary positions count at a discount when assessing depth, handled by
    // the caller where relevant. Kept out of the strength calculation to avoid
    // double-counting one body across two positions.
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

function depthRisk(
  players: Player[],
  currentStrength: number,
): { level: PositionDepth['depthRisk']; reason: string } {
  const senior = players.filter((p) => p.nationalTeamLevel === 'senior')
  const readyNow = players.filter((p) => p.forecast.currentPerformanceScore >= 55)
  const pipeline = players.filter((p) => p.age <= 23)
  const ageing = players.filter((p) => p.age >= 30 && p.forecast.currentPerformanceScore >= 55)

  if (players.length <= 1) {
    return {
      level: 'critical',
      reason: `Only ${players.length} player${players.length === 1 ? '' : 's'} in the pool listed here as a primary position. One injury leaves no covered option.`,
    }
  }
  if (readyNow.length === 0) {
    return {
      level: 'high',
      reason: 'No player in this position currently scores above the senior-ready threshold of 55.',
    }
  }
  if (ageing.length >= 2 && pipeline.length === 0) {
    return {
      level: 'high',
      reason: `The senior options here are ageing (${ageing.length} aged 30 or over) with nobody aged 23 or under behind them.`,
    }
  }
  if (readyNow.length === 1 || (pipeline.length === 0 && senior.length <= 2)) {
    return {
      level: 'moderate',
      reason:
        readyNow.length === 1
          ? 'Only one player currently clears the senior-ready threshold, so cover is thin.'
          : 'Adequate now, but no under-23 in this position means the pool is not replenishing.',
    }
  }
  if (currentStrength >= 58 && pipeline.length >= 2) {
    return {
      level: 'low',
      reason: `Well stocked: ${readyNow.length} senior-ready options and ${pipeline.length} aged 23 or under.`,
    }
  }
  return {
    level: 'moderate',
    reason: `${readyNow.length} senior-ready options with ${pipeline.length} younger players behind them. Serviceable rather than strong.`,
  }
}

export function buildPositionDepth(
  players: Player[],
  position: Position,
  horizon: ProjectionHorizon = 24,
): PositionDepth {
  const pool = players
    .filter((p) => p.primaryPosition === position)
    .sort((a, b) => b.forecast.currentPerformanceScore - a.forecast.currentPerformanceScore)

  const firstChoice = pool.slice(0, 2)
  const emerging = pool
    .filter((p) => p.age <= 21 && !firstChoice.includes(p))
    .sort((a, b) => b.forecast.projections[horizon].median - a.forecast.projections[horizon].median)
    .slice(0, 3)
  // Emerging players are excluded here rather than listed twice. Showing the
  // same name in two adjacent columns reads as a bug and inflates the apparent
  // depth of the position.
  const futureStarters = pool
    .slice(2)
    .filter((p) => p.forecast.projections[horizon].median >= 52 && !emerging.includes(p))
    .slice(0, 3)

  const currentStrength = pool.length
    ? mean(
        pool
          .map((p) => p.forecast.currentPerformanceScore)
          .sort((a, b) => b - a)
          .slice(0, MODEL_CONFIG.squadSlotsPerPosition),
      )
    : 0

  const bestProjected = pool
    .map((p) => p.forecast.projections[horizon])
    .sort((a, b) => b.median - a.median)
    .slice(0, MODEL_CONFIG.squadSlotsPerPosition)

  const risk = depthRisk(pool, currentStrength)

  return {
    position,
    label: POSITION_LABELS[position],
    firstChoice,
    futureStarters,
    emerging,
    averageAge: pool.length ? round(mean(pool.map((p) => p.age)), 1) : 0,
    currentStrength: round(currentStrength, 1),
    projectedStrength: bestProjected.length ? round(mean(bestProjected.map((p) => p.median)), 1) : 0,
    projectedLow: bestProjected.length ? round(mean(bestProjected.map((p) => p.low)), 1) : 0,
    projectedHigh: bestProjected.length ? round(mean(bestProjected.map((p) => p.high)), 1) : 0,
    depthRisk: risk.level,
    depthRiskReason: risk.reason,
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
export function buildHistory(
  players: Player[],
  horizons: Record<ProjectionHorizon, SquadHorizonOutlook>,
  currentStrength: number,
): SquadStrengthPoint[] {
  const seasons = Array.from(
    new Set(players.flatMap((p) => p.seasonScores.map((s) => s.season))),
  ).sort()

  const observed: SquadStrengthPoint[] = seasons.map((season) => {
    const byPosition = new Map<Position, number[]>()
    for (const position of POSITIONS) byPosition.set(position, [])
    for (const player of players) {
      const seasonScore = player.seasonScores.find((s) => s.season === season)
      if (!seasonScore) continue
      byPosition.get(player.primaryPosition)?.push(seasonScore.shrunkScore)
    }
    return {
      season,
      observed: round(squadStrengthFrom(byPosition), 1),
      projectedMedian: null,
      projectedLow: null,
      projectedHigh: null,
      kind: 'observed' as const,
    }
  })

  const lastSeason = seasons[seasons.length - 1] ?? '2025-26'
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
  const depthByPosition = POSITIONS.map((position) => buildPositionDepth(players, position))
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
    simulations: MODEL_CONFIG.simulations,
    dataLastUpdated: asOfIso,
  }
}
