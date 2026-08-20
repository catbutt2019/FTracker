import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutGrid, RotateCcw, Search, Table2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState, InfoHint, NotSupplied } from '@/components/Primitives'
import { ConfidenceIndicator, DeltaValue, TrajectoryBadge } from '@/components/Indicators'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { ProbabilityBar } from '@/components/ProbabilityBar'
import { SortableTableHead, type SortDirection } from '@/components/SortableTableHead'
import { useDataset } from '@/hooks/useDataset'
import {
  ELIGIBILITY_LABELS,
  NATIONAL_TEAM_LEVEL_LABELS,
  PLAYING_TIME_LABELS,
  POSITIONS,
  POSITION_LABELS,
  type ConfidenceLevel,
  type EligibilityStatus,
  type NationalTeamLevel,
  type Player,
  type PlayingTimeStatus,
  type Position,
  type Trajectory,
} from '@/types/domain'
import { cn } from '@/lib/utils'

const ANY = 'any'

type SortKey =
  | 'score'
  | 'name'
  | 'age'
  | 'minutes'
  | 'improve'
  | 'change'
  | 'projected'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'score', label: 'Performance score' },
  { value: 'projected', label: 'Projected midpoint' },
  { value: 'improve', label: 'Chance of improving' },
  { value: 'change', label: 'Change vs last season' },
  { value: 'minutes', label: 'Minutes played' },
  { value: 'age', label: 'Age' },
  { value: 'name', label: 'Name' },
]

/** The direction each sort key defaults to the first time it is selected. */
const DEFAULT_SORT_DIRECTION: Record<SortKey, SortDirection> = {
  score: 'desc',
  projected: 'desc',
  improve: 'desc',
  change: 'desc',
  minutes: 'desc',
  age: 'asc',
  name: 'asc',
}

function compareBySortKey(a: Player, b: Player, key: SortKey): number {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name)
    case 'age':
      return a.exactAge - b.exactAge
    case 'minutes':
      return a.minutes - b.minutes
    case 'improve':
      return a.forecast.improvementProbability - b.forecast.improvementProbability
    case 'change':
      return (a.forecast.seasonOnSeasonChange ?? -99) - (b.forecast.seasonOnSeasonChange ?? -99)
    case 'projected':
      return a.forecast.projectedPerformanceMedian - b.forecast.projectedPerformanceMedian
    default:
      return a.forecast.currentPerformanceScore - b.forecast.currentPerformanceScore
  }
}

interface Filters {
  query: string
  position: Position | typeof ANY
  level: NationalTeamLevel | typeof ANY
  club: string
  league: string
  playingTime: PlayingTimeStatus | typeof ANY
  trajectory: Trajectory | typeof ANY
  confidence: ConfidenceLevel | typeof ANY
  eligibility: EligibilityStatus | typeof ANY
  ageRange: [number, number]
}

const DEFAULT_FILTERS: Filters = {
  query: '',
  position: ANY,
  level: ANY,
  club: ANY,
  league: ANY,
  playingTime: ANY,
  trajectory: ANY,
  confidence: ANY,
  eligibility: ANY,
  ageRange: [16, 38],
}

