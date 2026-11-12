import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLedger } from '@statecraft/ledger';
import { createHarness, startStandIn } from '@statecraft/models';
import type { CallView, ModelSettings, PolicyCard } from '@statecraft/protocol';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDirector } from './index.ts';

/**
 * The whole pipeline against the real engine, ledger and harness. The model is the scripted
 * stand-in, reached over HTTP through the real OpenAI-compatible adapter.
 */
const PORT = 4391;
let standIn: Server;
let dir: string;
let n = 0;
const opened: { close(): void }[] = [];

beforeAll(async () => {
  standIn = await startStandIn(PORT);
  dir = mkdtempSync(join(tmpdir(), 'statecraft-director-'));
});
afterAll(() => {
  standIn.close();
  for (const ledger of opened) {
    try {
      ledger.close();
    } catch {
      // Already closed by the test.
    }
  }
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  n++;
});

function open(model: string | null, file = join(dir, `c${n}.statecraft`)) {
  const settings: ModelSettings = model
    ? { kind: 'openai', baseUrl: `http://127.0.0.1:${PORT}/v1`, model, keyEnv: '' }
    : { kind: 'none', baseUrl: '', model: '', keyEnv: '' };
  const ledger = openLedger(file, '0.2.0');
  opened.push(ledger);
  const calls: CallView[] = [];
  const harness = createHarness({
    settings: () => settings,
    onCall: (c) => {
      calls.push(c);
      ledger.recordCall(c.id, c.resolution, c);
    },
  });
  const director = createDirector({ ledger, harness, newSeed: () => 'test-seed' });
  let k = 0;
  const add = (text: string) => {
    const card: PolicyCard = {
      id: `card-${n}-${++k}`,
      text,
      source: 'composer',
      createdAt: '2026-11-01T00:00:00.000Z',
    };
    director.addCard(card);
    return card.id;
  };
  return { director, ledger, calls, add, file };
}

