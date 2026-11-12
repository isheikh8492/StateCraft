/**
 * The deterministic core. This package does no I/O, reads no clock, and uses no randomness
 * except the seeded generator below. Same inputs, same outputs.
 */
export { roll, rollInt } from './rng.ts';

/** Campaigns are pinned to the engine version they started on. */
export const ENGINE_VERSION = '0.1.0';
