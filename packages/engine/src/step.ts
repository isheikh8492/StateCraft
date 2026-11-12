import { causesOf, offsetsOn } from './effects.ts';
import { DT, PARAMS } from './params.ts';
import { roll } from './rng.ts';
import {
  type ControlStatus,
  clamp,
  type Economy,
  EngineRuleError,
  feltBy,
  fiscal,
  type Group,
  type Region,
  riskPremium,
  STAGES,
  type Stage,
  spillInto,
  standingGrievance,
  type World,
} from './state.ts';

/** Something the daily update noticed. The caller writes these to the ledger. */
export type EngineEvent =
  | { type: 'threshold.raised' | 'threshold.cleared'; day: number; flag: string; causes: string[] }
  | { type: 'unrest.stage'; day: number; region: string; from: Stage; to: Stage; causes: string[] }
  | {
      type: 'control.status';
      day: number;
      region: string;
      from: ControlStatus;
      to: ControlStatus;
      causes: string[];
    };

export interface StepResult {
  world: World;
  events: EngineEvent[];
}

/** A mean-zero wobble in [-size, size], from this day's own dice. */
function wobble(world: World, key: string, size: number): number {
  return (roll(world.seed, `${key}:${world.day}`) * 2 - 1) * size;
}

function stepEconomy(world: World, off: ReadonlyMap<string, number>): Economy {
  const P = PARAMS.economy;
  const before = world.economy;
  const e: Economy = { ...before, spending: { ...before.spending } };
  const get = (key: string) => off.get(key) ?? 0;

  const growthTarget = e.trendGrowth + get('growth');
  e.growth +=
    (growthTarget - e.growth) * P.pullGrowth * DT + wobble(world, 'growth', P.noiseGrowth);
  e.growth = clamp(e.growth, -30, 30);

  const missingReserves = Math.max(0, PARAMS.thresholds.reservesCrisisMonths - e.reservesMonths);
  const inflationTarget =
    e.inflationAnchor + get('inflation') + missingReserves * P.passThroughPerMissingReserveMonth;
  e.inflation +=
    (inflationTarget - e.inflation) * P.pullInflation * DT +
    wobble(world, 'inflation', P.noiseInflation);
  e.inflation = clamp(e.inflation, -10, 500);

  const unemploymentTarget = e.naturalUnemployment - P.okun * (e.growth - e.trendGrowth);
  e.unemployment += (unemploymentTarget - e.unemployment) * P.pullUnemployment * DT;
  e.unemployment = clamp(e.unemployment, 0, 60);

  e.gdpUsdBn *= 1 + (e.growth / 100) * DT;

  const premium = riskPremium(e);
  const domesticRate = e.baseRate + get('baseRate') + premium;
  const marketRate =
    (1 - e.externalDebtShare) * domesticRate + e.externalDebtShare * (e.externalRate + premium);
  e.debtRate += (marketRate - e.debtRate) * P.pullDebtRate * DT;

  const { deficit } = fiscal({ ...world, economy: e }, off);
  e.debt = Math.max(0, e.debt + (deficit - (e.debt * (e.growth + e.inflation)) / 100) * DT);

  e.reservesMonths = Math.max(
    0,
    e.reservesMonths + (e.externalBalance + get('externalBalance')) * DT,
  );
  return e;
}

function stepGroups(world: World, economy: Economy, off: ReadonlyMap<string, number>): Group[] {
  return world.groups.map((group) => {
    let push = off.get(`approval.${group.id}`) ?? 0;
    for (const tag of group.tags) push += off.get(`approval.${tag}`) ?? 0;
    const target = clamp(
      group.base + feltBy(group, economy, world.regions) + push,
      group.floor,
      group.ceiling,
    );
    const approval = group.approval + (target - group.approval) * PARAMS.approval.pull * DT;
    return { ...group, approval: clamp(approval, group.floor, group.ceiling) };
  });
}

function stepRegion(
  world: World,
  region: Region,
  groups: readonly Group[],
  economy: Economy,
  off: ReadonlyMap<string, number>,
  events: EngineEvent[],
): Region {
  const U = PARAMS.unrest;
  const day = world.day;
  const r: Region = { ...region };
  const scoped = (kind: string) =>
    (off.get(`${kind}.${r.id}`) ?? 0) + (off.get(`${kind}.all`) ?? 0);

  // Repression lowers unrest today and comes back later as grievance.
  for (const effect of world.effects) {
    if (effect.startDay === day && effect.on === `repression.${r.id}`) {
      r.unrest -= effect.amount;
      r.repressionMemory += effect.amount * U.repressionMemory;
    }
  }

  const grievance = Math.max(0, standingGrievance(r, groups, economy) + scoped('grievance'));
  const capacity = Math.max(0.1, r.capacity + scoped('capacity'));
  const restingLevel = (grievance * r.mobilization) / capacity;

  const spill = spillInto(region, world.regions);

  r.unrest +=
    (restingLevel - r.unrest) * U.pull * DT +
    spill * U.spill * DT +
    wobble(world, `unrest:${r.id}`, U.noise);
  r.unrest = clamp(r.unrest, 0, 100);
  r.repressionMemory *= U.repressionDecayPerDay;

  // Stages: up after holding above the line, down more slowly than up.
  const index = STAGES.indexOf(r.stage);
  const lineUp = U.stageLines[index];
  const lineDown = index > 0 ? U.stageLines[index - 1] : undefined;
  r.daysAbove = lineUp !== undefined && r.unrest >= lineUp ? r.daysAbove + 1 : 0;
  r.daysBelow =
    lineDown !== undefined && r.unrest < lineDown - U.stageDownMargin ? r.daysBelow + 1 : 0;
  let next: Stage | undefined;
  if (r.daysAbove >= U.stageUpDays) next = STAGES[index + 1];
  else if (r.daysBelow >= U.stageDownDays) next = STAGES[index - 1];
  if (next) {
    const causes = causesOf(world, day, [
      'grievance',
      'capacity',
      'repression',
      'approval',
      'inflation',
    ]);
    events.push({ type: 'unrest.stage', day, region: r.id, from: r.stage, to: next, causes });
    r.stage = next;
    r.daysAbove = 0;
    r.daysBelow = 0;
  }

  // Control: a long, intense insurgency makes the region contested; calm wins it back.
  const C = PARAMS.control;
  if (r.status === 'held') {
    r.contestDays = r.unrest >= C.contestLine ? r.contestDays + 1 : 0;
    if (r.contestDays >= C.contestDays) setStatus(world, r, 'contested', events);
  } else if (r.status === 'contested') {
    r.recoverDays = r.stage !== 'insurgency' ? r.recoverDays + 1 : 0;
    if (r.recoverDays >= C.recoverDays) setStatus(world, r, 'held', events);
  }
  return r;
}