describe('director', () => {
  it('plays a year through a model: boxes become policies, the world moves, the record is written', async () => {
    const { director, add, calls } = open('standin');
    director.start('pakistan-2026');
    add('Cut the fuel subsidy sharply.');
    add('Reduce subsidies on petrol.');
    add('Order the State Bank to lower the interest rate.');
    add('Open talks with tribal elders in Khyber Pakhtunkhwa.');
    await director.idle();
    expect(director.view().cards.every((c) => c.reading)).toBe(true);

    director.execute(false);
    await director.idle();
    let view = director.view();
    expect(view.cards).toEqual([]);
    expect(view.policies.map((p) => [p.instrument, p.status]).sort()).toEqual([
      ['fuel_subsidy_cut', 'active'],
      ['policy_rate_change', 'blocked'],
      ['regional_settlement', 'active'],
    ]);
    const cut = view.policies.find((p) => p.instrument === 'fuel_subsidy_cut');
    expect(cut?.orders).toEqual(['Cut the fuel subsidy sharply.']);
    expect(cut?.costPerYear).toBeLessThan(0);
    expect(view.chronicle.length).toBeGreaterThan(0);
    expect(view.chronicle.every((e) => e.cites.length > 0 && e.via === 'model')).toBe(true);
    expect(view.campaign?.day).toBeGreaterThanOrEqual(14);
    expect(calls.filter((c) => c.via === 'fallback')).toEqual([]);

    for (let month = 0; month < 12; month++) {
      director.advance(30);
      await director.idle();
    }
    view = director.view();
    expect(view.campaign?.day).toBeGreaterThan(300);
    expect(view.digests.length).toBeGreaterThanOrEqual(10);
    expect(view.policies.find((p) => p.instrument === 'fuel_subsidy_cut')).toMatchObject({
      stage: 'felt',
    });
    expect(view.policies.find((p) => p.instrument === 'fuel_subsidy_cut')?.report).toBeDefined();
    // Every recorded event has a cause, and every chronicle entry cites a real event.
    const ids = new Set(view.events.map((e) => e.id));
    expect(view.events.every((e) => e.causes.length > 0)).toBe(true);
    expect(view.chronicle.every((e) => e.cites.every((id) => ids.has(id)))).toBe(true);
  }, 30_000);

  it('is playable with no model, and with a model that never answers properly', async () => {
    for (const model of [null, 'standin-invalid', 'standin-refuse']) {
      n++;
      const { director, add, calls } = open(model);
      director.start('pakistan-2026');
      add('Expand cash transfers to poor households.');
      director.execute(false);
      await director.idle();
      const view = director.view();
      expect(view.policies[0]).toMatchObject({
        instrument: 'cash_transfer_expansion',
        status: 'active',
      });
      expect(view.chronicle.length).toBeGreaterThan(0);
      expect(calls.every((c) => c.via === 'fallback')).toBe(true);
      if (model === 'standin-refuse')
        expect(calls.some((c) => c.errors.some((e) => e.startsWith('refusal')))).toBe(true);
    }
    n++;
    const flaky = open('standin-flaky');
    flaky.director.start('pakistan-2026');
    flaky.add('Expand cash transfers to poor households.');
    flaky.director.execute(false);
    await flaky.director.idle();
    expect(flaky.calls.filter((c) => c.job.startsWith('policy.compile')).map((c) => c.via)).toEqual(
      ['repaired'],
    );
  }, 30_000);

  it('holds conflicting boxes until the player chooses, and can be cancelled without a trace', async () => {
    const { director, add } = open(null);
    director.start('pakistan-2026');
    const a = add('Cut the fuel subsidy.');
    add('Raise subsidies on fuel for everyone.');
    director.execute(false);
    await director.idle();
    expect(director.view().blocked?.conflicts).toHaveLength(1);
    expect(director.view().cards).toHaveLength(2);
    expect(director.view().campaign?.day).toBe(0);

    director.deleteCard(a);
    director.execute(false);
    director.cancel();
    await director.idle();
    expect(director.view().campaign?.day).toBe(0);
    expect(director.view().policies).toEqual([]);
    expect(director.view().cards).toHaveLength(1);
  });

  it('resumes after a stop mid-resolution without applying anything twice, and rewinds onto a new branch', async () => {
    const first = open(null);
    first.director.start('pakistan-2026');
    first.add('Raise the sales tax.');
    first.director.execute(false);
    await first.director.idle();
    const reference = first.director.debugWorld();
    first.ledger.close();

    // The same campaign, but the server "dies" after the apply step has been saved.
    n++;
    const crashed = open(null);
    crashed.director.start('pakistan-2026');
    crashed.add('Raise the sales tax.');
    const realAppend = crashed.ledger.append.bind(crashed.ledger);
    crashed.ledger.append = (event, at) => {
      const stored = realAppend(event, at);
      if (event.type === 'resolution.step' && event.step === 'apply') throw new Error('power cut');
      return stored;
    };
    crashed.director.execute(false);
    await crashed.director.idle();
    expect(crashed.director.view().running?.step).toBe('narrate');
    crashed.ledger.close();

    const resumed = open(null, crashed.file);
    await resumed.director.idle();
    expect(resumed.director.view().running).toBeNull();
    expect(resumed.director.debugWorld()).toEqual(reference);
    expect(resumed.director.view().policies).toHaveLength(1);

    // Rewind to the start: the policy is gone, the old line is still in the file.
    const startSeq = resumed.director.view().timeline[0]?.seq ?? 0;
    resumed.director.rewind(startSeq);
    const view = resumed.director.view();
    expect(view.campaign).toMatchObject({ day: 0, branch: 2 });
    expect(view.policies).toEqual([]);
    expect(view.chronicle).toEqual([]);
    expect(view.branches).toHaveLength(2);
    resumed.director.advance(10);
    await resumed.director.idle();
    expect(resumed.director.view().campaign?.day).toBe(10);
  });
});
