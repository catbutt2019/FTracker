import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState, InfoHint, NotSupplied, SectionHeading, StatCard } from '@/components/Primitives'
import { ConfidenceIndicator } from '@/components/Indicators'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { ResearchStatusBadge } from '@/components/ResearchIndicators'
import { ProbabilityBar } from '@/components/ProbabilityBar'
import { useResearchPlayer, useResearchSnapshot } from '@/hooks/useResearchSnapshot'
import { POSITION_LABELS } from '@/types/domain'
import {
  ELIGIBILITY_STANDING_LABELS,
  EVIDENCE_CATEGORY_LABELS,
  EVIDENCE_DIRECTION,
  INVOLVEMENT_LABELS,
  SOURCE_KIND_LABELS,
  type EvidenceItem,
  type ResearchSeason,
  type ResearchSource,
} from '@/types/research'

export function ResearchPlayerDetail() {
  const { id } = useParams<{ id: string }>()
  const player = useResearchPlayer(id)
  const { assessments, evidence, sources } = useResearchSnapshot()

  const playerEvidence = useMemo(
    () =>
      evidence
        .filter((item) => item.playerId === id)
        .sort((a, b) => (b.publishedDate ?? '0000').localeCompare(a.publishedDate ?? '0000')),
    [evidence, id],
  )

  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources])
  const evidenceById = useMemo(() => new Map(evidence.map((e) => [e.id, e])), [evidence])

  if (!player) {
    return (
      <EmptyState
        title="Player not found"
        description="No researched player matches this address. They may not have met this snapshot's standard for inclusion — see the methodology page's list of research gaps."
        action={
          <Link
            to="/research/players"
            className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
          >
            Back to research players
          </Link>
        }
      />
    )
  }

  const assessment = assessments[player.id]

  return (
    <div className="space-y-10">
      <div>
        <Link
          to="/research/players"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          All research players
        </Link>
      </div>

      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <PlayerAvatar name={player.fullName} size="lg" />
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {player.fullName}
              </h1>
              <p className="text-sm text-muted-foreground">
                {POSITION_LABELS[player.primaryPosition]} · age{' '}
                {player.age === null ? 'unverified' : player.age} · {player.club} ({player.league}
                )
              </p>
              {player.disambiguation && (
                <p className="max-w-2xl text-xs leading-relaxed text-amber-200/90">
                  {player.disambiguation}
                </p>
              )}
            </div>
          </div>
          {assessment && (
            <div className="flex flex-wrap items-center gap-2">
              <ResearchStatusBadge status={assessment.status} />
              <ConfidenceIndicator level={assessment.confidence} />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-normal">
            {ELIGIBILITY_STANDING_LABELS[player.eligibilityStanding]}
          </Badge>
          <Badge variant="outline" className="font-normal">
            {INVOLVEMENT_LABELS[player.involvement]}
          </Badge>
          {player.caps !== null && (
            <Badge variant="outline" className="font-normal">
              {player.caps} caps
              {player.goalsForIreland !== null && `, ${player.goalsForIreland} goals`}
            </Badge>
          )}
          {player.secondaryPositions.length > 0 && (
            <Badge variant="outline" className="font-normal">
              Also {player.secondaryPositions.map((p) => POSITION_LABELS[p]).join(', ')}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            Last researched {player.lastResearchedDate}
          </span>
        </div>
      </header>

      {assessment ? (
        <>
          <section>
            <SectionHeading
              title="Assessment"
              description={assessment.explanation}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-border/70 bg-card/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    Outcome probabilities
                    <InfoHint label="How this is produced">
                      The progression score and a confidence-derived standard deviation are fed
                      through a normal distribution against a fixed stable band, then rounded by
                      largest remainder so they always sum to exactly 100.
                    </InfoHint>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ProbabilityBar
                    probabilities={{
                      improve: assessment.positiveProbability,
                      stable: assessment.stableProbability,
                      decline: assessment.declineProbability,
                    }}
                  />
                </CardContent>
              </Card>
              <StatCard
                label="Progression score"
                value={assessment.progressionScore.toFixed(1)}
                hint="The signed sum of every trace row below. Positive is improving-leaning, negative is declining-leaning."
              />
            </div>
          </section>

          <section>
            <SectionHeading
              title="Why this assessment"
              description="Every row the heuristic consulted, including rows that contributed nothing. They sum to the progression score above, so the arithmetic can be checked rather than trusted."
            />
            <Card className="border-border/70 bg-card/60">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Factor</TableHead>
                        <TableHead>Observed</TableHead>
                        <TableHead className="text-right">Contribution</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assessment.heuristicTrace.map((row, index) => (
                        <TableRow key={`${row.factor}-${index}`}>
                          <TableCell className="align-top font-medium">{row.factor}</TableCell>
                          <TableCell className="align-top text-sm text-muted-foreground">
                            {row.observed}
                          </TableCell>
                          <TableCell className="tabular align-top text-right">
                            {row.contribution > 0 ? '+' : ''}
                            {row.contribution.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="hover:bg-transparent">
                        <TableCell className="font-medium">Total</TableCell>
                        <TableCell />
                        <TableCell className="tabular text-right font-medium">
                          {assessment.progressionScore > 0 ? '+' : ''}
                          {assessment.progressionScore.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            {assessment.missingInformation.length > 0 && (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-border/70 bg-card/40 p-3 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <ul className="ml-4 list-disc space-y-1">
                  {assessment.missingInformation.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </>
      ) : (
        <EmptyState
          title="No assessment could be derived"
          description="This player has no relevant evidence at all, so the heuristic deliberately produces no directional status — absence of news is never read as decline."
        />
      )}

      <section>
        <SectionHeading
          title="Evidence timeline"
          description="Every sourced claim about this player, most recent first. The claim is kept separate from the reading of it, and contested claims are shown rather than resolved by omission."
        />
        {playerEvidence.length === 0 ? (
          <EmptyState
            title="No evidence recorded"
            description="No sourced claim was found for this player in this research pass."
          />
        ) : (
          <div className="space-y-3">
            {playerEvidence.map((item) => (
              <EvidenceCard
                key={item.id}
                item={item}
                source={sourceById.get(item.sourceId)}
                evidenceById={evidenceById}
              />
            ))}
          </div>
        )}
      </section>

      {player.unverified.length > 0 && (
        <section>
          <SectionHeading
            title="What could not be verified"
            description="Recorded explicitly rather than filled with a guess."
          />
          <Card className="border-border/70 bg-card/60">
            <CardContent className="pt-6">
              <ul className="ml-5 list-disc space-y-2 text-sm leading-relaxed text-muted-foreground">
                {player.unverified.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      <section>
        <SectionHeading
          title="Club record"
          description={`Club confirmed for the ${player.clubVerifiedForSeason} season.`}
        />
        <Card className="border-border/70 bg-card/60">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Season</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead>League</TableHead>
                    <TableHead className="text-right">Apps</TableHead>
                    <TableHead className="text-right">Starts</TableHead>
                    <TableHead className="text-right">Minutes</TableHead>
                    <TableHead className="text-right">Goals</TableHead>
                    <TableHead className="text-right">Assists</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[player.lastCompletedSeason, player.previousSeason]
                    .filter((s): s is ResearchSeason => s !== null)
                    .map((season, index) => (
                      <TableRow key={`${season.season}-${index}`}>
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
                        <SeasonNumberCell value={season.appearances} />
                        <SeasonNumberCell value={season.starts} />
                        <SeasonNumberCell value={season.minutes} />
                        <SeasonNumberCell value={season.goals} />
                        <SeasonNumberCell value={season.assists} />
                      </TableRow>
                    ))}
                  {player.lastCompletedSeason === null && player.previousSeason === null && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                        <NotSupplied reason="No verified season record was found for this player." />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function SeasonNumberCell({ value }: { value: number | null }) {
  return (
    <TableCell className="tabular text-right">
      {value === null ? <NotSupplied /> : value.toLocaleString()}
    </TableCell>
  )
}

function EvidenceCard({
  item,
  source,
  evidenceById,
}: {
  item: EvidenceItem
  source: ResearchSource | undefined
  evidenceById: Map<string, EvidenceItem>
}) {
  const direction = EVIDENCE_DIRECTION[item.category]
  return (
    <Card className="border-border/70 bg-card/60">
      <CardContent className="space-y-2.5 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={
              direction === 'positive'
                ? 'border-shamrock-600/50 font-normal text-shamrock-200'
                : direction === 'negative'
                  ? 'border-amber-600/50 font-normal text-amber-200'
                  : 'font-normal text-muted-foreground'
            }
          >
            {EVIDENCE_CATEGORY_LABELS[item.category]}
          </Badge>
          <Badge variant="outline" className="font-normal">
            {item.primaryOrSecondary === 'primary' ? 'Primary source' : 'Secondary reporting'}
          </Badge>
          {item.contradictedBy.length > 0 && (
            <Badge variant="outline" className="border-amber-600/50 font-normal text-amber-200">
              Contested
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {item.publishedDate ?? 'undated'} · accessed {item.accessedDate}
          </span>
        </div>

        <p className="text-sm leading-relaxed">{item.claim}</p>
        {item.interpretation && (
          <p className="text-sm leading-relaxed text-muted-foreground">{item.interpretation}</p>
        )}
        {item.notes && (
          <p className="text-xs leading-relaxed text-muted-foreground">{item.notes}</p>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
          {source ? (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
            >
              {source.publisher}
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          ) : (
            <NotSupplied reason="Source record not found." />
          )}
          {source && (
            <span>
              {SOURCE_KIND_LABELS[source.kind]} · {source.reliability} reliability
            </span>
          )}
          {source?.accessNote && <span>{source.accessNote}</span>}
        </div>

        {(item.corroboratedBy.length > 0 || item.contradictedBy.length > 0) && (
          <div className="space-y-1 border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
            {item.corroboratedBy.length > 0 && (
              <p>
                Corroborated by:{' '}
                {item.corroboratedBy
                  .map((id) => evidenceById.get(id)?.claim ?? id)
                  .join('; ')}
              </p>
            )}
            {item.contradictedBy.length > 0 && (
              <p>
                Contradicted by:{' '}
                {item.contradictedBy
                  .map((id) => evidenceById.get(id)?.claim ?? id)
                  .join('; ')}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
