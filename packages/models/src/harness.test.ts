import type { Server } from 'node:http';
import type { ModelSettings } from '@statecraft/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adapterFor } from './adapters.ts';
import { createHarness, systemPrompt } from './harness.ts';
import {
  type AdjudicateIn,
  actorReply,
  chronicleWrite,
  dropInvented,
  dropRepeated,
  INSTRUMENT_REFS,
  policyCompile,
  policyReact,
  policyRead,
  type ReadIn,
  renumber,
  turnAdjudicate,
  turnReactions,
} from './jobs.ts';
import { partialStrings } from './partial.ts';
import { clipWords, mend } from './shape.ts';
import { startStandIn } from './standin.ts';

/**
 * The harness against a server that behaves like LM Studio: it streams, it reports usage,
 * and it holds replies to the JSON schema. Reached over real HTTP through the real adapter.
 */
const PORT = 4393;
let standIn: Server;
const regions = [
  { id: 'north', label: 'Northern Province' },
  { id: 'south', label: 'Southern Province' },
];
const office = { title: 'Prime Minister', powers: ['budget', 'executive', 'security'] };
const readIn: ReadIn = {
  card: { id: 'c1', text: 'Cut the fuel subsidy sharply in the Northern Province.' },
  office,
  standing: [],
  instruments: INSTRUMENT_REFS,
  regions,
};
const context = { resolution: 'test', brief: 'Testland has two provinces.' };
const settings = (model: string): ModelSettings => ({
  kind: 'openai',
  baseUrl: `http://127.0.0.1:${PORT}/v1`,
  model,
  keyEnv: '',
});

beforeAll(async () => {
  standIn = await startStandIn(PORT);
});
afterAll(() => standIn.close());

describe('the harness', () => {
  it('measures each call, and stops describing the shape once the server enforces it', async () => {
    const adapter = adapterFor(settings('standin'), {});
    if (!adapter) throw new Error('no adapter');
    const harness = createHarness({ settings: () => settings('standin'), adapter });

    // Nothing is assumed: until a reply comes back in the schema's shape, the prompt says it.
    expect(adapter.schemaEnforced?.()).toBe(false);
    expect(systemPrompt(policyRead, context.brief, false)).toContain('Output shape');

    const first = await harness.run(policyRead, readIn, context);
    expect(first.via).toBe('model');
    expect(first.record.strategy).toBe('schema');
    expect(first.record.schemaEnforced).toBe(true);
    // Streamed, so the wait for the first token is told apart from the generation.
    expect(first.record.ttftMs).toBeTypeOf('number');
    expect(first.record.tokensPerSecond).toBeTypeOf('number');
    expect(first.record.tokensIn).toBeGreaterThan(0);
    expect(first.record.tokensOut).toBeGreaterThan(0);
    expect(first.record.fixes).toEqual([]);

    // Proven: later calls no longer pay for a description of the output on every prompt.
    expect(adapter.schemaEnforced?.()).toBe(true);
    expect(systemPrompt(policyRead, context.brief, true)).not.toContain('Output shape');
  });

  it('falls back to plain prompting on a server that takes neither a schema nor a stream', async () => {
    const harness = createHarness({ settings: () => settings('standin-plain') });
    const run = await harness.run(policyRead, readIn, context);
    expect(run.via).toBe('model');
    expect(run.record.strategy).toBe('prompt');
    expect(run.record.schemaEnforced).toBe(false);
    expect(run.record.ttftMs).toBeUndefined();
    expect(run.output.instrument).toBe('fuel_subsidy_cut');
  });

  it('knows a model on this machine from a hosted one', () => {
    const harness = createHarness({ settings: () => settings('standin') });
    expect(harness.oneAtATime('narrator')).toBe(true);
    const hosted = createHarness({
      settings: () => ({ kind: 'openai', baseUrl: '', model: 'gpt-x', keyEnv: '' }),
    });
    expect(hosted.oneAtATime('narrator')).toBe(false);
  });
});

