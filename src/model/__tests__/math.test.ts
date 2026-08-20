import { describe, expect, it } from 'vitest'
import {
  createRng,
  normalCdf,
  normalQuantile,
  percentileRank,
  quantile,
  roundToHundred,
} from '../math'

describe('percentileRank', () => {
  it('places the lowest and highest values near the ends of the range', () => {
    const population = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(percentileRank(1, population)).toBeLessThan(10)
    expect(percentileRank(10, population)).toBeGreaterThan(90)
  })

  it('places the median near 50', () => {
    const population = [10, 20, 30, 40, 50]
    expect(percentileRank(30, population)).toBeCloseTo(50, 0)
  })

  it('puts ties in the middle of the band they occupy rather than at its top', () => {
    // Four identical values must not all be reported as 100th percentile.
    const population = [5, 5, 5, 5]
    expect(percentileRank(5, population)).toBe(50)
  })

  it('returns a neutral 50 rather than throwing when there is nothing to compare against', () => {
    expect(percentileRank(5, [])).toBe(50)
    expect(percentileRank(5, [5])).toBe(50)
  })
})

describe('roundToHundred', () => {
  it('always sums to exactly 100', () => {
    const cases = [
      [0.3333, 0.3333, 0.3333],
      [0.005, 0.99, 0.005],
      [0.165, 0.67, 0.165],
      [0.5, 0.5, 0],
      [1, 0, 0],
      [0.126, 0.4373, 0.4367],
    ]
    for (const input of cases) {
      const result = roundToHundred(input)
      expect(result.reduce((a, b) => a + b, 0)).toBe(100)
    }
  })

  it('preserves ordering of the inputs', () => {
    const [a, b, c] = roundToHundred([0.2, 0.5, 0.3])
    expect(b).toBeGreaterThan(c)
    expect(c).toBeGreaterThan(a)
  })

  it('degrades to an even split when every input is zero', () => {
    const result = roundToHundred([0, 0, 0])
    expect(result.reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('never returns a negative percentage', () => {
    for (const value of roundToHundred([0.0001, 0.9998, 0.0001])) {
      expect(value).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('normalCdf', () => {
  it('is 0.5 at the mean', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
  })

  it('matches known values', () => {
    expect(normalCdf(1)).toBeCloseTo(0.8413, 3)
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3)
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3)
  })

  it('is monotonically increasing', () => {
    let previous = 0
    for (let z = -4; z <= 4; z += 0.25) {
      const value = normalCdf(z)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })
})

describe('normalQuantile', () => {
  it('inverts normalCdf', () => {
    for (const p of [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95]) {
      expect(normalCdf(normalQuantile(p))).toBeCloseTo(p, 3)
    }
  })

  it('gives the 1.2816 multiplier used for the published 80% interval', () => {
    expect(normalQuantile(0.9)).toBeCloseTo(1.2816, 3)
  })
})

describe('quantile', () => {
  it('interpolates between sorted values', () => {
    const sorted = [10, 20, 30, 40, 50]
    expect(quantile(sorted, 0)).toBe(10)
    expect(quantile(sorted, 0.5)).toBe(30)
    expect(quantile(sorted, 1)).toBe(50)
  })
})

describe('createRng', () => {
  it('is deterministic for a given seed, so displayed probabilities never drift', () => {
    const a = createRng(42)
    const b = createRng(42)
    const first = Array.from({ length: 20 }, () => a())
    const second = Array.from({ length: 20 }, () => b())
    expect(first).toEqual(second)
  })

  it('produces values inside the unit interval', () => {
    const rng = createRng(7)
    for (let i = 0; i < 500; i += 1) {
      const value = rng()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})
