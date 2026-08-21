import { Link } from 'react-router-dom'
import type { MatchdaySlot } from '@/model/matchdayXI'
import type { Position } from '@/types/domain'
import { RISK_CONFIG } from '@/model/config'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { cn } from '@/lib/utils'

/**
 * The projected XI drawn on a pitch instead of listed in a table.
 *
 * The formation is not a free choice — it is `REQUIRED_STARTING_SLOTS` read
 * back out, so what is drawn here is exactly what `buildMatchdaySelection`
 * picked. The rows below therefore have to account for all eleven slots and no
 * others; a mismatch shows up as an unplaced player rather than being hidden,
 * see `leftover` at the end of this file.
 *
 * Own goal at the top, attacking downwards, matching how most line-up
 * graphics are drawn. Positions read left-to-right as they would on the pitch,
 * so the left-back sits on the left.
 */

/**
 * A 4-1-2-3 reading of the model's slots: back four, a holding midfielder, two
 * ahead of him, and a front three. `REQUIRED_STARTING_SLOTS` defines the
 * counts (GK 1, RB 1, CB 2, LB 1, DM 1, CM 1, AM 1, W 2, ST 1); this only
 * decides where they sit.
 */
const FORMATION_ROWS: Position[][] = [
  ['GK'],
  ['LB', 'CB', 'CB', 'RB'],
  ['DM'],
  ['CM', 'AM'],
  ['W', 'ST', 'W'],
]

/**
 * Colour bands for the score badge.
 *
 * The lower boundary is `seniorReadyThreshold`, the same 55 the risk model
 * uses to decide whether a player counts as credible senior cover — so an
 * amber badge means precisely "at or above the bar the rest of this model
 * applies", not a hand-picked notion of acceptable. The upper boundary is
 * presentational: it marks players comfortably clear of that bar, and carries
 * no meaning elsewhere in the model.
 */
const STRONG_SCORE = 65

/**
 * Surname only, the way a broadcast line-up graphic labels a shirt.
 *
 * The dataset stores full legal names — "Caoimhín Odhrán Kelleher", "Troy
 * Daniel Parrott" — which are wider than the space a figure on a pitch has.
 * Truncating them mid-word ("Caoimhín Odhrá…") loses the identifying part,
 * whereas the surname is what a reader recognises. The full name stays in the
 * `title` tooltip and on the player page, so nothing is lost.
 *
 * Particles are kept with the surname: "Jake Patrick O'Brien" reduces to
 * "O'Brien", and a lowercase particle such as "van"/"de" is carried along
 * rather than orphaning the reader with "Dijk".
 */
function surname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length <= 1) return fullName
  let start = parts.length - 1
  while (start > 1 && /^[a-z]/.test(parts[start - 1])) start -= 1
  return parts.slice(start).join(' ')
}

function badgeClasses(score: number): string {
  if (score >= STRONG_SCORE) return 'bg-shamrock-400 text-shamrock-950'
  if (score >= RISK_CONFIG.seniorReadyThreshold) return 'bg-amber-400 text-amber-950'
  return 'bg-orange-500 text-white'
}

/**
 * Below this, the involvement adjustment is not worth drawing attention to.
 *
 * The badge always shows `effectiveScore`, which already has the adjustment
 * baked in, so without a marker a lifted or docked score is indistinguishable
 * from an unadjusted one. Marking every player would be noise — a factor of
 * 0.995 changes nothing a reader should act on — so only a swing of at least a
 * point on a 100-point scale is flagged.
 */
const INVOLVEMENT_NOTICE_THRESHOLD = 0.01

/**
 * Explain the badge number in full, since it is a product of three things and
 * only one of them is the player's own ability.
 *
 * Written out longhand rather than as a formula: the reader of a line-up
 * graphic wants to know why a name is on the pitch, and "recently involved with
 * Ireland" is the answer the arithmetic is standing in for.
 */