describe('a reply still being written', () => {
  it('gives up its prose as it grows, by where each piece of text sits', () => {
    const whole =
      '{"why":"brief","answers":{"a1":{"kind":"statement","text":"He said \\"no\\".\\nThen left."},"a2":{"kind":"silence","text":"Nothing yet."}},"n":[1,"two"]}';
    expect(partialStrings(whole)).toEqual({
      why: 'brief',
      'answers.a1.kind': 'statement',
      'answers.a1.text': 'He said "no".\nThen left.',
      'answers.a2.kind': 'silence',
      'answers.a2.text': 'Nothing yet.',
      'n.1': 'two',
    });
    // Cut anywhere, it returns what has arrived and never throws.
    const upTo = (marker: string) => whole.slice(0, whole.indexOf(marker) + marker.length);
    expect(partialStrings(upTo('He said'))['answers.a1.text']).toBe('He said');
    // A half-written escape is held back until the rest of it arrives.
    expect(partialStrings(upTo('He said \\'))['answers.a1.text']).toBe('He said ');
    expect(partialStrings(upTo('"a2":{"ki'))['answers.a2.kind']).toBeUndefined();
    for (let cut = 0; cut <= whole.length; cut++) partialStrings(whole.slice(0, cut));
    // Thinking and code fences around the object are not prose.
    expect(partialStrings('<think>hmm "x"')).toEqual({});
    expect(partialStrings('<think>hmm</think>```json\n{"body":"It beg')).toEqual({
      body: 'It beg',
    });
  });
});

