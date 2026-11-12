/**
 * The deterministic core. This package does no I/O, reads no clock, and uses no randomness
 * except the seeded generator. Same inputs, same outputs.
 */
export {
  type Authority,
  CATALOGUE,
  checkFunding,
  findInstrument,
  fiscalCost,
  type Instrument,
  type InstrumentEffect,
  NOVEL_LIMITS,
  type Resolution,
  resolveInstrument,
  resolveNovel,
} from './catalogue.ts';
export { addEffects, isValidTarget, offsetsOn } from './effects.ts';
export { DT, PARAMS } from './params.ts';
export { roll, rollInt } from './rng.ts';
export {
  type ControlStatus,
  createWorld,
  type Economy,
  type Effect,
  EngineRuleError,
  fiscal,
  GROUP_TAGS,
  type Group,
  type GroupTag,
  nationalApproval,
  type Region,
  riskPremium,
  type Scenario,
  ScenarioSchema,
  SPENDING_CATEGORIES,
  type SpendingCategory,
  STAGES,
  type Stage,
  type World,
} from './state.ts';
export {
  advance,
  type EngineEvent,
  type StepResult,
  stepDay,
  transferControl,
  transferSovereignty,
} from './step.ts';

/** Campaigns are pinned to the engine version they started on. */
export const ENGINE_VERSION = '0.2.0';
