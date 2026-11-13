import type { Server } from 'node:http';
import type { ModelSettings } from '@statecraft/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adapterFor } from './adapters.ts';
import { createHarness, systemPrompt } from './harness.ts';
import {
  type AdjudicateIn,
  dropInvented,
  INSTRUMENT_REFS,
  policyReact,
  policyRead,
  type ReadIn,
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
        allowed: [
          { on: 'inflation', range: [1.1, 2.1], unit: 'points' },
          { on: 'spending.subsidies', range: [-1.4, -0.7], unit: '% GDP' },
        ],
      },
    ],
    eventLimits: { 'grievance.all': 3 },
    recent: [{ id: 'e1', when: '2025-12-20', summary: 'Unions warned against price rises.' }],
    surpriseBudget: { major: 0, significant: 1 },
  };

  it('names the only answers allowed: the actions, their variables, the regions and the causes', () => {
    // biome-ignore lint/suspicious/noExplicitAny: walking a JSON schema in a test.
    const schema = turnAdjudicate.schema(input) as any;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['why', 'outcomes', 'events']);
    expect(Object.keys(schema.properties.outcomes.properties)).toEqual(['p1']);
    const effects = schema.properties.outcomes.properties.p1.properties.effects;
    expect(Object.keys(effects.properties)).toEqual(['inflation', 'spending.subsidies']);
    expect(effects.properties.inflation).toEqual({ type: 'number', minimum: 1.1, maximum: 2.1 });
    const event = schema.properties.events.items.properties;
    expect(event.place.enum).toEqual(['north', 'south']);
    expect(event.causes.items.enum).toEqual(['e1', 'p1']);
    expect(Object.keys(event.effects.properties)).toEqual(['grievance.all']);
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
        events: [
          {
            kind: 'strike',
            size: 'minor',
            summary: 'Transporters struck for a day.',
            place: null,
            inDays: '4',
            effects: { 'grievance.all': 7 },
            causes: ['e1'],
          },
        ],
      },
      schema,
    );
    const out = turnAdjudicate.output.parse(fixed.value);
    expect(out.outcomes.p1?.effects).toEqual({ inflation: 2.1, 'spending.subsidies': -1 });
    expect(out.events[0]).toMatchObject({ inDays: 4, effects: { 'grievance.all': 3 } });
    expect(out.events[0]?.place).toBeUndefined();
    expect(turnAdjudicate.check(input, out)).toEqual([]);
    expect(fixed.fixes).toEqual([
      'the reply.outcomes.p1.effects: read a list of pairs as named values',
      'the reply.outcomes.p1.effects.inflation: 9 clamped to 2.1',
      'the reply.outcomes.p1: dropped the unasked field "confidence"',
      'the reply.events[0].inDays: read "4" as a number',
      'the reply.events[0].effects.grievance.all: 7 clamped to 3',
    ]);
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

  it('takes a grave event the budget does not allow down a size, and offers no size it rules out', () => {
    // biome-ignore lint/suspicious/noExplicitAny: walking a JSON schema in a test.
    const schema = turnAdjudicate.schema(input) as any;
    expect(schema.properties.events.items.properties.size.enum).toEqual([
      'colour',
      'minor',
      'significant',
    ]);
    const event = (size: 'major' | 'significant', causes: string[]) => ({
      kind: 'strike',
      size,
      summary: 'A strike.',
      inDays: 2,
      effects: {},
      causes,
    });
    const out = {
      why: '',
      outcomes: turnAdjudicate.fallback(input).outcomes,
      events: [event('major', ['e1']), event('significant', []), event('significant', [])],
    };
    expect(turnAdjudicate.mend?.(input, out)).toHaveLength(3);
    expect(out.events.map((e) => e.size)).toEqual(['significant', 'minor', 'minor']);
    expect(turnAdjudicate.check(input, out)).toEqual([]);
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
