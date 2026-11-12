/**
 * The director runs the game: it turns the player's boxes into policies, has the period
 * judged, lets the engine apply the result, and has the record written. Every step is saved
 * before the next begins, so a stop at any point resumes without applying anything twice
 * (REQ-PERF-05). Models propose; the engine and the ledger decide.
 */
import {
  type Authority,
  addEffects,
  CATALOGUE,
  checkFunding,
  courtStays,
  createWorld,
  type Effect,
  type EngineEvent,
  fiscalCost,
  type Instrument,
  legislatureVote,
  NOVEL_LIMITS,
  narrow,
  nationalApproval,
  PROCEDURE_DAYS,
  removeEffects,
  resolveInstrument,
  resolveNovel,
  roll,
  type Scenario,
  stepDay,
  touchedBy,
  type World,
} from '@statecraft/engine';
import type { Ledger } from '@statecraft/ledger';
import {
  type AdjudicateIn,
  type Allowed,
  actorReply,
  type CompiledPolicy,
  chronicleWrite,
  type Harness,
  INSTRUMENT_REFS,
  policyCompile,
  policyReact,
  REACTION_OPTIONS,
  type Size,
  turnAdjudicate,
  turnReview,
} from '@statecraft/models';
import {
  type CallView,
  type CardView,
  type ChronicleEntry,
  type Figure,
  MAX_ADVANCE_DAYS,
  type MoveSpan,
  type PolicyCard,
  type PolicyView,
  RESOLUTION_STEPS,
  type ResolutionStep,
  type ScenarioInfo,
  type StoredEvent,
  type View,
  type WorldEventView,
} from '@statecraft/protocol';
import {
  loadOutlines,
  loadScenario,
  loadWorldOutlines,
  SCENARIO_IDS,
  type ScenarioId,
} from '@statecraft/scenarios';
import { ambientEvent } from './ambient.ts';
import {
  dateOf,
  dayOf,
  describeChange,
  economyRows,
  labelOf,
  monthName,
  monthOf,
  mood,
  readTarget,
  round1,
} from './words.ts';

export class DirectorError extends Error {
  constructor(
    readonly code: 'no_campaign' | 'busy' | 'nothing_to_do' | 'not_found' | 'bad_request',
    message: string,
  ) {
    super(message);
    this.name = 'DirectorError';
  }
}

interface PolicyRecord {
  id: string;
  title: string;
  summary: string;
  instrument: string;
  region?: string;
  scale: CompiledPolicy['scale'];
  direction?: CompiledPolicy['direction'];
  funding: string;
  fromCards: string[];
  orders: string[];
  announcedDay: number;
  enactDay: number;
  blockedReason?: string;
  /** The order was too unclear for anyone to act on. */
  vague?: boolean;
}
interface CompileData {
  policies: PolicyRecord[];
  conflicts: { cards: string[]; explanation: string }[];
  needsDetail: { card: string; question: string }[];
  consumed: string[];
}
interface AdjudicateData {
  /** No model wrote events for this period, so the world's own noise fills in. */
  quiet?: boolean;
  outcomes: { policy: string; result: string; note: string; picks: Record<string, number> }[];
  events: {
    kind: string;
    size: Size;
    summary: string;
    place?: string;
    inDays: number;
    picks: Record<string, number>;
    causes: string[];
  }[];
}
interface ApplyData {
  /** Policies that did not survive a vote or a court, with the reason. */
  stopped?: Record<string, string>;
  world: World;
  toDay: number;
  events: WorldEventView[];
  effects: Record<string, Effect[]>;
  baseline: Record<string, Record<string, number | string>>;
  stoppedEarly?: string;
}
interface ReactionRecord {
  id: string;
  actor: string;
  actorName: string;
  policy: string;
  kind: 'statement' | 'action' | 'silence';
  text: string;
}
/** A follow-up the dice will decide on its day. */
interface Beat {
  id: string;
  dueDay: number;
  policy: string;
  place?: string;
  ifYes: string;
  ifNo: string;
}
interface ReactionData {
  reactions: ReactionRecord[];
  events: WorldEventView[];
  beats: Beat[];
  /** Actors touched more lightly, by policy id. */
  others: Record<string, string[]>;
}
interface Resolution {
  id: string;
  kind: 'execute' | 'advance';
  fromDay: number;
  days: number | null;
  cardIds: string[];
  mixedSignals: boolean;
  status: 'running' | 'committed' | 'cancelled' | 'blocked';
  compile?: CompileData;
  adjudicate?: AdjudicateData;
  apply?: ApplyData;
  blocked?: Pick<CompileData, 'conflicts' | 'needsDetail'>;
  commitSeq?: number;
  startSeq?: number;
  hours?: number;
  untilMajor?: boolean;
  /** The hour of day the turn ended on. */
  hour?: number;
  reactions?: ReactionData;
}

/** Everything the ledger says about the current branch, folded into one object. */
interface Projection {
  scenarioId?: string;
  seed?: string;
  startSeq?: number;
  cards: Map<string, CardView>;
  resolutions: Resolution[];
  repealed: Set<string>;
  digests: { month: string; text: string }[];
  expanded: Map<string, { body: string; via: string }>;
  talks: Map<string, { id: string; day: number; question: string; reply?: string }[]>;
}

function project(events: readonly StoredEvent[]): Projection {
  const p: Projection = {
    cards: new Map(),
    resolutions: [],
    repealed: new Set(),
    digests: [],
    expanded: new Map(),
    talks: new Map(),
  };
  const byId = new Map<string, Resolution>();
  for (const { seq, event } of events) {
    switch (event.type) {
      case 'campaign.started':
        p.scenarioId = event.scenarioId;
        p.seed = event.seed;
        p.startSeq = seq;
        break;
      case 'card.created':
        p.cards.set(event.card.id, {
          id: event.card.id,
          text: event.card.text,
          createdAt: event.card.createdAt,
        });
        break;
      case 'card.deleted':
        p.cards.delete(event.cardId);
        break;
      case 'card.edited': {
        const card = p.cards.get(event.cardId);
        if (card) {
          card.text = event.text;
          delete card.reading;
          delete card.sent;
        }
        break;
      }
      case 'card.pinned': {
        const card = p.cards.get(event.cardId);
        if (card) {
          if (event.pinned) card.pinned = true;
          else if (card.sent) p.cards.delete(event.cardId);
          else delete card.pinned;
        }
        break;
      }
      case 'card.moved': {
        const moving = p.cards.get(event.cardId);
        if (moving) {
          const rest = [...p.cards.values()].filter((c) => c.id !== moving.id);
          const at = event.beforeId === null ? -1 : rest.findIndex((c) => c.id === event.beforeId);
          rest.splice(at < 0 ? rest.length : at, 0, moving);
          p.cards = new Map(rest.map((c) => [c.id, c]));
        }
        break;
      }
      case 'card.read': {
        const card = p.cards.get(event.cardId);
        if (card)
          card.reading = {
            reading: event.reading.reading,
            instrument: event.reading.instrument,
            ...(event.reading.question ? { question: event.reading.question } : {}),
          };
        break;
      }
      case 'resolution.started': {
        const r: Resolution = {
          id: event.id,
          kind: event.kind,
          fromDay: event.fromDay,
          days: event.days,
          cardIds: event.cardIds,
          mixedSignals: event.mixedSignals,
          status: 'running',
          startSeq: seq,
          ...(event.hours ? { hours: event.hours } : {}),
          ...(event.untilMajor ? { untilMajor: true } : {}),
        };
        byId.set(r.id, r);
        p.resolutions.push(r);
        break;
      }
      case 'resolution.step': {
        const r = byId.get(event.id);
        // Step data is written and read only by this file.
        if (r) (r as unknown as Record<string, unknown>)[event.step] = event.data;
        break;
      }
      case 'resolution.blocked': {
        const r = byId.get(event.id);
        if (r) {
          r.status = 'blocked';
          r.blocked = event.data as Resolution['blocked'] & object;
        }
        break;
      }
      case 'resolution.cancelled': {
        const r = byId.get(event.id);
        if (r) r.status = 'cancelled';
        break;
      }
      case 'resolution.committed': {
        const r = byId.get(event.id);
        if (r) {
          r.status = 'committed';
          r.commitSeq = seq;
          if (event.hour !== undefined) r.hour = event.hour;
          for (const id of r.compile?.consumed ?? []) {
            const card = p.cards.get(id);
            // A pinned box stays on the desk as a standing instruction.
            if (card?.pinned) card.sent = true;
            else p.cards.delete(id);
          }
        }
        break;
      }
      case 'reactions.written': {
        const r = byId.get(event.id);
        if (r) r.reactions = event.data as ReactionData;
        break;
      }
      case 'entry.expanded':
        p.expanded.set(event.eventId, { body: event.body, via: event.via });
        break;
      case 'talk.asked': {
        const thread = p.talks.get(event.actorId) ?? [];
        thread.push({ id: event.id, day: event.day, question: event.question });
        p.talks.set(event.actorId, thread);
        break;
      }
      case 'talk.replied':
        for (const thread of p.talks.values()) {
          const turn = thread.find((t) => t.id === event.id);
          if (turn) turn.reply = event.reply;
        }
        break;
      case 'policy.repealed':
        p.repealed.add(event.policyId);
        break;
      case 'digest.written':
        p.digests.push({ month: event.month, text: event.text });
        break;
    }
  }
  return p;
}

