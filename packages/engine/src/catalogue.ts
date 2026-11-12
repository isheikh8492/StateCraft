import { isValidTarget } from './effects.ts';
import { type Effect, EngineRuleError, type World } from './state.ts';

/**
 * The policy catalogue: for each instrument, the variables it may touch, how far, and when.
 * The adjudicating model picks a value inside each range; it can touch nothing else
 * (REQ-ENG-12). Ranges marked `sourced: false` are placeholders awaiting calibration.
 */
export interface InstrumentEffect {
  /** A target; `{region}` is filled in for instruments aimed at one region. */
  on: string;
  range: readonly [number, number];
  unit: string;
  lagDays: number;
  /** How long the effect lasts; left out means it stays. */
  lastsDays?: number;
  /** For a range that spans zero: this effect moves against the policy's direction. */
  against?: boolean;
  sourced: boolean;
}

export const AUTHORITIES = ['budget', 'executive', 'monetary', 'security'] as const;
export type Authority = (typeof AUTHORITIES)[number];

/** Days between announcing a policy and its taking legal effect. Placeholders. */
export const PROCEDURE_DAYS: Readonly<Record<Authority, number>> = {
  budget: 14,
  executive: 2,
  monetary: 1,
  security: 3,
};

export type Scale = 'small' | 'medium' | 'large';
export type Direction = 'raise' | 'lower';

export interface Instrument {
  id: string;
  title: string;
  /** The procedure the policy must pass. */
  authority: Authority;
  needsRegion?: boolean;
  effects: readonly InstrumentEffect[];
}

const fx = (
  on: string,
  min: number,
  max: number,
  unit: string,
  lagDays: number,
  lastsDays?: number,
): InstrumentEffect => ({
  on,
  range: [min, max],
  unit,
  lagDays,
  ...(lastsDays === undefined ? {} : { lastsDays }),
  sourced: false,
});

