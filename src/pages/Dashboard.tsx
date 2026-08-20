import { Link } from 'react-router-dom'
import { ArrowRight, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  InfoHint,
  SectionHeading,
  StatCard,
} from '@/components/Primitives'
import { DeltaValue, DepthRiskBadge } from '@/components/Indicators'
import { ProbabilityBar } from '@/components/ProbabilityBar'
import { SquadTrendChart } from '@/components/charts/SquadTrendChart'
import { useDataset } from '@/hooks/useDataset'
import { HORIZONS } from '@/model/forecast'
import { MODEL_CONFIG } from '@/model/config'
import type { ProjectionHorizon, SquadOutlook } from '@/types/domain'

export function Dashboard() {
  const { outlook, players } = useDataset()

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          National-team talent outlook
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          An estimate of whether the pool of players available to the Republic of Ireland men's
          senior team is getting stronger or weaker, built from {outlook.poolSize} tracked players
          and {outlook.simulations.toLocaleString()} simulations. Every figure on this page is a
          range, because a single number would imply a precision this model does not have.
        </p>
        <div className="flex items-start gap-2 rounded-md border border-border/70 bg-card/40 p-3 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-medium text-foreground">
              A stronger talent pool is not the same thing as qualification.
            </span>{' '}
            This model contains no fixtures, no opponents and no competition format, so it says
            nothing about results or reaching a tournament. It only describes the players available.
          </p>
        </div>
      </header>

      <section>
        <SectionHeading
          title="Probability the talent pool improves"
          description="Share of simulations in which projected squad strength finishes more than 1.5 points above its current level. Improve, stable and decline are exhaustive and sum to 100%."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {HORIZONS.map((horizon) => (
            <HorizonCard key={horizon} horizon={horizon} outlook={outlook} />
          ))}
        </div>
      </section>

      <section>
        <SectionHeading title="Where the pool stands today" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Squad strength"
            value={outlook.currentStrength.toFixed(1)}
            hint="A 0-100 weighted score built from the best two available players in each of the nine positions. Because it is based on percentiles within the Irish pool, roughly 50 is average for this group — it is not a rating against the rest of the world."
          >
            <DeltaValue value={outlook.changeFromPreviousSeason} suffix=" vs last season" />
          </StatCard>

          <StatCard
            label="Projected range, 24 months"
            value={`${outlook.horizons[24].low.toFixed(1)}–${outlook.horizons[24].high.toFixed(1)}`}
            hint="The 10th to 90th percentile of simulated outcomes in two years' time. The width of this range is the honest part of the forecast."
            footnote={`Midpoint ${outlook.horizons[24].median.toFixed(1)}`}
          />

          <StatCard
            label="Average squad age"
            value={outlook.averageSquadAge.toFixed(1)}
            hint="Mean age of players currently at senior international level. Under-21 and emerging players are excluded so that the figure describes the present squad rather than the whole pool."
          />

          <StatCard
            label="Pool size"
            value={outlook.poolSize}
            hint="Total tracked players across senior, under-21 and emerging levels."
            footnote={`${players.filter((p) => p.nationalTeamLevel === 'senior').length} senior · ${players.filter((p) => p.nationalTeamLevel === 'u21').length} under-21 · ${players.filter((p) => p.nationalTeamLevel === 'emerging').length} emerging`}
          />

          <StatCard
            label="Regular club minutes"
            value={`${outlook.regularMinutesCount} of ${outlook.poolSize}`}
            hint={`Players who played at least ${Math.round(MODEL_CONFIG.regularMinutesThreshold * 100)}% of available league minutes last season. Playing time is the single strongest driver of confidence in this model.`}
          />

          <StatCard
            label="In strong leagues"
            value={`${outlook.strongLeagueCount} of ${outlook.poolSize}`}
            hint={`Players in competitions rated ${MODEL_CONFIG.strongLeagueThreshold} or above on this model's league-strength scale. League strength adjusts scores up or down, since the same output means more against better opposition.`}
          />

          <StatCard
            label="Emerging pipeline"
            value={outlook.emergingPipelineCount}
            hint="Players aged 21 or under whose 24-month projected midpoint reaches 52 or above — in other words, young players the model thinks could become genuine senior options."
          />

          <StatCard
            label="Previous season strength"
            value={outlook.previousSeasonStrength.toFixed(1)}
            hint="Squad strength recomputed from the season before last, using the same method, so the comparison is like for like."
          />
        </div>
      </section>

      <section>
        <SectionHeading
          title="Squad strength over time"
          description="Observed seasons are drawn as a solid line. Projections are dashed, with a shaded 80% range."
        />
        <Card className="border-border/70 bg-card/60">
          <CardContent className="pt-6">
            <SquadTrendChart data={outlook.history} />
            <p className="mt-4 max-w-3xl text-xs leading-relaxed text-muted-foreground">
              Earlier seasons rest on fewer players, because the dataset holds three seasons for
              established professionals and only one for several younger players. The observed line
              is therefore less reliable the further left you read.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHeading
            title="Positions becoming stronger"
            description="Projected 24-month position strength above the current level."
          />
          <PositionTrendList entries={outlook.strengthening} emptyLabel="No position is projected to strengthen materially over the next 24 months." />
        </div>
        <div>
          <SectionHeading
            title="Positions at risk"
            description="Projected to weaken, or structurally thin regardless of trend."
          />
          <PositionTrendList entries={outlook.atRisk} emptyLabel="No position is currently flagged as at risk." />
        </div>
      </section>

      <section>
        <SectionHeading
          title="Squad depth by position"
          description="Current strength is the mean of the best two available players. Depth risk considers how many bodies are behind them and how old they are."
          action={
            <Link
              to="/depth"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Full depth charts
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          }
        />
        <Card className="border-border/70 bg-card/60">
          <CardContent className="divide-y divide-border/60 p-0">
            {outlook.depthByPosition.map((depth) => (
              <div
                key={depth.position}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
              >
                <div className="min-w-[9.5rem] flex-1">
                  <Link
                    to="/depth"
                    className="text-sm font-medium transition-colors hover:text-shamrock-200"
                  >
                    {depth.label}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {depth.playerCount} tracked · average age {depth.averageAge.toFixed(1)}
                  </p>
                </div>
                <div className="tabular w-20 text-sm">
                  {depth.currentStrength.toFixed(1)}
                  <span className="ml-1 text-xs text-muted-foreground">now</span>
                </div>
                <div className="tabular w-24 text-sm text-muted-foreground">
                  {depth.projectedStrength.toFixed(1)}
                  <span className="ml-1 text-xs">proj.</span>
                </div>
                <div className="w-28">
                  <DeltaValue value={depth.projectedStrength - depth.currentStrength} />
                </div>
                <DepthRiskBadge risk={depth.depthRisk} />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function HorizonCard({
  horizon,
  outlook,
}: {
  horizon: ProjectionHorizon
  outlook: SquadOutlook
}) {
  const data = outlook.horizons[horizon]
  return (
    <Card className="border-border/70 bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span>{horizon} months</span>
          <InfoHint label={`How the ${horizon}-month figure is produced`}>
            Each player's score is sampled from their own projected distribution, with a shared
            factor so that players move partly together. Squad strength is recomputed in each of
            the {outlook.simulations.toLocaleString()} runs, and this is the share of runs landing
            above, within or below a {MODEL_CONFIG.squadStableBandPoints}-point band around today's
            level.
          </InfoHint>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="tabular text-3xl font-semibold leading-none">
            {data.improveProbability}%
          </div>
          <p className="mt-1 text-xs text-muted-foreground">chance the pool is stronger</p>
        </div>
        <ProbabilityBar
          probabilities={{
            improve: data.improveProbability,
            stable: data.stableProbability,
            decline: data.declineProbability,
          }}
        />
        <Separator className="bg-border/60" />
        <div className="space-y-1 text-xs">
          <p className="text-muted-foreground">Projected squad strength</p>
          <p className="tabular text-sm">
            {data.low.toFixed(1)} to {data.high.toFixed(1)}
            <span className="ml-1.5 text-xs text-muted-foreground">
              (midpoint {data.median.toFixed(1)})
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function PositionTrendList({
  entries,
  emptyLabel,
}: {
  entries: SquadOutlook['strengthening']
  emptyLabel: string
}) {
  if (entries.length === 0) {
    return (
      <Card className="border-dashed border-border/70 bg-transparent">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/70 bg-card/60">
      <CardContent className="divide-y divide-border/60 p-0">
        {entries.map((entry) => (
          <div key={entry.position} className="space-y-1.5 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{entry.label}</span>
              <DeltaValue value={entry.projectedStrength - entry.currentStrength} />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {entry.depthRiskReason}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
