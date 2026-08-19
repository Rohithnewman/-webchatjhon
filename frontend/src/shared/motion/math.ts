/**
 * Small pure helpers shared by every motion consumer.
 *
 * Deliberately dependency-free and allocation-free in the hot path: these run
 * once per animated property per frame, so nothing here may build objects.
 */

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const clamp01 = (value: number) => clamp(value, 0, 1);

export const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/** Normalised, clamped position of `value` inside [from, to]. */
export const progress = (value: number, from: number, to: number) =>
  to === from ? 0 : clamp01((value - from) / (to - from));

/** Ramps 0 -> 1 -> 0 across [from, to]. Used for "notice it, then settle" beats. */
export const pulse = (value: number, from: number, to: number) => {
  const p = progress(value, from, to);
  return Math.sin(p * Math.PI);
};

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack = (t: number) => {
  const c1 = 1.24;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
/** Overshoot-free settle used when a card lands and must stay readable. */
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);

/** Quadratic bezier — the curved trajectory every travelling element follows. */
export const bezierX = (a: number, c: number, b: number, t: number) => {
  const inv = 1 - t;
  return inv * inv * a + 2 * inv * t * c + t * t * b;
};

/** Tangent angle (deg) of a quadratic bezier, for banking an element into its path. */
export const bezierAngle = (
  ax: number,
  ay: number,
  cx: number,
  cy: number,
  bx: number,
  by: number,
  t: number,
) => {
  const inv = 1 - t;
  const dx = 2 * inv * (cx - ax) + 2 * t * (bx - cx);
  const dy = 2 * inv * (cy - ay) + 2 * t * (by - cy);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
};

/** Rounds to a fixed step so per-frame style strings stay cache-friendly. */
export const quantise = (value: number, step = 0.01) => Math.round(value / step) * step;
