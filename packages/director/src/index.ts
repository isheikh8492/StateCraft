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
  clampStanding,
  courtStays,
  createWorld,
  type Effect,
  type EngineEvent,
  fiscalCost,
  type Instrument,
  type Landing,
  landed as landedRange,
  landing,
  legislatureVote,
  NOVEL_LIMITS,
  narrow,
  nationalApproval,
  orderEffect,
  PROCEDURE_DAYS,
  removeEffects,
  resolveInstrument,
  resolveNovel,
  restless,
  roll,
  type Scenario,
  STANDING,
  stanceOf,
  stepDay,
  touchedBy,
  type World,
} from '@statecraft/engine';
import type { Ledger } from '@statecraft/ledger';
import {
  type AdjudicateIn,
  type Allowed,
  type Answer,
  actorReply,
  type CompiledPolicy,
  chronicleWrite,
  type Harness,
  INSTRUMENT_REFS,
  matchInstrument,
  policyCompile,
  policyReact,
  REACTION_OPTIONS,
  type Size,
  turnAdjudicate,
  turnReactions,
} from '@statecraft/models';
import {
  type CallView,
  type CardView,
  type ChronicleEntry,
  type Detail,
  type Figure,
  MAX_ADVANCE_DAYS,
  type Moment,
  type MoveSpan,
  type PolicyCard,
  type PolicyView,
  RESOLUTION_STEPS,
  type ResolutionStep,
  type ScenarioInfo,
  type StoredEvent,
  type View,
  type WorldEventView,
  type WorldView,
} from '@statecraft/protocol';
import {
  loadOutlines,
  loadScenario,
  loadWorldOutlines,
  SCENARIO_IDS,
  type ScenarioId,
} from '@statecraft/scenarios';
import { ambientEvent } from './ambient.ts';
import { aftershock, forecast, type Happening } from './happenings.ts';
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
  /**
   * The period's events were drawn by the engine before it was judged (decision record
   * 0012), so nothing more is drawn while the days are run. Missing on turns saved before
   * that, which keep the older day-by-day draw when they are run again.
   */
  drawn?: boolean;
  outcomes: { policy: string; result: string; note: string; picks: Record<string, number> }[];
  events: {
    kind: string;
    size: Size;
    summary: string;
    place?: string;
    inDays: number;
    /** The hour of its day it happens at. */
    hour?: number;
    /** The deck entry it was drawn from, so the same thing does not come up again too soon. */
    deck?: string;
    picks: Record<string, number>;
    causes: string[];
  }[];
}
interface ApplyData {
  /** Messages members of the cast send the player unasked, delivered when the turn commits. */
  messages?: { actor: string; text: string; day: number }[];
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
  /** The order being answered. Empty when the actor moved first. */
  policy: string;
  /** True when nobody asked: the actor acted on its own initiative. */
  unprompted?: boolean;
  kind: 'statement' | 'action' | 'silence';
  text: string;
  /** When word of it reaches the player. After a move of hours, answers come in one by one. */
  dueDay?: number;
  dueHour?: number;
}
interface TalkRecord {
  id: string;
  day: number;
  question: string;
  reply?: string;
  incoming?: boolean;
  lever?: { kind: 'offer' | 'threat' | 'none'; claim: string };
  orders?: string[];
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
  /** A move to the next thing that needed the player. */
  next?: boolean;
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
  talks: Map<string, TalkRecord[]>;
  /** How many incoming messages from each actor the player has seen. */
  seen: Map<string, number>;
  /** News first recorded in its plain line and worded properly afterwards, by event id. */
  worded: Map<string, string>;
  /** Details of texture established so far, oldest first: once named, a thing keeps its name. */
  canon: { label: string; value: string }[];
}

