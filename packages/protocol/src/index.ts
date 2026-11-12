/**
 * Shared shapes for everything that crosses a boundary: API routes, ledger events, save files.
 * Types are always derived from these schemas, never written by hand.
 */
import { z } from 'zod';

/** Header that carries the per-run session token on every API request. */
export const API_TOKEN_HEADER = 'x-statecraft-token';

/** Version of the save-file layout. Bump on any change to stored shapes. */
export const SCHEMA_VERSION = 1;

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

/** Everything that can be appended to the ledger. The ledger is append-only. */
export const LedgerEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('card.created'), card: PolicyCard }),
  z.object({ type: z.literal('card.deleted'), cardId: z.string().min(1) }),
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

export const CardList = z.object({ cards: z.array(PolicyCard) });
export type CardList = z.infer<typeof CardList>;

export const ApiError = z.object({ error: z.string(), detail: z.string().optional() });
export type ApiError = z.infer<typeof ApiError>;
