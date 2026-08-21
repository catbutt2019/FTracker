import { Link } from 'react-router-dom'
import { ChevronDown, Info } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Disclosure, InfoHint } from '@/components/Primitives'
import { ConfidenceIndicator, DeltaValue, DepthRiskBadge, TrajectoryBadge } from '@/components/Indicators'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { RangeBar } from '@/components/ProbabilityBar'
import { useDataset } from '@/hooks/useDataset'
import { NATIONAL_TEAM_LEVEL_LABELS, type Player, type PositionDepth } from '@/types/domain'

export function PositionDepthPage() {
  const { outlook } = useDataset()

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Position depth</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Every position, strongest to weakest. Tap one to see who plays there and what the risk is.
        </p>
        {/* Both paragraphs here are mechanism — how the score is computed, and
            how bodies are counted. Neither changes how you read the ranking,
            so neither needs to sit in front of it. */}
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <Disclosure summary="How position strength is counted">
            <div className="max-w-3xl space-y-2">
              <p>
                It counts only the players a formation actually needs in that position, weighted
                toward the weakest of them. So adding a fringe option never makes a position look
                weaker, and a weak required starter cannot be smoothed away by an average.
              </p>
              <p>
                Players are counted in their primary position only. A centre-back who can also play
                left-back appears once, under centre-back, because counting one body twice would
                make the pool look deeper than it is. Secondary positions are listed against each
                player.
              </p>
            </div>
          </Disclosure>
        </div>
      </header>

      {/* One list, not two. There used to be a nine-row summary table and then
          nine full cards repeating the same figures underneath — about thirty
          phone screens, and every number visible whether you wanted it or not.
          The summary rows now expand in place, so the overview is the
          navigation. */}
      <Card className="border-border bg-card">
        <CardContent className="divide-y divide-border p-0">
          {[...outlook.depthByPosition]
            .sort((a, b) => b.currentStrength - a.currentStrength)
            .map((depth) => (
              <PositionRow key={depth.position} depth={depth} />
            ))}
        </CardContent>
      </Card>
    </div>
  )
}

function PositionRow({ depth }: { depth: PositionDepth }) {
  return (
    <details id={depth.position} className="group scroll-mt-20">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-accent [&::-webkit-details-marker]:hidden">
        {/* Label, score, risk, chevron — and nothing else. The tracked count
            used to sit here too and wrapped to a second line on the longer
            position names, which left the nine rows at uneven heights. It now
            sits in the detail, where the players it counts actually are. */}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{depth.label}</span>
        <span className="tabular text-sm">{depth.currentStrength.toFixed(1)}</span>
        <DepthRiskBadge risk={depth.depthRisk} />
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="border-t border-border bg-muted/30 px-4 py-5">
        <PositionDetail depth={depth} />
      </div>
    </details>
  )
}

function PositionDetail({ depth }: { depth: PositionDepth }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_1fr]">
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
          {/* The three facts that were spread across a header line, a caption
              and a tooltip. The 80%-interval definition and the squad-weighting
              prior now live only on the methodology page, which is where a
              reader who wants them will look. */}
          <p className="text-xs text-muted-foreground">
            {depth.playerCount} tracked · average age {depth.averageAge.toFixed(1)} ·{' '}
            {depth.requiredStartingSlots} starting slot
            {depth.requiredStartingSlots === 1 ? '' : 's'} required · 24-month projected range
          </p>
        </div>

        <div className="space-y-2 rounded-md border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Risk · {depth.positionalGroup} unit
              <InfoHint label="Why the whole unit">
                Each dimension is assessed for this position's whole group — midfield covers DM/CM/AM
                together, since that is the unit a formation actually fields — not this one granular
                position in isolation.
              </InfoHint>
            </p>
            <ConfidenceIndicator level={depth.risk.confidence} />
          </div>
          <p className="text-sm leading-relaxed">{depth.depthRiskReason}</p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <RiskDimensionChip label="Quality" level={depth.risk.currentQualityRisk} />
            <RiskDimensionChip label="Depth" level={depth.risk.depthRisk} />
            <RiskDimensionChip label="Succession" level={depth.risk.successionRisk} />
            <RiskDimensionChip label="Trend" level={depth.risk.trendRisk} />
            <RiskDimensionChip label="Availability" level={depth.risk.availabilityRisk} />
          </div>
        </div>
      </div>

      <Separator className="bg-border/60" />

      {/* Group descriptions cut to their defining criterion. They were two and
          three lines each, four times over, which on a phone put more words
          about the categories on screen than players in them. */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <PlayerGroup
          title="Highest-rated now"
          description="Best model scores available — not a claim about selection."
          players={depth.highestRatedCurrent}
          emptyLabel="Nobody is tracked in this position."
        />
        <PlayerGroup
          title="Senior contender"
          description="Senior-capped, but not among the highest-rated."
          players={depth.seniorContenders}
          emptyLabel="No further senior-capped player is tracked here."
        />
        <PlayerGroup
          title="Future contender"
          description="Uncapped, 23 or under, on track for senior level within 24 months."
          players={depth.futureContenders}
          emptyLabel="No player currently meets every condition."
        />
        <PlayerGroup
          title="Emerging prospect"
          description="Uncapped, 21 or under, still developing toward that bar."
          players={depth.emergingProspects}
          emptyLabel="No player aged 21 or under is tracked here."
        />
      </div>
    </div>
  )
}

function RiskDimensionChip({ label, level }: { label: string; level: 'none' | 'moderate' | 'high' }) {
  const styles: Record<typeof level, string> = {
    none: 'bg-shamrock-50 text-shamrock-800 border-shamrock-200',
    moderate: 'bg-slate-100 text-slate-700 border-slate-300',
    high: 'bg-amber-50 text-amber-800 border-amber-200',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${styles[level]}`}
    >
      {label}: {level === 'none' ? 'clear' : level}
    </span>
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
        <p className="rounded-md border border-dashed border-border-strong px-3 py-4 text-xs leading-relaxed text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <ul className="space-y-2">
          {players.map((player) => (
            <li key={player.id}>
              <Link
                to={`/players/${player.id}`}
                className="block rounded-md border border-border bg-muted/50 px-3 py-2.5 transition-colors hover:border-border hover:bg-accent/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <PlayerAvatar name={player.name} imageUrl={player.avatarUrl} size="sm" />
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
