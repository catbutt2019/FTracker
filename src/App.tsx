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
        <Route path="/" element={<Dashboard />} />
        <Route path="/players" element={<PlayerExplorer />} />
        <Route path="/players/:id" element={<PlayerDetail />} />
        <Route path="/depth" element={<PositionDepthPage />} />
        <Route path="/methodology" element={<Methodology />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
