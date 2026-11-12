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
  eventLimits: Allowed[];
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
  version: 1,
  role: 'adjudicator',
  maxTokens: 4000,
  rules: `You judge one stretch of time in a political simulation. You do not know which actor, if any, is a human; treat every action the same way.
- Return exactly one outcome per action. "result" says how the action went in practice: as_intended, partial, stalled or backfired. Institutions resist change: most large changes land partially.
- "effects": for each variable in the action's "allowed" list, you may give a value inside its range, with a short reason. You may not name any other variable. A stalled action has no effects.
- "note": one sentence for the record, plain and factual.
- "events": other things that happen in the period, from trivial to grave: scandals, strikes, statements, accidents, deals. Keep them consistent with the state and the world brief. Each needs a "kind", a "size", a one-sentence "summary" (at most 200 characters), "inDays" (days after the period starts, within the period), and "causes": ids from "recent" or from "actions". An event with no cause among those may only be size "colour" or "minor".
- Event "effects" may use only the variables in "eventLimits", inside those ranges.
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
    const limits = new Map(input.eventLimits.map((l) => [l.on, l]));
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
        const rule = limits.get(fx.on);
        if (!rule) problems.push(`Event ${i}: may not touch ${fx.on}.`);
        else if (!inRange(fx.value, rule.range))
          problems.push(
            `Event ${i}: ${fx.on} must be between ${rule.range[0]} and ${rule.range[1]}.`,
          );
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

export interface ChronicleIn {
  period: { from: string; to: string };
  events: {
    id: string;
    when: string;
    kind: string;
    size: Size;
    summary: string;
    place?: Ref;
    numbers: { label: string; before: number; after: number; unit: string }[];
    causes: string[];
  }[];
  previous: { headline: string }[];
  audience: 'player';
  level: 'restrained' | 'standard' | 'mature';
  maxEntries: number;
}
const ChronicleOut = z.object({
  why: z.string(),
  entries: z.array(
    z.object({
      when: z.string(),
      headline: z.string().min(1),
      body: z.string(),
      cites: z.array(z.string()).min(1),
      place: z.string().optional(),
    }),
  ),
  ...ext,
});
export type ChronicleOut = z.infer<typeof ChronicleOut>;

export const chronicleWrite: Job<ChronicleIn, ChronicleOut> = {
  name: 'chronicle.write',
  version: 1,
  role: 'narrator',
  maxTokens: 4000,
  rules: `You write the record of a period in a political simulation for adult readers, from a list of events that have already happened in the simulation. This is fiction about politics; some events are violent.
- Add nothing that is not in the events. Tell each event once. You may combine related events into one entry.
- Entries are in time order. "when" is the date of the first event the entry cites.
- "headline": at most 90 characters. "body": at most 80 words, plain and specific, like a wire report.
- "cites": ids of the events the entry is built from, at least one. Every event of size significant or major must be cited by some entry.
- Use only figures given in the cited events' "numbers". Never invent a number.
- State what happened. No lessons, warnings, disclaimers or judging adjectives. Report violence as a newspaper of record would: what, where, who, with no instructions or technique.
- At most "maxEntries" entries. "place" is a region id when the entry has one.`,
  output: ChronicleOut,
  check(input, out) {
    const problems: string[] = [];
    const events = new Map(input.events.map((e) => [e.id, e]));
    const cited = new Set<string>();
    let last = '';
    if (out.entries.length > input.maxEntries)
      problems.push(`At most ${input.maxEntries} entries.`);
    for (const [i, entry] of out.entries.entries()) {
      if (entry.headline.length > 90) problems.push(`Entry ${i}: headline is over 90 characters.`);
      if (words(entry.body) > 80) problems.push(`Entry ${i}: body is over 80 words.`);
      if (entry.when < last) problems.push(`Entry ${i}: entries must be in time order.`);
      last = entry.when;
      const sources = [];
      for (const id of entry.cites) {
        const event = events.get(id);
        if (!event) problems.push(`Entry ${i}: unknown event id ${id}.`);
        else sources.push(event);
        cited.add(id);
      }
      const invented = inventedNumbers(`${entry.headline} ${entry.body}`, [sources, input.period]);
      if (invented.length > 0)
        problems.push(
          `Entry ${i}: the figures ${invented.join(', ')} are not in the cited events.`,
        );
      if (COMMENTARY.test(`${entry.headline} ${entry.body}`))
        problems.push(`Entry ${i}: remove commentary; state only what happened.`);
    }
    for (const e of input.events) {
      if ((e.size === 'major' || e.size === 'significant') && !cited.has(e.id))
        problems.push(`Event ${e.id} (${e.size}) must be cited.`);
    }
    return problems;
  },
  fallback(input) {
    const ranked = [...input.events].sort((a, b) => SIZES.indexOf(b.size) - SIZES.indexOf(a.size));
    const keep = new Set(ranked.slice(0, input.maxEntries).map((e) => e.id));
    for (const e of input.events)
      if (e.size === 'major' || e.size === 'significant') keep.add(e.id);
    return {
      why: "No model: one entry per event, in the event's own words.",
      entries: input.events
        .filter((e) => keep.has(e.id))
        .map((e) => ({
          when: e.when,
          headline: clip(e.summary, 90),
          body:
            e.numbers.length > 0
              ? e.numbers.map((n) => `${n.label}: ${n.before} to ${n.after} ${n.unit}.`).join(' ')
              : e.summary.length > 90
                ? e.summary
                : '',
          cites: [e.id],
          ...(e.place ? { place: e.place.id } : {}),
        })),
    };
  },
};

// -------------------------------------------------------------------------------- policy.report

export interface ReportIn {
  policies: {
    id: string;
    title: string;
    stage: string;
    owner: Ref;
    targets: { label: string; before: number; now: number; unit: string }[];
    linked: { id: string; when: string; summary: string }[];
    slant: 'candid' | 'favourable' | 'flattering';
  }[];
}
const ReportOut = z.object({
  why: z.string(),
  reports: z.array(
    z.object({
      policy: z.string(),
      status: z.string().min(1).max(240),
      effect: z.string().min(1),
      attribution: z.enum(['little', 'some', 'most']),
      sideEffects: z.array(z.string()).default([]),
      cites: z.array(z.string()).default([]),
    }),
  ),
  ...ext,
});
export type ReportOut = z.infer<typeof ReportOut>;

export const policyReport: Job<ReportIn, ReportOut> = {
  name: 'policy.report',
  version: 1,
  role: 'narrator',
  maxTokens: 3000,
  rules: `You write short status reports on government policies, in the voice of the ministry responsible, for the head of government.