function slotTooltip(slot: MatchdaySlot): string {
  const lines = [`${slot.player.name} — ${slot.position}`]
  lines.push(`Score ${slot.effectiveScore.toFixed(1)}`)
  lines.push(`  Ability ${slot.rawScore.toFixed(1)}`)
  if (slot.weight < 1) {
    lines.push(`  ×${slot.weight} out of position`)
  }

  const { involvement } = slot
  if (!involvement.hasEvidence) {
    lines.push('  No international record — no adjustment')
  } else if (Math.abs(involvement.factor - 1) >= INVOLVEMENT_NOTICE_THRESHOLD) {
    // Phrased so the reason matches the direction. "Docked for recent
    // involvement" would read as though being involved was the penalty.
    const reason =
      involvement.factor > 1
        ? 'Lifted'
        : 'Docked'
    const cause = involvement.factor > 1 ? 'recent' : 'little recent'
    const percent = Math.abs(Math.round((involvement.factor - 1) * 1000) / 10)
    lines.push(`  ${reason} ${percent}% — ${cause} Ireland involvement`)
    if (involvement.monthsSinceLastCap !== null) {
      lines.push(`    Last cap ${involvement.monthsSinceLastCap} months ago`)
    }
    if (involvement.minutesLast12Months !== null) {
      lines.push(`    ${involvement.minutesLast12Months} international minutes in 12 months`)
    }
  }

  return lines.join('\n')
}

function PitchMarkings() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full text-white/25"
      viewBox="0 0 100 140"
      preserveAspectRatio="none"
    >
      <g fill="none" stroke="currentColor" strokeWidth="0.4" vectorEffect="non-scaling-stroke">
        {/* Outer boundary, inset so the line is not clipped by the container. */}
        <rect x="1" y="1" width="98" height="138" />
        {/* Own penalty area and six-yard box, behind the goalkeeper. */}
        <rect x="22" y="1" width="56" height="20" />
        <rect x="37" y="1" width="26" height="8" />
        <path d="M 38 21 A 14 10 0 0 0 62 21" />
        {/* Halfway line and centre circle. */}
        <line x1="1" y1="70" x2="99" y2="70" />
        <circle cx="50" cy="70" r="13" />
        {/* Far penalty area, giving the front three something to attack into. */}
        <rect x="22" y="119" width="56" height="20" />
        <rect x="37" y="131" width="26" height="8" />
        <path d="M 38 119 A 14 10 0 0 1 62 119" />
      </g>
    </svg>
  )
}

function SlotFigure({ slot }: { slot: MatchdaySlot }) {
  const swing = slot.involvement.hasEvidence ? slot.involvement.factor - 1 : 0
  const flagged = Math.abs(swing) >= INVOLVEMENT_NOTICE_THRESHOLD

  return (
    <Link
      to={`/players/${slot.player.id}`}
      className="group flex w-[5.5rem] flex-col items-center gap-1 sm:w-24"
      title={slotTooltip(slot)}
    >
      <span className="relative">
        <PlayerAvatar
          name={slot.player.name}
          imageUrl={slot.player.avatarUrl}
          size="lg"
          className="border-2 border-white/80 shadow-md transition-transform group-hover:scale-105"
        />
        <span
          className={cn(
            'tabular absolute -bottom-1 -left-1 rounded px-1 py-px text-[10px] font-semibold leading-tight shadow-sm',
            badgeClasses(slot.effectiveScore),
          )}
        >
          {slot.effectiveScore.toFixed(1)}
        </span>
        {slot.weight < 1 && (
          // The discount is already applied to the badge above, so without this
          // the number looks like an ordinary low score rather than the result
          // of playing someone out of position.
          <span
            className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-white text-[9px] font-bold text-orange-600 shadow-sm"
            title="Out of position — score discounted"
          >
            !
          </span>
        )}
        {flagged && (
          // Sits opposite the out-of-position marker so a player carrying both
          // shows both. Like that marker, this exists because the adjustment is
          // already inside the badge number and would otherwise be invisible.
          <span
            className={cn(
              'absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-white text-[9px] font-bold shadow-sm',
              swing > 0 ? 'text-shamrock-700' : 'text-orange-600',
            )}
            aria-hidden="true"
          >
            {swing > 0 ? '▲' : '▼'}
          </span>
        )}
      </span>
      <span className="flex w-full flex-col items-center leading-tight">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-white/70">
          {slot.position}
        </span>
        <span className="w-full truncate text-center text-[11px] font-medium text-white">
          {surname(slot.player.name)}
        </span>
      </span>
    </Link>
  )
}

function EmptySlotFigure({ position }: { position: Position }) {
  return (
    <div
      className="flex w-[5.5rem] flex-col items-center gap-1 sm:w-24"
      title={`No available player can fill ${position}`}
    >
      <span className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-white/50 text-lg font-semibold text-white/50">
        ?
      </span>
      <span className="flex flex-col items-center leading-tight">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-white/70">
          {position}
        </span>
        <span className="text-[11px] font-medium text-orange-200">Unfilled</span>
      </span>
    </div>
  )
}

