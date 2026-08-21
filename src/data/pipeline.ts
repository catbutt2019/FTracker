import type { Player, PlayerRaw, SquadOutlook } from '@/types/domain'
import { POSITION_METRIC_GROUP } from '@/types/domain'
import { buildCohort, playingTimeStatus, scoreMetrics } from '@/model/scoring'
import { forecastPlayer } from '@/model/forecast'
import { buildSquadOutlook } from '@/model/squad'
import { percentileRank, round } from '@/model/math'

export interface Dataset {
  players: Player[]
  outlook: SquadOutlook
  asOfDate: string
  sourceLabel: string
  isDemonstrationData: boolean
}

/**
 * Turn raw provider records into the fully derived view model.
 *
 * Order matters. Percentiles are relative to the pool, so the cohort has to be
 * built from every player before any single player can be scored — which also
 * means adding or removing a player legitimately shifts everyone else's score.
 * That is a property of a relative measure, not a bug, and it is documented on
 * the methodology page.
 */
export function assembleDataset(
  raw: PlayerRaw[],
  meta: { asOfDate: string; sourceLabel: string; isDemonstrationData: boolean },
): Dataset {
  const asOf = new Date(meta.asOfDate)
  const cohort = buildCohort(raw)

  const players: Player[] = raw.map((player) => {
    const group = POSITION_METRIC_GROUP[player.primaryPosition]
    const { forecast, seasonScores, exactAge } = forecastPlayer(player, cohort, asOf)
    const latest = player.seasons[0]

    return {
      ...player,
      age: Math.floor(exactAge),
      exactAge: round(exactAge, 2),
      // Display club/league come from `currentClub`, not `seasons[0]`: a
      // transfer can move a player before there is a completed season of
      // performance data at the new club, and the header shouldn't lag
      // behind reality just because the score honestly does. The score
      // itself is untouched — it is still built entirely from `seasons`.
      club: player.currentClub.club,
      league: player.currentClub.league,
      season: latest.season,
      leagueStrength: player.currentClub.leagueStrength,
      clubStrength: latest.clubStrength,
      appearances: latest.appearances,
      starts: latest.starts,
      minutes: latest.minutes,
      minutesPercentage: latest.minutesPercentage,
      goals: latest.goals,
      assists: latest.assists,
      injuryDays: latest.injuryDays,
      playingTimeStatus: playingTimeStatus(latest.minutesPercentage),
      metricGroup: group,
      metrics: scoreMetrics(latest, group, cohort),
      seasonScores,
      forecast,
      // Filled in below, once every score exists.
      poolPercentile: 0,
    }
  })

  const allScores = players.map((p) => p.forecast.currentPerformanceScore)
  for (const player of players) {
    player.poolPercentile = round(
      percentileRank(player.forecast.currentPerformanceScore, allScores),
      0,
    )
  }

  return {
    players,
    outlook: buildSquadOutlook(players, meta.asOfDate),
    asOfDate: meta.asOfDate,
    sourceLabel: meta.sourceLabel,
    isDemonstrationData: meta.isDemonstrationData,
  }
}
