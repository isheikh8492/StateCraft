import { roll, type Scenario, type World } from '@statecraft/engine';
import type { Size } from '@statecraft/models';

/**
 * What the world does on its own account, decided by the engine (decision record 0012).
 *
 * A model asked to invent a country's news writes monsoon floods in November and has an
 * armed group shelling a town in the wrong province: it is being trusted with facts. Here
 * the dice and the state of the country settle what kind of thing happens, where, on which
 * day, how much it matters and what it moves; a model is then asked only to word it. With no
 * model, the plain line in each entry is the news.
 */
export interface Happening {
  /** The key the judge files its wording under. */
  id: string;
  kind: string;
  size: Size;
  /** Days after the period starts. */
  inDays: number;
  /** A plain line saying what happened, used as written when no model words it. */
  gist: string;
  place?: string;
  /** The member of the cast it involves, if any. */
  actor?: string;
  picks: Record<string, number>;
  causes: string[];
}

type CastKind = Scenario['cast'][number]['kind'];

interface Entry {
  kind: string;
  size: Size;
  /** How likely, given the country. Zero rules it out. */
  weight: (ctx: Context) => number;
  /** `{region}` is the place, `{actor}` the member of the cast involved. */
  text: string;
  where?: 'any' | 'restive' | 'insurgent';
  /** A member of the cast of this kind is involved; with none in the cast, it cannot happen. */
  who?: CastKind;
  picks?: (regionId: string) => Record<string, number>;
}

interface Context {
  world: World;
  /** 1 to 12. Weather and harvests keep to the calendar. */
  month: number;
  priceGap: number;
  coldCities: boolean;
  fighting: boolean;
  crisis: boolean;
}

/** The chance, each day, that something of the world's own happens: about one a week. */
const DAILY_CHANCE = 0.15;
const between = (month: number, from: number, to: number) =>
  from <= to ? month >= from && month <= to : month >= from || month <= to;

