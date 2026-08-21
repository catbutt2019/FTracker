import { realAdapter } from './realAdapter'
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
  real: realAdapter,
}

export function resolveDataSource(): DataSource {
  const requested = import.meta.env.VITE_DATA_SOURCE ?? 'real'
  const adapter = ADAPTERS[requested]
  if (!adapter) {
    console.warn(`Unknown VITE_DATA_SOURCE "${requested}". Falling back to the real player dataset.`)
    return realAdapter
  }
  return adapter
}
