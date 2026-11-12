import { z } from 'zod';
import { PARAMS } from './params.ts';

/**
 * World state for the four M0 systems, and the scenario file it is built from.
 * The state is plain data: it goes into snapshots as JSON and comes back unchanged.
 */

export const SPENDING_CATEGORIES = [
  'defence',
  'development',
  'subsidies',
  'social',
  'administration',
] as const;
export type SpendingCategory = (typeof SPENDING_CATEGORIES)[number];

/** Country-independent labels, so one policy catalogue serves every country. */
export const GROUP_TAGS = [
  'urban_poor',
  'urban_middle',
  'rural',
  'business',
  'security',
  'religious',
  'periphery',
] as const;
export type GroupTag = (typeof GROUP_TAGS)[number];

export const STAGES = ['calm', 'protest', 'riot', 'insurgency'] as const;
export type Stage = (typeof STAGES)[number];

export type ControlStatus = 'held' | 'contested' | 'occupied';

export interface Economy {
  /** USD billions per year. */
  gdpUsdBn: number;
  /** % per year. */
  trendGrowth: number;
  growth: number;
  inflation: number;
  inflationAnchor: number;
  /** % of the labour force. */
  unemployment: number;
  naturalUnemployment: number;
  /** % of GDP per year. */
  revenue: number;
  /** % of GDP per year, before interest. */
  spending: Record<SpendingCategory, number>;
  /** % of GDP. */
  debt: number;
  /** The central bank's rate, % per year. */
  baseRate: number;
  /** The average rate paid on the whole debt, % per year. */
  debtRate: number;
  externalDebtShare: number;
  externalRate: number;
  reservesMonths: number;
  /** Months of import cover gained per year from trade and capital flows. */
  externalBalance: number;
}

export interface Group {
  id: string;
  name: string;
  tags: GroupTag[];
  /** Share of the population, derived from the regions. */
  share: number;
  approval: number;
  /** Approval when the economy and security sit at their reference values. */
  base: number;
  floor: number;
  ceiling: number;
  sensitivity: { inflation: number; unemployment: number; growth: number; security: number };
  /** Unrest the group lived with at the start; the security term measures change from it. */
  securityRef: number;
}

export interface Region {
  id: string;
  name: string;
  population: number;
  /** Share of each group in this region; sums to 1. */
  groupMix: Record<string, number>;
  neighbours: string[];
  unrest: number;
  stage: Stage;
  daysAbove: number;
  daysBelow: number;
  mobilization: number;
  capacity: number;
  /** Long-standing grievance (identity, neglect, history), derived at the start. */
  structuralGrievance: number;
  repressionMemory: number;
  owner: string;
  controller: string;
  status: ControlStatus;
  contestDays: number;
  recoverDays: number;
}

/**
 * A caused change to the world. Most targets are offsets: while the effect is active the
 * target's value is shifted by `amount`. `repression.<region>` is a one-off on its start day.
 */
export interface Effect {
  id: string;
  /** Ledger event ids. An effect with no cause is rejected (REQ-ENG-05). */
  causes: string[];
  on: string;
  amount: number;
  startDay: number;
  /** First day the effect no longer applies; null means it stays. */
  endDay: number | null;
}

export interface World {
  scenarioId: string;
  seed: string;
  /** ISO date of day 0. */
  startDate: string;
  day: number;
  country: string;
  economy: Economy;
  groups: Group[];
  regions: Region[];
  effects: Effect[];
  /** Crisis thresholds currently crossed. */
  flags: string[];
}

const pct = z.number().min(0).max(100);

