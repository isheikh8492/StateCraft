import { CATALOGUE, type Direction, type Scale } from '@statecraft/engine';
import { z } from 'zod';
import { matchInstrument, OPPOSITES, type Ref } from './match.ts';

/**
 * The seven M0 model jobs (spec: Model jobs). Each has fixed rules, an output schema,
 * checks the output must pass, and a fallback that needs no model.
 */
export type Role = 'adjudicator' | 'extractor' | 'narrator';

export interface Job<I, O> {
  name: string;
  version: number;
  role: Role;
  /** Fixed instructions. They never change during a campaign. */
  rules: string;
  output: z.ZodType<O>;
  /** The output written compactly, for the prompt. Far shorter than the full JSON Schema. */
  shape: string;
  /** Whether the job needs the scenario's world brief. Most do not, and skipping it saves tokens. */
  usesBrief: boolean;
  /** How many times a rejected answer is sent back before the built-in wording is used. */
  repairs: number;
  maxTokens: number;
  /** Problems with a schema-valid output, in words a model can act on. Empty means it passes. */
  check(input: I, output: O): string[];
  fallback(input: I): O;
}

const ext = { extensions: z.record(z.string(), z.unknown()).optional() };
const SIZES = ['colour', 'minor', 'significant', 'major'] as const;
export type Size = (typeof SIZES)[number];

const NUMBER = /\d+(?:[.,]\d+)*/g;
/** Figures in written text that do not appear anywhere in the input (REQ-JOB-03). */
export function inventedNumbers(text: string, input: unknown): string[] {
  const known = new Set<number>();
  for (const raw of JSON.stringify(input).match(NUMBER) ?? []) {
    const n = Number(raw.replaceAll(',', ''));
    known.add(n);
    known.add(Math.round(n));
    known.add(Math.round(n * 10) / 10);
    known.add(Math.abs(Math.round(n * 10) / 10));
  }
  const invented: string[] = [];
  for (const raw of text.match(NUMBER) ?? []) {
    const n = Number(raw.replaceAll(',', ''));
    // Small counts ("two provinces") are ordinary language, not figures.
    if (Number.isInteger(n) && n <= 12) continue;
    if (!known.has(n)) invented.push(raw);
  }
  return invented;
}

const COMMENTARY =
  /\b(tragic\w*|shocking\w*|sadly|unfortunately|heinous|appalling\w*|deplorabl\w*|it is important to (note|remember)|serves as a reminder|raises (serious )?(ethical|moral) questions|morally)\b/i;

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

// ---------------------------------------------------------------------------------- policy.read

export interface ReadIn {
  card: { id: string; text: string };
  office: { title: string; powers: string[] };
  standing: Ref[];
  instruments: Ref[];
  regions: Ref[];
}
const ReadOut = z.object({
  why: z.string(),
  reading: z.string().min(1),
  instrument: z.string(),
  targets: z.array(z.string()).default([]),
  question: z.string().optional(),
  ...ext,
});
export type ReadOut = z.infer<typeof ReadOut>;

/** Not used in play: boxes are no longer read back to the player. Kept for the model check. */
export const policyRead: Job<ReadIn, ReadOut> = {
  name: 'policy.read',
  shape:
    '{"why":string,"reading":string,"instrument":string,"targets":string[],"question"?:string}',
  usesBrief: false,
  repairs: 1,
  version: 1,
  role: 'extractor',
  maxTokens: 1000,
  rules: `You read one instruction written by an office holder and say, in one line, how a government would understand it.
- "reading": one plain sentence, at most 140 characters, describing the action. Do not judge it.
- "instrument": the id of the listed instrument that fits best, or "novel" if none fits, or "unclear" if the instruction is too vague to act on.
- "targets": ids of regions the instruction names, from the list given. Use ids only.
- "question": include it only when instrument is "unclear": one short question that would make the instruction usable.`,
  output: ReadOut,
  check(input, out) {
    const problems: string[] = [];
    if (out.reading.length > 140) problems.push('"reading" must be at most 140 characters.');
    const known = new Set([...input.instruments.map((i) => i.id), 'novel', 'unclear']);
    if (!known.has(out.instrument))
      problems.push(`"instrument" ${out.instrument} is not in the list.`);
    const regions = new Set(input.regions.map((r) => r.id));
    for (const id of out.targets) if (!regions.has(id)) problems.push(`Unknown region id ${id}.`);
    if ((out.instrument === 'unclear') !== (out.question !== undefined && out.question !== '')) {
      problems.push('"question" must be present if and only if instrument is "unclear".');
    }
    return problems;
  },
  fallback(input) {
    const match = matchInstrument(input.card.text, input.regions);
    if (match === undefined) {
      return {
        why: 'Too short to act on.',
        reading: 'Too vague to act on yet.',
        instrument: 'unclear',
        targets: [],
        question: 'What exactly should be done, and where?',
      };
    }
    if (match === 'novel') {
      return {
        why: 'No listed instrument fits.',
        reading: 'An order outside the usual instruments; it will be judged on its own terms.',
        instrument: 'novel',
        targets: [],
      };
    }
    const label =
      input.instruments.find((i) => i.id === match.instrument)?.label ?? match.instrument;
    const where = input.regions.find((r) => r.id === match.region)?.label;
    return {
      why: 'Matched by keywords.',
      reading: clip(`${label}${where ? ` (${where})` : ''}, ${match.scale} in scale.`, 140),
      instrument: match.instrument,
      targets: match.region ? [match.region] : [],
    };
  },
};

