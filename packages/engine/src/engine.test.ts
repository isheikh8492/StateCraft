import { describe, expect, it } from 'vitest';
import {
  addEffects,
  advance,
  checkFunding,
  createWorld,
  type Effect,
  findInstrument,
  fiscal,
  landed,
  landing,
  nationalApproval,
  resolveInstrument,
  type ScenarioInput,
  transferControl,
  type World,
} from './index.ts';

/** A small made-up country, so these tests do not move when a real scenario is retuned. */
const scenario: ScenarioInput = {
  id: 'testland',
  title: 'Testland',
  country: 'TST',
  startDate: '2026-01-01',
  headOfGovernment: { name: 'A. Tester', office: 'Prime Minister' },
  office: { title: 'Prime Minister', powers: ['budget', 'executive', 'security'], limits: {} },
  brief: 'Testland is a made-up country.',
  economy: {
    gdpUsdBn: 100,
    trendGrowth: 3,
    growth: 3,
    inflation: 5,
    inflationAnchor: 5,
    unemployment: 6,
    naturalUnemployment: 6,
    revenue: 20,
    spending: { defence: 2, development: 3, subsidies: 2, social: 3, administration: 8 },
    debt: 50,
    baseRate: 6,
    debtRate: 6,
    externalDebtShare: 0.3,
    externalRate: 4,
    reservesMonths: 5,
    externalBalance: 0,
  },
  groups: [
    {
      id: 'poor',
      name: 'Urban poor',
      tags: ['urban_poor'],
      approval: 45,
      floor: 10,
      ceiling: 70,
      sensitivity: { inflation: 1, unemployment: 1, growth: 0.5, security: 0.5 },
    },
    {
      id: 'farmers',
      name: 'Farmers',
      tags: ['rural'],
      approval: 50,
      floor: 15,
      ceiling: 75,
      sensitivity: { inflation: 0.8, unemployment: 0.5, growth: 0.8, security: 0.5 },
    },
  ],
  regions: [
    {
      id: 'north',
      name: 'North',
      population: 6,
      groupMix: { poor: 0.3, farmers: 0.7 },
      neighbours: ['south'],
      unrest: 15,
      mobilization: 1,
      capacity: 1,
      status: 'held',
    },
    {
      id: 'south',
      name: 'South',
      population: 4,
      groupMix: { poor: 0.8, farmers: 0.2 },
      neighbours: ['north'],
      unrest: 35,
      mobilization: 1.2,
      capacity: 0.8,
      status: 'held',
    },
  ],
};

const start = (seed = 'seed-1'): World => createWorld(scenario, seed);
const effect = (on: string, amount: number, extra: Partial<Effect> = {}): Effect => ({
  id: `test:${on}`,
  causes: ['evt-1'],
  on,
  amount,
  startDay: 0,
  endDay: null,
  ...extra,
});

