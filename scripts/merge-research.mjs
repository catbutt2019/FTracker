#!/usr/bin/env node
/**
 * Merges the per-group research staging files into the three published
 * research artefacts, converting each group's raw shape into the
 * `ResearchPlayer` / `EvidenceItem` / `ResearchSource` schema the app expects.
 *
 * Deliberately a standalone script rather than app code: it runs once per
 * research pass, not on every page load, and it needs to reconcile IDs
 * across four independently-researched files before the strict runtime
 * schema (src/data/research/schema.ts) ever sees the result.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const STAGING_DIR = path.join(ROOT, 'research', 'staging')
const OUT_DIR = path.join(ROOT, 'research')

const RESEARCH_DATE = '2026-08-20'
const LABEL = 'Republic of Ireland men\u2019s squad research snapshot'

const GROUPS = ['group-a.json', 'group-b.json', 'group-c.json', 'group-d.json']

function computeAge(dob, researchDate) {
  if (!dob) return null
  const d = new Date(dob)
  const r = new Date(researchDate)
  if (Number.isNaN(d.getTime())) return null
  let age = r.getFullYear() - d.getFullYear()
  const beforeBirthday =
    r.getMonth() < d.getMonth() || (r.getMonth() === d.getMonth() && r.getDate() < d.getDate())
  if (beforeBirthday) age -= 1
  return age
}

function deriveEligibilityStanding(raw) {
  if (raw.eligibilityStatus) return raw.eligibilityStatus
  const caps = raw.capsAndGoals?.caps ?? 0
  if (raw.nationalTeamLevel === 'senior' && caps > 0) return 'capped-senior'
  if (raw.nationalTeamLevel === 'senior') return 'committed-uncapped'
  if (raw.nationalTeamLevel === 'u21') return 'capped-youth'
  return 'potentially-eligible-uncommitted'
}

function transformSeason(raw) {
  if (!raw) return null
  return {
    season: raw.season ?? 'unknown',
    club: raw.club ?? 'unknown',
    league: raw.league ?? 'unknown',
    appearances: raw.appearances ?? null,
    starts: raw.starts ?? null,
    minutes: raw.minutes ?? null,
    goals: raw.goals ?? null,
    assists: raw.assists ?? null,
  }
}

const INVOLVEMENT_VALUES = ['starting', 'rotating', 'bench', 'out-of-squad', 'unknown']

// Some staging entries wrote a descriptive sentence (e.g. "starting — scored
// twice against ...") instead of the bare enum value the schema expects. The
// leading word is always one of the five valid values, so split it off and
// fold the descriptive remainder into internationalInvolvement rather than
// discarding it.
function parseInvolvement(raw) {
  if (!raw) return { value: 'unknown', note: null }
  const match = raw.match(/^(starting|rotating|bench|out-of-squad|unknown)\b/)
  if (!match) return { value: 'unknown', note: raw }
  const rest = raw.slice(match[0].length).replace(/^[\s—\-:/a-zA-Z]*?[—\-:]\s*/, '').trim()
  return { value: match[1], note: rest && rest !== raw ? rest : null }
}

// Categories the schema does not model directly. Neutral loan/transfer
// housekeeping claims map to the closest documented category rather than
// being dropped.
const CATEGORY_REMAP = {
  'loan-status': 'transfer-development',
  'loan-development': 'transfer-development',
}

function transformPlayer(raw, group) {
  const unverified = [...(raw.unverified ?? [])]
  // The requested `previousSeason.level` field carries information
  // (e.g. "senior first team") the typed schema has no slot for. Rather than
  // silently drop it, fold it into internationalInvolvement / notes so
  // nothing researched is lost.
  const previousLevelNote = raw.previousSeason?.level
    ? `Previous season (${raw.previousSeason.season ?? 'unknown'}) level: ${raw.previousSeason.level}`
    : null

  const { value: involvementValue, note: involvementNote } = parseInvolvement(raw.recentInvolvement)

  return {
    id: raw.id,
    fullName: raw.fullName,
    dateOfBirth: raw.dateOfBirth ?? null,
    age: computeAge(raw.dateOfBirth, RESEARCH_DATE),
    primaryPosition: raw.primaryPosition,
    secondaryPositions: raw.secondaryPositions ?? [],
    club: raw.club,
    league: raw.league,
    clubVerifiedForSeason: raw.clubVerifiedForSeason ?? '',
    level: raw.nationalTeamLevel,
    eligibilityBasis: raw.eligibilityBasis ?? '',
    eligibilityStanding: deriveEligibilityStanding(raw),
    caps: raw.capsAndGoals?.caps ?? null,
    goalsForIreland: raw.capsAndGoals?.goals ?? null,
    disambiguation: raw.disambiguation ?? null,
    lastCompletedSeason: transformSeason(raw.lastCompletedSeason),
    previousSeason: transformSeason(raw.previousSeason),
    involvement: involvementValue,
    loanStatus: raw.loanStatus ?? null,
    recentTransfer: raw.recentTransfer ?? null,
    injuryNote: raw.injuryNote ?? null,
    internationalInvolvement:
      [raw.internationalInvolvement, previousLevelNote, involvementNote].filter(Boolean).join(' ') || null,
    unverified,
    lastResearchedDate: RESEARCH_DATE,
    _group: group,
  }
}

