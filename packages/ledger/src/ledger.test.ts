import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { PolicyCard } from '@statecraft/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LedgerVersionError, openLedger } from './index.ts';

const card = (id: string, text: string): PolicyCard => ({
  id,
  text,
  source: 'composer',
  createdAt: '2027-01-01T00:00:00.000Z',
});

describe('ledger', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'statecraft-'));
    file = join(dir, 'test.statecraft');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('appends events in order and survives reopening', () => {
    const first = openLedger(file, '0.1.0');
    first.append({ type: 'card.created', card: card('a', 'Cut the fuel subsidy') });
    first.append({ type: 'card.created', card: card('b', 'Raise the wheat price') });
    first.close();

    const second = openLedger(file, '0.1.0');
    expect(second.count()).toBe(2);
    expect(second.events().map((e) => e.seq)).toEqual([1, 2]);
    second.close();
  });

  it('never deletes: rewinding starts a branch that shares the past and keeps the old future', () => {
    const ledger = openLedger(file, '0.1.0');
    ledger.append({ type: 'card.created', card: card('a', 'Cut the fuel subsidy') });
    const kept = ledger.appendWithSnapshot(
      { type: 'card.created', card: card('b', 'Raise the wheat price') },
      3,
      { day: 3 },
    );
    ledger.append({ type: 'card.deleted', cardId: 'a' });
    expect(ledger.latestSnapshot()).toMatchObject({ seq: kept.seq, day: 3 });

    ledger.fork(kept.seq, 'Second try');
    ledger.append({ type: 'card.created', card: card('c', 'Open talks') });
    expect(ledger.events().map((e) => e.seq)).toEqual([1, 2, 4]);
    expect(ledger.count()).toBe(4);
    ledger.close();

    const reopened = openLedger(file, '0.1.0');
    expect(reopened.currentBranch()).toBe(2);
    expect(reopened.events().map((e) => e.seq)).toEqual([1, 2, 4]);
    reopened.close();
  });

  it('rejects an event that does not match the schema', () => {
    const ledger = openLedger(file, '0.1.0');
    expect(() => ledger.append({ type: 'card.created', card: card('a', '   ') })).toThrow();
    expect(ledger.count()).toBe(0);
    ledger.close();
  });

  it('keeps the engine version the campaign started on', () => {
    openLedger(file, '0.1.0').close();
    const later = openLedger(file, '9.9.9');
    expect(later.engineVersion).toBe('0.1.0');
    later.close();
  });

  it('refuses to open a save written by a newer version', () => {
    openLedger(file, '0.1.0').close();
    const raw = new DatabaseSync(file);
    raw.exec("UPDATE meta SET value = '999' WHERE key = 'schema_version'");
    raw.close();
    expect(() => openLedger(file, '0.1.0')).toThrow(LedgerVersionError);
  });
});
