import type { ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/AppShell'
import { ErrorState, LoadingState } from '@/components/Primitives'
import { DatasetProvider, useDatasetState } from '@/hooks/useDataset'
import { ResearchProvider, useResearchSnapshotState } from '@/hooks/useResearchSnapshot'
import { Dashboard } from '@/pages/Dashboard'
import { Methodology } from '@/pages/Methodology'
import { PlayerDetail } from '@/pages/PlayerDetail'
import { PlayerExplorer } from '@/pages/PlayerExplorer'
import { PositionDepthPage } from '@/pages/PositionDepth'
import { ResearchDashboard } from '@/pages/ResearchDashboard'
import { ResearchPlayerDetail } from '@/pages/ResearchPlayerDetail'
import { ResearchPlayerExplorer } from '@/pages/ResearchPlayerExplorer'

/**
 * HashRouter rather than BrowserRouter: GitHub Pages serves static files with
 * no rewrite rules, so a deep link to /players would 404 under browser
 * routing.
 */
export function App() {
  return (
    <HashRouter>
      <TooltipProvider delayDuration={200}>
        <DatasetProvider>
          <ResearchProvider>
            <Shell />
          </ResearchProvider>
        </DatasetProvider>
      </TooltipProvider>
    </HashRouter>
  )
}

function Shell() {
  const state = useDatasetState()

  if (state.status === 'loading') {
    return (
      <AppShell isDemonstrationData>
        <LoadingState />
      </AppShell>
    )
  }

  if (state.status === 'error') {
    return (
      <AppShell isDemonstrationData>
        <ErrorState message={state.error} onRetry={() => window.location.reload()} />
      </AppShell>
    )
  }

  return (
    <AppShell
      sourceLabel={state.data.sourceLabel}
      asOfDate={state.data.asOfDate}
      isDemonstrationData={state.data.isDemonstrationData}
    >
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/players" element={<PlayerExplorer />} />
        <Route path="/players/:id" element={<PlayerDetail />} />
        <Route path="/depth" element={<PositionDepthPage />} />
        <Route path="/research" element={<ResearchGate><ResearchDashboard /></ResearchGate>} />
        <Route
          path="/research/players"
          element={<ResearchGate><ResearchPlayerExplorer /></ResearchGate>}
        />
        <Route
          path="/research/players/:id"
          element={<ResearchGate><ResearchPlayerDetail /></ResearchGate>}
        />
        <Route path="/methodology" element={<Methodology />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

/**
 * The research snapshot has no loading phase (it is a static bundled file),
 * only ready-or-error, so this only ever needs to gate error, not loading.
 * Kept separate from `Shell`'s dataset gate because the two data sources fail
 * independently and one page's provenance is not the other's.
 */
function ResearchGate({ children }: { children: ReactNode }) {
  const state = useResearchSnapshotState()
  if (state.status === 'error') {
    return <ErrorState message={state.error} onRetry={() => window.location.reload()} />
  }
  return <>{children}</>
}
