import { type Effect, fiscal, offsetsOn, type World } from '@statecraft/engine';

/** Dates, labels and the words that stand in for hidden numbers. */

export function dateOf(startDate: string, day: number): string {
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + day);
  return date.toISOString().slice(0, 10);
}

export function dayOf(startDate: string, date: string): number {
  return Math.round(
    (Date.parse(`${date.slice(0, 10)}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) /
      86_400_000,
  );
}

export const monthOf = (date: string) => date.slice(0, 7);

export function monthName(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function mood(approval: number): string {
  if (approval < 20) return 'hostile';
  if (approval < 35) return 'cold';
  if (approval < 50) return 'divided';
  if (approval < 65) return 'warm';
  return 'loyal';
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

const PLAIN: Readonly<Record<string, [string, string]>> = {
  revenue: ['Government revenue', '% of GDP'],
  growth: ['Growth', '%'],
  inflation: ['Inflation', '%'],
  baseRate: ['Policy rate', '%'],
  externalBalance: ['Foreign reserves', 'months of imports'],
};

const TAGS: Readonly<Record<string, string>> = {
  urban_poor: 'the urban poor',
  urban_middle: 'the urban middle class',
  rural: 'farmers and rural workers',
  business: 'business',
  security: 'the military and state employees',
  religious: 'religious conservatives',
  periphery: 'the periphery',
};

export function labelOf(
  world: World,
  on: string,
): { label: string; unit: string; hidden: boolean } {
  const plain = PLAIN[on];
  if (plain) return { label: plain[0], unit: plain[1], hidden: false };
  const [kind, scope = ''] = on.split('.');
  const region = world.regions.find((r) => r.id === scope)?.name ?? 'the country';
  if (kind === 'spending')
    return {
      label: `${scope[0]?.toUpperCase()}${scope.slice(1)} spending`,
      unit: '% of GDP',
      hidden: false,
    };
  if (kind === 'approval') {
    const group = world.groups.find((g) => g.id === scope)?.name.toLowerCase();
    return { label: `Standing with ${group ?? TAGS[scope] ?? scope}`, unit: '', hidden: true };
  }
  if (kind === 'grievance') return { label: `Grievance in ${region}`, unit: '', hidden: true };
  if (kind === 'repression') return { label: `Force used in ${region}`, unit: '', hidden: true };
  return { label: `State capacity in ${region}`, unit: '', hidden: true };
}

/** The current value behind a target: a number for the economy, a word for people and places. */
export function readTarget(world: World, on: string): number | string {
  const e = world.economy;
  const off = offsetsOn(world, world.day);
  const [kind, scope = ''] = on.split('.');
  switch (kind) {
    case 'revenue':
      return round1(e.revenue + (off.get('revenue') ?? 0));
    case 'growth':
      return round1(e.growth);
    case 'inflation':
      return round1(e.inflation);
    case 'baseRate':
      return round1(e.baseRate + (off.get('baseRate') ?? 0));
    case 'externalBalance':
      return round1(e.reservesMonths);
    case 'spending':
      return Math.max(
        0,
        round1((e.spending[scope as keyof typeof e.spending] ?? 0) + (off.get(on) ?? 0)),
      );
    case 'approval': {
      const groups = world.groups.filter(
        (g) => g.id === scope || (g.tags as string[]).includes(scope),
      );
      if (groups.length === 0) return 'not present';
      return mood(groups.reduce((sum, g) => sum + g.approval, 0) / groups.length);
    }
    default: {
      const regions = world.regions.filter((r) => scope === 'all' || r.id === scope);
      const worst = regions.reduce((max, r) => Math.max(max, r.unrest), 0);
      return worst >= 75 ? 'insurgency' : worst >= 50 ? 'riot' : worst >= 25 ? 'protest' : 'calm';
    }
  }
}

export function describeChange(world: World, effect: Effect): string {
  const { unit, hidden } = labelOf(world, effect.on);
  if (!hidden)
    return `${effect.amount > 0 ? '+' : ''}${round1(effect.amount)} ${unit === '%' ? 'points' : unit}`;
  const kind = effect.on.split('.')[0];
  if (kind === 'approval') return effect.amount >= 0 ? 'improves' : 'worsens';
  if (kind === 'grievance') return effect.amount >= 0 ? 'rises' : 'eases';
  if (kind === 'repression') return 'applied once';
  return effect.amount >= 0 ? 'strengthens' : 'weakens';
}

export function economyRows(world: World) {
  const e = world.economy;
  const f = fiscal(world, offsetsOn(world, world.day));
  return [
    { label: 'Growth', value: e.growth, unit: '%', digits: 1 },
    { label: 'Inflation', value: e.inflation, unit: '%', digits: 1 },
    { label: 'Unemployment', value: e.unemployment, unit: '%', digits: 1 },
    { label: 'Budget deficit', value: f.deficit, unit: '% of GDP', digits: 1 },
    { label: 'Public debt', value: e.debt, unit: '% of GDP', digits: 1 },
    {
      label: 'Policy rate',
      value: e.baseRate + (offsetsOn(world, world.day).get('baseRate') ?? 0),
      unit: '%',
      digits: 1,
    },
    { label: 'Foreign reserves', value: e.reservesMonths, unit: 'months of imports', digits: 1 },
    { label: 'Economy', value: e.gdpUsdBn, unit: 'bn USD', digits: 0 },
  ];
}
