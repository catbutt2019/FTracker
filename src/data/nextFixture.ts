/**
 * The next fixture, and manually recorded unavailability for it.
 *
 * This file is **hand-maintained input**, not researched data. It is kept
 * separate from `research/real-players.json` for that reason: everything in
 * that file came from a sourced research pass, whereas everything here was
 * typed in by a person and carries no citation.
 *
 * It exists because `SeniorStatus.availabilityStatus` is `null` for all 84
 * tracked players — no feed in the research pass covers injuries — so the only
 * way to reflect who is actually unavailable for a specific match is to say so
 * by hand. When that field is populated by a future research round, this
 * override list should shrink to nothing and then be deleted.
 */

export interface Fixture {
  opponent: string
  /**
   * ISO date, or `null` while unconfirmed.
   *
   * Deliberately nullable: the card renders perfectly well without a date, and
   * an invented one would be worse than an absent one — a wrong date silently
   * changes which players' availability is even relevant.
   */
  kickoff: string | null
  competition: string | null
  venue: 'home' | 'away' | 'neutral' | null
}

export interface ManualUnavailability {
  /** Must match a player `id` in the dataset. Unmatched ids are surfaced, not ignored. */
  playerId: string
  reason: string
  /** When this note was entered, so a stale entry is visible as stale. */
  recordedOn: string
}

export const NEXT_FIXTURE: Fixture = {
  opponent: 'Israel',
  kickoff: null,
  competition: null,
  venue: null,
}

export const MANUAL_UNAVAILABILITY: ManualUnavailability[] = [
  { playerId: 'evan-ferguson', reason: 'Injured', recordedOn: '2026-08-21' },
  { playerId: 'jaden-umeh', reason: 'Injured', recordedOn: '2026-08-21' },
]
