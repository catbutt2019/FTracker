import { demoAdapter } from './demoAdapter'
import type { DataSource } from './types'

export type { DataSource } from './types'
export { DataSourceError } from './types'

/**
 * Adapter registry.
 *
 * Add a provider by implementing `DataSource` and registering it here, then set
 * `VITE_DATA_SOURCE` to its key. Nothing else in the application needs to know
 * which provider is active.
 */
const ADAPTERS: Record<string, DataSource> = {
  demo: demoAdapter,
}

export function resolveDataSource(): DataSource {
  const requested = import.meta.env.VITE_DATA_SOURCE ?? 'demo'
  const adapter = ADAPTERS[requested]
  if (!adapter) {
    // Falling back rather than throwing keeps a misconfigured deployment usable,
    // and the provenance banner will still say which dataset is in play.
    console.warn(
      `Unknown VITE_DATA_SOURCE "${requested}". Falling back to the demonstration dataset.`,
    )
    return demoAdapter
  }
  return adapter
}
