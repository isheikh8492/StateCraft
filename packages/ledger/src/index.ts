/**
 * The ledger: an append-only record of events in one SQLite file per campaign.
 * Nothing is ever updated or deleted; current state is a projection of the events.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  LedgerEvent,
  type PolicyCard,
  SCHEMA_VERSION,
  type StoredEvent,
} from '@statecraft/protocol';

export interface Ledger {
  /** Validates and appends one event. Returns it with its sequence number and time. */
  append(event: LedgerEvent, at?: Date): StoredEvent;
  /** Every event, oldest first. */
  events(): StoredEvent[];
  count(): number;
  /** Projection: policy boxes that have been created and not deleted, oldest first. */
  draftCards(): PolicyCard[];
  /** The engine version this campaign is pinned to. */
  readonly engineVersion: string;
  close(): void;
}

export class LedgerVersionError extends Error {}

interface EventRow {
  seq: number;
  at: string;
  payload: string;
}

export function openLedger(path: string, engineVersion: string): Ledger {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS events_type ON events (type);
  `);

  const getMeta = db.prepare('SELECT value FROM meta WHERE key = ?');
  const setMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
  const readMeta = (key: string): string | undefined =>
    (getMeta.get(key) as { value: string } | undefined)?.value;

  const storedSchema = readMeta('schema_version');
  if (storedSchema === undefined) {
    setMeta.run('schema_version', String(SCHEMA_VERSION));
    setMeta.run('engine_version', engineVersion);
  } else if (Number(storedSchema) > SCHEMA_VERSION) {
    db.close();
    throw new LedgerVersionError(
      `This save uses format ${storedSchema}, but this version of StateCraft reads up to ${SCHEMA_VERSION}. Update StateCraft to open it.`,
    );
  }
  const pinnedEngine = readMeta('engine_version') ?? engineVersion;

  const insert = db.prepare('INSERT INTO events (at, type, payload) VALUES (?, ?, ?)');
  const selectAll = db.prepare('SELECT seq, at, payload FROM events ORDER BY seq');
  const selectCount = db.prepare('SELECT COUNT(*) AS n FROM events');

  const events = (): StoredEvent[] =>
    (selectAll.all() as unknown as EventRow[]).map((row) => ({
      seq: row.seq,
      at: row.at,
      event: LedgerEvent.parse(JSON.parse(row.payload)),
    }));

  return {
    engineVersion: pinnedEngine,
    append(event, at = new Date()) {
      const valid = LedgerEvent.parse(event);
      const iso = at.toISOString();
      const result = insert.run(iso, valid.type, JSON.stringify(valid));
      return { seq: Number(result.lastInsertRowid), at: iso, event: valid };
    },
    events,
    count: () => Number((selectCount.get() as { n: number }).n),
    draftCards() {
      const cards = new Map<string, PolicyCard>();
      for (const { event } of events()) {
        if (event.type === 'card.created') cards.set(event.card.id, event.card);
        else if (event.type === 'card.deleted') cards.delete(event.cardId);
      }
      return [...cards.values()];
    },
    close: () => db.close(),
  };
}
