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
  createWorld,
  type Effect,
  type EngineEvent,
  fiscalCost,
  type Instrument,
  NOVEL_LIMITS,
  narrow,
  PROCEDURE_DAYS,
  removeEffects,
  resolveInstrument,
  resolveNovel,
  type Scenario,
  stepDay,
  type World,
} from '@statecraft/engine';
import type { Ledger } from '@statecraft/ledger';
import {
  type AdjudicateIn,
  type Allowed,
  type CompiledPolicy,
  chronicleWrite,
  type Harness,
  INSTRUMENT_REFS,
  memoryDigest,
  policyCompile,
  policyRead,
  policyReport,
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
  type PolicyCard,
  type PolicyView,
  RESOLUTION_STEPS,
  type ResolutionStep,
  type ScenarioInfo,
  type StoredEvent,
  type View,
  type WorldEventView,
} from '@statecraft/protocol';
import { loadScenario, SCENARIO_IDS, type ScenarioId } from '@statecraft/scenarios';
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
}
interface CompileData {
  policies: PolicyRecord[];
  conflicts: { cards: string[]; explanation: string }[];
  needsDetail: { card: string; question: string }[];
  consumed: string[];
}
interface AdjudicateData {
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
  world: World;
  toDay: number;
  events: WorldEventView[];
  effects: Record<string, Effect[]>;
  baseline: Record<string, Record<string, number | string>>;
  stoppedEarly?: string;
}
interface NarrateData {
  entries: ChronicleEntry[];
}
interface ReportData {
  reports: Record<string, NonNullable<PolicyView['report']>>;
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
  narrate?: NarrateData;
  report?: ReportData;
  blocked?: Pick<CompileData, 'conflicts' | 'needsDetail'>;
  commitSeq?: number;
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
}

