import type { PlayerRaw } from '@/types/domain'
import { DEMO_AS_OF, generateDemoPlayers } from '../demo/generate'
import type { DataSource } from './types'

/** Simulated latency, so loading states are real rather than decorative. */
const SIMULATED_LATENCY_MS = 420

export const demoAdapter: DataSource = {
  id: 'demo',
  label: 'Demonstration dataset',
  isDemonstrationData: true,
  asOfDate: DEMO_AS_OF,

  async listPlayers(): Promise<PlayerRaw[]> {
    await new Promise((resolve) => setTimeout(resolve, SIMULATED_LATENCY_MS))
    return generateDemoPlayers()
  },
}
