import { AlertTriangle, HelpCircle, Inbox, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/** An information affordance attached to a label, for explaining a metric. */
export function InfoHint({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex text-muted-foreground/70 transition-colors hover:text-foreground"
          aria-label={label ?? 'What does this mean?'}
        >
          <HelpCircle className="size-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">{children}</TooltipContent>
    </Tooltip>
  )
}

export function StatCard({
  label,
  value,
  hint,
  footnote,
  children,
  className,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  footnote?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('border-border/70 bg-card/60', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
          {hint && <InfoHint label={`About ${label}`}>{hint}</InfoHint>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="tabular text-2xl font-semibold leading-none">{value}</div>
        {children}
        {footnote && <p className="text-xs leading-relaxed text-muted-foreground">{footnote}</p>}
      </CardContent>
    </Card>
  )
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

export function LoadingState({ label = 'Loading player data' }: { label?: string }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {label}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="border-border/70 bg-card/60">
            <CardHeader className="pb-2">
              <Skeleton className="h-3 w-24" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-2 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-border/70 bg-card/60">
        <CardContent className="pt-6">
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardContent className="flex flex-col items-start gap-3 py-8">
        <div className="flex items-center gap-2 text-sm font-medium text-red-200">
          <AlertTriangle className="size-4" aria-hidden="true" />
          Player data could not be loaded
        </div>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{message}</p>
        <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
          Nothing is shown rather than a partial forecast, because a squad-strength score computed
          from an incomplete pool would be misleading.
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
          >
            Try again
          </button>
        )}
      </CardContent>
    </Card>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 px-6 py-14 text-center">
      <Inbox className="size-6 text-muted-foreground/60" aria-hidden="true" />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action}
    </div>
  )
}

/**
 * Marks a value the provider did not supply.
 *
 * Used everywhere a metric is missing. The rule throughout this application is
 * that a gap in the data is shown as a gap, never filled with a zero or a
 * cohort average that the user would read as a real observation.
 */
export function NotSupplied({ reason }: { reason?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span className="diagonal-hatch h-3 w-6 rounded-sm border border-border/60" aria-hidden="true" />
      <span className="italic">Not supplied</span>
      {reason && <InfoHint label="Why is this missing?">{reason}</InfoHint>}
    </span>
  )
}
