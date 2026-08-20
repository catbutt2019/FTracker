/**
 * The single place the app reads the on-disk research artefacts from.
 *
 * The published files (`irish-players-research.json`, `player-evidence.json`,
 * `research-sources.json`, `research-gaps.json`) live at the repository root
 * `research/` folder, alongside `research-methodology.md` and
 * `research-gaps.md`, because that is the deliverable the research brief
 * asked for — not nested inside `src/` where it would look like app code
 * rather than a dated dataset. This module is the only bridge between that
 * folder and the bundle.
 */

import researchPlayersFile from '../../../research/irish-players-research.json'
import evidenceFile from '../../../research/player-evidence.json'
import sourcesFile from '../../../research/research-sources.json'
import gapsFile from '../../../research/research-gaps.json'
import type { ResearchSnapshot } from '@/types/research'
import { assembleResearchSnapshot } from './pipeline'
import { parseResearchRawData } from './schema'

let cached: ResearchSnapshot | null = null

/** Validates and assembles the static research snapshot, once. */
export function loadStaticResearchSnapshot(): ResearchSnapshot {
  if (cached) return cached
  const raw = parseResearchRawData({
    researchDate: researchPlayersFile.researchDate,
    label: researchPlayersFile.label,
    players: researchPlayersFile.players,
    evidence: evidenceFile.evidence,
    sources: sourcesFile.sources,
    gaps: gapsFile.gaps,
  })
  cached = assembleResearchSnapshot(raw)
  return cached
}