export function MatchdayPitch({
  slots,
  unfilled,
}: {
  slots: MatchdaySlot[]
  unfilled: Position[]
}) {
  // Consume selected players position by position, so the two centre-backs and
  // two wingers land in separate cells rather than both rendering the same
  // player. Unfilled slots are drawn as placeholders: the whole point of a
  // pitch view is that a hole in the team is visible as a hole.
  const queues = new Map<Position, MatchdaySlot[]>()
  for (const slot of slots) {
    const queue = queues.get(slot.position) ?? []
    queue.push(slot)
    queues.set(slot.position, queue)
  }
  const unfilledRemaining = new Map<Position, number>()
  for (const position of unfilled) {
    unfilledRemaining.set(position, (unfilledRemaining.get(position) ?? 0) + 1)
  }

  const rows = FORMATION_ROWS.map((row) =>
    row.map((position) => {
      const next = queues.get(position)?.shift()
      if (next) return { kind: 'slot' as const, slot: next }
      const remaining = unfilledRemaining.get(position) ?? 0
      if (remaining > 0) {
        unfilledRemaining.set(position, remaining - 1)
        return { kind: 'empty' as const, position }
      }
      return null
    }),
  )

  const anyOutOfPosition = slots.some((slot) => slot.weight < 1)
  const anyInvolvementFlagged = slots.some(
    (slot) =>
      slot.involvement.hasEvidence &&
      Math.abs(slot.involvement.factor - 1) >= INVOLVEMENT_NOTICE_THRESHOLD,
  )

  // Anything the layout above failed to place. Should always be empty; if a
  // formation slot is ever added to config without a matching cell here, this
  // reports it rather than silently dropping a selected player from the XI.
  const leftover = [...queues.values()].flat()

  return (
    <div>
      <div className="relative overflow-hidden rounded-lg bg-shamrock-700">
        {/* Mown stripes. Decorative only, and deliberately low-contrast so they
            never compete with the players sitting on top. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.13]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(180deg, #ffffff 0 10%, transparent 10% 20%)',
          }}
        />
        <PitchMarkings />

        {/* Extra bottom padding keeps the front three in front of the far
            penalty area rather than standing inside it, which read as the
            forwards being pinned on the goal line. */}
        <div className="relative flex flex-col gap-3 px-2 pb-14 pt-5 sm:gap-4 sm:px-4 sm:pb-20 sm:pt-7">
          {rows.map((row, rowIndex) => (
            <div
              key={rowIndex}
              className="flex items-start justify-center gap-1 sm:gap-4"
            >
              {row.map((cell, cellIndex) => {
                if (!cell) return null
                return cell.kind === 'slot' ? (
                  <SlotFigure key={`${cell.slot.position}-${cell.slot.player.id}`} slot={cell.slot} />
                ) : (
                  <EmptySlotFigure key={`empty-${cell.position}-${cellIndex}`} position={cell.position} />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* The badge is a product, not a measurement, and two of its three
          factors are drawn as small symbols on the avatar. Without a key those
          symbols are decoration. Each item appears only when the pitch above
          actually uses it, so the key never explains something absent. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] leading-relaxed text-muted-foreground">
        <span>Badge: score used to pick the XI</span>
        {anyOutOfPosition && (
          <span className="flex items-center gap-1">
            <span className="flex size-3.5 items-center justify-center rounded-full bg-muted text-[8px] font-bold text-orange-600">
              !
            </span>
            out of position
          </span>
        )}
        {anyInvolvementFlagged && (
          <span className="flex items-center gap-1">
            <span className="text-shamrock-700">▲</span>
            <span className="text-orange-600">▼</span>
            recent Ireland involvement
          </span>
        )}
      </div>

      {leftover.length > 0 && (
        <p className="mt-2 text-xs leading-relaxed text-destructive">
          {leftover.length} selected {leftover.length === 1 ? 'player' : 'players'} could not be
          placed in the formation drawn above (
          {leftover.map((slot) => `${slot.position} ${slot.player.name}`).join(', ')}). The pitch
          layout is out of step with the configured starting slots.
        </p>
      )}
    </div>
  )
}
