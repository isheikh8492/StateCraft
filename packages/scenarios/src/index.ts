import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createWorld, type Scenario, ScenarioSchema, type World } from '@statecraft/engine';

/** Scenario packs that ship with the game. Each is a folder beside `src`. */
export const SCENARIO_IDS = ['pakistan-2026'] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export function loadScenario(id: ScenarioId): Scenario {
  const path = fileURLToPath(new URL(`../${id}/scenario.json`, import.meta.url));
  return ScenarioSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

export function newWorld(id: ScenarioId, seed: string): World {
  return createWorld(loadScenario(id), seed);
}