// ------------------------------------------------------------------------------- policy.compile

export interface CompileIn {
  cards: { id: string; text: string }[];
  standing: { id: string; title: string; instrument: string }[];
  office: { title: string; powers: string[] };
  instruments: { id: string; label: string; needsRegion: boolean; hasDirection: boolean }[];
  regions: Ref[];
}
const CompiledPolicy = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(400),
  instrument: z.string(),
  region: z.string().optional(),
  scale: z.enum(['small', 'medium', 'large']),
  direction: z.enum(['raise', 'lower']).optional(),
  funding: z.enum(['tax', 'borrowing', 'cuts', 'reserves', 'unspecified']).default('unspecified'),
  fromCards: z.array(z.string()).min(1),
  analogues: z.array(z.unknown()).optional(),
});
export type CompiledPolicy = z.infer<typeof CompiledPolicy>;
const CompileOut = z.object({
  why: z.string(),
  policies: z.array(CompiledPolicy),
  duplicates: z.array(z.object({ card: z.string(), of: z.string() })).default([]),
  conflicts: z
    .array(z.object({ cards: z.array(z.string()).min(2), explanation: z.string() }))
    .default([]),
  needsDetail: z.array(z.object({ card: z.string(), question: z.string() })).default([]),
  ...ext,
});
export type CompileOut = z.infer<typeof CompileOut>;