/** Why a policy never took effect, if it did not: outside the office's powers, voted down, or stayed. */
const refusalOf = (policy: PolicyRecord, origin: Resolution): string | undefined =>
  policy.blockedReason ?? origin.apply?.stopped?.[policy.id];

const ENGINE_EVENT_SIZE = (event: EngineEvent): Size => {
  if (event.type === 'unrest.stage') {
    return event.to === 'insurgency'
      ? 'major'
      : event.to === 'riot' || event.to === 'protest'
        ? 'significant'
        : 'minor';
  }
  return event.type === 'threshold.cleared' ? 'significant' : 'major';
};
const FLAG_TEXT: Readonly<Record<string, [string, string]>> = {
  reserves_low: [
    'Foreign reserves fell below three months of imports.',
    'Foreign reserves recovered above three and a half months of imports.',
  ],
  borrowing_cost_surge: [
    'The premium lenders demand on government debt rose sharply.',
    'The premium on government debt eased.',
  ],
};
/** How many actors answer one order in full; the rest are noted by name. */
const MAX_REACTIONS = 3;
const STAGE_ORDER = ['calm', 'protest', 'riot', 'insurgency'];
const ROUTINE_KINDS = new Set([
  'policy.announced',
  'policy.enacted',
  'policy.milestone',
  'figures.monthly',
]);
/** Notices that need no telling: they are reported in built-in wording, without a model. */
const isRoutine = (e: WorldEventView) =>
  ROUTINE_KINDS.has(e.kind) || (e.kind === 'legislature.vote' && e.size === 'minor');

export interface DirectorOptions {
  ledger: Ledger;
  harness: Harness;
  /** Makes the campaign seed. Tests pass a fixed one. */
  newSeed?: () => string;
  newId?: () => string;
}

export interface Director {
  view(): View;
  scenarios(): ScenarioInfo[];
  start(scenarioId: string): void;
  addCard(card: PolicyCard): void;
  deleteCard(id: string): void;
  /** Change a box's wording, pin it as a standing instruction, or move it. */
  patchCard(
    id: string,
    patch: {
      text?: string | undefined;
      pinned?: boolean | undefined;
      beforeId?: string | null | undefined;
    },
  ): void;
  /** Send the boxes and run the clock; with no `days`, to the first result worth attention. */
  execute(mixedSignals: boolean, days?: number): void;
  advance(days: number): void;
  cancel(): void;
  repeal(policyId: string): void;
  /** One move of the clock. Any boxes on the desk are sent first. */
  move(span: MoveSpan, mixedSignals: boolean): void;
  /** Write the full piece on one event, the first time its entry is opened. */
  expandEntry(eventId: string): void;
  /** Put a question to a member of the cast. The answer arrives later. */
  ask(actorId: string, question: string): void;
  rewind(seq: number): void;
  /** Go back to any past date, including one in the middle of a resolution. */
  rewindToDate(date: string): void;
  calls(resolution?: string): CallView[];
  /** Outlines for the map: the scenario's regions and the world behind them. */
  mapData(): { regions: unknown; world: unknown } | null;
  /** The true numbers, for the developer inspector only. */
  debugWorld(): World | null;
  /** Resolves when no background work is left. */
  idle(): Promise<void>;
}

