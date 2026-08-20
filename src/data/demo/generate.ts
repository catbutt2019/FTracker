import type {
  EligibilityStatus,
  MetricGroup,
  MetricSample,
  NationalTeamLevel,
  PlayerRaw,
  Position,
  SeasonRecord,
} from '@/types/domain'
import { POSITION_METRIC_GROUP } from '@/types/domain'
import { createRng, clamp } from '@/model/math'
import { metricsFor } from '@/model/metrics'
import { ADVANCED_METRIC_KEYS, LEAGUES, type LeagueDefinition } from './leagues'

/**
 * DEMONSTRATION DATA ONLY.
 *
 * Every player in this file is fictional and every statistic is generated. Real
 * internationals are deliberately not used: attaching invented numbers to a
 * named professional would misrepresent them, and the point of the dataset is
 * to exercise the model and the interface, not to make claims about anybody.
 *
 * The generator is seeded, so the dataset is byte-for-byte identical on every
 * load. A "probability" that changed on refresh would be worthless.
 */

const SEED = 8_675_309

const FIRST_NAMES = [
  'Cillian', 'Oisín', 'Darragh', 'Eoghan', 'Fionn', 'Ruairí', 'Tadhg', 'Cathal',
  'Lorcan', 'Odhrán', 'Rónán', 'Séamus', 'Conchúr', 'Barra', 'Killian', 'Diarmuid',
  'Naoise', 'Éanna', 'Turlough', 'Faolán', 'Seanán', 'Aodhán', 'Colm', 'Peadar',
  'Micheál', 'Donncha', 'Ferdia', 'Aengus', 'Brogan', 'Cormac', 'Léim', 'Ultan',
  'Marc', 'Jamie', 'Kian', 'Reuben', 'Malachy', 'Cian', 'Dara', 'Shay',
]

const SURNAMES = [
  'Ó Fearghail', 'Brennan', 'Traynor', 'Mulcahy', 'Devine', 'Loughlin', 'Hanratty',
  'Corrigan', 'Kavanagh', 'Ruane', 'Kilbane', 'Feeney', 'Mac Aogáin', 'Nolan',
  'Ryder', 'Gormley', 'Concannon', 'Tobin', 'Malone', 'Sheridan', 'Boylan',
  'Fitzharris', 'Dunphy', 'Callanan', 'Rafferty', 'Ó Riain', 'Cassidy', 'Hallinan',
  'Gilhooly', 'Fahy', 'Prendergast', 'Meaney', 'Larkin', 'Coughlan', 'Deegan',
  'Moynihan', 'Slattery', 'Tierney', 'Whelan', 'Ó Súilleabháin',
]

/** Value at ability 0 and at ability 1, per metric. Illustrative ranges. */
const METRIC_RANGES: Record<string, [number, number]> = {
  // Forward
  nonPenaltyGoals90: [0.04, 0.78],
  expectedGoals90: [0.07, 0.68],
  shots90: [0.7, 4.3],
  boxTouches90: [1.4, 8.2],
  chanceConversion: [4.5, 25],
  // Creator
  expectedAssists90: [0.03, 0.46],
  progressiveCarries90: [0.9, 7.6],
  chancesCreated90: [0.35, 3.3],
  finalThirdEntries90: [3.8, 16.5],
  dribbleSuccess: [26, 64],
  // Midfielder
  progressivePasses90: [1.8, 9.8],
  passCompletion: [71, 92],
  pressures90: [7.5, 22.5],
  defensiveActions90: [1.3, 6.8],
  possessionLost90: [15, 4.5],
  // Defender
  duelSuccess: [44, 73],
  aerialSuccess: [38, 79],
  interceptions90: [1.1, 5.2],
  progressiveDistance90: [1.4, 6.2],
  errors90: [0.38, 0.015],
  // Goalkeeper
  savePercentage: [57, 80],
  goalsPrevented90: [-0.28, 0.38],
  crossesClaimed90: [0.35, 1.9],
  longPassAccuracy: [28, 64],
}

interface Blueprint {
  position: Position
  level: NationalTeamLevel
  /** 0-1 latent ability, before noise. Never surfaced in the UI. */
  ability: number
  age: number
  eligibility: EligibilityStatus
  leagueIndex: number
  /** 0-1 share of available minutes at club level. */
  minutesShare: number
  /** Season-on-season ability drift, to create genuine trends. */
  drift: number
  seasonCount: number
  caps: number
  /** Force missing metrics even in a full-data league, to exercise the UI. */
  suppressMetrics?: string[]
  injuryDays: number | null
}