export function PlayerExplorer() {
  const { players } = useDataset()
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<SortDirection>(DEFAULT_SORT_DIRECTION.score)
  const [view, setView] = useState<'table' | 'grid'>('table')

  const handleSortChange = (key: SortKey) => {
    setSort(key)
    setSortDir(DEFAULT_SORT_DIRECTION[key])
  }

  const handleHeaderSort = (key: SortKey) => {
    if (key === sort) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSort(key)
      setSortDir(DEFAULT_SORT_DIRECTION[key])
    }
  }

  const clubs = useMemo(
    () => Array.from(new Set(players.map((p) => p.club))).sort(),
    [players],
  )
  const leagues = useMemo(
    () => Array.from(new Set(players.map((p) => p.league))).sort(),
    [players],
  )

  const filtered = useMemo(() => {
    const query = filters.query.trim().toLowerCase()
    const result = players.filter((player) => {
      if (query && !player.name.toLowerCase().includes(query)) return false
      if (filters.position !== ANY && player.primaryPosition !== filters.position) return false
      if (filters.level !== ANY && player.nationalTeamLevel !== filters.level) return false
      if (filters.club !== ANY && player.club !== filters.club) return false
      if (filters.league !== ANY && player.league !== filters.league) return false
      if (filters.playingTime !== ANY && player.playingTimeStatus !== filters.playingTime)
        return false
      if (filters.trajectory !== ANY && player.forecast.trajectory !== filters.trajectory)
        return false
      if (
        filters.confidence !== ANY &&
        player.forecast.predictionConfidence !== filters.confidence
      )
        return false
      if (filters.eligibility !== ANY && player.nationalityStatus !== filters.eligibility)
        return false
      if (player.age < filters.ageRange[0] || player.age > filters.ageRange[1]) return false
      return true
    })

    return result.sort((a, b) =>
      sortDir === 'asc' ? compareBySortKey(a, b, sort) : compareBySortKey(b, a, sort),
    )
  }, [players, filters, sort, sortDir])

  const activeFilterCount = countActiveFilters(filters)

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Player explorer</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Every tracked player, with their position-specific performance score and the model's view
          of where they are heading. Scores are percentile-based within this pool, so 50 is the pool
          average rather than a rating against world football.
        </p>
      </header>

      <Card className="border-border/70 bg-card/60">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="player-search" className="text-xs text-muted-foreground">
                Search by name
              </Label>
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="player-search"
                  value={filters.query}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, query: event.target.value }))
                  }
                  placeholder="Player name"
                  className="h-9 pl-8"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Sort by</Label>
              <Select value={sort} onValueChange={(value) => handleSortChange(value as SortKey)}>
                <SelectTrigger className="h-9 w-full lg:w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
              <ViewToggle
                active={view === 'table'}
                onClick={() => setView('table')}
                icon={<Table2 className="size-3.5" />}
                label="Table view"
              />
              <ViewToggle
                active={view === 'grid'}
                onClick={() => setView('grid')}
                icon={<LayoutGrid className="size-3.5" />}
                label="Grid view"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect
              label="Position"
              value={filters.position}
              onChange={(value) => setFilters((p) => ({ ...p, position: value as Position }))}
              options={POSITIONS.map((position) => ({
                value: position,
                label: POSITION_LABELS[position],
              }))}
            />
            <FilterSelect
              label="Level"
              value={filters.level}
              onChange={(value) => setFilters((p) => ({ ...p, level: value as NationalTeamLevel }))}
              options={Object.entries(NATIONAL_TEAM_LEVEL_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <FilterSelect
              label="Trajectory"
              value={filters.trajectory}
              onChange={(value) => setFilters((p) => ({ ...p, trajectory: value as Trajectory }))}
              options={[
                { value: 'improving', label: 'Improving' },
                { value: 'stable', label: 'Stable' },
                { value: 'declining', label: 'Declining' },
              ]}
            />
            <FilterSelect
              label="Confidence"
              value={filters.confidence}
              onChange={(value) =>
                setFilters((p) => ({ ...p, confidence: value as ConfidenceLevel }))
              }
              options={[
                { value: 'high', label: 'High' },
                { value: 'moderate', label: 'Moderate' },
                { value: 'low', label: 'Low' },
              ]}
            />
            <FilterSelect
              label="Club"
              value={filters.club}
              onChange={(value) => setFilters((p) => ({ ...p, club: value }))}
              options={clubs.map((club) => ({ value: club, label: club }))}
            />
            <FilterSelect
              label="League"
              value={filters.league}
              onChange={(value) => setFilters((p) => ({ ...p, league: value }))}
              options={leagues.map((league) => ({ value: league, label: league }))}
            />
            <FilterSelect
              label="Club playing time"
              value={filters.playingTime}
              onChange={(value) =>
                setFilters((p) => ({ ...p, playingTime: value as PlayingTimeStatus }))
              }
              options={Object.entries(PLAYING_TIME_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <FilterSelect
              label="Irish eligibility"
              value={filters.eligibility}
              onChange={(value) =>
                setFilters((p) => ({ ...p, eligibility: value as EligibilityStatus }))
              }
              options={Object.entries(ELIGIBILITY_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full max-w-xs space-y-2">
              <Label className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Age range</span>
                <span className="tabular text-foreground">
                  {filters.ageRange[0]}–{filters.ageRange[1]}
                </span>
              </Label>
              <Slider
                value={filters.ageRange}
                min={16}
                max={38}
                step={1}
                minStepsBetweenThumbs={1}
                onValueChange={(value) =>
                  setFilters((p) => ({ ...p, ageRange: [value[0], value[1]] }))
                }
                aria-label="Age range"
              />
            </div>

            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="tabular">
                {filtered.length} of {players.length} players
              </span>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs transition-colors hover:bg-accent"
                >
                  <RotateCcw className="size-3" aria-hidden="true" />
                  Clear {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title="No players match these filters"
          description="Try widening the age range or clearing a filter. The demonstration dataset holds 41 players, so narrow combinations will often return nothing."
          action={
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
            >
              Clear all filters
            </button>
          }
        />
      ) : view === 'table' ? (
        <PlayerTable
          players={filtered}
          sort={sort}
          sortDir={sortDir}
          onSort={handleHeaderSort}
        />
      ) : (
        <PlayerGrid players={filtered} />
      )}
    </div>
  )
}

function countActiveFilters(filters: Filters): number {
  let count = 0
  if (filters.query.trim()) count += 1
  for (const key of [
    'position',
    'level',
    'club',
    'league',
    'playingTime',
    'trajectory',
    'confidence',
    'eligibility',
  ] as const) {
    if (filters[key] !== ANY) count += 1
  }
  if (filters.ageRange[0] !== 16 || filters.ageRange[1] !== 38) count += 1
  return count
}

function ViewToggle({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        'rounded p-2 transition-colors',
        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
    </button>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function PlayerTable({
  players,
  sort,
  sortDir,
  onSort,
}: {
  players: Player[]
  sort: SortKey
  sortDir: SortDirection
  onSort: (key: SortKey) => void
}) {
  return (
    <Card className="border-border/70 bg-card/60">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortableTableHead
                  label="Player"
                  sortKey="name"
                  activeSort={sort}
                  direction={sortDir}
                  onSort={onSort}
                  className="min-w-[190px]"
                />
                <SortableTableHead
                  label="Age"
                  sortKey="age"
                  activeSort={sort}
                  direction={sortDir}
                  onSort={onSort}
                  align="right"
                  className="text-right"
                />
                <TableHead>Position</TableHead>
                <TableHead className="min-w-[170px]">Club and league</TableHead>
                <TableHead>Level</TableHead>
                <SortableTableHead
                  label="Minutes"
                  sortKey="minutes"
                  activeSort={sort}
                  direction={sortDir}
                  onSort={onSort}
                  align="right"
                  className="text-right"
                />
                <TableHead className="text-right">Starts</TableHead>
                <SortableTableHead
                  label={
                    <span className="inline-flex items-center gap-1">
                      Score
                      <InfoHint label="About the performance score">
                        A 0-100 blend of that player's percentile ranks on the metrics specific to
                        their position, adjusted for league strength and shrunk toward the
                        positional average where the sample of minutes is small.
                      </InfoHint>
                    </span>
                  }
                  ariaLabel="Score"
                  sortKey="score"
                  activeSort={sort}
                  direction={sortDir}
                  onSort={onSort}
                  align="right"
                  className="text-right"
                />
                <SortableTableHead
                  label="vs last"
                  sortKey="change"
                  activeSort={sort}
                  direction={sortDir}
                  onSort={onSort}
                  align="right"
                  className="text-right"
                />
                <TableHead>Trajectory</TableHead>
                <SortableTableHead
                  label="Improve / stable / decline"
                  sortKey="improve"
                  activeSort={sort}
                  direction={sortDir}
                  onSort={onSort}
                  className="min-w-[168px]"
                />
                <TableHead>Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {players.map((player) => (
                <TableRow key={player.id} className="border-border/50">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <PlayerAvatar name={player.name} size="sm" />
                      <div className="min-w-0">
                        <Link
                          to={`/players/${player.id}`}
                          className="font-medium transition-colors hover:text-shamrock-200"
                        >
                          {player.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {ELIGIBILITY_LABELS[player.nationalityStatus]}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="tabular text-right">{player.age}</TableCell>
                  <TableCell>
                    <span className="rounded border border-border/70 px-1.5 py-0.5 text-xs">
                      {player.primaryPosition}
                    </span>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{player.club}</p>
                    <p className="text-xs text-muted-foreground">{player.league}</p>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {NATIONAL_TEAM_LEVEL_LABELS[player.nationalTeamLevel]}
                    {player.internationalCaps > 0 && (
                      <span className="block">{player.internationalCaps} caps</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {player.minutes.toLocaleString()}
                    <span className="block text-xs text-muted-foreground">
                      {Math.round(player.minutesPercentage * 100)}%
                    </span>
                  </TableCell>
                  <TableCell className="tabular text-right">{player.starts}</TableCell>
                  <TableCell className="tabular text-right font-medium">
                    {player.forecast.currentPerformanceScore.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DeltaValue value={player.forecast.seasonOnSeasonChange} />
                  </TableCell>
                  <TableCell>
                    <TrajectoryBadge trajectory={player.forecast.trajectory} />
                  </TableCell>
                  <TableCell>
                    <ProbabilityBar
                      probabilities={player.forecast.projections[24].probabilities}
                      showLegend={false}
                      height="h-2"
                    />
                    <p className="tabular mt-1 text-xs text-muted-foreground">
                      {player.forecast.improvementProbability}% /{' '}
                      {player.forecast.stableProbability}% /{' '}
                      {player.forecast.declineProbability}%
                    </p>
                  </TableCell>
                  <TableCell>
                    <ConfidenceIndicator level={player.forecast.predictionConfidence} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function PlayerGrid({ players }: { players: Player[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {players.map((player) => (
        <Card key={player.id} className="border-border/70 bg-card/60">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <PlayerAvatar name={player.name} />
                <div className="min-w-0">
                  <Link
                    to={`/players/${player.id}`}
                    className="font-medium transition-colors hover:text-shamrock-200"
                  >
                    {player.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {POSITION_LABELS[player.primaryPosition]} · {player.age} ·{' '}
                    {NATIONAL_TEAM_LEVEL_LABELS[player.nationalTeamLevel]}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {player.club} · {player.league}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="tabular text-2xl font-semibold leading-none">
                  {player.forecast.currentPerformanceScore.toFixed(1)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">score</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <TrajectoryBadge trajectory={player.forecast.trajectory} />
              <ConfidenceIndicator level={player.forecast.predictionConfidence} />
            </div>

            <ProbabilityBar probabilities={player.forecast.projections[24].probabilities} />

            <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-xs">
              <div>
                <p className="text-muted-foreground">Minutes</p>
                <p className="tabular">{player.minutes.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Starts</p>
                <p className="tabular">{player.starts}</p>
              </div>
              <div>
                <p className="text-muted-foreground">vs last</p>
                {player.forecast.seasonOnSeasonChange === null ? (
                  <NotSupplied reason="Only one season of data is held for this player." />
                ) : (
                  <DeltaValue value={player.forecast.seasonOnSeasonChange} />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