const DECK: readonly Entry[] = [
  // ------------------------------------------------------------------ the calendar
  {
    kind: 'weather',
    size: 'colour',
    weight: ({ month }) => (between(month, 11, 1) ? 2.5 : 0),
    text: 'Thick smog closed motorways and schools across {region} for several days.',
    where: 'any',
  },
  {
    kind: 'weather',
    size: 'minor',
    weight: ({ month }) => (between(month, 5, 6) ? 2.5 : 0),
    text: 'A heatwave in {region} overwhelmed hospitals and pushed power demand past supply.',
    where: 'any',
    picks: (r) => ({ [`grievance.${r}`]: 1 }),
  },
  {
    kind: 'flood',
    size: 'significant',
    weight: ({ month }) => (between(month, 7, 9) ? 1.5 : 0),
    text: 'Monsoon floods displaced thousands of people in {region} and cut several roads.',
    where: 'any',
    picks: (r) => ({ [`grievance.${r}`]: 3, growth: -0.1 }),
  },
  {
    kind: 'weather',
    size: 'minor',
    weight: ({ month }) => (between(month, 12, 2) ? 1.5 : 0),
    text: 'Gas shortages in a cold spell left households in {region} without heating or cooking fuel.',
    where: 'any',
    picks: (r) => ({ [`grievance.${r}`]: 1 }),
  },
  {
    kind: 'harvest',
    size: 'colour',
    weight: ({ month }) => (between(month, 4, 5) ? 2 : 0),
    text: 'The wheat harvest in {region} came in close to the official target.',
    where: 'any',
  },
  // -------------------------------------------------------------- prices and work
  {
    kind: 'prices',
    size: 'minor',
    weight: ({ priceGap }) => priceGap * 2,
    text: 'Flour and cooking oil prices rose again in the main city markets.',
    picks: () => ({ inflation: 0.2, 'approval.urban_poor': -1 }),
  },
  {
    kind: 'outage',
    size: 'minor',
    weight: ({ month }) => (between(month, 5, 8) ? 3 : 1),
    text: 'A power breakdown left much of {region} without electricity for several hours.',
    where: 'any',
    picks: (r) => ({ [`grievance.${r}`]: 1 }),
  },
  {
    kind: 'strike',
    size: 'minor',
    weight: ({ priceGap }) => 1 + priceGap,
    text: 'Traders in {region} shut their shops for a day in protest at taxes and power bills.',
    where: 'any',
    picks: (r) => ({ [`grievance.${r}`]: 1.5, 'approval.business': -1 }),
  },
  {
    kind: 'strike',
    size: 'minor',
    weight: () => 1.2,
    text: 'Doctors at public hospitals in {region} stopped work over pay; emergency wards stayed open.',
    where: 'any',
    picks: (r) => ({ [`grievance.${r}`]: 1 }),
  },
  {
    kind: 'strike',
    size: 'significant',
    weight: ({ priceGap }) => (priceGap > 3 ? 1 : 0),
    text: 'A strike by goods transporters over fuel prices disrupted deliveries across the country for three days.',
    picks: () => ({ growth: -0.1, 'grievance.all': 1 }),
  },
  {
    kind: 'markets',
    size: 'minor',
    weight: ({ crisis, priceGap }) => (crisis ? 2.5 : 0.5 + priceGap / 4),
    text: 'The currency slid against the dollar and the stock index fell as investors pulled money out.',
    picks: () => ({ 'approval.business': -1 }),
  },
  {
    kind: 'economy',
    size: 'minor',
    weight: () => 1.2,
    text: 'Remittances from workers abroad came in above the forecast for the month.',
  },
  {
    kind: 'business',
    size: 'minor',
    weight: ({ priceGap }) => 0.8 + priceGap / 3,
    text: '{actor} said factories were cutting shifts and asked for relief on energy costs.',
    who: 'business',
  },
  {
    kind: 'lender',
    size: 'minor',
    weight: ({ crisis }) => (crisis ? 2 : 0.6),
    text: 'A mission from {actor} arrived to go through the accounts ahead of its next review.',
    who: 'lender',
  },
  // ------------------------------------------------------------- politics and law
  {
    kind: 'rally',
    size: 'minor',
    weight: ({ coldCities }) => (coldCities ? 3 : 1),
    text: '{actor} held a rally in {region}; it passed off without violence.',
    where: 'restive',
    who: 'opposition',
    picks: (r) => ({ [`grievance.${r}`]: 1 }),
  },
  {
    kind: 'legislature',
    size: 'minor',
    weight: () => 1,
    text: '{actor} walked out of the legislature, saying the government was ruling by decree.',
    who: 'opposition',
  },
  {
    kind: 'coalition',
    size: 'minor',
    weight: () => 0.8,
    text: 'Members of {actor} complained in public that their party was being taken for granted in the coalition.',
    who: 'ally',
  },
  {
    kind: 'court',
    size: 'minor',
    weight: () => 1,
    text: 'The highest court took up a petition challenging a recent government decision.',
  },
  {
    kind: 'scandal',
    size: 'minor',
    weight: () => 1,
    text: 'A newspaper reported irregularities in a provincial procurement contract; an inquiry was ordered.',
    picks: () => ({ 'approval.urban_middle': -1 }),
  },
  {
    kind: 'province',
    size: 'minor',
    weight: () => 0.9,
    text: '{actor} accused the federal government of holding back its share of revenue.',
    who: 'province',
  },
  {
    kind: 'sermon',
    size: 'minor',
    weight: () => 0.7,
    text: '{actor} criticised the government from the pulpit and called on its followers to stay alert.',
    who: 'religious',
  },
  // ---------------------------------------------------------- security and abroad
  {
    kind: 'attack',
    size: 'significant',
    weight: ({ fighting }) => (fighting ? 1.6 : 0),
    text: '{actor} attacked a security post in {region}; several soldiers were killed.',
    where: 'insurgent',
    who: 'militant',
    picks: (r) => ({ [`grievance.${r}`]: 2, 'approval.security': -1 }),
  },
  {
    kind: 'attack',
    size: 'minor',
    weight: ({ fighting }) => (fighting ? 1.5 : 0),
    text: 'A roadside bomb in {region} damaged a convoy; nobody claimed it.',
    where: 'insurgent',
    picks: (r) => ({ [`grievance.${r}`]: 1 }),
  },
  {
    kind: 'security',
    size: 'minor',
    weight: ({ fighting }) => (fighting ? 1.2 : 0.3),
    text: 'Security forces said they had arrested a group of suspected militants in raids in {region}.',
    where: 'restive',
  },
  {
    kind: 'border',
    size: 'minor',
    weight: () => 0.8,
    text: 'Border guards and forces of {actor} exchanged fire at a crossing; both sides blamed the other.',
    who: 'foreign',
  },
  {
    kind: 'diplomacy',
    size: 'colour',
    weight: () => 1,
    text: 'An envoy of {actor} met officials in the capital; neither side said what was discussed.',
    who: 'foreign',
  },
  // -------------------------------------------------------------------- the rest
  {
    kind: 'sport',
    size: 'colour',
    weight: () => 1.2,
    text: 'The national cricket side won a closely fought match; crowds celebrated late into the night.',
  },
  {
    kind: 'media',
    size: 'colour',
    weight: ({ priceGap }) => 0.8 + priceGap,
    text: 'A television debate on the cost of living drew an unusually large audience.',
  },
];

function pick<T>(items: readonly T[], weights: readonly number[], r: number): T | undefined {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return undefined;
  let mark = r * total;
  for (const [i, item] of items.entries()) {
    mark -= weights[i] ?? 0;
    if (mark < 0) return item;
  }
  return items.at(-1);
}

