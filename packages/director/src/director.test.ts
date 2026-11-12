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
    expect(view.chronicle.every((e) => e.cites.length > 0)).toBe(true);
    expect(view.campaign?.day).toBeGreaterThanOrEqual(14);
    expect(calls.filter((c) => c.via === 'fallback')).toEqual([]);

    for (let month = 0; month < 12; month++) {
      director.advance(30);
      await director.idle();
    }
    view = director.view();
    expect(view.campaign?.day).toBeGreaterThan(300);
    expect(view.policies.find((p) => p.instrument === 'fuel_subsidy_cut')).toMatchObject({
      stage: 'felt',
    });
    expect(
      view.events.some(
        (e) => e.kind === 'policy.milestone' && /A month into its effect: Cut fuel/.test(e.summary),
      ),
    ).toBe(true);
    // Every recorded event has a cause, and every chronicle entry cites a real event.
    const ids = new Set(view.events.map((e) => e.id));
    expect(view.events.every((e) => e.causes.length > 0)).toBe(true);
    expect(view.chronicle.every((e) => e.cites.every((id) => ids.has(id)))).toBe(true);
  }, 30_000);

  it('waits only for reading and judging; reactions follow, and short moves call no model', async () => {
    const { director, add, calls } = open('standin-slow');
    director.start('pakistan-2026');
    const jobs = () => calls.map((c) => c.job.split(' ')[0]);

    // Adding and editing boxes costs nothing.
    const id = add('Raise the sales tax a little.');
    director.patchCard(id, { text: 'Raise the sales tax slightly.' });
    await director.idle();
    expect(jobs()).toEqual([]);

    // The turn commits after two calls. The cast's answers are still being written.
    director.move({ days: 3 }, false);
    await expect.poll(() => director.view().campaign?.day, { timeout: 10_000 }).toBe(3);
    expect(jobs()).toEqual(['policy.compile', 'turn.adjudicate']);
    expect(director.view().arriving.reactions).toBe(true);
    expect(director.view().chronicle.length).toBeGreaterThan(0);
    await director.idle();
    expect(jobs().slice(2)).toEqual(['policy.react', 'policy.react', 'policy.react']);
    expect(director.view().arriving.reactions).toBe(false);

    // Running the clock an hour, a day or a few days with nothing ordered: no calls at all.
    calls.length = 0;
    director.move({ hours: 1 }, false);
    await director.idle();
    expect(director.view().campaign).toMatchObject({ day: 3, hour: 10 });
    director.move({ days: 1 }, false);
    await director.idle();
    director.move({ days: 3 }, false);
    await director.idle();
    expect(jobs()).toEqual([]);

    // A longer run is judged once, and nothing is written that nobody asked for.
    director.move({ days: 60 }, false);
    await director.idle();
    expect(jobs()).toEqual(['turn.adjudicate']);
  }, 60_000);

  it('answers every order: the cast reacts, a later beat is decided by dice, and people can be asked', async () => {
    const { director, add, calls } = open(null);
    director.start('pakistan-2026');
    add('Declare an immediate ceasefire and open talks with the insurgents in Balochistan.');
    director.move({ days: 2 }, false);
    await director.idle();
    let view = director.view();
    const policy = view.policies[0];
    expect(policy).toMatchObject({
      instrument: 'regional_settlement',
      region: 'balochistan',
      status: 'active',
    });
    // The engine, not a model, decided who is touched: the insurgents first.
    expect(policy?.reactions.map((r) => r.actor)).toEqual(['bla', 'juif', 'china']);
    expect(policy?.reactions[0]?.text).toMatch(
      /Baloch Liberation Army dismissed the government's offer/,
    );
    expect(policy?.alsoNoted).toEqual(
      expect.arrayContaining(['The Government of Balochistan', 'The Army high command']),
    );
    const spoken = view.chronicle.filter((e) => e.speaker);
    expect(spoken).toHaveLength(3);
    expect(spoken.every((e) => e.quote && e.cites.length === 1)).toBe(true);

    // Two weeks on, the dice decide whether the lull holds, and the result cites the order.
    director.move({ days: 20 }, false);
    await director.idle();
    view = director.view();
    const beat = view.events.find((e) => e.kind === 'beat');
    expect(beat?.summary).toMatch(/attacks in Balochistan have fallen away|ending talk of a lull/);
    expect(beat?.causes).toEqual([policy?.id]);
    expect(view.turns[0]).toMatchObject({ orders: [], move: 'Ran the clock 20 days' });
    expect(view.turns[1]?.orders).toEqual([
      'Declare an immediate ceasefire and open talks with the insurgents in Balochistan.',
    ]);

    // Depth on demand: a full piece is written once and kept.
    director.expandEntry(beat?.id ?? '');
    await director.idle();
    const full = director.view().chronicle.find((e) => e.id === beat?.id)?.full;
    expect(full).toContain(beat?.summary);
    const written = calls.length;
    director.expandEntry(beat?.id ?? '');
    await director.idle();
    expect(calls.length).toBe(written);

    // People can be asked; some cannot be reached.
    director.ask('interior_minister', 'Is the lull in Balochistan real?');
    await director.idle();
    expect(director.view().talks.interior_minister?.[0]?.reply).toMatch(/on the record/);
    expect(() => director.ask('bla', 'Will you talk?')).toThrow(/no channel/);
  });

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
    expect(crashed.director.view().running?.step).toBe('commit');
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

