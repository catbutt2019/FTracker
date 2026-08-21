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
 * This is a ratchet, not an aspiration. The list is asserted *exactly*, so the
 * test fails if the count grows — a new bad record — and also if it shrinks,
 * which means the data improved and this baseline needs trimming. Either way
 * the failure is informative rather than mysterious.
 *
 * It is deliberately not written as `expect(contradictions).toHaveLength(0)`.
 * `.github/workflows/deploy.yml` runs `npm run test` before publishing, so a
 * permanently red test would block every deployment until the data is fixed —
 * turning a data-quality problem into an outage.
 *
 * ## Down from 18 to 3 (research round 2)
 *
 * The original baseline held 18 ids and was described here as a data problem.
 * That was only half right, and the ratchet is what proved it: 17 of the 18
 * were manufactured by `scripts/build-real-players.mjs`, which read
 *
 *     p.eligibilityStanding === 'capped-senior' ? (p.caps ?? null) : 0
 *
 * and so wrote a definite `0` — "has never played for Ireland" — whenever the
 * standing label was anything else. Round 1 labelled Robbie Brady (71 caps)
 * and Jayson Molumby (36) `committed-uncapped`, so both were flattened to
 * zero. Round 2 supplied a sourced per-player cap count and the build script
 * now uses it directly, leaving `null` where nothing was found rather than
 * inventing a zero.
 *
 * The three that remain are genuine research gaps, not build artefacts. Each
 * is recorded in the round-2 file with `confidence: 'low'`, no sources, and a
 * note explaining that the legacy `caps` value was rejected because it
 * conflated youth and senior appearances. Rocco Vata (was 10) and Kasey
 * McAteer (was 8) lost a cap count they should not have been trusted with;
 * Alex Murphy never had one.
 */
const KNOWN_SENIOR_LEVEL_WITHOUT_CAPS = ['alex-murphy', 'kasey-mcateer', 'rocco-vata'] as const

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
      .sort()

    // Vata and McAteer carry `capped-senior` standing from round 1 but lost
    // their cap counts in round 2, which judged the legacy figures to be
    // youth-contaminated. The standing is the surviving claim, and it is now
    // the unsupported one. James Abankwah — the sole offender before round 2 —
    // is sourced at 4 caps and no longer appears.
    expect(contradictory).toEqual(['kasey-mcateer', 'rocco-vata'])
  })

  it('never reports senior starts for a player with no recorded senior caps', () => {
    // A start is a strictly stronger claim than an appearance, so starts
    // without caps would mean the two fields were sourced independently and
    // never reconciled.
    const orphanStarts = raw
      .filter((p) => p.seniorStatus.seniorStarts !== null && p.seniorStatus.seniorCaps === null)
      .map((p) => p.id)

    expect(orphanStarts).toEqual([])
  })

  it('never reports more senior starts than senior caps', () => {
    const impossible = raw
      .filter((p) => {
        const { seniorStarts, seniorCaps } = p.seniorStatus
        return seniorStarts !== null && seniorCaps !== null && seniorStarts > seniorCaps
      })
      .map((p) => p.id)

    expect(impossible).toEqual([])
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
  const levelById = new Map(raw.map((p) => [p.id, p.nationalTeamLevel]))

  function seniorLevelFutureContenders(): string[] {
    return dataset.players
      .filter((p) => isFutureContenderEligible(p) && levelById.get(p.id) === 'senior')
      .map((p) => p.id)
      .sort()
  }

  /**
   * Was `it.fails` while the data debt was outstanding, on the reasoning that
   * a permanently red test would block every deployment. The documented
   * lifecycle was that when round 2 landed and the body stopped throwing,
   * vitest would report *this test* as failing — the signal to drop the marker
   * and let it stand as a normal regression guard.
   *
   * That is exactly what happened. James Abankwah, Joe Hodge and Josh Keeley
   * were each presented as a "potential future starter" solely because
   * `hasSeniorAppearance` reads `seniorCaps > 0` and the build script had
   * written `0` for all three. They are now sourced at 4, 1 and 1 caps, so the
   * `hasSeniorAppearance` gate excludes them and the list is empty on its own
   * merits rather than by exemption.
   */
  it('does not present any senior-level player as a potential future starter', () => {
    expect(seniorLevelFutureContenders()).toEqual([])
  })

  it('still finds genuine future contenders below senior level', () => {
    // Guards the opposite failure from the one above. Repairing the cap counts
    // narrowed future-contender eligibility sharply, and a silently empty
    // pipeline would look identical to a healthy one on the assertion above
    // while quietly reporting no succession risk anywhere.
    const contenders = dataset.players.filter(isFutureContenderEligible)
    expect(contenders.length).toBeGreaterThan(0)
    expect(contenders.every((p) => levelById.get(p.id) !== 'senior')).toBe(true)
  })
})