export const policyCompile: Job<CompileIn, CompileOut> = {
  name: 'policy.compile',
  shape:
    '{"why":string,"policies":[{"title":string,"summary":string,"instrument":string,"region"?:string,"scale":"small"|"medium"|"large","direction"?:"raise"|"lower","funding":"tax"|"borrowing"|"cuts"|"reserves"|"unspecified","fromCards":string[]}],"duplicates":[{"card":string,"of":string}],"conflicts":[{"cards":string[],"explanation":string}],"needsDetail":[{"card":string,"question":string}]}',
  usesBrief: false,
  repairs: 2,
  version: 1,
  role: 'extractor',
  maxTokens: 3000,
  rules: `You turn an office holder's draft instructions ("cards") into a clean list of policies.
- Merge cards that are fragments of one policy. Split a card that holds several separate ideas into several policies, each citing that card.
- A card that repeats another card, or a policy already in force, goes in "duplicates" ("of" is the other card's id or the standing policy's id).
- Cards that pull against each other go in "conflicts" with a one-sentence explanation, and NOT in "policies".
- A card too vague to act on goes in "needsDetail" with one short question.
- Every card id must appear exactly once across policies[].fromCards, duplicates, conflicts and needsDetail (a split card may appear in several policies).
- "instrument": an id from the list, or "novel". "region": a region id, required when the instrument needs a region. "scale": how forceful the order is. "direction": "raise" or "lower", for instruments that can go either way.
- "funding": how the card says it is paid for, or "unspecified".
- Titles and summaries are neutral descriptions. Never rewrite or judge the intent. Use ids only for regions.`,
  output: CompileOut,
  check(input, out) {
    const problems: string[] = [];
    const cards = new Set(input.cards.map((c) => c.id));
    const regions = new Set(input.regions.map((r) => r.id));
    const instruments = new Map(input.instruments.map((i) => [i.id, i]));
    const standing = new Set(input.standing.map((s) => s.id));
    const inPolicies = new Set(out.policies.flatMap((p) => p.fromCards));
    const elsewhere = [
      ...out.duplicates.map((d) => d.card),
      ...out.conflicts.flatMap((c) => c.cards),
      ...out.needsDetail.map((n) => n.card),
    ];
    for (const id of [...inPolicies, ...elsewhere]) {
      if (!cards.has(id)) problems.push(`Unknown card id ${id}.`);
    }
    for (const id of cards) {
      const count = (inPolicies.has(id) ? 1 : 0) + elsewhere.filter((c) => c === id).length;
      if (count === 0) problems.push(`Card ${id} is not accounted for.`);
      if (count > 1) problems.push(`Card ${id} appears in more than one place.`);
    }
    for (const d of out.duplicates) {
      if (!cards.has(d.of) && !standing.has(d.of))
        problems.push(`Duplicate target ${d.of} is unknown.`);
    }
    for (const p of out.policies) {
      if (p.instrument !== 'novel') {
        const instrument = instruments.get(p.instrument);
        if (!instrument) problems.push(`Unknown instrument ${p.instrument}.`);
        else if (instrument.needsRegion && !p.region)
          problems.push(`${p.instrument} needs a "region".`);
      }
      if (p.region !== undefined && !regions.has(p.region))
        problems.push(`Unknown region id ${p.region}.`);
    }
    return problems;
  },
  fallback(input) {
    const out: CompileOut = {
      why: 'Compiled by keyword rules; boxes were not merged.',
      policies: [],
      duplicates: [],
      conflicts: [],
      needsDetail: [],
    };
    const seen = new Map<string, string>();
    const matched: { card: string; instrument: string; region?: string }[] = [];
    for (const card of input.cards) {
      const match = matchInstrument(card.text, input.regions);
      if (match === undefined) {
        out.needsDetail.push({
          card: card.id,
          question: 'What exactly should be done, and where?',
        });
        continue;
      }
      const instrument = match === 'novel' ? 'novel' : match.instrument;
      const region = match === 'novel' ? undefined : match.region;
      const key =
        instrument === 'novel'
          ? `novel:${card.text.toLowerCase().trim()}`
          : `${instrument}:${region ?? ''}`;
      const inForce = input.standing.find(
        (s) => instrument !== 'novel' && s.instrument === instrument,
      );
      const earlier = seen.get(key);
      if (earlier ?? inForce) {
        out.duplicates.push({ card: card.id, of: earlier ?? inForce?.id ?? '' });
        continue;
      }
      seen.set(key, card.id);
      matched.push({ card: card.id, instrument, ...(region ? { region } : {}) });
      const label =
        input.instruments.find((i) => i.id === instrument)?.label ?? 'Order outside the catalogue';
      const scale: Scale = match === 'novel' ? 'small' : match.scale;
      const direction: Direction | undefined = match === 'novel' ? undefined : match.direction;
      out.policies.push({
        title: clip(label, 120),
        summary: clip(card.text, 400),
        instrument,
        ...(region ? { region } : {}),
        scale,
        ...(direction ? { direction } : {}),
        funding: 'unspecified',
        fromCards: [card.id],
      });
    }
    for (const [a, b] of OPPOSITES) {
      const first = matched.find((m) => m.instrument === a);
      const second = matched.find(
        (m) => m.instrument === b && (m.region ?? '') === (first?.region ?? ''),
      );
      if (!first || !second) continue;
      out.policies = out.policies.filter(
        (p) => !p.fromCards.includes(first.card) && !p.fromCards.includes(second.card),
      );
      out.conflicts.push({
        cards: [first.card, second.card],
        explanation: 'These two orders pull in opposite directions.',
      });
    }
    return out;
  },
};

// ------------------------------------------------------------------------------ turn.adjudicate

export interface Allowed {
  on: string;
  range: [number, number];
  unit: string;
}
export interface AdjudicateIn {
  period: { from: string; to: string; days: number };
  state: Record<string, number | string>;
  regions: Ref[];
  /** Every actor's actions in one list with one shape. Nothing marks the human player. */
  actions: { id: string; by: string; summary: string; stage: string; allowed: Allowed[] }[];
  /** What an unprompted event may touch, and how far. */
  /** How far an event may move each variable, either way: `{ "inflation": 0.5, ... }`. */
  eventLimits: Record<string, number>;
  recent: { id: string; when: string; summary: string }[];
  surpriseBudget: { major: number; significant: number };
}
const EffectOut = z.object({ on: z.string(), value: z.number(), reason: z.string().default('') });
const AdjudicateOut = z.object({
  why: z.string(),
  outcomes: z.array(
    z.object({
      action: z.string(),
      result: z.enum(['as_intended', 'partial', 'stalled', 'backfired']),
      effects: z.array(EffectOut),
      note: z.string().max(300),
    }),
  ),
  events: z
    .array(
      z.object({
        kind: z.string().min(1).max(40),
        size: z.enum(SIZES),
        summary: z.string().min(1).max(200),
        place: z.string().optional(),
        inDays: z.number().int().min(0),
        effects: z.array(EffectOut).default([]),
        causes: z.array(z.string()).default([]),
        public: z.boolean().default(true),
      }),
    )
    .default([]),
  proposedMeasures: z.array(z.unknown()).optional(),
  ...ext,
});
export type AdjudicateOut = z.infer<typeof AdjudicateOut>;

