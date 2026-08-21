import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Info, ShieldQuestion } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState, InfoHint, NotSupplied, SectionHeading, StatCard } from '@/components/Primitives'
import { ConfidenceIndicator, DeltaValue, TrajectoryBadge } from '@/components/Indicators'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { ProbabilityBar, RangeBar } from '@/components/ProbabilityBar'
import {
  AgeCurveChart,
  MetricPercentileChart,
  PlayerTrendChart,
} from '@/components/charts/PlayerCharts'
import { usePlayer } from '@/hooks/useDataset'
import { HORIZONS } from '@/model/forecast'
import { MODEL_CONFIG } from '@/model/config'
import {
  ELIGIBILITY_LABELS,
  NATIONAL_TEAM_LEVEL_LABELS,
  PLAYING_TIME_LABELS,
  POSITION_LABELS,
  type Player,
} from '@/types/domain'

export function PlayerDetail() {
  const { id } = useParams<{ id: string }>()
  const player = usePlayer(id)

  if (!player) {
    return (
      <EmptyState
        title="Player not found"
        description="No tracked player matches this address. They may have been removed from the dataset, or the link may be out of date."
        action={
          <Link
            to="/players"
            className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
          >
            Back to all players
          </Link>
        }
      />
    )
  }

  const { forecast } = player

  return (
    <div className="space-y-10">
      <div>
        <Link
          to="/players"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          All players
        </Link>
      </div>

      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <PlayerAvatar name={player.name} imageUrl={player.avatarUrl} size="lg" />
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{player.name}</h1>
              <p className="text-sm text-muted-foreground">
                {POSITION_LABELS[player.primaryPosition]} · age {player.age} · {player.club} (
                {player.league})
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TrajectoryBadge trajectory={forecast.trajectory} />
            <ConfidenceIndicator level={forecast.predictionConfidence} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-normal">
            {NATIONAL_TEAM_LEVEL_LABELS[player.nationalTeamLevel]}
          </Badge>
          <Badge variant="outline" className="font-normal">
            {ELIGIBILITY_LABELS[player.nationalityStatus]}
          </Badge>
          <Badge variant="outline" className="font-normal">
            {PLAYING_TIME_LABELS[player.playingTimeStatus]}
          </Badge>
          {player.secondaryPositions.length > 0 && (
            <Badge variant="outline" className="font-normal">
              Also {player.secondaryPositions.join(', ')}
            </Badge>
          )}
        </div>
      </header>

      <section>
        <SectionHeading
          title="Where this player is now"
          description="Estimated current ability, and how the model arrived at it from what was actually observed."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Estimated ability"
            value={forecast.currentPerformanceScore.toFixed(1)}
            hint={`A 0-100 score built from ${POSITION_LABELS[player.primaryPosition].toLowerCase()} metrics, ranked against every tracked Irish player in the same metric family, then adjusted for league and club context and pulled toward the average according to sample size.`}
          >
            <DeltaValue value={forecast.seasonOnSeasonChange} suffix=" vs last season" />
          </StatCard>

          <StatCard
            label="Observed score"
            value={forecast.observedScore.toFixed(1)}
            hint="The score before regression to the mean. The gap between this and the estimated ability is the amount the model distrusts the sample."
            footnote={
              Math.abs(forecast.regressionAdjustment) < 0.1
                ? 'Sample large enough that regression barely moved it.'
                : `Regression moved this by ${forecast.regressionAdjustment.toFixed(1)} points toward the positional average.`
            }
          />

          <StatCard
            label="Rank in the Irish pool"
            value={`${Math.round(player.poolPercentile)}th`}
            hint="Percentile of estimated ability against all tracked players, across every position. Useful as a rough sense of standing, but comparing a goalkeeper with a winger is inherently loose."
            footnote="percentile"
          />

          <StatCard
            label="International record"
            value={player.internationalCaps}
            hint="Senior caps as supplied by the data source. International minutes are not scored — the samples are too small — but they indicate how established a player already is."
            footnote={
              player.internationalMinutes > 0
                ? `${player.internationalMinutes.toLocaleString()} international minutes`
                : 'minutes not tracked for caps'
            }
          />
        </div>
      </section>

      <section>
        <SectionHeading
          title="Projected ability"
          description="The range is the forecast. The midpoint is only the middle of it, and should not be read as the expected outcome."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {HORIZONS.map((horizon) => {
            const projection = forecast.projections[horizon]
            return (
              <Card key={horizon} className="border-border/70 bg-card/60">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-sm font-medium">
                    <span>{horizon} months</span>
                    <InfoHint label={`How the ${horizon}-month range is produced`}>
                      The midpoint is today's estimate plus the positional age effect and a damped
                      carry-over of recent form. The width comes from confidence: it grows with the
                      square root of the horizon, and widens further when playing time or metric
                      coverage is thin.
                    </InfoHint>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <RangeBar
                    low={projection.low}
                    median={projection.median}
                    high={projection.high}
                    current={forecast.currentPerformanceScore}
                  />
                  <Separator className="bg-border/60" />
                  <ProbabilityBar probabilities={projection.probabilities} />
                </CardContent>
              </Card>
            )
          })}
        </div>
        <p className="mt-3 max-w-3xl text-xs leading-relaxed text-muted-foreground">
          Improve, stable and decline are exhaustive and sum to 100%. &ldquo;Stable&rdquo; means
          finishing within {MODEL_CONFIG.stableBandPoints} points of today&rsquo;s estimate, so a
          player can be developing well and still land there.
        </p>
      </section>

      <section>
        <SectionHeading
          title="Why the model says this"
          description="Every projection on this page is reducible to these statements. If they do not convince you, the number should not either."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <ReasonCard
            title="What supports this forecast"
            icon={CheckCircle2}
            reasons={forecast.forecastReasons}
            tone="support"
          />
          <ReasonCard
            title="What creates risk and uncertainty"
            icon={ShieldQuestion}
            reasons={forecast.uncertaintyReasons}
            tone="risk"
          />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Age effect over 24 months"
            value={forecast.ageEffect >= 0 ? `+${forecast.ageEffect.toFixed(1)}` : forecast.ageEffect.toFixed(1)}
            hint="Expected drift from the positional age curve alone, holding everything else constant. Scaled by current score, because a high-rated player has more to lose from decline than a low-rated one."
          />
          <StatCard
            label="Form carry-over over 24 months"
            value={
              forecast.momentumEffect >= 0
                ? `+${forecast.momentumEffect.toFixed(1)}`
                : forecast.momentumEffect.toFixed(1)
            }
            hint={`Last season's change carried forward at ${Math.round(MODEL_CONFIG.momentumCarryover * 100)}% strength and capped at ${MODEL_CONFIG.momentumCap} points, so one strong season cannot run away with the projection.`}
          />
        </div>
      </section>

      <section>
        <SectionHeading
          title="Performance over time"
          description="Season scores as observed, continued into the projected range. Solid is what happened; dashed and shaded is what the model guesses."
        />
        <Card className="border-border/70 bg-card/60">
          <CardContent className="pt-6">
            <PlayerTrendChart player={player} />
          </CardContent>
        </Card>
      </section>

      <section>
        <SectionHeading
          title="Club, league and playing time"
          description="Playing time is the strongest single driver of confidence in this model, so the raw record is shown rather than summarised."
        />
        {player.currentClub.changedSinceLastSeason && (
          <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
            <p className="font-medium">
              Now at {player.currentClub.club} ({player.currentClub.league}), not {player.seasons[0].club}
            </p>
            <p className="mt-1 text-amber-800/90 dark:text-amber-200/80">
              {player.currentClub.transferNote ??
                'A club change since the last recorded season was confirmed by research.'}{' '}
              The score and projection below are still built entirely from performance at the
              previous club — this model does not fabricate a season of data for a move that
              hasn&rsquo;t happened on the pitch yet.
            </p>
          </div>
        )}
        <Card className="border-border/70 bg-card/60">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Season</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead>League</TableHead>
                    <TableHead className="text-right">
                      <span className="inline-flex items-center gap-1.5">
                        League strength
                        <InfoHint label="About league strength">
                          A 0-100 rating of the competition on this model&rsquo;s own scale. Scores
                          are nudged up or down by it, because the same output means more against
                          better opposition.
                        </InfoHint>
                      </span>
                    </TableHead>
                    <TableHead className="text-right">Apps</TableHead>
                    <TableHead className="text-right">Starts</TableHead>
                    <TableHead className="text-right">Minutes</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                    <TableHead className="text-right">Days injured</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {player.seasons.map((season, index) => {
                    const score = player.seasonScores.find((s) => s.season === season.season)
                    return (
                      <TableRow key={season.season}>
                        <TableCell className="whitespace-nowrap font-medium">
                          {season.season}
                          {index === 0 && (
                            <span className="ml-2 text-xs text-muted-foreground">latest</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{season.club}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {season.league}
                        </TableCell>
                        <TableCell className="tabular text-right">
                          {season.leagueStrength}
                        </TableCell>
                        <TableCell className="tabular text-right">{season.appearances}</TableCell>
                        <TableCell className="tabular text-right">{season.starts}</TableCell>
                        <TableCell className="tabular text-right">
                          {season.minutes.toLocaleString()}
                        </TableCell>
                        <TableCell className="tabular text-right">
                          {Math.round(season.minutesPercentage * 100)}%
                        </TableCell>
                        <TableCell className="text-right">
                          {season.injuryDays === null ? (
                            <NotSupplied reason="This competition's data provider has no injury feed, so availability could not be checked. Confidence is reduced accordingly rather than assuming the player was fit." />
                          ) : (
                            <span className="tabular">{season.injuryDays}</span>
                          )}
                        </TableCell>
                        <TableCell className="tabular text-right">
                          {score ? score.shrunkScore.toFixed(1) : '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        {player.seasons.length < 3 && (
          <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Only {player.seasons.length}{' '}
            {player.seasons.length === 1 ? 'season is' : 'seasons are'} held for this player, so
            there is little history to establish a trend. This lowers confidence directly.
          </p>
        )}
      </section>

      <section>
        <SectionHeading
          title={`${POSITION_LABELS[player.primaryPosition]} metrics`}
          description="Percentile rank against every tracked Irish player scored on the same metric family, using the latest season. Bars are percentiles rather than raw values so metrics on different scales can sit together."
        />
        <Card className="border-border/70 bg-card/60">
          <CardContent className="pt-6">
            <MetricPercentileChart metrics={player.metrics} />
          </CardContent>
        </Card>
        <MetricTable player={player} />
      </section>

      <section>
        <SectionHeading
          title="Age and development"
          description="The positional age curve the model applies, with this player placed on it. Shown because the age assumption is one of the model's biggest levers and should not be taken on trust."
        />
        <Card className="border-border/70 bg-card/60">
          <CardContent className="pt-6">
            <AgeCurveChart player={player} />
            <p className="mt-4 max-w-3xl text-xs leading-relaxed text-muted-foreground">
              These curves are transparent priors, not fitted parameters. They describe a typical
              trajectory for the position, and individual players routinely depart from them — a
              late developer or an early decline through injury will not be anticipated here.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function ReasonCard({
  title,
  icon: Icon,
  reasons,
  tone,
}: {
  title: string
  icon: typeof CheckCircle2
  reasons: string[]
  tone: 'support' | 'risk'
}) {
  return (
    <Card className="border-border/70 bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Icon
            className={tone === 'support' ? 'size-4 text-shamrock-600' : 'size-4 text-amber-600'}
            aria-hidden="true"
          />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {reasons.map((reason) => (
            <li key={reason} className="flex gap-2.5 text-sm leading-relaxed">
              <span
                className={
                  tone === 'support'
                    ? 'mt-1.5 size-1.5 shrink-0 rounded-full bg-shamrock-500'
                    : 'mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500'
                }
                aria-hidden="true"
              />
              <span className="text-muted-foreground">{reason}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/**
 * The raw values behind the percentile bars.
 *
 * Included alongside the chart because a percentile on its own is not
 * falsifiable by the reader: without the underlying figure there is no way to
 * tell whether the model has the player's output right.
 */
function MetricTable({ player }: { player: Player }) {
  const latest = player.seasonScores[0]
  return (
    <Card className="mt-4 border-border/70 bg-card/60">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Percentile</TableHead>
                <TableHead className="text-right">Weight</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {player.metrics.map((metric) => (
                <TableRow key={metric.key}>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      {metric.label}
                      <InfoHint label={`About ${metric.label}`}>
                        {metric.description}
                        {!metric.higherIsBetter && ' Lower values score better.'}
                      </InfoHint>
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {metric.value === null ? (
                      <NotSupplied reason="This competition's provider does not publish this metric. It is dropped and the remaining metrics reweighted, rather than filled with an estimate." />
                    ) : (
                      <span className="tabular">
                        {metric.value}
                        <span className="ml-1 text-xs text-muted-foreground">{metric.unit}</span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {metric.percentile === null ? '—' : `${Math.round(metric.percentile)}th`}
                  </TableCell>
                  <TableCell className="tabular text-right text-muted-foreground">
                    {Math.round(metric.weight * 100)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="border-t border-border/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          Metric coverage for {latest.season}: {Math.round(latest.metricCoverage * 100)}% of the
          normal weight for this position.
          {latest.metricCoverage < 1
            ? ' The missing share is not estimated; the remaining metrics are reweighted and confidence is reduced.'
            : ' Every metric this position is scored on was supplied.'}
        </div>
      </CardContent>
    </Card>
  )
}
