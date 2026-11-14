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
  /**
   * What else happens in the period, already decided by the engine: what kind of thing,
   * where, on which day, involving whom, and how much it matters. The judge words each one
   * and decides none of it (decision record 0012).
   */
  happenings: {
    id: string;
    kind: string;
    size: Size;
    when: string;
    where?: string;
    who?: string;
    /** A plain line saying what happened, to be written properly. */
    gist: string;
  }[];
  recent: { id: string; when: string; summary: string }[];
}
/** Effects in the short form: one named number per variable, `{"inflation": 1.2}`. */
const Effects = z.record(z.string(), z.number()).default({});
const Outcome = z.object({
  result: z.enum(RESULTS),
  effects: Effects,
  note: z.string().max(300).default(''),
});
const AdjudicateOut = z.object({
  why: z.string().default(''),
  /** Keyed by action id: exactly one outcome per action, by construction. */
  outcomes: z.record(z.string(), Outcome).default({}),
  /** Keyed by happening id: the one sentence of news for each. */
  events: z.record(z.string(), z.string()).default({}),
});
export type AdjudicateOut = z.infer<typeof AdjudicateOut>;

const PLAIN_NOTE = {
  as_intended: 'Carried out as ordered.',
  partial: 'Carried out in part, with the usual friction.',
  stalled: 'Announced, but it has not moved.',
  backfired: 'Carried out, and it has turned against the government.',
} as const;

