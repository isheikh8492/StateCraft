import type { CastEntry } from './cast.ts';
import { clamp } from './state.ts';

/**
 * How an actor stands toward the player, as a number the player never sees (-100 to 100).
 * It starts from the scenario and moves only through recorded causes: orders the actor
 * likes or dislikes, undertakings given in conversation, and whether those were kept.
 * The sizes are placeholders until calibration.
 */
export const STANDING = {
  start: { hostile: -60, wary: -20, neutral: 0, friendly: 50 },
  liked: 8,
  disliked: -10,
  /** Credit given when the player makes an undertaking the actor values. */
  undertaking: 6,
  kept: 5,
  /** A broken word costs more than a kept one earns: losses count double. */
  broken: -14,
  threat: -6,
  /** Days the player has to make good on an undertaking. */
  graceDays: 45,
} as const;

export type Stance = CastEntry['stance'];

export function stanceOf(standing: number): Stance {
  if (standing < -40) return 'hostile';
  if (standing < -8) return 'wary';
  if (standing < 30) return 'neutral';
  return 'friendly';
}

export const clampStanding = (value: number) => clamp(value, -100, 100);

/** What one order does to one actor's standing: nothing unless the actor has a view on it. */
export function orderEffect(actor: CastEntry, instrument: string): number {
  if (actor.likes.includes(instrument)) return STANDING.liked;
  if (actor.dislikes.includes(instrument)) return STANDING.disliked;
  return 0;
}
