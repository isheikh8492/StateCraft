import { describe, expect, it } from 'vitest';
import { asDetails, asLines, type Entry, kindOf, knows, recordFor } from './record.ts';

const entry = (id: string, more: Partial<Entry>): Entry => ({
  id,
  kind: 'fact',
  text: `Something about ${id}.`,
  about: [],
  since: 0,
  knownTo: 'all',
  ...more,
});

describe('the story record', () => {
  const entries = [
    entry('quetta-old', { about: ['region:balochistan'], since: 3 }),
    entry('ppp-deal', { about: ['actor:ppp', 'region:sindh'], since: 20 }),
    entry('march', { kind: 'story', about: ['story:r9-x1', 'actor:pti'], since: 12 }),
    entry('general', { since: 40 }),
    entry('army-plan', { about: ['actor:army'], since: 30, knownTo: ['actor:army'] }),
    entry('leak', { about: ['actor:army'], since: 31, knownTo: ['actor:army', 'office'] }),
    entry('dice', { since: 32, knownTo: [] }),
    entry('over', { about: ['actor:pti'], since: 5, until: 10 }),
  ];
  const ids = (found: Entry[]) => found.map((e) => e.id);

  it('gives a call what concerns it, closest first: its story, its actors, its region', () => {
    const found = recordFor(
      entries,
      'all',
      ['story:r9-x1', 'actor:ppp', 'region:balochistan'],
      1000,
      50,
    );
    // The same story, then the same actor, then the same region, then whatever is newest.
    expect(ids(found)).toEqual(['march', 'ppp-deal', 'quetta-old', 'general']);
  });

  it('hands over only what the reader knows, and never a secret to a writer of news', () => {
    // News is written for everyone, so it is given only what everyone knows.
    expect(ids(recordFor(entries, 'all', ['actor:army'], 1000, 50))).not.toContain('army-plan');
    // The army knows its own plan; the player's government knows only what leaked to it.
    expect(ids(recordFor(entries, 'actor:army', ['actor:army'], 1000, 50)).slice(0, 2)).toEqual([
      'leak',
      'army-plan',
    ]);
    const office = ids(recordFor(entries, 'office', ['actor:army'], 1000, 50));
    expect(office).toContain('leak');
    expect(office).not.toContain('army-plan');
    // What only the engine holds is given to nobody at all.
    for (const reader of ['all', 'office', 'actor:army'] as const)
      expect(ids(recordFor(entries, reader, [], 1000, 50))).not.toContain('dice');
    expect(knows(entries[6] as Entry, 'office')).toBe(false);
  });

  it('leaves out what is no longer true, and stops when the room is used up', () => {
    expect(ids(recordFor(entries, 'all', ['actor:pti'], 1000, 50))).not.toContain('over');
    // Before it ended, it was still on record.
    expect(ids(recordFor(entries, 'all', ['actor:pti'], 1000, 8))).toContain('over');
    // Room for two short entries: the two closest are the two given.
    expect(ids(recordFor(entries, 'all', ['story:r9-x1', 'actor:ppp'], 30, 50))).toEqual([
      'march',
      'ppp-deal',
    ]);
    expect(recordFor(entries, 'all', [], 0, 50)).toEqual([]);
  });

  it('files a name by what it was given to, and hands names over in the shape writers take', () => {
    expect(kindOf('Interior Minister')).toBe('person');
    expect(kindOf('Quetta City Hall')).toBe('place');
    expect(kindOf('Balochistan Development Fund')).toBe('body');
    const named = entry('n1', {
      kind: 'person',
      label: 'Mayor of Quetta',
      text: 'Sardar Ahmed Zaman',
    });
    expect(asDetails([named])).toEqual([{ label: 'Mayor of Quetta', value: 'Sardar Ahmed Zaman' }]);
    expect(asLines([named, entries[1] as Entry])).toEqual([
      'Mayor of Quetta: Sardar Ahmed Zaman',
      'Something about ppp-deal.',
    ]);
  });
});
