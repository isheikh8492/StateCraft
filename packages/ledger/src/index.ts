/**
 * The ledger: an append-only record of events in one SQLite file per campaign.
 * Nothing is ever updated or deleted. Rewinding starts a new branch that shares the past
 * with its parent up to the fork; the abandoned future stays in the file.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LedgerEvent, SCHEMA_VERSION, type StoredEvent } from '@statecraft/protocol';

export interface Branch {
  id: number;
  parent: number | null;
  /** Events of the parent line up to and including this sequence number are shared. */
  forkSeq: number | null;
  label: string;
}

export interface Ledger {
  /** Validates and appends one event to the current branch. */
  append(event: LedgerEvent, at?: Date): StoredEvent;
  /** Appends an event and stores a snapshot under its sequence number, together or not at all. */
  appendWithSnapshot(event: LedgerEvent, day: number, world: unknown): StoredEvent;
  /** Every event visible from the current branch, oldest first. */
  events(): StoredEvent[];
  count(): number;
  /** The newest snapshot visible from the current branch. */
  latestSnapshot(): { seq: number; day: number; world: unknown } | undefined;
  snapshotAt(seq: number): { seq: number; day: number; world: unknown } | undefined;
  branches(): Branch[];
  currentBranch(): number;
  /** Start a new branch that shares history up to `seq`, and switch to it. */
  fork(seq: number, label: string): Branch;
  recordCall(id: string, resolution: string, record: unknown): void;
  calls(resolution?: string): unknown[];
  /** Bumps on every write, so readers can cache. */
  version(): number;
  /** Called after every write, so the screen can be pushed to instead of asking. */
  watch(listener: () => void): () => void;
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
  const setMeta = db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  );
  const readMeta = (key: string): string | undefined =>
    (getMeta.get(key) as { value: string } | undefined)?.value;

  const storedSchema = readMeta('schema_version');
  if (storedSchema !== undefined && Number(storedSchema) > SCHEMA_VERSION) {
    db.close();
    throw new LedgerVersionError(
      `This save uses format ${storedSchema}, but this version of StateCraft reads up to ${SCHEMA_VERSION}. Update StateCraft to open it.`,
    );
  }
  if (storedSchema === undefined) setMeta.run('engine_version', engineVersion);

  // Format 2 adds branches, snapshots and the model call log.
  const columns = db.prepare('PRAGMA table_info(events)').all() as unknown as { name: string }[];
  if (!columns.some((c) => c.name === 'branch')) {
    db.exec('ALTER TABLE events ADD COLUMN branch INTEGER NOT NULL DEFAULT 1');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent INTEGER,
      fork_seq INTEGER,
      label TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS snapshots (
      seq INTEGER PRIMARY KEY,
      day INTEGER NOT NULL,
      world TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      resolution TEXT NOT NULL,
      record TEXT NOT NULL
    ) STRICT;
    INSERT OR IGNORE INTO branches (id, parent, fork_seq, label) VALUES (1, NULL, NULL, 'Main line');
  `);
  setMeta.run('schema_version', String(SCHEMA_VERSION));
  const pinnedEngine = readMeta('engine_version') ?? engineVersion;

  let current = Number(readMeta('current_branch') ?? 1);
  let writes = 0;
  const listeners = new Set<() => void>();
  /** Counts the write and tells anyone waiting on one. */
  const bump = () => {
    writes++;
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        console.error('[ledger] a watcher threw', error);
      }
    }
  };

  const insert = db.prepare('INSERT INTO events (at, type, payload, branch) VALUES (?, ?, ?, ?)');
  const selectBranch = db.prepare(
    'SELECT seq, at, payload FROM events WHERE branch = ? AND seq <= ? ORDER BY seq',
  );
  const selectCount = db.prepare('SELECT COUNT(*) AS n FROM events');
  const selectBranches = db.prepare(
    'SELECT id, parent, fork_seq AS forkSeq, label FROM branches ORDER BY id',
  );
  const insertSnapshot = db.prepare('INSERT INTO snapshots (seq, day, world) VALUES (?, ?, ?)');
  const selectSnapshot = db.prepare('SELECT seq, day, world FROM snapshots WHERE seq = ?');
  const insertCall = db.prepare(
    'INSERT OR REPLACE INTO calls (id, resolution, record) VALUES (?, ?, ?)',
  );

  const branches = (): Branch[] => selectBranches.all() as unknown as Branch[];

  /** The current branch and its ancestors, each with the last sequence number it contributes. */
  const lineage = (): { id: number; upTo: number }[] => {
    const all = new Map(branches().map((b) => [b.id, b]));
    const line: { id: number; upTo: number }[] = [];
    let id: number | null = current;
    let upTo = Number.MAX_SAFE_INTEGER;
    while (id !== null) {
      const branch = all.get(id);
      if (!branch) break;
      line.unshift({ id, upTo });
      upTo = Math.min(upTo, branch.forkSeq ?? upTo);
      id = branch.parent;
    }
    return line;
  };

  const events = (): StoredEvent[] => {
    const rows: EventRow[] = [];
    for (const { id, upTo } of lineage()) {
      rows.push(...(selectBranch.all(id, upTo) as unknown as EventRow[]));
    }
    return rows.map((row) => ({
      seq: row.seq,
      at: row.at,
      event: LedgerEvent.parse(JSON.parse(row.payload)),
    }));
  };

  const append = (event: LedgerEvent, at = new Date()): StoredEvent => {
    const valid = LedgerEvent.parse(event);
    const iso = at.toISOString();
    const result = insert.run(iso, valid.type, JSON.stringify(valid), current);
    bump();
    return { seq: Number(result.lastInsertRowid), at: iso, event: valid };
  };

  const readSnapshot = (seq: number) => {
    const row = selectSnapshot.get(seq) as { seq: number; day: number; world: string } | undefined;
    return row
      ? { seq: row.seq, day: row.day, world: JSON.parse(row.world) as unknown }
      : undefined;
  };

  return {
    engineVersion: pinnedEngine,
    append,
    appendWithSnapshot(event, day, world) {
      db.exec('BEGIN');
      try {
        const stored = append(event);
        insertSnapshot.run(stored.seq, day, JSON.stringify(world));
        db.exec('COMMIT');
        return stored;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    events,
    count: () => Number((selectCount.get() as { n: number }).n),
    latestSnapshot() {
      const visible = events();
      for (let i = visible.length - 1; i >= 0; i--) {
        const snapshot = readSnapshot(visible[i]?.seq ?? 0);
        if (snapshot) return snapshot;
      }
      return undefined;
    },
    snapshotAt: readSnapshot,
    branches,
    currentBranch: () => current,
    fork(seq, label) {
      const result = db
        .prepare('INSERT INTO branches (parent, fork_seq, label) VALUES (?, ?, ?)')
        .run(current, seq, label);
      const branch = { id: Number(result.lastInsertRowid), parent: current, forkSeq: seq, label };
      current = branch.id;
      setMeta.run('current_branch', String(current));
      bump();
      return branch;
    },
    recordCall(id, resolution, record) {
      insertCall.run(id, resolution, JSON.stringify(record));
      bump();
    },
    calls(resolution) {
      const rows = (resolution === undefined
        ? db.prepare('SELECT record FROM calls ORDER BY rowid DESC LIMIT 200').all()
        : db
            .prepare('SELECT record FROM calls WHERE resolution = ? ORDER BY rowid')
            .all(resolution)) as unknown as { record: string }[];
      return rows.map((r) => JSON.parse(r.record) as unknown);
    },
    version: () => writes,
    watch(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: () => db.close(),
  };
}
