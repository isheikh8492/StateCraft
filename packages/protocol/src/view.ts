/** What the server sends the screen. One object, rebuilt from the ledger. */

export interface CardView {
  id: string;
  text: string;
  createdAt: string;
  reading?: { reading: string; instrument: string; question?: string };
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

export interface ChronicleEntry {
  id: string;
  day: number;
  date: string;
  headline: string;
  body: string;
  cites: string[];
  place?: string;
  /** How the text was produced: a model, or the built-in wording. */
  via: 'model' | 'fallback';
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
  report?: { status: string; effect: string; attribution: string; sideEffects: string[] };
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
  digests: { month: string; text: string }[];
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
