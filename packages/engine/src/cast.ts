import type { Scenario } from './state.ts';

/**
 * Who an order touches. This is a rule, not a model's guess, so that nobody who should
 * answer is forgotten (REQ-ACT-20).
 */
export type CastEntry = Scenario['cast'][number];

export interface OrderShape {
  instrument: string;
  authority: string;
  region?: string | undefined;
}

export interface Touched {
  actor: CastEntry;
  score: number;
}

/** Everyone the order touches, most strongly touched first. Advisors answer questions, not orders. */
export function touchedBy(cast: readonly CastEntry[], order: OrderShape): Touched[] {
  const touched: Touched[] = [];
  for (const actor of cast) {
    if (actor.kind === 'advisor') continue;
    let score = 0;
    if (order.region !== undefined && actor.cares.regions.includes(order.region)) score += 3;
    if (actor.cares.instruments.includes(order.instrument)) score += 2;
    if (actor.cares.authorities.includes(order.authority)) score += 1;
    // An actor tied to one place does not answer an order aimed at another.
    if (
      order.region !== undefined &&
      actor.cares.regions.length > 0 &&
      !actor.cares.regions.includes(order.region)
    )
      score -= 2;
    if (score >= 2) touched.push({ actor, score });
  }
  return touched.sort((a, b) => b.score - a.score);
}
