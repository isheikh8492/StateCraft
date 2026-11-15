/**
 * The story record: everything established about the world, held once, from which every
 * model call is given only what concerns it and only what its reader knows (spec:
 * `08-the-story-record.md`). The record itself is built from the ledger; this file is the
 * part that has no need of it: what an entry is, who may read one, and which entries a
 * call is given.
 */

export type EntryKind = 'person' | 'place' | 'body' | 'fact' | 'story';

/** Who is reading: nobody in particular (news), the player's own government, or one actor. */
export type Reader = 'all' | 'office' | `actor:${string}`;

export interface Entry {
  id: string;
  kind: EntryKind;
  /** For a name: the office or thing that was named. Left out for a fact or a story. */
  label?: string;
  /** What is established, in a sentence or two; for a name, the name. */
  text: string;
  /** What it concerns: `actor:<id>`, `region:<id>`, `story:<id>`, or an order's id. */
  about: string[];
  /** The day it became true. */
  since: number;
  /** The day it stopped being true, if it has. */
  until?: number;
  /** Who knows it: everyone, or the readers listed. An empty list is the engine's alone. */
  knownTo: 'all' | string[];
  /** The event that established it. */
  from?: string;
}

/** Roughly how many tokens a text is, for fitting entries into the room a call has. */
export const tokensOf = (text: string) => Math.ceil(text.length / 3.6);

/**
 * The one rule of secrecy. Something public is known to everyone. Anything else is known
 * only to those it lists, and never to a writer of news, who writes for everyone.
 */
export const knows = (entry: Entry, reader: Reader) =>
  entry.knownTo === 'all' || (reader !== 'all' && entry.knownTo.includes(reader));

/** What kind of thing a name was given to, judged from what it was called. */
export function kindOf(label: string): EntryKind {
  const l = label.toLowerCase();
  if (
    /\b(road|street|hall|square|city|town|village|district|base|outpost|camp|port|bridge|market|venue|hotel|house|headquarters|hq|mosque|stadium|crossing|pass|depot|airport|station|park|chowk|bazaar)\b/.test(
      l,
    )
  )
    return 'place';
  if (
    /\b(minister|chief|general|governor|leader|spokes\w*|president|secretary|commander|mayor|judge|justice|officer|chair\w*|director|head|envoy|ambassador|adviser|advisor|colonel|brigadier|major|imam|mufti|sardar|senator|member|deputy|speaker|editor|analyst|professor|doctor|cleric|aide|organi[sz]er)\b/.test(
      l,
    )
  )
    return 'person';
  return 'body';
}

/** How closely an entry bears on what a call is about: its story, its actors, its region. */
function closeness(entry: Entry, about: ReadonlySet<string>): number {
  let best = 0;
  for (const id of entry.about) {
    if (!about.has(id)) continue;
    best = Math.max(best, id.startsWith('story:') ? 3 : id.startsWith('region:') ? 1 : 2);
  }
  return best;
}

/**
 * The entries a call is given. Only what the reader knows and what is still true; those
 * about the same story first, then the same actors, then the same region, then whatever is
 * most recent, for general awareness; and no more than fit in the room. A lookup by id: no
 * model is asked and nothing is searched.
 */
export function recordFor(
  entries: Iterable<Entry>,
  reader: Reader,
  about: readonly string[],
  room: number,
  today = Number.POSITIVE_INFINITY,
): Entry[] {
  const wanted = new Set(about);
  const ranked = [...entries]
    .filter((e) => knows(e, reader) && (e.until === undefined || e.until > today))
    .map((entry) => ({ entry, rank: closeness(entry, wanted) }))
    .sort((a, b) => b.rank - a.rank || b.entry.since - a.entry.since);
  const chosen: Entry[] = [];
  let used = 0;
  for (const { entry } of ranked) {
    const cost = tokensOf(`${entry.label ?? ''} ${entry.text}`) + 6;
    if (used + cost > room) continue;
    used += cost;
    chosen.push(entry);
  }
  return chosen;
}

const KIND_LABEL: Readonly<Record<EntryKind, string>> = {
  person: 'Person',
  place: 'Place',
  body: 'Body',
  fact: 'On record',
  story: 'A matter still running',
};

/** Entries in the shape the writing jobs take: what a thing is, and what is established. */
export const asDetails = (entries: readonly Entry[]) =>
  entries.map((e) => ({ label: e.label ?? KIND_LABEL[e.kind], value: e.text.slice(0, 160) }));

/** Entries as plain lines, for a job that takes them as text. */
export const asLines = (entries: readonly Entry[]) =>
  entries.map((e) => (e.label ? `${e.label}: ${e.text}` : e.text));
