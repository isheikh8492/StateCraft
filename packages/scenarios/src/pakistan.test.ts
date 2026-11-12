import { advance, fiscal, nationalApproval } from '@statecraft/engine';
import { expect, it } from 'vitest';
import { newWorld } from './index.ts';

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * The golden run: twelve months of Pakistan with no player. It pins the untouched world so
 * that any change to a rule or a number shows up as a diff to review. If the change is
 * intended, update the snapshot with `npx vitest run -u`.
 */
it('pakistan-2026 runs twelve months untouched and matches the golden run', () => {
  let world = newWorld('pakistan-2026', 'golden');
  expect(fiscal(world).deficit).toBeCloseTo(2.5, 1);

  const quarters = [];
  const events = [];
  for (let quarter = 1; quarter <= 4; quarter++) {
    const result = advance(world, quarter === 4 ? 92 : 91);
    world = result.world;
    events.push(...result.events);
    quarters.push({
      day: world.day,
      growth: round(world.economy.growth),
      inflation: round(world.economy.inflation),
      unemployment: round(world.economy.unemployment),
      deficit: round(fiscal(world).deficit),
      debt: round(world.economy.debt),
      reserves: round(world.economy.reservesMonths),
      approval: round(nationalApproval(world)),
      unrest: Object.fromEntries(
        world.regions.map((r) => [r.id, `${Math.round(r.unrest)} ${r.stage}`]),
      ),
      control: Object.fromEntries(world.regions.map((r) => [r.id, r.status])),
    });
  }

  // Continuity: with no cause, nothing changes hands and no crisis line is crossed.
  expect(events.filter((e) => e.type !== 'unrest.stage')).toEqual([]);
  expect({ quarters, events }).toMatchSnapshot();
});
