/**
 * Shared shapes for everything that crosses a boundary: API routes, ledger events, save files.
 * Anything that comes in (request bodies, stored events) is a schema and is validated.
 * Read-only views sent to the screen are plain types in `view.ts`.
 */
import { z } from 'zod';

export * from './view.ts';

/** Header that carries the per-run session token on every API request. */
export const API_TOKEN_HEADER = 'x-statecraft-token';

/** Version of the save-file layout. Bump on any change to stored shapes. */
export const SCHEMA_VERSION = 3;

/** One move of the clock is capped at a year (REQ-CLK-01). */
export const MAX_ADVANCE_DAYS = 366;

export const CardSource = z.enum(['composer', 'advisor', 'dm', 'call', 'meeting', 'event']);
export type CardSource = z.infer<typeof CardSource>;

/** One policy box: a single idea in the player's own words. The text is never rewritten. */
export const PolicyCard = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1).max(2000),
  source: CardSource,
  createdAt: z.iso.datetime(),
  // Open slots, unused in M0 (see docs/spec/02-engine-rules.md, "Open by design").
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
export type PolicyCard = z.infer<typeof PolicyCard>;

export const NewPolicyCard = z.object({
  text: PolicyCard.shape.text,
  source: CardSource.default('composer'),
});
export type NewPolicyCard = z.input<typeof NewPolicyCard>;

export const CardReading = z.object({
  reading: z.string(),
  instrument: z.string(),
  question: z.string().optional(),
});
export type CardReading = z.infer<typeof CardReading>;

/** What runs before a turn commits. Writing and reactions follow afterwards. */
export const RESOLUTION_STEPS = ['compile', 'adjudicate', 'apply'] as const;
/** Steps older saves may contain. */
const STORED_STEPS = ['compile', 'adjudicate', 'apply', 'narrate', 'report'] as const;
export type ResolutionStep = (typeof RESOLUTION_STEPS)[number];

/**
 * Everything that can be appended to the ledger. The ledger is append-only.
 * Step data is produced and read back by the director alone, so it is stored as it is.
 */
export const LedgerEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('campaign.started'), scenarioId: z.string(), seed: z.string() }),
  z.object({ type: z.literal('card.created'), card: PolicyCard }),
  z.object({ type: z.literal('card.deleted'), cardId: z.string().min(1) }),
  z.object({ type: z.literal('card.read'), cardId: z.string().min(1), reading: CardReading }),
  z.object({
    type: z.literal('card.edited'),
    cardId: z.string().min(1),
    text: PolicyCard.shape.text,
  }),
  z.object({
    type: z.literal('card.moved'),
    cardId: z.string().min(1),
    beforeId: z.string().nullable(),
  }),
  z.object({ type: z.literal('card.pinned'), cardId: z.string().min(1), pinned: z.boolean() }),
  z.object({
    type: z.literal('resolution.started'),
    id: z.string(),
    kind: z.enum(['execute', 'advance']),
    fromDay: z.number().int(),
    days: z.number().int().nullable(),
    cardIds: z.array(z.string()),
    mixedSignals: z.boolean(),
    /** A move of less than a day: the clock's hour moves and the daily systems do not. */
    hours: z.number().int().min(1).max(23).optional(),
    /** Stop at the first event that matters. */
    untilMajor: z.boolean().optional(),
    /**
     * A move to the next thing that needs the player: some hours within the day, or over
     * into the next day, where the clock stops at that day's first such thing or at nine.
     */
    next: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('resolution.step'),
    id: z.string(),
    step: z.enum(STORED_STEPS),
    data: z.unknown(),
  }),
  z.object({ type: z.literal('resolution.blocked'), id: z.string(), data: z.unknown() }),
  z.object({
    type: z.literal('resolution.committed'),
    id: z.string(),
    toDay: z.number().int(),
    hour: z.number().int().min(0).max(23).optional(),
  }),
  /** How the cast answered a turn's orders. Written after the turn commits. */
  z.object({ type: z.literal('reactions.written'), id: z.string(), data: z.unknown() }),
  /** The full piece on one event, written when the player first opens it. */
  z.object({
    type: z.literal('entry.expanded'),
    eventId: z.string(),
    body: z.string(),
    via: z.string(),
  }),
  /**
   * News that was recorded in its plain line when a quiet turn committed, worded properly
   * afterwards so that the turn did not wait for it. Keyed by event id.
   */
  z.object({
    type: z.literal('news.worded'),
    id: z.string(),
    lines: z.record(z.string(), z.string().max(400)),
  }),
  /**
   * Details of texture a model introduced and the game now holds it to: the name given to an
   * office holder, a venue, a programme. Never a figure of the world's own state.
   */
  z.object({
    type: z.literal('canon.added'),
    items: z
      .array(z.object({ label: z.string().min(1).max(80), value: z.string().min(1).max(160) }))
      .max(12),
  }),
  /** A message a member of the cast sends unasked. */
  z.object({
    type: z.literal('talk.incoming'),
    id: z.string(),
    actorId: z.string(),
    text: z.string(),
    day: z.number().int(),
  }),
  z.object({ type: z.literal('talk.read'), actorId: z.string() }),
  z.object({
    type: z.literal('talk.asked'),
    id: z.string(),
    actorId: z.string(),
    question: z.string().min(1).max(1000),
    day: z.number().int(),
  }),
  z.object({
    type: z.literal('talk.replied'),
    id: z.string(),
    reply: z.string(),
    via: z.string(),
    /** What the player put on the table, as the engine will hold them to it. */
    lever: z.object({ kind: z.enum(['offer', 'threat', 'none']), claim: z.string() }).optional(),
    /** Orders an adviser drafted for the player to use or ignore. */
    orders: z.array(z.string().max(2000)).max(5).optional(),
  }),
  z.object({ type: z.literal('resolution.cancelled'), id: z.string() }),
  z.object({ type: z.literal('policy.repealed'), policyId: z.string(), day: z.number().int() }),
  z.object({ type: z.literal('digest.written'), month: z.string(), text: z.string() }),
]);
export type LedgerEvent = z.infer<typeof LedgerEvent>;