describe('a per-call schema', () => {
  const input: AdjudicateIn = {
    period: { from: '2026-01-01', to: '2026-01-31', days: 30 },
    state: { inflation: 5 },
    regions,
    actions: [
      {
        id: 'p1',
        by: 'gov',
        summary: 'Cut fuel subsidies.',
        stage: 'announced',
        landed: 'partial',
        allowed: [
          { on: 'inflation', range: [1.1, 2.1], unit: 'points' },
          { on: 'spending.subsidies', range: [-1.4, -0.7], unit: '% GDP' },
        ],
      },
    ],
    happenings: [
      {
        id: 'h1',
        kind: 'strike',
        size: 'minor',
        when: '2026-01-05',
        where: 'Northern Province',
        gist: 'Traders in Northern Province shut their shops for a day.',
      },
      {
        id: 'h2',
        kind: 'court',
        size: 'minor',
        when: '2026-01-19',
        gist: 'The highest court took up a petition challenging a recent government decision.',
      },
    ],
    recent: [{ id: 'e1', when: '2025-12-20', summary: 'Unions warned against price rises.' }],
  };

  it('names the only answers allowed: the actions, their variables, and the happenings to word', () => {
    // biome-ignore lint/suspicious/noExplicitAny: walking a JSON schema in a test.
    const schema = turnAdjudicate.schema(input) as any;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['why', 'outcomes', 'events']);
    expect(Object.keys(schema.properties.outcomes.properties)).toEqual(['p1']);
    const effects = schema.properties.outcomes.properties.p1.properties.effects;
    expect(Object.keys(effects.properties)).toEqual(['inflation', 'spending.subsidies']);
    expect(effects.properties.inflation).toEqual({ type: 'number', minimum: 1.1, maximum: 2.1 });
    // The landing is not the judge's to choose: only the one the dice gave is on offer.
    expect(schema.properties.outcomes.properties.p1.properties.result.enum).toEqual(['partial']);
    // Nor are events: what happened, where and when is settled, and only a line is asked for.
    expect(schema.properties.events.required).toEqual(['h1', 'h2']);
    expect(schema.properties.events.properties.h1).toEqual({ type: 'string', maxLength: 200 });
    expect(schema.properties.events.additionalProperties).toBe(false);
  });

  it('puts small mistakes right in place, and says when the shape itself was wrong', () => {
    const schema = turnAdjudicate.schema(input);
    const fixed = mend(
      {
        why: 'ok',
        outcomes: {
          p1: {
            result: 'partial',
            // A list of pairs where named numbers were wanted, one of them out of range.
            effects: [
              { on: 'inflation', value: 9 },
              { on: 'spending.subsidies', value: -1 },
            ],
            note: 'Done.',
            confidence: 0.9,
          },
        },
        events: {
          h1: 'Shopkeepers along the Grand Bazaar in the northern capital pulled down their shutters for a day.',
          h2: null,
          h9: 'A coup.',
        },
      },
      schema,
    );
    const out = turnAdjudicate.output.parse(fixed.value);
    expect(out.outcomes.p1?.effects).toEqual({ inflation: 2.1, 'spending.subsidies': -1 });
    expect(Object.keys(out.events)).toEqual(['h1']);
    expect(fixed.fixes).toEqual([
      'the reply.outcomes.p1.effects: read a list of pairs as named values',
      'the reply.outcomes.p1.effects.inflation: 9 clamped to 2.1',
      'the reply.outcomes.p1: dropped the unasked field "confidence"',
      'the reply.events: dropped the unasked field "h9"',
    ]);
    // A happening the judge left unworded still happens, in the plain line it was given.
    expect(turnAdjudicate.mend?.(input, out)).toEqual([
      'events.h2: the plain line is used, since the one written was not written',
    ]);
    expect(out.events.h2).toBe(input.happenings[1]?.gist);
    expect(turnAdjudicate.check(input, out)).toEqual([]);
    // Fields nobody asked for and values of the wrong type: this server is not enforcing it.
    expect(fixed.shapeOk).toBe(false);
  });

  it('asks for a whole turn of answers at once, each actor with only its own options', () => {
    const items = [
      {
        key: 'a1',
        order: {
          id: 'p1',
          text: 'Launch an operation.',
          summary: 'Security operation.',
          instrument: 'security_operation',
        },
        actor: {
          id: 'army',
          name: 'The Army',
          kind: 'military',
          stance: 'neutral' as const,
          voice: 'terse',
        },
        options: [{ id: 'back_publicly', label: 'Back it' }],
      },
      {
        key: 'a2',
        order: {
          id: 'p1',
          text: 'Launch an operation.',
          summary: 'Security operation.',
          instrument: 'security_operation',
        },
        actor: {
          id: 'ttp',
          name: 'The TTP',
          kind: 'militant',
          stance: 'hostile' as const,
          voice: 'threatening',
        },
        options: [{ id: 'step_up_attacks', label: 'Step up attacks' }],
      },
    ];
    const batch = { items, words: 60, state: {}, recent: [] };
    // biome-ignore lint/suspicious/noExplicitAny: walking a JSON schema in a test.
    const schema = turnReactions.schema(batch) as any;
    expect(schema.properties.answers.required).toEqual(['a1', 'a2']);
    expect(schema.properties.answers.properties.a1.properties.option.enum).toEqual([
      'back_publicly',
    ]);
    expect(schema.properties.answers.properties.a2.properties.option.enum).toEqual([
      'step_up_attacks',
    ]);

    // With no model, every item still gets its own templated answer.
    const out = turnReactions.fallback(batch);
    expect(Object.keys(out.answers)).toEqual(['a1', 'a2']);
    expect(out.answers.a1).toMatchObject({ kind: 'action', option: 'back_publicly' });
    expect(turnReactions.check(batch, out)).toEqual([]);
  });

  it('reads an action nobody can take as a statement instead of asking again', () => {
    const reactIn = {
      order: {
        id: 'p1',
        text: 'Open talks.',
        summary: 'Talks.',
        instrument: 'regional_settlement',
      },
      actor: {
        id: 'ppp',
        name: 'The PPP',
        kind: 'ally' as const,
        stance: 'friendly' as const,
        voice: 'smooth',
      },
      options: [{ id: 'demand_concessions', label: 'Demand concessions' }],
      words: 60,
      state: {},
      recent: [],
    };
    const out = {
      why: '',
      kind: 'action' as const,
      text: 'The PPP welcomed the move.',
      option: 'walk_out',
    };
    const fixes = policyReact.mend?.(reactIn, out) ?? [];
    expect(fixes).toEqual([
      'kind: read as a statement, since "walk_out" is not one of its options',
    ]);
    expect(out).toMatchObject({ kind: 'statement' });
    expect(out.option).toBeUndefined();
  });

  // Each of these cost a whole second call in the first month played on a real local model.
  it('takes out a sentence resting on an invented figure, and keeps the rest', () => {
    const known = { state: { inflation: 10.3 } };
    const text =
      'Prices are rising at 10.3% a year. Fares will jump by 30% within a month. "We warned them," he said.';
    expect(dropInvented(text, known)).toEqual({
      text: 'Prices are rising at 10.3% a year. "We warned them," he said.',
      dropped: 1,
    });
    expect(dropInvented('Nothing to see.', known)).toEqual({ text: 'Nothing to see.', dropped: 0 });
    // With nothing sound left, the reply has to be asked for again.
    expect(dropInvented('Fares will jump by 30%.', known)).toBeUndefined();
  });

  it('overrules a landing the dice did not give, and a line of news that invents or moralises', () => {
    const out = {
      why: '',
      outcomes: {
        p1: { result: 'as_intended' as const, effects: {}, note: 'Cut by 37% of GDP at once.' },
      },
      events: {
        h1: 'Some 40,000 traders shut their shops in the northern capital.',
        h2: 'Tragically, the highest court agreed to hear a petition against the decision.',
      },
    };
    expect(turnAdjudicate.mend?.(input, out)).toHaveLength(4);
    expect(out.outcomes.p1).toMatchObject({
      result: 'partial',
      note: 'Carried out in part, with the usual friction.',
    });
    expect(out.events).toEqual({ h1: input.happenings[0]?.gist, h2: input.happenings[1]?.gist });
  });

  it('trims prose at a sentence end without flattening its paragraphs', () => {
    const text = 'One two three four. Five six seven eight.\n\nNine ten eleven twelve. Thirteen.';
    expect(clipWords(text, 13)).toBe(text);
    expect(clipWords(text, 12)).toBe(
      'One two three four. Five six seven eight.\n\nNine ten eleven twelve.',
    );
    expect(clipWords('One two three four five six seven', 4)).toBe('One two three four…');
  });
});