/**
 * Hand-specified squad shape.
 *
 * Written out rather than randomised so the dataset tells a legible story: a
 * strong goalkeeping and centre-back pool, a genuine problem at left-back and
 * striker, and a promising but unproven midfield cohort. That gives the
 * dashboard something meaningful to surface.
 */
const BLUEPRINTS: Blueprint[] = [
  // ---- Goalkeepers: solid, ageing at the top, decent pipeline
  { position: 'GK', level: 'senior', ability: 0.82, age: 29.4, eligibility: 'capped-ireland', leagueIndex: 4, minutesShare: 0.94, drift: 0.0, seasonCount: 3, caps: 34, injuryDays: 12 },
  { position: 'GK', level: 'senior', ability: 0.7, age: 32.8, eligibility: 'capped-ireland', leagueIndex: 0, minutesShare: 0.28, drift: -0.04, seasonCount: 3, caps: 11, injuryDays: 41 },
  { position: 'GK', level: 'u21', ability: 0.63, age: 20.6, eligibility: 'declared-ireland', leagueIndex: 8, minutesShare: 0.72, drift: 0.06, seasonCount: 2, caps: 0, injuryDays: 0 },
  { position: 'GK', level: 'emerging', ability: 0.52, age: 18.9, eligibility: 'eligible-uncommitted', leagueIndex: 10, minutesShare: 0.55, drift: 0.08, seasonCount: 1, caps: 0, injuryDays: null },

  // ---- Right-backs
  { position: 'RB', level: 'senior', ability: 0.76, age: 26.2, eligibility: 'capped-ireland', leagueIndex: 4, minutesShare: 0.88, drift: 0.03, seasonCount: 3, caps: 22, injuryDays: 8 },
  { position: 'RB', level: 'senior', ability: 0.64, age: 30.9, eligibility: 'capped-ireland', leagueIndex: 8, minutesShare: 0.81, drift: -0.05, seasonCount: 3, caps: 17, injuryDays: 63 },
  { position: 'RB', level: 'u21', ability: 0.6, age: 21.3, eligibility: 'declared-ireland', leagueIndex: 7, minutesShare: 0.64, drift: 0.07, seasonCount: 2, caps: 1, injuryDays: 4 },
  { position: 'RB', level: 'emerging', ability: 0.49, age: 19.1, eligibility: 'dual-eligible', leagueIndex: 1, minutesShare: 0.14, drift: 0.09, seasonCount: 2, caps: 0, injuryDays: 22 },

  // ---- Centre-backs: the deepest position in the pool
  { position: 'CB', level: 'senior', ability: 0.88, age: 25.1, eligibility: 'capped-ireland', leagueIndex: 0, minutesShare: 0.83, drift: 0.04, seasonCount: 3, caps: 28, injuryDays: 17 },
  { position: 'CB', level: 'senior', ability: 0.79, age: 27.7, eligibility: 'capped-ireland', leagueIndex: 2, minutesShare: 0.9, drift: 0.01, seasonCount: 3, caps: 41, injuryDays: 0 },
  { position: 'CB', level: 'senior', ability: 0.71, age: 31.5, eligibility: 'capped-ireland', leagueIndex: 4, minutesShare: 0.86, drift: -0.03, seasonCount: 3, caps: 53, injuryDays: 29 },
  { position: 'CB', level: 'u21', ability: 0.67, age: 20.2, eligibility: 'declared-ireland', leagueIndex: 5, minutesShare: 0.58, drift: 0.08, seasonCount: 2, caps: 2, injuryDays: 6 },
  { position: 'CB', level: 'u21', ability: 0.58, age: 21.8, eligibility: 'capped-ireland', leagueIndex: 8, minutesShare: 0.79, drift: 0.05, seasonCount: 2, caps: 3, injuryDays: 0 },
  { position: 'CB', level: 'emerging', ability: 0.54, age: 18.4, eligibility: 'eligible-uncommitted', leagueIndex: 0, minutesShare: 0.06, drift: 0.11, seasonCount: 1, caps: 0, injuryDays: null },

  // ---- Left-backs: the thinnest area, by design
  { position: 'LB', level: 'senior', ability: 0.66, age: 28.9, eligibility: 'capped-ireland', leagueIndex: 4, minutesShare: 0.74, drift: -0.02, seasonCount: 3, caps: 19, injuryDays: 51 },
  { position: 'LB', level: 'u21', ability: 0.51, age: 21.1, eligibility: 'declared-ireland', leagueIndex: 9, minutesShare: 0.68, drift: 0.05, seasonCount: 2, caps: 0, injuryDays: null },
  { position: 'LB', level: 'emerging', ability: 0.47, age: 19.6, eligibility: 'dual-eligible', leagueIndex: 10, minutesShare: 0.61, drift: 0.07, seasonCount: 1, caps: 0, injuryDays: null },

  // ---- Defensive midfield
  { position: 'DM', level: 'senior', ability: 0.8, age: 26.8, eligibility: 'capped-ireland', leagueIndex: 3, minutesShare: 0.85, drift: 0.02, seasonCount: 3, caps: 31, injuryDays: 14 },
  { position: 'DM', level: 'senior', ability: 0.62, age: 30.2, eligibility: 'capped-ireland', leagueIndex: 4, minutesShare: 0.7, drift: -0.04, seasonCount: 3, caps: 24, injuryDays: 37 },
  { position: 'DM', level: 'u21', ability: 0.64, age: 20.9, eligibility: 'declared-ireland', leagueIndex: 6, minutesShare: 0.52, drift: 0.09, seasonCount: 2, caps: 1, injuryDays: 0 },
  { position: 'DM', level: 'emerging', ability: 0.5, age: 18.2, eligibility: 'eligible-uncommitted', leagueIndex: 10, minutesShare: 0.44, drift: 0.1, seasonCount: 1, caps: 0, injuryDays: null },

  // ---- Central midfield: young and promising but light on minutes
  { position: 'CM', level: 'senior', ability: 0.78, age: 24.6, eligibility: 'capped-ireland', leagueIndex: 0, minutesShare: 0.62, drift: 0.06, seasonCount: 3, caps: 18, injuryDays: 9 },
  { position: 'CM', level: 'senior', ability: 0.69, age: 28.3, eligibility: 'capped-ireland', leagueIndex: 4, minutesShare: 0.87, drift: 0.0, seasonCount: 3, caps: 36, injuryDays: 0 },
  { position: 'CM', level: 'u21', ability: 0.73, age: 19.8, eligibility: 'declared-ireland', leagueIndex: 0, minutesShare: 0.19, drift: 0.12, seasonCount: 2, caps: 1, injuryDays: 11, suppressMetrics: ['pressures90'] },
  { position: 'CM', level: 'u21', ability: 0.6, age: 21.4, eligibility: 'capped-ireland', leagueIndex: 8, minutesShare: 0.83, drift: 0.06, seasonCount: 2, caps: 4, injuryDays: 3 },
  { position: 'CM', level: 'emerging', ability: 0.55, age: 18.7, eligibility: 'dual-eligible', leagueIndex: 1, minutesShare: 0.09, drift: 0.11, seasonCount: 1, caps: 0, injuryDays: null },
  { position: 'CM', level: 'emerging', ability: 0.48, age: 19.9, eligibility: 'eligible-uncommitted', leagueIndex: 10, minutesShare: 0.71, drift: 0.06, seasonCount: 2, caps: 0, injuryDays: null },

  // ---- Attacking midfield
  { position: 'AM', level: 'senior', ability: 0.72, age: 27.1, eligibility: 'capped-ireland', leagueIndex: 5, minutesShare: 0.78, drift: 0.01, seasonCount: 3, caps: 26, injuryDays: 21 },
  { position: 'AM', level: 'u21', ability: 0.66, age: 20.4, eligibility: 'declared-ireland', leagueIndex: 4, minutesShare: 0.47, drift: 0.1, seasonCount: 2, caps: 0, injuryDays: 0 },
  { position: 'AM', level: 'emerging', ability: 0.57, age: 18.5, eligibility: 'eligible-uncommitted', leagueIndex: 9, minutesShare: 0.38, drift: 0.09, seasonCount: 1, caps: 0, injuryDays: null },

  // ---- Wingers
  { position: 'W', level: 'senior', ability: 0.83, age: 25.7, eligibility: 'capped-ireland', leagueIndex: 0, minutesShare: 0.76, drift: 0.03, seasonCount: 3, caps: 29, injuryDays: 26 },
  { position: 'W', level: 'senior', ability: 0.68, age: 29.6, eligibility: 'capped-ireland', leagueIndex: 4, minutesShare: 0.8, drift: -0.03, seasonCount: 3, caps: 33, injuryDays: 5 },
  { position: 'W', level: 'senior', ability: 0.61, age: 31.8, eligibility: 'capped-ireland', leagueIndex: 7, minutesShare: 0.66, drift: -0.06, seasonCount: 3, caps: 45, injuryDays: 72 },
  { position: 'W', level: 'u21', ability: 0.7, age: 20.1, eligibility: 'declared-ireland', leagueIndex: 6, minutesShare: 0.59, drift: 0.11, seasonCount: 2, caps: 2, injuryDays: 0 },
  { position: 'W', level: 'u21', ability: 0.56, age: 21.6, eligibility: 'capped-ireland', leagueIndex: 9, minutesShare: 0.74, drift: 0.04, seasonCount: 2, caps: 1, injuryDays: null },
  { position: 'W', level: 'emerging', ability: 0.6, age: 17.9, eligibility: 'dual-eligible', leagueIndex: 0, minutesShare: 0.04, drift: 0.13, seasonCount: 1, caps: 0, injuryDays: null },

  // ---- Strikers: the position the dashboard should flag as a problem
  { position: 'ST', level: 'senior', ability: 0.64, age: 28.1, eligibility: 'capped-ireland', leagueIndex: 4, minutesShare: 0.72, drift: -0.01, seasonCount: 3, caps: 27, injuryDays: 18 },
  { position: 'ST', level: 'senior', ability: 0.58, age: 32.2, eligibility: 'capped-ireland', leagueIndex: 8, minutesShare: 0.69, drift: -0.07, seasonCount: 3, caps: 38, injuryDays: 44 },
  { position: 'ST', level: 'u21', ability: 0.62, age: 20.8, eligibility: 'declared-ireland', leagueIndex: 9, minutesShare: 0.63, drift: 0.09, seasonCount: 2, caps: 0, injuryDays: 0 },
  { position: 'ST', level: 'emerging', ability: 0.53, age: 19.3, eligibility: 'eligible-uncommitted', leagueIndex: 10, minutesShare: 0.57, drift: 0.08, seasonCount: 1, caps: 0, injuryDays: null },
  { position: 'ST', level: 'emerging', ability: 0.45, age: 18.1, eligibility: 'dual-eligible', leagueIndex: 1, minutesShare: 0.05, drift: 0.1, seasonCount: 1, caps: 0, injuryDays: null },
]

