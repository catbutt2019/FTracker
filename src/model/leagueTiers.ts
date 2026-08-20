/**
 * Comparative league strengths, used only to answer one question: did this
 * player move up, down or sideways?
 *
 * These are our own ordering assumptions, not a published ranking, and the
 * interface says so. They are intentionally coarse — the heuristic only ever
 * asks whether the difference between two leagues exceeds a threshold, so
 * arguing about whether the Eredivisie is 72 or 74 changes nothing.
 *
 * `null` from `leagueStrength` means "we have no assumption for this
 * competition", which is treated as unknown rather than as low. A player in an
 * unlisted league is not penalised for our table being incomplete.
 */

const LEAGUE_STRENGTHS: ReadonlyArray<readonly [pattern: string, strength: number]> = [
  ['premier league', 93],
  ['la liga', 90],
  ['primera division', 90],
  ['bundesliga 2', 68],
  ['2. bundesliga', 68],
  ['bundesliga', 88],
  ['serie a', 86],
  ['serie b', 66],
  ['ligue 1', 82],
  ['ligue 2', 62],
  ['primeira liga', 74],
  ['championship', 75],
  ['eredivisie', 72],
  ['eerste divisie', 55],
  ['jupiler pro league', 68],
  ['belgian pro league', 68],
  ['scottish premiership', 61],
  ['league one', 57],
  ['league two', 47],
  ['league of ireland premier division', 45],
  ['premier division', 45],
  ['scottish championship', 44],
  ['national league', 38],
  ['league of ireland first division', 32],
  ['first division', 32],
  ['premier league 2', 30],
  ['u21 premier league', 30],
  ['u18 premier league', 22],
  ['academy', 20],
]

function normalise(league: string): string {
  return league.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function leagueStrength(league: string | null | undefined): number | null {
  if (!league) return null
  const key = normalise(league)
  // Longest pattern first so "Bundesliga 2" is not swallowed by "Bundesliga".
  const match = [...LEAGUE_STRENGTHS]
    .sort((a, b) => b[0].length - a[0].length)
    .find(([pattern]) => key.includes(pattern))
  return match ? match[1] : null
}

/**
 * A move counts as a change in level only past this gap. Below it the move is
 * lateral, which is neither progress nor decline.
 */
export const LEVEL_CHANGE_THRESHOLD = 8

export type LevelChange = 'up' | 'down' | 'lateral' | 'unknown'

export function levelChange(from: string | null, to: string | null): LevelChange {
  const before = leagueStrength(from)
  const after = leagueStrength(to)
  if (before === null || after === null) return 'unknown'
  const delta = after - before
  if (delta >= LEVEL_CHANGE_THRESHOLD) return 'up'
  if (delta <= -LEVEL_CHANGE_THRESHOLD) return 'down'
  return 'lateral'
}