describe('reading orders', () => {
  it('does not let a model set a clear order aside as too vague', () => {
    const compileIn = {
      cards: [
        { id: 'c1', text: 'Open talks with tribal elders in the Northern Province.' },
        { id: 'c2', text: 'Nationalise the three largest private banks.' },
        { id: 'c3', text: 'Fix it' },
      ],
      standing: [],
      office,
      instruments: INSTRUMENT_REFS,
      regions,
    };
    // What the local model actually did in play: asked how to implement orders any
    // government would simply carry out.
    const out = {
      why: '',
      policies: [],
      duplicates: [],
      conflicts: [],
      needsDetail: [
        { card: 'c1', question: 'What specific action is intended?' },
        { card: 'c2', question: 'How should it be implemented and funded?' },
        { card: 'c3', question: 'Fix what?' },
      ],
    };
    const fixes = policyCompile.mend?.(compileIn, out) ?? [];
    expect(fixes).toHaveLength(2);
    expect(out.policies).toMatchObject([
      { instrument: 'regional_settlement', region: 'north', fromCards: ['c1'] },
      { instrument: 'novel', fromCards: ['c2'] },
    ]);
    // Two words that say nothing are still too vague, and are answered as such in the world.
    expect(out.needsDetail).toEqual([{ card: 'c3', question: 'Fix what?' }]);
    expect(policyCompile.check(compileIn, out)).toEqual([]);
  });
});

