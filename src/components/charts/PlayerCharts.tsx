import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { MetricScore, Player } from '@/types/domain'
import { ageCurveSeries, peakAgeFor } from '@/model/ageCurve'
import { HORIZONS } from '@/model/forecast'

/**
 * A player's observed season scores, continued into the projected range.
 *
 * Same visual grammar as the squad chart: solid for what happened, dashed and
 * banded for what the model guesses.
 */
export function PlayerTrendChart({ player }: { player: Player }) {
  const observed = [...player.seasonScores]
    .reverse()
    .map((season) => ({
      label: season.season,
      observed: season.shrunkScore,
      projected: null as number | null,
      band: null as [number, number] | null,
      minutes: season.minutes,
    }))

  const startYear = Number(player.season.slice(0, 4))
  const projected = HORIZONS.map((horizon) => {
    const projection = player.forecast.projections[horizon]
    const year = startYear + horizon / 12
    return {
      label: `${year}-${String((year + 1) % 100).padStart(2, '0')}`,
      observed: null as number | null,
      projected: projection.median,
      band: [projection.low, projection.high] as [number, number],
      minutes: 0,
    }
  })

  // Join the two series at the current score so the line is continuous.
  if (observed.length > 0) {
    const last = observed[observed.length - 1]
    last.projected = player.forecast.currentPerformanceScore
    last.band = [
      player.forecast.currentPerformanceScore,
      player.forecast.currentPerformanceScore,
    ]
  }

  const data = [...observed, ...projected]

  return (
    <div className="space-y-3">
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              stroke="hsl(var(--border))"
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              stroke="hsl(var(--border))"
            />
            <ReferenceLine
              y={50}
              stroke="hsl(var(--muted-foreground))"
              strokeOpacity={0.4}
              strokeDasharray="2 4"
              label={{
                value: 'Pool average',
                position: 'insideLeft',
                fill: 'hsl(var(--muted-foreground))',
                fontSize: 10,
              }}
            />
            <Tooltip content={<PlayerTrendTooltip />} />
            <Area
              dataKey="band"
              stroke="none"
              fill="hsl(var(--primary))"
              fillOpacity={0.16}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="observed"
              stroke="hsl(var(--foreground))"
              strokeWidth={2}
              dot={{ r: 3, fill: 'hsl(var(--foreground))' }}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="projected"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={{ r: 3, fill: 'hsl(var(--primary))' }}
              isAnimationActive={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-6 bg-foreground" aria-hidden="true" />
          Observed season score
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="h-0.5 w-6 bg-[repeating-linear-gradient(to_right,hsl(var(--primary))_0_5px,transparent_5px_9px)]"
            aria-hidden="true"
          />
          Projected midpoint
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-6 rounded-sm bg-primary/20" aria-hidden="true" />
          80% range
        </span>
      </div>
    </div>
  )
}

interface TrendTooltipEntry {
  payload: {
    label: string
    observed: number | null
    projected: number | null
    band: [number, number] | null
    minutes: number
  }
}

function PlayerTrendTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TrendTooltipEntry[]
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="mb-1 font-medium">{point.label}</p>
      {point.observed !== null ? (
        <>
          <p className="tabular text-muted-foreground">
            Score <span className="font-medium text-foreground">{point.observed.toFixed(1)}</span>
          </p>
          <p className="tabular text-muted-foreground">
            {point.minutes.toLocaleString()} minutes
          </p>
        </>
      ) : (
        <>
          <p className="tabular text-muted-foreground">
            Midpoint{' '}
            <span className="font-medium text-foreground">{point.projected?.toFixed(1)}</span>
          </p>
          {point.band && (
            <p className="tabular text-muted-foreground">
              80% range {point.band[0].toFixed(1)} to {point.band[1].toFixed(1)}
            </p>
          )}
          <p className="mt-1 text-muted-foreground/80">Projection, not observed.</p>
        </>
      )}
    </div>
  )
}

/**
 * Percentile ranking on each position-specific metric.
 *
 * Bars are percentiles rather than raw values so that metrics on wildly
 * different scales are comparable. Metrics the provider did not supply get an
 * explicit hatched placeholder rather than a zero-length bar, which would read
 * as "bad at this".
 */
