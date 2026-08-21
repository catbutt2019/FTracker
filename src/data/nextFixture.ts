/**
 * The next fixture, and manually recorded unavailability for it.
 *
 * This file is **hand-maintained input**, not researched data. It is kept
 * separate from `research/real-players.json` for that reason: everything in
 * that file came from a sourced research pass, whereas everything here was
 * typed in by a person and carries no citation.
 *
 * It exists because `SeniorStatus.availabilityStatus` is sparse: research
 * round 2 sourced it for exactly 1 of 84 tracked players, so the only way to
 * reflect most absences is still to say so by hand. `buildMatchdaySelection`
 * reads the researched field first and treats this list as an override layer
 * on top, reporting any entry the dataset already covers as redundant so it
 * can be pruned. As coverage improves this list should shrink to nothing and
 * then be deleted.
 *
 * Evan Ferguson has already made that journey: round 2 records him as
 * `availabilityStatus: 'injured'`, cited to a 2026-08-05 report of his ankle
 * surgery recovery, so the hand-entered duplicate has been removed.
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
  // Asserted by hand and NOT corroborated by research round 2, which returned
  // `availabilityStatus: null` for this player. Kept because the person
  // maintaining this file reported it; flagged here because it is the only
  // absence in the XI resting on no citation.
  { playerId: 'jaden-umeh', reason: 'Injured', recordedOn: '2026-08-21' },
]
