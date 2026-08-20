import type { PlayerRaw } from '@/types/domain'

/**
 * The only contract the application has with a data provider.
 *
 * Everything downstream — scoring, forecasting, the entire interface — depends
 * on `PlayerRaw` and nothing else. Replacing the demonstration dataset with a
 * real feed means writing one implementation of this interface; no component or
 * model file needs to change.
 *
 * `asOfDate` is part of the contract because ages and recency weighting must be
 * computed against the date the data describes, not the date the browser is
 * opened. A dataset loaded a year from now should not silently age its players.
 */
export interface DataSource {
  /** Stable identifier, shown in the interface so provenance is never hidden. */
  readonly id: string
  /** Human-readable name, e.g. "Demonstration dataset". */
  readonly label: string
  /** True when values are synthetic. Drives the provenance banner. */
  readonly isDemonstrationData: boolean
  /** ISO date the dataset describes. */
  readonly asOfDate: string

  listPlayers(): Promise<PlayerRaw[]>
}

export class DataSourceError extends Error {
  constructor(
    message: string,
    readonly sourceId: string,
  ) {
    super(message)
    this.name = 'DataSourceError'
  }
}