export const ScenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  country: z.string().min(1),
  startDate: z.iso.date(),
  headOfGovernment: z.object({ name: z.string(), office: z.string() }),
  economy: z.object({
    gdpUsdBn: z.number().positive(),
    trendGrowth: z.number(),
    growth: z.number(),
    inflation: z.number(),
    inflationAnchor: z.number(),
    unemployment: pct,
    naturalUnemployment: pct,
    revenue: pct,
    spending: z.object({
      defence: pct,
      development: pct,
      subsidies: pct,
      social: pct,
      administration: pct,
    }),
    debt: z.number().min(0),
    baseRate: z.number(),
    debtRate: z.number(),
    externalDebtShare: z.number().min(0).max(1),
    externalRate: z.number(),
    reservesMonths: z.number().min(0),
    externalBalance: z.number(),
  }),
  groups: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        tags: z.array(z.enum(GROUP_TAGS)),
        approval: pct,
        floor: pct,
        ceiling: pct,
        sensitivity: z.object({
          inflation: z.number().min(0),
          unemployment: z.number().min(0),
          growth: z.number().min(0),
          security: z.number().min(0),
        }),
      }),
    )
    .min(2)
    .max(8),
  regions: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        population: z.number().positive(),
        groupMix: z.record(z.string(), z.number().min(0).max(1)),
        neighbours: z.array(z.string()),
        unrest: pct,
        mobilization: z.number().positive(),
        capacity: z.number().positive(),
        status: z.enum(['held', 'contested', 'occupied']),
        controller: z.string().optional(),
      }),
    )
    .min(1),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

/** Thrown when an input breaks an engine rule. `code` is stable; `message` is for people. */
export class EngineRuleError extends Error {
  constructor(
    readonly code:
      | 'bad_scenario'
      | 'no_cause'
      | 'bad_target'
      | 'bad_amount'
      | 'out_of_range'
      | 'not_in_catalogue'
      | 'unfunded'
      | 'unknown_region',
    message: string,
  ) {
    super(message);
    this.name = 'EngineRuleError';
  }
}

export function stageFor(unrest: number): Stage {
  const [protest, riot, insurgency] = PARAMS.unrest.stageLines;
  if (unrest >= insurgency) return 'insurgency';
  if (unrest >= riot) return 'riot';
  if (unrest >= protest) return 'protest';
  return 'calm';
}

