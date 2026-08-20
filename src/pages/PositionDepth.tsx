import { Link } from 'react-router-dom'
import { Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { InfoHint, SectionHeading } from '@/components/Primitives'
import { ConfidenceIndicator, DeltaValue, DepthRiskBadge, TrajectoryBadge } from '@/components/Indicators'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { RangeBar } from '@/components/ProbabilityBar'
import { useDataset } from '@/hooks/useDataset'
import { MODEL_CONFIG, POSITION_SQUAD_WEIGHTS } from '@/model/config'
import { NATIONAL_TEAM_LEVEL_LABELS, type Player, type PositionDepth } from '@/types/domain'

export function PositionDepthPage() {
  const { outlook } = useDataset()

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Position depth</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Each of the nine positions, with who is available now, who could be available later, and
          how exposed the position is if one or two players are unavailable. Position strength is
          the mean of the best {MODEL_CONFIG.squadSlotsPerPosition} players, so adding a fringe
          option never makes a position look weaker.
        </p>
        <div className="flex items-start gap-2 rounded-md border border-border/70 bg-card/40 p-3 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <p>
            Players are counted in their primary position only. A centre-back who can play
            left-back appears once, under centre-back, because counting one body twice would make
            the pool look deeper than it is. Secondary positions are listed on each card.
          </p>
        </div>
      </header>

      <section>
        <SectionHeading
          title="Summary"
          description="Sorted by the model's own ordering, from strongest to weakest current position strength."
        />
        <Card className="border-border/70 bg-card/60">
          <CardContent className="divide-y divide-border/60 p-0">
            {[...outlook.depthByPosition]
              .sort((a, b) => b.currentStrength - a.currentStrength)
              .map((depth) => (
                <div
                  key={depth.position}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                >
                  <a
                    href={`#${depth.position}`}
                    className="min-w-[9.5rem] flex-1 text-sm font-medium transition-colors hover:text-shamrock-200"
                  >
                    {depth.label}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {depth.playerCount} tracked
                    </span>
                  </a>
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

      <div className="space-y-6">
        {outlook.depthByPosition.map((depth) => (
          <PositionCard key={depth.position} depth={depth} />
        ))}
      </div>
    </div>
  )
}

function PositionCard({ depth }: { depth: PositionDepth }) {
  return (
    <Card id={depth.position} className="scroll-mt-20 border-border/70 bg-card/60">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">
              {depth.label}
              <span className="ml-2 text-xs font-normal uppercase tracking-wide text-muted-foreground">
                {depth.position}
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {depth.playerCount} tracked · average age {depth.averageAge.toFixed(1)} · squad
              weighting {POSITION_SQUAD_WEIGHTS[depth.position].toFixed(2)}
              <InfoHint label="About squad weighting">
                How much this position contributes to the overall squad-strength score. Central
                spine roles carry slightly more weight because a weakness there is harder to hide.
                These are stated priors, not fitted values.
              </InfoHint>
            </p>
          </div>
          <DepthRiskBadge risk={depth.depthRisk} />
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
          <div className="space-y-3">
            <div className="flex items-baseline gap-3">
              <div>
                <div className="tabular text-2xl font-semibold leading-none">
                  {depth.currentStrength.toFixed(1)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">current strength</p>
              </div>
              <DeltaValue
                value={depth.projectedStrength - depth.currentStrength}
                suffix=" projected"
              />
            </div>
            {depth.playerCount > 0 && (
              <RangeBar
                low={depth.projectedLow}
                median={depth.projectedStrength}
                high={depth.projectedHigh}
                current={depth.currentStrength}
              />
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              Projected range is the 24-month 80% interval, averaged across the best{' '}
              {MODEL_CONFIG.squadSlotsPerPosition} projected players in this position.
            </p>
          </div>

          <div className="space-y-2 rounded-md border border-border/70 bg-background/40 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Depth assessment
            </p>
            <p className="text-sm leading-relaxed">{depth.depthRiskReason}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Risk considers how many players clear a senior-ready score of 55, how many are aged
              23 or under, and how many of the current options are over 30. It is deliberately
              separate from position strength: a position can be strong today and still be exposed.
            </p>
          </div>
        </div>

        <Separator className="bg-border/60" />

        <div className="grid gap-6 md:grid-cols-3">
          <PlayerGroup
            title="First-choice options"
            description="The two highest current scores available."
            players={depth.firstChoice}
            emptyLabel="Nobody is tracked in this position."
          />
          <PlayerGroup
            title="Potential future starters"
            description="Projected to reach 52 or above within 24 months, behind the first choices."
            players={depth.futureStarters}
            emptyLabel="No further player is projected to reach a starting level within 24 months."
          />
          <PlayerGroup
            title="Emerging players"
            description="Aged 21 or under, ordered by projected midpoint."
            players={depth.emerging}
            emptyLabel="No player aged 21 or under is tracked in this position."
          />
        </div>
      </CardContent>
    </Card>
  )
}

function PlayerGroup({
  title,
  description,
  players,
  emptyLabel,
}: {
  title: string
  description: string
  players: Player[]
  emptyLabel: string
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {players.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/70 px-3 py-4 text-xs leading-relaxed text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <ul className="space-y-2">
          {players.map((player) => (
            <li key={player.id}>
              <Link
                to={`/players/${player.id}`}
                className="block rounded-md border border-border/70 bg-background/40 px-3 py-2.5 transition-colors hover:border-border hover:bg-accent/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <PlayerAvatar name={player.name} size="sm" />
                    <span className="text-sm font-medium">{player.name}</span>
                  </span>
                  <span className="tabular text-sm">
                    {player.forecast.currentPerformanceScore.toFixed(1)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Age {player.age} · {player.club}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <TrajectoryBadge trajectory={player.forecast.trajectory} />
                  <ConfidenceIndicator level={player.forecast.predictionConfidence} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="font-normal">
                    {NATIONAL_TEAM_LEVEL_LABELS[player.nationalTeamLevel]}
                  </Badge>
                  {player.secondaryPositions.length > 0 && (
                    <span>also {player.secondaryPositions.join(', ')}</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
