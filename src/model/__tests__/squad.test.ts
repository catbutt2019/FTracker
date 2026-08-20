import { describe, expect, it } from 'vitest'
import type { Player, Position } from '@/types/domain'
import { POSITIONS } from '@/types/domain'
import { simulateSquad, squadStrengthFrom } from '../squad'
import { HORIZONS } from '../forecast'
import { assembleDataset } from '@/data/pipeline'
import { DEMO_AS_OF, generateDemoPlayers } from '@/data/demo/generate'

function dataset() {
  return assembleDataset(generateDemoPlayers(), {
    asOfDate: DEMO_AS_OF,
    sourceLabel: 'Demonstration dataset',
    isDemonstrationData: true,
  })
}

function scoreMap(entries: Partial<Record<Position, number[]>>): Map<Position, number[]> {
  const map = new Map<Position, number[]>()
  for (const position of POSITIONS) map.set(position, entries[position] ?? [])
  return map
}

describe('squadStrengthFrom', () => {
  it('is driven by the best available players, not the size of the pool', () => {
    const strong = scoreMap({ CB: [80, 78] })
    const strongPlusFringe = scoreMap({ CB: [80, 78, 30, 28, 25] })
    // Adding fringe players who would never be selected must not weaken the
    // national team's assessed strength.
    expect(squadStrengthFrom(strongPlusFringe)).toBe(squadStrengthFrom(strong))
  })

  it('rises when a better player is added', () => {
    const before = squadStrengthFrom(scoreMap({ CB: [60, 58] }))
    const after = squadStrengthFrom(scoreMap({ CB: [88, 60, 58] }))
    expect(after).toBeGreaterThan(before)
  })

  it('penalises a position that cannot even fill its slots', () => {
    const oneBody = squadStrengthFrom(scoreMap({ CB: [80] }))
    const twoBodies = squadStrengthFrom(scoreMap({ CB: [80, 80] }))
    expect(oneBody).toBeLessThan(twoBodies)
  })

  it('returns zero for an entirely empty pool rather than throwing', () => {
    expect(squadStrengthFrom(scoreMap({}))).toBe(0)
  })

  it('weights positions according to the published weights', () => {
    // Centre-back carries more weight than right-back, so the same score placed
    // at centre-back should move the total further.
    const atCb = squadStrengthFrom(scoreMap({ CB: [90, 90], RB: [40, 40] }))
    const atRb = squadStrengthFrom(scoreMap({ CB: [40, 40], RB: [90, 90] }))
    expect(atCb).toBeGreaterThan(atRb)
  })
})

describe('simulateSquad', () => {
  const { players } = dataset()

  it('produces probabilities summing to 100 at every horizon', () => {
    const { horizons } = simulateSquad(players)
    for (const horizon of HORIZONS) {
      const h = horizons[horizon]
      expect(h.improveProbability + h.stableProbability + h.declineProbability).toBe(100)
    }
  })

  it('orders the simulated range low <= median <= high', () => {
    const { horizons } = simulateSquad(players)
    for (const horizon of HORIZONS) {
      const h = horizons[horizon]
      expect(h.low).toBeLessThanOrEqual(h.median)
      expect(h.median).toBeLessThanOrEqual(h.high)
    }
  })

  it('widens the simulated range at longer horizons', () => {
    const { horizons } = simulateSquad(players)
    const width = (h: 12 | 24 | 36) => horizons[h].high - horizons[h].low
    expect(width(36)).toBeGreaterThan(width(12))
  })

  it('is deterministic, so the headline probability never changes on refresh', () => {
    const first = simulateSquad(players)
    const second = simulateSquad(players)
    expect(second).toEqual(first)
  })

  it('keeps a spread wide enough to be honest about how coarse the model is', () => {
    // Regression guard. An earlier version drew players independently, which
    // collapsed the 80% squad range to about a point and made a rough model
    // look precise. Correlated draws must keep the range meaningfully wide.
    const { horizons } = simulateSquad(players)
    expect(horizons[24].high - horizons[24].low).toBeGreaterThan(5)
  })

  it('does not park every outcome in one bucket', () => {
    const { horizons } = simulateSquad(players)
    for (const horizon of HORIZONS) {
      const h = horizons[horizon]
      expect(Math.max(h.improveProbability, h.declineProbability)).toBeLessThan(95)
    }
  })

  it('runs the configured number of simulations without producing out-of-range strengths', () => {
    const { horizons, currentStrength } = simulateSquad(players)
    expect(currentStrength).toBeGreaterThan(0)
    expect(currentStrength).toBeLessThan(99)
    for (const horizon of HORIZONS) {
      expect(horizons[horizon].low).toBeGreaterThan(0)
      expect(horizons[horizon].high).toBeLessThan(99)
    }
  })
})