export const CATALOGUE: readonly Instrument[] = [
  {
    id: 'fuel_subsidy_cut',
    title: 'Cut fuel or power subsidies',
    authority: 'budget',
    effects: [
      fx('spending.subsidies', -2, -0.1, '% GDP', 0),
      fx('inflation', 0.2, 3, 'points', 14, 180),
      fx('approval.urban_poor', -15, -2, 'points', 7, 365),
      fx('approval.urban_middle', -8, 0, 'points', 7, 365),
      fx('grievance.all', 1, 20, 'points', 7, 180),
    ],
  },
  {
    id: 'subsidy_increase',
    title: 'Raise fuel, power or food subsidies',
    authority: 'budget',
    effects: [
      fx('spending.subsidies', 0.1, 2, '% GDP', 0),
      fx('inflation', -2, -0.1, 'points', 14, 180),
      fx('approval.urban_poor', 1, 8, 'points', 14, 365),
      fx('grievance.all', -10, -0.5, 'points', 14, 180),
    ],
  },
  {
    id: 'sales_tax_rise',
    title: 'Raise sales or consumption tax',
    authority: 'budget',
    effects: [
      fx('revenue', 0.1, 1.5, '% GDP', 30),
      fx('inflation', 0.2, 2, 'points', 30, 365),
      fx('growth', -0.8, 0, 'points', 30, 365),
      fx('approval.urban_poor', -10, -1, 'points', 30, 365),
      fx('approval.business', -8, -1, 'points', 30, 365),
    ],
  },
  {
    id: 'income_tax_cut',
    title: 'Cut income or corporate tax',
    authority: 'budget',
    effects: [
      fx('revenue', -1.5, -0.1, '% GDP', 30),
      fx('growth', 0, 0.6, 'points', 90, 730),
      fx('approval.urban_middle', 1, 8, 'points', 30, 365),
      fx('approval.business', 1, 8, 'points', 30, 365),
    ],
  },
  {
    id: 'development_spending_rise',
    title: 'Raise development spending',
    authority: 'budget',
    effects: [
      fx('spending.development', 0.1, 2, '% GDP', 0),
      fx('growth', 0.05, 1, 'points', 180, 730),
      fx('approval.rural', 0, 5, 'points', 180, 365),
    ],
  },
  {
    id: 'development_spending_cut',
    title: 'Cut development spending',
    authority: 'budget',
    effects: [
      fx('spending.development', -2, -0.1, '% GDP', 0),
      fx('growth', -1, -0.05, 'points', 90, 730),
      fx('approval.rural', -5, 0, 'points', 90, 365),
    ],
  },
  {
    id: 'cash_transfer_expansion',
    title: 'Expand cash transfers to poor households',
    authority: 'budget',
    effects: [
      fx('spending.social', 0.05, 1, '% GDP', 30),
      fx('approval.urban_poor', 1, 10, 'points', 45, 365),
      fx('approval.rural', 1, 10, 'points', 45, 365),
      fx('grievance.all', -8, -0.5, 'points', 45, 365),
    ],
  },
  {
    id: 'defence_spending_change',
    title: 'Change the defence budget',
    authority: 'budget',
    effects: [
      fx('spending.defence', -1, 1.5, '% GDP', 0),
      fx('approval.security', -12, 10, 'points', 14, 365),
    ],
  },
  {
    id: 'policy_rate_change',
    title: 'Change the central bank rate',
    authority: 'monetary',
    effects: [
      fx('baseRate', -3, 3, 'points', 0),
      { ...fx('inflation', -2, 2, 'points', 180, 540), against: true },
      { ...fx('growth', -1, 1, 'points', 90, 540), against: true },
      { ...fx('approval.business', -5, 5, 'points', 30, 365), against: true },
    ],
  },
  {
    id: 'security_operation',
    title: 'Security operation in a region',
    authority: 'security',
    needsRegion: true,
    effects: [
      fx('repression.{region}', 2, 25, 'unrest points', 7),
      fx('approval.periphery', -12, 0, 'points', 14, 365),
      fx('approval.security', 0, 6, 'points', 14, 180),
    ],
  },
  {
    id: 'regional_settlement',
    title: 'Political settlement or relief package for a region',
    authority: 'executive',
    needsRegion: true,
    effects: [
      fx('grievance.{region}', -15, -1, 'points', 60, 730),
      fx('spending.development', 0, 0.5, '% GDP', 30),
      fx('approval.periphery', 0, 10, 'points', 60, 365),
      fx('approval.security', -6, 0, 'points', 14, 180),
    ],
  },
];

/** Limits for a policy that fits no entry: small effects only, and it gets a second review. */
export const NOVEL_LIMITS: Readonly<Record<string, number>> = {
  revenue: 0.3,
  spending: 0.3,
  growth: 0.2,
  inflation: 0.5,
  approval: 3,
  grievance: 3,
};
const NOVEL_LASTS_DAYS = 180;

export interface Resolution {
  /** The day the policy takes effect; lags count from here. */
  day: number;
  /** Ledger event ids that caused this, usually the policy's own event. */
  causes: readonly string[];
  /** Makes effect ids unique, usually the policy id. */
  idPrefix: string;
  region?: string;
}

/**
 * The part of a catalogue range that fits the size and direction the player asked for.
 * Size splits the range into thirds by distance from zero.
 */
export function narrow(
  effect: InstrumentEffect,
  scale: Scale,
  direction: Direction = 'raise',
): [number, number] {
  let [min, max] = effect.range;
  if (min < 0 && max > 0) {
    const positive = (direction === 'raise') !== (effect.against === true);
    if (positive) min = 0;
    else max = 0;
  }
  const near = Math.abs(min) <= Math.abs(max) ? min : max;
  const far = near === min ? max : min;
  const third = (far - near) / 3;
  const index = scale === 'small' ? 0 : scale === 'medium' ? 1 : 2;
  const a = near + third * index;
  const b = near + third * (index + 1);
  return a <= b ? [a, b] : [b, a];
}

