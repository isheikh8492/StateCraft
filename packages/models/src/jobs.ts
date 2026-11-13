import { CATALOGUE, type Direction, type Landing, type Scale } from '@statecraft/engine';
import { z } from 'zod';
import { findRegion, matchInstrument, OPPOSITES, type Ref } from './match.ts';
import {
  bool,
  clipWords,
  countWords,
  int,
  list,
  numbers,
  obj,
  pick,
  type Schema,
  str,
} from './shape.ts';

/**
 * The model jobs (spec: Model jobs). Each has fixed rules, an output schema, a strict
 * per-call JSON schema that names the only answers it will accept, checks the output must
 * pass, and a fallback that needs no model.
 */
export type Role = 'adjudicator' | 'extractor' | 'narrator';

export interface Job<I, O> {
  name: string;
  version: number;
  role: Role;
  /** Fixed instructions. They never change during a campaign. */
  rules: string;
  output: z.ZodType<O>;
  /**
   * The strict JSON schema for one call, built from that call's input so that every allowed
   * answer — region ids, instrument ids, an actor's options, the variables an order may
   * touch — is an enum. Used by servers that enforce a schema, and by the local mender.
   */
  schema(input: I): Schema;
  /** The output written compactly, for servers that cannot enforce the schema. */
  shape: string;
  /** Whether the job needs the scenario's world brief. Most do not, and skipping it saves tokens. */
  usesBrief: boolean;
  /** How many times a rejected answer is sent back before the built-in wording is used. */
  repairs: number;
  maxTokens: number;
  /**
   * Puts right what this job can fix in place, after validation and before the checks: over-long
   * prose, a choice that contradicts itself. Returns one line per fix, for the record.
   * Anything left for `check` costs another call, so prefer a fix here where one is honest.
   */
  mend?(input: I, output: O): string[];
  /** Problems with a schema-valid output, in words a model can act on. Empty means it passes. */
  check(input: I, output: O): string[];
  fallback(input: I): O;
}

const SIZES = ['colour', 'minor', 'significant', 'major'] as const;
export type Size = (typeof SIZES)[number];
const RESULTS = ['as_intended', 'partial', 'stalled', 'backfired'] as const;

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

const words = countWords;
const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
const ids = (refs: readonly { id: string }[]) => refs.map((r) => r.id);
/** Room for prose in characters, from a limit in words. The mender trims the rest. */
const roomFor = (limit: number) => Math.max(240, Math.round(limit * 9));
const WHY = str(160, 'At most 20 words.');

// ---------------------------------------------------------------------------------- policy.read

export interface ReadIn {
  card: { id: string; text: string };
  office: { title: string; powers: string[] };
  standing: Ref[];
  instruments: Ref[];
  regions: Ref[];
}
const ReadOut = z.object({
  why: z.string().default(''),
  reading: z.string().min(1),
  instrument: z.string(),
  targets: z.array(z.string()).default([]),
  question: z.string().optional(),
});
export type ReadOut = z.infer<typeof ReadOut>;

/** Not used in play: boxes are no longer read back to the player. Kept for the model check. */
export const policyRead: Job<ReadIn, ReadOut> = {
  name: 'policy.read',
  shape:
    '{"why":string,"reading":string,"instrument":string,"targets":string[],"question"?:string}',
  usesBrief: false,
  repairs: 1,
  version: 2,
  role: 'extractor',
  maxTokens: 1000,
  rules: `You read one instruction written by an office holder and say, in one line, how a government would understand it.
- "reading": one plain sentence, at most 140 characters, describing the action. Do not judge it.
- "instrument": the id of the listed instrument that fits best, or "novel" if none fits, or "unclear" if the instruction is too vague to act on.
- "targets": ids of regions the instruction names, from the list given. Use ids only.
- "question": include it only when instrument is "unclear": one short question that would make the instruction usable.`,
  output: ReadOut,
  schema: (input) =>
    obj(
      {
        why: WHY,
        reading: str(140),
        instrument: pick([...ids(input.instruments), 'novel', 'unclear']),
        targets: list(pick(ids(input.regions)), 4),
        question: str(160),
      },
      ['question'],
    ),
  mend(_input, out) {
    const unclear = out.instrument === 'unclear';
    if (!unclear && out.question !== undefined) {
      delete out.question;
      return ['question: dropped, since the instruction is clear enough to act on'];
    }
    if (unclear && (out.question === undefined || out.question === '')) {
      out.question = 'What exactly should be done, and where?';
      return ['question: supplied, since the instruction is too vague to act on'];
    }
    return [];
  },
  check(input, out) {
    const problems: string[] = [];
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
const SCALES = ['small', 'medium', 'large'] as const;
const FUNDING = ['tax', 'borrowing', 'cuts', 'reserves', 'unspecified'] as const;
const CompiledPolicy = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(400),
  instrument: z.string(),
  region: z.string().optional(),
  scale: z.enum(SCALES),
  direction: z.enum(['raise', 'lower']).optional(),
  funding: z.enum(FUNDING).default('unspecified'),
  fromCards: z.array(z.string()).min(1),
});
export type CompiledPolicy = z.infer<typeof CompiledPolicy>;
const CompileOut = z.object({
  why: z.string().default(''),
  policies: z.array(CompiledPolicy).default([]),
  duplicates: z.array(z.object({ card: z.string(), of: z.string() })).default([]),
  conflicts: z
    .array(z.object({ cards: z.array(z.string()).min(2), explanation: z.string() }))
    .default([]),
  needsDetail: z.array(z.object({ card: z.string(), question: z.string() })).default([]),
});
export type CompileOut = z.infer<typeof CompileOut>;

