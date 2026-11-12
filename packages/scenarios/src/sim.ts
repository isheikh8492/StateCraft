/**
 * Runs a scenario with no player and prints the world every 30 days.
 * Use it to judge whether the untouched world behaves believably:
 *   npm run sim -w @statecraft/scenarios -- [days] [seed]
 */
import { advance, fiscal, nationalApproval, type World } from '@statecraft/engine';
import { newWorld } from './index.ts';

const days = Number(process.argv[2] ?? 365);
const seed = process.argv[3] ?? 'sim';

function row(world: World): Record<string, string | number> {
  const e = world.economy;
  const f = fiscal(world);
  const out: Record<string, string | number> = {
    day: world.day,
    growth: e.growth.toFixed(1),
    inflation: e.inflation.toFixed(1),
    deficit: f.deficit.toFixed(1),
    debt: e.debt.toFixed(1),
    reserves: e.reservesMonths.toFixed(2),
    approval: nationalApproval(world).toFixed(1),
  };
  for (const r of world.regions) out[r.id] = `${r.unrest.toFixed(0)} ${r.stage}`;
  return out;
}

let world = newWorld('pakistan-2026', seed);
const rows = [row(world)];
for (let done = 0; done < days; ) {
  const chunk = Math.min(30, days - done);
  const result = advance(world, chunk);
  world = result.world;
  done += chunk;
  rows.push(row(world));
  for (const event of result.events) console.log(JSON.stringify(event));
}
console.table(rows);