export function findInstrument(id: string): Instrument {
  const found = CATALOGUE.find((i) => i.id === id);
  if (!found) throw new EngineRuleError('not_in_catalogue', `No instrument called ${id}.`);
  return found;
}

/**
 * Turn a model's picks into effects. Every pick must name a variable the instrument lists
 * and sit inside its range; anything else is rejected, not clipped, so a bad proposal is
 * visible to the repair loop.
 */
export function resolveInstrument(
  world: World,
  instrument: Instrument,
  picks: Readonly<Record<string, number>>,
  resolution: Resolution,
): Effect[] {
  if (instrument.needsRegion && !resolution.region) {
    throw new EngineRuleError('unknown_region', `${instrument.id} needs a region.`);
  }
  const listed = new Map(
    instrument.effects.map((e) => [e.on.replace('{region}', resolution.region ?? ''), e]),
  );
  const effects: Effect[] = [];
  for (const [on, amount] of Object.entries(picks)) {
    const entry = listed.get(on);
    if (!entry) {
      throw new EngineRuleError('not_in_catalogue', `${instrument.id} may not touch ${on}.`);
    }
    const [min, max] = entry.range;
    if (!Number.isFinite(amount) || amount < min || amount > max) {
      throw new EngineRuleError(
        'out_of_range',
        `${instrument.id}: ${on} must be between ${min} and ${max} ${entry.unit}, got ${amount}.`,
      );
    }
    if (!isValidTarget(world, on)) {
      throw new EngineRuleError('bad_target', `${instrument.id}: unknown target ${on}.`);
    }
    const startDay = resolution.day + entry.lagDays;
    effects.push({
      id: `${resolution.idPrefix}:${on}`,
      causes: [...resolution.causes],
      on,
      amount,
      startDay,
      endDay: entry.lastsDays === undefined ? null : startDay + entry.lastsDays,
    });
  }
  return effects;
}

/** Effects for a policy outside the catalogue: any valid target, small and temporary. */
export function resolveNovel(
  world: World,
  picks: Readonly<Record<string, number>>,
  resolution: Resolution,
): Effect[] {
  return Object.entries(picks).map(([on, amount]) => {
    const kind = on.split('.')[0] ?? on;
    const limit = NOVEL_LIMITS[kind];
    if (limit === undefined || !isValidTarget(world, on)) {
      throw new EngineRuleError('not_in_catalogue', `A novel policy may not touch ${on}.`);
    }
    if (!Number.isFinite(amount) || Math.abs(amount) > limit) {
      throw new EngineRuleError('out_of_range', `Novel policy: ${on} is limited to ±${limit}.`);
    }
    const permanent = kind === 'revenue' || kind === 'spending';
    return {
      id: `${resolution.idPrefix}:${on}`,
      causes: [...resolution.causes],
      on,
      amount,
      startDay: resolution.day,
      endDay: permanent ? null : resolution.day + NOVEL_LASTS_DAYS,
    };
  });
}

/** What a slate of effects adds to the yearly deficit, in % of GDP. */
export function fiscalCost(effects: readonly Effect[]): number {
  let cost = 0;
  for (const effect of effects) {
    if (effect.on.startsWith('spending.')) cost += effect.amount;
    else if (effect.on === 'revenue') cost -= effect.amount;
  }
  return cost;
}

/**
 * Money is conserved (REQ-ENG-07): new spending and tax cuts must be paid for by the slate's
 * own tax rises and cuts, or by borrowing the player has explicitly accepted.
 */
export function checkFunding(effects: readonly Effect[], acceptedBorrowing: number): void {
  const cost = fiscalCost(effects);
  if (cost > acceptedBorrowing + 1e-9) {
    throw new EngineRuleError(
      'unfunded',
      `This slate costs ${cost.toFixed(2)}% of GDP a year and only ${acceptedBorrowing.toFixed(2)}% is funded.`,
    );
  }
}