const SECONDARY_POSITIONS: Partial<Record<Position, Position[]>> = {
  RB: ['CB', 'W'],
  LB: ['CB'],
  CB: ['DM'],
  DM: ['CM', 'CB'],
  CM: ['DM', 'AM'],
  AM: ['CM', 'W'],
  W: ['AM', 'ST'],
  ST: ['W'],
}

const SEASONS = ['2023-24', '2024-25', '2025-26']

function lerp(range: [number, number], t: number): number {
  return range[0] + (range[1] - range[0]) * t
}

function roundTo(value: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(value * f) / f
}

function buildMetrics(
  group: MetricGroup,
  ability: number,
  league: LeagueDefinition,
  rng: () => number,
  suppress: string[],
): MetricSample {
  const sample: MetricSample = {}
  for (const def of metricsFor(group)) {
    const range = METRIC_RANGES[def.key]
    if (!range) continue

    if (suppress.includes(def.key)) {
      sample[def.key] = null
      continue
    }
    if (league.dataQuality === 'basic' && ADVANCED_METRIC_KEYS.has(def.key)) {
      sample[def.key] = null
      continue
    }

    // Per-metric noise: a player is not uniformly good at everything, which is
    // what makes the percentile radar worth looking at.
    const noisyAbility = clamp(ability + (rng() - 0.5) * 0.34, 0.02, 0.99)
    const value = lerp(range, noisyAbility)
    const dp = Math.abs(range[1] - range[0]) > 8 ? 1 : 2
    sample[def.key] = roundTo(value, dp)
  }
  return sample
}