/** Losses count double. */
export function weigh(change: number): number {
  return change < 0 ? change * PARAMS.lossWeight : change;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Unrest as one group lives it: the average over regions, weighted by where its people are. */
export function unrestFeltBy(groupId: string, regions: readonly Region[]): number {
  let people = 0;
  let sum = 0;
  for (const region of regions) {
    const here = region.population * (region.groupMix[groupId] ?? 0);
    people += here;
    sum += here * region.unrest;
  }
  return people === 0 ? 0 : sum / people;
}

export function localApproval(region: Region, groups: readonly Group[]): number {
  let sum = 0;
  for (const group of groups) sum += (region.groupMix[group.id] ?? 0) * group.approval;
  return sum;
}

/** What the economy and security add to or take from a group's approval right now. */
export function feltBy(group: Group, economy: Economy, regions: readonly Region[]): number {
  const s = group.sensitivity;
  return (
    weigh(-s.inflation * (economy.inflation - economy.inflationAnchor)) +
    weigh(-s.unemployment * (economy.unemployment - economy.naturalUnemployment)) +
    weigh(s.growth * (economy.growth - economy.trendGrowth)) +
    weigh(
      (-s.security * (unrestFeltBy(group.id, regions) - group.securityRef)) /
        PARAMS.approval.securityScale,
    )
  );
}

/** Grievance in a region before any effects are added. */
export function standingGrievance(region: Region, groups: readonly Group[], economy: Economy) {
  const u = PARAMS.unrest;
  return (
    Math.max(0, u.approvalLine - localApproval(region, groups)) * u.perApprovalPoint +
    Math.max(0, economy.inflation - economy.inflationAnchor) * u.perInflationPoint +
    region.repressionMemory +
    region.structuralGrievance
  );
}

/** Unrest arriving from rougher neighbours, in points per year before the spill rate. */
export function spillInto(region: Region, regions: readonly Region[]): number {
  if (region.neighbours.length === 0) return 0;
  let sum = 0;
  for (const id of region.neighbours) {
    const neighbour = regions.find((n) => n.id === id);
    if (neighbour) sum += Math.max(0, neighbour.unrest - region.unrest);
  }
  return sum / region.neighbours.length;
}

export function riskPremium(economy: Economy): number {
  const e = PARAMS.economy;
  return (
    Math.max(0, economy.debt - e.premiumDebtLine) * e.premiumPerDebtPoint +
    Math.max(0, PARAMS.thresholds.reservesCrisisMonths - economy.reservesMonths) *
      e.premiumPerMissingReserveMonth
  );
}

/**
 * Build day 0 from a scenario. The start is treated as the country's normal: each group's
 * base approval and each region's structural grievance are set so that, with nothing new
 * happening, the world stays roughly where it is (REQ-ENG-03).
 */
export function createWorld(input: unknown, seed: string): World {
  const parsed = ScenarioSchema.safeParse(input);
  if (!parsed.success) {
    throw new EngineRuleError('bad_scenario', z.prettifyError(parsed.error));
  }
  const scenario = parsed.data;
  const groupIds = new Set(scenario.groups.map((g) => g.id));
  const regionIds = new Set(scenario.regions.map((r) => r.id));
  const totalPopulation = scenario.regions.reduce((sum, r) => sum + r.population, 0);

  for (const region of scenario.regions) {
    const mixTotal = Object.values(region.groupMix).reduce((sum, v) => sum + v, 0);
    if (Math.abs(mixTotal - 1) > 1e-6) {
      throw new EngineRuleError('bad_scenario', `${region.id}: group mix sums to ${mixTotal}`);
    }
    for (const id of Object.keys(region.groupMix)) {
      if (!groupIds.has(id)) {
        throw new EngineRuleError('bad_scenario', `${region.id}: unknown group ${id}`);
      }
    }
    for (const id of region.neighbours) {
      if (!regionIds.has(id) || id === region.id) {
        throw new EngineRuleError('bad_scenario', `${region.id}: bad neighbour ${id}`);
      }
    }
  }

  const economy: Economy = { ...scenario.economy, spending: { ...scenario.economy.spending } };

  const regions: Region[] = scenario.regions.map((r) => ({
    id: r.id,
    name: r.name,
    population: r.population,
    groupMix: { ...r.groupMix },
    neighbours: [...r.neighbours],
    unrest: r.unrest,
    stage: stageFor(r.unrest),
    daysAbove: 0,
    daysBelow: 0,
    mobilization: r.mobilization,
    capacity: r.capacity,
    structuralGrievance: 0,
    repressionMemory: 0,
    owner: scenario.country,
    controller: r.controller ?? scenario.country,
    status: r.status,
    contestDays: 0,
    recoverDays: 0,
  }));

  const groups: Group[] = scenario.groups.map((g) => {
    if (!(g.floor <= g.approval && g.approval <= g.ceiling)) {
      throw new EngineRuleError(
        'bad_scenario',
        `${g.id}: approval is outside its floor and ceiling`,
      );
    }
    const share =
      regions.reduce((sum, r) => sum + r.population * (r.groupMix[g.id] ?? 0), 0) / totalPopulation;
    const group: Group = {
      id: g.id,
      name: g.name,
      tags: [...g.tags],
      share,
      approval: g.approval,
      base: 0,
      floor: g.floor,
      ceiling: g.ceiling,
      sensitivity: { ...g.sensitivity },
      securityRef: unrestFeltBy(g.id, regions),
    };
    group.base = g.approval - feltBy(group, economy, regions);
    return group;
  });

  for (const region of regions) {
    const fromNeighbours = (spillInto(region, regions) * PARAMS.unrest.spill) / PARAMS.unrest.pull;
    const wanted = ((region.unrest - fromNeighbours) * region.capacity) / region.mobilization;
    region.structuralGrievance = Math.max(0, wanted - standingGrievance(region, groups, economy));
  }

  const flags: string[] = [];
  if (economy.reservesMonths < PARAMS.thresholds.reservesCrisisMonths) flags.push('reserves_low');
  if (riskPremium(economy) >= PARAMS.thresholds.premiumSurge) flags.push('borrowing_cost_surge');

  return {
    scenarioId: scenario.id,
    seed,
    startDate: scenario.startDate,
    day: 0,
    country: scenario.country,
    economy,
    groups,
    regions,
    effects: [],
    flags,
  };
}

export function nationalApproval(world: World): number {
  return world.groups.reduce((sum, g) => sum + g.share * g.approval, 0);
}

/** Interest and deficit in % of GDP per year, with active effects applied. */
export function fiscal(world: World, offsets: ReadonlyMap<string, number> = new Map()) {
  const e = world.economy;
  const revenue = Math.max(0, e.revenue + (offsets.get('revenue') ?? 0));
  let spending = 0;
  for (const category of SPENDING_CATEGORIES) {
    spending += Math.max(0, e.spending[category] + (offsets.get(`spending.${category}`) ?? 0));
  }
  const interest = (e.debt * e.debtRate) / 100;
  return { revenue, spending, interest, deficit: spending + interest - revenue };
}
