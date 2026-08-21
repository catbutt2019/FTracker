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
import { MatchdayPitch } from '@/components/MatchdayPitch'
import { SquadTrendChart } from '@/components/charts/SquadTrendChart'
import { useDataset } from '@/hooks/useDataset'
import { HORIZONS } from '@/model/forecast'
import { MODEL_CONFIG } from '@/model/config'
import { buildMatchdaySelection } from '@/model/matchdayXI'
import { MANUAL_UNAVAILABILITY, NEXT_FIXTURE } from '@/data/nextFixture'
import type {
  Player,
  Position,
  PositionalGroupOutlook,
  ProjectionHorizon,
  SquadOutlook,
} from '@/types/domain'

export function Dashboard() {
  const { outlook, players, asOfDate } = useDataset()

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
            This model contains no opponent data and no competition format, so it says nothing about
            results or reaching a tournament. It only describes the players available. The projected
            eleven below names a fixture, but only to fix a point in time and a set of absences — not
            to forecast the match.
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
            hint="A 0-100 weighted score built from the number of players each of the nine positions actually needs to start, weighted toward the weakest of them so one weak required starter cannot be averaged away. Because it is based on percentiles within the Irish pool, roughly 50 is average for this group — it is not a rating against the rest of the world."
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
            value={`${outlook.regularMinutesCount} of ${outlook.minutesKnownCount}`}
            hint={`Players who played at least ${Math.round(MODEL_CONFIG.regularMinutesThreshold * 100)}% of available league minutes last season. Playing time is the single strongest driver of confidence in this model.`}
            footnote={
              outlook.minutesKnownCount < outlook.poolSize
                ? `Out of the ${outlook.minutesKnownCount} players whose minutes were published. No minutes total exists for the other ${outlook.poolSize - outlook.minutesKnownCount}, so they are neither counted nor assumed to be low.`
                : undefined
            }
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
          title={`Projected XI vs ${NEXT_FIXTURE.opponent}`}
          description="The strongest available eleven on current form, using each player's score today rather than a projection. A label for a fixture, not a forecast of it — this model has no opponent data."
        />
        <MatchdayCard players={players} asOfDate={asOfDate} />
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
            title="Positional risk"
            description="Judged as six positional units (e.g. midfield = DM/CM/AM together) across five independent dimensions: current quality, depth, succession, trend and availability."
          />
          <PositionalRiskSummary outlook={outlook} />
        </div>
      </section>

      <section>
        <SectionHeading
          title="Squad depth by position"
          description="Current strength is built from the number of players each position actually needs to start. Depth risk is inherited from this position's group (e.g. all of DM/CM/AM for midfield) and reflects quality, depth, succession, trend and availability, not just body count."
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
                    className="text-sm font-medium transition-colors hover:text-shamrock-700"
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

const POSITION_LABELS: Record<Position, string> = {
  GK: 'Goalkeeper',
  RB: 'Right-back',
  CB: 'Centre-back',
  LB: 'Left-back',
  DM: 'Defensive midfield',
  CM: 'Central midfield',
  AM: 'Attacking midfield',
  W: 'Wide',
  ST: 'Striker',
}

function MatchdayCard({ players, asOfDate }: { players: Player[]; asOfDate: string }) {
  const selection = buildMatchdaySelection(players, MANUAL_UNAVAILABILITY, asOfDate)
  const { kickoff, competition, venue } = NEXT_FIXTURE

  // Counted rather than stated, so the caveat below cannot go stale the way it
  // already did once: it claimed the field was empty for every player, which
  // stopped being true the moment research round 2 landed.
  const researchedAvailability = players.filter(
    (player) => player.seniorStatus.availabilityStatus !== null,
  ).length

  const fixtureDetail = [
    competition,
    venue ? (venue === 'home' ? 'Home' : venue === 'away' ? 'Away' : 'Neutral venue') : null,
    kickoff
      ? new Date(kickoff).toLocaleDateString('en-IE', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null,
  ].filter(Boolean)

  return (
    <Card className="border-border/70 bg-card/60">
      <CardContent className="space-y-6 pt-6">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">XI strength</p>
            <p className="tabular text-2xl font-semibold">{selection.strength.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              At full availability
            </p>
            <p className="tabular text-2xl font-semibold text-muted-foreground">
              {selection.strengthAtFullAvailability.toFixed(1)}
            </p>
          </div>
          <div className="min-w-[14rem] flex-1">
            {selection.strengthCostOfAbsences === 0 ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {selection.unavailable.length === 0
                  ? 'Nobody is recorded as unavailable, so this is the strongest eleven the pool can field.'
                  : selection.unavailable.length === 1
                    ? 'The absence below costs this XI nothing, because that player was not selected in it on current form.'
                    : 'The absences below cost this XI nothing, because none of those players was selected in it on current form.'}
              </p>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Absences cost{' '}
                <span className="font-medium text-foreground">
                  {Math.abs(selection.strengthCostOfAbsences).toFixed(1)} points
                </span>{' '}
                against the same XI picked from a fully available pool.
              </p>
            )}
          </div>
        </div>

        {fixtureDetail.length > 0 ? (
          <p className="text-xs text-muted-foreground">{fixtureDetail.join(' · ')}</p>
        ) : (
          <div className="flex items-start gap-2 rounded-md border border-border/70 bg-card/40 p-3 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <p>
              No date, competition or venue is recorded for this fixture, so the eleven below is
              simply "strongest available now" rather than "strongest available on match day".
            </p>
          </div>
        )}

        <Separator />

        <MatchdayPitch slots={selection.slots} unfilled={selection.unfilled} />

        {selection.unfilled.length > 0 && (
          <p className="text-xs leading-relaxed text-destructive">
            No available player can fill:{' '}
            {selection.unfilled.map((position) => POSITION_LABELS[position]).join(', ')}.
          </p>
        )}

        {selection.unmatchedUnavailableIds.length > 0 && (
          <p className="text-xs leading-relaxed text-destructive">
            Unavailability recorded for unknown {selection.unmatchedUnavailableIds.length === 1 ? 'player' : 'players'}{' '}
            {selection.unmatchedUnavailableIds.join(', ')} — the id matches nobody in the dataset, so
            the absence has not been applied.
          </p>
        )}

        <Separator />

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recorded as unavailable
          </p>
          {selection.unavailable.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nobody recorded as unavailable.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {selection.unavailable.map((entry) => (
                <li key={entry.player.id} className="flex flex-wrap items-baseline gap-x-2">
                  <Link
                    to={`/players/${entry.player.id}`}
                    className="transition-colors hover:text-shamrock-700"
                  >
                    {entry.player.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {entry.reason} ·{' '}
                    {entry.source === 'researched'
                      ? 'from the research pass'
                      : `entered by hand, noted ${entry.recordedOn}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selection.redundantManualIds.length > 0 && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Research now covers the hand-entered {selection.redundantManualIds.length === 1 ? 'absence' : 'absences'}{' '}
            for {selection.redundantManualIds.join(', ')}, counted once here. The manual{' '}
            {selection.redundantManualIds.length === 1 ? 'entry' : 'entries'} can be removed from{' '}
            <code>src/data/nextFixture.ts</code>.
          </p>
        )}

        <div className="flex items-start gap-2 rounded-md border border-border/70 bg-card/40 p-3 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-medium text-foreground">
              Availability is barely researched, so most absences are asserted rather than sourced.
            </span>{' '}
            The research pass found a citable availability status for {researchedAvailability} of{' '}
            {players.length} tracked players; everything else above was typed in by hand, and anyone
            not listed is assumed fit — which will sometimes be wrong. Selection is also a model
            ranking rather than a real team sheet: the dataset holds no call-up or recent-selection
            evidence. Positions are filled scarcest-first, so a player who can cover two roles is
            assigned to the thinner of them, which is a heuristic and not necessarily the strongest
            possible combination.
          </p>
        </div>
      </CardContent>
    </Card>
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

/**
 * High-risk / areas to monitor / low-risk, built from the six positional
 * groups' risk verdicts (see `positionRisk.ts`).
 *
 * The old version of this section only ever showed a binary "at risk" list,
 * which meant a position with no single big red flag — just several
 * moderate ones, or a genuinely weak but numerically deep group like this
 * pool's midfield — could fall through to a reassuring empty state. The
 * all-clear message below is only ever shown when every dimension of every
 * group is genuinely clear.
 */
function PositionalRiskSummary({ outlook }: { outlook: SquadOutlook }) {
  const { highRiskGroups, monitorGroups, lowRiskGroups } = outlook

  if (highRiskGroups.length === 0 && monitorGroups.length === 0) {
    return (
      <Card className="border-dashed border-border/70 bg-transparent">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No position is currently flagged as at risk: every one of the six positional units clears
          this model's thresholds on current quality, depth, succession, trend and availability.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <RiskGroupList title="High risk" groups={highRiskGroups} tone="high" />
      <RiskGroupList title="Areas to monitor" groups={monitorGroups} tone="moderate" />
      {lowRiskGroups.length > 0 && <RiskGroupList title="Low risk" groups={lowRiskGroups} tone="low" />}
    </div>
  )
}

function RiskGroupList({
  title,
  groups,
  tone,
}: {
  title: string
  groups: PositionalGroupOutlook[]
  tone: 'high' | 'moderate' | 'low'
}) {
  if (groups.length === 0) return null
  const toneClassName =
    tone === 'high'
      ? 'text-amber-800'
      : tone === 'moderate'
        ? 'text-slate-700'
        : 'text-shamrock-800'

  return (
    <div>
      <p className={`mb-2 text-xs font-medium uppercase tracking-wide ${toneClassName}`}>{title}</p>
      <Card className="border-border/70 bg-card/60">
        <CardContent className="divide-y divide-border/60 p-0">
          {groups.map((group) => (
            <div key={group.group} className="space-y-1.5 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{group.label}</span>
                <DepthRiskBadge risk={group.risk.overallRisk} />
              </div>
              {group.risk.reasons.length > 0 ? (
                group.risk.reasons.map((reason) => (
                  <p key={reason} className="text-xs leading-relaxed text-muted-foreground">
                    {reason}
                  </p>
                ))
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  No dimension of risk is currently flagged for this unit.
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
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