export const policyCompile: Job<CompileIn, CompileOut> = {
  name: 'policy.compile',
  shape:
    '{"why":string,"policies":[{"title":string,"summary":string,"instrument":string,"region"?:string,"scale":"small"|"medium"|"large","direction"?:"raise"|"lower","funding":"tax"|"borrowing"|"cuts"|"reserves"|"unspecified","fromCards":string[]}],"duplicates":[{"card":string,"of":string}],"conflicts":[{"cards":string[],"explanation":string}],"needsDetail":[{"card":string,"question":string}]}',
  usesBrief: false,
  repairs: 2,
  version: 2,
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
  schema(input) {
    const cards = ids(input.cards);
    const card = pick(cards);
    const n = Math.max(cards.length, 1);
    return obj({
      why: WHY,
      policies: list(
        obj(
          {
            title: str(120),
            summary: str(400),
            instrument: pick([...ids(input.instruments), 'novel']),
            region: pick(ids(input.regions)),
            scale: pick(SCALES),
            direction: pick(['raise', 'lower']),
            funding: pick(FUNDING),
            fromCards: list(card, n, 1),
          },
          ['region', 'direction'],
        ),
        n * 2,
      ),
      duplicates: list(obj({ card, of: pick([...cards, ...ids(input.standing)]) }), n),
      conflicts: list(obj({ cards: list(card, n, 2), explanation: str(200) }), n),
      needsDetail: list(obj({ card, question: str(160) }), n),
    });
  },
  mend(input, out) {
    // A policy that needs a place and was given none: if the player's own words name a
    // region, that is the place, and it is not worth a second call to be told so.
    const fixes: string[] = [];
    for (const [i, policy] of out.policies.entries()) {
      const needs = input.instruments.find((x) => x.id === policy.instrument)?.needsRegion;
      if (!needs || policy.region !== undefined) continue;
      const words = input.cards
        .filter((c) => policy.fromCards.includes(c.id))
        .map((c) => c.text)
        .join(' ');
      const region = findRegion(words, input.regions);
      if (!region) continue;
      policy.region = region;
      fixes.push(`policies[${i}].region: read as "${region}" from the order's own words`);
    }
    // A card turned into a policy and also filed as a duplicate, a conflict or a question:
    // the policy stands and the other filing is dropped. A card filed twice among those
    // keeps its first filing.
    const taken = new Set(out.policies.flatMap((policy) => policy.fromCards));
    const once = <T>(list: T[], cardsOf: (item: T) => string[], name: string): T[] =>
      list.filter((item) => {
        const cards = cardsOf(item);
        if (cards.some((card) => taken.has(card))) {
          fixes.push(`${name}: dropped a second filing of a card already accounted for`);
          return false;
        }
        for (const card of cards) taken.add(card);
        return true;
      });
    out.duplicates = once(out.duplicates, (d) => [d.card], 'duplicates');
    out.conflicts = once(out.conflicts, (c) => c.cards, 'conflicts');
    out.needsDetail = once(out.needsDetail, (n) => [n.card], 'needsDetail');
    // What counts as too vague to act on is the game's call, not the model's. A model asks
    // "how should this be implemented?" of orders any government would simply carry out,
    // and an order set aside as vague is an order the player has lost. If the game's own
    // reader can tell what is meant, or the order is a full sentence, it goes ahead.
    out.needsDetail = out.needsDetail.filter((unclear) => {
      const card = input.cards.find((c) => c.id === unclear.card);
      const match = card ? matchInstrument(card.text, input.regions) : undefined;
      if (!card || match === undefined) return true;
      const instrument = match === 'novel' ? 'novel' : match.instrument;
      const label =
        input.instruments.find((i) => i.id === instrument)?.label ?? 'Order outside the catalogue';
      out.policies.push({
        title: clip(label, 120),
        summary: clip(card.text, 400),
        instrument,
        ...(match !== 'novel' && match.region ? { region: match.region } : {}),
        scale: match === 'novel' ? 'small' : match.scale,
        ...(match === 'novel' ? {} : { direction: match.direction }),
        funding: 'unspecified',
        fromCards: [card.id],
      });
      fixes.push(
        `needsDetail: "${clip(card.text, 40)}" is clear enough to act on, read as ${instrument}`,
      );
      return false;
    });
    return fixes;
  },
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
  actions: {
    id: string;
    by: string;
    summary: string;
    stage: string;
    /**
     * How the action went, already decided by the dice. The judge does not choose this: it
     * picks how far each variable moved inside "allowed", and says why it went that way.
     */
    landed: Landing;
    allowed: Allowed[];
  }[];
  /** How far an event may move each variable, either way: `{ "inflation": 0.5, ... }`. */
  eventLimits: Record<string, number>;
  recent: { id: string; when: string; summary: string }[];
  surpriseBudget: { major: number; significant: number };
}
/** Effects in the short form: one named number per variable, `{"inflation": 1.2}`. */
const Effects = z.record(z.string(), z.number()).default({});
const Outcome = z.object({
  result: z.enum(RESULTS),
  effects: Effects,
  note: z.string().max(300).default(''),
});
const WorldEvent = z.object({
  kind: z.string().min(1).max(40),
  size: z.enum(SIZES),
  summary: z.string().min(1).max(200),
  place: z.string().optional(),
  inDays: z.number().int().min(0),
  effects: Effects,
  causes: z.array(z.string()).default([]),
});
const AdjudicateOut = z.object({
  why: z.string().default(''),
  /** Keyed by action id: exactly one outcome per action, by construction. */
  outcomes: z.record(z.string(), Outcome).default({}),
  events: z.array(WorldEvent).default([]),
});
export type AdjudicateOut = z.infer<typeof AdjudicateOut>;