function project(events: readonly StoredEvent[]): Projection {
  const p: Projection = { cards: new Map(), resolutions: [], repealed: new Set(), digests: [] };
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
          for (const id of r.compile?.consumed ?? []) p.cards.delete(id);
        }
        break;
      }
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
const STAGE_ORDER = ['calm', 'protest', 'riot', 'insurgency'];

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
  execute(mixedSignals: boolean): void;
  advance(days: number): void;
  cancel(): void;
  repeal(policyId: string): void;
  rewind(seq: number): void;
  calls(resolution?: string): CallView[];
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
  const requireQuiet = () => {
    if (running()) throw new DirectorError('busy', 'A resolution is still running.');
  };
  const regionRefs = (world: World) => world.regions.map((r) => ({ id: r.id, label: r.name }));
  const actorId = (world: World) => `gov-${world.country.toLowerCase()}`;

  const committedPolicies = (p: Projection): { policy: PolicyRecord; resolution: Resolution }[] =>
    p.resolutions
      .filter((r) => r.status === 'committed')
      .flatMap((r) => (r.compile?.policies ?? []).map((policy) => ({ policy, resolution: r })));
  const allEvents = (p: Projection): WorldEventView[] =>
    p.resolutions.filter((r) => r.status === 'committed').flatMap((r) => r.apply?.events ?? []);
  const allEntries = (p: Projection): ChronicleEntry[] =>
    p.resolutions.filter((r) => r.status === 'committed').flatMap((r) => r.narrate?.entries ?? []);

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
      .filter(({ policy }) => !policy.blockedReason && !p.repealed.has(policy.id))
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
    const held = new Set([
      ...conflicts.flatMap((c) => c.cards),
      ...output.needsDetail.map((n) => n.card),
    ]);
    return {
      policies,
      conflicts,
      needsDetail: output.needsDetail,
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
      regions: regionRefs(world),
      actions,
      eventLimits: [
        { on: 'inflation', range: [-0.5, 0.5], unit: 'points' },
        { on: 'growth', range: [-0.2, 0.2], unit: 'points' },
        { on: 'grievance.all', range: [-3, 3], unit: 'points' },
        ...world.regions.map(
          (x): Allowed => ({ on: `grievance.${x.id}`, range: [-3, 3], unit: 'points' }),
        ),
        ...tags.map((t): Allowed => ({ on: `approval.${t}`, range: [-3, 3], unit: 'points' })),
      ],
      recent: allEvents(p)
        .slice(-8)
        .map((e) => ({ id: e.id, when: e.date, summary: e.summary })),
      surpriseBudget: { major: days >= 30 ? 1 : 0, significant: 1 + Math.floor(days / 45) },
    };
    const context = { resolution: r.id, brief: scenario.brief };
    const { output } = await harness.run(turnAdjudicate, input, context);

    const toPicks = (effects: { on: string; value: number }[]) =>
      Object.fromEntries(effects.filter((e) => e.value !== 0).map((e) => [e.on, e.value]));
    const data: AdjudicateData = {
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

    // A second opinion on anything major or outside the catalogue (REQ-JOB-12).
    const novel = data.outcomes.filter(
      (o) =>
        Object.keys(o.picks).length > 0 &&
        active.find((x) => x.id === o.policy)?.instrument === 'novel',
    );
    const major = data.events.filter((e) => e.size === 'major');
    if (novel.length + major.length > 0) {
      const items = [
        ...novel.map((o) => ({
          summary: `${active.find((x) => x.id === o.policy)?.summary ?? ''} Proposed effects: ${JSON.stringify(o.picks)}`,
          causes: [],
          actorPowers: scenario.office.powers,
        })),
        ...major.map((e) => ({
          summary: e.summary,
          causes: e.causes.map((id) => ({
            id,
            summary: input.recent.find((x) => x.id === id)?.summary ?? id,
          })),
          actorPowers: [],
        })),
      ].map((item, index) => ({ index, ...item }));
      const review = await harness.run(turnReview, { items }, context);
      const failed = new Set(
        review.output.verdicts
          .filter((v) => !(v.plausible && v.caused && v.withinPower))
          .map((v) => v.index),
      );
      novel.forEach((o, i) => {
        if (failed.has(i)) {
          o.picks = {};
          o.note = `${o.note} No measurable effect.`.trim();
        }
      });
      data.events = data.events.filter(
        (e) => !(e.size === 'major' && failed.has(novel.length + major.indexOf(e))),
      );
    }
    return data;
  }

  function applyStep(r: Resolution, start: World, scenario: Scenario): ApplyData {
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
    for (const policy of compile.policies) {
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
      .map((e) => ({ ...e, day: r.fromDay + Math.min(e.inDays, days) }))
      .sort((a, b) => a.day - b.day);
    let monthStart = { month: monthOf(dateOf(world.startDate, world.day)), world };
    let stoppedEarly: string | undefined;

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
    }
    return {
      world,
      toDay: world.day,
      events,
      effects,
      baseline,
      ...(stoppedEarly ? { stoppedEarly } : {}),
    };
  }

  async function narrateStep(
    r: Resolution,
    scenario: Scenario,
    p: Projection,
  ): Promise<NarrateData> {
    const apply = r.apply;
    if (!apply || apply.events.length === 0) return { entries: [] };
    const world = apply.world;
    const days = apply.toDay - r.fromDay;
    const { output, via } = await harness.run(
      chronicleWrite,
      {
        period: {
          from: dateOf(world.startDate, r.fromDay),
          to: dateOf(world.startDate, apply.toDay),
        },
        events: apply.events.map((e) => {
          const place = world.regions.find((x) => x.id === e.place);
          return {
            id: e.id,
            when: e.date,
            kind: e.kind,
            size: e.size,
            summary: e.summary,
            ...(place ? { place: { id: place.id, label: place.name } } : {}),
            numbers: e.numbers
              .filter(
                (x): x is Figure & { before: number; now: number } =>
                  typeof x.before === 'number' && typeof x.now === 'number',
              )
              .map((x) => ({ label: x.label, before: x.before, after: x.now, unit: x.unit })),
            causes: e.causes,
          };
        }),
        previous: allEntries(p)
          .slice(-3)
          .map((e) => ({ headline: e.headline })),
        audience: 'player',
        level: 'standard',
        maxEntries: Math.max(3, Math.min(12, 3 + Math.floor(days / 10))),
      },
      { resolution: r.id, brief: scenario.brief },
    );
    return {
      entries: output.entries.map((e, i) => ({
        id: `${r.id}-c${i + 1}`,
        day: dayOf(world.startDate, e.when),
        date: e.when.slice(0, 10),
        headline: e.headline,
        body: e.body,
        cites: e.cites,
        ...(e.place ? { place: e.place } : {}),
        via: via === 'fallback' ? 'fallback' : 'model',
      })),
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

  async function reportStep(r: Resolution, scenario: Scenario, p: Projection): Promise<ReportData> {
    const world = r.apply?.world;
    if (!world) return { reports: {} };
    const mine = (r.compile?.policies ?? []).map((policy) => ({ policy, resolution: r }));
    const moving = [...committedPolicies(p), ...mine]
      .filter(({ policy }) => !policy.blockedReason && !p.repealed.has(policy.id))
      .slice(-6);
    if (moving.length === 0) return { reports: {} };
    const events = [...allEvents(p), ...(r.apply?.events ?? [])];
    const { output } = await harness.run(
      policyReport,
      {
        policies: moving.map(({ policy, resolution }) => ({
          id: policy.id,
          title: policy.title,
          stage: stageOf(
            policy,
            resolution === r ? r.apply?.effects[policy.id] : resolution.apply?.effects[policy.id],
            world.day,
          ),
          owner: { id: actorId(world), label: 'The ministry responsible' },
          targets: figuresFor(policy, resolution, world).filter(
            (f): f is Figure & { before: number; now: number } =>
              typeof f.before === 'number' && typeof f.now === 'number',
          ),
          linked: events
            .filter((e) => e.causes.includes(policy.id))
            .slice(-5)
            .map((e) => ({ id: e.id, when: e.date, summary: e.summary })),
          slant: 'candid' as const,
        })),
      },
      { resolution: r.id, brief: scenario.brief },
    );
    return {
      reports: Object.fromEntries(
        output.reports.map((x) => [
          x.policy,
          {
            status: x.status,
            effect: x.effect,
            attribution: x.attribution,
            sideEffects: x.sideEffects,
          },
        ]),
      ),
    };
  }

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

  async function digestMonths(r: Resolution, scenario: Scenario) {
    const { projection, world } = state();
    if (!world) return;
    const done = new Set(projection.digests.map((d) => d.month));
    const current = monthOf(dateOf(world.startDate, world.day));
    const entries = allEntries(projection);
    const months = [...new Set(entries.map((e) => monthOf(e.date)))].filter(
      (m) => m < current && !done.has(m),
    );
    for (const month of months) {
      const inMonth = entries.filter((e) => monthOf(e.date) === month);
      const { output } = await harness.run(
        memoryDigest,
        {
          span: { from: `${month}-01`, to: `${month}-31`, level: 'month' },
          entries: inMonth.map((e) => ({
            id: e.id,
            when: e.date,
            headline: e.headline,
            body: e.body,
          })),
          pinned: [],
        },
        { resolution: r.id, brief: scenario.brief },
      );
      ledger.append({ type: 'digest.written', month, text: output.digest });
    }
  }

  /** Runs a resolution from wherever it stopped. Finished steps are read back, not redone. */
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
        if (
          data.conflicts.length > 0 ||
          (data.policies.length === 0 && data.needsDetail.length > 0 && r.kind === 'execute')
        ) {
          ledger.append({
            type: 'resolution.blocked',
            id,
            data: { conflicts: data.conflicts, needsDetail: data.needsDetail },
          });
          return;
        }
      } else if (step === 'adjudicate')
        saveStep(id, step, await adjudicateStep(r, world, scenario, projection));
      else if (step === 'apply') saveStep(id, step, applyStep(r, world, scenario));
      else if (step === 'narrate') saveStep(id, step, await narrateStep(r, scenario, projection));
      else saveStep(id, step, await reportStep(r, scenario, projection));
    }
    const { projection, scenario } = state();
    const r = projection.resolutions.find((x) => x.id === id);
    if (!r?.apply || !scenario || stopIfCancelled()) return;
    // The world changes here and only here: the event and its snapshot commit together.
    ledger.appendWithSnapshot(
      { type: 'resolution.committed', id, toDay: r.apply.toDay },
      r.apply.toDay,
      r.apply.world,
    );
    await digestMonths(r, scenario);
  }

  const begin = (
    kind: 'execute' | 'advance',
    days: number | null,
    cardIds: string[],
    mixedSignals: boolean,
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
    });
    enqueue(0, () => runResolution(id));
  };

  // A resolution that was running when the server stopped picks up where it left off.
  const unfinished = running();
  if (unfinished) enqueue(0, () => runResolution(unfinished.id));

  // ---------------------------------------------------------------------------------- the view

  function buildView(): View {
    const { projection: p, world, scenario } = state();
    const active = running();
    const lastExecute = [...p.resolutions].reverse().find((r) => r.kind === 'execute');
    const committed = p.resolutions.filter((r) => r.status === 'committed');
    const events = allEvents(p);
    const lastCommitted = committed.at(-1);
    const lastCalls = lastCommitted ? (ledger.calls(lastCommitted.id) as CallView[]) : [];

    const policies: PolicyView[] = world
      ? committedPolicies(p).map(({ policy, resolution }) => {
          const effects = resolution.apply?.effects[policy.id] ?? [];
          const outcome = resolution.adjudicate?.outcomes.find((o) => o.policy === policy.id);
          const cost = round1(fiscalCost(effects));
          const report = [...committed].reverse().find((r) => r.report?.reports[policy.id])?.report
            ?.reports[policy.id];
          const repealed = p.repealed.has(policy.id);
          return {
            id: policy.id,
            title: policy.title,
            summary: policy.summary,
            instrument: policy.instrument,
            instrumentTitle:
              CATALOGUE.find((c) => c.id === policy.instrument)?.title ?? 'Outside the catalogue',
            ...(policy.region ? { region: policy.region } : {}),
            status: policy.blockedReason ? 'blocked' : repealed ? 'repealed' : 'active',
            ...(policy.blockedReason ? { blockedReason: policy.blockedReason } : {}),
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
            ...(report ? { report } : {}),
            linkedEvents: events.filter((e) => e.causes.includes(policy.id)).map((e) => e.id),
          };
        })
      : [];

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
              branch: ledger.currentBranch(),
            }
          : null,
      cards: [...p.cards.values()],
      running: active
        ? {
            id: active.id,
            kind: active.kind,
            step: RESOLUTION_STEPS.find((s) => active[s] === undefined) ?? 'commit',
            done: RESOLUTION_STEPS.filter((s) => active[s] !== undefined),
          }
        : null,
      blocked:
        lastExecute?.status === 'blocked' && lastExecute.blocked ? lastExecute.blocked : null,
      world: world
        ? {
            economy: economyRows(world),
            groups: world.groups.map((g) => ({ id: g.id, name: g.name, mood: mood(g.approval) })),
            regions: world.regions.map((r) => ({
              id: r.id,
              name: r.name,
              stage: r.stage,
              status: r.status,
              owner: r.owner,
              controller: r.controller,
            })),
            flags: world.flags,
          }
        : null,
      policies: policies.reverse(),
      chronicle: allEntries(p).reverse(),
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
              label:
                r.kind === 'execute'
                  ? `Executed ${r.compile?.policies.length ?? 0} ${(r.compile?.policies.length ?? 0) === 1 ? 'policy' : 'policies'}`
                  : `Advanced ${(r.apply?.toDay ?? 0) - r.fromDay} days`,
            })),
          ]
        : [],
      branches: ledger.branches().map((b) => ({
        id: b.id,
        parent: b.parent,
        label: b.label,
        current: b.id === ledger.currentBranch(),
      })),
      digests: p.digests,
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
      // The reading arrives later; adding a box never waits on a model (REQ-PERF-01).
      enqueue(1, async () => {
        const { projection, world, scenario } = state();
        if (!world || !scenario || !projection.cards.has(card.id)) return;
        const { output } = await harness.run(
          policyRead,
          {
            card: { id: card.id, text: card.text },
            office: scenario.office,
            standing: [],
            instruments: INSTRUMENT_REFS.map((i) => ({ id: i.id, label: i.label })),
            regions: regionRefs(world),
          },
          { resolution: 'readings', brief: scenario.brief },
        );
        if (!state().projection.cards.has(card.id)) return;
        ledger.append({
          type: 'card.read',
          cardId: card.id,
          reading: {
            reading: output.reading,
            instrument: output.instrument,
            ...(output.question ? { question: output.question } : {}),
          },
        });
      });
    },
    deleteCard(id) {
      if (!state().projection.cards.has(id))
        throw new DirectorError('not_found', 'No such policy box.');
      ledger.append({ type: 'card.deleted', cardId: id });
    },
    execute(mixedSignals) {
      const { projection } = requireCampaign();
      if (projection.cards.size === 0)
        throw new DirectorError('nothing_to_do', 'Add at least one policy box first.');
      begin('execute', null, [...projection.cards.keys()], mixedSignals);
    },
    advance(days) {
      begin('advance', days, [], false);
    },
    cancel() {
      const r = running();
      if (!r) throw new DirectorError('nothing_to_do', 'Nothing is running.');
      cancelRequested = r.id;
    },
    repeal(policyId) {
      const { projection, world } = requireCampaign();
      requireQuiet();
      const found = committedPolicies(projection).find(({ policy }) => policy.id === policyId);
      if (!found || found.policy.blockedReason || projection.repealed.has(policyId))
        throw new DirectorError('not_found', 'No such policy in force.');
      ledger.appendWithSnapshot(
        { type: 'policy.repealed', policyId, day: world.day },
        world.day,
        removeEffects(world, policyId),
      );
    },
    rewind(seq) {
      const { world } = requireCampaign();
      requireQuiet();
      const snapshot = ledger.snapshotAt(seq);
      if (!snapshot || !ledger.events().some((e) => e.seq === seq))
        throw new DirectorError('not_found', 'That point is not on this timeline.');
      ledger.fork(seq, `From ${dateOf(world.startDate, snapshot.day)}`);
    },
    calls: (resolution) => ledger.calls(resolution) as CallView[],
    debugWorld: () => state().world,
    async idle() {
      while (working || queue.length > 0) await (working ?? Promise.resolve());
    },
  };
}
