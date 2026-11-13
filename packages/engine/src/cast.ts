import { stanceOf } from './standing.ts';
import { nationalApproval, type Scenario, type World } from './state.ts';

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

/** A member of the cast with a reason to act without being asked, and how pressing it is. */
export interface Restless {
  actor: CastEntry;
  /** How likely this actor is to be the one who moves, against the others. */
  weight: number;
  /** Why, in a sentence the writer of the move is given. */
  reason: string;
  /** The place the move is about, if it has one. */
  region?: string;
}

/**
 * Who has a reason to move first. The world does not wait for the player: an armed group
 * fighting for a region, an opposition facing an unpopular government, a coalition partner
 * grown wary, a lender watching a crisis line, all act on their own. This is a rule, not a
 * model's guess: the engine says who is restless and why, from the state of the country and
 * each actor's standing; a model only writes what they then do (REQ-ACT-21).
 */
export function restless(
  cast: readonly CastEntry[],
  world: World,
  standing: (actorId: string) => number,
): Restless[] {
  const troubled = (ids: readonly string[]) =>
    world.regions.find(
      (r) => ids.includes(r.id) && (r.status !== 'held' || r.stage === 'insurgency'),
    ) ?? world.regions.find((r) => ids.includes(r.id) && r.stage !== 'calm');
  const worst =
    world.regions.find((r) => r.status !== 'held' || r.stage === 'insurgency') ??
    world.regions.find((r) => r.stage === 'riot');
  const approval = nationalApproval(world);
  const inflation = Math.round(world.economy.inflation * 10) / 10;
  const out: Restless[] = [];
  for (const actor of cast) {
    if (actor.kind === 'advisor') continue;
    const stance = stanceOf(standing(actor.id));
    const sour = stance === 'hostile' || stance === 'wary';
    const home = troubled(actor.cares.regions);
    const add = (weight: number, reason: string, region = home?.id ?? actor.cares.regions[0]) =>
      out.push({ actor, weight, reason, ...(region ? { region } : {}) });
    switch (actor.kind) {
      case 'militant':
        if (home) add(3, `It is fighting the state in ${home.name} and means to show its reach.`);
        else add(1, 'It wants to show that it is still a force.');
        break;
      case 'opposition':
        if (approval < 45)
          add(3, 'The government is unpopular and it means to press its advantage.');
        else add(1.5, 'It wants to keep the government under pressure.');
        break;
      case 'ally':
        if (sour)
          add(3, 'It sits in the coalition but has grown wary, and wants a price for staying.');
        else add(0.6, 'It wants more say in what the coalition does.');
        break;
      case 'business':
        if (inflation > 8)
          add(2, `Inflation is running at ${inflation}% and costs are squeezing its members.`);
        else if (world.economy.growth < 2) add(2, 'Growth is weak and its members are hurting.');
        else add(0.5, 'It wants the government to hear its members before the next budget.');
        break;
      case 'lender':
        if (world.flags.length > 0)
          add(2.5, 'The country has crossed a crisis line and its programme is at risk.');
        else add(0.5, 'It is reviewing how the programme is being carried out.');
        break;
      case 'religious':
      case 'province':
        if (home) add(2, `${home.name} is in a state of ${home.stage} and it must be seen to act.`);
        else if (sour) add(1.5, 'It is at odds with the government and wants that known.');
        else add(0.5, "It wants its concerns on the government's desk.");
        break;
      case 'military':
        if (sour) add(2, 'It has lost patience with how the government is handling security.');
        else if (worst)
          add(1.5, `It is fighting in ${worst.name} and wants the means to do it.`, worst.id);
        else add(0.3, 'It wants its needs kept in view.');
        break;
      default:
        if (stance === 'hostile') add(1.5, "It sees an opening in the country's difficulties.");
        else if (stance === 'wary') add(1, 'It distrusts the government and is testing it.');
        else add(0.5, 'It wants to protect its interests and its people in the country.');
    }
  }
  return out;
}