function setStatus(world: World, r: Region, to: ControlStatus, events: EngineEvent[]): void {
  const causes = causesOf(world, world.day, ['grievance', 'capacity', 'repression', 'approval']);
  events.push({ type: 'control.status', day: world.day, region: r.id, from: r.status, to, causes });
  r.status = to;
  r.contestDays = 0;
  r.recoverDays = 0;
}

function stepFlags(world: World, economy: Economy, events: EngineEvent[]): string[] {
  const T = PARAMS.thresholds;
  const flags = new Set(world.flags);
  const check = (flag: string, raised: boolean, cleared: boolean, prefixes: string[]) => {
    if (!flags.has(flag) && raised) {
      flags.add(flag);
      events.push({
        type: 'threshold.raised',
        day: world.day,
        flag,
        causes: causesOf(world, world.day, prefixes),
      });
    } else if (flags.has(flag) && cleared) {
      flags.delete(flag);
      events.push({
        type: 'threshold.cleared',
        day: world.day,
        flag,
        causes: causesOf(world, world.day, prefixes),
      });
    }
  };
  check(
    'reserves_low',
    economy.reservesMonths < T.reservesCrisisMonths,
    economy.reservesMonths > T.reservesClearMonths,
    ['externalBalance'],
  );
  const premium = riskPremium(economy);
  check('borrowing_cost_surge', premium >= T.premiumSurge, premium < T.premiumClear, [
    'externalBalance',
    'spending',
    'revenue',
  ]);
  return [...flags].sort();
}

/** Advance the world by exactly one day. Pure: the input is not changed. */
export function stepDay(world: World): StepResult {
  const events: EngineEvent[] = [];
  const off = offsetsOn(world, world.day);
  const economy = stepEconomy(world, off);
  const groups = stepGroups(world, economy, off);
  const regions = world.regions.map((r) => stepRegion(world, r, groups, economy, off, events));
  const flags = stepFlags(world, economy, events);
  const day = world.day + 1;
  // Finished effects are dropped; the ledger keeps the history.
  const effects = world.effects.filter(
    (e) =>
      !(e.endDay !== null && e.endDay <= day) &&
      !(e.on.startsWith('repression.') && e.startDay < day),
  );
  return { world: { ...world, day, economy, groups, regions, effects, flags }, events };
}

/**
 * Advance by whole days. Time is always stepped a day at a time, so jumping 30 days gives
 * exactly the same world as thirty one-day steps (REQ-ENG-04).
 */
export function advance(world: World, days: number): StepResult {
  if (!Number.isInteger(days) || days < 0) {
    throw new RangeError(`advance needs a whole number of days, got ${days}`);
  }
  let current = world;
  const events: EngineEvent[] = [];
  for (let i = 0; i < days; i++) {
    const result = stepDay(current);
    current = result.world;
    events.push(...result.events);
  }
  return { world: current, events };
}

/** Hand a region to another controller. Only an explicit act may do this (REQ-ENG-11). */
export function transferControl(world: World, regionId: string, controller: string): World {
  if (!world.regions.some((r) => r.id === regionId)) {
    throw new EngineRuleError('unknown_region', `No region called ${regionId}.`);
  }
  return {
    ...world,
    regions: world.regions.map((r) =>
      r.id === regionId
        ? {
            ...r,
            controller,
            status: controller === r.owner ? 'held' : 'occupied',
            contestDays: 0,
            recoverDays: 0,
          }
        : r,
    ),
  };
}

/** Change who owns a region in law. Recognition by other states is decided elsewhere. */
export function transferSovereignty(world: World, regionId: string, owner: string): World {
  if (!world.regions.some((r) => r.id === regionId)) {
    throw new EngineRuleError('unknown_region', `No region called ${regionId}.`);
  }
  return {
    ...world,
    regions: world.regions.map((r) =>
      r.id === regionId ? { ...r, owner, status: r.controller === owner ? 'held' : 'occupied' } : r,
    ),
  };
}