describe('answers from people', () => {
  const said =
    'I recommend maintaining troop presence until credible intelligence confirms a sustained de-escalation. Only then can we consider scaling back operations without jeopardising national integrity.';
  const replyIn = {
    actor: {
      id: 'ps',
      name: 'Your Principal Secretary',
      kind: 'advisor',
      stance: 'friendly',
      voice: 'dry',
    },
    asker: 'The Prime Minister',
    question: 'Your recommendation is noted, but I still need you to suggest a way.',
    knows: [],
    state: {},
    policies: [],
    earlier: [
      { question: 'Can I withdraw the army?', reply: `A withdrawal risks a vacuum. ${said}` },
    ],
    words: 160,
  };

  // Seen in play: the same paragraph came back four answers running.
  it('takes out what was already said word for word, and asks again if nothing else was said', () => {
    expect(
      dropRepeated(`Here is how to do it. ${said}`, [replyIn.earlier[0]?.reply ?? '']),
    ).toEqual({
      text: 'Here is how to do it.',
      dropped: 2,
    });
    expect(dropRepeated(said, [replyIn.earlier[0]?.reply ?? ''])).toBeUndefined();
    const parrot = {
      why: '',
      reply: said,
      details: [],
      orders: [],
      lever: { kind: 'none' as const, claim: '' },
    };
    actorReply.mend?.(replyIn, parrot);
    expect(actorReply.check(replyIn, parrot)).toEqual([
      'You repeated what you said before, word for word. Answer the latest question with something new.',
    ]);
  });

  it('lets an adviser draft orders, and nobody else; nothing said to an adviser is a bargain', () => {
    const helpful = {
      why: '',
      reply: `Announce it in stages. ${said}`,
      details: [],
      orders: [
        'Announce that troops will pull back from two districts if attacks stop for thirty days.',
        'ok',
      ],
      lever: { kind: 'threat' as const, claim: 'x' },
    };
    const fixes = actorReply.mend?.(replyIn, helpful) ?? [];
    expect(helpful.reply).toBe('Announce it in stages.');
    expect(helpful.orders).toHaveLength(1);
    expect(helpful.lever.kind).toBe('none');
    expect(fixes).toHaveLength(2);
    expect(actorReply.check(replyIn, helpful)).toEqual([]);

    const rival = { ...helpful, orders: ['Withdraw the army from the province at once.'] };
    actorReply.mend?.({ ...replyIn, actor: { ...replyIn.actor, kind: 'opposition' } }, rival);
    expect(rival.orders).toEqual([]);
    // The schema leaves an adviser room to give a plan.
    // biome-ignore lint/suspicious/noExplicitAny: walking a JSON schema in a test.
    const schema = actorReply.schema(replyIn) as any;
    expect(schema.properties.orders.maxItems).toBe(5);
    expect(schema.properties.reply.maxLength).toBeGreaterThan(1000);
  });
});

describe('mending a plan', () => {
  it('takes a list item out with its number, keeps line breaks, and lets a plan name its own deadlines', () => {
    const plan =
      '1. Brief the army chief on the timetable for the withdrawal.\n2. Announce a pull-back within 48 hours of a verified lull.\n3. Tell the press that 73% of the province backs it.';
    // A deadline is a proposal; a statistic nobody gave is a claim.
    expect(dropInvented(plan, {}, true)).toEqual({
      text: '1. Brief the army chief on the timetable for the withdrawal.\n2. Announce a pull-back within 48 hours of a verified lull.',
      dropped: 1,
    });
    // The same step said before goes, number and all, without leaving "1. 2." behind.
    expect(
      dropRepeated(plan, ['Brief the army chief on the timetable for the withdrawal. Then wait.'])
        ?.text,
    ).toBe(
      '2. Announce a pull-back within 48 hours of a verified lull.\n3. Tell the press that 73% of the province backs it.',
    );
  });
});

describe('tidying a plan', () => {
  it('numbers the steps again, and cuts a reply that ran on into its other fields', () => {
    expect(renumber('2. Convene a task force.\n4. Prepare a fallback.')).toBe(
      '1. Convene a task force.\n2. Prepare a fallback.',
    );
    expect(renumber('We met on 5. November was cold.')).toBe('We met on 5. November was cold.');
    const reply = {
      why: '',
      reply: '1. Announce it.\n2. Record it in the Gazette.\norders:["Announce it."\n]',
      details: [],
      orders: [],
      lever: { kind: 'none' as const, claim: '' },
    };
    actorReply.mend?.(
      {
        actor: { id: 'ps', name: 'PS', kind: 'advisor', stance: 'friendly', voice: '' },
        asker: 'The Prime Minister',
        question: 'How?',
        knows: [],
        state: {},
        policies: [],
        earlier: [],
        words: 160,
      },
      reply,
    );
    expect(reply.reply).toBe('1. Announce it.\n2. Record it in the Gazette.');
  });
});