export const StoredEvent = z.object({
  seq: z.number().int().positive(),
  at: z.iso.datetime(),
  event: LedgerEvent,
});
export type StoredEvent = z.infer<typeof StoredEvent>;

export const Session = z.object({ token: z.string().min(16) });
export type Session = z.infer<typeof Session>;

export const Health = z.object({
  ok: z.literal(true),
  version: z.string(),
  engineVersion: z.string(),
  schemaVersion: z.number().int(),
  events: z.number().int().nonnegative(),
});
export type Health = z.infer<typeof Health>;

export const ApiError = z.object({ error: z.string(), detail: z.string().optional() });
export type ApiError = z.infer<typeof ApiError>;

/** One move of the clock. Any boxes on the desk are sent first. */
export const MoveRequest = z.object({
  span: z.union([
    z.object({ hours: z.literal(1) }),
    z.object({ days: z.number().int().min(1).max(MAX_ADVANCE_DAYS) }),
    z.object({ untilMajor: z.literal(true) }),
    /** To the next thing that needs you: hours, never past the next morning. */
    z.object({ next: z.literal(true) }),
  ]),
  mixedSignals: z.boolean().default(false),
});
export type MoveSpan = z.infer<typeof MoveRequest>['span'];
export const AskRequest = z.object({
  actorId: z.string().min(1),
  question: z.string().trim().min(1).max(1000),
});

export const ExecuteRequest = z.object({
  mixedSignals: z.boolean().default(false),
  /** How far to run the clock. Left out, the game runs to the first result worth attention. */
  days: z.number().int().min(1).max(MAX_ADVANCE_DAYS).optional(),
});
export const AdvanceRequest = z.object({ days: z.number().int().min(1).max(MAX_ADVANCE_DAYS) });
/** Go back to a saved point, or to any past date. */
export const RewindRequest = z.union([
  z.object({ seq: z.number().int().positive() }),
  z.object({ date: z.iso.date() }),
]);
export const CardPatch = z.object({
  text: PolicyCard.shape.text.optional(),
  pinned: z.boolean().optional(),
  /** Move the box to sit before this one; null moves it to the end. */
  beforeId: z.string().nullable().optional(),
});
export const StartRequest = z.object({ scenarioId: z.string().min(1) });

export const MODEL_KINDS = ['none', 'openai', 'anthropic', 'gemini'] as const;
/** How to reach a model. The key itself never leaves the server's environment. */
export const ModelSettings = z.object({
  kind: z.enum(MODEL_KINDS),
  /** For `openai`: any compatible server, such as LM Studio or Ollama. */
  baseUrl: z.string().max(500).default(''),
  model: z.string().max(200).default(''),
  /** Name of the environment variable that holds the key, if one is needed. */
  keyEnv: z.string().max(100).default(''),
});
export type ModelSettings = z.infer<typeof ModelSettings>;

export const MODEL_ROLES = ['adjudicator', 'extractor', 'narrator'] as const;
export type ModelRole = (typeof MODEL_ROLES)[number];
/** One main model, and optionally a different one for any role (REQ-HARN-08). */
/** How much the game writes: shorter is faster. */
export const DETAIL_LEVELS = ['brief', 'standard', 'rich'] as const;
export type Detail = (typeof DETAIL_LEVELS)[number];

export const ModelConfig = z.object({
  main: ModelSettings,
  detail: z.enum(DETAIL_LEVELS).default('standard'),
  roles: z
    .object({
      adjudicator: ModelSettings.optional(),
      extractor: ModelSettings.optional(),
      narrator: ModelSettings.optional(),
    })
    .default({}),
});
export type ModelConfig = z.infer<typeof ModelConfig>;
export const CheckRequest = z.object({ role: z.enum(MODEL_ROLES).optional() });