export function MetricPercentileChart({ metrics }: { metrics: MetricScore[] }) {
  const supplied = metrics.filter((m) => m.percentile !== null)
  const missing = metrics.filter((m) => m.percentile === null)

  return (
    <div className="space-y-4">
      {supplied.length > 0 && (
        <div style={{ height: supplied.length * 42 + 24 }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={supplied.map((m) => ({
                label: m.label,
                percentile: m.percentile as number,
                value: m.value,
                unit: m.unit,
              }))}
              layout="vertical"
              margin={{ top: 0, right: 44, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                stroke="hsl(var(--border))"
                strokeOpacity={0.4}
                horizontal={false}
              />
              <XAxis
                type="number"
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                stroke="hsl(var(--border))"
              />
              <YAxis
                type="category"
                dataKey="label"
                width={158}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                stroke="hsl(var(--border))"
              />
              <Tooltip content={<MetricTooltip />} cursor={{ fill: 'hsl(var(--accent))', fillOpacity: 0.3 }} />
              <ReferenceLine x={50} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
              <Bar dataKey="percentile" radius={[0, 3, 3, 0]} barSize={14} isAnimationActive={false}>
                {supplied.map((metric) => (
                  <Cell
                    key={metric.key}
                    fill={
                      (metric.percentile as number) >= 50
                        ? 'hsl(var(--primary))'
                        : 'hsl(215 20% 45%)'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {missing.length > 0 && (
        <div className="space-y-2 rounded-md border border-dashed border-border/70 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Not supplied for this season
          </p>
          <ul className="space-y-1.5">
            {missing.map((metric) => (
              <li key={metric.key} className="flex items-center gap-2 text-xs">
                <span
                  className="diagonal-hatch h-3 w-10 shrink-0 rounded-sm border border-border/60"
                  aria-hidden="true"
                />
                <span className="text-muted-foreground">{metric.label}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-muted-foreground/80">
            These metrics carry{' '}
            {Math.round(missing.reduce((sum, m) => sum + m.weight, 0) * 100)}% of the normal weight
            for this position. They are excluded and the remainder reweighted, rather than filled
            with an estimate.
          </p>
        </div>
      )}
    </div>
  )
}

interface MetricTooltipEntry {
  payload: { label: string; percentile: number; value: number | null; unit: string }
}

function MetricTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: MetricTooltipEntry[]
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="mb-1 font-medium">{point.label}</p>
      <p className="tabular text-muted-foreground">
        {point.value} {point.unit}
      </p>
      <p className="tabular text-muted-foreground">
        {Math.round(point.percentile)}th percentile in the Irish pool
      </p>
    </div>
  )
}

/**
 * The positional age curve with the player placed on it.
 *
 * Included because the age assumption is one of the model's biggest levers, and
 * a user should be able to see the shape being applied to them rather than
 * taking the resulting number on trust.
 */
export function AgeCurveChart({ player }: { player: Player }) {
  const series = ageCurveSeries(player.primaryPosition).map((point) => ({
    age: point.age,
    relative: Math.round(point.multiplier * 1000) / 10,
  }))
  const peak = peakAgeFor(player.primaryPosition)
  const playerPoint = series.reduce((closest, point) =>
    Math.abs(point.age - player.exactAge) < Math.abs(closest.age - player.exactAge)
      ? point
      : closest,
  )

  return (
    <div className="h-[210px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 12, right: 16, bottom: 4, left: -20 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
          <XAxis
            dataKey="age"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            stroke="hsl(var(--border))"
          />
          <YAxis
            domain={[60, 105]}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            stroke="hsl(var(--border))"
            unit="%"
          />
          <ReferenceLine
            x={peak}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="2 4"
            label={{
              value: `Typical peak ${peak}`,
              position: 'insideTopLeft',
              fill: 'hsl(var(--muted-foreground))',
              fontSize: 10,
            }}
          />
          <Line
            type="monotone"
            dataKey="relative"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <ReferenceDot
            x={playerPoint.age}
            y={playerPoint.relative}
            r={5}
            fill="hsl(var(--primary))"
            stroke="hsl(var(--background))"
            strokeWidth={2}
            label={{
              value: `Age ${player.age}`,
              position: 'top',
              fill: 'hsl(var(--foreground))',
              fontSize: 11,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
