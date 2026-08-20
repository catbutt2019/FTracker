import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { loadStaticResearchSnapshot } from '@/data/research/loadSnapshot'
import type { ResearchSnapshot } from '@/types/research'

type LoadState =
  | { status: 'error'; error: string }
  | { status: 'ready'; data: ResearchSnapshot }

const ResearchContext = createContext<LoadState | null>(null)

/**
 * Unlike `DatasetProvider`, this has no async step: the research snapshot is
 * a static, versioned file bundled with the app, not a fetched feed, so there
 * is nothing to await. Validation still happens once, here, so a malformed
 * research file fails loudly at the provider boundary rather than as an
 * undefined-property error three components later.
 */
export function ResearchProvider({ children }: { children: ReactNode }) {
  const [state] = useState<LoadState>(() => {
    try {
      return { status: 'ready', data: loadStaticResearchSnapshot() }
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error loading research data.',
      }
    }
  })

  return <ResearchContext.Provider value={state}>{children}</ResearchContext.Provider>
}

export function useResearchSnapshotState(): LoadState {
  const state = useContext(ResearchContext)
  if (!state) throw new Error('useResearchSnapshotState called outside a ResearchProvider')
  return state
}

/** Convenience accessor for pages rendered only once the snapshot is known to be ready. */
export function useResearchSnapshot(): ResearchSnapshot {
  const state = useResearchSnapshotState()
  if (state.status !== 'ready') {
    throw new Error('useResearchSnapshot called outside a ready ResearchProvider')
  }
  return state.data
}

export function useResearchPlayer(id: string | undefined) {
  const { players } = useResearchSnapshot()
  return useMemo(() => players.find((p) => p.id === id), [players, id])
}
