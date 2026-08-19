/**
 * forecaster — Holt's double-exponential smoothing (level + trend).
 *
 * Why this and not an LSTM: it's deterministic, needs no training data, runs in
 * microseconds, and — crucially — is explainable. It tracks a smoothed *level*
 * and *trend* for a series (e.g. a zone's density each tick) and projects them
 * forward to answer the one question that matters for prevention:
 *
 *     "at the current rate, how many seconds until this crosses critical?"
 *
 * That `secondsToThreshold` is the seed of the "~9 minutes before" alert.
 */

export class Holt {
  /**
   * @param {number} alpha  level smoothing (0..1) — higher = more reactive
   * @param {number} beta   trend smoothing (0..1)
   */
  constructor({ alpha = 0.4, beta = 0.2 } = {}) {
    this.alpha = alpha;
    this.beta = beta;
    this.level = null; // smoothed current value
    this.trend = 0; // smoothed change per step
    this.n = 0;
  }

  /** Feed one observation; returns the updated { level, trend }. */
  update(value) {
    if (!Number.isFinite(value)) return { level: this.level, trend: this.trend };
    if (this.level === null) {
      this.level = value;
      this.trend = 0;
    } else {
      const prevLevel = this.level;
      this.level = this.alpha * value + (1 - this.alpha) * (this.level + this.trend);
      this.trend = this.beta * (this.level - prevLevel) + (1 - this.beta) * this.trend;
    }
    this.n += 1;
    return { level: this.level, trend: this.trend };
  }

  /** Projected value `steps` ahead. */
  forecast(steps = 1) {
    if (this.level === null) return null;
    return this.level + steps * this.trend;
  }

  /**
   * Seconds until the series is projected to reach `threshold`, given how many
   * seconds each step represents.
   *   - already at/above threshold → 0
   *   - flat or falling            → Infinity (no imminent crossing)
   */
  secondsToThreshold(threshold, stepSeconds = 1) {
    if (this.level === null) return Infinity;
    if (this.level >= threshold) return 0;
    if (this.trend <= 1e-9) return Infinity;
    const steps = (threshold - this.level) / this.trend;
    return steps * stepSeconds;
  }

  get ready() {
    return this.n >= 3; // needs a few points before the trend is meaningful
  }
}

/** Convenience factory. */
export const makeForecaster = (opts) => new Holt(opts);
