import { Link } from 'react-router-dom'
import { ArrowRight, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { InfoHint, SectionHeading, StatCard } from '@/components/Primitives'
import { useResearchSnapshot } from '@/hooks/useResearchSnapshot'
import { POSITION_LABELS } from '@/types/domain'
import type { PositionOutlookResearch } from '@/types/research'
import { cn } from '@/lib/utils'

const POOL_DIRECTION_LABELS = {
  strengthening: 'Strengthening',
  'broadly-stable': 'Broadly stable',
  weakening: 'Weakening',
  'insufficient-evidence': 'Insufficient evidence',
} as const

const POOL_DIRECTION_STYLES: Record<keyof typeof POOL_DIRECTION_LABELS, string> = {
  strengthening: 'border-shamrock-600/50 bg-shamrock-700/25 text-shamrock-200',
  'broadly-stable': 'border-slate-500/40 bg-slate-500/15 text-slate-300',
  weakening: 'border-amber-600/50 bg-amber-600/20 text-amber-200',
  'insufficient-evidence': 'border-border bg-muted text-muted-foreground',
}

const POSITION_ASSESSMENT_LABELS: Record<PositionOutlookResearch['assessment'], string> = {
  'improving-depth': 'Improving depth',
  holding: 'Holding',
  thinning: 'Thinning',
  'insufficient-evidence': 'Insufficient evidence',
}

const POSITION_ASSESSMENT_STYLES: Record<PositionOutlookResearch['assessment'], string> = {
  'improving-depth': 'border-shamrock-600/50 bg-shamrock-700/25 text-shamrock-200',
  holding: 'border-slate-500/40 bg-slate-500/15 text-slate-300',
  thinning: 'border-amber-600/50 bg-amber-600/20 text-amber-200',
  'insufficient-evidence': 'border-border bg-muted text-muted-foreground',
}

export function ResearchDashboard() {
  const { players, outlook, researchDate, label } = useResearchSnapshot()

  const seniorCount = players.filter((p) => p.level === 'senior').length
  const u21Count = players.filter((p) => p.level === 'u21').length
  const emergingCount = players.filter((p) => p.level === 'emerging').length

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-normal">
            Research snapshot
          </Badge>
          <span className="text-xs text-muted-foreground">
            {label} · researched {researchDate}
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Republic of Ireland talent pool: research outlook
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          A one-time, sourced read of {players.length} ROI-eligible players, distinct from the
          statistical model elsewhere in this app. Every figure here traces back to a cited claim
          in the evidence record, not to a percentile calculation.
        </p>
        <div className="flex items-start gap-2 rounded-md border border-border/70 bg-card/40 p-3 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-medium text-foreground">
              This says nothing about qualifying for any tournament.
            </span>{' '}
            There is no fixture list, no opponent strength and no qualification model here or
            anywhere in the research snapshot &mdash; only a read of the players themselves.
          </p>
        </div>
      </header>

      <section>
        <SectionHeading
          title="Pool direction"
          description={outlook.uncertainty}
        />
        <Card className="border-border/70 bg-card/60">
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium',
                  POOL_DIRECTION_STYLES[outlook.direction],
                )}
              >
                {POOL_DIRECTION_LABELS[outlook.direction]}
              </span>
              <InfoHint label="How this is derived">
                Only attempted once at least 5 players have a directional assessment. Where given,
                it comes from a confidence-weighted net score of improving-vs-declining assessments
                against a fixed threshold.
              </InfoHint>
            </div>
            {outlook.drivers.length > 0 && (
              <ul className="ml-5 list-disc space-y-1.5 text-sm leading-relaxed text-muted-foreground">
                {outlook.drivers.map((driver) => (
                  <li key={driver}>{driver}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <SectionHeading title="Pool composition" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Tracked players"
            value={players.length}
            footnote={`${seniorCount} senior · ${u21Count} under-21 · ${emergingCount} emerging`}
          />
          <StatCard
            label="Emerging with senior minutes"
            value={outlook.emergingWithSeniorMinutes}
            hint="Players not yet at senior international level who nonetheless recorded meaningful senior club minutes last season."
          />
          <StatCard
            label="Seniors gaining minutes"
            value={`${outlook.seniorsGainingMinutes} / ${outlook.seniorsLosingMinutes}`}
            hint="Senior internationals with sourced evidence of increased minutes this season, against those with evidence of decreased minutes."
            footnote="gaining / losing"
          />
          <StatCard
            label="Moved to a stronger league"
            value={outlook.movedToStrongerLeague}
            hint="Players with sourced evidence of a transfer or loan into a league judged stronger than their previous one."
          />
          <StatCard
            label="Interrupted by injury"
            value={outlook.interruptedByInjury}
            hint="Players with a sourced injury note in the most recent research pass."
          />
          <StatCard
            label="Potential future seniors"
            value={outlook.potentialFutureSeniors}
            hint="Non-senior players whose evidence resolves to an 'emerging' status: breakthrough-shaped evidence with a non-negative progression score."
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHeading
            title="Strongest positions"
            description="Improving depth, or already deep with no ageing dependency."
          />
          <PositionBadgeList
            positions={outlook.strongestPositions}
            emptyLabel="No position stands out as clearly strongest."
          />
        </div>
        <div>
          <SectionHeading
            title="Weakest positions"
            description="Thinning, or dependent on ageing players with no emerging cover."
          />
          <PositionBadgeList
            positions={outlook.weakestPositions}
            emptyLabel="No position stands out as clearly weakest."
          />
        </div>
      </section>

      <section>
        <SectionHeading
          title="Position-by-position breakdown"
          description="Depth here is a headcount-and-involvement measure, not an ability measure. A position can look deep on paper while every player in it is mediocre — this snapshot has no percentile scoring to say otherwise."
          action={
            <Link
              to="/research/players"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Explore players
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          }
        />
        <Card className="border-border/70 bg-card/60">
          <CardContent className="divide-y divide-border/60 p-0">
            {outlook.byPosition.map((position) => (
              <Link
                key={position.position}
                to={`/research/players?position=${position.position}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-accent/40"
              >
                <div className="min-w-[9.5rem] flex-1">
                  <span className="text-sm font-medium">{position.label}</span>
                  <p className="text-xs text-muted-foreground">
                    {position.playerCount} tracked
                    {position.averageAge !== null && ` · average age ${position.averageAge.toFixed(1)}`}
                    {position.dependsOnAgeingPlayers && ' · depends on ageing players'}
                  </p>
                </div>
                <div className="tabular w-28 text-xs text-muted-foreground">
                  {position.seniorCount} senior · {position.emergingCount} emerging
                </div>
                <div className="tabular w-32 text-xs text-muted-foreground">
                  {position.improvingCount} improving · {position.decliningCount} declining
                </div>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                    POSITION_ASSESSMENT_STYLES[position.assessment],
                  )}
                >
                  {POSITION_ASSESSMENT_LABELS[position.assessment]}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function PositionBadgeList({
  positions,
  emptyLabel,
}: {
  positions: PositionOutlookResearch['position'][]
  emptyLabel: string
}) {
  if (positions.length === 0) {
    return (
      <Card className="border-dashed border-border/70 bg-transparent">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </CardContent>
      </Card>
    )
  }
  return (
    <div className="flex flex-wrap gap-2">
      {positions.map((position) => (
        <Link
          key={position}
          to={`/research/players?position=${position}`}
          className="rounded-md border border-border/70 bg-card/60 px-3 py-1.5 text-sm transition-colors hover:bg-accent/40"
        >
          {POSITION_LABELS[position]}
        </Link>
      ))}
    </div>
  )
}
