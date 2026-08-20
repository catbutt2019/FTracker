import { Minus, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react'
import type { ConfidenceLevel, PositionDepth, Trajectory } from '@/types/domain'
import { cn } from '@/lib/utils'

/**
 * Status indicators.
 *
 * Every one of these pairs its colour with a text label and an icon or pattern.
 * Trajectory is the most important signal in the product, and encoding it in
 * colour alone would make it unreadable for anyone with a colour vision
 * deficiency and invisible in a greyscale print of a portfolio piece.
 */

const TRAJECTORY_STYLES: Record<
  Trajectory,
  { label: string; icon: typeof TrendingUp; className: string }
> = {
  improving: {
    label: 'Improving',
    icon: TrendingUp,
    className: 'bg-shamrock-700/25 text-shamrock-200 border-shamrock-600/50',
  },
  stable: {
    label: 'Stable',
    icon: Minus,
    className: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
  },
  declining: {
    label: 'Declining',
    icon: TrendingDown,
    className: 'bg-amber-600/20 text-amber-200 border-amber-600/50',
  },
}

export function TrajectoryBadge({
  trajectory,
  className,
  compact = false,
}: {
  trajectory: Trajectory
  className?: string
  compact?: boolean
}) {
  const style = TRAJECTORY_STYLES[trajectory]
  const Icon = style.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        style.className,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {compact ? <span className="sr-only">{style.label}</span> : style.label}
    </span>
  )
}

const CONFIDENCE_META: Record<ConfidenceLevel, { label: string; filled: number }> = {
  low: { label: 'Low confidence', filled: 1 },
  moderate: { label: 'Moderate confidence', filled: 2 },
  high: { label: 'High confidence', filled: 3 },
}

/**
 * Confidence as three bars, filled by level.
 *
 * Deliberately not colour-coded by level: a low-confidence forecast is not a
 * bad thing, it is a statement about the evidence, and painting it red would
 * imply the player is the problem.
 */
export function ConfidenceIndicator({
  level,
  showLabel = true,
  className,
}: {
  level: ConfidenceLevel
  showLabel?: boolean
  className?: string
}) {
  const meta = CONFIDENCE_META[level]
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="flex items-end gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={cn(
              'w-1 rounded-sm',
              index === 0 ? 'h-2' : index === 1 ? 'h-3' : 'h-4',
              index < meta.filled ? 'bg-foreground/75' : 'bg-foreground/15',
            )}
          />
        ))}
      </span>
      <span className={cn('text-xs', showLabel ? 'text-muted-foreground' : 'sr-only')}>
        {showLabel ? capitalise(level) : meta.label}
      </span>
    </span>
  )
}

function capitalise(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const DEPTH_RISK_STYLES: Record<
  PositionDepth['depthRisk'],
  { label: string; className: string; hatched: boolean }
> = {
  low: { label: 'Low risk', className: 'bg-shamrock-700/25 text-shamrock-200 border-shamrock-600/50', hatched: false },
  moderate: { label: 'Moderate risk', className: 'bg-slate-500/15 text-slate-300 border-slate-500/40', hatched: false },
  high: { label: 'High risk', className: 'bg-amber-600/20 text-amber-200 border-amber-600/50', hatched: true },
  critical: { label: 'Critical risk', className: 'bg-destructive/20 text-red-200 border-destructive/60', hatched: true },
}

export function DepthRiskBadge({
  risk,
  className,
}: {
  risk: PositionDepth['depthRisk']
  className?: string
}) {
  const style = DEPTH_RISK_STYLES[risk]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        style.className,
        className,
      )}
    >
      {style.hatched && <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />}
      {style.label}
    </span>
  )
}

/** Signed change, with an arrow glyph so the sign is never carried by colour. */
export function DeltaValue({
  value,
  suffix = '',
  className,
}: {
  value: number | null
  suffix?: string
  className?: string
}) {
  if (value === null) {
    return <span className={cn('text-muted-foreground', className)}>No prior season</span>
  }
  const positive = value > 0.05
  const negative = value < -0.05
  return (
    <span
      className={cn(
        'tabular inline-flex items-center gap-1 font-medium',
        positive && 'text-shamrock-200',
        negative && 'text-amber-200',
        !positive && !negative && 'text-muted-foreground',
        className,
      )}
    >
      {positive ? '▲' : negative ? '▼' : '—'}
      {positive ? '+' : ''}
      {value.toFixed(1)}
      {suffix}
    </span>
  )
}
