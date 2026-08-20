import { Minus, Sparkles, TrendingDown, TrendingUp, HelpCircle } from 'lucide-react'
import type { ProgressionStatus } from '@/types/research'
import { cn } from '@/lib/utils'

/**
 * Research's status is five-way (it adds `emerging` and `insufficient-evidence`
 * to the statistical model's three), so it cannot reuse `TrajectoryBadge`
 * as-is. Kept as its own component rather than widening that one, so the
 * statistical model's badge stays a visibly closed three-way set.
 */
const STATUS_STYLES: Record<
  ProgressionStatus,
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
  emerging: {
    label: 'Emerging',
    icon: Sparkles,
    className: 'bg-sky-600/20 text-sky-200 border-sky-600/50',
  },
  'insufficient-evidence': {
    label: 'Insufficient evidence',
    icon: HelpCircle,
    className: 'bg-muted text-muted-foreground border-border',
  },
}

export function ResearchStatusBadge({
  status,
  className,
}: {
  status: ProgressionStatus
  className?: string
}) {
  const style = STATUS_STYLES[status]
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
      {style.label}
    </span>
  )
}
