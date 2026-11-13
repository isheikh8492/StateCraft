/**
 * The deterministic core. This package does no I/O, reads no clock, and uses no randomness
 * except the seeded generator. Same inputs, same outputs.
 */
export {
  type CastEntry,
  type OrderShape,
  type Restless,
  restless,
  type Touched,
  touchedBy,
} from './cast.ts';
export {
  AUTHORITIES,
  type Authority,
  CATALOGUE,
  checkFunding,
  type Direction,
  findInstrument,
  fiscalCost,
  type Instrument,
  type InstrumentEffect,
  LANDINGS,
  type Landing,
  landed,
  landing,
  NOVEL_LIMITS,
  narrow,
  PROCEDURE_DAYS,
  type Resolution,
  resolveInstrument,
  resolveNovel,
  type Scale,
} from './catalogue.ts';
export { addEffects, isValidTarget, offsetsOn, removeEffects } from './effects.ts';
export {
  type Court,
  courtStays,
  type Legislature,
  legislatureVote,
  type VoteResult,
} from './government.ts';
export { DT, PARAMS } from './params.ts';
export { roll, rollInt } from './rng.ts';
export { clampStanding, orderEffect, STANDING, type Stance, stanceOf } from './standing.ts';
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
  type ScenarioInput,
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
