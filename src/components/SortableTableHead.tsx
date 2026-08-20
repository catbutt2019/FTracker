import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { TableHead } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export type SortDirection = 'asc' | 'desc'

export function SortableTableHead<Key extends string>({
  label,
  ariaLabel,
  sortKey,
  activeSort,
  direction,
  onSort,
  align = 'left',
  className,
}: {
  label: ReactNode
  ariaLabel?: string
  sortKey: Key
  activeSort: Key
  direction: SortDirection
  onSort: (key: Key) => void
  align?: 'left' | 'right'
  className?: string
}) {
  const active = activeSort === sortKey
  const labelText = ariaLabel ?? (typeof label === 'string' ? label : sortKey)
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${labelText}${active ? `, currently ${direction === 'asc' ? 'ascending' : 'descending'}` : ''}`}
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground',
          align === 'right' && 'flex-row-reverse',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
        {active ? (
          direction === 'asc' ? (
            <ArrowUp className="size-3" aria-hidden="true" />
          ) : (
            <ArrowDown className="size-3" aria-hidden="true" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-40" aria-hidden="true" />
        )}
      </button>
    </TableHead>
  )
}
