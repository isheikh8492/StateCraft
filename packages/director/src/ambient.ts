import { roll, type World } from '@statecraft/engine';
import type { Size } from '@statecraft/models';

/**
 * The world's own noise when no model is writing events: strikes, outages, rallies, floods.
 * Each day's dice decide whether something happens and what; the state of the country tilts
 * the odds. The wording is generic on purpose and names no real person. Effects stay inside
 * the limits set for events outside the catalogue.
 */
export interface AmbientEvent {
  kind: string;
  size: Size;
  summary: string;
  place?: string;
  picks: Record<string, number>;
}

interface Entry {
  kind: string;
  size: Size;
  /** How likely, given the world. Zero rules it out. */
  weight: (ctx: Context) => number;
  /** `{region}` is replaced by the name of the place it happens. */
  text: string;
  where?: 'any' | 'restive' | 'insurgent';
  picks?: (regionId: string) => Record<string, number>;
}

interface Context {
  world: World;
  month: number;
  priceGap: number;
  coldCities: boolean;
}

const DAILY_CHANCE = 0.11;

const DECK: readonly Entry[] = [
  {
    kind: 'weather',
    size: 'colour',
    weight: () => 2,
    text: 'Unseasonal weather disrupted flights and road traffic in {region} for a day.',
    where: 'any',
  },
  {
    kind: 'sport',
    size: 'colour',
    weight: () => 2,
    text: 'The national cricket side won a closely fought match; crowds celebrated late into the night.',
  },
  {
    kind: 'media',
    size: 'colour',
    weight: ({ priceGap }) => 1 + priceGap,
    text: 'A television debate on the cost of living drew an unusually large audience.',
  },
  {
    kind: 'economy',
    size: 'minor',
    weight: () => 1.5,
    text: 'Remittances from workers abroad came in above the forecast for the month.',
  },
  {
    kind: 'outage',
    size: 'minor',
    weight: ({ month }) => (month >= 5 && month <= 8 ? 3 : 1),
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
    kind: 'prices',
    size: 'minor',
    weight: ({ priceGap }) => priceGap * 2,
    text: 'Flour and cooking oil prices rose again in the main city markets.',
    picks: () => ({ inflation: 0.2, 'approval.urban_poor': -1 }),
  },
  {
    kind: 'rally',
    size: 'minor',
    weight: ({ coldCities }) => (coldCities ? 3 : 1),
    text: 'Opposition parties held a rally in {region}; it passed off without violence.',
    where: 'restive',
    picks: (r) => ({ [`grievance.${r}`]: 1 }),
  },
  {
    kind: 'scandal',
    size: 'minor',
    weight: () => 1,
    text: 'A newspaper reported irregularities in a provincial procurement contract; an inquiry was ordered.',
    picks: () => ({ 'approval.urban_middle': -1 }),
  },
  {
    kind: 'attack',
    size: 'significant',
    weight: ({ world }) => (world.regions.some((r) => r.stage === 'insurgency') ? 1.6 : 0),
    text: 'Militants attacked a security post in {region}; several soldiers were killed.',
    where: 'insurgent',
    picks: (r) => ({ [`grievance.${r}`]: 2, 'approval.security': -1 }),
  },
  {
    kind: 'flood',
    size: 'significant',
    weight: ({ month }) => (month >= 7 && month <= 9 ? 1.5 : 0),
    text: 'Monsoon floods displaced thousands of people in {region} and cut several roads.',
    where: 'any',
    picks: (r) => ({ [`grievance.${r}`]: 3, growth: -0.1 }),
  },
  {
    kind: 'strike',
    size: 'significant',
    weight: ({ priceGap }) => (priceGap > 3 ? 1 : 0),
    text: 'A strike by goods transporters over fuel prices disrupted deliveries across the country for three days.',
    picks: () => ({ growth: -0.1, 'grievance.all': 1 }),
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

/** At most one event for the world's current day. `allowSignificant` enforces the surprise budget. */
export function ambientEvent(
  world: World,
  date: string,
  allowSignificant: boolean,
): AmbientEvent | undefined {
  const key = `ambient:${world.day}`;
  if (roll(world.seed, key) >= DAILY_CHANCE) return undefined;
  const urban = world.groups.filter((g) =>
    g.tags.some((t) => t === 'urban_poor' || t === 'urban_middle'),
  );
  const ctx: Context = {
    world,
    month: Number(date.slice(5, 7)),
    priceGap: Math.max(0, world.economy.inflation - world.economy.inflationAnchor),
    coldCities:
      urban.length > 0 && urban.reduce((sum, g) => sum + g.approval, 0) / urban.length < 35,
  };
  const deck = DECK.filter((e) => allowSignificant || e.size !== 'significant');
  const entry = pick(
    deck,
    deck.map((e) => e.weight(ctx)),
    roll(world.seed, `${key}:what`),
  );
  if (!entry) return undefined;

  let place: string | undefined;
  if (entry.where) {
    const pool =
      entry.where === 'insurgent'
        ? world.regions.filter((r) => r.stage === 'insurgency')
        : world.regions;
    const weights = pool.map((r) =>
      entry.where === 'restive' ? 5 + r.unrest : entry.where === 'any' ? r.population : 1,
    );
    place = pick(pool, weights, roll(world.seed, `${key}:where`))?.id;
    if (!place) return undefined;
  }
  const name = world.regions.find((r) => r.id === place)?.name ?? '';
  return {
    kind: entry.kind,
    size: entry.size,
    summary: entry.text.replace('{region}', name),
    ...(place ? { place } : {}),
    picks: entry.picks?.(place ?? '') ?? {},
  };
}
