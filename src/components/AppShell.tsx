import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Github, Menu, X } from 'lucide-react'
import { MODEL_CONFIG } from '@/model/config'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/', label: 'Players' },
  { to: '/outlook', label: 'Outlook' },
  { to: '/depth', label: 'Position depth' },
  { to: '/methodology', label: 'Methodology' },
]

/**
 * The Irish tricolour — a national flag, not a trademarked club/federation
 * logo, so there's no rights issue reproducing its colours and proportions.
 */
function IrelandFlag({ className }: { className?: string }) {
  return (
    <span className={cn('flex overflow-hidden rounded-[3px]', className)} aria-hidden="true">
      <span className="flex-1 bg-[#169b62]" />
      <span className="flex-1 bg-white" />
      <span className="flex-1 bg-[#ff883e]" />
    </span>
  )
}

export function AppShell({
  children,
  sourceLabel,
  asOfDate,
}: {
  children: ReactNode
  sourceLabel?: string
  asOfDate?: string
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-shamrock-950/40 bg-shamrock-700 text-white shadow-sm">
        <div className="container flex h-14 items-center justify-between gap-4">
          <NavLink to="/" className="flex items-center gap-2.5">
            <IrelandFlag className="h-6 w-9 shrink-0 shadow-sm ring-1 ring-black/10" />

            <span className="text-sm font-semibold leading-tight text-white">
              Irish Player Progression Tracker
              <span className="ml-2 hidden rounded border border-white/30 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-white/70 sm:inline">
                Experimental
              </span>
            </span>
          </NavLink>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-white/15 font-medium text-white'
                      : 'text-white/75 hover:bg-white/10 hover:text-white',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <button
            type="button"
            className="rounded-md p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          >
            {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>

        {menuOpen && (
          <nav className="border-t border-white/15 md:hidden" aria-label="Main">
            <div className="container flex flex-col py-2">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'rounded-md px-3 py-2 text-sm transition-colors',
                      isActive ? 'bg-white/15 font-medium text-white' : 'text-white/75 hover:bg-white/10 hover:text-white',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main id="main" className="container py-8">
        {children}
      </main>

      <footer className="mt-12 border-t border-border/70 py-8">
        <div className="container flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p>
              Experimental model {MODEL_CONFIG.version}. Projections are estimates from a
              transparent, unfitted model, not predictions of fact.
            </p>
            {sourceLabel && asOfDate && (
              <p>
                Source: {sourceLabel} · Data as at {asOfDate}
              </p>
            )}
          </div>
          <a
            href="https://github.com/shadcn-ui/ui"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <Github className="size-3.5" aria-hidden="true" />
            Built with shadcn/ui
          </a>
        </div>
      </footer>
    </div>
  )
}
