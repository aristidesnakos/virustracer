/**
 * `count` evenly spaced axis ticks from `min` to `max`, with no value repeated.
 * With a single reading min === max, and the naive list would repeat one tick (and its
 * React key) `count` times; this returns just that one.
 */
export function evenTicks(min: number, max: number, count: number): number[] {
  if (count < 2 || min === max) return [Math.round(min)];
  return [...new Set(Array.from({ length: count }, (_, i) => Math.round(min + ((max - min) * i) / (count - 1))))];
}
