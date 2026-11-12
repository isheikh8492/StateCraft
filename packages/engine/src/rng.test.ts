import { describe, expect, it } from 'vitest';
import { roll, rollInt } from './rng.ts';

describe('keyed dice', () => {
  it('gives the same result for the same seed and roll id', () => {
    expect(roll('campaign-1', 'coup:PK:2027-03')).toBe(roll('campaign-1', 'coup:PK:2027-03'));
  });

  it('is unaffected by other rolls being added or removed', () => {
    const before = roll('campaign-1', 'vote:budget');
    roll('campaign-1', 'something-else');
    roll('campaign-1', 'another');
    expect(roll('campaign-1', 'vote:budget')).toBe(before);
  });

  it('differs across roll ids and across campaigns', () => {
    expect(roll('campaign-1', 'a')).not.toBe(roll('campaign-1', 'b'));
    expect(roll('campaign-1', 'a')).not.toBe(roll('campaign-2', 'a'));
  });

  it('stays in [0, 1) and is roughly uniform', () => {
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const r = roll('uniformity', `roll-${i}`);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
      sum += r;
    }
    expect(sum / n).toBeGreaterThan(0.48);
    expect(sum / n).toBeLessThan(0.52);
  });

  it('rolls integers inside an inclusive range', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rollInt('ints', `r${i}`, 1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(() => rollInt('ints', 'bad', 3, 1)).toThrow(RangeError);
  });
});
