import type { PlayerRaw } from '@/types/domain'
import realPlayersFile from '../../../research/real-players.json'
import type { DataSource } from './types'

/**
 * Real Republic of Ireland player pool, sourced from web research (FBref,
 * Transfermarkt, club sites, FAI reporting) rather than generated.
 *
 * `research/real-players.json` is a build artefact, not hand-written: it is
 * produced by `scripts/build-real-players.mjs` from
 * `research/irish-players-research.json` (identity, eligibility, caps) and
 * `research/player-metrics-batch-*.json` (per-90 advanced metrics, gathered
 * separately). Re-run that script after updating either input.
 *
 * Two fields have no real-world source and use a documented neutral value
 * instead of an invented one: `clubStrength` (55, the model's own neutral
 * midpoint) and `internationalMinutes` (0, with the UI adjusted to omit the
 * "N international minutes" clause rather than assert a false zero).
 */
const AS_OF_DATE = '2026-08-20'

export const realAdapter: DataSource = {
  id: 'real',
  label: 'Researched Republic of Ireland squad pool',
  isDemonstrationData: false,
  asOfDate: AS_OF_DATE,

  async listPlayers(): Promise<PlayerRaw[]> {
    return realPlayersFile as unknown as PlayerRaw[]
  },
}