const MAX_EVENTS = 8;
const PLAIN_NOTE = {
  as_intended: 'Carried out as ordered.',
  partial: 'Carried out in part, with the usual friction.',
  stalled: 'Announced, but it has not moved.',
  backfired: 'Carried out, and it has turned against the government.',
} as const;

export const turnAdjudicate: Job<AdjudicateIn, AdjudicateOut> = {
  name: 'turn.adjudicate',
  shape:
    '{"why":string,"outcomes":{"<action id>":{"result":"as_intended"|"partial"|"stalled"|"backfired","effects":{"<variable>":number},"note":string}},"events":[{"kind":string,"size":"colour"|"minor"|"significant"|"major","summary":string,"place"?:string,"inDays":number,"effects":{"<variable>":number},"causes":string[]}]}',
  usesBrief: true,
  repairs: 2,
  version: 4,
  role: 'adjudicator',
  maxTokens: 4000,
  rules: `You judge one stretch of time in a political simulation. You do not know which actor, if any, is a human; treat every action the same way.
- "outcomes" has one entry per action, keyed by the action's id. How each action went has already been decided and is given as its "landed": as_intended, partial, stalled (announced, and nothing moved) or backfired (carried out, and it turned against whoever ordered it). Copy it into "result". You do not choose it.
- "effects" is an object of named numbers. Give a value for each variable the action is allowed to touch, inside its range; the ranges already reflect how it landed. A stalled action has none.
- "note": one sentence for the record that says why it went the way "landed" says: who dragged their feet, what gave way, what the order ran into. Plain and factual, with no figures.
- "events": what else happens in the period. The world does not wait for the government. Parties, armed groups, courts, provinces, markets, neighbours, lenders and the weather all move on their own, and most of what happens in a country is not a response to its government. Write those things: a walkout, a ruling, a border incident, a leak, a strike, a run on a bank, a flood, a deal struck without the government. Keep them consistent with the state and the world brief.
- Write about one event for every week of the period, and at least one in any period. In a period of a week or more, at least one must be of size "significant": something the head of government will have to decide what to do about.
- Each event needs a "kind", a "size", a one-sentence "summary" (at most 200 characters) that names who did what and where, "inDays" (days after the period starts, within the period), and "causes": ids from "recent" or from "outcomes" where one of them really led to it, otherwise an empty list. An event of size "major" must cite a cause.
- Event "effects" may name only the variables in "eventLimits", each between minus and plus its limit. Give effects to events that would really move something; leave the object empty otherwise.
- Stay inside "surpriseBudget" for events of size major and significant.
- Keep to the calendar. "period" gives the dates: write what fits that month and season in this country, and nothing that belongs to another time of year.
- "place" is a region id from the list. Use ids only. State what happens; do not comment on whether it is right or wrong.`,
  output: AdjudicateOut,
  schema(input) {
    const regions = ids(input.regions);
    const causes = [...input.recent.map((r) => r.id), ...input.actions.map((a) => a.id)];
    const outcomes: Record<string, Schema> = {};
    for (const action of input.actions) {
      const fields: Record<string, [number, number]> = {};
      for (const rule of action.allowed) fields[rule.on] = rule.range;
      outcomes[action.id] = obj({
        result: pick([action.landed]),
        effects: numbers(fields, true),
        note: str(300),
      });
    }
    const limits: Record<string, [number, number]> = {};
    for (const [on, limit] of Object.entries(input.eventLimits))
      limits[on] = [-Math.abs(limit), Math.abs(limit)];
    return obj({
      why: WHY,
      outcomes: {
        type: 'object',
        properties: outcomes,
        required: Object.keys(outcomes),
        additionalProperties: false,
      },
      events: list(
        obj(
          {
            kind: str(40),
            // A size the budget rules out is not offered at all.
            size: pick(SIZES.filter((size) => size !== 'major' || input.surpriseBudget.major > 0)),
            summary: str(200),
            place: pick(regions),
            inDays: int(0, Math.max(input.period.days, 0)),
            effects: numbers(limits, false),
            causes: list(pick(causes), 3),
          },
          ['place'],
        ),
        MAX_EVENTS,
      ),
    });
  },
  mend(input, out) {
    // The engine holds the budget for grave events, so an event too many is taken down a
    // size here instead of costing a second call: the event still happens, as lesser news.
    const fixes: string[] = [];
    // The dice have said how each order landed. A reply that says otherwise is overruled.
    for (const action of input.actions) {
      const outcome = out.outcomes[action.id];
      if (!outcome || outcome.result === action.landed) continue;
      fixes.push(
        `outcomes.${action.id}.result: "${outcome.result}" read as "${action.landed}", as decided`,
      );
      outcome.result = action.landed;
    }
    // The engine works out what an order moved, and the policy page shows it. A note that
    // quotes figures of its own ("cut by 19% of GDP") is replaced with plain wording.
    for (const [id, outcome] of Object.entries(out.outcomes)) {
      if (inventedNumbers(outcome.note, input).length === 0) continue;
      outcome.note = PLAIN_NOTE[outcome.result];
      fixes.push(
        `outcomes.${id}.note: replaced, since it stated figures that are not in the input`,
      );
    }
    let major = input.surpriseBudget.major;
    let significant = input.surpriseBudget.significant;
    for (const [i, e] of out.events.entries()) {
      if (e.size === 'major' && (major <= 0 || e.causes.length === 0)) {
        e.size = 'significant';
        fixes.push(`events[${i}].size: major taken down to significant, the budget allows no more`);
      } else if (e.size === 'major') major--;
      if (e.size === 'significant') {
        if (significant <= 0) {
          e.size = 'minor';
          fixes.push(
            `events[${i}].size: significant taken down to minor, the budget allows no more`,
          );
        } else significant--;
      }
    }
    return fixes;
  },
  check(input, out) {
    const problems: string[] = [];
    const actions = new Map(input.actions.map((a) => [a.id, a]));
    for (const [id, outcome] of Object.entries(out.outcomes)) {
      const action = actions.get(id);
      if (!action) {
        problems.push(`Outcome for unknown action ${id}.`);
        continue;
      }
      const allowed = new Set(action.allowed.map((a) => a.on));
      for (const on of Object.keys(outcome.effects)) {
        if (!allowed.has(on))
          problems.push(
            `${id}: may not touch ${on}. Allowed: ${[...allowed].join(', ') || 'nothing'}.`,
          );
      }
    }
    for (const id of actions.keys())
      if (out.outcomes[id] === undefined) problems.push(`No outcome for action ${id}.`);

    const causes = new Set([...input.recent.map((r) => r.id), ...actions.keys()]);
    const regions = new Set(input.regions.map((r) => r.id));
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
      if (e.causes.length === 0 && e.size === 'major')
        problems.push(`Event ${i}: a major event must cite a cause.`);
      for (const on of Object.keys(e.effects))
        if (input.eventLimits[on] === undefined) problems.push(`Event ${i}: may not touch ${on}.`);
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
    const outcomes: Record<string, z.infer<typeof Outcome>> = {};
    for (const a of input.actions) {
      outcomes[a.id] = {
        result: a.landed,
        effects: Object.fromEntries(a.allowed.map((r) => [r.on, (r.range[0] + r.range[1]) / 2])),
        note: PLAIN_NOTE[a.landed],
      };
    }
    return {
      why: 'No model: each action lands as the dice said, at the middle of its allowed ranges.',
      outcomes,
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
const Verdict = z.object({
  plausible: z.boolean(),
  caused: z.boolean(),
  withinPower: z.boolean(),
  note: z.string().max(200).default(''),
});
const ReviewOut = z.object({
  why: z.string().default(''),
  /** Keyed by the item's index, written as text: one verdict per item, by construction. */
  verdicts: z.record(z.string(), Verdict).default({}),
});
export type ReviewOut = z.infer<typeof ReviewOut>;

export const turnReview: Job<ReviewIn, ReviewOut> = {
  name: 'turn.review',
  shape:
    '{"why":string,"verdicts":{"<item index>":{"plausible":boolean,"caused":boolean,"withinPower":boolean,"note":string}}}',
  usesBrief: true,
  repairs: 1,
  version: 2,
  role: 'adjudicator',
  maxTokens: 1500,
  rules: `You give a second opinion on proposed outcomes in a political simulation. For each item answer three questions.
- "plausible": could this happen in the world described?
- "caused": do the listed causes actually lead to it?
- "withinPower": is it within the powers of whoever acts?
"verdicts" has one entry per item, keyed by that item's "index", each with a one-sentence note. Judge realism only, never morality.`,
  output: ReviewOut,
  schema(input) {
    const verdicts: Record<string, Schema> = {};
    for (const item of input.items) {
      verdicts[String(item.index)] = obj({
        plausible: bool,
        caused: bool,
        withinPower: bool,
        note: str(200),
      });
    }
    return obj({
      why: WHY,
      verdicts: {
        type: 'object',
        properties: verdicts,
        required: Object.keys(verdicts),
        additionalProperties: false,
      },
    });
  },
  check(input, out) {
    const missing = input.items.filter((i) => out.verdicts[String(i.index)] === undefined);
    return missing.length === 0 ? [] : ['Return exactly one verdict per item, keyed by its index.'];
  },
  // With no second opinion available, reviewed items are dropped (spec: turn.review, Fallback).
  fallback(input) {
    const verdicts: Record<string, z.infer<typeof Verdict>> = {};
    for (const item of input.items) {
      verdicts[String(item.index)] = {
        plausible: false,
        caused: false,
        withinPower: false,
        note: 'Not reviewed.',
      };
    }
    return { why: 'No model: reviewed items are dropped.', verdicts };
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
  why: z.string().default(''),
  body: z.string().min(1),
  /** Every figure in the body that is not in the input, declared so it can be kept consistent. */
  details: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
});
export type ChronicleOut = z.infer<typeof ChronicleOut>;

export const chronicleWrite: Job<ChronicleIn, ChronicleOut> = {
  name: 'chronicle.write',
  shape: '{"why":string,"body":string,"details":[{"label":string,"value":string}]}',
  usesBrief: true,
  repairs: 1,
  version: 3,
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
  schema: (input) =>
    obj({
      why: WHY,
      body: str(roomFor(input.words)),
      details: list(obj({ label: str(60), value: str(60) }), 8),
    }),
  mend(input, out) {
    const fixes: string[] = [];
    const sound = dropInvented(out.body, [input, out.details]);
    if (sound && sound.dropped > 0) {
      out.body = sound.text;
      fixes.push(`body: took out ${sound.dropped} sentence(s) stating figures it did not declare`);
    }
    // A piece that overran is trimmed here. Asking for it again costs a whole second call.
    if (words(out.body) > Math.round(input.words * 1.2)) {
      const before = words(out.body);
      out.body = clipWords(out.body, input.words);
      fixes.push(`body: trimmed from ${before} to ${words(out.body)} words`);
    }
    return fixes;
  },
  check(input, out) {
    const problems: string[] = [];
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
const KINDS = ['statement', 'action', 'silence'] as const;
const Later = z.object({
  inDays: z.number().int().min(1).max(90),
  question: z.string(),
  ifYes: z.string().min(1),
  ifNo: z.string().min(1),
});
const Answer = z.object({
  kind: z.enum(KINDS),
  text: z.string().min(1),
  option: z.string().optional(),
  later: Later.optional(),
});
export type Answer = z.infer<typeof Answer>;
const ReactOut = z.object({
  why: z.string().default(''),
  kind: z.enum(KINDS),
  text: z.string().min(1),
  option: z.string().optional(),
  later: Later.optional(),
});
export type ReactOut = z.infer<typeof ReactOut>;

const REACT_RULES = `You voice one actor in a political simulation answering an order the head of government has just given. Answer as that actor would: from its interests, its stance toward the government, and in its own voice.
- Respond to what the order actually says ("order.text"), not to a generic policy.
- "kind": "statement" (it speaks), "action" (it does one of the things in "options", and you set "option" to that id), or "silence" (it pointedly says nothing).
- "text": up to "words" words, third person, like a wire report of the response: what the actor said or did, what it wants, and what it signals it will do next. Quote the actor directly in its own voice, more than once where there is room. For silence, one sentence saying it has not responded.
- "later": optional. A follow-up that could go either way within 90 days, such as a truce holding or a strike being called. Give a yes/no "question", and one sentence for each outcome ("ifYes", "ifNo"). The game decides which happens, and prints that sentence weeks later as a news line on its own: so each must be a complete sentence in the past tense that names who did what and where, never "It will..." or "They may...".
- Stay within what this actor could really do. Use no figures that are not in the input.`;

const answerSchema = (options: readonly Ref[], wordLimit: number): Schema =>
  obj(
    {
      kind: pick(KINDS),
      text: str(roomFor(wordLimit)),
      option: pick(ids(options)),
      later: obj({
        inDays: int(1, 90),
        question: str(160),
        ifYes: str(300),
        ifNo: str(300),
      }),
    },
    ['option', 'later'],
  );

/**
 * Takes out the sentences that state a figure found nowhere in the input. A model that adds
 * "a 30% rise" to an otherwise sound paragraph has made one mistake with one obvious
 * correction, and on a local model asking for the paragraph again costs as long as it took
 * to write. Returns nothing when no sentence would be left: that reply is asked for again.
 */
export function dropInvented(
  text: string,
  known: unknown,
): { text: string; dropped: number } | undefined {
  if (inventedNumbers(text, known).length === 0) return { text, dropped: 0 };
  const sentences = text.split(/(?<=[.!?]["'”’)]*)(\s+)/);
  const kept: string[] = [];
  let dropped = 0;
  for (let i = 0; i < sentences.length; i += 2) {
    const sentence = sentences[i] ?? '';
    if (inventedNumbers(sentence, known).length > 0) dropped++;
    else kept.push(sentence + (sentences[i + 1] ?? ''));
  }
  const rest = kept.join('').trim();
  return rest === '' || inventedNumbers(rest, known).length > 0
    ? undefined
    : { text: rest, dropped };
}

/**
 * An answer whose choice of action does not hold up is simply read as a statement, and a
 * sentence resting on a figure nobody gave it is taken out.
 */
function mendAnswer(
  answer: Answer,
  options: readonly Ref[],
  wordLimit: number,
  known: unknown,
): string[] {
  const fixes: string[] = [];
  const sound = dropInvented(answer.text, known);
  if (sound && sound.dropped > 0) {
    answer.text = sound.text;
    fixes.push(
      `text: took out ${sound.dropped} sentence(s) stating figures that are not in the input`,
    );
  }
  if (
    answer.later &&
    inventedNumbers(`${answer.later.ifYes} ${answer.later.ifNo}`, known).length > 0
  ) {
    delete answer.later;
    fixes.push('later: dropped, since it stated figures that are not in the input');
  }
  const offered = options.some((o) => o.id === answer.option);
  if (answer.kind === 'action' && !offered) {
    fixes.push(
      answer.option === undefined
        ? 'kind: read as a statement, since no action was named'
        : `kind: read as a statement, since "${answer.option}" is not one of its options`,
    );
    answer.kind = 'statement';
    delete answer.option;
  } else if (answer.kind !== 'action' && answer.option !== undefined) {
    fixes.push('option: dropped, since this is not an action');
    delete answer.option;
  }
  if (words(answer.text) > Math.round(wordLimit * 1.2)) {
    const before = words(answer.text);
    answer.text = clipWords(answer.text, wordLimit);
    fixes.push(`text: trimmed from ${before} to ${words(answer.text)} words`);
  }
  return fixes;
}

export const policyReact: Job<ReactIn, ReactOut> = {
  name: 'policy.react',
  shape:
    '{"why":string,"kind":"statement"|"action"|"silence","text":string,"option"?:string,"later"?:{"inDays":number,"question":string,"ifYes":string,"ifNo":string}}',
  usesBrief: true,
  repairs: 1,
  version: 2,
  role: 'narrator',
  maxTokens: 2000,
  rules: REACT_RULES,
  output: ReactOut,
  schema: (input) => {
    const answer = answerSchema(input.options, input.words) as {
      properties: Record<string, Schema>;
      required: string[];
    };
    return obj({ why: WHY, ...answer.properties }, ['option', 'later']);
  },
  mend: (input, out) => mendAnswer(out, input.options, input.words, input),
  check(input, out) {
    const invented = inventedNumbers(
      `${out.text} ${out.later?.ifYes ?? ''} ${out.later?.ifNo ?? ''}`,
      input,
    );
    return invented.length > 0 ? [`The figures ${invented.join(', ')} are not in the input.`] : [];
  },
  fallback: templateReaction,
};

// -------------------------------------------------------------------------------- turn.reactions

/**
 * Everything the cast says and does after a turn, in one call: its answers to the turn's
 * orders, and the moves some of its members make unprompted. On a server that handles one
 * request at a time — any model on this machine — separate calls queue behind each other
 * and each pays the prompt again, so one call with one shared prompt is the faster shape
 * (spec: Speed).
 */
export interface ReactBatchIn {
  items: {
    /** The key this item's answer is filed under. */
    key: string;
    /** The order being answered. Left out when the actor is moving first. */
    order?: ReactIn['order'];
    /**
     * Why this actor is acting unprompted, as the engine sees it. The engine decides who
     * moves and why; the model decides what the move is, and writes it (REQ-ACT-21).
     */
    motive?: { reason: string; region?: Ref };
    actor: ReactIn['actor'];
    options: Ref[];
  }[];
  /** The most each response may run to, in words. */
  words: number;
  state: Record<string, number | string>;
  recent: { when: string; summary: string }[];
}
const ReactBatchOut = z.object({
  why: z.string().default(''),
  answers: z.record(z.string(), Answer).default({}),
});
export type ReactBatchOut = z.infer<typeof ReactBatchOut>;

export const turnReactions: Job<ReactBatchIn, ReactBatchOut> = {
  name: 'turn.reactions',
  shape:
    '{"why":string,"answers":{"<item key>":{"kind":"statement"|"action"|"silence","text":string,"option"?:string,"later"?:{"inDays":number,"question":string,"ifYes":string,"ifNo":string}}}}',
  usesBrief: true,
  repairs: 1,
  version: 2,
  role: 'narrator',
  maxTokens: 6000,
  rules: `${REACT_RULES}

You are given several items at once. Answer every one of them, in "answers", keyed by that item's "key". Each actor answers only its own item's order, in its own voice; do not let one answer echo another. "option" for an item must be an id from that item's own "options".

An item with a "motive" and no "order" is not an answer to anything. That actor is moving first, on its own initiative, for the reason given in "motive". Decide what it does and write it as news: a demand, a march, an attack, an ultimatum, a warning, a walkout, an offer, a visit, a leak. Make it specific, make it something the head of government will have to deal with, and do not present it as a response to an order. "silence" is not allowed for these items. Prefer "action" when one of its options fits, and give a "later" follow-up when the move could go either way.`,
  output: ReactBatchOut,
  schema(input) {
    const answers: Record<string, Schema> = {};
    for (const item of input.items) answers[item.key] = answerSchema(item.options, input.words);
    return obj({
      why: WHY,
      answers: {
        type: 'object',
        properties: answers,
        required: Object.keys(answers),
        additionalProperties: false,
      },
    });
  },
  mend(input, out) {
    const fixes: string[] = [];
    for (const item of input.items) {
      const answer = out.answers[item.key];
      if (!answer) continue;
      // An actor chosen to move first cannot answer by saying nothing.
      if (item.order === undefined && answer.kind === 'silence') {
        answer.kind = 'statement';
        fixes.push(`${item.key}.kind: read as a statement, since a move cannot be silence`);
      }
      for (const fix of mendAnswer(answer, item.options, input.words, [
        item,
        input.state,
        input.recent,
      ]))
        fixes.push(`${item.key}.${fix}`);
    }
    return fixes;
  },
  check(input, out) {
    const problems: string[] = [];
    for (const item of input.items) {
      const answer = out.answers[item.key];
      if (!answer) {
        problems.push(`No answer for ${item.key} (${item.actor.name}).`);
        continue;
      }
      const invented = inventedNumbers(
        `${answer.text} ${answer.later?.ifYes ?? ''} ${answer.later?.ifNo ?? ''}`,
        [item, input.state, input.recent],
      );
      if (invented.length > 0)
        problems.push(`${item.key}: the figures ${invented.join(', ')} are not in the input.`);
    }
    for (const key of Object.keys(out.answers))
      if (!input.items.some((i) => i.key === key)) problems.push(`Unknown item key ${key}.`);
    return problems;
  },
  fallback(input) {
    const answers: Record<string, Answer> = {};
    for (const item of input.items) {
      if (item.order === undefined) {
        answers[item.key] = templateMove(item);
        continue;
      }
      const { why: _why, ...answer } = templateReaction({
        order: item.order,
        actor: item.actor,
        options: item.options,
        words: input.words,
        state: input.state,
        recent: input.recent,
      });
      answers[item.key] = answer;
    }
    return { why: 'No model: a standard response for each kind of actor.', answers };
  },
};

/** A move with no model: what this kind of actor does when it acts first. */
function templateMove(item: ReactBatchIn['items'][number]): Answer {
  const { actor } = item;
  const name = actor.name;
  const where = item.motive?.region?.label ?? 'the country';
  const has = (id: string) => item.options.some((o) => o.id === id);
  const say = (text: string, later?: Answer['later']): Answer => ({
    kind: 'statement',
    text,
    ...(later ? { later } : {}),
  });
  const act = (option: string, text: string, later?: Answer['later']): Answer =>
    has(option) ? { kind: 'action', option, text, ...(later ? { later } : {}) } : say(text, later);

  switch (actor.kind) {
    case 'militant':
      return act(
        'step_up_attacks',
        `${name} claimed an attack on a security post in ${where}. "The state will find no rest here," its statement said.`,
        {
          inDays: 10,
          question: 'Do the security forces contain it?',
          ifYes: `Security forces said they had driven ${name} back from the roads around ${where}.`,
          ifNo: `${name} followed its attack with a second, on a convoy in ${where}.`,
        },
      );
    case 'opposition':
      return act(
        'call_protests',
        `${name} called a day of protest across the country. "This government answers to no one, so it will answer to the street," its leadership said.`,
        {
          inDays: 7,
          question: 'Does the protest draw crowds?',
          ifYes: `Large crowds answered the call from ${name}, closing main roads in several cities.`,
          ifNo: `The protest called by ${name} drew thin crowds and dispersed by evening.`,
        },
      );
    case 'ally':
      return act(
        'demand_concessions',
        `${name} said its support "cannot be taken for granted" and set out what it expects from the government before the next vote.`,
        {
          inDays: 14,
          question: 'Does it stay in the coalition?',
          ifYes: `${name} said it would remain in the coalition "for the time being".`,
          ifNo: `${name} said it would sit apart from the government in the legislature until its demands were met.`,
        },
      );
    case 'business':
      return say(
        `${name} warned that its members were cutting shifts and delaying investment. "We are asking the government for a meeting, and for a plan," its president said.`,
      );
    case 'lender':
      return act(
        'warn_publicly',
        `${name} said its staff were "watching recent slippages closely" and that the next review would depend on corrective steps.`,
      );
    case 'religious':
      return say(
        `${name} used Friday sermons to press the government over conditions in ${where}, and said it would bring its followers out if it was ignored.`,
        {
          inDays: 10,
          question: 'Does it hold back?',
          ifYes: `${name} said it had been heard and called off its planned gatherings.`,
          ifNo: `${name} brought its followers into the streets of ${where}.`,
        },
      );
    case 'province':
      return say(
        `${name} wrote to the federal government demanding its overdue share of funds and a say in decisions that touch ${where}. "We will not be governed by circular," its spokesman said.`,
      );
    case 'military':
      return say(
        `${name} met to review the security situation and said afterwards that conditions in ${where} "demand the government's full attention and full resources".`,
      );
    default:
      if (actor.stance === 'hostile' || actor.stance === 'wary')
        return say(
          `${name} summoned the country's envoy and said it held the government responsible for "what is allowed to happen on its soil".`,
        );
      return say(
        `${name} sent a senior official to the capital to seek assurances about its interests and its people in ${where}.`,
      );
  }
}

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
const LEVERS = ['offer', 'threat', 'none'] as const;
const ReplyOut = z.object({
  why: z.string().default(''),
  reply: z.string().min(1),
  /** What the asker put on the table, if anything. The engine holds them to an offer. */
  lever: z
    .object({ kind: z.enum(LEVERS), claim: z.string().default('') })
    .default({ kind: 'none', claim: '' }),
});
export type ReplyOut = z.infer<typeof ReplyOut>;

const REPLY_WORDS = 120;

export const actorReply: Job<ReplyIn, ReplyOut> = {
  name: 'actor.reply',
  shape: '{"why":string,"reply":string,"lever":{"kind":"offer"|"threat"|"none","claim":string}}',
  usesBrief: true,
  repairs: 1,
  version: 2,
  role: 'narrator',
  maxTokens: 1500,
  rules: `You speak as one person or body in a political simulation, answering a question put by the head of government ("asker").
- Answer in the first person, in that actor's voice, from its interests and its stance toward the asker. An adviser is candid; a rival is guarded or sharp; an official of another country is diplomatic.
- Use only what is in "knows", "state", "policies" and the world brief. If you do not know, say so in character. Never invent events, decisions or figures.
- Give a view, not a list: what this means, what worries you, what you would do. You may disagree with the asker.
- At most 120 words. No stage directions, no narration, just what is said.
- "lever": did the asker put something on the table? "offer" if they undertook to do something this actor wants (state it in "claim" as one plain sentence, "The Prime Minister will ..."); "threat" if they threatened this actor; otherwise "none". Words of friendship, arguments and questions are "none". An offer does not change your position by itself: say what you would need to see.`,
  output: ReplyOut,
  schema: () =>
    obj({
      why: WHY,
      reply: str(roomFor(REPLY_WORDS)),
      lever: obj({ kind: pick(LEVERS), claim: str(200) }),
    }),
  mend(input, out) {
    const fixes: string[] = [];
    const sound = dropInvented(out.reply, input);
    if (sound && sound.dropped > 0) {
      out.reply = sound.text;
      fixes.push(`reply: took out ${sound.dropped} sentence(s) stating figures it was not given`);
    }
    if (words(out.reply) > 150) {
      const before = words(out.reply);
      out.reply = clipWords(out.reply, REPLY_WORDS);
      fixes.push(`reply: trimmed from ${before} to ${words(out.reply)} words`);
    }
    return fixes;
  },
  check(input, out) {
    const invented = inventedNumbers(out.reply, input);
    return invented.length > 0
      ? [`The figures ${invented.join(', ')} are not in what you know.`]
      : [];
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
    turnReactions,
    actorReply,
  ].map((j) => [j.name, j]),
);

export const INSTRUMENT_REFS = CATALOGUE.map((i) => ({
  id: i.id,
  label: i.title,
  needsRegion: i.needsRegion === true,
  hasDirection: i.effects.some((e) => e.range[0] < 0 && e.range[1] > 0),
}));