describe('desk and time', () => {
  it('lets boxes be edited, reordered and pinned as standing instructions', async () => {
    const { director, add } = open(null);
    director.start('pakistan-2026');
    const a = add('Do something about prices');
    const b = add('Expand cash transfers to poor households.');
    director.patchCard(a, { text: 'Raise the sales tax slightly.' });
    director.patchCard(b, { beforeId: a, pinned: true });
    await director.idle();
    const cards = director.view().cards;
    expect(cards.map((c) => c.id)).toEqual([b, a]);
    expect(cards[1]).toMatchObject({ text: 'Raise the sales tax slightly.' });

    director.execute(false);
    await director.idle();
    // The pinned box stays on the desk and is not sent a second time.
    expect(director.view().cards).toMatchObject([{ id: b, pinned: true, sent: true }]);
    expect(director.view().policies).toHaveLength(2);
    expect(() => director.execute(false)).toThrow(/Add at least one/);
    const votes = director.view().events.filter((e) => e.kind === 'legislature.vote');
    expect(votes).toHaveLength(2);
    expect(votes[0]?.summary).toMatch(
      /National Assembly (passed|voted down) a government measure, \d+ votes to \d+/,
    );
  });

  it('rewinds to any date, even inside a resolution, and lands on the same world as that day', async () => {
    const straight = open(null);
    straight.director.start('pakistan-2026');
    straight.add('Raise the sales tax.');
    straight.director.execute(false);
    await straight.director.idle();
    const firstStop = straight.director.view().campaign?.day ?? 0;
    straight.director.advance(20);
    await straight.director.idle();
    const reference = straight.director.debugWorld();
    const eventsThen = straight.director.view().events.map((e) => e.id);

    n++;
    const long = open(null);
    long.director.start('pakistan-2026');
    long.add('Raise the sales tax.');
    long.director.execute(false);
    await long.director.idle();
    long.director.advance(60);
    await long.director.idle();
    const target = new Date(Date.UTC(2026, 10, 1 + firstStop + 20)).toISOString().slice(0, 10);
    long.director.rewindToDate(target);

    const view = long.director.view();
    expect(view.campaign).toMatchObject({ day: firstStop + 20, date: target, branch: 2 });
    expect(long.director.debugWorld()).toEqual(reference);
    expect(view.events.map((e) => e.id)).toEqual(eventsThen);
    expect(view.policies).toHaveLength(1);
    expect(() => long.director.rewindToDate('2030-01-01')).toThrow(/past/);
  });

  it('answers a vague order in the world instead of asking the player a question', async () => {
    const { director, add } = open(null);
    director.start('pakistan-2026');
    add('Fix it');
    add('Expand cash transfers to poor households.');
    director.execute(false, 7);
    await director.idle();
    const view = director.view();
    expect(view.blocked).toBeNull();
    expect(view.cards).toEqual([]);
    expect(view.cards.every((c) => c.reading === undefined)).toBe(true);
    expect(view.events.find((e) => e.kind === 'policy.unclear')?.summary).toMatch(
      /unsure how to act.*"Fix it"/,
    );
    expect(view.policies.find((p) => p.orders[0] === 'Fix it')).toMatchObject({
      status: 'blocked',
    });
    expect(view.policies.filter((p) => p.status === 'active')).toHaveLength(1);
  });

  it('fills a quiet world with its own events when no model writes any', async () => {
    const { director } = open(null);
    director.start('pakistan-2026');
    director.advance(120);
    await director.idle();
    const kinds = new Set(director.view().events.map((e) => e.kind));
    expect([...kinds].filter((k) => !k.includes('.')).length).toBeGreaterThanOrEqual(3);
    expect(director.view().events.every((e) => e.size !== 'major' || e.kind.includes('.'))).toBe(
      true,
    );
  });
});