const inRange = (value: number, [min, max]: [number, number]) =>
  value >= min - 1e-9 && value <= max + 1e-9;

export const turnAdjudicate: Job<AdjudicateIn, AdjudicateOut> = {
  name: 'turn.adjudicate',
  shape:
    '{"why":string,"outcomes":[{"action":string,"result":"as_intended"|"partial"|"stalled"|"backfired","effects":[{"on":string,"value":number}],"note":string}],"events":[{"kind":string,"size":"colour"|"minor"|"significant"|"major","summary":string,"place"?:string,"inDays":number,"effects":[{"on":string,"value":number}],"causes":string[]}]}',
  usesBrief: true,
  repairs: 2,
  version: 1,
  role: 'adjudicator',
  maxTokens: 4000,
  rules: `You judge one stretch of time in a political simulation. You do not know which actor, if any, is a human; treat every action the same way.
- Return exactly one outcome per action. "result" says how the action went in practice: as_intended, partial, stalled or backfired. Institutions resist change: most large changes land partially.
- "effects": for each variable in the action's "allowed" list, you may give a value inside its range. You may not name any other variable. A stalled action has no effects.
- "note": one sentence for the record, plain and factual.
- "events": other things that happen in the period, from trivial to grave: scandals, strikes, statements, accidents, deals. Keep them consistent with the state and the world brief. Each needs a "kind", a "size", a one-sentence "summary" (at most 200 characters), "inDays" (days after the period starts, within the period), and "causes": ids from "recent" or from "actions". An event with no cause among those may only be size "colour" or "minor".
- Event "effects" may use only the variables named in "eventLimits", each between minus and plus its limit. Most events need no effects.
- Be brief. Give only "on" and "value" for an effect. Write few events, and none when nothing notable would happen.
- Stay inside "surpriseBudget" for events of size major and significant. Continuity is the default: most periods have no major event.
- "place" is a region id from the list. Use ids only. State what happens; do not comment on whether it is right or wrong.`,
  output: AdjudicateOut,
  check(input, out) {
    const problems: string[] = [];
    const actions = new Map(input.actions.map((a) => [a.id, a]));
    const seen = new Set<string>();
    for (const o of out.outcomes) {
      const action = actions.get(o.action);
      if (!action) {
        problems.push(`Outcome for unknown action ${o.action}.`);
        continue;
      }
      if (seen.has(o.action)) problems.push(`More than one outcome for ${o.action}.`);
      seen.add(o.action);
      const allowed = new Map(action.allowed.map((a) => [a.on, a]));
      for (const e of o.effects) {
        const rule = allowed.get(e.on);
        if (!rule)
          problems.push(
            `${o.action}: may not touch ${e.on}. Allowed: ${[...allowed.keys()].join(', ') || 'nothing'}.`,
          );
        else if (!inRange(e.value, rule.range))
          problems.push(
            `${o.action}: ${e.on} must be between ${rule.range[0]} and ${rule.range[1]}, got ${e.value}.`,
          );
      }
    }
    for (const id of actions.keys())
      if (!seen.has(id)) problems.push(`No outcome for action ${id}.`);

    const causes = new Set([...input.recent.map((r) => r.id), ...actions.keys()]);
    const regions = new Set(input.regions.map((r) => r.id));
    const limits = input.eventLimits;
    let major = 0;
    let significant = 0;
    for (const [i, e] of out.events.entries()) {
      if (e.size === 'major') major++;
      if (e.size === 'significant') significant++;
      if (e.inDays > input.period.days) problems.push(`Event ${i}: inDays is beyond the period.`);
      if (e.place !== undefined && !regions.has(e.place))
        problems.push(`Event ${i}: unknown region id ${e.place}.`);
      for (const c of e.causes)
        if (!causes.has(c)) problems.push(`Event ${i}: unknown cause id ${c}.`);
      if (e.causes.length === 0 && (e.size === 'major' || e.size === 'significant')) {
        problems.push(`Event ${i}: a ${e.size} event must cite a cause.`);
      }
      for (const fx of e.effects) {
        const limit = limits[fx.on];
        if (limit === undefined) problems.push(`Event ${i}: may not touch ${fx.on}.`);
        else if (Math.abs(fx.value) > limit + 1e-9)
          problems.push(`Event ${i}: ${fx.on} must be between ${-limit} and ${limit}.`);
      }
      if (COMMENTARY.test(e.summary))
        problems.push(`Event ${i}: state what happened without commentary.`);
    }
    if (major > input.surpriseBudget.major)
      problems.push(`Too many major events: at most ${input.surpriseBudget.major}.`);
    if (significant > input.surpriseBudget.significant)
      problems.push(`Too many significant events: at most ${input.surpriseBudget.significant}.`);
    return problems;
  },
  fallback(input) {
    return {
      why: 'No model: each action applies the middle of its allowed ranges.',
      outcomes: input.actions.map((a) => ({
        action: a.id,
        result: 'partial' as const,
        effects: a.allowed.map((r) => ({
          on: r.on,
          value: (r.range[0] + r.range[1]) / 2,
          reason: 'Middle of the allowed range.',
        })),
        note:
          a.allowed.length > 0
            ? 'Carried out, with the usual friction.'
            : 'Announced; no measurable effect yet.',
      })),
      events: [],
    };
  },
};

