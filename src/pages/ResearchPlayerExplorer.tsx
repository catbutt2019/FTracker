import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LayoutGrid, RotateCcw, Search, Table2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { EmptyState, NotSupplied } from '@/components/Primitives'
import { ConfidenceIndicator } from '@/components/Indicators'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { ResearchStatusBadge } from '@/components/ResearchIndicators'
import { ProbabilityBar } from '@/components/ProbabilityBar'
import { SortableTableHead, type SortDirection } from '@/components/SortableTableHead'
import { useResearchSnapshot } from '@/hooks/useResearchSnapshot'
import { POSITIONS, POSITION_LABELS, type Position } from '@/types/domain'
import {
  ELIGIBILITY_STANDING_LABELS,
  INVOLVEMENT_LABELS,
  PROGRESSION_STATUS_LABELS,
  type EligibilityStandingResearch,
  type Involvement,
  type ProgressionStatus,
  type ResearchLevel,
  type ResearchPlayer,
  type ProgressionAssessment,
} from '@/types/research'
import { cn } from '@/lib/utils'

const ANY = 'any'

const LEVEL_LABELS: Record<ResearchLevel, string> = {
  senior: 'Senior',
  u21: 'Under-21',
  emerging: 'Emerging',
}

type SortKey = 'score' | 'name' | 'age' | 'caps' | 'improve'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'score', label: 'Progression score' },
  { value: 'improve', label: 'Chance of improving' },
  { value: 'caps', label: 'Senior caps' },
  { value: 'age', label: 'Age' },
  { value: 'name', label: 'Name' },
]

/** The direction each sort key defaults to the first time it is selected. */
const DEFAULT_SORT_DIRECTION: Record<SortKey, SortDirection> = {
  score: 'desc',
  improve: 'desc',
  caps: 'desc',
  age: 'asc',
  name: 'asc',
}

function compareBySortKey(
  a: ResearchPlayer,
  b: ResearchPlayer,
  key: SortKey,
  assessments: Record<string, ProgressionAssessment>,
): number {
  const scoreA = assessments[a.id]
  const scoreB = assessments[b.id]
  switch (key) {
    case 'name':
      return a.fullName.localeCompare(b.fullName)
    case 'age':
      return (a.age ?? 99) - (b.age ?? 99)
    case 'caps':
      return (a.caps ?? 0) - (b.caps ?? 0)
    case 'improve':
      return (scoreA?.positiveProbability ?? 0) - (scoreB?.positiveProbability ?? 0)
    default:
      return (scoreA?.progressionScore ?? -999) - (scoreB?.progressionScore ?? -999)
  }
}

interface Filters {
  query: string
  position: Position | typeof ANY
  level: ResearchLevel | typeof ANY
  eligibilityStanding: EligibilityStandingResearch | typeof ANY
  involvement: Involvement | typeof ANY
  status: ProgressionStatus | typeof ANY
  club: string
  league: string
}

function defaultFilters(initialPosition: string | null): Filters {
  return {
    query: '',
    position: (initialPosition as Position) ?? ANY,
    level: ANY,
    eligibilityStanding: ANY,
    involvement: ANY,
    status: ANY,
    club: ANY,
    league: ANY,
  }
}