export function createDirector(options: DirectorOptions): Director {
  const { ledger, harness } = options;
  const newSeed = options.newSeed ?? (() => Math.random().toString(36).slice(2, 12));

  let cache:
    | { version: number; projection: Projection; world: World | null; scenario: Scenario | null }
    | undefined;
  const state = () => {
    if (cache && cache.version === ledger.version()) return cache;
    const projection = project(ledger.events());
    const world = (ledger.latestSnapshot()?.world as World | undefined) ?? null;
    const scenario = projection.scenarioId
      ? loadScenario(projection.scenarioId as ScenarioId)
      : null;
    cache = { version: ledger.version(), projection, world, scenario };
    return cache;
  };

  // One background task at a time; a resolution goes ahead of box readings (REQ-PERF-02).
  const queue: { priority: number; run: () => Promise<void> }[] = [];
  let working: Promise<void> | undefined;
  let cancelRequested: string | undefined;
  /** True while the cast's answers to the last turn are still being written. */
  let arrivingReactions = false;
  /** Entries whose full piece is being written right now. */
  const writing = new Set<string>();
  const pump = () => {
    if (working) return;
    const next = queue.sort((a, b) => a.priority - b.priority).shift();
    if (!next) return;
    working = next
      .run()
      .catch((error) => console.error('[director]', error))
      .finally(() => {
        working = undefined;
        pump();
      });
  };
  const enqueue = (priority: number, run: () => Promise<void>) => {
    queue.push({ priority, run });
    pump();
  };

  const requireCampaign = () => {
    const s = state();
    if (!s.world || !s.scenario) throw new DirectorError('no_campaign', 'Start a campaign first.');
    return { ...s, world: s.world, scenario: s.scenario };
  };
  const running = () => state().projection.resolutions.find((r) => r.status === 'running');
  /** Nothing may rewrite the world while reactions to the last turn are still arriving. */
  const requireSettled = () => {
    requireQuiet();
    if (arrivingReactions)
      throw new DirectorError('busy', 'Reactions to your last move are still arriving.');
  };
  const requireQuiet = () => {
    if (running()) throw new DirectorError('busy', 'A resolution is still running.');
  };
  const regionRefs = (world: World) => {
    const listed = state().scenario?.regions ?? [];
    return world.regions.map((r) => {
      const aliases = listed.find((x) => x.id === r.id)?.aliases ?? [];
      return { id: r.id, label: r.name, ...(aliases.length > 0 ? { aliases } : {}) };
    });
  };
  const actorId = (world: World) => `gov-${world.country.toLowerCase()}`;

  const committedPolicies = (p: Projection): { policy: PolicyRecord; resolution: Resolution }[] =>
    p.resolutions
      .filter((r) => r.status === 'committed')
      .flatMap((r) => (r.compile?.policies ?? []).map((policy) => ({ policy, resolution: r })));
  const allEvents = (p: Projection): WorldEventView[] =>
    p.resolutions
      .filter((r) => r.status === 'committed')
      .flatMap((r) => [...(r.apply?.events ?? []), ...(r.reactions?.events ?? [])]);

  const saveStep = (id: string, step: ResolutionStep, data: unknown) =>
    ledger.append({ type: 'resolution.step', id, step, data });

  // -------------------------------------------------------------------------------- the steps

  async function compileStep(
    r: Resolution,
    world: World,
    scenario: Scenario,
    p: Projection,
  ): Promise<CompileData> {
    const cards = r.cardIds
      .map((id) => p.cards.get(id))
      .filter((c): c is CardView => c !== undefined);
    if (cards.length === 0) return { policies: [], conflicts: [], needsDetail: [], consumed: [] };
    const standing = committedPolicies(p)
      .filter(
        ({ policy, resolution }) => !refusalOf(policy, resolution) && !p.repealed.has(policy.id),
      )
      .map(({ policy }) => ({ id: policy.id, title: policy.title, instrument: policy.instrument }));
    const { output } = await harness.run(
      policyCompile,
      {
        cards: cards.map((c) => ({ id: c.id, text: c.text })),
        standing,
        office: scenario.office,
        instruments: INSTRUMENT_REFS,
        regions: regionRefs(world),
      },
      { resolution: r.id, brief: scenario.brief },
    );
    const text = new Map(cards.map((c) => [c.id, c.text]));
    const conflicts = r.mixedSignals ? [] : output.conflicts;
    const policies: PolicyRecord[] = [];
    // Mixed signals: conflicting boxes go ahead as separate orders, in the player's own words.
    const extra: CompiledPolicy[] = r.mixedSignals
      ? output.conflicts
          .flatMap((c) => c.cards)
          .map((id) => ({
            title: 'Order outside the catalogue',
            summary: text.get(id) ?? '',
            instrument: 'novel',
            scale: 'small' as const,
            funding: 'unspecified' as const,
            fromCards: [id],
          }))
      : [];
    for (const [i, compiled] of [...output.policies, ...extra].entries()) {
      const instrument = CATALOGUE.find((c) => c.id === compiled.instrument);
      const authority: Authority = instrument?.authority ?? 'executive';
      const allowed = (scenario.office.powers as string[]).includes(authority);
      policies.push({
        id: `${r.id}-p${i + 1}`,
        title: compiled.title,
        summary: compiled.summary,
        instrument: compiled.instrument,
        ...(compiled.region ? { region: compiled.region } : {}),
        scale: compiled.scale,
        ...(compiled.direction ? { direction: compiled.direction } : {}),
        funding: compiled.funding,
        fromCards: compiled.fromCards,
        orders: compiled.fromCards.map((id) => text.get(id) ?? ''),
        announcedDay: r.fromDay,
        enactDay: r.fromDay + PROCEDURE_DAYS[authority],
        ...(allowed
          ? {}
          : {
              blockedReason:
                scenario.office.limits[authority] ??
                `The ${scenario.office.title} does not hold this power.`,
            }),
      });
    }
    // A vague order is not sent back with a question. It goes out as written, and the
    // world answers it: the ministries cannot act on it, and that is reported.
    for (const [i, unclear] of output.needsDetail.entries()) {
      const order = text.get(unclear.card) ?? '';
      policies.push({
        id: `${r.id}-v${i + 1}`,
        title: order.length > 80 ? `${order.slice(0, 79).trimEnd()}…` : order,
        summary: order,
        instrument: 'novel',
        scale: 'small',
        funding: 'unspecified',
        fromCards: [unclear.card],
        orders: [order],
        announcedDay: r.fromDay,
        enactDay: r.fromDay,
        vague: true,
        blockedReason:
          'Too vague to act on. Officials could not tell what was wanted, and nothing was done.',
      });
    }
    const held = new Set(conflicts.flatMap((c) => c.cards));
    return {
      policies,
      conflicts,
      needsDetail: [],
      consumed: cards.map((c) => c.id).filter((id) => !held.has(id)),
    };
  }

  function allowedFor(policy: PolicyRecord, world: World): Allowed[] {
    const instrument = CATALOGUE.find((c) => c.id === policy.instrument);
    if (!instrument) {
      const tags = [...new Set(world.groups.flatMap((g) => g.tags))];
      const limit = (kind: string) => NOVEL_LIMITS[kind] ?? 0;
      return [
        { on: 'growth', range: [-limit('growth'), limit('growth')], unit: 'points' },
        { on: 'inflation', range: [-limit('inflation'), limit('inflation')], unit: 'points' },
        ...tags.map(
          (t): Allowed => ({
            on: `approval.${t}`,
            range: [-limit('approval'), limit('approval')],
            unit: 'points',
          }),
        ),
        {
          on: policy.region ? `grievance.${policy.region}` : 'grievance.all',
          range: [-limit('grievance'), limit('grievance')],
          unit: 'points',
        },
      ];
    }
    return instrument.effects.map((e) => ({
      on: e.on.replace('{region}', policy.region ?? ''),
      range: narrow(e, policy.scale, policy.direction ?? 'raise').map(round2) as [number, number],
      unit: e.unit,
    }));
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const periodDays = (r: Resolution, active: PolicyRecord[]): number => {
    if (r.hours) return 0;
    if (r.days !== null) return Math.min(r.days, MAX_ADVANCE_DAYS);
    if (active.length === 0) return 7;
    // Run to the first result worth the player's attention (REQ-CLK-02).
    const firstFelt = Math.min(
      ...active.map((p) => {
        const lags = (CATALOGUE.find((c) => c.id === p.instrument)?.effects ?? []).map(
          (e) => e.lagDays,
        );
        return (
          p.enactDay -
          r.fromDay +
          (lags.length > 0 ? Math.min(...lags.filter((l) => l > 0), 30) : 0)
        );
      }),
    );
    return Math.max(14, Math.min(45, firstFelt + 14));
  };

  async function adjudicateStep(
    r: Resolution,
    world: World,
    scenario: Scenario,
    p: Projection,
  ): Promise<AdjudicateData> {
    const active = (r.compile?.policies ?? []).filter((x) => !x.blockedReason);
    const days = periodDays(r, active);
    const by = actorId(world);
    const actions = active.map((x) => ({
      id: x.id,
      by,
      summary: `${x.title}. ${x.summary}`.slice(0, 400),
      stage: 'announced',
      allowed: allowedFor(x, world),
    }));
    // Nothing was ordered and little time passes: there is nothing to judge, so no model is
    // called and the world's own events fill the days.
    if (actions.length === 0 && days < 7) return { quiet: true, outcomes: [], events: [] };

    const tags = [...new Set(world.groups.flatMap((g) => g.tags))];
    const input: AdjudicateIn = {
      period: {
        from: dateOf(world.startDate, r.fromDay),
        to: dateOf(world.startDate, r.fromDay + days),
        days,
      },
      state: {
        ...Object.fromEntries(economyRows(world).map((row) => [row.label, round1(row.value)])),
        ...Object.fromEntries(world.regions.map((x) => [`unrest.${x.id}`, x.stage])),
        ...Object.fromEntries(world.groups.map((g) => [`mood.${g.id}`, mood(g.approval)])),
      },
      regions: world.regions.map((x) => ({ id: x.id, label: x.name })),
      actions,
      eventLimits: {
        inflation: 0.5,
        growth: 0.2,
        'grievance.all': 3,
        ...Object.fromEntries(world.regions.map((x) => [`grievance.${x.id}`, 3])),
        ...Object.fromEntries(tags.map((t) => [`approval.${t}`, 3])),
      },
      recent: allEvents(p)
        .slice(-8)
        .map((e) => ({ id: e.id, when: e.date, summary: e.summary })),
      surpriseBudget: { major: days >= 30 ? 1 : 0, significant: 1 + Math.floor(days / 45) },
    };
    const context = { resolution: r.id, brief: scenario.brief };
    const { output, via } = await harness.run(turnAdjudicate, input, context);

    const toPicks = (effects: { on: string; value: number }[]) =>
      Object.fromEntries(effects.filter((e) => e.value !== 0).map((e) => [e.on, e.value]));
    const data: AdjudicateData = {
      ...(via === 'fallback' ? { quiet: true } : {}),
      outcomes: output.outcomes.map((o) => ({
        policy: o.action,
        result: o.result,
        note: o.note,
        picks: o.result === 'stalled' ? {} : toPicks(o.effects),
      })),
      events: output.events.map((e) => ({
        kind: e.kind,
        size: e.size,
        summary: e.summary,
        ...(e.place ? { place: e.place } : {}),
        inDays: e.inDays,
        picks: toPicks(e.effects),
        causes: e.causes,
      })),
    };

    // A second opinion, for major events only (REQ-JOB-12). Orders outside the catalogue do
    // not need one: the engine already holds their effects to small amounts.
    const major = data.events.filter((e) => e.size === 'major');
    if (major.length > 0) {
      const items = major.map((e, index) => ({
        index,
        summary: e.summary,
        causes: e.causes.map((id) => ({
          id,
          summary: input.recent.find((x) => x.id === id)?.summary ?? id,
        })),
        actorPowers: [],
      }));
      const review = await harness.run(turnReview, { items }, context);
      const failed = new Set(
        review.output.verdicts
          .filter((v) => !(v.plausible && v.caused && v.withinPower))
          .map((v) => v.index),
      );
      data.events = data.events.filter(
        (e) => !(e.size === 'major' && failed.has(major.indexOf(e))),
      );
    }
    return data;
  }

  function applyStep(r: Resolution, start: World, scenario: Scenario, p: Projection): ApplyData {
    const compile = r.compile ?? { policies: [], conflicts: [], needsDetail: [], consumed: [] };
    const judged = r.adjudicate ?? { outcomes: [], events: [] };
    const active = compile.policies.filter((x) => !x.blockedReason);
    const days = periodDays(r, active);
    const events: WorldEventView[] = [];
    let n = 0;
    const emit = (
      day: number,
      kind: string,
      size: Size,
      summary: string,
      causes: string[],
      extra: Partial<WorldEventView> = {},
    ) => {
      const event: WorldEventView = {
        id: `${r.id}-e${++n}`,
        day,
        date: dateOf(start.startDate, day),
        kind,
        size,
        summary,
        causes,
        numbers: [],
        ...extra,
      };
      events.push(event);
      return event;
    };

    let world = start;
    const effects: ApplyData['effects'] = {};
    const baseline: ApplyData['baseline'] = {};
    const pendingEnact: PolicyRecord[] = [];
    const stopped: Record<string, string> = {};
    for (const policy of compile.policies) {
      if (policy.vague) {
        emit(
          r.fromDay,
          'policy.unclear',
          'minor',
          `Ministries were left unsure how to act on an instruction from the ${scenario.office.title}: "${policy.title}" Officials waited for clarity and nothing was done.`,
          [policy.id],
        );
        continue;
      }
      if (policy.blockedReason) {
        emit(
          r.fromDay,
          'policy.blocked',
          'minor',
          `An order could not be carried out: ${policy.title}. ${policy.blockedReason}`,
          [policy.id],
        );
        continue;
      }
      const outcome = judged.outcomes.find((o) => o.policy === policy.id);
      const instrument: Instrument | undefined = CATALOGUE.find((c) => c.id === policy.instrument);
      const where = policy.region ? { place: policy.region } : {};

      // Veto players. A budget measure needs the legislature; an order made on the office's
      // own authority can be stayed by the courts. Dice decide both.
      const government = scenario.government;
      const authority: Authority = instrument?.authority ?? 'executive';
      if (government && authority === 'budget') {
        const popularity = Object.entries(outcome?.picks ?? {})
          .filter(([on]) => on.startsWith('approval.'))
          .reduce((sum, [, value]) => sum + value, 0);
        const vote = legislatureVote(world.seed, `vote:${policy.id}`, government.legislature, {
          popularity,
          nationalApproval: nationalApproval(world),
        });
        const tally = `${vote.yes} votes to ${vote.no}`;
        if (!vote.passed) {
          stopped[policy.id] = `The ${government.legislature.name} voted it down, ${tally}.`;
          emit(
            r.fromDay,
            'legislature.vote',
            'significant',
            `The ${government.legislature.name} voted down a government measure, ${tally}: ${policy.title}.`,
            [policy.id],
            where,
          );
          continue;
        }
        emit(
          r.fromDay,
          'legislature.vote',
          'minor',
          `The ${government.legislature.name} passed a government measure, ${tally}: ${policy.title}.`,
          [policy.id],
          where,
        );
      } else if (
        government &&
        courtStays(world.seed, `court:${policy.id}`, government.court, policy.scale)
      ) {
        const court = government.court.name;
        stopped[policy.id] = `${court[0]?.toUpperCase()}${court.slice(1)} stayed the order.`;
        emit(
          r.fromDay,
          'court.stay',
          'significant',
          `A petition succeeded: ${court} stayed a government order: ${policy.title}.`,
          [policy.id],
          where,
        );
        continue;
      }
      const resolution = {
        day: policy.enactDay,
        causes: [policy.id],
        idPrefix: policy.id,
        ...(policy.region ? { region: policy.region } : {}),
      };
      const picks = outcome?.picks ?? {};
      const made = instrument
        ? resolveInstrument(world, instrument, picks, resolution)
        : resolveNovel(world, picks, resolution);
      // A budget line cannot be cut below nothing: the cut stops at what is there to cut.
      for (const effect of made) {
        const available = readTarget(world, effect.on);
        if (
          effect.on.startsWith('spending.') &&
          typeof available === 'number' &&
          effect.amount < -available
        )
          effect.amount = -available;
      }
      // Whatever the slate costs and does not raise is borrowed, and shows up in the debt.
      checkFunding(made, Math.max(0, fiscalCost(made)));
      baseline[policy.id] = Object.fromEntries(made.map((e) => [e.on, readTarget(world, e.on)]));
      effects[policy.id] = made;
      world = addEffects(world, made);
      emit(
        r.fromDay,
        'policy.announced',
        'minor',
        `The ${scenario.office.title} ordered: ${policy.title}.`,
        [policy.id],
        policy.region ? { place: policy.region } : {},
      );
      pendingEnact.push(policy);
    }

    const planned = judged.events
      .filter((e) => e.inDays <= days)
      .map((e) => ({ ...e, day: r.fromDay + e.inDays }))
      .sort((a, b) => a.day - b.day);
    let monthStart = { month: monthOf(dateOf(world.startDate, world.day)), world };
    let stoppedEarly: string | undefined;
    let ambientSignificant = 1 + Math.floor(days / 45);
    const beats = p.resolutions.flatMap((x) =>
      x.status === 'committed' ? (x.reactions?.beats ?? []) : [],
    );
    // Policies whose progress is worth a line when they start to bite or have been felt.
    const watched = [
      ...committedPolicies(p)
        .filter(
          ({ policy, resolution }) => !refusalOf(policy, resolution) && !p.repealed.has(policy.id),
        )
        .map(({ policy, resolution }) => ({
          policy,
          made: resolution.apply?.effects[policy.id] ?? [],
          was: resolution.apply?.baseline[policy.id] ?? {},
        })),
      ...pendingEnact.map((policy) => ({
        policy,
        made: effects[policy.id] ?? [],
        was: baseline[policy.id] ?? {},
      })),
    ];

    for (let i = 0; i < days && !stoppedEarly; i++) {
      for (const policy of pendingEnact.filter(
        (x) => x.enactDay === world.day && x.enactDay !== r.fromDay,
      )) {
        emit(
          world.day,
          'policy.enacted',
          'minor',
          `Took legal effect: ${policy.title}.`,
          [policy.id],
          policy.region ? { place: policy.region } : {},
        );
      }
      if (judged.quiet) {
        const today = dateOf(world.startDate, world.day);
        const ambient = ambientEvent(world, today, ambientSignificant > 0);
        if (ambient) {
          if (ambient.size === 'significant') ambientSignificant--;
          const event = emit(
            world.day,
            ambient.kind,
            ambient.size,
            ambient.summary,
            ['trend'],
            ambient.place ? { place: ambient.place } : {},
          );
          if (Object.keys(ambient.picks).length > 0) {
            world = addEffects(
              world,
              resolveNovel(world, ambient.picks, {
                day: world.day,
                causes: [event.id],
                idPrefix: event.id,
              }),
            );
          }
        }
      }
      for (const e of planned.filter((x) => x.day === world.day)) {
        const event = emit(
          world.day,
          e.kind,
          e.size,
          e.summary,
          e.causes,
          e.place ? { place: e.place } : {},
        );
        if (Object.keys(e.picks).length > 0) {
          world = addEffects(
            world,
            resolveNovel(world, e.picks, {
              day: world.day,
              causes: [event.id],
              idPrefix: event.id,
            }),
          );
        }
      }
      // Follow-ups set up by earlier reactions come due: the dice decide which way each goes.
      for (const beat of beats.filter((b) => b.dueDay === world.day)) {
        const yes = roll(world.seed, `beat:${beat.id}`) < 0.5;
        emit(
          world.day,
          'beat',
          'significant',
          yes ? beat.ifYes : beat.ifNo,
          [beat.policy],
          beat.place ? { place: beat.place } : {},
        );
      }
      const seen = events.length;
      const stepped = stepDay(world);
      world = stepped.world;
      for (const e of stepped.events) {
        const size = ENGINE_EVENT_SIZE(e);
        if (e.type === 'unrest.stage') {
          const region = world.regions.find((x) => x.id === e.region)?.name ?? e.region;
          const up = STAGE_ORDER.indexOf(e.to) > STAGE_ORDER.indexOf(e.from);
          const text = up
            ? `Unrest in ${region} escalated from ${e.from} to ${e.to}.`
            : `Unrest in ${region} eased from ${e.from} to ${e.to}.`;
          emit(world.day, e.type, size, text, e.causes, { place: e.region });
          if (up && e.to !== 'protest') stoppedEarly = `Unrest in ${region} escalated.`;
        } else if (e.type === 'control.status') {
          const region = world.regions.find((x) => x.id === e.region)?.name ?? e.region;
          const text =
            e.to === 'contested'
              ? `The state's control of ${region} is now contested.`
              : `The state regained control of ${region}.`;
          emit(world.day, e.type, size, text, e.causes, { place: e.region });
          stoppedEarly = `Control of ${region} changed.`;
        } else {
          emit(
            world.day,
            e.type,
            size,
            FLAG_TEXT[e.flag]?.[e.type === 'threshold.raised' ? 0 : 1] ?? e.flag,
            e.causes,
          );
          if (e.type === 'threshold.raised') stoppedEarly = 'A crisis line was crossed.';
        }
      }
      const month = monthOf(dateOf(world.startDate, world.day));
      if (month !== monthStart.month) {
        const before = monthStart.world;
        emit(
          world.day,
          'figures.monthly',
          'minor',
          `Official figures were published for ${monthName(monthStart.month)}.`,
          ['trend'],
          {
            numbers: economyRows(world)
              .slice(0, 5)
              .map((row, k) => ({
                label: row.label,
                before: round1(economyRows(before)[k]?.value ?? 0),
                now: round1(row.value),
                unit: row.unit,
              })),
          },
        );
        monthStart = { month, world };
      }
      for (const { policy, made, was } of watched) {
        const now = stageOf(policy, made, world.day);
        if (
          now === stageOf(policy, made, world.day - 1) ||
          (now !== 'implemented' && now !== 'felt')
        )
          continue;
        const figures = Object.entries(was)
          .filter(([, before]) => typeof before === 'number')
          .slice(0, 2)
          .map(
            ([on, before]) =>
              `${labelOf(world, on).label}: ${before} to ${readTarget(world, on)} ${labelOf(world, on).unit}.`,
          );
        const lead = now === 'implemented' ? 'Began to take effect' : 'A month into its effect';
        emit(
          world.day,
          'policy.milestone',
          'minor',
          `${lead}: ${policy.title}. ${figures.join(' ')}`.trim(),
          [policy.id],
          policy.region ? { place: policy.region } : {},
        );
      }
      // "To the next event that matters": stop the day something notable happens.
      if (r.untilMajor && !stoppedEarly) {
        const notable = events
          .slice(seen)
          .find((e) => !isRoutine(e) && (e.size === 'significant' || e.size === 'major'));
        if (notable) stoppedEarly = notable.summary;
      }
    }
    return {
      ...(Object.keys(stopped).length > 0 ? { stopped } : {}),
      world,
      toDay: world.day,
      events,
      effects,
      baseline,
      ...(stoppedEarly ? { stoppedEarly } : {}),
    };
  }

  const figuresFor = (policy: PolicyRecord, origin: Resolution, world: World): Figure[] => {
    const before = origin.apply?.baseline[policy.id] ?? {};
    return Object.entries(before).map(([on, was]) => ({
      label: labelOf(world, on).label,
      before: was,
      now: readTarget(world, on),
      unit: labelOf(world, on).unit,
    }));
  };

  function stageOf(
    policy: PolicyRecord,
    effects: Effect[] | undefined,
    day: number,
  ): PolicyView['stage'] {
    if (day < policy.enactDay) return 'announced';
    const first = Math.min(...(effects ?? []).map((e) => e.startDay), Number.MAX_SAFE_INTEGER);
    if (day < first) return 'enacted';
    return day < first + 30 ? 'implemented' : 'felt';
  }

  const currentHour = (p: Projection) =>
    [...p.resolutions].reverse().find((r) => r.status === 'committed' && r.hour !== undefined)
      ?.hour ?? 9;

  /** Runs a turn from wherever it stopped. Finished steps are read back, not redone. */
  async function runResolution(id: string): Promise<void> {
    const stopIfCancelled = () => {
      if (cancelRequested !== id) return false;
      cancelRequested = undefined;
      ledger.append({ type: 'resolution.cancelled', id });
      return true;
    };
    for (const step of RESOLUTION_STEPS) {
      const { projection, world, scenario } = state();
      const r = projection.resolutions.find((x) => x.id === id);
      if (r?.status !== 'running' || !world || !scenario) return;
      if (stopIfCancelled()) return;
      if (r[step] !== undefined) continue;
      if (step === 'compile') {
        const data = await compileStep(r, world, scenario, projection);
        saveStep(id, step, data);
        if (data.conflicts.length > 0) {
          ledger.append({
            type: 'resolution.blocked',
            id,
            data: { conflicts: data.conflicts, needsDetail: [] },
          });
          return;
        }
      } else if (step === 'adjudicate')
        saveStep(id, step, await adjudicateStep(r, world, scenario, projection));
      else saveStep(id, step, applyStep(r, world, scenario, projection));
    }
    const { projection } = state();
    const r = projection.resolutions.find((x) => x.id === id);
    if (!r?.apply || stopIfCancelled()) return;
    // The world changes here and only here: the event and its snapshot commit together.
    // Nothing is written before this point, so the turn never waits for prose (REQ-PERF-03).
    const hour = r.hours ? (currentHour(projection) + r.hours) % 24 : currentHour(projection);
    ledger.appendWithSnapshot(
      { type: 'resolution.committed', id, toDay: r.apply.toDay, hour },
      r.apply.toDay,
      r.apply.world,
    );
    arrivingReactions = true;
    enqueue(0, () =>
      aftermath(id).finally(() => {
        arrivingReactions = false;
      }),
    );
  }

  /**
   * After a turn commits: everyone its orders touch answers them (REQ-ACT-19). The engine
   * decides who is touched; a model, or a template, writes what each says or does. Up to
   * three answer an order in full, side by side; the rest are noted by name.
   */
  async function aftermath(id: string): Promise<void> {
    const { projection: p, world, scenario } = state();
    const r = p.resolutions.find((x) => x.id === id);
    if (
      r?.status !== 'committed' ||
      r.reactions ||
      !world ||
      !scenario ||
      scenario.cast.length === 0
    )
      return;
    const orders = (r.compile?.policies ?? []).filter((x) => !refusalOf(x, r));
    if (orders.length === 0) return;

    const context = { resolution: id, brief: scenario.brief };
    const stateNow = Object.fromEntries(world.regions.map((x) => [`unrest.${x.id}`, x.stage]));
    const recent = allEvents(p)
      .slice(-6)
      .map((e) => ({ when: e.date, summary: e.summary }));
    const others: Record<string, string[]> = {};
    const asked = orders.flatMap((policy) => {
      const authority = CATALOGUE.find((c) => c.id === policy.instrument)?.authority ?? 'executive';
      let touched = touchedBy(scenario.cast, {
        instrument: policy.instrument,
        authority,
        region: policy.region,
      });
      // Someone always answers: with nobody directly touched, the opposition does.
      if (touched.length === 0) {
        const fallback = scenario.cast.find((c) => c.kind === 'opposition');
        touched = fallback ? [{ actor: fallback, score: 0 }] : [];
      }
      others[policy.id] = touched.slice(MAX_REACTIONS).map((t) => t.actor.name);
      const region = world.regions.find((x) => x.id === policy.region);
      return touched.slice(0, MAX_REACTIONS).map(({ actor }) => ({
        policy,
        actor,
        answer: harness.run(
          policyReact,
          {
            order: {
              id: policy.id,
              text: policy.orders.join(' '),
              summary: `${policy.title}. ${policy.summary}`.slice(0, 300),
              instrument: policy.instrument,
              ...(region ? { region: { id: region.id, label: region.name } } : {}),
            },
            actor: {
              id: actor.id,
              name: actor.name,
              kind: actor.kind,
              stance: actor.stance,
              voice: actor.voice,
            },
            options: (REACTION_OPTIONS[actor.kind] ?? []).map((o) => ({
              id: o.id,
              label: o.label,
            })),
            state: stateNow,
            recent,
          },
          context,
        ),
      }));
    });
    const before = ledger.latestSnapshot()?.seq;
    const answers = await Promise.all(asked.map((a) => a.answer));

    // If the world was rewritten while the answers were being written (a repeal, say), the
    // answers were to a world that is gone: drop them.
    if (ledger.latestSnapshot()?.seq !== before) return;
    let next = world;
    const data: ReactionData = { reactions: [], events: [], beats: [], others };
    for (const [n, { policy, actor }] of asked.entries()) {
      const out = answers[n]?.output;
      if (!out) continue;
      const eventId = `${id}-x${n + 1}`;
      const where = policy.region ?? actor.cares.regions[0];
      const option = REACTION_OPTIONS[actor.kind]?.find((o) => o.id === out.option);
      if (out.kind === 'action' && option) {
        const picks = Object.fromEntries(
          Object.entries(option.effects).map(([on, value]) => [
            on.replace('{region}', where ?? 'all'),
            value,
          ]),
        );
        next = addEffects(
          next,
          resolveNovel(next, picks, { day: next.day, causes: [eventId], idPrefix: eventId }),
        );
      }
      data.reactions.push({
        id: eventId,
        actor: actor.id,
        actorName: actor.name,
        policy: policy.id,
        kind: out.kind,
        text: out.text,
      });
      data.events.push({
        id: eventId,
        day: r.fromDay,
        date: dateOf(world.startDate, r.fromDay),
        kind: 'reaction',
        size: out.kind === 'action' ? 'significant' : 'minor',
        summary: out.text,
        ...(where ? { place: where } : {}),
        causes: [policy.id],
        numbers: [],
      });
      if (out.later) {
        data.beats.push({
          id: `${eventId}-b`,
          dueDay: world.day + out.later.inDays,
          policy: policy.id,
          ...(where ? { place: where } : {}),
          ifYes: out.later.ifYes,
          ifNo: out.later.ifNo,
        });
      }
    }
    ledger.appendWithSnapshot({ type: 'reactions.written', id, data }, next.day, next);
  }

  const begin = (
    kind: 'execute' | 'advance',
    days: number | null,
    cardIds: string[],
    mixedSignals: boolean,
    extra: { hours?: number; untilMajor?: boolean } = {},
  ) => {
    const { world } = requireCampaign();
    requireQuiet();
    const id = `r${ledger.count() + 1}`;
    ledger.append({
      type: 'resolution.started',
      id,
      kind,
      fromDay: world.day,
      days,
      cardIds,
      mixedSignals,
      ...extra,
    });
    enqueue(0, () => runResolution(id));
  };

  // A turn that was running when the server stopped picks up where it left off, and so do
  // reactions that had not arrived.
  const unfinished = running();
  if (unfinished) enqueue(0, () => runResolution(unfinished.id));
  else {
    const last = state()
      .projection.resolutions.filter((r) => r.status === 'committed')
      .at(-1);
    if (last && !last.reactions && (last.compile?.policies.length ?? 0) > 0)
      enqueue(0, () => aftermath(last.id));
  }

  // ---------------------------------------------------------------------------------- the view

  const STANCE_WORD = {
    hostile: 'hostile',
    wary: 'wary',
    neutral: 'watchful',
    friendly: 'on your side',
  } as const;

  function buildView(): View {
    const { projection: p, world, scenario } = state();
    const active = running();
    const lastExecute = [...p.resolutions].reverse().find((r) => r.kind === 'execute');
    const committed = p.resolutions.filter((r) => r.status === 'committed');
    const events = allEvents(p);
    const lastCommitted = committed.at(-1);
    const lastCalls = lastCommitted ? (ledger.calls(lastCommitted.id) as CallView[]) : [];
    const reactions = new Map(
      committed.flatMap((r) => (r.reactions?.reactions ?? []).map((x) => [x.id, x] as const)),
    );
    const turnOf = new Map(
      committed.flatMap((r) =>
        [...(r.apply?.events ?? []), ...(r.reactions?.events ?? [])].map(
          (e) => [e.id, r.id] as const,
        ),
      ),
    );

    const policies: PolicyView[] = world
      ? committedPolicies(p).map(({ policy, resolution }) => {
          const effects = resolution.apply?.effects[policy.id] ?? [];
          const outcome = resolution.adjudicate?.outcomes.find((o) => o.policy === policy.id);
          const cost = round1(fiscalCost(effects));
          const repealed = p.repealed.has(policy.id);
          const refusal = refusalOf(policy, resolution);
          return {
            id: policy.id,
            title: policy.title,
            summary: policy.summary,
            instrument: policy.instrument,
            instrumentTitle:
              CATALOGUE.find((c) => c.id === policy.instrument)?.title ?? 'Outside the catalogue',
            ...(policy.region ? { region: policy.region } : {}),
            status: refusal ? 'blocked' : repealed ? 'repealed' : 'active',
            ...(refusal ? { blockedReason: refusal } : {}),
            stage: stageOf(policy, effects, world.day),
            announcedDate: dateOf(world.startDate, policy.announcedDay),
            enactDate: dateOf(world.startDate, policy.enactDay),
            orders: policy.orders,
            ...(outcome ? { result: outcome.result.replace('_', ' '), note: outcome.note } : {}),
            costPerYear: cost,
            funding:
              cost > 0
                ? `Adds ${cost}% of GDP a year to borrowing.`
                : cost < 0
                  ? `Saves ${-cost}% of GDP a year.`
                  : 'No direct cost to the budget.',
            effects: effects.map((e) => ({
              label: labelOf(world, e.on).label,
              change: describeChange(world, e),
              from: dateOf(world.startDate, e.startDay),
              until: e.endDay === null ? null : dateOf(world.startDate, e.endDay),
            })),
            targets: figuresFor(policy, resolution, world),
            reactions: (resolution.reactions?.reactions ?? [])
              .filter((x) => x.policy === policy.id)
              .map((x) => ({
                id: x.id,
                actor: x.actor,
                actorName: x.actorName,
                kind: x.kind,
                text: x.text,
                date: dateOf(world.startDate, resolution.fromDay),
              })),
            alsoNoted: resolution.reactions?.others[policy.id] ?? [],
            linkedEvents: events
              .filter((e) => e.causes.includes(policy.id) && e.kind !== 'reaction')
              .map((e) => e.id),
          };
        })
      : [];

    const chronicle: ChronicleEntry[] = events
      .map((e) => {
        const said = reactions.get(e.id);
        const full = p.expanded.get(e.id);
        return {
          id: e.id,
          turn: turnOf.get(e.id) ?? '',
          day: e.day,
          date: e.date,
          size: e.size,
          routine: isRoutine(e),
          headline: said
            ? `${said.actorName} ${said.kind === 'action' ? 'acted' : said.kind === 'silence' ? 'stayed silent' : 'responded'}`
            : e.summary,
          cites: [e.id],
          ...(e.place ? { place: e.place } : {}),
          ...(said ? { speaker: said.actorName, quote: said.text } : {}),
          ...(full
            ? {
                full: full.body,
                via: full.via === 'fallback' ? ('fallback' as const) : ('model' as const),
              }
            : {}),
        };
      })
      .sort((a, b) => b.day - a.day);

    return {
      campaign:
        world && scenario
          ? {
              scenarioId: scenario.id,
              title: scenario.title,
              country: scenario.country,
              office: scenario.office.title,
              holder: scenario.headOfGovernment.name,
              startDate: world.startDate,
              date: dateOf(world.startDate, world.day),
              day: world.day,
              hour: currentHour(p),
              branch: ledger.currentBranch(),
            }
          : null,
      cards: [...p.cards.values()],
      running: active
        ? {
            id: active.id,
            kind: active.kind,
            step: RESOLUTION_STEPS.find((x) => active[x] === undefined) ?? 'commit',
            done: RESOLUTION_STEPS.filter((x) => active[x] !== undefined),
          }
        : null,
      blocked:
        lastExecute?.status === 'blocked' && lastExecute.blocked ? lastExecute.blocked : null,
      world: world
        ? {
            economy: economyRows(world),
            groups: world.groups.map((g) => ({ id: g.id, name: g.name, mood: mood(g.approval) })),
            regions: world.regions.map((x) => ({
              id: x.id,
              name: x.name,
              stage: x.stage,
              status: x.status,
              owner: x.owner,
              controller: x.controller,
            })),
            flags: world.flags,
          }
        : null,
      policies: policies.reverse(),
      chronicle,
      events,
      timeline: world
        ? [
            ...(p.startSeq
              ? [{ seq: p.startSeq, day: 0, date: world.startDate, label: 'Campaign start' }]
              : []),
            ...committed.map((r) => ({
              seq: r.commitSeq ?? 0,
              day: r.apply?.toDay ?? 0,
              date: dateOf(world.startDate, r.apply?.toDay ?? 0),
              label: moveLabel(r),
            })),
          ]
        : [],
      branches: ledger.branches().map((b) => ({
        id: b.id,
        parent: b.parent,
        label: b.label,
        current: b.id === ledger.currentBranch(),
      })),
      turns: world
        ? committed
            .map((r) => ({
              id: r.id,
              from: dateOf(world.startDate, r.fromDay),
              to: dateOf(world.startDate, r.apply?.toDay ?? r.fromDay),
              orders: (r.compile?.policies ?? []).flatMap((x) => x.orders),
              move: moveLabel(r),
              ...(r.apply?.stoppedEarly ? { stoppedEarly: r.apply.stoppedEarly } : {}),
            }))
            .reverse()
        : [],
      cast: (scenario?.cast ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        stance: STANCE_WORD[c.stance],
        askable: c.unreachable === undefined,
        ...(c.unreachable ? { unreachable: c.unreachable } : {}),
      })),
      talks: world
        ? Object.fromEntries(
            [...p.talks].map(([actor, thread]) => [
              actor,
              thread.map((t) => ({
                id: t.id,
                date: dateOf(world.startDate, t.day),
                question: t.question,
                ...(t.reply !== undefined ? { reply: t.reply } : {}),
              })),
            ]),
          )
        : {},
      arriving: { reactions: arrivingReactions, entries: [...writing] },
      lastResolution: lastCommitted
        ? {
            id: lastCommitted.id,
            calls: lastCalls.length,
            fallbacks: lastCalls.filter((c) => c.via === 'fallback').length,
            tokensIn: lastCalls.reduce((sum, c) => sum + c.tokensIn, 0),
            tokensOut: lastCalls.reduce((sum, c) => sum + c.tokensOut, 0),
            ms: lastCalls.reduce((sum, c) => sum + c.ms, 0),
            ...(lastCommitted.apply?.stoppedEarly
              ? { stoppedEarly: lastCommitted.apply.stoppedEarly }
              : {}),
          }
        : null,
    };
  }

  const moveLabel = (r: Resolution): string => {
    const days = (r.apply?.toDay ?? r.fromDay) - r.fromDay;
    const span = r.hours ? 'an hour' : days === 1 ? 'a day' : `${days} days`;
    const count = r.compile?.policies.length ?? 0;
    const ran = r.untilMajor
      ? `ran the clock to the next event that mattered (${span})`
      : `ran the clock ${span}`;
    return count > 0
      ? `Sent ${count} ${count === 1 ? 'order' : 'orders'} and ${ran}`
      : `${ran[0]?.toUpperCase()}${ran.slice(1)}`;
  };

  let viewCache: { version: number; view: View } | undefined;

  return {
    view() {
      if (!viewCache || viewCache.version !== ledger.version())
        viewCache = { version: ledger.version(), view: buildView() };
      return viewCache.view;
    },
    scenarios: () =>
      SCENARIO_IDS.map((id) => {
        const s = loadScenario(id);
        return {
          id: s.id,
          title: s.title,
          office: s.office.title,
          holder: s.headOfGovernment.name,
          brief: s.brief,
        };
      }),
    start(scenarioId) {
      if (state().world)
        throw new DirectorError('bad_request', 'This campaign has already started.');
      if (!(SCENARIO_IDS as readonly string[]).includes(scenarioId))
        throw new DirectorError('not_found', 'No such scenario.');
      const seed = newSeed();
      const world = createWorld(loadScenario(scenarioId as ScenarioId), seed);
      ledger.appendWithSnapshot({ type: 'campaign.started', scenarioId, seed }, 0, world);
    },
    addCard(card) {
      ledger.append({ type: 'card.created', card });
    },
    patchCard(id, patch) {
      const card = state().projection.cards.get(id);
      if (!card) throw new DirectorError('not_found', 'No such policy box.');
      requireQuiet();
      if (patch.text !== undefined && patch.text !== card.text) {
        ledger.append({ type: 'card.edited', cardId: id, text: patch.text });
      }
      if (patch.pinned !== undefined && patch.pinned !== (card.pinned ?? false)) {
        ledger.append({ type: 'card.pinned', cardId: id, pinned: patch.pinned });
      }
      if (patch.beforeId !== undefined && patch.beforeId !== id) {
        ledger.append({ type: 'card.moved', cardId: id, beforeId: patch.beforeId });
      }
    },
    deleteCard(id) {
      if (!state().projection.cards.has(id))
        throw new DirectorError('not_found', 'No such policy box.');
      ledger.append({ type: 'card.deleted', cardId: id });
    },
    execute(mixedSignals, days) {
      const { projection } = requireCampaign();
      const fresh = [...projection.cards.values()].filter((c) => !c.sent).map((c) => c.id);
      if (fresh.length === 0)
        throw new DirectorError('nothing_to_do', 'Add at least one policy box first.');
      begin('execute', days ?? null, fresh, mixedSignals);
    },
    advance(days) {
      begin('advance', days, [], false);
    },
    move(span, mixedSignals) {
      const { projection } = requireCampaign();
      const fresh = [...projection.cards.values()].filter((c) => !c.sent).map((c) => c.id);
      const kind = fresh.length > 0 ? 'execute' : 'advance';
      if ('hours' in span) {
        // The engine moves in whole days: an hour that crosses midnight is a day's step.
        if (currentHour(projection) + span.hours >= 24) begin(kind, 1, fresh, mixedSignals);
        else begin(kind, 0, fresh, mixedSignals, { hours: span.hours });
      } else if ('days' in span) begin(kind, span.days, fresh, mixedSignals);
      else begin(kind, MAX_ADVANCE_DAYS, fresh, mixedSignals, { untilMajor: true });
    },
    expandEntry(eventId) {
      const { projection, world, scenario } = requireCampaign();
      const event = allEvents(projection).find((e) => e.id === eventId);
      if (!event) throw new DirectorError('not_found', 'No such entry.');
      if (projection.expanded.has(eventId) || writing.has(eventId)) return;
      writing.add(eventId);
      enqueue(0, async () => {
        try {
          const all = allEvents(state().projection);
          const speakers = new Map(
            state().projection.resolutions.flatMap((r) =>
              (r.reactions?.reactions ?? []).map((x) => [x.id, x.actorName] as const),
            ),
          );
          // What else is on record about the same matter: shared causes, either way round.
          const related = all
            .filter(
              (e) =>
                e.id !== eventId &&
                (e.causes.some((c) => event.causes.includes(c) && c !== 'trend') ||
                  e.causes.includes(eventId) ||
                  event.causes.includes(e.id)),
            )
            .slice(-8)
            .map((e) => ({
              when: e.date,
              summary: e.summary,
              ...(speakers.has(e.id) ? { speaker: speakers.get(e.id) ?? '' } : {}),
            }));
          const place = world.regions.find((x) => x.id === event.place);
          const { output, via } = await harness.run(
            chronicleWrite,
            {
              event: {
                id: event.id,
                when: event.date,
                kind: event.kind,
                size: event.size,
                summary: event.summary,
                ...(place ? { place: { id: place.id, label: place.name } } : {}),
                numbers: event.numbers
                  .filter(
                    (x): x is Figure & { before: number; now: number } =>
                      typeof x.before === 'number' && typeof x.now === 'number',
                  )
                  .map((x) => ({ label: x.label, before: x.before, after: x.now, unit: x.unit })),
              },
              related,
              weight:
                event.size === 'major'
                  ? 'major'
                  : event.size === 'significant'
                    ? 'significant'
                    : 'minor',
              level: 'standard',
            },
            { resolution: 'entries', brief: scenario.brief },
          );
          // Saved once: opening the entry again shows the same text (REQ-READ-18).
          ledger.append({ type: 'entry.expanded', eventId, body: output.body, via });
        } finally {
          writing.delete(eventId);
        }
      });
    },
    ask(actorId, question) {
      const { scenario, world } = requireCampaign();
      const actor = scenario.cast.find((c) => c.id === actorId);
      if (!actor) throw new DirectorError('not_found', 'No such person.');
      if (actor.unreachable) throw new DirectorError('bad_request', actor.unreachable);
      const id = `t${ledger.count() + 1}`;
      ledger.append({ type: 'talk.asked', id, actorId, question, day: world.day });
      enqueue(0, async () => {
        const now = state();
        if (!now.world) return;
        const thread = now.projection.talks.get(actorId) ?? [];
        const events = allEvents(now.projection);
        const mine = new Set(
          committedPolicies(now.projection)
            .filter(
              ({ policy }) =>
                actor.cares.instruments.includes(policy.instrument) ||
                (policy.region !== undefined && actor.cares.regions.includes(policy.region)),
            )
            .map(({ policy }) => policy.id),
        );
        // An actor answers from what it could know: what touches its concerns, and what
        // everyone has heard. An adviser sees the whole file.
        const knows = events
          .filter(
            (e) =>
              actor.kind === 'advisor' ||
              e.size === 'major' ||
              e.size === 'significant' ||
              e.causes.some((c) => mine.has(c)) ||
              (e.place !== undefined && actor.cares.regions.includes(e.place)),
          )
          .slice(-12)
          .map((e) => ({ when: e.date, summary: e.summary }));
        const insider = actor.kind === 'advisor';
        const { output, via } = await harness.run(
          actorReply,
          {
            actor: {
              id: actor.id,
              name: actor.name,
              kind: actor.kind,
              stance: actor.stance,
              voice: actor.voice,
            },
            asker: `The ${scenario.office.title}`,
            question,
            knows,
            state: {
              ...Object.fromEntries(
                economyRows(now.world).map((row) => [row.label, round1(row.value)]),
              ),
              ...Object.fromEntries(now.world.regions.map((x) => [`unrest in ${x.name}`, x.stage])),
              ...(insider
                ? Object.fromEntries(
                    now.world.groups.map((g) => [`mood of ${g.name}`, mood(g.approval)]),
                  )
                : {}),
            },
            policies: committedPolicies(now.projection)
              .filter(
                ({ policy, resolution }) =>
                  !refusalOf(policy, resolution) && !now.projection.repealed.has(policy.id),
              )
              .map(({ policy }) => policy.title),
            earlier: thread
              .filter((t) => t.id !== id && t.reply !== undefined)
              .slice(-4)
              .map((t) => ({ question: t.question, reply: t.reply ?? '' })),
          },
          { resolution: 'talks', brief: scenario.brief },
        );
        ledger.append({ type: 'talk.replied', id, reply: output.reply, via });
      });
    },
    cancel() {
      const r = running();
      if (!r) throw new DirectorError('nothing_to_do', 'Nothing is running.');
      cancelRequested = r.id;
    },
    repeal(policyId) {
      const { projection, world } = requireCampaign();
      requireSettled();
      const found = committedPolicies(projection).find(({ policy }) => policy.id === policyId);
      if (!found || refusalOf(found.policy, found.resolution) || projection.repealed.has(policyId))
        throw new DirectorError('not_found', 'No such policy in force.');
      ledger.appendWithSnapshot(
        { type: 'policy.repealed', policyId, day: world.day },
        world.day,
        removeEffects(world, policyId),
      );
    },
    rewind(seq) {
      const { world } = requireCampaign();
      requireSettled();
      const snapshot = ledger.snapshotAt(seq);
      if (!snapshot || !ledger.events().some((e) => e.seq === seq))
        throw new DirectorError('not_found', 'That point is not on this timeline.');
      ledger.fork(seq, `From ${dateOf(world.startDate, snapshot.day)}`);
    },
    rewindToDate(date) {
      const { world, scenario, projection } = requireCampaign();
      requireSettled();
      const day = dayOf(world.startDate, date);
      if (day < 0 || day >= world.day)
        throw new DirectorError('bad_request', 'Choose a date in the past of this campaign.');
      const committed = projection.resolutions.filter((r) => r.status === 'committed');
      const boundary =
        day === 0
          ? projection.startSeq
          : [...committed].reverse().find((r) => r.apply?.toDay === day)?.commitSeq;
      if (boundary) {
        ledger.fork(boundary, `From ${date}`);
        return;
      }
      // The date falls inside a resolution. Fork just before it and run it again up to that
      // day from its saved inputs: same picks, same dice, so the same world, with no model.
      const inside = committed.find((r) => r.fromDay < day && day < (r.apply?.toDay ?? 0));
      if (!inside?.startSeq)
        throw new DirectorError('not_found', 'That date is not on this timeline.');
      ledger.fork(inside.startSeq - 1, `From ${date}`);
      const before = state().world;
      if (!before) throw new DirectorError('not_found', 'That date is not on this timeline.');
      const again: Resolution = { ...inside, days: day - inside.fromDay, status: 'running' };
      ledger.append({
        type: 'resolution.started',
        id: again.id,
        kind: again.kind,
        fromDay: again.fromDay,
        days: again.days,
        cardIds: again.cardIds,
        mixedSignals: again.mixedSignals,
      });
      saveStep(
        again.id,
        'compile',
        again.compile ?? { policies: [], conflicts: [], needsDetail: [], consumed: [] },
      );
      saveStep(again.id, 'adjudicate', again.adjudicate ?? { outcomes: [], events: [] });
      const apply = applyStep(again, before, scenario, state().projection);
      saveStep(again.id, 'apply', apply);
      ledger.appendWithSnapshot(
        {
          type: 'resolution.committed',
          id: again.id,
          toDay: apply.toDay,
          hour: currentHour(projection),
        },
        apply.toDay,
        apply.world,
      );
    },
    calls: (resolution) => ledger.calls(resolution) as CallView[],
    mapData() {
      const id = state().projection.scenarioId;
      return id ? { regions: loadOutlines(id as ScenarioId), world: loadWorldOutlines() } : null;
    },
    debugWorld: () => state().world,
    async idle() {
      while (working || queue.length > 0) await (working ?? Promise.resolve());
    },
  };
}
