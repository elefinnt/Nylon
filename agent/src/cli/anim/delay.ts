import { isAnimationEnabled } from "../tty.js";

/**
 * Pause for `ms` milliseconds. Resolves on the next macrotask when
 * animations are disabled (CI / NO_COLOR / piped stdout) so the
 * mock flow finishes instantly without sleeping.
 */
export function sleep(ms: number): Promise<void> {
  if (!isAnimationEnabled() || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sleep for a random duration between `min` and `max` ms. Useful for
 * simulated work where uniform timing would feel mechanical.
 */
export function jitter(min: number, max: number): Promise<void> {
  if (!isAnimationEnabled()) return Promise.resolve();
  const span = Math.max(0, max - min);
  return sleep(min + Math.random() * span);
}