function main() {
  const players = []
  const evidence = []
  const sources = []
  const gaps = []
  const seenPlayerIds = new Map()
  const sourceByUrl = new Map() // url -> canonical source id
  const sourceIdRemap = new Map() // "group:originalId" -> canonical source id
  const context = {}

  for (const file of GROUPS) {
    const fullPath = path.join(STAGING_DIR, file)
    if (!existsSync(fullPath)) {
      console.warn(`Skipping missing ${file}`)
      continue
    }
    const group = path.basename(file, '.json')
    const data = JSON.parse(readFileSync(fullPath, 'utf-8'))

    if (data.context) Object.assign(context, data.context)

    for (const rawSource of data.sources ?? []) {
      const originalKey = `${group}:${rawSource.id}`
      let canonicalId = sourceByUrl.get(rawSource.url)
      if (!canonicalId) {
        canonicalId = `${group}-${rawSource.id}`
        sourceByUrl.set(rawSource.url, canonicalId)
        sources.push({
          id: canonicalId,
          title: rawSource.title,
          publisher: rawSource.publisher,
          url: rawSource.url,
          kind: rawSource.kind,
          reliability: rawSource.reliability,
          accessedDate: rawSource.accessedDate ?? RESEARCH_DATE,
          accessNote: rawSource.accessNote ?? null,
        })
      }
      sourceIdRemap.set(originalKey, canonicalId)
    }

    for (const rawPlayer of data.players ?? []) {
      if (seenPlayerIds.has(rawPlayer.id)) {
        console.warn(
          `Duplicate player id "${rawPlayer.id}" in ${file} (first seen in ${seenPlayerIds.get(rawPlayer.id)}) — keeping the first.`,
        )
        continue
      }
      seenPlayerIds.set(rawPlayer.id, group)
      players.push(transformPlayer(rawPlayer, group))
    }

    for (const rawEvidence of data.evidence ?? []) {
      const remappedSourceId = sourceIdRemap.get(`${group}:${rawEvidence.sourceId}`)
      if (!remappedSourceId) {
        console.warn(
          `Evidence ${rawEvidence.id} in ${file} references source ${rawEvidence.sourceId}, which was not declared in the same file's sources array — dropping this evidence item.`,
        )
        continue
      }
      evidence.push({
        id: `${group}-${rawEvidence.id}`,
        playerId: rawEvidence.playerId,
        category: CATEGORY_REMAP[rawEvidence.category] ?? rawEvidence.category,
        claim: rawEvidence.claim,
        interpretation: rawEvidence.interpretation ?? null,
        sourceId: remappedSourceId,
        publishedDate: rawEvidence.publishedDate ?? null,
        accessedDate: rawEvidence.accessedDate ?? RESEARCH_DATE,
        primaryOrSecondary: rawEvidence.primaryOrSecondary,
        corroboratedBy: [],
        contradictedBy: [],
        notes: rawEvidence.notes ?? null,
      })
    }

    for (const entry of data.notResearched ?? []) {
      gaps.push(`[${group}] ${entry.name}: ${entry.reason}`)
    }
  }

  // Drop evidence pointing at a player who did not survive the merge (e.g.
  // a player another group already claimed, or one dropped for lacking a
  // source) rather than let a dangling reference reach the validator.
  const playerIds = new Set(players.map((p) => p.id))
  const keptEvidence = []
  for (const item of evidence) {
    if (!playerIds.has(item.playerId)) {
      console.warn(`Evidence ${item.id} references unknown player ${item.playerId} — dropping.`)
      continue
    }
    keptEvidence.push(item)
  }

  for (const player of players) delete player._group

  if (context.u21SquadAnnouncementDate || context.nextSeniorCompetition) {
    gaps.push(
      `Squad/fixture context from research: U21 squad announced ${context.u21SquadAnnouncementDate ?? 'unknown'}; next senior competition: ${context.nextSeniorCompetition ?? 'unknown'}; next fixtures: ${(context.nextFixtures ?? []).join('; ') || 'none found'}. ${context.squadNewsSinceMay2026 ?? ''}`,
    )
  }

  const playersOut = {
    researchDate: RESEARCH_DATE,
    label: LABEL,
    players,
  }
  const evidenceOut = { evidence: keptEvidence }
  const sourcesOut = { sources }

  writeFileSync(path.join(OUT_DIR, 'irish-players-research.json'), JSON.stringify(playersOut, null, 2))
  writeFileSync(path.join(OUT_DIR, 'player-evidence.json'), JSON.stringify(evidenceOut, null, 2))
  writeFileSync(path.join(OUT_DIR, 'research-sources.json'), JSON.stringify(sourcesOut, null, 2))
  writeFileSync(path.join(OUT_DIR, 'research-gaps.json'), JSON.stringify({ gaps }, null, 2))

  console.log(`Merged ${players.length} players, ${keptEvidence.length} evidence items, ${sources.length} sources.`)
  console.log(`${gaps.length} gap/context notes written to research-gaps.json.`)
}

main()