// ---------------------------------------------------------------------------------- turn.review

export interface ReviewIn {
  items: {
    index: number;
    summary: string;
    causes: { id: string; summary: string }[];
    actorPowers: string[];
  }[];
}
const ReviewOut = z.object({
  why: z.string(),
  verdicts: z.array(
    z.object({
      index: z.number().int(),
      plausible: z.boolean(),
      caused: z.boolean(),
      withinPower: z.boolean(),
      note: z.string().default(''),
    }),
  ),
  ...ext,
});
export type ReviewOut = z.infer<typeof ReviewOut>;

export const turnReview: Job<ReviewIn, ReviewOut> = {
  name: 'turn.review',
  shape:
    '{"why":string,"verdicts":[{"index":number,"plausible":boolean,"caused":boolean,"withinPower":boolean,"note":string}]}',
  usesBrief: true,
  repairs: 1,
  version: 1,
  role: 'adjudicator',
  maxTokens: 1500,
  rules: `You give a second opinion on proposed outcomes in a political simulation. For each item answer three questions.
- "plausible": could this happen in the world described?
- "caused": do the listed causes actually lead to it?
- "withinPower": is it within the powers of whoever acts?
Return exactly one verdict per item, with its index and a one-sentence note. Judge realism only, never morality.`,
  output: ReviewOut,
  check(input, out) {
    const wanted = input.items
      .map((i) => i.index)
      .sort()
      .join(',');
    const got = out.verdicts
      .map((v) => v.index)
      .sort()
      .join(',');
    return wanted === got ? [] : ['Return exactly one verdict per item.'];
  },
  // With no second opinion available, reviewed items are dropped (spec: turn.review, Fallback).
  fallback(input) {
    return {
      why: 'No model: reviewed items are dropped.',
      verdicts: input.items.map((i) => ({
        index: i.index,
        plausible: false,
        caused: false,
        withinPower: false,
        note: 'Not reviewed.',
      })),
    };
  },
};

// ------------------------------------------------------------------------------ chronicle.write

/** The full piece on one event, written when the player opens its entry. */
export interface ChronicleIn {
  event: {
    id: string;
    when: string;
    kind: string;
    size: Size;
    summary: string;
    place?: Ref;
    /** Who spoke or acted, when the event is a reaction. */
    speaker?: string;
    numbers: { label: string; before: number; after: number; unit: string }[];
  };
  /** What else is on record about the same matter, including what people said. */
  related: { when: string; summary: string; speaker?: string }[];
  weight: 'minor' | 'significant' | 'major';
  /** The most the account may run to, in words. Set by the player's detail setting. */
  words: number;
  level: 'restrained' | 'standard' | 'mature';
}
const ChronicleOut = z.object({
  why: z.string(),
  body: z.string().min(1),
  /** Every figure in the body that is not in the input, declared so it can be kept consistent. */
  details: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  ...ext,
});
export type ChronicleOut = z.infer<typeof ChronicleOut>;

