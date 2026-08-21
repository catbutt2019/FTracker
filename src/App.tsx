import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/AppShell'
import { ErrorState, LoadingState } from '@/components/Primitives'
import { DatasetProvider, useDatasetState } from '@/hooks/useDataset'
import { Dashboard } from '@/pages/Dashboard'
import { Methodology } from '@/pages/Methodology'
import { PlayerDetail } from '@/pages/PlayerDetail'
import { PlayerExplorer } from '@/pages/PlayerExplorer'
import { PositionDepthPage } from '@/pages/PositionDepth'

/**
 * HashRouter rather than BrowserRouter: GitHub Pages serves static files with
 * no rewrite rules, so a deep link to /players would 404 under browser
 * routing.
 *
 * The player pool, not the squad-level outlook, is the root route: it's the
 * page most visitors actually want first, and the one most in need of being
 * reachable on a phone or tablet without an extra tap.
 */
export function App() {
  return (
    <HashRouter>
      <TooltipProvider delayDuration={200}>
        <DatasetProvider>
          <Shell />
        </DatasetProvider>
      </TooltipProvider>
    </HashRouter>
  )
}

function Shell() {
  const state = useDatasetState()

  if (state.status === 'loading') {
    return (
      <AppShell>
        <LoadingState />
      </AppShell>
    )
  }

  if (state.status === 'error') {
    return (
      <AppShell>
        <ErrorState message={state.error} onRetry={() => window.location.reload()} />
      </AppShell>
    )
  }

  return (
    <AppShell sourceLabel={state.data.sourceLabel} asOfDate={state.data.asOfDate}>
      <Routes>
        <Route path="/" element={<PlayerExplorer />} />
        <Route path="/players" element={<Navigate to="/" replace />} />
        <Route path="/players/:id" element={<PlayerDetail />} />
        <Route path="/outlook" element={<Dashboard />} />
        <Route path="/depth" element={<PositionDepthPage />} />
        <Route path="/methodology" element={<Methodology />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
