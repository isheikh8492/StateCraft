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

/** Region outlines for the map, built by `npm run outlines`. */
export function loadOutlines(id: ScenarioId): unknown {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`../${id}/regions.geojson`, import.meta.url)), 'utf8'),
  );
}

/** Country outlines of the whole world, drawn behind the scenario's regions. */
export function loadWorldOutlines(): unknown {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL('../shared/world-110m.geojson', import.meta.url)), 'utf8'),
  );
}