export const chronicleWrite: Job<ChronicleIn, ChronicleOut> = {
  name: 'chronicle.write',
  shape: '{"why":string,"body":string,"details":[{"label":string,"value":string}]}',
  usesBrief: true,
  repairs: 1,
  version: 2,
  role: 'narrator',
  maxTokens: 2500,
  rules: `You write the full account of one event in a political simulation for adult readers, as a newspaper of record would. This is fiction about politics; some events are violent.
- Build the account from "event" and "related". Do not add new events, decisions or outcomes: describe this one more fully, with setting, sequence and consequence.
- Write up to "words" words, and use the room: do not stop short. For "weight" significant and major, open with a dateline: place, date and hour.
- If "event.speaker" is given, the event is something that speaker said or did: build the account around it, with the setting, what was said, and what it signals.
- You may quote what people said only from "related" entries that have a "speaker", attributing each quote to that speaker.
- You may add descriptive figures for texture (a crowd size, a share price, a vote in a committee). Declare every such figure in "details". Never restate or change a figure given in the input.
- State what happened. No lessons, warnings, disclaimers or judging adjectives. Report violence plainly: what, where, who, with no technique or instructions.
- Plain paragraphs separated by blank lines. A short list is allowed where figures read best as a list.`,
  output: ChronicleOut,
  check(input, out) {
    const problems: string[] = [];
    const limit = Math.round(input.words * 1.2);
    if (words(out.body) > limit) problems.push(`The body must be at most ${input.words} words.`);
    const invented = inventedNumbers(out.body, [input, out.details]);
    if (invented.length > 0)
      problems.push(`Declare these figures in "details", or remove them: ${invented.join(', ')}.`);
    if (COMMENTARY.test(out.body)) problems.push('Remove commentary; state only what happened.');
    return problems;
  },
  fallback(input) {
    const lines = [input.event.summary];
    for (const n of input.event.numbers)
      lines.push(`${n.label}: ${n.before} to ${n.after} ${n.unit}.`);
    for (const r of input.related) lines.push(r.speaker ? `${r.speaker}: ${r.summary}` : r.summary);
    return { why: 'No model: the record as it stands.', body: lines.join('\n\n'), details: [] };
  },
};

// --------------------------------------------------------------------------------- policy.react

export interface ReactIn {
  order: { id: string; text: string; summary: string; instrument: string; region?: Ref };
  actor: {
    id: string;
    name: string;
    kind: string;
    stance: 'hostile' | 'wary' | 'neutral' | 'friendly';
    voice: string;
  };
  /** Things this actor is able to do, beyond speaking. May be empty. */
  options: Ref[];
  /** The most the response may run to, in words. Set by the player's detail setting. */
  words: number;
  state: Record<string, number | string>;
  recent: { when: string; summary: string }[];
}
const ReactOut = z.object({
  why: z.string(),
  kind: z.enum(['statement', 'action', 'silence']),
  text: z.string().min(1),
  option: z.string().optional(),
  later: z
    .object({
      inDays: z.number().int().min(1).max(90),
      question: z.string(),
      ifYes: z.string().min(1),
      ifNo: z.string().min(1),
    })
    .optional(),
  ...ext,
});
export type ReactOut = z.infer<typeof ReactOut>;

export const policyReact: Job<ReactIn, ReactOut> = {
  name: 'policy.react',
  shape:
    '{"why":string,"kind":"statement"|"action"|"silence","text":string,"option"?:string,"later"?:{"inDays":number,"question":string,"ifYes":string,"ifNo":string}}',
  usesBrief: true,
  repairs: 1,
  version: 1,
  role: 'narrator',
  maxTokens: 2000,
  rules: `You voice one actor in a political simulation answering an order the head of government has just given. Answer as that actor would: from its interests, its stance toward the government, and in its own voice.
- Respond to what the order actually says ("order.text"), not to a generic policy.
- "kind": "statement" (it speaks), "action" (it does one of the things in "options", and you set "option" to that id), or "silence" (it pointedly says nothing).
- "text": up to "words" words, third person, like a wire report of the response: what the actor said or did, what it wants, and what it signals it will do next. Quote the actor directly in its own voice, more than once where there is room. For silence, one sentence saying it has not responded.
- "later": optional. A follow-up that could go either way within 90 days, such as a truce holding or a strike being called. Give a yes/no "question", and one sentence for each outcome ("ifYes", "ifNo"). The game decides which happens.
- Stay within what this actor could really do. Use no figures that are not in the input.`,
  output: ReactOut,
  check(input, out) {
    const problems: string[] = [];
    if (words(out.text) > Math.round(input.words * 1.2))
      problems.push(`"text" must be at most ${input.words} words.`);
    const isAction = out.kind === 'action';
    if (isAction !== (out.option !== undefined))
      problems.push('"option" must be given if and only if kind is "action".');
    if (out.option !== undefined && !input.options.some((o) => o.id === out.option)) {
      problems.push(
        `"option" must be one of: ${input.options.map((o) => o.id).join(', ') || 'none; this actor can only speak'}.`,
      );
    }
    const invented = inventedNumbers(
      `${out.text} ${out.later?.ifYes ?? ''} ${out.later?.ifNo ?? ''}`,
      input,
    );
    if (invented.length > 0)
      problems.push(`The figures ${invented.join(', ')} are not in the input.`);
    return problems;
  },
  fallback: templateReaction,
};

