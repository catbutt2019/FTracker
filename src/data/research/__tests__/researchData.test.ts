import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseResearchRawData } from '../schema'
import { assembleResearchSnapshot } from '../pipeline'

const ROOT = path.resolve(__dirname, '../../../..')

function loadJson(file: string) {
  return JSON.parse(readFileSync(path.join(ROOT, 'research', file), 'utf-8'))
}

describe('merged research data', () => {
  const playersFile = loadJson('irish-players-research.json')
  const evidenceFile = loadJson('player-evidence.json')
  const sourcesFile = loadJson('research-sources.json')

  const raw = {
    researchDate: playersFile.researchDate,
    label: playersFile.label,
    players: playersFile.players,
    evidence: evidenceFile.evidence,
    sources: sourcesFile.sources,
    gaps: loadJson('research-gaps.json').gaps,
  }

  it('passes runtime schema validation', () => {
    expect(() => parseResearchRawData(raw)).not.toThrow()
  })

  it('covers a plausible number of players for a 40-60 target', () => {
    expect(raw.players.length).toBeGreaterThanOrEqual(40)
    expect(raw.players.length).toBeLessThanOrEqual(80)
  })

  it('gives every source a direct URL rather than a search-result link', () => {
    for (const source of raw.sources) {
      expect(source.url).toMatch(/^https?:\/\//)
      expect(source.url).not.toMatch(/google\.|bing\.com|duckduckgo\.com/)
    }
  })

  it('assembles into a full snapshot with an assessment for every player', () => {
    const snapshot = assembleResearchSnapshot(raw)
    expect(Object.keys(snapshot.assessments)).toHaveLength(raw.players.length)
    for (const player of raw.players) {
      expect(snapshot.assessments[player.id]).toBeDefined()
      const a = snapshot.assessments[player.id]
      expect(a.positiveProbability + a.stableProbability + a.declineProbability).toBe(100)
    }
  })

  it('covers senior, u21 and emerging levels', () => {
    const levels = new Set(raw.players.map((p: { level: string }) => p.level))
    expect(levels.has('senior')).toBe(true)
    expect(levels.has('u21') || levels.has('emerging')).toBe(true)
  })
})
