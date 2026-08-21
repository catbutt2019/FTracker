import { describe, expect, it } from 'vitest'
import type { PlayerRaw } from '@/types/domain'
import { assembleDataset } from '../pipeline'
import { isFutureContenderEligible } from '@/model/squadStatus'
import realPlayersFile from '../../../research/real-players.json'

/**
 * Integrity checks on the researched dataset itself, as distinct from the
 * model that consumes it.
 *
 * `squadStatus.ts` hangs the entire squad-status classification off
 * `hasSeniorAppearance`, which reads `seniorStatus.seniorCaps > 0` as a proxy
 * for "has played for the senior team". That proxy is only as good as the
 * research pass: a genuinely capped senior international recorded with
 * `seniorCaps: 0` passes straight through the `hasSeniorAppearance` gate at the
 * top of `isFutureContenderEligible` and can be presented as a "potential
 * future starter" — reproducing, from data alone, the exact bug the
 * classification rewrite was built to eliminate.
 *
 * These tests exist to make that class of contradiction visible and bounded.
 */

const raw = realPlayersFile as unknown as PlayerRaw[]

const dataset = assembleDataset(raw, {
  asOfDate: '2026-08-21',
  sourceLabel: 'integrity-test',
  isDemonstrationData: false,
})

/**
 * Players recorded at senior national-team level whose `seniorCaps` is `0` or
 * `null` — self-contradictory, because reaching senior level requires having
 * appeared for the senior team.
 *
 * This is a ratchet, not an aspiration. Every id below is a known-bad record
 * awaiting research round 2 (see `research/data-request-round-2.md`). The list
 * is asserted *exactly*, so the test fails if the count grows — a new bad
 * record — and also if it shrinks, which means the data improved and this
 * baseline needs trimming. Either way the failure is informative rather than
 * mysterious.
 *
 * It is deliberately not written as `expect(contradictions).toHaveLength(0)`.
 * `.github/workflows/deploy.yml` runs `npm run test` before publishing, so a
 * permanently red test would block every deployment until the data is fixed —
 * turning a data-quality problem into an outage.
 */
const KNOWN_SENIOR_LEVEL_WITHOUT_CAPS = [
  'alan-browne',
  'alex-murphy',
  'conor-coventry',
  'corrie-ndaba',
  'dawson-devoy',
  'evan-ferguson',
  'festy-ebosele',
  'jack-taylor',
  'james-abankwah',
  'jamie-mcgrath',
  'jayson-molumby',
  'joe-hodge',
  'johnny-kenny',
  'josh-keeley',
  'killian-phillips',
  'mark-travers',
  'robbie-brady',
  'tom-cannon',
] as const

function seniorLevelWithoutCaps(): string[] {
  return raw
    .filter((p) => p.nationalTeamLevel === 'senior' && !p.seniorStatus.seniorCaps)
    .map((p) => p.id)
    .sort()
}

describe('dataset integrity — senior standing vs recorded caps', () => {
  it('has no senior-level-without-caps contradictions beyond the documented baseline', () => {
    expect(seniorLevelWithoutCaps()).toEqual([...KNOWN_SENIOR_LEVEL_WITHOUT_CAPS])
  })

  it('records a senior cap count for every player claiming capped-ireland standing at senior level', () => {
    // Narrower and stricter than the ratchet above: `capped-ireland` is an
    // explicit claim to have been capped, so a null/zero cap count there is
    // unambiguously wrong rather than merely suspicious.
    const contradictory = raw
      .filter((p) => p.nationalityStatus === 'capped-ireland' && p.nationalTeamLevel === 'senior')
      .filter((p) => !p.seniorStatus.seniorCaps)
      .map((p) => p.id)

    // One known offender: James Abankwah, `seniorCaps: null`.
    expect(contradictory).toEqual(['james-abankwah'])
  })

  it('never lets the same player be counted as both capped and uncapped by the two cap fields', () => {
    // `internationalCaps` includes youth caps; `seniorStatus.seniorCaps`
    // must not. A player with youth caps and no senior caps is therefore a
    // legitimate mismatch — but the reverse, senior caps exceeding total
    // international caps, is impossible and would indicate a broken adapter.
    const impossible = raw
      .filter((p) => (p.seniorStatus.seniorCaps ?? 0) > (p.internationalCaps ?? 0))
      .map((p) => p.id)

    expect(impossible).toEqual([])
  })
})

describe('dataset integrity — knock-on effect on squad status', () => {
  function seniorLevelFutureContenders(): string[] {
    const levelById = new Map(raw.map((p) => [p.id, p.nationalTeamLevel]))
    return dataset.players
      .filter((p) => isFutureContenderEligible(p) && levelById.get(p.id) === 'senior')
      .map((p) => p.id)
      .sort()
  }

  /**
   * Expected to fail today, and marked as such so CI stays green while the
   * data debt is outstanding.
   *
   * When research round 2 lands and this stops throwing, vitest will report
   * *this test* as failing — the signal to delete the `.fails` marker and let
   * it stand as a normal regression guard. That is the intended lifecycle, not
   * a mistake.
   */
  it.fails('does not present any senior-level player as a potential future starter', () => {
    expect(seniorLevelFutureContenders()).toEqual([])
  })

  it('confines the misclassification to the documented players', () => {
    // The live consequence of the cap contradictions: three senior-level
    // players are currently future-contender-eligible purely because their
    // recorded cap count is 0/null. Half of the six eligible players in the
    // whole dataset, which is why `successionRisk` — the dimension deciding
    // five of six group verdicts — cannot be trusted until this is fixed.
    expect(seniorLevelFutureContenders()).toEqual(['james-abankwah', 'joe-hodge', 'josh-keeley'])
  })
})