/** A reaction with no model: the actor's kind, stance and the kind of order pick the words. */
function templateReaction(input: ReactIn): ReactOut {
  const { actor, order } = input;
  const name = actor.name;
  const where = order.region?.label ?? 'the country';
  const has = (id: string) => input.options.some((o) => o.id === id);
  const security = order.instrument === 'security_operation';
  const settlement = order.instrument === 'regional_settlement';
  const austerity = ['fuel_subsidy_cut', 'sales_tax_rise', 'development_spending_cut'].includes(
    order.instrument,
  );
  const giveaway = [
    'subsidy_increase',
    'income_tax_cut',
    'cash_transfer_expansion',
    'development_spending_rise',
  ].includes(order.instrument);
  const why = 'No model: a standard response for this kind of actor.';
  const say = (text: string, more: Partial<ReactOut> = {}): ReactOut => ({
    why,
    kind: 'statement',
    text,
    ...more,
  });
  const act = (option: string, text: string, more: Partial<ReactOut> = {}): ReactOut =>
    has(option) ? { why, kind: 'action', option, text, ...more } : say(text, more);

  switch (actor.kind) {
    case 'militant':
      if (security)
        return act(
          'step_up_attacks',
          `${name} vowed to answer the operation in ${where}. "Every raid will be repaid," its spokesman said.`,
          {
            later: {
              inDays: 10,
              question: "Does the operation go the state's way?",
              ifYes: `Security forces said they had cleared several militant hideouts in ${where}.`,
              ifNo: `${name} struck back with a bombing in ${where}, killing members of the security forces.`,
            },
          },
        );
      if (settlement)
        return say(
          `${name} dismissed the government's offer. "We do not negotiate under occupation," its statement said, though attacks eased in the days that followed.`,
          {
            later: {
              inDays: 14,
              question: 'Does the lull hold?',
              ifYes: `Two weeks on, attacks in ${where} have fallen away and intermediaries report quiet contacts.`,
              ifNo: `${name} claimed an attack on a convoy in ${where}, ending talk of a lull.`,
            },
          },
        );
      return { why, kind: 'silence', text: `${name} has not responded.` };
    case 'military':
      if (security)
        return act(
          'back_publicly',
          `${name} said its forces would carry out the operation in ${where} "with full resolve".`,
        );
      if (settlement)
        return say(
          `${name} said it supported the government's decision, adding that "the state's writ is not open to negotiation".`,
        );
      return say(
        `${name} took note of the decision and said national security requirements "must remain fully resourced".`,
      );
    case 'lender':
      if (austerity)
        return act(
          'endorse',
          `${name} called the measure "consistent with programme commitments" and said it would support the next review.`,
        );
      if (giveaway)
        return act(
          'warn_publicly',
          `${name} said the measure "was not discussed with staff" and could put programme targets at risk.`,
        );
      return say(`${name} said it was studying the decision.`);
    case 'business':
      if (austerity)
        return act(
          'shutter_strike',
          `${name} condemned the measure and called a one-day shutdown. "Industry cannot absorb another blow," its president said.`,
        );
      if (giveaway)
        return act(
          'welcome',
          `${name} welcomed the decision, calling it "overdue relief for those who keep the economy running".`,
        );
      return say(`${name} asked to be consulted before further changes.`);
    case 'opposition':
      return act(
        'call_protests',
        `${name} denounced the order as the act of "an unelected, unaccountable government" and called its supporters into the streets.`,
        {
          later: {
            inDays: 7,
            question: 'Do the protests fizzle?',
            ifYes: "The opposition's protest call drew thin crowds and passed without incident.",
            ifNo: 'Opposition rallies against the order filled streets in several cities.',
          },
        },
      );
    case 'ally':
      if (austerity)
        return say(
          `${name} said it would back the government "for now" but warned that its voters "cannot be asked to pay again and again".`,
        );
      return say(
        `${name} said it supported the decision and expected to be consulted on how it is carried out.`,
      );
    case 'religious':
      if (settlement)
        return act(
          'offer_mediation',
          `${name} offered its elders as go-betweens. "Blood has never ended a quarrel in ${where}," its leader said.`,
        );
      if (security)
        return say(
          `${name} warned that force in ${where} "will fill the graveyards and settle nothing".`,
        );
      return say(`${name} said it would judge the decision by its effect on ordinary believers.`);
    case 'province':
      if (actor.stance === 'hostile' || actor.stance === 'wary')
        return act(
          'defy',
          `${name} accused Islamabad of acting over its head. "We were informed, not consulted," its spokesman said.`,
        );
      return act('cooperate', `${name} said it would give the decision its full cooperation.`);
    default:
      if (actor.stance === 'hostile')
        return say(
          `${name} said the decision reflected Pakistan's "deepening internal difficulties".`,
        );
      if (actor.stance === 'friendly')
        return say(
          `${name} said it hoped the step would bring stability and that it "attaches great importance to the safety of its personnel and projects".`,
        );
      return say(
        `${name} cautioned that it would "not tolerate any violation of its territory" and denied any link to events in ${where}.`,
      );
  }
}