- One report per policy. "status": one sentence on where it stands. "effect": at most 60 words on what it has done so far.
- Use only the figures given in "targets". Never invent a number.
- "attribution": how much of the change the ministry claims for the policy: little, some or most.
- Write in the given "slant": candid is plain; favourable stresses what went well; flattering avoids bad news. Never change the figures.
- "cites": ids of linked events you rely on. Use ids only.`,
  output: ReportOut,
  check(input, out) {
    const problems: string[] = [];
    const policies = new Map(input.policies.map((p) => [p.id, p]));
    const seen = new Set<string>();
    for (const r of out.reports) {
      const policy = policies.get(r.policy);
      if (!policy) {
        problems.push(`Report for unknown policy ${r.policy}.`);
        continue;
      }
      seen.add(r.policy);
      if (words(r.effect) > 60) problems.push(`${r.policy}: "effect" is over 60 words.`);
      const invented = inventedNumbers(
        `${r.status} ${r.effect} ${r.sideEffects.join(' ')}`,
        policy,
      );
      if (invented.length > 0)
        problems.push(`${r.policy}: the figures ${invented.join(', ')} are not in the input.`);
      const linked = new Set(policy.linked.map((l) => l.id));
      for (const id of r.cites)
        if (!linked.has(id)) problems.push(`${r.policy}: unknown event id ${id}.`);
    }
    for (const id of policies.keys())
      if (!seen.has(id)) problems.push(`No report for policy ${id}.`);
    return problems;
  },
  fallback(input) {
    return {
      why: 'No model: figures only.',
      reports: input.policies.map((p) => ({
        policy: p.id,
        status: `Stage: ${p.stage}.`,
        effect:
          p.targets.length > 0
            ? p.targets.map((t) => `${t.label}: ${t.before} to ${t.now} ${t.unit}.`).join(' ')
            : 'No measured change yet.',
        attribution: 'some' as const,
        sideEffects: [],
        cites: [],
      })),
    };
  },
};

// -------------------------------------------------------------------------------- memory.digest

export interface DigestIn {
  span: { from: string; to: string; level: 'month' | 'year' };
  entries: { id: string; when: string; headline: string; body: string }[];
  pinned: string[];
}
const DigestOut = z.object({
  why: z.string(),
  digest: z.string().min(1),
  keep: z.array(z.string()).default([]),
  threads: z
    .array(
      z.object({
        title: z.string(),
        status: z.enum(['open', 'closed']),
        entries: z.array(z.string()),
      }),
    )
    .default([]),
  ...ext,
});
export type DigestOut = z.infer<typeof DigestOut>;

export const memoryDigest: Job<DigestIn, DigestOut> = {
  name: 'memory.digest',
  version: 1,
  role: 'extractor',
  maxTokens: 2000,
  rules: `You compress the record of one month of a political simulation into a digest that later readers will rely on.
- "digest": at most 150 words, in time order, covering what mattered. Use only figures that appear in the entries.
- "keep": ids of entries worth keeping in full. Every id in "pinned" must be in "keep".
- "threads": ongoing stories, each with a title, whether it is open or closed, and the entry ids that belong to it.
- State what happened, without commentary. Use ids only.`,
  output: DigestOut,
  check(input, out) {
    const problems: string[] = [];
    const ids = new Set(input.entries.map((e) => e.id));
    if (words(out.digest) > 150) problems.push('"digest" is over 150 words.');
    for (const id of input.pinned)
      if (!out.keep.includes(id)) problems.push(`Pinned entry ${id} must be in "keep".`);
    for (const id of [...out.keep, ...out.threads.flatMap((t) => t.entries)]) {
      if (!ids.has(id)) problems.push(`Unknown entry id ${id}.`);
    }
    const invented = inventedNumbers(out.digest, input);
    if (invented.length > 0)
      problems.push(`The figures ${invented.join(', ')} are not in the entries.`);
    return problems;
  },
  fallback(input) {
    const text = input.entries.map((e) => e.headline).join('. ');
    return {
      why: 'No model: the headlines.',
      digest: text === '' ? 'A quiet month.' : `${text.split(/\s+/).slice(0, 140).join(' ')}.`,
      keep: [...input.pinned],
      threads: [],
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
    policyReport,
    memoryDigest,
  ].map((j) => [j.name, j]),
);

export const INSTRUMENT_REFS = CATALOGUE.map((i) => ({
  id: i.id,
  label: i.title,
  needsRegion: i.needsRegion === true,
  hasDirection: i.effects.some((e) => e.range[0] < 0 && e.range[1] > 0),
}));