function pickLeagueProgression(
  blueprint: Blueprint,
  seasonIndex: number,
  totalSeasons: number,
): LeagueDefinition {
  // Improving young players are moved up a division part-way through their
  // history, which produces the club/league changes the detail page shows.
  const isEarly = seasonIndex < totalSeasons - 1
  if (isEarly && blueprint.drift >= 0.07 && blueprint.leagueIndex < LEAGUES.length - 2) {
    return LEAGUES[Math.min(LEAGUES.length - 1, blueprint.leagueIndex + 2)]
  }
  return LEAGUES[blueprint.leagueIndex]
}

function buildSeasons(blueprint: Blueprint, rng: () => number): SeasonRecord[] {
  const group = POSITION_METRIC_GROUP[blueprint.position]
  const seasons: SeasonRecord[] = []
  const total = blueprint.seasonCount
  const seasonLabels = SEASONS.slice(SEASONS.length - total)

  seasonLabels.forEach((label, index) => {
    const stepsFromLatest = total - 1 - index
    const ability = clamp(blueprint.ability - blueprint.drift * stepsFromLatest, 0.03, 0.98)
    const league = pickLeagueProgression(blueprint, index, total)
    const club = league.clubs[Math.floor(rng() * league.clubs.length)]

    // Minutes ramp up toward the latest season for developing players.
    const shareTrend = clamp(
      blueprint.minutesShare - stepsFromLatest * (blueprint.drift > 0.05 ? 0.14 : 0.03),
      0.02,
      0.97,
    )
    const leagueMinutes = 3420
    const minutes = Math.round(leagueMinutes * shareTrend * (0.92 + rng() * 0.16))
    const starts = Math.round((minutes / 3420) * 38 * (0.78 + rng() * 0.2))
    const appearances = clamp(starts + Math.round(rng() * 9), starts, 46)

    const attackingWeight =
      blueprint.position === 'ST' ? 1 : blueprint.position === 'W' || blueprint.position === 'AM' ? 0.62 : 0.18
    const per90 = minutes / 90
    const goals = Math.max(
      0,
      Math.round(per90 * lerp([0.02, 0.6], ability) * attackingWeight),
    )
    const assists = Math.max(
      0,
      Math.round(per90 * lerp([0.02, 0.34], ability) * (attackingWeight * 0.8 + 0.2)),
    )

    seasons.push({
      season: label,
      club,
      league: league.name,
      leagueStrength: league.strength,
      clubStrength: Math.round(clamp(league.strength * 0.55 + rng() * 34, 20, 96)),
      appearances,
      starts,
      minutes,
      minutesPercentage: roundTo(minutes / leagueMinutes, 3),
      goals: blueprint.position === 'GK' ? 0 : goals,
      assists: blueprint.position === 'GK' ? 0 : assists,
      positionSpecificMetrics: buildMetrics(
        group,
        ability,
        league,
        rng,
        blueprint.suppressMetrics ?? [],
      ),
      // Injury feeds are missing for players outside the top divisions, which
      // is a realistic gap rather than a value of zero.
      injuryDays: blueprint.injuryDays === null ? null : Math.round(blueprint.injuryDays * (index === total - 1 ? 1 : rng())),
    })
  })

  // Most recent season first.
  return seasons.reverse()
}

