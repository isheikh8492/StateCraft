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
    // The stand-in is a server on this machine, so the whole turn's answers are asked for in
    // one call instead of three that would only queue behind each other.
    expect(jobs().slice(2)).toEqual(['turn.reactions']);
    const batch = JSON.parse(calls[2]?.input ?? '{}') as {
      words: number;
      items: { key: string }[];
    };
    // At the standard detail level each of them is given room for a full paragraph.
    expect(batch.words).toBe(150);
    expect(batch.items.map((i) => i.key)).toEqual(['a1', 'a2', 'a3']);
    expect(director.view().arriving.reactions).toBe(false);

    // Running the clock an hour with nothing ordered: no calls at all.
    calls.length = 0;
    director.move({ hours: 1 }, false);
    await director.idle();
    expect(director.view().campaign).toMatchObject({ day: 3, hour: 10 });
    expect(jobs()).toEqual([]);
    // A day or a few days: nothing is read or judged before the turn commits, so the turn
    // itself is instant. What follows it, after the commit, is somebody in the cast acting
    // on their own and the day's news being worded properly: the judge is asked only for
    // lines, with no action to judge.
    director.move({ days: 1 }, false);
    await director.idle();
    director.move({ days: 3 }, false);
    await director.idle();
    expect(jobs().every((job) => job === 'turn.reactions' || job === 'turn.adjudicate')).toBe(true);
    for (const call of calls.filter((c) => c.job.startsWith('turn.adjudicate')))
      expect((JSON.parse(call.input) as { actions: unknown[] }).actions).toEqual([]);

    // A longer run is judged once. With two months gone, some of the cast have moved first.
    calls.length = 0;
    director.move({ days: 60 }, false);
    await director.idle();
    expect(jobs()).toEqual(['turn.adjudicate', 'turn.reactions']);
    const moves = JSON.parse(calls[1]?.input ?? '{}') as {
      items: { order?: unknown; motive?: { reason: string } }[];
    };
    expect(moves.items).toHaveLength(2);
    expect(moves.items.every((i) => i.order === undefined && i.motive?.reason)).toBe(true);
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

    // What someone said can be opened into a full account too.
    const said = director.view().chronicle.find((e) => e.speaker);
    director.expandEntry(said?.id ?? '');
    await director.idle();
    expect(director.view().chronicle.find((e) => e.id === said?.id)?.full).toContain(said?.quote);

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

describe('people', () => {
  it('holds you to your word: an undertaking earns credit, keeping it is noticed, breaking it costs more', async () => {
    const { director, add } = open(null);
    director.start('pakistan-2026');
    const cast = (id: string) => director.view().cast.find((c) => c.id === id);

    // Your own office warns you before an order goes out, without a model.
    add('Raise the sales tax.');
    expect(director.view().cards[0]?.advice?.map((a) => a.text)).toEqual([
      'This will need a vote in the National Assembly.',
      'Expect objections from The Pakistan Peoples Party, Pakistan Tehreek-e-Insaf and The Federation of Pakistan Chambers of Commerce and Industry.',
    ]);
    director.deleteCard(director.view().cards[0]?.id ?? '');

    // Words of friendship move nobody. Something put on the table does.
    director.ask('ppp', 'We have always valued your party.');
    await director.idle();
    expect(cast('ppp')).toMatchObject({ trend: 'steady', undertakings: [] });
    director.ask('ppp', 'In return for your votes I will expand cash transfers in Sindh.');
    director.ask('juif', 'You have my word: I will open talks, not send troops.');
    await director.idle();
    expect(cast('ppp')).toMatchObject({ trend: 'warming', undertakings: [{ state: 'open' }] });

    // Keeping it: the order is noticed, and they write to say so.
    add('Expand cash transfers to poor households.');
    director.move({ days: 7 }, false);
    await director.idle();
    expect(cast('ppp')?.undertakings[0]?.state).toBe('kept');
    expect(director.view().talks.ppp?.at(-1)).toMatchObject({
      incoming: true,
      reply: expect.stringMatching(/did what you said/),
    });
    expect(cast('ppp')?.unread).toBe(1);
    director.markRead('ppp');
    expect(cast('ppp')?.unread).toBe(0);

    // Breaking it: the deadline passes, it is said in public, and the standing falls.
    director.move({ days: 45 }, false);
    await director.idle();
    expect(cast('juif')).toMatchObject({ trend: 'cooling', undertakings: [{ state: 'broken' }] });
    const broken = director
      .view()
      .chronicle.find((e) => e.headline.includes('gone back on an undertaking'));
    expect(broken?.story).toEqual({
      id: 'actor:juif',
      title: 'Dealings with Jamiat Ulema-e-Islam (F)',
    });
  });

  it('lets answers come in by the hour, and lets you look back at how things stood', async () => {
    const { director, add } = open(null);
    director.start('pakistan-2026');
    add('Launch a security operation in Khyber Pakhtunkhwa.');
    director.move({ hours: 1 }, false);
    await director.idle();
    // An hour after the order: the first answer is in, two more are on their way.
    expect(director.view().policies[0]?.reactions).toHaveLength(1);
    expect(director.view().arriving.later).toBe(2);
    director.move({ hours: 1 }, false);
    await director.idle();
    director.move({ hours: 1 }, false);
    await director.idle();
    expect(director.view().policies[0]?.reactions).toHaveLength(2);
    director.move({ days: 1 }, false);
    await director.idle();
    expect(director.view().policies[0]?.reactions).toHaveLength(3);
    // Nothing more is owed on the order. At most, somebody is about to move later today.
    expect(director.view().arriving.later).toBeLessThanOrEqual(1);

    // Looking back shows the world as it was, without rewinding anything.
    const first = director.view().turns.at(-1);
    const moment = director.moment(first?.id ?? '');
    expect(moment).toMatchObject({ date: '2026-11-01' });
    expect(moment.world.regions.find((r) => r.id === 'balochistan')?.status).toBe('contested');
    expect(director.view().branches).toHaveLength(1);
  });
});

