import type { ReactNode } from 'react'
import { AlertTriangle, FlaskConical } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useDataset } from '@/hooks/useDataset'
import { useResearchSnapshot } from '@/hooks/useResearchSnapshot'
import { MODEL_CONFIG, AGE_CURVES } from '@/model/config'
import { METRIC_DEFINITIONS } from '@/model/metrics'
import { EVIDENCE_CATEGORY_WEIGHT } from '@/model/researchAssessment'
import { LEAGUES } from '@/data/demo/leagues'
import {
  METRIC_GROUPS,
  POSITIONS,
  POSITION_LABELS,
  POSITION_METRIC_GROUP,
} from '@/types/domain'
import { EVIDENCE_CATEGORIES, EVIDENCE_CATEGORY_LABELS, EVIDENCE_DIRECTION } from '@/types/research'

const GROUP_LABELS: Record<(typeof METRIC_GROUPS)[number], string> = {
  goalkeeper: 'Goalkeepers',
  defender: 'Full-backs and centre-backs',
  midfielder: 'Defensive and central midfielders',
  creator: 'Attacking midfielders and wingers',
  forward: 'Strikers',
}

export function Methodology() {
  const { outlook, sourceLabel, asOfDate, isDemonstrationData } = useDataset()
  const research = useResearchSnapshot()

  return (
    <div className="space-y-12">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1.5 border-amber-600/50 font-normal text-amber-100">
            <FlaskConical className="size-3.5" aria-hidden="true" />
            Experimental model {MODEL_CONFIG.version}
          </Badge>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Methodology</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          This page describes exactly how every number in the application is produced. It is written
          on the assumption that a projection nobody can inspect is a projection nobody should
          believe.
        </p>
        <div className="flex items-start gap-2.5 rounded-md border border-amber-700/40 bg-amber-950/30 p-4 text-sm leading-relaxed">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden="true" />
          <div className="space-y-2">
            <p className="font-medium text-amber-100">
              This model is experimental and has not been validated against real outcomes.
            </p>
            <p className="text-muted-foreground">
              None of the parameters below are fitted. They are transparent priors chosen because
              they are defensible and legible, not because they were shown to predict anything. No
              backtest has been run, so the model has no measured accuracy. Treat every figure as a
              structured opinion, not a measurement.
            </p>
          </div>
        </div>
      </header>

      <Section
        id="score"
        title="What the performance score means"
        lead="A 0-100 number describing how a player's output compares with other tracked Irish players in the same kind of role."
      >
        <p>
          The score is not a rating against world football. It is a percentile-based score computed
          within this pool of {outlook.poolSize} players, so roughly 50 is average{' '}
          <em>for this group</em>. A score of 80 means the player is near the top of the Irish pool
          at their position, not that they are an 80-rated footballer in any absolute sense.
        </p>
        <p>It is built in four steps:</p>
        <ol className="ml-5 list-decimal space-y-2">
          <li>
            Each position-specific metric is converted into a percentile against every tracked
            player scored on the same metric family. Metrics where lower is better — possession
            lost, errors leading to a shot — are inverted first, so a high percentile always means
            good.
          </li>
          <li>
            Those percentiles are combined using the weights listed under{' '}
            <a href="#metrics" className="underline decoration-dotted hover:text-foreground">
              position metrics
            </a>
            . This produces the raw score.
          </li>
          <li>
            The raw score is adjusted for the standard of the league and the standing of the club,
            described under{' '}
            <a href="#context" className="underline decoration-dotted hover:text-foreground">
              league and club context
            </a>
            .
          </li>
          <li>
            Seasons are blended with recency weights of{' '}
            {MODEL_CONFIG.seasonRecencyWeights.map((w) => `${Math.round(w * 100)}%`).join(', ')} from
            most recent to oldest, then the result is pulled toward the positional average according
            to sample size — see{' '}
            <a href="#regression" className="underline decoration-dotted hover:text-foreground">
              regression to the mean
            </a>
            .
          </li>
        </ol>
        <p>
          Both the pre-regression and post-regression figures are shown on every player page, so the
          effect of step four is visible rather than hidden inside the headline number.
        </p>
      </Section>

      <Section
        id="metrics"
        title="Why positions are measured differently"
        lead="A centre-back and a striker doing their jobs well look nothing alike in the data."
      >
        <p>
          Scoring every player on one shared metric set would produce a number that flatters whoever
          happens to accumulate more of the pooled metrics — usually attackers, because goals and
          shots are counted and good positional defending largely is not. Players are therefore
          grouped into five metric families, and percentiles are only ever computed inside a family.
        </p>
        <p>
          The consequence worth stating plainly: comparing a goalkeeper&rsquo;s score with a
          winger&rsquo;s is a loose comparison. Both are percentiles, but of different distributions.
          The pool-wide rank shown on player pages is useful for a rough sense of standing and should
          not be read more precisely than that.
        </p>

        <div className="space-y-6">
          {METRIC_GROUPS.map((group) => (
            <Card key={group} className="border-border/70 bg-card/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  {GROUP_LABELS[group]}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {POSITIONS.filter((p) => POSITION_METRIC_GROUP[p] === group).join(', ')}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-52">Metric</TableHead>
                        <TableHead>What it measures</TableHead>
                        <TableHead className="w-20 text-right">Weight</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {METRIC_DEFINITIONS[group].map((metric) => (
                        <TableRow key={metric.key}>
                          <TableCell className="align-top font-medium">
                            {metric.label}
                            {!metric.higherIsBetter && (
                              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                                inverted
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="align-top text-xs leading-relaxed text-muted-foreground">
                            {metric.description}
                          </TableCell>
                          <TableCell className="tabular align-top text-right">
                            {Math.round(metric.weight * 100)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        id="context"
        title="How league and club strength are used"
        lead="The same output means more against better opposition."
      >
        <p>
          Each competition carries a 0-100 strength rating on this model&rsquo;s own scale, and each
          club a 0-100 standing within its league. A player&rsquo;s raw score is nudged up or down
          from these: league strength at {Math.round(MODEL_CONFIG.leagueAdjustmentStrength * 100)}%
          strength, club standing at {Math.round(MODEL_CONFIG.clubAdjustmentStrength * 100)}%, both
          measured relative to a mid-table side in a mid-tier league.
        </p>
        <p>
          The adjustment is deliberately modest. A stronger league genuinely raises the value of the
          same numbers, but the ratings themselves are judgement calls, so leaning on them heavily
          would mean leaning on a guess. A league at or above{' '}
          {MODEL_CONFIG.strongLeagueThreshold} is described as &ldquo;strong&rdquo; in the interface.
        </p>

        <div className="overflow-x-auto rounded-lg border border-border/70">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Competition</TableHead>
                <TableHead className="text-right">Strength</TableHead>
                <TableHead>Metric availability</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...LEAGUES]
                .sort((a, b) => b.strength - a.strength)
                .map((league) => (
                  <TableRow key={league.name}>
                    <TableCell className="font-medium">{league.name}</TableCell>
                    <TableCell className="tabular text-right">{league.strength}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {league.dataQuality === 'full'
                        ? 'Full advanced event data'
                        : 'Basic only — expected goals and similar are not published'}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section
        id="regression"
        title="How limited playing time lowers confidence"
        lead="A striking record over 300 minutes is a smaller claim than the same record over 3,000."
      >
        <p>
          Two separate mechanisms handle small samples, and they do different jobs.
        </p>
        <p>
          <strong className="font-medium text-foreground">Regression to the mean</strong> moves the
          score itself. The observed score is blended with the positional average, with the weight
          on the observed score rising with minutes played and metric coverage.{' '}
          {MODEL_CONFIG.reliabilityMinutes} minutes is the point at which a full-coverage season is
          treated as roughly half-trustworthy on its own, and observed performance never carries
          more than {Math.round(MODEL_CONFIG.maxReliability * 100)}% of the weight — nobody&rsquo;s
          sample is ever taken entirely at face value.
        </p>
        <p>
          <strong className="font-medium text-foreground">Confidence</strong> widens the projected
          range instead. It is a 0-1 score combining share of available minutes played (42%), how
          much of the metric set the provider supplied (28%), how many seasons of history exist
          (18%) and whether an injury feed is available (12%). Players under 22 are damped further,
          because young players are simply more volatile. At zero confidence the projection standard
          deviation grows by {MODEL_CONFIG.lowConfidenceSigmaPenalty} points on top of the base{' '}
          {MODEL_CONFIG.baseProjectionSigma}.
        </p>
        <p>
          Confidence is reported as low, moderate or high at thresholds of{' '}
          {MODEL_CONFIG.confidenceThresholds.moderate} and{' '}
          {MODEL_CONFIG.confidenceThresholds.high}. A low-confidence forecast is not a criticism of
          the player. It is a statement about the evidence, which is why confidence is never
          colour-coded as good or bad in the interface.
        </p>
      </Section>

      <Section
        id="age"
        title="How age affects projections"
        lead="Age is the strongest structural assumption in the model, so the curves are published rather than described."
      >
        <p>
          Each position has its own curve: a rise toward a peak age, a gradual decline after it, and
          a steeper decline once players pass a second threshold. Goalkeepers and centre-backs peak
          later and decline more slowly; wide players and forwards whose game depends on
          acceleration decline earlier. The expected age drift is scaled by the player&rsquo;s
          current score, because an 85-rated player has more to lose from a 5% decline than a
          45-rated one.
        </p>

        <div className="overflow-x-auto rounded-lg border border-border/70">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Position</TableHead>
                <TableHead className="text-right">Peak age</TableHead>
                <TableHead className="text-right">Decline per year</TableHead>
                <TableHead className="text-right">Steep decline from</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {POSITIONS.map((position) => {
                const curve = AGE_CURVES[position]
                return (
                  <TableRow key={position}>
                    <TableCell className="font-medium">{POSITION_LABELS[position]}</TableCell>
                    <TableCell className="tabular text-right">{curve.peakAge}</TableCell>
                    <TableCell className="tabular text-right">
                      {(curve.declineRate * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="tabular text-right">{curve.steepDeclineAge}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <p>
          These are priors, not findings. Individual players routinely depart from them, and the
          model will not anticipate a late developer or a career cut short by injury.
        </p>
      </Section>

      <Section
        id="improvement"
        title="How the improvement probability is calculated"
        lead="Improve, stable and decline are exhaustive, and always sum to exactly 100%."
      >
        <p>
          For a player, the expected change at a horizon is the age effect plus a damped carry-over
          of last season&rsquo;s change — {Math.round(MODEL_CONFIG.momentumCarryover * 100)}% of it,
          capped at {MODEL_CONFIG.momentumCap} points, so one strong season cannot run away with the
          projection. That expected change is treated as the centre of a normal distribution whose
          standard deviation comes from confidence and horizon. Sigma grows with the square root of
          the horizon relative to {MODEL_CONFIG.horizonSigmaReference} months, so a 36-month range is
          wider than a 12-month one.
        </p>
        <p>
          The three probabilities are then areas under that distribution: the chance of finishing
          more than {MODEL_CONFIG.stableBandPoints} points above today&rsquo;s score, within that
          band, or more than {MODEL_CONFIG.stableBandPoints} points below. Because rounding three
          percentages independently often produces 99 or 101, they are rounded by largest remainder
          so the total is exactly 100. The published range is the 10th to 90th percentile of the same
          distribution — an 80% interval.
        </p>
        <p>
          For the squad as a whole, {outlook.simulations.toLocaleString()} Monte Carlo simulations
          are run at each horizon. Every player&rsquo;s future score is drawn from their own
          distribution, and squad strength is recomputed from scratch in each run. Draws are
          correlated at {MODEL_CONFIG.playerCorrelation} through a single shared factor: treating
          forty players as independent would collapse the aggregate spread and present a coarse
          model as a precise one. Correlation is the honest choice because a good youth intake, a
          change of manager or a shift in which leagues Irish players end up in moves many of them
          at once.
        </p>
        <p>
          Squad strength itself is the weighted mean of the best{' '}
          {MODEL_CONFIG.squadSlotsPerPosition} players in each of the nine positions, not the mean
          of the whole pool — adding a fringe player should not make the national team look weaker,
          because they would not play. Depth is measured separately. At squad level the stable band
          is {MODEL_CONFIG.squadStableBandPoints} points, tighter than the individual band, because
          an average across nine positions moves less than one player does. The simulation is seeded,
          so the same dataset always produces the same probabilities.
        </p>
      </Section>

      <Section
        id="observed"
        title="Observed performance versus model prediction"
        lead="These are different kinds of statement and the interface never blends them into one line."
      >
        <p>
          <strong className="font-medium text-foreground">Observed</strong> figures are computed from
          matches that were actually played: minutes, starts, metric values and the season scores
          derived from them. They are drawn as solid lines and plain numbers. They can be wrong only
          in the sense that the underlying data can be wrong.
        </p>
        <p>
          <strong className="font-medium text-foreground">Projected</strong> figures describe matches
          that have not happened. They are drawn as dashed lines with a shaded 80% range, and are
          always presented as a range rather than a point. Chart tooltips state explicitly when a
          value is a projection.
        </p>
        <p>
          One nuance worth knowing: even the observed history is not purely observational. Historical
          squad-strength points apply the same regression to the mean as the current score, so that
          the line is computed consistently and does not jump where the projection begins. And each
          historical point only includes players who have data for that season, so earlier seasons
          rest on a smaller pool and should be read as less reliable.
        </p>
      </Section>

      <Section
        id="missing"
        title="How missing data is handled"
        lead="A gap is shown as a gap."
      >
        <p>
          Lower divisions do not have the same data coverage as major leagues. Where a metric is not
          supplied, it is dropped and the remaining metrics are reweighted — never substituted with a
          zero, a league average or an estimate. A zero would read as &ldquo;bad at this&rdquo;; an
          imputed average would quietly invent an observation.
        </p>
        <p>
          Dropping a metric does lose information, and it also changes what the score is measuring:
          a player scored on three metrics is being assessed on a narrower basis than one scored on
          five. So metric coverage is reported on every player page, missing metrics are listed by
          name with the share of weight they would have carried, and reduced coverage lowers
          confidence, which widens the projected range.
        </p>
      </Section>

      <Section
        id="limits"
        title="What this model cannot do"
        lead="The limitations are not caveats bolted on at the end. They are the shape of the thing."
      >
        <ul className="ml-5 list-disc space-y-2.5">
          <li>
            <strong className="font-medium text-foreground">
              It says nothing about qualification.
            </strong>{' '}
            There are no fixtures, opponents, competition formats or match simulations anywhere in
            this model. &ldquo;The talent pool is improving&rdquo; and &ldquo;Ireland are likely to
            qualify&rdquo; are entirely different claims, and only the first is in scope here.
          </li>
          <li>
            <strong className="font-medium text-foreground">It has never been backtested.</strong>{' '}
            No parameter was fitted to historical outcomes, and no accuracy has been measured. The
            probabilities are internally consistent, which is not the same as being calibrated.
          </li>
          <li>
            <strong className="font-medium text-foreground">
              It cannot see most of what determines a career.
            </strong>{' '}
            Tactical role and system fit, coaching quality, contract situation, transfers, attitude,
            injury history beyond days lost, and the specific reason a player is or is not picked are
            all invisible to it. A transfer that changes everything for a player will simply arrive
            in next season&rsquo;s data as a surprise.
          </li>
          <li>
            <strong className="font-medium text-foreground">
              Scores are relative to this pool only.
            </strong>{' '}
            Adding or removing players legitimately shifts everyone else&rsquo;s percentile. The
            score is a statement about standing within the tracked Irish pool, not an absolute
            ability rating.
          </li>
          <li>
            <strong className="font-medium text-foreground">
              League and club ratings are judgement calls.
            </strong>{' '}
            They are not derived from results, coefficients or market values. They are hand-set
            priors, which is why they are applied at modest strength and published in full above.
          </li>
          <li>
            <strong className="font-medium text-foreground">
              Eligibility is treated as static.
            </strong>{' '}
            A player recorded as eligible but uncommitted may declare for another association at any
            point. The model records the status it was given and does not attempt to predict a
            decision.
          </li>
          <li>
            <strong className="font-medium text-foreground">
              Position groupings are coarse.
            </strong>{' '}
            Nine positions cannot capture the difference between an inverted full-back and an
            overlapping one, or between a target striker and a runner. Players are counted in their
            primary position only.
          </li>
        </ul>
      </Section>

      <Separator className="bg-border/60" />

      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-normal">
            Research snapshot
          </Badge>
          <span className="text-xs text-muted-foreground">
            {research.label} · researched {research.researchDate}
          </span>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">Research snapshot methodology</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          This is a separate tier from everything above. It is a one-time, dated web-research
          exercise against FAI, UEFA, club, league and reputable press sources — not a statistical
          model and not a live feed. It carries no accuracy claim: it is a structured, sourced,
          cited read of what was publicly reported on {research.researchDate}, and it goes stale
          the moment any of those facts change.
        </p>
      </header>

      <Section
        id="research-evidence"
        title="The evidence model"
        lead="Every sourced claim about a player is its own record, kept separate from the reading of it."
      >
        <p>
          A claim (e.g. &ldquo;started seven of the last ten league matches&rdquo;) is recorded
          apart from its interpretation (e.g. &ldquo;provides moderate evidence of positive
          progression&rdquo;), together with its source, publish and access dates, whether it is a
          primary or secondary account, and links to any evidence that corroborates or contradicts
          it. Nothing is invented: where a fact could not be verified, the field is set to{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">null</code> or the player carries
          an explicit note in <code className="rounded bg-muted px-1 py-0.5 text-xs">unverified</code>{' '}
          rather than a guessed number. Every source must resolve to a direct article URL — the
          runtime schema rejects a search-results page as a source.
        </p>
        <p>
          Each claim is assigned one of 18 fixed categories, and each category has a fixed
          direction — positive, negative or neutral — set once, not per player, so the direction of
          a category cannot be quietly tuned to produce a nicer-looking assessment. Neutral
          categories such as a transfer or an eligibility confirmation describe a change in
          situation without implying it is progress or regress.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border/70">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Category</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead className="text-right">Weight</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {EVIDENCE_CATEGORIES.map((category) => (
                <TableRow key={category}>
                  <TableCell className="font-medium">
                    {EVIDENCE_CATEGORY_LABELS[category]}
                  </TableCell>
                  <TableCell className="text-xs capitalize text-muted-foreground">
                    {EVIDENCE_DIRECTION[category]}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {EVIDENCE_CATEGORY_WEIGHT[category]}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section
        id="research-heuristic"
        title="The progression heuristic"
        lead="A documented, fixed arithmetic over evidence — not a fitted or validated model."
      >
        <p>Each non-neutral evidence item contributes:</p>
        <pre className="max-w-3xl overflow-x-auto rounded-md border border-border/70 bg-muted/40 p-3 text-xs">
          contribution = sign × categoryWeight × sourceReliability × recency × primaryOrSecondary ×
          contested
        </pre>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong className="font-medium text-foreground">sign</strong> is +1 for a
            positive-direction category, -1 for negative.
          </li>
          <li>
            <strong className="font-medium text-foreground">categoryWeight</strong> (0-12, listed
            above) reflects how large a signal the category typically is.
          </li>
          <li>
            <strong className="font-medium text-foreground">sourceReliability</strong> is 1.0 /
            0.75 / 0.5 for high / medium / low-reliability sources.
          </li>
          <li>
            <strong className="font-medium text-foreground">recency</strong> decays from 1.0 at
            three months old to 0.25 beyond 24 months; an unknown publish date is treated as 36
            months old, never as recent.
          </li>
          <li>
            <strong className="font-medium text-foreground">primaryOrSecondary</strong> is 1.0 for
            a primary source, 0.8 for reporting on one.
          </li>
          <li>
            <strong className="font-medium text-foreground">contested</strong> is 0.6 if another
            item contradicts this one, 1.0 otherwise — a contested claim is damped, never discarded.
          </li>
        </ul>
        <p>
          A small, capped age-curve nudge (±2 points, using the same positional curves as the
          statistical model above) is applied on top, but only when the player already has at
          least one piece of directional evidence. This is the direct implementation of the
          brief&rsquo;s central safety rule: age or youth alone never creates a status. A
          19-year-old or a 34-year-old with zero sourced evidence both resolve to
          &ldquo;insufficient evidence&rdquo;, never to stable, improving or declining.
        </p>
        <p>
          The summed score is compared against a ±4-point stable band: above it is improving, below
          it declining, inside it stable. A non-senior player with breakthrough-shaped evidence
          (first-team breakthrough, senior call-up, or under-21 progression) and a non-negative
          score is labelled emerging instead. A player with no relevant evidence at all is
          insufficient-evidence, regardless of age, position or club — absence of news is never
          read as decline.
        </p>
        <p>
          Confidence (0-1, reported as low / moderate / high at 0.4 / 0.7) multiplicatively
          combines a saturating evidence-count term, average source reliability and recency, a
          source-diversity penalty when every item traces to one source, a contradiction penalty, a
          penalty scaled to the player&rsquo;s number of unverified fields, a penalty for a recent
          club change, and a penalty for fewer than 450 minutes in the last completed season. Each
          reason is surfaced in plain language in the assessment&rsquo;s missing-information list,
          not folded into a single number.
        </p>
        <p>
          The progression score and a confidence-derived standard deviation (6 points at full
          confidence, widening to 15 at zero confidence) are fed through the same
          normal-distribution machinery the statistical model uses, against the same ±4-point
          stable band, and rounded by largest remainder so the three probabilities always sum to
          exactly 100. A player with insufficient-evidence status is given a flat 34/33/33 split
          rather than a computed one, since there is nothing to compute from.
        </p>
      </Section>

      <Section
        id="research-outlook"
        title="The pool outlook"
        lead="Two things worth stating plainly, because the interface must not blur them."
      >
        <p>
          <strong className="font-medium text-foreground">
            &ldquo;Depth&rdquo; here is a headcount-and-involvement measure, not an ability
            measure.
          </strong>{' '}
          A position can look deep on paper — many players, most starting regularly for their
          clubs — while every player in it is mediocre. This snapshot has no percentile scoring to
          say otherwise.
        </p>
        <p>
          A position is flagged as depending on ageing players only when its senior options
          average 30 or older <em>and</em> no emerging player has been researched behind them —
          both conditions, not either. A pool-wide direction (strengthening / broadly-stable /
          weakening) is only attempted once at least 5 players have a directional assessment; below
          that the outlook reports insufficient-evidence rather than a number built on too little.
          Where a direction is given, it comes from a confidence-weighted net score of
          improving-vs-declining assessments against a fixed ±0.15 threshold, and the
          uncertainty field states the exact fraction of players it is based on.
        </p>
        <p className="font-medium text-foreground">
          As above, repeated here because it is the most important limitation: this module says
          nothing about qualification for any tournament. There is no fixture list, no opponent
          strength and no qualification model anywhere in this snapshot or the code that derives
          from it.
        </p>
      </Section>

      <Section
        id="research-limits"
        title="Research snapshot: known limitations"
        lead="This is a single research pass at a point in time, not a monitored feed."
      >
        <ul className="ml-5 list-disc space-y-2.5">
          <li>
            Any transfer, injury or squad announcement after {research.researchDate} is not
            reflected.
          </li>
          <li>
            Coverage across the four research groups that produced this snapshot was uneven under
            time constraints — see the research gaps below for players named in a squad list but
            not researched to a standard fit for inclusion, and players deliberately omitted rather
            than guessed at.
          </li>
          <li>
            The heuristic&rsquo;s category weights and confidence terms are hand-set, like the
            statistical model&rsquo;s priors above — they have not been fitted or backtested
            against outcomes.
          </li>
          <li>
            Involvement (starting / rotating / bench / out-of-squad / unknown) is a qualitative
            read of the most recent reporting found, not a computed stat.
          </li>
        </ul>
        {research.gaps.length > 0 && (
          <div className="space-y-2">
            <p className="font-medium text-foreground">
              Named research gaps ({research.gaps.length})
            </p>
            <ul className="ml-5 list-disc space-y-2">
              {research.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Separator className="bg-border/60" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Data provenance</h2>
        <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>
            Source: <span className="text-foreground">{sourceLabel}</span> · data as at{' '}
            <span className="text-foreground">{asOfDate}</span> · model version{' '}
            <span className="text-foreground">{MODEL_CONFIG.version}</span>
          </p>
          {isDemonstrationData && (
            <p className="rounded-md border border-amber-700/40 bg-amber-950/30 p-3 text-amber-100/90">
              The dataset currently loaded is a demonstration dataset. Player names are fictional and
              every statistic is illustrative, generated from a seeded random process. Nothing on any
              page of this application describes a real footballer. League and club names are real,
              and their strength ratings are this model&rsquo;s own estimates. The application reads
              its data through a single adapter interface, so replacing this dataset with a licensed
              football-data feed requires one new implementation of that interface and no change to
              the model or the interface.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string
  title: string
  lead: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-foreground/90">{lead}</p>
      </div>
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground [&>ol]:max-w-3xl [&>p]:max-w-3xl [&>ul]:max-w-3xl">
        {children}
      </div>
    </section>
  )
}
