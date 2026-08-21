import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Falls back to a deterministic initials badge when no photo is available —
 * either because the research pass found none, or because it found one but
 * couldn't verify it was actually this player (see `avatarUrl` on
 * `PlayerRaw`). The colour is derived from the name so the same player
 * always gets the same colour across pages, without needing to store
 * anything.
 */
const PALETTE = [
  'border-shamrock-200 bg-shamrock-100 text-shamrock-800',
  'border-sky-200 bg-sky-100 text-sky-800',
  'border-amber-200 bg-amber-100 text-amber-800',
  'border-violet-200 bg-violet-100 text-violet-800',
  'border-rose-200 bg-rose-100 text-rose-800',
  'border-teal-200 bg-teal-100 text-teal-800',
  'border-indigo-200 bg-indigo-100 text-indigo-800',
  'border-slate-300 bg-slate-100 text-slate-800',
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
  imageUrl,
  size = 'md',
  className,
}: {
  name: string
  /**
   * A verified-source photo URL, or null/undefined to use the initials
   * badge. These are hotlinked third-party images, so a load failure (dead
   * link, CORS, etc.) silently falls back to initials rather than showing a
   * broken-image icon.
   */
  imageUrl?: string | null
  size?: keyof typeof SIZE_CLASSES
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const palette = PALETTE[hashString(name) % PALETTE.length]

  if (imageUrl && !failed) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex shrink-0 overflow-hidden rounded-full border bg-muted',
          SIZE_CLASSES[size],
          className,
        )}
      >
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-cover object-top"
        />
      </span>
    )
  }

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
