/** Small numeric helpers shared by the forecasting modules. Pure and testable. */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function round(value: number, dp = 1): number {
  const factor = 10 ** dp
  return Math.round(value * factor) / factor
}

/**
 * Empirical percentile of `value` within `population`, 0-100.
 *
 * Uses the midpoint of the below and below-or-equal ranks so that ties land in
 * the middle of the band they occupy rather than all at its top or bottom.
 */
export function percentileRank(value: number, population: number[]): number {
  if (population.length === 0) return 50
  if (population.length === 1) return 50
  let below = 0
  let equal = 0
  for (const p of population) {
    if (p < value) below += 1
    else if (p === value) equal += 1
  }
  return ((below + equal / 2) / population.length) * 100
}

export function quantile(sortedValues: number[], q: number): number {
  if (sortedValues.length === 0) return 0
  if (sortedValues.length === 1) return sortedValues[0]
  const pos = clamp(q, 0, 1) * (sortedValues.length - 1)
  const lower = Math.floor(pos)
  const upper = Math.ceil(pos)
  if (lower === upper) return sortedValues[lower]
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (pos - lower)
}

/**
 * Standard normal CDF via the Abramowitz & Stegun 7.1.26 error-function
 * approximation. Accurate to ~1e-7, which is far beyond what a model this
 * coarse can justify, but it keeps probabilities smooth and monotonic.
 */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x)
  return 0.5 * (1 + sign * erf)
}

/** Inverse standard normal CDF (Acklam's rational approximation). */
export function normalQuantile(p: number): number {
  const pp = clamp(p, 1e-9, 1 - 1e-9)
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const plow = 0.02425

  if (pp < plow) {
    const q = Math.sqrt(-2 * Math.log(pp))
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    )
  }
  if (pp > 1 - plow) {
    const q = Math.sqrt(-2 * Math.log(1 - pp))
    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    )
  }
  const q = pp - 0.5
  const r = q * q
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  )
}

/**
 * Deterministic PRNG (mulberry32). The whole app must render identically on
 * every load, otherwise a "probability" would change while the user watched it.
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Box-Muller normal sample drawn from a supplied uniform generator. */
export function sampleNormal(rng: () => number, mu: number, sigma: number): number {
  const u1 = Math.max(rng(), 1e-12)
  const u2 = rng()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return mu + sigma * z
}

/**
 * Round a set of fractions to integer percentages that sum to exactly 100,
 * using the largest-remainder method.
 *
 * Naive rounding of three probabilities frequently yields 99 or 101, and a
 * product that claims its probabilities sum to 100% must actually deliver that.
 */
export function roundToHundred(fractions: number[]): number[] {
  const total = fractions.reduce((a, b) => a + b, 0)
  if (total <= 0) {
    const even = Math.floor(100 / fractions.length)
    const result = fractions.map(() => even)
    result[0] += 100 - even * fractions.length
    return result
  }
  const scaled = fractions.map((f) => (f / total) * 100)
  const floors = scaled.map(Math.floor)
  let remainder = 100 - floors.reduce((a, b) => a + b, 0)
  const order = scaled
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index)
  const result = [...floors]
  for (const { index } of order) {
    if (remainder <= 0) break
    result[index] += 1
    remainder -= 1
  }
  return result
}