/** Reference date the dataset is framed around. Ages are computed from it. */
export const DEMO_AS_OF = '2026-08-20'

export function generateDemoPlayers(): PlayerRaw[] {
  const rng = createRng(SEED)
  const asOf = new Date(DEMO_AS_OF)
  const usedNames = new Set<string>()

  return BLUEPRINTS.map((blueprint, index) => {
    let name = ''
    let guard = 0
    do {
      const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]
      const last = SURNAMES[Math.floor(rng() * SURNAMES.length)]
      name = `${first} ${last}`
      guard += 1
    } while (usedNames.has(name) && guard < 50)
    usedNames.add(name)

    const dob = new Date(asOf.getTime() - blueprint.age * 365.2425 * 24 * 3600 * 1000)

    return {
      id: `demo-${String(index + 1).padStart(3, '0')}`,
      name,
      dateOfBirth: dob.toISOString().slice(0, 10),
      nationalityStatus: blueprint.eligibility,
      nationalTeamLevel: blueprint.level,
      primaryPosition: blueprint.position,
      secondaryPositions: SECONDARY_POSITIONS[blueprint.position] ?? [],
      seasons: buildSeasons(blueprint, rng),
      internationalCaps: blueprint.caps,
      internationalMinutes: Math.round(blueprint.caps * (46 + rng() * 38)),
      dataLastUpdated: DEMO_AS_OF,
    } satisfies PlayerRaw
  })
}
