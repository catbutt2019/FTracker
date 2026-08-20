import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { resolveDataSource } from '@/data/adapters'
import { assembleDataset, type Dataset } from '@/data/pipeline'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; data: Dataset }

const DatasetContext = createContext<LoadState>({ status: 'loading' })

/**
 * Loads the active data source once and derives the full model from it.
 *
 * Deriving in a provider rather than per page means the Monte Carlo runs once
 * per session; re-running it on navigation would make the same forecast appear
 * to wobble as the user moved around the app.
 */
export function DatasetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    const source = resolveDataSource()

    source
      .listPlayers()
      .then((raw) => {
        if (cancelled) return
        if (raw.length === 0) {
          setState({
            status: 'error',
            error: `${source.label} returned no players. The forecast needs a pool to compare players against.`,
          })
          return
        }
        setState({
          status: 'ready',
          data: assembleDataset(raw, {
            asOfDate: source.asOfDate,
            sourceLabel: source.label,
            isDemonstrationData: source.isDemonstrationData,
          }),
        })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error loading player data.',
        })
      })

    return () => {
      cancelled = true
    }
  }, [])

  return <DatasetContext.Provider value={state}>{children}</DatasetContext.Provider>
}

export function useDatasetState(): LoadState {
  return useContext(DatasetContext)
}

/** Convenience accessor for pages rendered only inside a ready state. */
export function useDataset(): Dataset {
  const state = useContext(DatasetContext)
  if (state.status !== 'ready') {
    throw new Error('useDataset called outside a ready DatasetProvider')
  }
  return state.data
}

export function usePlayer(id: string | undefined) {
  const { players } = useDataset()
  return useMemo(() => players.find((p) => p.id === id), [players, id])
}
