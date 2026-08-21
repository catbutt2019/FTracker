import type { ProbabilitySplit } from '@/types/domain'
import { cn } from '@/lib/utils'

/**
 * The three outcome probabilities as one stacked bar.
 *
 * Shown as a single bar rather than three separate figures so that the fact
 * they are exhaustive — and sum to 100 — is visible rather than asserted.
 * Declining uses a hatched fill as well as a colour, so the segments remain
 * distinguishable without relying on hue.
 */
export function ProbabilityBar({
  probabilities,
  showLegend = true,
  height = 'h-2.5',
  className,
}: {
  probabilities: ProbabilitySplit
  showLegend?: boolean
  height?: string
  className?: string
}) {
  const { improve, stable, decline } = probabilities
  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        className={cn('flex w-full overflow-hidden rounded-full bg-muted', height)}
        role="img"
        aria-label={`${improve}% chance of improving, ${stable}% broadly stable, ${decline}% declining`}
      >
        <div className="bg-shamrock-500" style={{ width: `${improve}%` }} />
        <div className="bg-slate-500" style={{ width: `${stable}%` }} />
        <div className="diagonal-hatch bg-amber-600" style={{ width: `${decline}%` }} />
      </div>
      {showLegend && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <LegendItem swatch="bg-shamrock-500" label="Improve" value={improve} />
          <LegendItem swatch="bg-slate-500" label="Stable" value={stable} />
          <LegendItem swatch="diagonal-hatch bg-amber-600" label="Decline" value={decline} />
        </div>
      )}
    </div>
  )
}

function LegendItem({
  swatch,
  label,
  value,
}: {
  swatch: string
  label: string
  value: number
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('size-2.5 rounded-sm', swatch)} aria-hidden="true" />
      {label}
      <span className="tabular font-medium text-foreground">{value}%</span>
    </span>
  )
}

/**
 * A projected range on a fixed 0-100 track.
 *
 * The point of this component is that the range, not the midpoint, is the
 * headline. The median is a tick inside the band rather than a large number
 * sitting on top of it.
 */
export function RangeBar({
  low,
  median,
  high,
  current,
  className,
}: {
  low: number
  median: number
  high: number
  current?: number
  className?: string
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <div
        className="relative h-6 w-full rounded-md bg-muted/70"
        role="img"
        aria-label={`Projected range from ${low} to ${high}, midpoint ${median}${
          current !== undefined ? `, current score ${current}` : ''
        }`}
      >
        <div
          className="absolute inset-y-1 rounded-sm bg-shamrock-600/35 ring-1 ring-inset ring-shamrock-500/60"
          style={{ left: `${low}%`, width: `${Math.max(high - low, 0.8)}%` }}
        />
        <div
          className="absolute inset-y-0.5 w-0.5 bg-shamrock-900"
          style={{ left: `${median}%` }}
          title={`Projected midpoint ${median}`}
        />
        {current !== undefined && (
          <div
            className="absolute inset-y-0 w-px bg-foreground/70"
            style={{ left: `${current}%` }}
            title={`Current score ${current}`}
          >
            <span className="absolute -top-0.5 left-1/2 size-1.5 -translate-x-1/2 rotate-45 bg-foreground/70" />
          </div>
        )}
      </div>
      {/*
        The track is a fixed 0-100 scale, so the end labels are 0 and 100 rather
        than the band edges. Putting the band values at the container edges made
        the band look wider than it is.
      */}
      <div className="tabular flex justify-between text-[11px] text-muted-foreground">
        <span>0</span>
        <span>
          <span className="text-foreground">
            {low.toFixed(1)}–{high.toFixed(1)}
          </span>{' '}
          (midpoint {median.toFixed(1)})
        </span>
        <span>100</span>
      </div>
    </div>
  )
}
