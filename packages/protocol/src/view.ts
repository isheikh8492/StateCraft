/** What the server sends the screen. One object, rebuilt from the ledger. */

export interface CardView {
  id: string;
  text: string;
  createdAt: string;
  reading?: { reading: string; instrument: string; question?: string };
  /** A standing instruction: it stays on the desk after it is executed. */
  pinned?: boolean;
  /** Already executed in its current wording; it will not be sent again until edited. */
  sent?: boolean;
}

/** A figure before and since. Moods and unrest are given in words, never as numbers. */
export interface Figure {
  label: string;
  before: number | string;
  now: number | string;
  unit: string;
}

export interface WorldEventView {
  id: string;
  day: number;
  date: string;
  kind: string;
  size: 'colour' | 'minor' | 'significant' | 'major';
  summary: string;
  place?: string;
  causes: string[];
  numbers: Figure[];
}

/** One thing that happened, as the chronicle shows it. Built from a recorded event. */
export interface ChronicleEntry {
  /** The id of the event it reports. */
  id: string;
  /** The turn it happened in. */
  turn: string;
  day: number;
  date: string;
  size: 'colour' | 'minor' | 'significant' | 'major';
  /** A notice that needs no telling: shown as one compact line. */
  routine: boolean;
  headline: string;
  cites: string[];
  place?: string;
  /** For a reaction: who spoke, and what they said. */
  speaker?: string;
  quote?: string;
  /** The full piece, once the player has opened the entry. */
  full?: string;
  /** How the full piece was produced. */
  via?: 'model' | 'fallback';
}

export interface ReactionView {
  id: string;
  actor: string;
  actorName: string;
  kind: 'statement' | 'action' | 'silence';
  text: string;
  date: string;
}

export interface CastMember {
  id: string;
  name: string;
  kind: string;
  /** How they stand toward you, in a word. */
  stance: string;
  /** Whether you can put a question to them. */
  askable: boolean;
  /** Why not, when you cannot. */
  unreachable?: string;
}

export interface TalkTurn {
  id: string;
  date: string;
  question: string;
  /** Missing while the answer is being written. */
  reply?: string;
}

/** One move of the clock: what you did, and what the world did in return. */
export interface TurnView {
  id: string;
  from: string;
  to: string;
  /** Your orders, in your words. Empty when you only ran the clock. */
  orders: string[];
  move: string;
  stoppedEarly?: string;
}

export type PolicyStage = 'announced' | 'enacted' | 'implemented' | 'felt';

export interface PolicyView {
  id: string;
  title: string;
  summary: string;
  instrument: string;
  instrumentTitle: string;
  region?: string;
  status: 'active' | 'blocked' | 'repealed';
  blockedReason?: string;
  stage: PolicyStage;
  announcedDate: string;
  enactDate: string;
  /** The player's own words, exactly as typed. */
  orders: string[];
  result?: string;
  note?: string;
  /** % of GDP per year; positive adds to the deficit. */
  costPerYear: number;
  funding: string;
  effects: { label: string; change: string; from: string; until: string | null }[];
  targets: Figure[];
  reactions: ReactionView[];
  /** Actors touched more lightly, who noted the order without a full response. */
  alsoNoted: string[];
  linkedEvents: string[];
}

export interface RegionView {
  id: string;
  name: string;
  stage: 'calm' | 'protest' | 'riot' | 'insurgency';
  status: 'held' | 'contested' | 'occupied';
  owner: string;
  controller: string;
}

export interface WorldView {
  economy: { label: string; value: number; unit: string; digits: number }[];
  /** Mood in words. Approval is never shown as a number (spec: Engine rules, Decisions). */
  groups: { id: string; name: string; mood: string }[];
  regions: RegionView[];
  flags: string[];
}

export interface CallView {
  id: string;
  resolution: string;
  job: string;
  model: string;
  strategy: string;
  via: 'model' | 'repaired' | 'fallback';
  attempts: number;
  errors: string[];
  tokensIn: number;
  tokensOut: number;
  ms: number;
  promptHash: string;
  input: string;
  output: string;
}

export interface View {
  campaign: null | {
    scenarioId: string;
    title: string;
    country: string;
    office: string;
    holder: string;
    startDate: string;
    date: string;
    day: number;
    /** Hour of the day, 0 to 23. */
    hour: number;
    branch: number;
  };
  cards: CardView[];
  /** A resolution in progress. */
  running: null | { id: string; kind: 'execute' | 'advance'; step: string; done: string[] };
  /** The last execution that was held back for a choice. */
  blocked: null | {
    conflicts: { cards: string[]; explanation: string }[];
    needsDetail: { card: string; question: string }[];
  };
  world: WorldView | null;
  policies: PolicyView[];
  chronicle: ChronicleEntry[];
  events: WorldEventView[];
  /** Points the campaign can be rewound to, oldest first. */
  timeline: { seq: number; day: number; date: string; label: string }[];
  branches: { id: number; parent: number | null; label: string; current: boolean }[];
  turns: TurnView[];
  cast: CastMember[];
  /** Conversations, by actor id. */
  talks: Record<string, TalkTurn[]>;
  /** Work still arriving after the last turn committed. */
  arriving: { reactions: boolean; entries: string[] };
  lastResolution: null | {
    id: string;
    calls: number;
    fallbacks: number;
    tokensIn: number;
    tokensOut: number;
    ms: number;
    stoppedEarly?: string;
  };
}

export interface ModelCheck {
  ok: boolean;
  verdict: 'suitable' | 'usable' | 'unsuitable' | 'unreachable';
  summary: string;
  jobs: { job: string; via: 'model' | 'repaired' | 'fallback'; ms: number; errors: string[] }[];
}

export interface ScenarioInfo {
  id: string;
  title: string;
  office: string;
  holder: string;
  brief: string;
}