describe('engine rules', () => {
  it('rejects effects with no cause, unknown targets, and picks outside the catalogue', () => {
    const world = start();
    expect(() => addEffects(world, [effect('inflation', 1, { causes: [] })])).toThrow(/no cause/);
    expect(() => addEffects(world, [effect('weather', 1)])).toThrow(/unknown target/);

    const cut = findInstrument('fuel_subsidy_cut');
    const at = { day: 0, causes: ['evt-1'], idPrefix: 'p1' };
    expect(() => resolveInstrument(world, cut, { 'spending.subsidies': -9 }, at)).toThrow(
      /between/,
    );
    expect(() => resolveInstrument(world, cut, { 'spending.defence': -1 }, at)).toThrow(
      /may not touch/,
    );
  });

  it('rejects a slate whose spending is not paid for', () => {
    const world = start();
    const at = { day: 0, causes: ['evt-1'], idPrefix: 'p1' };
    const spend = resolveInstrument(
      world,
      findInstrument('development_spending_rise'),
      { 'spending.development': 1 },
      at,
    );
    const tax = resolveInstrument(world, findInstrument('sales_tax_rise'), { revenue: 1 }, at);
    expect(() => checkFunding(spend, 0)).toThrow(/funded/);
    expect(() => checkFunding(spend, 1)).not.toThrow();
    expect(() => checkFunding([...spend, ...tax], 0)).not.toThrow();
  });

  it('gives the same world however the time is sliced, and a different one for another seed', () => {
    const whole = advance(start(), 200).world;
    const sliced = advance(advance(advance(start(), 1).world, 59).world, 140).world;
    expect(sliced).toEqual(whole);
    expect(advance(start('seed-2'), 200).world).not.toEqual(whole);
  });

  it('stays put when nothing happens', () => {
    const { world, events } = advance(start(), 365);
    expect(events).toEqual([]);
    expect(Math.abs(world.economy.inflation - 5)).toBeLessThan(1);
    expect(Math.abs(nationalApproval(world) - nationalApproval(start()))).toBeLessThan(3);
    expect(world.regions.map((r) => r.stage)).toEqual(['calm', 'protest']);
  });

  it('keeps its invariants through a severe shock', () => {
    let world = addEffects(start(), [
      effect('inflation', 60, { endDay: 400 }),
      effect('growth', -12, { endDay: 400 }),
      effect('externalBalance', -6, { endDay: 400 }),
      effect('grievance.all', 80, { endDay: 400 }),
      effect('approval.urban_poor', 200, { id: 'windfall', startDay: 500, endDay: 700 }),
    ]);
    const flags: string[] = [];
    for (let day = 0; day < 730; day++) {
      const result = advance(world, 1);
      world = result.world;
      for (const e of result.events) if (e.type === 'threshold.raised') flags.push(e.flag);
      for (const g of world.groups) {
        expect(g.approval).toBeGreaterThanOrEqual(g.floor);
        expect(g.approval).toBeLessThanOrEqual(g.ceiling);
      }
      expect(nationalApproval(world)).toBeLessThan(100);
      for (const r of world.regions) {
        expect(r.unrest).toBeGreaterThanOrEqual(0);
        expect(r.unrest).toBeLessThanOrEqual(100);
        expect(typeof r.controller).toBe('string');
      }
      expect(world.economy.reservesMonths).toBeGreaterThanOrEqual(0);
      expect(world.groups.reduce((sum, g) => sum + g.share, 0)).toBeCloseTo(1, 9);
      expect(Number.isFinite(world.economy.debt)).toBe(true);
    }
    // Reserves ran down past the crisis line, and the event carries its cause.
    expect(flags).toContain('reserves_low');
    expect(world.effects.every((e) => e.causes.length > 0)).toBe(true);
  });

  it('moves the right things when a policy lands, and losers react more than winners', () => {
    const base = advance(start(), 180).world;
    const at = { day: 0, causes: ['policy-7'], idPrefix: 'p7' };
    const cut = resolveInstrument(
      start(),
      findInstrument('fuel_subsidy_cut'),
      { 'spending.subsidies': -1, inflation: 2, 'approval.urban_poor': -8 },
      at,
    );
    const after = advance(addEffects(start(), cut), 180).world;
    expect(fiscal(after, new Map([['spending.subsidies', -1]])).deficit).toBeLessThan(
      fiscal(base).deficit,
    );
    expect(after.economy.inflation).toBeGreaterThan(base.economy.inflation);
    const poor = (w: World) => w.groups.find((g) => g.id === 'poor')?.approval ?? 0;
    expect(poor(after)).toBeLessThan(poor(base) - 3);

    // The same size of change in inflation, up and down: the fall in approval is the larger.
    const up = advance(addEffects(start(), [effect('inflation', 4, { endDay: 365 })]), 365).world;
    const down = advance(
      addEffects(start(), [effect('inflation', -4, { endDay: 365 })]),
      365,
    ).world;
    const still = advance(start(), 365).world;
    expect(poor(still) - poor(up)).toBeGreaterThan((poor(down) - poor(still)) * 1.5);
  });

  it('escalates unrest in stages with a named cause, and control changes only by an explicit act', () => {
    const world = addEffects(start(), [
      effect('grievance.south', 60, { causes: ['evt-massacre'] }),
    ]);
    const { events, world: later } = advance(world, 365);
    const stages = events.filter((e) => e.type === 'unrest.stage' && e.region === 'south');
    expect(stages.map((e) => (e.type === 'unrest.stage' ? e.to : ''))).toEqual([
      'riot',
      'insurgency',
    ]);
    expect(stages[0]?.causes).toEqual(['evt-massacre']);
    expect(later.regions.every((r) => r.controller === 'TST')).toBe(true);

    const taken = transferControl(later, 'south', 'XYZ');
    expect(taken.regions.find((r) => r.id === 'south')).toMatchObject({
      controller: 'XYZ',
      owner: 'TST',
      status: 'occupied',
    });
  });
});

describe('how an order lands', () => {
  it('is decided by keyed dice, and goes wrong more often the more forceful the order', () => {
    const count = (scale: 'small' | 'large') => {
      const tally = { as_intended: 0, partial: 0, stalled: 0, backfired: 0 };
      for (let i = 0; i < 4000; i++) tally[landing('seed', `p${i}`, scale)]++;
      return tally;
    };
    const small = count('small');
    const large = count('large');
    // Every landing happens, so an order has something to hope for and something to fear.
    for (const n of [...Object.values(small), ...Object.values(large)])
      expect(n).toBeGreaterThan(100);
    expect(small.as_intended).toBeGreaterThan(large.as_intended);
    expect(large.stalled + large.backfired).toBeGreaterThan(small.stalled + small.backfired);
    // The same order in the same campaign always lands the same way; another campaign differs.
    expect(landing('seed', 'p1', 'medium')).toBe(landing('seed', 'p1', 'medium'));
    const differs = Array.from({ length: 40 }, (_, i) => `p${i}`).some(
      (id) => landing('seed', id, 'medium') !== landing('other', id, 'medium'),
    );
    expect(differs).toBe(true);
  });

  it('gives the stronger half of a range to an order that went as intended, and nothing to one that stalled', () => {
    expect(landed([1, 3], 'as_intended')).toEqual([2, 3]);
    expect(landed([1, 3], 'partial')).toEqual([1, 2]);
    expect(landed([1, 3], 'backfired')).toEqual([1, 2]);
    expect(landed([-3, -1], 'as_intended')).toEqual([-3, -2]);
    expect(landed([-3, -1], 'partial')).toEqual([-2, -1]);
    expect(landed([1, 3], 'stalled')).toBeNull();
    // A range that runs both ways from zero has no stronger half.
    expect(landed([-2, 2], 'as_intended')).toEqual([-2, 2]);
  });
});
