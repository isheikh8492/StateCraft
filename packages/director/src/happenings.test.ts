import { createWorld } from '@statecraft/engine';
import { loadScenario } from '@statecraft/scenarios';
import { describe, expect, it } from 'vitest';
import { aftershock, forecast } from './happenings.ts';

/**
 * What the world does on its own is drawn by the engine. These are the mistakes a model
 * made when it was left to invent the news, in play on a real model: floods out of season,
 * an armed group attacking in a province it does not fight in, the same protest every month.
 */
const scenario = loadScenario('pakistan-2026');
const month = (startDate: string, day: number) =>
  new Date(Date.parse(`${startDate}T00:00:00Z`) + day * 86_400_000).getUTCMonth() + 1;

describe('what the world does on its own', () => {
  // Five campaigns of two years each, drawn month by month as a player would move the clock.
  const drawn = ['a', 'b', 'c', 'd', 'e'].flatMap((seed) => {
    const world = createWorld(scenario, seed);
    return Array.from({ length: 24 }, (_, i) => i * 30).flatMap((from) =>
      forecast(world, scenario.cast, from, 30).map((h) => ({
        ...h,
        month: month(world.startDate, from + h.inDays),
        from,
      })),
    );
  });

  it('fills the day: most days bring something in a tense country, each at its own hour', () => {
    // Pakistan begins with a province contested, so there is a second chance each day.
    const perDay = drawn.length / (5 * 24 * 30);
    expect(perDay).toBeGreaterThan(0.5);
    expect(perDay).toBeLessThan(1.2);
    expect(new Set(drawn.map((h) => h.kind)).size).toBeGreaterThan(15);
    for (const h of drawn) {
      expect(h.hour).toBeGreaterThanOrEqual(8);
      expect(h.hour).toBeLessThanOrEqual(21);
    }
  });

  it('follows the tension: more happens after the government acts, and nothing repeats soon', () => {
    const world = createWorld(scenario, 'a');
    const count = (pace: Parameters<typeof forecast>[4]) =>
      Array.from({ length: 60 }, (_, day) => forecast(world, scenario.cast, day, 1, pace)).flat();
    expect(count({ hot: true }).length).toBeGreaterThan(count({}).length);
    // What came up lately does not come up again, and something grave is not followed by another.
    const lately = new Set(
      count({})
        .slice(0, 5)
        .map((h) => h.deck ?? ''),
    );
    expect(lately.size).toBeGreaterThan(1);
    expect(count({ recent: lately }).some((h) => lately.has(h.deck ?? ''))).toBe(false);
    expect(count({ grave: false }).some((h) => h.size === 'significant')).toBe(false);
  });

  it('keeps to the calendar', () => {
    expect(drawn.some((h) => h.kind === 'flood')).toBe(true);
    for (const h of drawn) {
      if (h.kind === 'flood') expect([7, 8, 9]).toContain(h.month);
      if (h.gist.includes('smog')) expect([11, 12, 1]).toContain(h.month);
      if (h.gist.includes('heatwave')) expect([5, 6]).toContain(h.month);
      if (h.kind === 'harvest') expect([4, 5]).toContain(h.month);
    }
  });

  it('keeps to geography: whoever is tied to a place acts there', () => {
    const attacks = drawn.filter((h) => h.kind === 'attack' && h.actor);
    expect(attacks.length).toBeGreaterThan(0);
    for (const h of attacks) {
      const actor = scenario.cast.find((c) => c.id === h.actor);
      expect(actor?.kind).toBe('militant');
      expect(actor?.cares.regions).toContain(h.place);
      expect(h.causes).toEqual([`actor:${h.actor}`]);
    }
  });

  it('is the same for the same campaign, bounded in what it moves, and always has a cause', () => {
    const world = createWorld(scenario, 'a');
    expect(forecast(world, scenario.cast, 0, 60)).toEqual(forecast(world, scenario.cast, 0, 60));
    for (const h of drawn) {
      expect(h.causes.length).toBeGreaterThan(0);
      for (const amount of Object.values(h.picks)) expect(Math.abs(amount)).toBeLessThanOrEqual(3);
      expect(h.gist).not.toMatch(/\{region\}|\{actor\}/);
    }
    // Something that matters is rationed: a fortnight allows two at most.
    for (const from of [0, 30, 60]) {
      const grave = forecast(world, scenario.cast, from, 14).filter(
        (h) => h.size === 'significant',
      );
      expect(grave.length).toBeLessThanOrEqual(2);
    }
  });

  it('follows an order with what people made of it: always when it backfired, never when it stalled', () => {
    const world = createWorld(scenario, 'a');
    const order = (id: string, landed: string) => ({ id, title: 'Cut fuel subsidies', landed });
    expect(aftershock(world, order('p1', 'stalled'), 14, 1)).toBeUndefined();
    const angry = aftershock(world, order('p1', 'backfired'), 14, 1);
    expect(angry).toMatchObject({ kind: 'public', size: 'significant', causes: ['p1'] });
    expect(angry?.inDays).toBeGreaterThan(0);
    expect(angry?.inDays).toBeLessThanOrEqual(14);
    const some = Array.from({ length: 40 }, (_, i) =>
      aftershock(world, order(`q${i}`, 'partial'), 14, 1),
    ).filter(Boolean);
    expect(some.length).toBeGreaterThan(8);
    expect(some.length).toBeLessThan(32);
  });
});
