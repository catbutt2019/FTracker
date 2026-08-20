/**
 * Turns validated raw research data into the full snapshot the interface
 * consumes, by running the documented heuristic over it.
 *
 * Mirrors `src/data/pipeline.ts` for the statistical model: assessments and
 * the pool outlook are never stored on disk, always recomputed from the raw
 * evidence, so the methodology page describes code that actually runs.
 */

import type { ResearchRawData, ResearchSnapshot } from '@/types/research'
import { buildAllAssessments } from '@/model/researchAssessment'
import { buildResearchOutlook } from '@/model/researchOutlook'
import { parseResearchRawData } from './schema'

export function assembleResearchSnapshot(raw: ResearchRawData): ResearchSnapshot {
  const assessments = buildAllAssessments(raw.players, raw.evidence, raw.sources, raw.researchDate)
  const outlook = buildResearchOutlook(raw.players, raw.evidence, assessments)
  return { ...raw, assessments, outlook }
}

/** Validates untrusted JSON and assembles it into a full snapshot in one step. */
export function loadResearchSnapshot(data: unknown): ResearchSnapshot {
  const raw = parseResearchRawData(data)
  return assembleResearchSnapshot(raw)
}