// ---------------------------------------------------------------------------------- actor.reply

export interface ReplyIn {
  actor: { id: string; name: string; kind: string; stance: string; voice: string };
  asker: string;
  question: string;
  /** What this actor could know: public events and those that touch its concerns. */
  knows: { when: string; summary: string }[];
  state: Record<string, number | string>;
  policies: string[];
  earlier: { question: string; reply: string }[];
}
const ReplyOut = z.object({
  why: z.string(),
  reply: z.string().min(1),
  /** What the asker put on the table, if anything. The engine holds them to an offer. */
  lever: z
    .object({ kind: z.enum(['offer', 'threat', 'none']), claim: z.string().default('') })
    .default({ kind: 'none', claim: '' }),
  ...ext,
});
export type ReplyOut = z.infer<typeof ReplyOut>;

export const actorReply: Job<ReplyIn, ReplyOut> = {
  name: 'actor.reply',
  shape: '{"why":string,"reply":string,"lever":{"kind":"offer"|"threat"|"none","claim":string}}',
  usesBrief: true,
  repairs: 1,
  version: 1,
  role: 'narrator',
  maxTokens: 1500,
  rules: `You speak as one person or body in a political simulation, answering a question put by the head of government ("asker").
- Answer in the first person, in that actor's voice, from its interests and its stance toward the asker. An adviser is candid; a rival is guarded or sharp; an official of another country is diplomatic.
- Use only what is in "knows", "state", "policies" and the world brief. If you do not know, say so in character. Never invent events, decisions or figures.
- Give a view, not a list: what this means, what worries you, what you would do. You may disagree with the asker.
- At most 120 words. No stage directions, no narration, just what is said.
- "lever": did the asker put something on the table? "offer" if they undertook to do something this actor wants (state it in "claim" as one plain sentence, "The Prime Minister will ..."); "threat" if they threatened this actor; otherwise "none". Words of friendship, arguments and questions are "none". An offer does not change your position by itself: say what you would need to see.`,
  output: ReplyOut,
  check(input, out) {
    const problems: string[] = [];
    if (words(out.reply) > 150) problems.push('"reply" must be at most 120 words.');
    const invented = inventedNumbers(out.reply, input);
    if (invented.length > 0)
      problems.push(`The figures ${invented.join(', ')} are not in what you know.`);
    return problems;
  },
  fallback(input) {
    const recent = input.knows.slice(-3).map((k) => k.summary);
    const said = input.question.toLowerCase();
    const offer =
      /\b(i will|we will|i promise|i can offer|in return|i am prepared to|you have my word)\b/.test(
        said,
      );
    const threat =
      /\b(or else|you will regret|consequences|i will have you|i will remove you|i will crush)\b/.test(
        said,
      );
    if (offer || threat) {
      return {
        why: 'No model: keyword rules.',
        reply: threat
          ? 'That is noted, and it will not be forgotten.'
          : 'I have heard what you undertake. I will judge it by what follows.',
        lever: { kind: threat ? 'threat' : 'offer', claim: input.question.slice(0, 200) },
      };
    }
    return {
      lever: { kind: 'none' as const, claim: '' },
      why: 'No model: the record only.',
      reply:
        recent.length > 0
          ? `I can only give you what is on the record. ${recent.join(' ')}`
          : 'Nothing bearing on that has reached me yet.',
    };
  },
};

// biome-ignore lint/suspicious/noExplicitAny: the registry holds jobs of every input and output type.
export const JOBS: Readonly<Record<string, Job<any, any>>> = Object.fromEntries(
  [
    policyRead,
    policyCompile,
    turnAdjudicate,
    turnReview,
    chronicleWrite,
    policyReact,
    actorReply,
  ].map((j) => [j.name, j]),
);

export const INSTRUMENT_REFS = CATALOGUE.map((i) => ({
  id: i.id,
  label: i.title,
  needsRegion: i.needsRegion === true,
  hasDirection: i.effects.some((e) => e.range[0] < 0 && e.range[1] > 0),
}));
