import { cn } from '@/lib/utils'

/**
 * No real photo exists for demo-tier players (fictional) and none is
 * licensed for research-tier players (real people), so every avatar is a
 * deterministic initials badge rather than a fetched image. The colour is
 * derived from the name so the same player always gets the same colour
 * across pages, without needing to store anything.
 */
const PALETTE = [
  'border-shamrock-600/50 bg-shamrock-700/40 text-shamrock-200',
  'border-sky-600/50 bg-sky-700/40 text-sky-200',
  'border-amber-600/50 bg-amber-700/40 text-amber-200',
  'border-violet-600/50 bg-violet-700/40 text-violet-200',
  'border-rose-600/50 bg-rose-700/40 text-rose-200',
  'border-teal-600/50 bg-teal-700/40 text-teal-200',
  'border-indigo-600/50 bg-indigo-700/40 text-indigo-200',
  'border-slate-500/50 bg-slate-600/40 text-slate-200',
]

const SIZE_CLASSES = {
  sm: 'size-8 text-[11px]',
  md: 'size-10 text-xs',
  lg: 'size-14 text-base',
} as const

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function PlayerAvatar({
  name,
  size = 'md',
  className,
}: {
  name: string
  size?: keyof typeof SIZE_CLASSES
  className?: string
}) {
  const palette = PALETTE[hashString(name) % PALETTE.length]
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border font-semibold',
        SIZE_CLASSES[size],
        palette,
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  )
}
