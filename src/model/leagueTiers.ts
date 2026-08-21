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
  ['professional development league', 24],
  ['efl trophy', 26],
  ['academy', 20],
  // Accented characters are stripped to spaces by `normalise`, so these
  // patterns intentionally match only the unaccented portion of the name.
  ['turkish', 65],
  ['eliteserien', 55],
  ['3 liga', 50],
  ['segunda', 70],
  ['belgian challenger', 35],
  ['mls', 68],
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
 * A human-readable version of `LEAGUE_STRENGTHS`, for display on the
 * Methodology page. Names here are written out in full (rather than the
 * lowercase substrings used for matching), sorted by strength descending.
 * This is the same table the matcher above uses — presented, not
 * recomputed — so the displayed numbers can never drift from the ones the
 * model actually applies.
 */
export const LEAGUE_STRENGTH_TABLE: ReadonlyArray<{ name: string; strength: number }> = [
  ['Premier League', 93],
  ['La Liga', 90],
  ['Bundesliga', 88],
  ['Serie A', 86],
  ['Ligue 1', 82],
  ['Championship', 75],
  ['Primeira Liga', 74],
  ['Segunda División', 70],
  ['Eredivisie', 72],
  ['Turkish Süper Lig', 65],
  ['Bundesliga 2 / 2. Bundesliga', 68],
  ['Jupiler Pro League / Belgian Pro League', 68],
  ['MLS', 68],
  ['Serie B', 66],
  ['Scottish Premiership', 61],
  ['Ligue 2', 62],
  ['League One', 57],
  ['Eerste Divisie', 55],
  ['Eliteserien', 55],
  ['3. Liga', 50],
  ['League Two', 47],
  ['League of Ireland Premier Division', 45],
  ['Scottish Championship', 44],
  ['National League', 38],
  ['Belgian Challenger Pro League', 35],
  ['League of Ireland First Division', 32],
  ['Premier League 2 / U21 Premier League', 30],
  ['Professional Development League', 24],
  ['EFL Trophy', 26],
  ['U18 Premier League', 22],
  ['Academy football', 20],
].map(([name, strength]) => ({ name: name as string, strength: strength as number }))

/**
 * Assumed total league minutes for a full season, used only to turn a raw
 * minutes total into a share (`minutesPercentage`) for the playing-time
 * badge. Season length genuinely differs by competition (34 vs 38 vs 46
 * league games), so a single constant would misclassify players in
 * shorter/longer seasons. These are game-count assumptions, not a claim
 * about any individual player's fixture list.
 */
const SEASON_GAME_COUNTS: ReadonlyArray<readonly [pattern: string, games: number]> = [
  ['championship', 46],
  ['league one', 46],
  ['league two', 46],
  ['national league', 46],
  ['league of ireland', 36],
  ['segunda', 42],
  ['eredivisie', 34],
  ['bundesliga', 34],
  ['serie a', 38],
  ['ligue 1', 34],
  ['la liga', 38],
  ['primera division', 38],
  ['premier league', 38],
  ['primeira liga', 34],
  ['scottish premiership', 38],
  ['eliteserien', 30],
  ['turkish', 38],
  ['mls', 34],
  ['belgian challenger', 30],
]

const DEFAULT_SEASON_GAMES = 38

export function assumedSeasonMinutes(league: string | null | undefined): number {
  if (!league) return DEFAULT_SEASON_GAMES * 90
  const key = normalise(league)
  const match = [...SEASON_GAME_COUNTS]
    .sort((a, b) => b[0].length - a[0].length)
    .find(([pattern]) => key.includes(pattern))
  return (match ? match[1] : DEFAULT_SEASON_GAMES) * 90
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
