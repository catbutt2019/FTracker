import type { MetricGroup } from '@/types/domain'

export interface MetricDefinition {
  key: string
  label: string
  /** Shown in tooltips. Plain language, no jargon left unexplained. */
  description: string
  unit: string
  higherIsBetter: boolean
  /** Relative contribution inside the metric group. Weights need not sum to 1. */
  weight: number
}

/**
 * Positions are deliberately NOT scored on a shared metric set. A centre-back
 * and a striker doing their jobs well look nothing alike in the data, so
 * pooling them would produce a score that flatters whichever role happens to
 * accumulate more of the pooled metrics.
 */
export const METRIC_DEFINITIONS: Record<MetricGroup, MetricDefinition[]> = {
  forward: [
    {
      key: 'nonPenaltyGoals90',
      label: 'Non-penalty goals',
      description:
        'Goals scored per 90 minutes, excluding penalties. Penalties are removed because winning and taking them depends heavily on team role rather than finishing ability.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.24,
    },
    {
      key: 'expectedGoals90',
      label: 'Expected goals (xG)',
      description:
        'The number of goals an average player would be expected to score from the same chances, per 90 minutes. Measures the quality of positions a player gets into.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.22,
    },
    {
      key: 'shots90',
      label: 'Shots',
      description: 'Attempts on goal per 90 minutes, a proxy for shooting volume and intent.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.12,
    },
    {
      key: 'boxTouches90',
      label: 'Touches in the box',
      description:
        'Touches inside the opposition penalty area per 90 minutes. A repeatable indicator of dangerous positioning.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.15,
    },
    {
      key: 'chanceConversion',
      label: 'Chance conversion',
      description: 'Share of shots that become goals. Noisy over small samples, so weighted lightly.',
      unit: '%',
      higherIsBetter: true,
      weight: 0.12,
    },
    {
      key: 'goalInvolvement90',
      label: 'Goal involvement',
      description:
        'Goals plus assists per 90 minutes (or per appearance when minutes are unavailable). A simple, always-available productivity signal used alongside the advanced metrics above, especially for seasons where only box-score data exists.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.15,
    },
  ],
  creator: [
    {
      key: 'expectedAssists90',
      label: 'Expected assists (xA)',
      description:
        'The number of assists an average player would be expected to record from the same passes, per 90 minutes.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.24,
    },
    {
      key: 'progressiveCarries90',
      label: 'Progressive carries',
      description:
        'Carries that move the ball meaningfully towards the opposition goal, per 90 minutes.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.2,
    },
    {
      key: 'chancesCreated90',
      label: 'Chances created',
      description: 'Passes leading directly to a shot, per 90 minutes.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.2,
    },
    {
      key: 'finalThirdEntries90',
      label: 'Final-third involvement',
      description:
        'Touches and receptions in the attacking third per 90 minutes. Indicates how often a player is in the area of the pitch where they can hurt an opponent.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.14,
    },
    {
      key: 'dribbleSuccess',
      label: 'Take-on success',
      description: 'Share of attempted dribbles past an opponent that succeed.',
      unit: '%',
      higherIsBetter: true,
      weight: 0.07,
    },
    {
      key: 'goalInvolvement90',
      label: 'Goal involvement',
      description:
        'Goals plus assists per 90 minutes (or per appearance when minutes are unavailable). A simple, always-available productivity signal used alongside the advanced metrics above, especially for seasons where only box-score data exists.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.15,
    },
  ],
  midfielder: [
    {
      key: 'progressivePasses90',
      label: 'Progressive passes',
      description:
        'Completed passes that move the ball significantly towards the opposition goal, per 90 minutes.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.23,
    },
    {
      key: 'passCompletion',
      label: 'Ball retention',
      description:
        'Share of attempted passes completed. Read alongside progressive passing, since safe sideways passing inflates it.',
      unit: '%',
      higherIsBetter: true,
      weight: 0.16,
    },
    {
      key: 'pressures90',
      label: 'Pressures',
      description: 'Occasions applying pressure to an opponent in possession, per 90 minutes.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.18,
    },
    {
      key: 'defensiveActions90',
      label: 'Tackles and interceptions',
      description: 'Combined successful tackles and interceptions per 90 minutes.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.2,
    },
    {
      key: 'possessionLost90',
      label: 'Possession lost',
      description:
        'Times the player concedes possession per 90 minutes. Lower is better, so this metric is inverted before scoring.',
      unit: 'per 90',
      higherIsBetter: false,
      weight: 0.13,
    },
    {
      key: 'goalInvolvement90',
      label: 'Goal involvement',
      description:
        'Goals plus assists per 90 minutes (or per appearance when minutes are unavailable). A simple, always-available productivity signal used alongside the advanced metrics above, especially for seasons where only box-score data exists.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.1,
    },
  ],
  defender: [
    {
      key: 'duelSuccess',
      label: 'Duel success',
      description: 'Share of ground duels won.',
      unit: '%',
      higherIsBetter: true,
      weight: 0.18,
    },
    {
      key: 'aerialSuccess',
      label: 'Aerial success',
      description: 'Share of aerial duels won.',
      unit: '%',
      higherIsBetter: true,
      weight: 0.14,
    },
    {
      key: 'interceptions90',
      label: 'Interceptions',
      // Blocks used to be added into this figure. They are published for only 3
      // of the 26 defenders in the research file, so the sum described 3 players
      // on one scale and 8 on another — and since a metric is ranked against
      // every other player's value for the same metric, the eight were compared
      // against numbers roughly twice the size of their own.
      description: 'Interceptions per 90 minutes.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.16,
    },
    {
      // Added because the research file publishes tackles per 90 for every
      // defender it publishes interceptions for, and leaving it unmapped meant
      // interceptions alone carried roughly 69% of the weighted score for
      // those players — the same renormalisation pathology described above
      // GOAL_INVOLVEMENT_SUPPLEMENTARY_ONLY in model/scoring.ts, one step out.
      // Three independent defensive-action rates are a far more stable read
      // than one.
      key: 'tackles90',
      label: 'Tackles',
      description: 'Tackles attempted per 90 minutes.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.14,
    },
    {
      // Weighted lowest of the three action rates, deliberately. Clearance
      // volume is partly a property of the team: a defender in a side that
      // sits deep will clear more without defending better. It is still a real
      // defensive action and it is genuinely available, so it earns a small
      // weight rather than being discarded for being imperfect.
      key: 'clearances90',
      label: 'Clearances',
      description:
        'Clearances per 90 minutes. Partly reflects how deep the team defends, so it is weighted lightly.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.1,
    },
    {
      key: 'progressiveDistance90',
      label: 'Ball progression',
      description:
        'Metres of forward progress created by carries and passes per 90 minutes, scaled to hundreds of metres.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.12,
    },
    {
      key: 'errors90',
      label: 'Errors leading to a shot',
      description:
        'Mistakes that directly concede a shooting opportunity, per 90 minutes. Lower is better, so this metric is inverted before scoring.',
      unit: 'per 90',
      higherIsBetter: false,
      weight: 0.12,
    },
    {
      key: 'goalInvolvement90',
      label: 'Goal involvement',
      description:
        'Goals plus assists per 90 minutes (or per appearance when minutes are unavailable). A small productivity signal — defenders rarely score or assist, but the occasional set-piece threat or overlapping full-back should count for something, and it is always available even when advanced data is missing.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.04,
    },
  ],
  goalkeeper: [
    {
      key: 'savePercentage',
      label: 'Save percentage',
      description: 'Share of shots on target saved.',
      unit: '%',
      higherIsBetter: true,
      weight: 0.24,
    },
    {
      key: 'goalsPrevented90',
      label: 'Goals prevented',
      description:
        'Goals conceded compared with the number an average keeper would concede from the same shots, per 90 minutes. Positive means better than average.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.32,
    },
    {
      key: 'crossesClaimed90',
      label: 'Crosses claimed',
      description: 'Crosses caught or punched clear per 90 minutes.',
      unit: 'per 90',
      higherIsBetter: true,
      weight: 0.16,
    },
    {
      key: 'passCompletion',
      label: 'Distribution accuracy',
      description: 'Share of attempted passes completed.',
      unit: '%',
      higherIsBetter: true,
      weight: 0.16,
    },
    {
      key: 'longPassAccuracy',
      label: 'Long distribution',
      description: 'Share of attempted long passes completed.',
      unit: '%',
      higherIsBetter: true,
      weight: 0.12,
    },
  ],
}

export function metricsFor(group: MetricGroup): MetricDefinition[] {
  return METRIC_DEFINITIONS[group]
}

export function totalWeight(group: MetricGroup): number {
  return metricsFor(group).reduce((sum, m) => sum + m.weight, 0)
}