describe('buildSquadOutlook', () => {
  const { players, outlook } = dataset()

  it('covers all nine positions in the depth chart', () => {
    expect(outlook.depthByPosition).toHaveLength(POSITIONS.length)
    expect(outlook.depthByPosition.map((d) => d.position)).toEqual([...POSITIONS])
  })

  it('gives every position with players a stated depth-risk reason', () => {
    for (const depth of outlook.depthByPosition) {
      if (depth.playerCount === 0) continue
      expect(depth.depthRiskReason.length).toBeGreaterThan(20)
    }
  })

  it('separates observed history from projections, with no point claiming both', () => {
    for (const point of outlook.history) {
      if (point.kind === 'projected') {
        expect(point.observed).toBeNull()
        expect(point.projectedMedian).not.toBeNull()
      }
    }
    expect(outlook.history.some((p) => p.kind === 'observed')).toBe(true)
    expect(outlook.history.some((p) => p.kind === 'projected')).toBe(true)
  })

  it('joins the projection line to the last observed point so the chart is continuous', () => {
    const observed = outlook.history.filter((p) => p.kind === 'observed')
    const last = observed[observed.length - 1]
    expect(last.projectedMedian).toBe(outlook.currentStrength)
  })

  it('computes history on the same basis as the current score, leaving no cliff at the join', () => {
    // Regression guard. History was once built from unshrunk season scores
    // while the current score was shrunk, which put a large artificial drop at
    // the point where observed data met the projection.
    const observed = outlook.history.filter((p) => p.observed !== null)
    const lastObserved = observed[observed.length - 1].observed as number
    expect(Math.abs(lastObserved - outlook.currentStrength)).toBeLessThan(2.5)
  })

  it('reports counts that are consistent with the underlying players', () => {
    expect(outlook.poolSize).toBe(players.length)
    expect(outlook.regularMinutesCount).toBeLessThanOrEqual(players.length)
    expect(outlook.strongLeagueCount).toBeLessThanOrEqual(players.length)
    expect(outlook.emergingPipelineCount).toBeLessThanOrEqual(players.length)
  })

  it('computes average squad age from senior players only', () => {
    const seniors = players.filter((p) => p.nationalTeamLevel === 'senior')
    const expected =
      seniors.reduce((sum, p) => sum + p.exactAge, 0) / seniors.length
    expect(outlook.averageSquadAge).toBeCloseTo(expected, 0)
  })

  it('does not list the same position as both strengthening and at risk on trend alone', () => {
    const strengthening = new Set(outlook.strengthening.map((d) => d.position))
    for (const risk of outlook.atRisk) {
      if (strengthening.has(risk.position)) {
        // Only permitted where the position is projected to improve but is still
        // structurally thin, which is a genuine combination.
        expect(['high', 'critical']).toContain(risk.depthRisk)
      }
    }
  })

  it('surfaces the thin positions built into the demonstration dataset', () => {
    const leftBack = outlook.depthByPosition.find((d) => d.position === 'LB')
    expect(leftBack).toBeDefined()
    expect(leftBack!.playerCount).toBeLessThan(5)
    expect(['moderate', 'high', 'critical']).toContain(leftBack!.depthRisk)
  })
})

describe('assembleDataset', () => {
  it('assigns a pool percentile to every player', () => {
    const { players } = dataset()
    for (const player of players) {
      expect(player.poolPercentile).toBeGreaterThanOrEqual(0)
      expect(player.poolPercentile).toBeLessThanOrEqual(100)
    }
  })

  it('ranks the highest-scoring player at the top of the pool', () => {
    const { players } = dataset()
    const best = [...players].sort(
      (a, b) => b.forecast.currentPerformanceScore - a.forecast.currentPerformanceScore,
    )[0]
    expect(best.poolPercentile).toBeGreaterThan(90)
  })

  it('flattens the latest season onto the player for table display', () => {
    const { players } = dataset()
    for (const player of players) {
      const latest = player.seasons[0]
      expect(player.club).toBe(latest.club)
      expect(player.minutes).toBe(latest.minutes)
      expect(player.season).toBe(latest.season)
    }
  })

  it('marks the demonstration dataset as such, so provenance is never lost', () => {
    const data = dataset()
    expect(data.isDemonstrationData).toBe(true)
    expect(data.sourceLabel).toBe('Demonstration dataset')
  })

  it('includes players at all three national-team levels', () => {
    const { players } = dataset()
    const levels = new Set(players.map((p: Player) => p.nationalTeamLevel))
    expect(levels).toEqual(new Set(['senior', 'u21', 'emerging']))
  })
})
