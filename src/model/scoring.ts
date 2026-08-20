import type {
  MetricGroup,
  MetricScore,
  PlayerRaw,
  PlayingTimeStatus,
  SeasonRecord,
  SeasonScore,
} from '@/types/domain'
import { POSITION_METRIC_GROUP } from '@/types/domain'
import { MODEL_CONFIG } from './config'
import { metricsFor } from './metrics'
import { clamp, mean, percentileRank, round } from './math'

/**
 * Distribution of every metric within every metric group, pooled across all
 * players and all seasons in the dataset.
 *
 * Pooling seasons is a deliberate trade-off: it triples the sample size that
 * percentiles are drawn from, and it means a score from 2023-24 is directly
 * comparable with one from 2025-26. The cost is that it cannot detect a
 * league-wide shift in a metric over time.
 */
export interface Cohort {
  /** group -> metric key -> sorted values actually supplied. */
  distributions: Record<string, Record<string, number[]>>
  /** group -> mean adjusted season score, the target for regression to the mean. */
  groupMeans: Record<string, number>
}

function emptyDistributions(): Record<string, Record<string, number[]>> {
  return {}
}

export function buildCohort(players: PlayerRaw[]): Cohort {
  const distributions = emptyDistributions()

  for (const player of players) {
    const group = POSITION_METRIC_GROUP[player.primaryPosition]
    distributions[group] ??= {}
    for (const season of player.seasons) {
      for (const def of metricsFor(group)) {
        const value = season.positionSpecificMetrics[def.key]
        if (value === null || value === undefined || Number.isNaN(value)) continue
        distributions[group][def.key] ??= []
        distributions[group][def.key].push(value)
      }
    }
  }

  for (const group of Object.keys(distributions)) {
    for (const key of Object.keys(distributions[group])) {
      distributions[group][key].sort((a, b) => a - b)
    }
  }

  // Group means require season scores, which require the distributions above,
  // so this is a deliberate second pass with a neutral placeholder mean.
  const provisional: Cohort = { distributions, groupMeans: {} }
  const byGroup: Record<string, number[]> = {}
  for (const player of players) {
    const group = POSITION_METRIC_GROUP[player.primaryPosition]
    byGroup[group] ??= []
    for (const season of player.seasons) {
      byGroup[group].push(scoreSeason(season, group, provisional).adjustedScore)
    }
  }

  const groupMeans: Record<string, number> = {}
  for (const group of Object.keys(byGroup)) {
    groupMeans[group] = round(mean(byGroup[group]), 2)
  }

  return { distributions, groupMeans }
}

/** Percentile of one metric value within its cohort, honouring direction. */
export function metricPercentile(
  group: MetricGroup,
  key: string,
  value: number,
  cohort: Cohort,
  higherIsBetter: boolean,
): number {
  const population = cohort.distributions[group]?.[key] ?? []
  const raw = percentileRank(value, population)
  return higherIsBetter ? raw : 100 - raw
}

export function scoreMetrics(
  season: SeasonRecord,
  group: MetricGroup,
  cohort: Cohort,
): MetricScore[] {
  return metricsFor(group).map((def) => {
    const value = season.positionSpecificMetrics[def.key]
    const present = value !== null && value !== undefined && !Number.isNaN(value)
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      value: present ? (value as number) : null,
      unit: def.unit,
      percentile: present
        ? round(metricPercentile(group, def.key, value as number, cohort, def.higherIsBetter), 1)
        : null,
      higherIsBetter: def.higherIsBetter,
      weight: def.weight,
    }
  })
}

/**
 * Turn one season into a 0-100 score.
 *
 * Missing metrics are dropped and the remaining weights renormalised, rather
 * than substituted with an average value. Substituting would quietly invent
 * data; dropping loses information but is honest, and the lost weight is
 * reported as `metricCoverage` so the UI can say so and confidence can fall.
 */
export function scoreSeason(
  season: SeasonRecord,
  group: MetricGroup,
  cohort: Cohort,
): SeasonScore {
  const defs = metricsFor(group)
  let weighted = 0
  let usedWeight = 0
  const missingMetrics: string[] = []
  const totalDefinedWeight = defs.reduce((sum, d) => sum + d.weight, 0)

  for (const def of defs) {
    const value = season.positionSpecificMetrics[def.key]
    if (value === null || value === undefined || Number.isNaN(value)) {
      missingMetrics.push(def.key)
      continue
    }
    const pct = metricPercentile(group, def.key, value, cohort, def.higherIsBetter)
    weighted += pct * def.weight
    usedWeight += def.weight
  }

  const rawScore = usedWeight > 0 ? weighted / usedWeight : 50
  const coverage = totalDefinedWeight > 0 ? usedWeight / totalDefinedWeight : 0

  // Context adjustment. A percentile is relative to the Irish pool, not to the
  // standard of opposition, so a score earned in a stronger league is nudged up
  // and one earned in a weaker league nudged down, around a neutral midpoint.
  const leagueDelta = ((season.leagueStrength - 60) / 40) * MODEL_CONFIG.leagueAdjustmentStrength * 100
  const clubDelta = ((season.clubStrength - 55) / 45) * MODEL_CONFIG.clubAdjustmentStrength * 100
  const adjustedScore = clamp(rawScore + leagueDelta * 0.5 + clubDelta * 0.5, 1, 99)

  // Single-season shrinkage. `groupMeans` is empty during the provisional pass
  // inside buildCohort, which only consumes `adjustedScore`, so the neutral 50
  // fallback there is never surfaced.
  const groupMean = cohort.groupMeans[group] ?? 50
  const seasonReliability = reliability(season.minutes, coverage)
  const shrunkScore = groupMean + seasonReliability * (adjustedScore - groupMean)

  return {
    season: season.season,
    club: season.club,
    league: season.league,
    minutes: season.minutes,
    starts: season.starts,
    minutesPercentage: season.minutesPercentage,
    rawScore: round(rawScore, 1),
    adjustedScore: round(adjustedScore, 1),
    shrunkScore: round(clamp(shrunkScore, 1, 99), 1),
    metricCoverage: round(coverage, 3),
    missingMetrics,
  }
}

export function playingTimeStatus(minutesPercentage: number): PlayingTimeStatus {
  if (minutesPercentage >= 0.7) return 'nailed-on'
  if (minutesPercentage >= 0.4) return 'rotation'
  if (minutesPercentage >= 0.18) return 'fringe'
  return 'minimal'
}

/**
 * How far to trust the observed score, 0-1.
 *
 * Two independent things can make a sample unreliable: not enough football
 * played, and not enough metrics supplied. Both must be adequate, so they are
 * combined multiplicatively rather than averaged — a full season of minutes
 * with only two of five metrics available is still a weak basis for a forecast.
 */
export function reliability(weightedMinutes: number, coverage: number): number {
  const minutesFactor =
    weightedMinutes / (weightedMinutes + MODEL_CONFIG.reliabilityMinutes)
  const coverageFactor = 0.6 + 0.4 * clamp(coverage, 0, 1)
  return clamp(minutesFactor * coverageFactor, 0, MODEL_CONFIG.maxReliability)
}