const monthOf = (startDate: string, day: number) =>
  new Date(Date.parse(`${startDate}T00:00:00Z`) + day * 86_400_000).getUTCMonth() + 1;

/**
 * Everything of the world's own that will happen over a stretch of days, drawn from the
 * state of the country as the stretch begins. Each day has its own dice, so the same
 * campaign draws the same things for the same stretch every time.
 */
export function forecast(
  world: World,
  cast: Scenario['cast'],
  fromDay: number,
  days: number,
): Happening[] {
  const urban = world.groups.filter((g) =>
    g.tags.some((t) => t === 'urban_poor' || t === 'urban_middle'),
  );
  const base = {
    world,
    priceGap: Math.max(0, world.economy.inflation - world.economy.inflationAnchor),
    coldCities:
      urban.length > 0 && urban.reduce((sum, g) => sum + g.approval, 0) / urban.length < 35,
    fighting: world.regions.some((r) => r.stage === 'insurgency' || r.status !== 'held'),
    crisis: world.flags.length > 0,
  };
  const out: Happening[] = [];
  // The same thing does not happen twice in one stretch, and a grave thing not too often.
  const used = new Set<Entry>();
  let significant = 1 + Math.floor(days / 14);
  for (let i = 1; i <= days; i++) {
    const day = fromDay + i;
    const key = `happening:${day}`;
    if (roll(world.seed, key) >= DAILY_CHANCE) continue;
    const ctx: Context = { ...base, month: monthOf(world.startDate, day) };
    const deck = DECK.filter(
      (e) =>
        !used.has(e) &&
        (significant > 0 || e.size !== 'significant') &&
        (e.who === undefined || cast.some((c) => c.kind === e.who)),
    );
    const entry = pick(
      deck,
      deck.map((e) => e.weight(ctx)),
      roll(world.seed, `${key}:what`),
    );
    if (!entry) continue;

    const actors = entry.who ? cast.filter((c) => c.kind === entry.who) : [];
    const actor = pick(
      actors,
      actors.map(() => 1),
      roll(world.seed, `${key}:who`),
    );
    let place: string | undefined;
    if (entry.where) {
      // Somebody tied to a place acts there; otherwise the kind of place decides.
      const home = actor?.cares.regions ?? [];
      const pool = (
        entry.where === 'insurgent'
          ? world.regions.filter((r) => r.stage === 'insurgency' || r.status !== 'held')
          : world.regions
      ).filter((r) => home.length === 0 || home.includes(r.id));
      const weights = pool.map((r) =>
        entry.where === 'restive' ? 5 + r.unrest : entry.where === 'any' ? r.population : 1,
      );
      place = pick(pool, weights, roll(world.seed, `${key}:where`))?.id;
      if (!place) continue;
    }
    used.add(entry);
    if (entry.size === 'significant') significant--;
    const region = world.regions.find((r) => r.id === place)?.name ?? '';
    out.push({
      id: `h${out.length + 1}`,
      kind: entry.kind,
      size: entry.size,
      inDays: i,
      gist: entry.text.replace('{region}', region).replace('{actor}', actor?.name ?? ''),
      ...(place ? { place } : {}),
      ...(actor ? { actor: actor.id } : {}),
      picks: entry.picks?.(place ?? '') ?? {},
      causes: actor ? [`actor:${actor.id}`] : ['world'],
    });
  }
  return out;
}

/**
 * What an order stirs up among ordinary people in the days after it: decided by the dice and
 * by how the order landed, worded by a model. An order that backfires always stirs something.
 */
export function aftershock(
  world: World,
  order: { id: string; title: string; region?: string | undefined; landed: string },
  days: number,
  n: number,
): Happening | undefined {
  if (days < 1 || order.landed === 'stalled') return undefined;
  const backfired = order.landed === 'backfired';
  if (!backfired && roll(world.seed, `aftershock:${order.id}`) >= 0.5) return undefined;
  const pool = world.regions;
  const place =
    order.region ??
    pick(
      pool,
      pool.map((r) => r.population),
      roll(world.seed, `aftershock:${order.id}:where`),
    )?.id;
  const region = world.regions.find((r) => r.id === place)?.name ?? 'the country';
  return {
    id: `o${n}`,
    kind: 'public',
    size: backfired ? 'significant' : 'minor',
    inDays: Math.min(days, 1 + Math.floor(roll(world.seed, `aftershock:${order.id}:when`) * 6)),
    gist: backfired
      ? `Crowds in ${region} turned out against the order: ${order.title}.`
      : `People in ${region} made their feelings known about the order: ${order.title}.`,
    ...(place ? { place } : {}),
    picks: backfired && place ? { [`grievance.${place}`]: 1 } : {},
    causes: [order.id],
  };
}