describe('a world that moves first', () => {
  it('has the cast act unprompted, for reasons the engine gives, with consequences', async () => {
    const { director } = open(null);
    director.start('pakistan-2026');
    // Nothing is ordered at all: the clock is simply run for three months.
    for (let month = 0; month < 3; month++) {
      director.advance(30);
      await director.idle();
    }
    const view = director.view();
    const moves = view.events.filter((e) => e.kind === 'move');
    // Two each month: a month always brings moves, and no more than two a turn.
    expect(moves).toHaveLength(6);
    // Nobody moves twice within a fortnight, so a turn's two movers are different people.
    const said = view.chronicle.filter((e) => e.speaker && moves.some((m) => m.id === e.id));
    expect(said).toHaveLength(6);
    for (const turn of view.turns) {
      const names = said.filter((e) => e.turn === turn.id).map((e) => e.speaker);
      expect(new Set(names).size).toBe(names.length);
    }
    // Each is news in its own right, is filed under dealings with that actor, and answers no
    // order: the player gave none.
    expect(view.policies).toEqual([]);
    expect(moves.every((m) => m.size === 'significant')).toBe(true);
    expect(moves.every((m) => m.causes.length === 1 && m.causes[0]?.startsWith('actor:'))).toBe(
      true,
    );
    expect(said.every((e) => /made a move|spoke out/.test(e.headline))).toBe(true);
    expect(said.every((e) => e.story.id.startsWith('actor:'))).toBe(true);
    // Who moves is weighted by who has reason to: Balochistan is contested from the first
    // day, so the armed group fighting there is among the first to act.
    expect(said.map((e) => e.speaker)).toContain('The Baloch Liberation Army');
    // A move can set something in train that the dice settle later, citing the same actor.
    const beats = view.events.filter((e) => e.kind === 'beat');
    expect(beats.length).toBeGreaterThan(0);
    expect(beats.every((b) => b.causes[0]?.startsWith('actor:'))).toBe(true);

    // The same campaign played again makes the same moves: it is dice, not chance.
    n++;
    const again = open(null);
    again.director.start('pakistan-2026');
    for (let month = 0; month < 3; month++) {
      again.director.advance(30);
      await again.director.idle();
    }
    expect(again.director.view().events.filter((e) => e.kind === 'move')).toEqual(moves);
  }, 30_000);
});

