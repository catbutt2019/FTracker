import { AGE_CURVES } from './config'
import type { Position } from '@/types/domain'
import { clamp } from './math'

/**
 * Ability multiplier for a position at a given age, relative to that
 * position's peak (where the multiplier is 1).
 *
 * Piecewise-linear rather than smooth: a smooth curve would imply a precision
 * the underlying assumption does not have.
 */
export function ageMultiplier(position: Position, age: number): number {
  const curve = AGE_CURVES[position]
  if (age <= curve.peakAge) {
    return clamp(1 - (curve.peakAge - age) * curve.riseRate, 0.5, 1)
  }
  const pastPeak = age - curve.peakAge
  if (age <= curve.steepDeclineAge) {
    return clamp(1 - pastPeak * curve.declineRate, 0.5, 1)
  }
  const preSteep = curve.steepDeclineAge - curve.peakAge
  const steepYears = age - curve.steepDeclineAge
  return clamp(
    1 -
      preSteep * curve.declineRate -
      steepYears * curve.declineRate * curve.steepDeclineMultiplier,
    0.4,
    1,
  )
}

/**
 * Expected change in score, in points, from ageing alone over `months`.
 *
 * Scaled by the player's current score because a 90-rated player has more to
 * lose from decline than a 40-rated one, and less headroom to gain.
 */
export function ageEffect(
  position: Position,
  currentAge: number,
  currentScore: number,
  months: number,
): number {
  const years = months / 12
  const now = ageMultiplier(position, currentAge)
  const later = ageMultiplier(position, currentAge + years)
  return (later / now - 1) * currentScore
}

/** Points on the positional age curve, for charting a player against it. */
export function ageCurveSeries(
  position: Position,
  fromAge = 16,
  toAge = 38,
): { age: number; multiplier: number }[] {
  const points: { age: number; multiplier: number }[] = []
  for (let age = fromAge; age <= toAge; age += 1) {
    points.push({ age, multiplier: ageMultiplier(position, age) })
  }
  return points
}

export function peakAgeFor(position: Position): number {
  return AGE_CURVES[position].peakAge
}
