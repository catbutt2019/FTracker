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
 * Metric groups where goal involvement is not actually diagnostic of the
 * job — a centre-back or holding midfielder recording zero goals and assists
 * all season is completely normal, unlike a forward or creator, for whom it
 * is close to the point of the role. `goalInvolvement90` still counts for
 * these groups when it sits alongside at least one genuinely position-
 * specific metric, but it is never allowed to stand alone: because
 * `scoreSeason` renormalises around whichever metrics are actually present,
 * a season with nothing else recorded would otherwise let this one weak,
 * tangential number become 100% of the weighted score, which reads as "this
 * defender had a bad season" when the honest reading is "we know nothing
 * about this defender's defending this season".
 */
const GOAL_INVOLVEMENT_SUPPLEMENTARY_ONLY: readonly MetricGroup[] = ['defender', 'midfielder']

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

  const isPresent = (key: string) => {
    const value = season.positionSpecificMetrics[key]
    return value !== null && value !== undefined && !Number.isNaN(value)
  }

  // See GOAL_INVOLVEMENT_SUPPLEMENTARY_ONLY: for defenders and midfielders,
  // goal involvement only counts when some other, genuinely position-specific
  // metric is also present this season.
  const suppressGoalInvolvementAlone =
    GOAL_INVOLVEMENT_SUPPLEMENTARY_ONLY.includes(group) &&
    defs.some((d) => d.key === 'goalInvolvement90' && isPresent(d.key)) &&
    defs.filter((d) => d.key !== 'goalInvolvement90').every((d) => !isPresent(d.key))

  for (const def of defs) {
    const value =
      suppressGoalInvolvementAlone && def.key === 'goalInvolvement90'
        ? null
        : season.positionSpecificMetrics[def.key]
    if (value === null || value === undefined || Number.isNaN(value)) {
      missingMetrics.push(def.key)
      continue
    }
    const pct = metricPercentile(group, def.key, value, cohort, def.higherIsBetter)
    weighted += pct * def.weight
    usedWeight += def.weight
  }

  // `50` here is a placeholder for "nothing was measured", not a finding. It is
  // deliberately never given a context adjustment below — see `measured`.
  const measured = usedWeight > 0
  const rawScore = measured ? weighted / usedWeight : 50
  const coverage = totalDefinedWeight > 0 ? usedWeight / totalDefinedWeight : 0

  // `groupMeans` is empty during the provisional pass inside buildCohort, which
  // only consumes `adjustedScore`, so the neutral 50 fallback is never surfaced.
  const groupMean = cohort.groupMeans[group] ?? 50

  // Context adjustment. A percentile is relative to the Irish pool, not to the
  // standard of opposition, so a score earned in a stronger league is nudged up
  // and one earned in a weaker league nudged down, around a neutral midpoint.
  //
  // It applies only where something was actually measured. A league adjustment
  // is a correction *to an observation*; with no observation there is nothing to
  // correct, and applying it to the placeholder above converts "we know nothing
  // about this player" into "this player is above average, because his club is".
  //
  // That was not hypothetical. 28 of the 84 players in this dataset have no
  // position-specific metric in any season, and every one of them scored
  // exactly `50 + league bonus`: 59.1 in the Premier League, 54.1 in the
  // Championship, 49.2 in League One. The league badge was therefore doing
  // 100% of the discriminating work across a third of the squad, and it
  // outranked real evidence — Matt Doherty and Alex Murphy, with nothing
  // recorded, both placed above Liam Scales, whose season is 76% covered.
  //
  // With no measurement the honest score is the group mean: the arithmetic
  // statement of "no information about this player either way". Note this is
  // not a penalty. Absence of evidence stays strictly neutral here, exactly as
  // it does in MATCHDAY_INVOLVEMENT — pushing unmeasured players *below* the
  // mean would invent negative evidence, which is the same error in the
  // opposite direction.
  let adjustedScore: number
  if (measured) {
    const leagueDelta =
      ((season.leagueStrength - 60) / 40) * MODEL_CONFIG.leagueAdjustmentStrength * 100
    const clubDelta = ((season.clubStrength - 55) / 45) * MODEL_CONFIG.clubAdjustmentStrength * 100
    adjustedScore = clamp(rawScore + leagueDelta * 0.5 + clubDelta * 0.5, 1, 99)
  } else {
    adjustedScore = clamp(groupMean, 1, 99)
  }

  // Single-season shrinkage. Shrinkage moves an observed score toward the mean
  // in proportion to how much it can be trusted; an unmeasured season is
  // already *at* the mean, so there is nothing to move and `reliability` — which
  // is about the weight of evidence — has no bearing on it.
  const seasonReliability = reliability(season.minutes, coverage, season.appearances)
  const shrunkScore = measured
    ? groupMean + seasonReliability * (adjustedScore - groupMean)
    : groupMean

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

export function playingTimeStatus(minutesPercentage: number | null): PlayingTimeStatus {
  // Unknown, not minimal. Most seasons in this dataset carry appearances with
  // no minutes total, and grading those as "minimal minutes" libelled players
  // who were in fact regular starters.
  if (minutesPercentage === null) return 'unknown'
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
 *
 * `weightedAppearances` is only consulted when there is no minutes figure at
 * all. Some sources report appearances and goals/assists for a season but
 * never publish minutes — treating that as "0 minutes played" would make a
 * real 28-appearance season indistinguishable from a player who never got on
 * the pitch, and would silently override every other metric with the
 * regression-to-the-mean fallback. Falling back to appearances keeps that
 * distinction honest without inventing a specific minutes total.
 *
 * `null` and `0` are both routed to that fallback but mean different things:
 * `null` is "minutes were never published", which is the common case in this
 * dataset, while `0` is the genuine "named in the squad, never played". The
 * fallback is right for both — with no minutes to weigh, appearances are the
 * only available measure of sample size — but only `null` should ever be
 * *displayed* as unknown. See `SeasonRecord.minutes` in types/domain.ts.
 */
export function reliability(
  weightedMinutes: number | null,
  coverage: number,
  weightedAppearances = 0,
): number {
  const minutesFactor =
    weightedMinutes !== null && weightedMinutes > 0
      ? weightedMinutes / (weightedMinutes + MODEL_CONFIG.reliabilityMinutes)
      : weightedAppearances / (weightedAppearances + MODEL_CONFIG.reliabilityAppearances)
  const coverageFactor = 0.6 + 0.4 * clamp(coverage, 0, 1)
  return clamp(minutesFactor * coverageFactor, 0, MODEL_CONFIG.maxReliability)
}