describe('details of texture', () => {
  it('lets advice name names and dates, and keeps the name a thing was first given', () => {
    const input = {
      actor: { id: 'ps', name: 'PS', kind: 'advisor', stance: 'friendly', voice: '' },
      asker: 'The Prime Minister',
      question: 'Should I ask the Supreme Court to restrict the protests?',
      knows: [],
      state: { Inflation: 10.3 },
      policies: [],
      earlier: [],
      words: 500,
      canon: [{ label: 'Chief Justice of Pakistan', value: 'Justice Tariq Siddiqui' }],
    };
    const out = {
      why: '',
      reply:
        '## What the court will do\n\nChief Justice Siddiqui will not rubber-stamp a ban under **Article 16**. Meet the Wifaq ul Madaris leadership on 18 February and offer Rs. 5 billion for curriculum reform.',
      details: [
        { label: 'chief justice of pakistan', value: 'Justice Someone Else' },
        { label: 'Head of Wifaq ul Madaris', value: 'Maulana Hanif Jalandhari' },
      ],
      orders: [],
      lever: { kind: 'none' as const, claim: '' },
    };
    const fixes = actorReply.mend?.(input, out) ?? [];
    // Dates, amounts, articles and headings are all left alone: that is the advice.
    expect(out.reply).toContain('18 February');
    expect(out.reply).toContain('## What the court will do');
    expect(out.reply).toContain('**Article 16**');
    // The Chief Justice already has a name, so the second one offered is not recorded.
    expect(out.details).toEqual([
      { label: 'Head of Wifaq ul Madaris', value: 'Maulana Hanif Jalandhari' },
    ]);
    expect(fixes).toEqual(['details: dropped 1 already on record']);
    expect(actorReply.check(input, out)).toEqual([]);
  });
});

describe('full accounts', () => {
  // Seen on a real model: an account had the Prime Minister convene a cabinet meeting, and
  // another had his Principal Secretary promise the crowd a review of the tax.
  it('never puts words or acts to the player or their own office', () => {
    const input = {
      event: {
        id: 'e1',
        when: '2026-11-13 09:00',
        kind: 'strike',
        size: 'significant' as const,
        summary: 'Traders in Punjab shut their shops for a day over taxes and power bills.',
        numbers: [],
      },
      related: [],
      weight: 'significant' as const,
      words: 300,
      level: 'standard' as const,
      reader: 'Shehbaz Sharif, Prime Minister',
      office: ['Principal Secretary', 'Finance Minister'],
    };
    const out = {
      why: '',
      details: [{ label: 'Head of the Lahore traders', value: 'Naeem Mir' }],
      body: '**Lahore, 13 November 2026, 09:00**\n\nShutters stayed down along the Old Bazaar. "We cannot pay twice," said Naeem Mir. The Principal Secretary arrived and promised a review of the tax. Prime Minister Shehbaz Sharif convened his cabinet that night. By dusk the lanes were empty.',
    };
    const fixes = chronicleWrite.mend?.(input, out) ?? [];
    expect(fixes).toEqual([
      'body: took out 2 sentence(s) that put words or acts to the player or their office',
    ]);
    expect(out.body).toContain('Naeem Mir');
    expect(out.body).toContain('**Lahore, 13 November 2026, 09:00**');
    expect(out.body).not.toMatch(/Principal Secretary|Prime Minister|Sharif/);
    expect(chronicleWrite.check(input, out)).toEqual([]);
    // What the record itself says the player did may be reported.
    const recorded = {
      ...input,
      related: [{ when: '2026-11-12', summary: 'The Prime Minister ordered a rise in the tax.' }],
    };
    const report = {
      why: '',
      details: [],
      body: 'The Prime Minister ordered the rise on Thursday.',
    };
    expect(chronicleWrite.mend?.(recorded, report)).toEqual([]);
    expect(chronicleWrite.check(recorded, report)).toEqual([]);
  });
});