describe('writing', () => {
  it('shows prose as it is written, and saves only the finished text', async () => {
    const { director, add } = open('standin-typing');
    director.start('pakistan-2026');
    const seen = new Map<string, (string | null)[]>();
    /** Ids in the order their first words appeared. */
    const began: string[] = [];
    director.watchDrafts((id, text) => {
      seen.set(id, [...(seen.get(id) ?? []), text]);
      if (text && !began.includes(id)) began.push(id);
    });
    let speaking = 0;
    director.subscribe(() => {
      speaking = Math.max(speaking, director.view().arriving.writing.length);
    });
    /** The words that reached the screen for one piece, and whether the writing was closed. */
    const drafts = (id: string) => {
      const all = seen.get(id) ?? [];
      return {
        closed: all.at(-1) === null,
        texts: all.filter((t): t is string => t !== null && t !== ''),
      };
    };

    // An answer from a person grows on screen, and what is saved is where it ended.
    director.ask('interior_minister', 'How do things stand in Balochistan?');
    await director.idle();
    const turn = director.view().talks.interior_minister?.[0];
    const answer = drafts(turn?.id ?? '');
    expect(answer.closed).toBe(true);
    expect(answer.texts.length).toBeGreaterThan(0);
    expect(answer.texts.every((t) => turn?.reply?.startsWith(t))).toBe(true);
    expect(answer.texts.at(-1)).toBe(turn?.reply);

    // The cast's answers to an order arrive the same way, each under its own name.
    add('Declare an immediate ceasefire and open talks with the insurgents in Balochistan.');
    director.move({ days: 2 }, false);
    await director.idle();
    const policy = director.view().policies[0];
    expect(speaking).toBe(3);
    expect(director.view().arriving.writing).toEqual([]);
    for (const reaction of policy?.reactions ?? []) {
      const written = drafts(reaction.id);
      expect(written.closed).toBe(true);
      expect(written.texts.length).toBeGreaterThan(1);
      expect(written.texts.every((t) => reaction.text.startsWith(t))).toBe(true);
    }
    // In one call the actors are written one after another, so they begin in that order.
    const ids = (policy?.reactions ?? []).map((reaction) => reaction.id);
    expect(began.filter((id) => ids.includes(id))).toEqual(ids);

    // A full account is written out the same way when its entry is opened.
    const entry = director.view().chronicle.find((e) => e.speaker);
    director.expandEntry(entry?.id ?? '');
    await director.idle();
    const full = director.view().chronicle.find((e) => e.id === entry?.id)?.full ?? '';
    const account = seen.get(entry?.id ?? '')?.filter((t): t is string => !!t) ?? [];
    expect(account.length).toBeGreaterThan(1);
    // What somebody said is given a full paragraph's room, so what is saved is what was
    // watched arriving, paragraphs intact.
    expect(full.length).toBeGreaterThan(100);
    expect(full).toContain('\n\n');
    expect(account.at(-1)).toBe(full);

    // Answers due over the coming hours are not shown early.
    seen.clear();
    add('Launch a security operation in Khyber Pakhtunkhwa.');
    director.move({ hours: 1 }, false);
    await director.idle();
    expect([...seen.keys()]).toEqual([]);
    // Nothing is left behind in memory once the writing has ended.
    expect(director.drafts()).toEqual({});
  }, 60_000);
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
    await long.director.idle();

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

describe('the clock by the hour', () => {
  it('runs to the next thing that needs you: hours at a time, never past the next morning', async () => {
    const { director, add } = open(null);
    director.start('pakistan-2026');
    const now = () => {
      const c = director.view().campaign;
      return { day: c?.day ?? 0, hour: c?.hour ?? 0 };
    };
    const next = async () => {
      director.move({ next: true }, false);
      await director.idle();
      return director.view();
    };

    // Orders go out and the clock stops an hour on, when the first answer is in.
    add('Launch a security operation in Khyber Pakhtunkhwa.');
    let view = await next();
    expect(now()).toEqual({ day: 0, hour: 10 });
    expect(view.policies[0]?.reactions).toHaveLength(1);
    expect(view.stoppedFor).toMatch(/ answered\.$/);
    expect(view.turns[0]?.move).toBe('Sent 1 order and ran the clock an hour');
    // The next press stops at the next answer, two hours later, not at some round interval.
    view = await next();
    expect(now()).toEqual({ day: 0, hour: 12 });
    expect(view.policies[0]?.reactions).toHaveLength(2);

    // Keep pressing for a fortnight of game time. Every stop is for a reason, time only ever
    // moves forward, and no press skips more than a night.
    const reasons: string[] = [];
    for (let press = 0; press < 80 && now().day < 14; press++) {
      const before = now();
      view = await next();
      const after = now();
      expect(after.day * 24 + after.hour).toBeGreaterThan(before.day * 24 + before.hour);
      expect(after.day).toBeLessThanOrEqual(before.day + 1);
      if (after.day > before.day) expect(after.hour).toBeLessThanOrEqual(9);
      expect(view.stoppedFor).toBeTruthy();
      reasons.push(view.stoppedFor ?? '');
      // Nothing timed for later today has been let out early.
      for (const entry of view.chronicle)
        expect(entry.day * 24 + (entry.hour ?? 0)).toBeLessThanOrEqual(after.day * 24 + after.hour);
    }
    expect(now().day).toBe(14);
    // It stopped for answers, for people moving on their own, for events, and for quiet mornings.
    expect(reasons.some((r) => r.endsWith('made a move.'))).toBe(true);
    expect(reasons.some((r) => r.startsWith('A new morning'))).toBe(true);
    expect(reasons.some((r) => !/answered\.$|made a move\.$|^A new morning/.test(r))).toBe(true);
    // A day holds several things, each with its hour.
    const days = new Map<number, number>();
    for (const e of view.chronicle) days.set(e.day, (days.get(e.day) ?? 0) + 1);
    expect(Math.max(...days.values())).toBeGreaterThan(2);
    expect(view.chronicle.filter((e) => e.hour !== undefined).length).toBe(view.chronicle.length);

    // Skipping ahead is still there for when it is wanted: a week lands at the same hour.
    const hour = now().hour;
    director.move({ days: 7 }, false);
    await director.idle();
    expect(now()).toEqual({ day: 21, hour });
  }, 60_000);
});
