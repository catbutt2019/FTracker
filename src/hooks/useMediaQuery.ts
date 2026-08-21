import { useEffect, useState } from 'react'

/**
 * Subscribes to a CSS media query.
 *
 * Used where the *content* has to change across a breakpoint, not just its
 * layout. Where CSS alone can do the job, CSS should: this hook renders one
 * branch or the other, so anything hidden is genuinely absent from the DOM
 * rather than display:none. That is the point for a list of eighty-odd
 * players — rendering both a table and a card list and hiding one would
 * double the DOM on the slowest device we care about.
 *
 * Reads synchronously on first render so there is no flash of the wrong
 * branch, then subscribes for live resizing.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const list = window.matchMedia(query)
    // Re-read on mount in case the viewport changed between the initial
    // render and this effect firing.
    setMatches(list.matches)

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/**
 * True from Tailwind's `lg` up — the width at which the dense views earn
 * their keep. Deliberately the same breakpoint the filter panel collapses
 * at, so the page has one idea of "big enough" rather than two.
 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}