export const turnAdjudicate: Job<AdjudicateIn, AdjudicateOut> = {
  name: 'turn.adjudicate',
  shape:
    '{"why":string,"outcomes":{"<action id>":{"result":"as_intended"|"partial"|"stalled"|"backfired","effects":{"<variable>":number},"note":string}},"events":{"<happening id>":string}}',
  usesBrief: true,
  repairs: 2,
  version: 5,
  role: 'adjudicator',
  maxTokens: 4000,
  rules: `You judge one stretch of time in a political simulation. You do not know which actor, if any, is a human; treat every action the same way.
- "outcomes" has one entry per action, keyed by the action's id. How each action went has already been decided and is given as its "landed": as_intended, partial, stalled (announced, and nothing moved) or backfired (carried out, and it turned against whoever ordered it). Copy it into "result". You do not choose it.
- "effects" is an object of named numbers. Give a value for each variable the action is allowed to touch, inside its range; the ranges already reflect how it landed. A stalled action has none.
- "note": one sentence for the record that says why it went the way "landed" says: who dragged their feet, what gave way, what the order ran into. Plain and factual, with no figures.
- "events" has one entry per item in "happenings", keyed by its id. Each happening is settled: that kind of thing took place, on that day ("when"), in that place ("where"), involving that actor ("who"), and it matters as much as its "size" says. You decide none of that and may change none of it.
- For each, write one sentence of news, at most 200 characters, that makes its "gist" specific to this country as the world brief describes it: name the city, the institution, the union, the road, the crossing. Do not copy the gist's wording. Do not state the date: it is shown beside the line. Keep to the season. Use no figures that are not in the input. Make each different from the others and from "recent".
- State what happened. Do not comment on whether it is right or wrong, and do not add what it led to.`,
  output: AdjudicateOut,
  schema(input) {
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
    const events: Record<string, Schema> = {};
    for (const happening of input.happenings) events[happening.id] = str(200);
    const keyed = (properties: Record<string, Schema>): Schema => ({
      type: 'object',
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    });
    return obj({ why: WHY, outcomes: keyed(outcomes), events: keyed(events) });
  },
  mend(input, out) {
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
    // A happening is news whatever becomes of its wording: a line that is missing, invents a
    // figure or passes judgment is replaced by the plain line, and never costs a second call.
    for (const happening of input.happenings) {
      const line = out.events[happening.id]?.trim() ?? '';
      const why =
        line === ''
          ? 'was not written'
          : inventedNumbers(line, input).length > 0
            ? 'stated figures that are not in the input'
            : COMMENTARY.test(line)
              ? 'passed judgment on what happened'
              : undefined;
      if (why === undefined) continue;
      out.events[happening.id] = happening.gist;
      fixes.push(`events.${happening.id}: the plain line is used, since the one written ${why}`);
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
      events: Object.fromEntries(input.happenings.map((h) => [h.id, h.gist])),
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
  /** Who is who: the people and bodies of the country, so that the account can name them. */
  people?: string[];
  /** The player, by name and office: the one person an account may put no words or acts to. */
  reader?: string;
  /** The player's own advisers, by office, who do nothing on the player's behalf either. */
  office?: string[];
  /** Details already established in this campaign, to be used as they stand. */
  canon?: Detail[];
}
const ChronicleOut = z.object({
  why: z.string().default(''),
  /** Names and other details this account introduced, to be kept the same from now on. */
  details: z
    .array(z.object({ label: z.string().min(1).max(80), value: z.string().min(1).max(160) }))
    .default([]),
  body: z.string().min(1),
});
export type ChronicleOut = z.infer<typeof ChronicleOut>;

/**
 * The names an account may not put words or acts to: the player and their own office,
 * in lower case. One that the record itself mentions about this event is left out, since
 * then the account is only reporting what is already known.
 */
function guardedNames(input: ChronicleIn): string[] {
  const recorded =
    `${input.event.summary} ${input.related.map((r) => r.summary).join(' ')}`.toLowerCase();
  return [...(input.reader ?? '').split(','), ...(input.office ?? [])]
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 3 && !recorded.includes(name));
}

export const chronicleWrite: Job<ChronicleIn, ChronicleOut> = {
  name: 'chronicle.write',
  shape: '{"why":string,"details":[{"label":string,"value":string}],"body":string}',
  usesBrief: true,
  repairs: 1,
  version: 4,
  role: 'narrator',
  maxTokens: 3500,
  rules: `You write the full account of one event in a political simulation for adult readers, as the day's lead dispatch in a newspaper of record. This is fiction about politics; some events are violent.
- The event itself is settled: what happened, where, when, to whom, and every figure in "event.numbers". Build the account from "event" and "related". Do not change the outcome, add a second event, or say what it led to afterwards.
- Make it a scene a reader can see. Open with a dateline in bold: the place, the date and the hour ("**Quetta, 4 November 2026, 14:00**"). Then the sequence: who arrived, what was said and by whom, what the room, the street or the market did. Close on where things stood when it ended.
- Be specific. Name the hall, the road, the ministry, the union, the officials present by office and by name. Use the names in "people", the world brief and "canon". Where a name or a detail of texture is missing (a spokesman, a venue, a crowd size, a share index, a count of shops shut), make up a plausible one for this country.
- "details" comes first, before you write. Settle there every name you are going to use that nobody has given you, as { "label": the office or thing, "value": the name }. A detail in "canon" is already settled: use it exactly, never rename or contradict it, and do not list it again.
- You may write what a named official or spokesman said, in direct speech, where it fits what "related" and "event" show that actor did or wanted. Attribute every quote. If "event.speaker" is given, the event is something that speaker said or did: build the account around it.
- What you may not make up: the figures in "event.numbers" (never restate them differently), the state of the economy or the public mood, who controls territory, how a vote went, and whether something else happened.
- The reader is the head of government, named in "reader". Never write that the reader said, did, ordered, convened, visited or decided anything, and never quote them, unless "related" or "event" records it. Their own cabinet and office do nothing on their behalf either. The account is what the rest of the country did; what the reader does next is theirs to decide.
- Write up to "words" words and use the room: do not stop short.
- State what happened. No lessons, warnings, disclaimers or judging adjectives. Report violence plainly: what, where, who, with no technique or instructions.
- Layout: plain paragraphs separated by blank lines. "**" around the dateline and around a short label that opens a paragraph. A list of "- " items where figures read best as a list. Nothing else.`,
  output: ChronicleOut,
  schema: (input) =>
    obj({
      why: WHY,
      // Names are settled before the writing starts, so that what is written uses them.
      details: list(obj({ label: str(80), value: str(160) }), 10),
      body: str(roomFor(input.words)),
    }),
  mend(input, out) {
    const fixes: string[] = [];
    // A detail already settled keeps the name it has.
    const settled = new Set((input.canon ?? []).map((d) => d.label.trim().toLowerCase()));
    const fresh = out.details.filter((d) => !settled.has(d.label.trim().toLowerCase()));
    if (fresh.length !== out.details.length) {
      fixes.push(`details: dropped ${out.details.length - fresh.length} already on record`);
      out.details = fresh;
    }
    // What the player and their own office did is the player's to decide, and is never
    // written for them. A sentence that has them say or do something the record does not
    // show is taken out, whatever the writer was told.
    const guarded = guardedNames(input);
    if (guarded.length > 0) {
      const all = sentencesOf(out.body);
      const kept = all.filter(
        (part) => !guarded.some((name) => part.sentence.toLowerCase().includes(name)),
      );
      if (kept.length > 0 && kept.length < all.length) {
        out.body = rejoin(kept);
        fixes.push(
          `body: took out ${all.length - kept.length} sentence(s) that put words or acts to the player or their office`,
        );
      }
    }
    // A piece that overran is trimmed here. Asking for it again costs a whole second call.
    if (words(out.body) > Math.round(input.words * 1.25)) {
      const before = words(out.body);
      out.body = clipWords(out.body, input.words);
      fixes.push(`body: trimmed from ${before} to ${words(out.body)} words`);
    }
    return fixes;
  },
  // Texture is no longer policed for figures (decision record 0014): an account that may not
  // name a crowd or a hall is a restatement of its own headline.
  check(input, out) {
    const problems: string[] = [];
    if (COMMENTARY.test(out.body)) problems.push('Remove commentary; state only what happened.');
    const body = out.body.toLowerCase();
    if (guardedNames(input).some((name) => body.includes(name)))
      problems.push(
        'Do not write what the head of government or their own office said or did. Write only what the rest of the country did.',
      );
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
/**
 * Text cut into sentences, each with the white space that followed it, so that what is kept
 * can be put back together as it was written. A list number stays with its item: "2." on
 * its own is not a sentence, and taking the item away must take its number too.
 */
function sentencesOf(text: string): { sentence: string; gap: string }[] {
  const parts = text.split(/(?<=[.!?]["'”’)*]*)(\s+)/);
  const out: { sentence: string; gap: string }[] = [];
  let carry = '';
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = carry + (parts[i] ?? '');
    const gap = parts[i + 1] ?? '';
    if (/^\s*(\d+[.)]|[-*•])\s*$/.test(sentence) && i + 2 < parts.length) {
      carry = `${sentence} `;
      continue;
    }
    carry = '';
    if (sentence.trim() !== '') out.push({ sentence, gap });
  }
  return out;
}
const rejoin = (kept: { sentence: string; gap: string }[]) =>
  kept
    .map((part) => part.sentence + part.gap)
    .join('')
    .trim();

/**
 * Figures that are a proposal, not a claim about the world: "within 48 hours", "for thirty
 * days", "in 3 phases". Somebody setting out a plan may name them freely.
 */
const PROPOSED =
  /\b\d+(?:[.,]\d+)?[- ](?:hours?|days?|weeks?|months?|years?|phases?|stages?|steps?)\b/gi;

/**
 * Takes out the sentences that state a figure found nowhere in the input. A model that adds
 * "a 30% rise" to an otherwise sound paragraph has made one mistake with one obvious
 * correction, and on a local model asking for the paragraph again costs as long as it took
 * to write. Returns nothing when no sentence would be left: that reply is asked for again.
 */
export function dropInvented(
  text: string,
  known: unknown,
  plans = false,
): { text: string; dropped: number } | undefined {
  const invented = (part: string) =>
    inventedNumbers(plans ? part.replace(PROPOSED, '') : part, known).length > 0;
  if (!invented(text)) return { text, dropped: 0 };
  const all = sentencesOf(text);
  const kept = all.filter((part) => !invented(part.sentence));
  const rest = rejoin(kept);
  return rest === '' || invented(rest)
    ? undefined
    : { text: rest, dropped: all.length - kept.length };
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
  /** The most the reply may run to, in words. Set by the player's detail setting. */
  words: number;
  /**
   * For the asker's own advisers: the kinds of order the asker can issue, and where, so
   * that advice can end in something that can be done.
   */
  canOrder?: { instruments: string[]; regions: string[] };
  /** Who is who: the people and bodies of the country, so that advice can name them. */
  people?: string[];
  /**
   * Details already established in this campaign: a name given to an office holder, a
   * venue, a programme. Whoever writes next uses them as they stand (decision record 0014).
   */
  canon?: Detail[];
}
/** A detail of texture: what it is, and the name or value it was given. */
export interface Detail {
  label: string;
  value: string;
}
const Details = z
  .array(z.object({ label: z.string().min(1).max(80), value: z.string().min(1).max(160) }))
  .default([]);
const LEVERS = ['offer', 'threat', 'none'] as const;
const ReplyOut = z.object({
  why: z.string().default(''),
  reply: z.string().min(1),
  /** Names and other details this reply introduced, to be kept the same from now on. */
  details: Details,
  /**
   * From an adviser: orders the asker could issue to do what was discussed, in the asker's
   * own voice. They are drafts: nothing happens until the player puts one on the desk.
   */
  orders: z.array(z.string()).default([]),
  /** What the asker put on the table, if anything. The engine holds them to an offer. */
  lever: z
    .object({ kind: z.enum(LEVERS), claim: z.string().default('') })
    .default({ kind: 'none', claim: '' }),
});
export type ReplyOut = z.infer<typeof ReplyOut>;

/** A sentence as it is compared: without its list number, its case or its punctuation. */
const plain = (sentence: string) =>
  sentence
    .toLowerCase()
    .replace(/^\s*(\d+[.)]|[-*•])\s*/, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();

/**
 * Takes out the sentences an actor has already said to the asker, word for word. A model
 * shown its own earlier answers copies them, and a player who asks a new question and gets
 * the old paragraph back has been told nothing. Returns the text unchanged if nothing was
 * repeated, and nothing at all if every sentence was.
 */
export function dropRepeated(
  text: string,
  earlier: readonly string[],
): { text: string; dropped: number } | undefined {
  const said = new Set(
    earlier
      .flatMap((reply) => sentencesOf(reply))
      .map((part) => plain(part.sentence))
      .filter((sentence) => sentence.length > 30),
  );
  const all = sentencesOf(text);
  const kept = all.filter((part) => !said.has(plain(part.sentence)));
  if (kept.length === all.length) return { text, dropped: 0 };
  return kept.length === 0 ? undefined : { text: rejoin(kept), dropped: all.length - kept.length };
}

/** Numbers the steps of a list 1, 2, 3 again, after mending has taken some of them out. */
export function renumber(text: string): string {
  const step = /(^|\n|(?<=[.!?:"”] ))(\d{1,2})\.(?= )/g;
  if ((text.match(step) ?? []).length < 2) return text;
  let n = 0;
  return text.replace(step, (_all, lead: string) => `${lead}${++n}.`);
}

export const actorReply: Job<ReplyIn, ReplyOut> = {
  name: 'actor.reply',
  shape:
    '{"why":string,"reply":string,"details":[{"label":string,"value":string}],"orders":string[],"lever":{"kind":"offer"|"threat"|"none","claim":string}}',
  usesBrief: true,
  repairs: 1,
  version: 4,
  role: 'narrator',
  maxTokens: 3500,
  rules: `You speak as one person or body in a political simulation, answering the head of government ("asker").
- Answer in the first person, in that actor's voice, from its interests and its stance toward the asker. A rival is guarded or sharp; an official of another country is diplomatic.
- Answer what was just asked. Read "question" again before you write: if it asks for a plan, give a plan; if it asks how, say how; if it asks whether something exists, say yes or no first.
- Fit the length to the question. A simple question (who, whether something exists, how do I reach someone, what does this mean) gets two or three short paragraphs and no headings. "Should I...?" about a serious step, a request for a plan, or "how do we...?" is a judgment call: it gets a full briefing that uses the room in "words". Never pad, and never cut a real answer short.
- Be specific, always. Name the person, the office, the city, the law and its article, the date, the amount. "Engage tribal leaders" is useless; "send the Interior Minister to Quetta on Thursday to meet the Sarawan and Jhalawan sardars" is advice. Use the names in "people", the world brief and "canon".
- "details" comes first, before you write. Settle there every name you are going to use that nobody has given you: who holds an office, where a meeting is held, what a body or a programme is called. Make up a plausible one for this country and list it as { "label": the office or thing, "value": the name }, in the form { "label": "Mayor of the capital", "value": "<a name>" }. Every person you then name who is not in "people", the world brief or "canon" must be in "details". A detail in "canon" is already settled: use it exactly, never rename or contradict it, and do not list it again.
- What you may not make up: the figures in "state" (the economy, the public mood, unrest, who controls what), how a vote went, and whether something happened. Those come only from "state", "knows" and "policies". If you do not know whether something happened, say so in character.
- Never repeat yourself. "earlier" holds what you have already said to the asker. Do not reuse a sentence, a recommendation or a warning from it: the asker has read it. Every reply must say something new.
- If "actor.kind" is "advisor", you work for the asker, like a senior official who wants the boss to succeed and tells them the truth. For a serious question write a briefing in headed sections that fit it, such as: what you are really asking; what will actually happen if you do it, and who will do what; what I would do instead, or how to do it well; my advice in two sentences. Say plainly when a step is a mistake and why, then show the better way to the same end. If the asker has heard your objection and still wants it done, drop it and give the best way to do it.
- Otherwise, give a view, not a list: what this means to you, what you want, what you would need to see. You may disagree with the asker.
- Layout: plain paragraphs. A section starts with a line "## Heading". A list item starts with "- " or "1. ". Put "**" around the few words that carry a point. Nothing else: no tables, no code, no stage directions, no narration. "reply" holds only what you say: the orders go in "orders", never in a section of the reply.
- "orders": only if "actor.kind" is "advisor" and something can be done: up to five orders the asker could issue to carry out what was discussed, each one sentence in the asker's own voice as an instruction ("Announce that...", "Send...", "Offer..."), saying who, what, where and by when, and of a kind listed in "canOrder" where one fits. They are drafts for the asker to use or ignore. Otherwise an empty list.
- "lever": did the asker put something on the table for you? "offer" if they undertook to do something this actor wants (state it in "claim" as one plain sentence, "The Prime Minister will ..."); "threat" if they threatened this actor; otherwise "none". Words of friendship, arguments, questions, and anything said to their own adviser are "none". An offer does not change your position by itself: say what you would need to see.`,
  output: ReplyOut,
  schema: (input) =>
    obj({
      why: WHY,
      // Names are settled before the writing starts, so that what is written uses them.
      details: list(obj({ label: str(80), value: str(160) }), 10),
      reply: str(roomFor(input.words)),
      orders: list(str(280), 5),
      lever: obj({ kind: pick(LEVERS), claim: str(200) }),
    }),
  mend(input, out) {
    const fixes: string[] = [];
    const adviser = input.actor.kind === 'advisor';
    const fresh = dropRepeated(
      out.reply,
      input.earlier.map((turn) => turn.reply),
    );
    if (fresh && fresh.dropped > 0) {
      out.reply = fresh.text;
      fixes.push(`reply: took out ${fresh.dropped} sentence(s) it had already said word for word`);
    }
    // A reply that runs on into the fields that should have followed it is cut where they begin.
    // Either as raw fields, or dressed up as sections headed "Orders" or "Lever".
    const spill = [
      out.reply.search(/\s*"?\b(orders|lever|details)"?\s*:\s*[[{]/),
      out.reply.search(/\n\s*#{1,4}\s*(draft\s+|suggested\s+)?(orders?|lever|details)\b/i),
    ]
      .filter((at) => at > 0)
      .sort((a, b) => a - b)[0];
    if (spill !== undefined) {
      out.reply = out.reply.slice(0, spill).trimEnd();
      fixes.push('reply: cut where it ran on into its other fields');
    }
    // A detail already settled keeps the name it has: one declared again under the same
    // label is dropped, so that the record never holds two Chief Justices.
    const settled = new Set((input.canon ?? []).map((d) => d.label.trim().toLowerCase()));
    const fresh2 = out.details.filter((d) => !settled.has(d.label.trim().toLowerCase()));
    if (fresh2.length !== out.details.length) {
      fixes.push(`details: dropped ${out.details.length - fresh2.length} already on record`);
      out.details = fresh2;
    }
    if (words(out.reply) > Math.round(input.words * 1.25)) {
      const before = words(out.reply);
      out.reply = clipWords(out.reply, input.words);
      fixes.push(`reply: trimmed from ${before} to ${words(out.reply)} words`);
    }
    const tidy = renumber(out.reply);
    if (tidy !== out.reply) {
      out.reply = tidy;
      fixes.push('reply: steps numbered again after some were taken out');
    }
    // Only the asker's own office drafts orders, and nothing said to it is a bargain.
    if (!adviser && out.orders.length > 0) {
      out.orders = [];
      fixes.push('orders: dropped, since only an adviser drafts orders');
    }
    if (adviser && out.lever.kind !== 'none') {
      out.lever = { kind: 'none', claim: '' };
      fixes.push('lever: dropped, since nothing said to your own adviser is an offer or a threat');
    }
    out.orders = out.orders.map((order) => order.trim()).filter((order) => order.length >= 12);
    return fixes;
  },
  check(input, out) {
    // Figures are no longer policed here (decision record 0014): advice that may not name a
    // date, an amount or an article is advice with nothing in it. The world's own figures
    // are kept honest by what the actor is given, and what it invents is put on record.
    const problems: string[] = [];
    const earlier = input.earlier.map((turn) => turn.reply);
    if (earlier.length > 0 && dropRepeated(out.reply, earlier) === undefined)
      problems.push(
        'You repeated what you said before, word for word. Answer the latest question with something new.',
      );
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
        details: [],
        orders: [],
        lever: { kind: threat ? 'threat' : 'offer', claim: input.question.slice(0, 200) },
      };
    }
    return {
      lever: { kind: 'none' as const, claim: '' },
      details: [],
      orders: [],
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