function project(events: readonly StoredEvent[]): Projection {
  const p: Projection = {
    cards: new Map(),
    resolutions: [],
    repealed: new Set(),
    digests: [],
    expanded: new Map(),
    talks: new Map(),
    seen: new Map(),
    worded: new Map(),
    canon: [],
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
          ...(event.next ? { next: true } : {}),
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
      case 'news.worded':
        for (const [eventId, line] of Object.entries(event.lines)) p.worded.set(eventId, line);
        break;
      case 'canon.added':
        // The first name a thing is given is the one it keeps.
        for (const item of event.items)
          if (!p.canon.some((d) => d.label.toLowerCase() === item.label.toLowerCase()))
            p.canon.push(item);
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
          if (turn) {
            turn.reply = event.reply;
            if (event.lever) turn.lever = event.lever;
            if (event.orders) turn.orders = event.orders;
          }
        }
        break;
      case 'talk.incoming': {
        const thread = p.talks.get(event.actorId) ?? [];
        thread.push({
          id: event.id,
          day: event.day,
          question: '',
          reply: event.text,
          incoming: true,
        });
        p.talks.set(event.actorId, thread);
        break;
      }
      case 'talk.read':
        p.seen.set(
          event.actorId,
          (p.talks.get(event.actorId) ?? []).filter((t) => t.incoming).length,
        );
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
/**
 * A follow-up is reported weeks later as news on its own, so "It steps up attacks" has lost
 * whoever "it" was. The sentence is given its subject back.
 */
const named = (sentence: string, name: string) =>
  sentence.replace(/^(It|They|The group|The party)\b/, name);

/** Kinds of event that are the morning's news: reported at seven, whatever else the day holds. */
const MORNING_NEWS =
  /^(figures|policy\.|unrest\.|control\.|threshold|legislature\.|court|commitment\.|beat)/;
/** The hour a quiet night ends at: the latest a move to "the next thing" will run to. */
const MORNING = 9;
/** How many of a period's happenings a model is asked to word. */
const MAX_WORDED = 8;
/** How many actors answer one order in full; the rest are noted by name. */
const MAX_REACTIONS = 3;
/** And how many answer in a whole turn, however much was ordered. */
const REACTIONS_PER_TURN = 5;
/** How many of the cast may act unprompted after one turn. */
const MOVES_PER_TURN = 2;
/** The chance, each day that passes, that somebody in the cast moves first. */
const MOVE_DAILY_CHANCE = 0.25;
/** Days before the same actor may move unprompted again. */
const MOVE_REST_DAYS = 14;
/** Words a reaction may run to, and how far a full account is stretched, at each detail level. */
const REACTION_WORDS = { brief: 60, standard: 150, rich: 250 } as const;
/** Words an answer in conversation may run to. An adviser asked for a plan needs the room. */
const REPLY_WORDS = { brief: 250, standard: 500, rich: 900 } as const;
const ACCOUNT_SCALE = { brief: 0.6, standard: 1, rich: 1.6 } as const;
const ACCOUNT_WORDS = { minor: 120, significant: 300, major: 500 } as const;
/** How many events of one turn get their full account written without being asked for. */
const ACCOUNTS_PER_TURN = 2;
const STAGE_ORDER = ['calm', 'protest', 'riot', 'insurgency'];
const ROUTINE_KINDS = new Set([
  'policy.announced',
  'policy.enacted',
  'policy.milestone',
  'figures.monthly',
]);
/** What the reader of orders calls one that matches nothing in the catalogue. */
const NOVEL_LABEL = 'Order outside the catalogue';
/** An order's own words, cut at a word to fit a title. */
const ownWords = (words: string, otherwise: string) => {
  const flat = words
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;:,]+$/, '');
  if (flat === '') return otherwise;
  if (flat.length <= 90) return flat;
  const cut = flat.slice(0, 90);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 60))}…`;
};
/** Notices that need no telling: they are reported in built-in wording, without a model. */
const isRoutine = (e: WorldEventView) =>
  ROUTINE_KINDS.has(e.kind) || (e.kind === 'legislature.vote' && e.size === 'minor');
/**
 * Whether an event is worth stopping the clock for: anything that is news. Routine notices
 * and colour (the weather, a cricket match) are read in passing when their hour comes.
 */
const needsYou = (e: WorldEventView) => !isRoutine(e) && e.size !== 'colour';

export interface DirectorOptions {
  ledger: Ledger;
  /** How much the game writes. Read at the moment of writing, so a change applies at once. */
  detail?: () => Detail;
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
  /** The world as it stood when a past turn ended, for looking back without rewinding. */
  moment(turnId: string): Moment;
  /** Mark an actor's messages as seen. */
  markRead(actorId: string): void;
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
  /**
   * Called whenever anything the screen shows may have changed. The server uses it to push
   * the new state out, so the page does not have to keep asking (REQ-PERF-02).
   */
  subscribe(listener: () => void): () => void;
  /**
   * Prose as it is being written, so it can be shown word by word (REQ-PERF-16). The
   * listener gets the id of the thing being written (a conversation turn, an event, a
   * reaction) and its text so far, or null when the writing has ended. Drafts are never
   * saved: the record holds only the finished, checked text.
   */
  watchDrafts(listener: (id: string, text: string | null) => void): () => void;
  /** Everything being written right now, for a screen that has just connected. */
  drafts(): Record<string, string>;
}

export function createDirector(options: DirectorOptions): Director {
  const { ledger, harness } = options;
  const detail = () => options.detail?.() ?? 'standard';
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

  /** Everyone waiting to be told that the state changed. */
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        console.error('[director] a watcher threw', error);
      }
    }
  };
  ledger.watch(notify);

  /** Text still being written, by the id of what it will become. Held in memory only. */
  const drafting = new Map<string, string>();
  const draftListeners = new Set<(id: string, text: string | null) => void>();
  const setDraft = (id: string, text: string | null) => {
    if (text === null ? !drafting.delete(id) : drafting.get(id) === text) return;
    if (text !== null) drafting.set(id, text);
    for (const listener of draftListeners) {
      try {
        listener(id, text);
      } catch (error) {
        console.error('[director] a draft watcher threw', error);
      }
    }
  };
  /** Whose answers to the last turn are being written right now. */
  let writingReactions: { id: string; actorName: string; policy: string }[] = [];

  // One background task at a time; a resolution goes ahead of box readings (REQ-PERF-02).
  const queue: { priority: number; run: () => Promise<void> }[] = [];
  let working: Promise<void> | undefined;
  let cancelRequested: string | undefined;
  /** True while the cast's answers to the last turn are still being written. */
  let arriving = false;
  const setArriving = (value: boolean) => {
    arriving = value;
    notify();
  };
  /** True from the moment a move is asked for until its turn has started. */
  let waiting = false;
  const setQueuedMove = (value: boolean) => {
    waiting = value;
    notify();
  };
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
        notify();
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
    if (arriving)
      throw new DirectorError('busy', 'Reactions to your last move are still arriving.');
  };
  const requireQuiet = () => {
    if (running() || waiting) throw new DirectorError('busy', 'A turn is still running.');
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
  const currentHour = (p: Projection) =>
    [...p.resolutions].reverse().find((r) => r.status === 'committed' && r.hour !== undefined)
      ?.hour ?? 9;
  const currentDay = (p: Projection) =>
    p.resolutions.filter((r) => r.status === 'committed').at(-1)?.apply?.toDay ?? 0;

  /** Whether word of a reaction has reached the player yet. */
  const landed = (x: ReactionRecord, p: Projection) =>
    x.dueDay === undefined ||
    currentDay(p) > x.dueDay ||
    (currentDay(p) === x.dueDay && currentHour(p) >= (x.dueHour ?? 0));
  const landedReactions = (r: Resolution, p: Projection) =>
    (r.reactions?.reactions ?? []).filter((x) => landed(x, p));

  /**
   * Whether something timed for an hour has happened yet. The engine works a day out as the
   * day begins, but nothing in it is known to anyone until the clock reaches its hour: not
   * to the player, not to the cast, not to whoever writes the news.
   */
  const reached = (day: number, hour: number | undefined, p: Projection) =>
    hour === undefined || day < currentDay(p) || (day === currentDay(p) && hour <= currentHour(p));
  /** Things that need the player and are timed for later today, by the hour they fall at. */
  const comingToday = (p: Projection): number[] => {
    const day = currentDay(p);
    const hour = currentHour(p);
    const committed = p.resolutions.filter((r) => r.status === 'committed');
    return [
      ...committed.flatMap((r) =>
        (r.reactions?.reactions ?? []).flatMap((x) =>
          x.dueDay === day && (x.dueHour ?? 0) > hour ? [x.dueHour ?? 0] : [],
        ),
      ),
      ...committed.flatMap((r) =>
        (r.apply?.events ?? []).flatMap((e) =>
          e.day === day && (e.hour ?? 0) > hour && needsYou(e) ? [e.hour ?? 0] : [],
        ),
      ),
    ].sort((a, b) => a - b);
  };

  const allEvents = (p: Projection): WorldEventView[] =>
    p.resolutions
      .filter((r) => r.status === 'committed')
      .flatMap((r) => {
        const here = new Set(landedReactions(r, p).map((x) => x.id));
        return [
          ...(r.apply?.events ?? [])
            .filter((e) => reached(e.day, e.hour, p))
            .map((e) => {
              const worded = p.worded.get(e.id);
              return worded ? { ...e, summary: worded } : e;
            }),
          ...(r.reactions?.events ?? []).filter((e) => here.has(e.id)),
        ];
      });

  // ------------------------------------------------------------------------------- standing

  /** Undertakings the player has given in conversation, which the engine holds them to. */
  const undertakings = (p: Projection, scenario: Scenario) =>
    [...p.talks].flatMap(([actorId, thread]) => {
      const actor = scenario.cast.find((c) => c.id === actorId);
      // Only something the actor actually wants can be owed to it.
      if (!actor || actor.likes.length === 0) return [];
      return thread
        .filter((t) => t.lever?.kind === 'offer')
        .map((t) => ({
          id: t.id,
          actor,
          text: t.lever?.claim ?? '',
          madeDay: t.day,
          dueDay: t.day + STANDING.graceDays,
        }));
    });
  const outcomeOf = (id: string, events: readonly WorldEventView[]): 'kept' | 'broken' | 'open' => {
    const event = events.find((e) => e.causes.includes(id) && e.kind.startsWith('commitment.'));
    return event ? (event.kind === 'commitment.kept' ? 'kept' : 'broken') : 'open';
  };

  /**
   * How every member of the cast stands toward the player, before a given day. Built only
   * from recorded causes: orders they like or dislike, undertakings given, kept or broken,
   * and threats made.
   */
  function standings(
    p: Projection,
    scenario: Scenario,
    beforeDay = Number.POSITIVE_INFINITY,
  ): Map<string, number> {
    const events = allEvents(p);
    const orders = committedPolicies(p).filter(
      ({ policy, resolution }) => !refusalOf(policy, resolution) && policy.announcedDay < beforeDay,
    );
    return new Map(
      scenario.cast.map((actor) => {
        let value: number = STANDING.start[actor.stance];
        for (const { policy } of orders) value += orderEffect(actor, policy.instrument);
        for (const t of p.talks.get(actor.id) ?? []) {
          if (t.day >= beforeDay) continue;
          if (t.lever?.kind === 'threat') value += STANDING.threat;
          if (t.lever?.kind === 'offer' && actor.likes.length > 0) value += STANDING.undertaking;
        }
        for (const e of events) {
          if (e.day >= beforeDay || !e.causes.includes(`actor:${actor.id}`)) continue;
          if (e.kind === 'commitment.kept') value += STANDING.kept;
          if (e.kind === 'commitment.broken') value += STANDING.broken;
        }
        return [actor.id, clampStanding(value)];
      }),
    );
  }

  /** The adviser to hear from on a subject: whoever among the player's office covers it. */
  const adviserFor = (scenario: Scenario, instrument?: string) => {
    const advisers = scenario.cast.filter((c) => c.kind === 'advisor');
    return (
      (instrument ? advisers.find((c) => c.cares.instruments.includes(instrument)) : undefined) ??
      advisers[0]
    );
  };

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
            title: NOVEL_LABEL,
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
        // An order the catalogue has no name for is called by the player's own words, not
        // by a label that says only that it is unnamed.
        title:
          compiled.title === NOVEL_LABEL
            ? ownWords(compiled.fromCards.map((id) => text.get(id) ?? '').join(' '), compiled.title)
            : compiled.title,
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
    // How each order lands is settled here, by keyed dice, before any model is asked: the
    // judge is told, and given only the part of each range that such a landing allows.
    const actions = active.map((x) => {
      const novel = !CATALOGUE.some((c) => c.id === x.instrument);
      const how: Landing = landing(world.seed, x.id, x.scale, novel);
      return {
        id: x.id,
        by,
        summary: `${x.title}. ${x.summary}`.slice(0, 400),
        stage: 'announced',
        landed: how,
        allowed: allowedFor(x, world).flatMap((rule): Allowed[] => {
          const range = landedRange(rule.range, how);
          return range ? [{ ...rule, range: range.map(round2) as [number, number] }] : [];
        }),
      };
    });
    // What the world does on its own account over these days is settled now, by the engine:
    // what kind of thing, where, when, how grave, and what it moves. So is what each order
    // stirs up among ordinary people. A model words them; with none, the plain line stands.
    // The pace follows the tension: what came up lately does not come up again, something
    // grave is not followed at once by another, and a government that has just acted is
    // answered by more of the country than one that has not.
    const lately = p.resolutions.filter(
      (x) => x.status === 'committed' && (x.apply?.toDay ?? x.fromDay) > r.fromDay - 4,
    );
    const pace = {
      hot:
        active.length > 0 ||
        lately.some(
          (x) => x.fromDay >= r.fromDay - 2 && (x.compile?.policies ?? []).some((y) => !y.vague),
        ),
      recent: new Set(
        lately.flatMap((x) => (x.adjudicate?.events ?? []).flatMap((e) => e.deck ?? [])),
      ),
      grave: !lately.some(
        (x) =>
          (x.apply?.toDay ?? x.fromDay) > r.fromDay - 3 &&
          (x.adjudicate?.events ?? []).some((e) => e.size === 'significant' && e.deck),
      ),
    };
    const nowHour = currentHour(p);
    const happenings: Happening[] = [
      ...forecast(world, scenario.cast, r.fromDay, days, pace),
      ...active.flatMap((x, n) => {
        const how = actions.find((a) => a.id === x.id)?.landed ?? 'partial';
        return (
          aftershock(
            world,
            { id: x.id, title: x.title, region: x.region, landed: how },
            days,
            n + 1,
            nowHour,
          ) ?? []
        );
      }),
    ].sort((a, b) => a.inDays - b.inDays || (a.hour ?? 0) - (b.hour ?? 0));
    const asEvents = (wording: Record<string, string>): AdjudicateData['events'] =>
      happenings.map((h) => ({
        kind: h.kind,
        size: h.size,
        summary: wording[h.id] ?? h.gist,
        ...(h.place ? { place: h.place } : {}),
        inDays: h.inDays,
        ...(h.hour === undefined ? {} : { hour: h.hour }),
        ...(h.deck ? { deck: h.deck } : {}),
        picks: h.picks,
        causes: h.causes,
      }));
    // Nothing was ordered and little time passes: there is nothing to judge, so no model is
    // called and the plain lines are the news.
    if (actions.length === 0 && days < 7)
      return { quiet: true, drawn: true, outcomes: [], events: asEvents({}) };

    // A long run has more happenings than are worth a model's time: the first few are
    // worded, since they are what the player reads first, and the rest keep the plain line.
    const worded = happenings.slice(0, MAX_WORDED);
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
      happenings: worded.map((h) => {
        const where = world.regions.find((x) => x.id === h.place)?.name;
        const who = scenario.cast.find((c) => c.id === h.actor)?.name;
        return {
          id: h.id,
          kind: h.kind,
          size: h.size,
          when: dateOf(world.startDate, r.fromDay + h.inDays),
          ...(where ? { where } : {}),
          ...(who ? { who } : {}),
          gist: h.gist,
        };
      }),
      recent: allEvents(p)
        .slice(-8)
        .map((e) => ({ id: e.id, when: e.date, summary: e.summary })),
    };
    const context = { resolution: r.id, brief: scenario.brief };
    const { output, via } = await harness.run(turnAdjudicate, input, context);

    // Effects come back in the short form `{"inflation": 1.2}`; a zero is no movement.
    const moved = (effects: Record<string, number>) =>
      Object.fromEntries(Object.entries(effects).filter(([, value]) => value !== 0));
    const data: AdjudicateData = {
      ...(via === 'fallback' ? { quiet: true } : {}),
      drawn: true,
      outcomes: Object.entries(output.outcomes).map(([policy, o]) => {
        // The dice's word is final, whatever came back.
        const result = actions.find((a) => a.id === policy)?.landed ?? o.result;
        return {
          policy,
          result,
          note: o.note,
          picks: result === 'stalled' ? {} : moved(o.effects),
        };
      }),
      events: asEvents(output.events),
    };

    // No second opinion is asked for before the turn commits (decision record 0010): the
    // schema and the mender already hold a grave event to the budget and to a cited cause,
    // and a third call was costing every long turn seven seconds or more.
    return data;
  }

  function applyStep(r: Resolution, start: World, scenario: Scenario, p: Projection): ApplyData {
    const compile = r.compile ?? { policies: [], conflicts: [], needsDetail: [], consumed: [] };
    const judged = r.adjudicate ?? { outcomes: [], events: [] };
    const active = compile.policies.filter((x) => !x.blockedReason);
    const days = periodDays(r, active);
    const events: WorldEventView[] = [];
    let n = 0;
    const startHour = currentHour(p);
    const emit = (
      day: number,
      kind: string,
      size: Size,
      summary: string,
      causes: string[],
      extra: Partial<WorldEventView> = {},
    ) => {
      const id = `${r.id}-e${++n}`;
      // Everything has a time of day, and reaches the player when the clock gets there.
      // What is done as the turn begins happens now. The day's figures, votes and changes
      // on the ground are the morning's news. The rest falls where the dice put it.
      const hour =
        day === r.fromDay
          ? startHour
          : MORNING_NEWS.test(kind)
            ? 7
            : 8 + Math.floor(roll(start.seed, `hour:${id}`) * 14);
      const event: WorldEventView = {
        id,
        day,
        date: dateOf(start.startDate, day),
        hour,
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
    const standingNow = standings(p, scenario);
    const messages: NonNullable<ApplyData['messages']> = [];
    const write = (actorId: string | undefined, text: string, day: number) => {
      const actor = scenario.cast.find((c) => c.id === actorId);
      if (actor && !actor.unreachable) messages.push({ actor: actor.id, text, day });
    };
    const secretary = adviserFor(scenario)?.id;
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
          standing: Object.fromEntries(
            scenario.cast
              .filter((c) => c.bloc)
              .map((c) => [c.bloc ?? '', standingNow.get(c.id) ?? 0]),
          ),
        });
        const tally = `${vote.yes} votes to ${vote.no}`;
        if (!vote.passed) {
          stopped[policy.id] = `The ${government.legislature.name} voted it down, ${tally}.`;
          write(
            secretary,
            `The ${government.legislature.name} has voted down "${policy.title}", ${tally}. Our partners did not hold. If you want it passed, they will need something first.`,
            r.fromDay,
          );
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
        write(
          secretary,
          `A petition against "${policy.title}" has succeeded: ${court} have stayed it. It cannot be carried out while the stay stands.`,
          r.fromDay,
        );
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
      // An order that backfires still does what it does, and stirs up anger on top.
      if (outcome?.result === 'backfired')
        made.push(
          ...resolveNovel(
            world,
            {
              [policy.region ? `grievance.${policy.region}` : 'grievance.all']:
                NOVEL_LIMITS.grievance ?? 0,
            },
            { ...resolution, idPrefix: `${policy.id}:backlash` },
          ),
        );
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
      // An order that goes nowhere, or goes wrong, is news the day it is due to take effect.
      if (outcome?.result === 'stalled' || outcome?.result === 'backfired')
        emit(
          Math.min(policy.enactDay, r.fromDay + days),
          outcome.result === 'stalled' ? 'policy.stalled' : 'policy.backfired',
          'significant',
          `${
            outcome.result === 'stalled'
              ? `The order "${policy.title}" has stalled.`
              : `The order "${policy.title}" has turned against the government.`
          } ${outcome.note}`.trim(),
          [policy.id],
          policy.region ? { place: policy.region } : {},
        );
      pendingEnact.push(policy);
      // Those whose support you rely on tell you privately when an order cuts against them.
      for (const actor of scenario.cast) {
        if (
          orderEffect(actor, policy.instrument) < 0 &&
          ['ally', 'military', 'lender', 'province'].includes(actor.kind) &&
          (actor.cares.regions.length === 0 ||
            policy.region === undefined ||
            actor.cares.regions.includes(policy.region))
        ) {
          write(
            actor.id,
            `We were not consulted on "${policy.title}", and it cuts against us. Do not take our support as given.`,
            r.fromDay,
          );
        }
      }
    }
    // Undertakings: an order of the kind that was promised keeps the player's word.
    const owed = undertakings(p, scenario).filter(
      (u) => outcomeOf(u.id, [...allEvents(p), ...events]) === 'open',
    );
    for (const u of owed) {
      const made = pendingEnact.find((x) => u.actor.likes.includes(x.instrument));
      if (!made) continue;
      emit(
        r.fromDay,
        'commitment.kept',
        'minor',
        `${u.actor.name} acknowledged that the ${scenario.office.title} had done as undertaken.`,
        [`actor:${u.actor.id}`, u.id, made.id],
      );
      write(
        u.actor.id,
        'You did what you said you would. That counts for something with us.',
        r.fromDay,
      );
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

    /** One of the period's drawn events takes place, at its own hour. */
    const happen = (e: (typeof planned)[number]) => {
      const event = emit(world.day, e.kind, e.size, e.summary, e.causes, {
        ...(e.place ? { place: e.place } : {}),
        ...(e.hour === undefined ? {} : { hour: e.hour }),
      });
      if (Object.keys(e.picks).length > 0) {
        world = addEffects(
          world,
          resolveNovel(world, e.picks, { day: world.day, causes: [event.id], idPrefix: event.id }),
        );
      }
    };
    // In a move of hours no day is run, and what is drawn for later today still happens.
    if (days === 0) for (const e of planned.filter((x) => x.day === r.fromDay)) happen(e);

    for (let i = 0; i < days && !stoppedEarly; i++) {
      // Everything from here on happened today, whoever caused it.
      const dayStart = events.length;
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
      if (judged.quiet && !judged.drawn) {
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
      for (const u of owed.filter(
        (x) => x.dueDay === world.day && outcomeOf(x.id, events) === 'open',
      )) {
        emit(
          world.day,
          'commitment.broken',
          'significant',
          `${u.actor.name} said the ${scenario.office.title} had gone back on an undertaking: "${u.text}"`,
          [`actor:${u.actor.id}`, u.id],
        );
        write(u.actor.id, 'You gave your word and did not keep it. Do not expect ours.', world.day);
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
          if (up && e.to !== 'protest') {
            stoppedEarly = `Unrest in ${region} escalated.`;
            write(
              adviserFor(scenario, 'security_operation')?.id,
              `${region} has worsened: it has gone from ${e.from} to ${e.to}. I need your instructions before this spreads.`,
              world.day,
            );
          }
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
          if (e.type === 'threshold.raised') {
            stoppedEarly = 'A crisis line was crossed.';
            write(
              adviserFor(scenario, 'sales_tax_rise')?.id,
              `${FLAG_TEXT[e.flag]?.[0] ?? 'A crisis line has been crossed.'} We have to decide what gives: spending, the currency, or our standing with the lenders. I would rather choose than have it chosen for us.`,
              world.day,
            );
          }
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
      // What was drawn for the day the clock has now reached takes place, each thing at its
      // hour, so that it unfolds through that day instead of being found already over.
      for (const e of planned.filter((x) => x.day === world.day)) happen(e);
      // "To the next event that matters": stop the day something notable happens.
      if (r.untilMajor && !stoppedEarly) {
        const notable = events
          .slice(dayStart)
          .find((e) => !isRoutine(e) && (e.size === 'significant' || e.size === 'major'));
        if (notable) stoppedEarly = notable.summary;
        else if (messages.some((m) => m.day === world.day))
          stoppedEarly = 'Someone has written to you.';
      }
    }
    return {
      ...(messages.length > 0 ? { messages } : {}),
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
    // A move to the next thing that carried into a new day stops at that day's first thing
    // worth stopping for, or at nine if the night was quiet. Any other move of days lands
    // at the same hour it left.
    const firstThing = Math.min(
      ...r.apply.events.flatMap((e) =>
        e.day === r.apply?.toDay && needsYou(e) && e.hour !== undefined ? [e.hour] : [],
      ),
      MORNING,
    );
    const hour = r.hours
      ? (currentHour(projection) + r.hours) % 24
      : r.next
        ? firstThing
        : currentHour(projection);
    ledger.appendWithSnapshot(
      { type: 'resolution.committed', id, toDay: r.apply.toDay, hour },
      r.apply.toDay,
      r.apply.world,
    );
    for (const [n, message] of (r.apply.messages ?? []).entries()) {
      ledger.append({
        type: 'talk.incoming',
        id: `${id}-m${n + 1}`,
        actorId: message.actor,
        text: message.text,
        day: message.day,
      });
    }
    setArriving(true);
    enqueue(0, () =>
      aftermath(id).finally(() => {
        setArriving(false);
        // The news is worded off to one side. It is only better wording, so it must never
        // hold up the clock: the next move does not wait for it.
        const wording = wordNews(id)
          .then(() => writeAccounts(id))
          .catch((error) => console.error('[director]', error))
          .finally(() => background.delete(wording));
        background.add(wording);
      }),
    );
  }
  /**
   * Puts on record the details a piece of writing introduced, so that whoever writes next
   * uses the same names. What is already on record under that label is left as it is.
   */
  const record = (details: readonly { label: string; value: string }[]) => {
    const known = new Set(state().projection.canon.map((d) => d.label.toLowerCase()));
    const items = details
      .map((d) => ({ label: d.label.trim().slice(0, 80), value: d.value.trim().slice(0, 160) }))
      .filter((d) => d.label !== '' && d.value !== '' && !known.has(d.label.toLowerCase()))
      .slice(0, 12);
    if (items.length > 0) ledger.append({ type: 'canon.added', items });
  };
  /** Work under way that nothing waits for, kept so that `idle` can tell when it is over. */
  const background = new Set<Promise<void>>();

  /**
   * A quiet turn commits at once, with the day's news in the plain lines the engine drew it
   * in. Afterwards, while the player reads or waits for the hour, a model writes each line
   * properly. Most of them are timed for later in the day, so by the time the clock reaches
   * them they read as they should. With no model, the plain lines stand.
   */
  async function wordNews(id: string): Promise<void> {
    const { projection: p, world, scenario } = state();
    const r = p.resolutions.find((x) => x.id === id);
    if (
      r?.status !== 'committed' ||
      !r.adjudicate?.quiet ||
      !r.adjudicate.drawn ||
      !world ||
      !scenario ||
      !harness.ready('adjudicator')
    )
      return;
    const drawn = new Set(r.adjudicate.events.map((e) => e.summary));
    const plain = (r.apply?.events ?? [])
      .filter((e) => drawn.has(e.summary) && !p.worded.has(e.id))
      .slice(0, MAX_WORDED);
    if (plain.length === 0) return;
    const branch = ledger.currentBranch();
    const { output, via } = await harness.run(
      turnAdjudicate,
      {
        period: {
          from: dateOf(world.startDate, r.fromDay),
          to: dateOf(world.startDate, r.apply?.toDay ?? r.fromDay),
          days: (r.apply?.toDay ?? r.fromDay) - r.fromDay,
        },
        state: {
          ...Object.fromEntries(economyRows(world).map((row) => [row.label, round1(row.value)])),
          ...Object.fromEntries(world.regions.map((x) => [`unrest.${x.id}`, x.stage])),
        },
        regions: world.regions.map((x) => ({ id: x.id, label: x.name })),
        actions: [],
        happenings: plain.map((e, i) => {
          const where = world.regions.find((x) => x.id === e.place)?.name;
          const who = scenario.cast.find((c) => e.causes.includes(`actor:${c.id}`))?.name;
          return {
            id: `h${i + 1}`,
            kind: e.kind,
            size: e.size,
            when: e.date,
            ...(where ? { where } : {}),
            ...(who ? { who } : {}),
            gist: e.summary,
          };
        }),
        recent: allEvents(p)
          .slice(-8)
          .map((e) => ({ id: e.id, when: e.date, summary: e.summary })),
      },
      { resolution: id, brief: scenario.brief },
    );
    // The clock may have moved on while the lines were being written, which is fine. But if
    // the campaign was rewound onto another line, the turn they belong to is gone: drop them.
    const still = state().projection.resolutions.find((x) => x.id === id);
    if (via === 'fallback' || ledger.currentBranch() !== branch || still?.status !== 'committed')
      return;
    const lines = Object.fromEntries(
      plain.flatMap((e, i) => {
        const line = output.events[`h${i + 1}`];
        return line && line !== e.summary ? [[e.id, line]] : [];
      }),
    );
    if (Object.keys(lines).length > 0) ledger.append({ type: 'news.worded', id, lines });
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

    // Who moves first. Not everything that happens is an answer to the player: each day that
    // passed gave somebody in the cast a chance to act on their own, and the dice, tilted by
    // who has most reason, say who. Whoever is answering an order this turn, or has moved in
    // the last fortnight, is passed over.
    const days = r.hours ? 0 : world.day - r.fromDay;
    let moves = 0;
    if (days >= 1) {
      if (roll(world.seed, `move:${id}:1`) < 1 - (1 - MOVE_DAILY_CHANCE) ** days) moves++;
      if (moves === 1 && days >= 7 && (days >= 30 || roll(world.seed, `move:${id}:2`) < 0.5))
        moves++;
    }
    if (orders.length === 0 && moves === 0) return;

    const context = { resolution: id, brief: scenario.brief };
    const standingNow = standings(p, scenario);
    // After a move of hours, answers reach the player one at a time over the day.
    const startHour = (r.hour ?? currentHour(p)) - (r.hours ?? 0);
    const dueAt = (n: number) => {
      const hour = startHour + ([1, 3, 6][n % 3] ?? 6) + 3 * Math.floor(n / 3);
      return { dueDay: r.fromDay + Math.floor(hour / 24), dueHour: hour % 24 };
    };
    const stateNow = Object.fromEntries(world.regions.map((x) => [`unrest.${x.id}`, x.stage]));
    const recent = allEvents(p)
      .slice(-6)
      .map((e) => ({ when: e.date, summary: e.summary }));
    const others: Record<string, string[]> = {};
    const asked: {
      policy?: PolicyRecord;
      actor: (typeof scenario.cast)[number];
      motive?: { reason: string; region?: string };
    }[] = [];
    for (const policy of orders) {
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
      // Three answers to an order, and no more than five in a turn however much was
      // ordered: past that the wait grows and nobody reads them all (spec: Speed).
      const room = Math.max(0, Math.min(MAX_REACTIONS, REACTIONS_PER_TURN - asked.length));
      // Nobody answers twice in one turn: whoever has spoken on one order is only named on
      // the next, so the same party is not heard saying much the same thing again.
      const spoken = new Set(asked.map((a) => a.actor.id));
      const fresh = touched.filter((t) => !spoken.has(t.actor.id));
      const chosen = new Set(fresh.slice(0, room).map((t) => t.actor.id));
      others[policy.id] = touched.filter((t) => !chosen.has(t.actor.id)).map((t) => t.actor.name);
      for (const { actor } of fresh.slice(0, room)) asked.push({ policy, actor });
    }
    const answering = asked.length;
    if (moves > 0) {
      const rested = new Set(
        p.resolutions
          .filter((x) => x.status === 'committed' && x.fromDay > world.day - MOVE_REST_DAYS)
          .flatMap((x) => (x.reactions?.reactions ?? []).filter((y) => y.unprompted))
          .map((y) => y.actor),
      );
      const busy = new Set(asked.map((a) => a.actor.id));
      const pool = restless(scenario.cast, world, (actor) => standingNow.get(actor) ?? 0).filter(
        (c) => !rested.has(c.actor.id) && !busy.has(c.actor.id),
      );
      for (let n = 0; n < Math.min(moves, MOVES_PER_TURN) && pool.length > 0; n++) {
        const total = pool.reduce((sum, c) => sum + c.weight, 0);
        let at = roll(world.seed, `mover:${id}:${n}`) * total;
        const index = Math.max(
          0,
          pool.findIndex((c) => {
            at -= c.weight;
            return at < 0;
          }),
        );
        const [chosen] = pool.splice(index, 1);
        if (!chosen) break;
        asked.push({
          actor: chosen.actor,
          motive: { reason: chosen.reason, ...(chosen.region ? { region: chosen.region } : {}) },
        });
      }
    }
    if (asked.length === 0) return;
    const refOf = (regionId: string | undefined) => {
      const region = world.regions.find((x) => x.id === regionId);
      return region ? { id: region.id, label: region.name } : undefined;
    };
    const wordLimit = REACTION_WORDS[detail()];
    const items = asked.map(({ policy, actor, motive }, n) => {
      const region = refOf(policy?.region);
      const about = refOf(motive?.region);
      return {
        key: `a${n + 1}`,
        ...(policy
          ? {
              order: {
                id: policy.id,
                text: policy.orders.join(' '),
                summary: `${policy.title}. ${policy.summary}`.slice(0, 300),
                instrument: policy.instrument,
                ...(region ? { region } : {}),
              },
            }
          : {}),
        ...(motive
          ? { motive: { reason: motive.reason, ...(about ? { region: about } : {}) } }
          : {}),
        actor: {
          id: actor.id,
          name: actor.name,
          kind: actor.kind,
          stance: stanceOf(standingNow.get(actor.id) ?? 0),
          voice: actor.voice,
        },
        options: (REACTION_OPTIONS[actor.kind] ?? []).map((o) => ({ id: o.id, label: o.label })),
      };
    });
    const before = ledger.latestSnapshot()?.seq;
    // A model on this machine answers one request at a time, so separate calls would queue
    // and pay for the same prompt again and again: ask for the whole turn's answers at once.
    // A hosted model writes them side by side, which is faster there (REQ-PERF-05).
    let answers: (Answer | undefined)[];
    // The words are shown as they are written, unless the answers are due over the coming
    // hours: those must not be read before they arrive.
    const live = !r.hours && days !== 1;
    const draftId = (n: number) => `${id}-x${n + 1}`;
    if (live) {
      writingReactions = asked.map(({ policy, actor }, n) => ({
        id: draftId(n),
        actorName: actor.name,
        policy: policy?.id ?? '',
      }));
      notify();
    }
    try {
      // Asked for together: the given items, whose answers are filed by their place in `items`.
      const together = async (indexes: number[]) => {
        const { output } = await harness.run(
          turnReactions,
          {
            items: indexes.flatMap((n) => items[n] ?? []),
            words: wordLimit,
            state: stateNow,
            recent,
          },
          context,
          live
            ? {
                onDraft: (strings) => {
                  for (const n of indexes)
                    setDraft(draftId(n), strings[`answers.${items[n]?.key}.text`] ?? '');
                },
              }
            : undefined,
        );
        return indexes.map((n) => [n, output.answers[items[n]?.key ?? '']] as const);
      };
      const alone = async (n: number) => {
        const item = items[n];
        if (!item?.order) return [n, undefined] as const;
        const { output } = await harness.run(
          policyReact,
          {
            order: item.order,
            actor: item.actor,
            options: item.options,
            words: wordLimit,
            state: stateNow,
            recent,
          },
          context,
          live ? { onDraft: (strings) => setDraft(draftId(n), strings.text ?? '') } : undefined,
        );
        return [n, output] as const;
      };
      const all = [...items.keys()];
      const replies = all.filter((n) => n < answering);
      const movers = all.filter((n) => n >= answering);
      let written: (readonly [number, Answer | undefined])[];
      if (harness.oneAtATime('narrator') && (items.length > 1 || movers.length > 0))
        written = await together(all);
      else
        written = (
          await Promise.all([
            ...replies.map((n) => alone(n).then((one) => [one])),
            ...(movers.length > 0 ? [together(movers)] : []),
          ])
        ).flat();
      answers = items.map((_, n) => written.find(([at]) => at === n)?.[1]);
    } finally {
      for (const n of items.keys()) setDraft(draftId(n), null);
      if (writingReactions.length > 0) {
        writingReactions = [];
        notify();
      }
    }

    // If the world was rewritten while the answers were being written (a repeal, say), the
    // answers were to a world that is gone: drop them.
    if (ledger.latestSnapshot()?.seq !== before) return;
    let next = world;
    const data: ReactionData = { reactions: [], events: [], beats: [], others };
    for (const [n, { policy, actor, motive }] of asked.entries()) {
      const out = answers[n];
      if (!out) continue;
      const eventId = `${id}-x${n + 1}`;
      const where = policy?.region ?? motive?.region ?? actor.cares.regions[0];
      // What the event follows from: the order it answers, or the actor's own initiative.
      const cause = policy?.id ?? `actor:${actor.id}`;
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
      // An answer to an order comes in over the hours after it. Somebody moving first on a
      // day the clock has just reached does so later that day, at an hour the dice pick.
      const nowHour = r.hour ?? currentHour(p);
      const due: { dueDay?: number; dueHour?: number } = policy
        ? dueAt(n)
        : days === 1 && nowHour < 23
          ? {
              dueDay: world.day,
              dueHour:
                nowHour + 1 + Math.floor(roll(world.seed, `move:${id}:${n}:hour`) * (22 - nowHour)),
            }
          : {};
      data.reactions.push({
        id: eventId,
        actor: actor.id,
        actorName: actor.name,
        policy: policy?.id ?? '',
        ...(policy ? {} : { unprompted: true }),
        kind: out.kind,
        text: out.text,
        ...due,
      });
      // An answer is dated to when it reaches the player; a move of the actor's own to the
      // hour it is made, or to the end of a longer turn.
      const day = due.dueDay ?? (policy ? r.fromDay : world.day);
      data.events.push({
        id: eventId,
        day,
        date: dateOf(world.startDate, day),
        ...(due.dueHour === undefined ? {} : { hour: due.dueHour }),
        kind: policy ? 'reaction' : 'move',
        // Nobody asked for it, so it is news in its own right.
        size: out.kind === 'action' || !policy ? 'significant' : 'minor',
        summary: out.text,
        ...(where ? { place: where } : {}),
        causes: [cause],
        numbers: [],
      });
      if (out.later) {
        data.beats.push({
          id: `${eventId}-b`,
          dueDay: world.day + out.later.inDays,
          policy: cause,
          ...(where ? { place: where } : {}),
          ifYes: named(out.later.ifYes, actor.name),
          ifNo: named(out.later.ifNo, actor.name),
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
    extra: { hours?: number; untilMajor?: boolean; next?: boolean } = {},
  ) => {
    requireCampaign();
    requireQuiet();
    if (waiting) throw new DirectorError('busy', 'A move is already waiting to start.');
    const start = () => {
      const now = state();
      if (!now.world) return Promise.resolve();
      const id = `r${ledger.count() + 1}`;
      // "To the next thing that needs you" is worked out only now, when everything the last
      // move set in train has been written: the next answer or event due today, or one hour
      // on if orders are going out, so that the first answer to them can land. With nothing
      // left today the clock carries into tomorrow.
      let span: { days: number | null; hours?: number } = { days };
      if (extra.next) {
        const hour = currentHour(now.projection);
        const due = comingToday(now.projection)[0];
        const target = Math.min(due ?? 24, cardIds.length > 0 ? hour + 1 : 24);
        span = target < 24 ? { days: 0, hours: target - hour } : { days: 1 };
      }
      ledger.append({
        type: 'resolution.started',
        id,
        kind,
        fromDay: now.world.day,
        cardIds,
        mixedSignals,
        ...extra,
        ...span,
      });
      return runResolution(id);
    };
    // A move made while reactions to the last one are still arriving starts once they have
    // landed, so the record keeps its order.
    setQueuedMove(true);
    enqueue(0, () => {
      setQueuedMove(false);
      return start();
    });
  };

  // A turn that was running when the server stopped picks up where it left off, and so do
  // reactions that had not arrived.
  const unfinished = running();
  if (unfinished) enqueue(0, () => runResolution(unfinished.id));
  else {
    const last = state()
      .projection.resolutions.filter((r) => r.status === 'committed')
      .at(-1);
    if (last && !last.reactions) enqueue(0, () => aftermath(last.id));
  }

  // ---------------------------------------------------------------------------------- the view

  const STANCE_WORD = {
    hostile: 'hostile',
    wary: 'wary',
    neutral: 'watchful',
    friendly: 'on your side',
  } as const;

  const worldView = (world: World): WorldView => ({
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
  });

  /**
   * A word from the player's own office before an order goes out. Rules only: what the
   * office cannot order, what must pass a vote, and who is known to dislike this kind of
   * measure. No model is asked.
   */
  function adviceOn(
    text: string,
    world: World,
    scenario: Scenario,
  ): { from: string; text: string }[] {
    const match = matchInstrument(text, regionRefs(world));
    if (match === undefined || match === 'novel') return [];
    const instrument = CATALOGUE.find((c) => c.id === match.instrument);
    if (!instrument) return [];
    const advice: { from: string; text: string }[] = [];
    const general = adviserFor(scenario)?.name ?? 'Your office';
    if (!(scenario.office.powers as string[]).includes(instrument.authority)) {
      return [
        {
          from: general,
          text: scenario.office.limits[instrument.authority] ?? 'This is not within your powers.',
        },
      ];
    }
    if (instrument.authority === 'budget' && scenario.government)
      advice.push({
        from: general,
        text: `This will need a vote in the ${scenario.government.legislature.name}.`,
      });
    const against = scenario.cast
      .filter(
        (c) =>
          c.kind !== 'advisor' &&
          c.dislikes.includes(match.instrument) &&
          (c.cares.regions.length === 0 ||
            match.region === undefined ||
            c.cares.regions.includes(match.region)),
      )
      .slice(0, 3)
      .map((c) => c.name);
    if (against.length > 0)
      advice.push({
        from: adviserFor(scenario, match.instrument)?.name ?? general,
        text: `Expect objections from ${against.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`,
      });
    return advice;
  }

  function buildView(): View {
    const { projection: p, world, scenario } = state();
    const active = running();
    const lastExecute = [...p.resolutions].reverse().find((r) => r.kind === 'execute');
    const committed = p.resolutions.filter((r) => r.status === 'committed');
    const events = allEvents(p);
    const lastCommitted = committed.at(-1);
    const lastCalls = lastCommitted ? (ledger.calls(lastCommitted.id) as CallView[]) : [];
    const reactions = new Map(
      committed.flatMap((r) => landedReactions(r, p).map((x) => [x.id, x] as const)),
    );
    const now = scenario ? standings(p, scenario) : undefined;
    const before = scenario ? standings(p, scenario, committed.at(-1)?.fromDay ?? 0) : undefined;
    const owed = scenario ? undertakings(p, scenario) : [];
    const titles = new Map(committedPolicies(p).map(({ policy }) => [policy.id, policy.title]));
    // The running story an event belongs to: an order and everything that followed from it,
    // dealings with one actor, the economy, or one place.
    const storyOf = (e: WorldEventView): { id: string; title: string } => {
      const order = e.causes.find((c) => titles.has(c));
      if (order) return { id: order, title: titles.get(order) ?? '' };
      const actor = scenario?.cast.find((c) => e.causes.includes(`actor:${c.id}`));
      if (actor) return { id: `actor:${actor.id}`, title: `Dealings with ${actor.name}` };
      if (
        e.kind.startsWith('figures') ||
        e.kind.startsWith('threshold') ||
        e.kind === 'prices' ||
        e.kind === 'economy'
      )
        return { id: 'economy', title: 'The economy' };
      const region = world?.regions.find((x) => x.id === e.place);
      if (region) return { id: `place:${region.id}`, title: region.name };
      return { id: 'country', title: 'Around the country' };
    };
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
            reactions: landedReactions(resolution, p)
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
          ...(e.hour === undefined ? {} : { hour: e.hour }),
          size: e.size,
          routine: isRoutine(e),
          story: storyOf(e),
          headline: said
            ? said.unprompted
              ? `${said.actorName} ${said.kind === 'action' ? 'made a move' : 'spoke out'}`
              : `${said.actorName} ${said.kind === 'action' ? 'acted' : said.kind === 'silence' ? 'stayed silent' : 'responded'}`
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
      .sort((a, b) => b.day - a.day || (b.hour ?? 0) - (a.hour ?? 0));

    // Why the clock stopped where it did, after a move to the next thing that needed you.
    const stoppedFor = (() => {
      if (!lastCommitted?.next || !world) return undefined;
      const hour = currentHour(p);
      const answer = committed
        .flatMap((x) => x.reactions?.reactions ?? [])
        .find((x) => x.dueDay === world.day && x.dueHour === hour);
      if (answer) return `${answer.actorName} ${answer.unprompted ? 'made a move' : 'answered'}.`;
      const event = events.find((e) => e.day === world.day && e.hour === hour && needsYou(e));
      if (event) return event.summary;
      if (!lastCommitted.hours) return 'A new morning.';
      // Orders went out and nobody has answered yet: the clock still says how far it ran.
      return lastCommitted.hours === 1 ? 'An hour on.' : `${lastCommitted.hours} hours on.`;
    })();

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
      cards: [...p.cards.values()].map((card) => {
        const advice = world && scenario && !card.sent ? adviceOn(card.text, world, scenario) : [];
        return advice.length > 0 ? { ...card, advice } : card;
      }),
      running: active
        ? {
            id: active.id,
            kind: active.kind,
            step: RESOLUTION_STEPS.find((x) => active[x] === undefined) ?? 'commit',
            done: RESOLUTION_STEPS.filter((x) => active[x] !== undefined),
          }
        : waiting
          ? { id: 'queued', kind: 'advance', step: 'compile', done: [] }
          : null,
      blocked:
        lastExecute?.status === 'blocked' && lastExecute.blocked ? lastExecute.blocked : null,
      world: world ? worldView(world) : null,
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
      cast: (scenario?.cast ?? []).map((c) => {
        const value = now?.get(c.id) ?? 0;
        const change = value - (before?.get(c.id) ?? value);
        const thread = p.talks.get(c.id) ?? [];
        return {
          id: c.id,
          name: c.name,
          kind: c.kind,
          stance: STANCE_WORD[stanceOf(value)],
          trend:
            change > 2
              ? ('warming' as const)
              : change < -2
                ? ('cooling' as const)
                : ('steady' as const),
          unread: Math.max(0, thread.filter((t) => t.incoming).length - (p.seen.get(c.id) ?? 0)),
          undertakings: owed
            .filter((u) => u.actor.id === c.id)
            .map((u) => ({
              text: u.text,
              state: outcomeOf(u.id, events),
              by: world ? dateOf(world.startDate, u.dueDay) : '',
            })),
          askable: c.unreachable === undefined,
          ...(c.unreachable ? { unreachable: c.unreachable } : {}),
        };
      }),
      talks: world
        ? Object.fromEntries(
            [...p.talks].map(([actor, thread]) => [
              actor,
              thread.map((t) => ({
                id: t.id,
                date: dateOf(world.startDate, t.day),
                question: t.question,
                ...(t.incoming ? { incoming: true } : {}),
                ...(t.reply !== undefined ? { reply: t.reply } : {}),
                ...(t.orders?.length ? { orders: t.orders } : {}),
              })),
            ]),
          )
        : {},
      arriving: {
        reactions: arriving,
        writing: writingReactions,
        entries: [...writing],
        later: committed.reduce(
          (sum, r) => sum + (r.reactions?.reactions.length ?? 0) - landedReactions(r, p).length,
          0,
        ),
      },
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
      ...(stoppedFor ? { stoppedFor } : {}),
    };
  }

  const moveLabel = (r: Resolution): string => {
    const days = (r.apply?.toDay ?? r.fromDay) - r.fromDay;
    const span = r.hours
      ? r.hours === 1
        ? 'an hour'
        : `${r.hours} hours`
      : r.next
        ? 'to the next morning'
        : days === 1
          ? 'a day'
          : `${days} days`;
    const count = r.compile?.policies.length ?? 0;
    const ran = r.untilMajor
      ? `ran the clock to the next event that mattered (${span})`
      : `ran the clock ${span}`;
    return count > 0
      ? `Sent ${count} ${count === 1 ? 'order' : 'orders'} and ${ran}`
      : `${ran[0]?.toUpperCase()}${ran.slice(1)}`;
  };

  /**
   * Writes the full account of one event and saves it, once. Asked for by the player from
   * an entry, or written unasked for an event that matters (decision record 0015). The
   * account knows only what has happened by now: nothing timed for later is in "related".
   */
  async function writeAccount(event: WorldEventView, world: World, scenario: Scenario) {
    const eventId = event.id;
    writing.add(eventId);
    notify();
    try {
      const p = state().projection;
      if (p.expanded.has(eventId)) return;
      const all = allEvents(p);
      const speakers = new Map(
        p.resolutions.flatMap((r) =>
          (r.reactions?.reactions ?? []).map((x) => [x.id, x.actorName] as const),
        ),
      );
      // What else is on record about the same matter: shared causes, either way round.
      const related = all
        .filter(
          (e) =>
            e.id !== eventId &&
            (e.causes.some((c) => event.causes.includes(c) && c !== 'trend' && c !== 'world') ||
              e.causes.includes(eventId) ||
              event.causes.includes(e.id)),
        )
        .slice(-8)
        .map((e) => ({
          when: e.date,
          summary: e.summary.slice(0, 400),
          ...(speakers.has(e.id) ? { speaker: speakers.get(e.id) ?? '' } : {}),
        }));
      const place = world.regions.find((x) => x.id === event.place);
      // What somebody said or did is never a footnote: it gets a full paragraph at least.
      const weight =
        event.size === 'major'
          ? 'major'
          : event.size === 'significant' || speakers.has(event.id)
            ? 'significant'
            : 'minor';
      const branch = ledger.currentBranch();
      const { output, via } = await harness.run(
        chronicleWrite,
        {
          event: {
            id: event.id,
            when:
              event.hour === undefined
                ? event.date
                : `${event.date} ${String(event.hour).padStart(2, '0')}:00`,
            kind: event.kind,
            size: event.size,
            summary: event.summary,
            ...(place ? { place: { id: place.id, label: place.name } } : {}),
            ...(speakers.has(event.id) ? { speaker: speakers.get(event.id) ?? '' } : {}),
            numbers: event.numbers
              .filter(
                (x): x is Figure & { before: number; now: number } =>
                  typeof x.before === 'number' && typeof x.now === 'number',
              )
              .map((x) => ({ label: x.label, before: x.before, after: x.now, unit: x.unit })),
          },
          related,
          weight,
          words: Math.round(ACCOUNT_WORDS[weight] * ACCOUNT_SCALE[detail()]),
          level: 'standard',
          // The player's own office is left out of who is who: it is not theirs to write for.
          people: scenario.cast
            .filter((c) => c.kind !== 'advisor')
            .map((c) => `${c.name} (${c.kind})`),
          reader: `${scenario.headOfGovernment.name}, ${scenario.headOfGovernment.office}`,
          office: scenario.cast
            .filter((c) => c.kind === 'advisor')
            .map((c) => c.name.replace(/^(Your|The)\s+/i, '')),
          canon: p.canon.slice(-60),
        },
        { resolution: 'entries', brief: scenario.brief },
        { onDraft: (strings) => setDraft(eventId, strings.body ?? '') },
      );
      // The campaign was rewound onto another line while it was being written: drop it.
      if (ledger.currentBranch() !== branch) return;
      // Saved once: opening the entry again shows the same text (REQ-READ-18).
      ledger.append({ type: 'entry.expanded', eventId, body: output.body, via });
      if (via !== 'fallback') record(output.details);
    } finally {
      writing.delete(eventId);
      setDraft(eventId, null);
      notify();
    }
  }

  /**
   * An event that matters gets its full account without being asked for: the player should
   * not have to click to find out what a strike or an attack looked like. Written off to
   * one side after the turn, a couple at most, and only where a model will write them: the
   * built-in wording would add nothing to the headline.
   */
  async function writeAccounts(id: string): Promise<void> {
    const { projection: p, world, scenario } = state();
    const r = p.resolutions.find((x) => x.id === id);
    if (r?.status !== 'committed' || !world || !scenario || !harness.ready('narrator')) return;
    const worth = (r.apply?.events ?? [])
      .filter(
        (e) =>
          !isRoutine(e) &&
          (e.size === 'significant' || e.size === 'major') &&
          !p.expanded.has(e.id) &&
          !writing.has(e.id),
      )
      .slice(0, ACCOUNTS_PER_TURN);
    for (const event of worth) {
      // Read again with its proper wording, if the news has been worded since.
      const worded = state().projection.worded.get(event.id);
      await writeAccount(worded ? { ...event, summary: worded } : event, world, scenario);
    }
  }

  let viewCache: { key: string; view: View } | undefined;

  return {
    view() {
      // The view depends on the ledger and on what is still in flight.
      const key = `${ledger.version()}|${arriving}|${waiting}|${[...writing].join()}|${writingReactions.length}`;
      if (viewCache?.key !== key) viewCache = { key, view: buildView() };
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
      else if ('next' in span) begin(kind, null, fresh, mixedSignals, { next: true });
      else begin(kind, MAX_ADVANCE_DAYS, fresh, mixedSignals, { untilMajor: true });
    },
    expandEntry(eventId) {
      const { projection, world, scenario } = requireCampaign();
      const event = allEvents(projection).find((e) => e.id === eventId);
      if (!event) throw new DirectorError('not_found', 'No such entry.');
      if (projection.expanded.has(eventId) || writing.has(eventId)) return;
      // Marked at once, so that the page shows it as being written before the model is free.
      writing.add(eventId);
      notify();
      enqueue(0, () => writeAccount(event, world, scenario));
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
            // Earlier answers are given in brief: enough to know what has been said, without
            // a long briefing crowding the next one out of a small model's memory.
            earlier: thread
              .filter((t) => t.id !== id && t.reply !== undefined)
              .slice(-3)
              .map((t) => ({ question: t.question, reply: (t.reply ?? '').slice(0, 700) })),
            // An adviser has room for a briefing; anyone else speaks at ordinary length.
            words: Math.round(REPLY_WORDS[detail()] * (insider ? 1 : 0.4)),
            people: [
              `${scenario.headOfGovernment.name}, ${scenario.headOfGovernment.office} (the asker)`,
              ...scenario.cast.map((c) => `${c.name} (${c.kind})`),
            ],
            canon: now.projection.canon.slice(-60),
            ...(insider
              ? {
                  canOrder: {
                    instruments: CATALOGUE.map((c) => c.title),
                    regions: now.world.regions.map((x) => x.name),
                  },
                }
              : {}),
          },
          { resolution: 'talks', brief: scenario.brief },
          { onDraft: (strings) => setDraft(id, strings.reply ?? '') },
        );
        ledger.append({
          type: 'talk.replied',
          id,
          reply: output.reply,
          via,
          ...(output.lever.kind !== 'none' ? { lever: output.lever } : {}),
          ...(output.orders.length > 0 ? { orders: output.orders.slice(0, 5) } : {}),
        });
        record(output.details);
        setDraft(id, null);
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
      // The turn now ends on this day, so whoever answers it or moves at its close does so
      // here, as they would have had the clock been stopped on this day in the first place.
      setArriving(true);
      enqueue(0, () => aftermath(again.id).finally(() => setArriving(false)));
    },
    moment(turnId) {
      const { projection, world } = requireCampaign();
      const turn = projection.resolutions.find((r) => r.id === turnId && r.status === 'committed');
      const snapshot = turn?.commitSeq ? ledger.snapshotAt(turn.commitSeq) : undefined;
      if (!turn || !snapshot) throw new DirectorError('not_found', 'No such turn.');
      return {
        turn: turnId,
        date: dateOf(world.startDate, snapshot.day),
        world: worldView(snapshot.world as World),
      };
    },
    markRead(actorId) {
      const { projection } = requireCampaign();
      const incoming = (projection.talks.get(actorId) ?? []).filter((t) => t.incoming).length;
      if (incoming > (projection.seen.get(actorId) ?? 0))
        ledger.append({ type: 'talk.read', actorId });
    },
    calls: (resolution) => ledger.calls(resolution) as CallView[],
    mapData() {
      const id = state().projection.scenarioId;
      return id ? { regions: loadOutlines(id as ScenarioId), world: loadWorldOutlines() } : null;
    },
    debugWorld: () => state().world,
    async idle() {
      while (working || queue.length > 0 || background.size > 0)
        await (working ?? Promise.all(background));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    watchDrafts(listener) {
      draftListeners.add(listener);
      return () => draftListeners.delete(listener);
    },
    drafts: () => Object.fromEntries(drafting),
  };
}