export function ResearchPlayerExplorer() {
  const { players, assessments } = useResearchSnapshot()
  const [searchParams] = useSearchParams()
  const [filters, setFilters] = useState<Filters>(() =>
    defaultFilters(searchParams.get('position')),
  )
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

  const clubs = useMemo(() => Array.from(new Set(players.map((p) => p.club))).sort(), [players])
  const leagues = useMemo(() => Array.from(new Set(players.map((p) => p.league))).sort(), [players])

  const filtered = useMemo(() => {
    const query = filters.query.trim().toLowerCase()
    const result = players.filter((player) => {
      if (query && !player.fullName.toLowerCase().includes(query)) return false
      if (filters.position !== ANY && player.primaryPosition !== filters.position) return false
      if (filters.level !== ANY && player.level !== filters.level) return false
      if (
        filters.eligibilityStanding !== ANY &&
        player.eligibilityStanding !== filters.eligibilityStanding
      )
        return false
      if (filters.involvement !== ANY && player.involvement !== filters.involvement) return false
      if (filters.status !== ANY && assessments[player.id]?.status !== filters.status) return false
      if (filters.club !== ANY && player.club !== filters.club) return false
      if (filters.league !== ANY && player.league !== filters.league) return false
      return true
    })

    return result.sort((a, b) =>
      sortDir === 'asc'
        ? compareBySortKey(a, b, sort, assessments)
        : compareBySortKey(b, a, sort, assessments),
    )
  }, [players, filters, sort, sortDir, assessments])

  const activeFilterCount = countActiveFilters(filters)

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Research players</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Every player in the researched snapshot, with the evidence-based assessment derived from
          their sourced claims. Unlike the statistical model, there is no percentile score here —
          only a documented heuristic over cited evidence.
        </p>
      </header>

      <Card className="border-border/70 bg-card/60">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="research-player-search" className="text-xs text-muted-foreground">
                Search by name
              </Label>
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="research-player-search"
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
              onChange={(value) => setFilters((p) => ({ ...p, level: value as ResearchLevel }))}
              options={Object.entries(LEVEL_LABELS).map(([value, label]) => ({ value, label }))}
            />
            <FilterSelect
              label="Eligibility standing"
              value={filters.eligibilityStanding}
              onChange={(value) =>
                setFilters((p) => ({
                  ...p,
                  eligibilityStanding: value as EligibilityStandingResearch,
                }))
              }
              options={Object.entries(ELIGIBILITY_STANDING_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <FilterSelect
              label="Involvement"
              value={filters.involvement}
              onChange={(value) => setFilters((p) => ({ ...p, involvement: value as Involvement }))}
              options={Object.entries(INVOLVEMENT_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <FilterSelect
              label="Assessment status"
              value={filters.status}
              onChange={(value) => setFilters((p) => ({ ...p, status: value as ProgressionStatus }))}
              options={Object.entries(PROGRESSION_STATUS_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
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
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="tabular text-sm text-muted-foreground">
              {filtered.length} of {players.length} players
            </span>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => setFilters(defaultFilters(null))}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs transition-colors hover:bg-accent"
              >
                <RotateCcw className="size-3" aria-hidden="true" />
                Clear {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title="No players match these filters"
          description="Try clearing a filter. The research snapshot is a fixed set of researched players, so narrow combinations will often return nothing."
          action={
            <button
              type="button"
              onClick={() => setFilters(defaultFilters(null))}
              className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
            >
              Clear all filters
            </button>
          }
        />
      ) : view === 'table' ? (
        <PlayerTable
          players={filtered}
          assessments={assessments}
          sort={sort}
          sortDir={sortDir}
          onSort={handleHeaderSort}
        />
      ) : (
        <PlayerGrid players={filtered} assessments={assessments} />
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
    'eligibilityStanding',
    'involvement',
    'status',
    'club',
    'league',
  ] as const) {
    if (filters[key] !== ANY) count += 1
  }
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
  assessments,
  sort,
  sortDir,
  onSort,
}: {
  players: ResearchPlayer[]
  assessments: Record<string, ProgressionAssessment>
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
                  label="Caps"
                  sortKey="caps"
                  activeSort={sort}
                  direction={sortDir}
                  onSort={onSort}
                  align="right"
                  className="text-right"
                />
                <TableHead>Status</TableHead>
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
              {players.map((player) => {
                const assessment = assessments[player.id]
                return (
                  <TableRow key={player.id} className="border-border/50">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <PlayerAvatar name={player.fullName} size="sm" />
                        <div className="min-w-0">
                          <Link
                            to={`/research/players/${player.id}`}
                            className="font-medium transition-colors hover:text-shamrock-200"
                          >
                            {player.fullName}
                          </Link>
                          {player.disambiguation && (
                            <p className="text-xs text-muted-foreground">
                              {player.disambiguation}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {player.age === null ? (
                        <NotSupplied reason="Date of birth could not be verified." />
                      ) : (
                        player.age
                      )}
                    </TableCell>
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
                      {LEVEL_LABELS[player.level]}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {player.caps === null ? '—' : player.caps}
                    </TableCell>
                    <TableCell>
                      {assessment ? (
                        <ResearchStatusBadge status={assessment.status} />
                      ) : (
                        <NotSupplied />
                      )}
                    </TableCell>
                    <TableCell>
                      {assessment ? (
                        <>
                          <ProbabilityBar
                            probabilities={{
                              improve: assessment.positiveProbability,
                              stable: assessment.stableProbability,
                              decline: assessment.declineProbability,
                            }}
                            showLegend={false}
                            height="h-2"
                          />
                          <p className="tabular mt-1 text-xs text-muted-foreground">
                            {assessment.positiveProbability}% / {assessment.stableProbability}% /{' '}
                            {assessment.declineProbability}%
                          </p>
                        </>
                      ) : (
                        <NotSupplied />
                      )}
                    </TableCell>
                    <TableCell>
                      {assessment ? (
                        <ConfidenceIndicator level={assessment.confidence} />
                      ) : (
                        <NotSupplied />
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function PlayerGrid({
  players,
  assessments,
}: {
  players: ResearchPlayer[]
  assessments: Record<string, ProgressionAssessment>
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {players.map((player) => {
        const assessment = assessments[player.id]
        return (
          <Card key={player.id} className="border-border/70 bg-card/60">
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <PlayerAvatar name={player.fullName} />
                  <div className="min-w-0">
                    <Link
                      to={`/research/players/${player.id}`}
                      className="font-medium transition-colors hover:text-shamrock-200"
                    >
                      {player.fullName}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {POSITION_LABELS[player.primaryPosition]} ·{' '}
                      {player.age === null ? 'age unverified' : player.age} ·{' '}
                      {LEVEL_LABELS[player.level]}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {player.club} · {player.league}
                    </p>
                  </div>
                </div>
                {assessment && <ResearchStatusBadge status={assessment.status} />}
              </div>

              {assessment ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <ConfidenceIndicator level={assessment.confidence} />
                  </div>
                  <ProbabilityBar
                    probabilities={{
                      improve: assessment.positiveProbability,
                      stable: assessment.stableProbability,
                      decline: assessment.declineProbability,
                    }}
                  />
                </>
              ) : (
                <NotSupplied reason="No assessment could be derived for this player." />
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
