/**
 * League reference table.
 *
 * League names and club names are real entities, but every player and every
 * statistic in this dataset is fictional. The `strength` values are our own
 * illustrative assumptions, not a published ranking.
 *
 * `dataQuality` drives a deliberate feature of the demo: lower-profile
 * competitions genuinely do lack advanced event data, so those seasons are
 * generated with missing metrics rather than invented ones.
 */
export interface LeagueDefinition {
  name: string
  strength: number
  dataQuality: 'full' | 'basic'
  clubs: string[]
}

export const LEAGUES: LeagueDefinition[] = [
  {
    name: 'Premier League',
    strength: 93,
    dataQuality: 'full',
    clubs: ['Brighton', 'Everton', 'Fulham', 'Nottingham Forest', 'Crystal Palace', 'Wolves'],
  },
  {
    name: 'Bundesliga',
    strength: 87,
    dataQuality: 'full',
    clubs: ['Mainz', 'Augsburg', 'Werder Bremen'],
  },
  {
    name: 'Serie A',
    strength: 86,
    dataQuality: 'full',
    clubs: ['Bologna', 'Torino', 'Udinese'],
  },
  {
    name: 'Ligue 1',
    strength: 82,
    dataQuality: 'full',
    clubs: ['Rennes', 'Toulouse', 'Nantes'],
  },
  {
    name: 'Championship',
    strength: 75,
    dataQuality: 'full',
    clubs: [
      'Coventry City',
      'Norwich City',
      'Preston North End',
      'Millwall',
      'Swansea City',
      'Hull City',
      'Blackburn Rovers',
      'Stoke City',
    ],
  },
  {
    name: 'Eredivisie',
    strength: 72,
    dataQuality: 'full',
    clubs: ['AZ Alkmaar', 'Utrecht', 'Twente'],
  },
  {
    name: 'Belgian Pro League',
    strength: 68,
    dataQuality: 'full',
    clubs: ['Gent', 'Standard Liège', 'Westerlo'],
  },
  {
    name: 'Scottish Premiership',
    strength: 61,
    dataQuality: 'full',
    clubs: ['Hibernian', 'Aberdeen', 'St Mirren', 'Dundee United'],
  },
  {
    name: 'League One',
    strength: 57,
    dataQuality: 'full',
    clubs: ['Wycombe Wanderers', 'Charlton Athletic', 'Barnsley', 'Bolton Wanderers'],
  },
  {
    name: 'League Two',
    strength: 47,
    dataQuality: 'basic',
    clubs: ['Bradford City', 'Notts County', 'Walsall'],
  },
  {
    name: 'League of Ireland Premier Division',
    strength: 45,
    dataQuality: 'basic',
    clubs: ['Shamrock Rovers', 'St Patrick\u2019s Athletic', 'Derry City', 'Bohemians', 'Shelbourne'],
  },
]

export function leagueByName(name: string): LeagueDefinition | undefined {
  return LEAGUES.find((l) => l.name === name)
}

/**
 * Metrics that only exist where a full event-data feed is available. Seasons in
 * `basic` competitions omit these entirely.
 */
export const ADVANCED_METRIC_KEYS = new Set([
  'expectedGoals90',
  'expectedAssists90',
  'progressiveCarries90',
  'progressiveDistance90',
  'pressures90',
  'goalsPrevented90',
  'boxTouches90',
  'finalThirdEntries90',
])
