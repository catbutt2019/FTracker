import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { SquadStrengthPoint } from '@/types/domain'

/**
 * Squad strength over time.
 *
 * Observed seasons are a solid line; projected seasons are dashed with a shaded
 * 80% band. Keeping the projection dashed *and* banded matters — a single
 * continuous line running into the future would read as a forecast the model
 * cannot support.
 */
export function SquadTrendChart({ data }: { data: SquadStrengthPoint[] }) {
  const lastObserved = [...data].reverse().find((point) => point.kind === 'observed')

  const shaped = data.map((point) => ({
    season: point.season,
    observed: point.observed,
    projectedMedian: point.projectedMedian,
    band:
      point.projectedLow !== null && point.projectedHigh !== null
        ? [point.projectedLow, point.projectedHigh]
        : null,
    low: point.projectedLow,
    high: point.projectedHigh,
  }))

  const values = data.flatMap((p) =>
    [p.observed, p.projectedLow, p.projectedHigh].filter((v): v is number => v !== null),
  )
  const min = Math.floor(Math.min(...values) - 4)
  const max = Math.ceil(Math.max(...values) + 4)

  return (
    <div className="space-y-3">
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={shaped} margin={{ top: 8, right: 16, bottom: 4, left: -14 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
            <XAxis
              dataKey="season"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              stroke="hsl(var(--border))"
            />
            <YAxis
              domain={[min, max]}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              stroke="hsl(var(--border))"
            />
            <Tooltip content={<SquadTooltip />} />
            {lastObserved && (
              <ReferenceLine
                x={lastObserved.season}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="2 4"
                label={{
                  value: 'Projection begins',
                  position: 'insideTopRight',
                  fill: 'hsl(var(--muted-foreground))',
                  fontSize: 10,
                }}
              />
            )}
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
              dataKey="projectedMedian"
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
          Observed
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
          80% projected range
        </span>
      </div>
    </div>
  )
}

interface TooltipPayloadEntry {
  payload: {
    season: string
    observed: number | null
    projectedMedian: number | null
    low: number | null
    high: number | null
  }
}

function SquadTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipPayloadEntry[]
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  const isProjection = point.observed === null

  return (
    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="mb-1 font-medium">{point.season}</p>
      {point.observed !== null && (
        <p className="tabular text-muted-foreground">
          Observed <span className="font-medium text-foreground">{point.observed.toFixed(1)}</span>
        </p>
      )}
      {isProjection && point.projectedMedian !== null && (
        <>
          <p className="tabular text-muted-foreground">
            Midpoint{' '}
            <span className="font-medium text-foreground">
              {point.projectedMedian.toFixed(1)}
            </span>
          </p>
          {point.low !== null && point.high !== null && (
            <p className="tabular text-muted-foreground">
              80% range {point.low.toFixed(1)} to {point.high.toFixed(1)}
            </p>
          )}
          <p className="mt-1 max-w-[190px] leading-relaxed text-muted-foreground/80">
            Simulated, not observed.
          </p>
        </>
      )}
    </div>
  )
}
