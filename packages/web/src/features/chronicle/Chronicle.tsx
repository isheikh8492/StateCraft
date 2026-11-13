import type { ChronicleEntry, View } from '@statecraft/protocol';
import { Download, MapPin, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, useDraft, useGame } from '@/lib/game';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Writing } from '@/ui/writing';
import { ArrivingReactions } from './Arriving';

/**
 * What happened. By turn, each move of yours is followed by what the world did in return;
 * by time, it is one dated stream. Entries are short; the full account of any of them is
 * written when you ask for it.
 */
export function Chronicle() {
  const { view, moment, lookAt } = useGame();
  const [mode, setMode] = useState<'turn' | 'time' | 'story'>('turn');
  const entries = view?.chronicle ?? [];
  const turns = view?.turns ?? [];

  if (turns.length === 0) {
    return (
      <EmptyState icon={ScrollText} title="Nothing has happened yet">
        Write an order and press play on the policy desk. Each move appears here, followed by what
        the world did in return.
      </EmptyState>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div
        role="tablist"
        aria-label="How to read history"
        className="flex items-center gap-1 border-b border-border px-3 py-1.5"
      >
        {(['turn', 'time', 'story'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs',
              mode === m ? 'border-accent text-fg' : 'border-border text-fg-muted hover:text-fg',
            )}
          >
            {m === 'turn' ? 'By turn' : m === 'time' ? 'By time' : 'By story'}
          </button>
        ))}
        <div className="flex-1" />
        {(view?.arriving.later ?? 0) > 0 && !view?.arriving.reactions && (
          <span role="status" className="text-2xs text-fg-muted">
            {view?.arriving.later} more{' '}
            {view?.arriving.later === 1 ? 'response is' : 'responses are'} expected in the coming
            hours
          </span>
        )}
        <Button size="sm" variant="ghost" onClick={() => exportChronicle(view)}>
          <Download />
          Export
        </Button>
        {view?.arriving.reactions && (
          <span role="status" className="text-2xs text-accent">
            Reactions are coming in…
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {(view?.arriving.writing.length ?? 0) > 0 && (
          <section
            aria-label="Reactions coming in"
            className="border-b-2 border-border bg-surface-2 px-4 py-3"
          >
            <p className="label-caps mb-2 text-accent">Coming in now</p>
            <ArrivingReactions />
          </section>
        )}
        {mode === 'story' ? (
          stories(entries).map((story) => (
            <section key={story.id} aria-label={story.title} className="border-b-2 border-border">
              <header className="bg-surface-2 px-4 py-2">
                <p className="label-caps text-accent">Story</p>
                <h3 className="font-semibold text-fg">{story.title}</h3>
              </header>
              <ol aria-label="Chronicle">
                {story.entries.map((entry) => (
                  <Entry key={entry.id} entry={entry} />
                ))}
              </ol>
            </section>
          ))
        ) : mode === 'time' ? (
          <ol aria-label="Chronicle">
            {entries.map((entry) => (
              <Entry key={entry.id} entry={entry} />
            ))}
          </ol>
        ) : (
          turns.map((turn) => {
            const mine = entries
              .filter((e) => e.turn === turn.id)
              .sort((a, b) => a.day - b.day || (a.hour ?? 0) - (b.hour ?? 0));
            // The clock moves by the hour now, and most presses of play only pass time. A
            // move with no orders and nothing to show for it is not worth a heading.
            if (turn.orders.length === 0 && mine.length === 0) return null;
            return (
              <section
                key={turn.id}
                aria-label={`Turn ending ${formatDate(turn.to)}`}
                className="border-b-2 border-border"
              >
                <header className="bg-surface-2 px-4 py-2">
                  <p className="tabular text-2xs text-fg-subtle">
                    {formatDate(turn.from)}
                    {turn.to !== turn.from && ` to ${formatDate(turn.to)}`}
                  </p>
                  <p className="label-caps mt-1 text-accent">Your move</p>
                  <p className="text-fg">{turn.move}</p>
                  {turn.orders.map((order) => (
                    <blockquote
                      key={order}
                      className="mt-1 border-l-2 border-accent pl-2 text-fg-muted"
                    >
                      {order}
                    </blockquote>
                  ))}
                  {turn.stoppedEarly && (
                    <p className="mt-1 text-xs text-warn">Time stopped: {turn.stoppedEarly}</p>
                  )}
                  <Button
                    size="sm"
                    variant={moment?.turn === turn.id ? 'primary' : 'ghost'}
                    className="mt-1"
                    onClick={() => lookAt(moment?.turn === turn.id ? null : turn.id)}
                  >
                    {moment?.turn === turn.id
                      ? 'Viewing this moment · return to the present'
                      : 'See the world at this point'}
                  </Button>
                </header>
                <p className="label-caps px-4 pt-2 text-fg-subtle">World response</p>
                {mine.length === 0 ? (
                  <p className="px-4 py-2 text-fg-muted">Nothing of note.</p>
                ) : (
                  <ol aria-label="Chronicle">
                    {mine.map((entry) => (
                      <Entry key={entry.id} entry={entry} />
                    ))}
                  </ol>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

/** The time of day an entry happened at, to follow its date; nothing for older entries. */
const when = (hour: number | undefined) =>
  hour === undefined ? '' : `, ${String(hour).padStart(2, '0')}:00`;

function Entry({ entry }: { entry: ChronicleEntry }) {
  const { view, act, place, setPlace, openPolicy } = useGame();
  const event = view?.events.find((e) => e.id === entry.id);
  const policies = (view?.policies ?? []).filter((p) => event?.causes.includes(p.id));
  const region = view?.world?.regions.find((r) => r.id === entry.place)?.name;
  const writing = view?.arriving.entries.includes(entry.id) ?? false;
  const draft = useDraft(entry.id);

  if (entry.routine) {
    return (
      <li className="flex items-baseline gap-2 border-b border-border px-4 py-1.5 text-xs text-fg-muted">
        <time dateTime={entry.date} className="tabular shrink-0 text-2xs text-fg-subtle">
          {formatDate(entry.date)}
          {when(entry.hour)}
        </time>
        <span className="min-w-0 flex-1">{entry.headline}</span>
      </li>
    );
  }
  return (
    <li
      className={cn(
        'border-b border-border px-4 py-3',
        entry.place && entry.place === place && 'bg-accent-soft',
      )}
    >
      <div className="flex items-center gap-2">
        <time dateTime={entry.date} className="tabular text-2xs text-fg-subtle">
          {formatDate(entry.date)}
          {when(entry.hour)}
        </time>
        {entry.size === 'major' && <Badge tone="bad">Major</Badge>}
        {entry.place && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-control text-2xs text-fg-muted hover:text-accent"
            onClick={() => setPlace(entry.place ?? null)}
          >
            <MapPin className="size-3" />
            {region ?? entry.place}
          </button>
        )}
        <div className="flex-1" />
        <span
          className="text-2xs text-fg-subtle"
          title="Written by the game, not a real news report or a real statement"
        >
          Simulated
        </span>
      </div>
      {entry.speaker ? (
        <>
          <p className="mt-1 text-xs font-medium text-fg">{entry.headline}</p>
          <blockquote
            data-testid="quote"
            className="prose-read mt-1 border-l-2 border-accent pl-3 font-serif text-fg"
          >
            {entry.quote}
          </blockquote>
        </>
      ) : (
        <h3 className="mt-1 font-serif text-lg text-fg">{entry.headline}</h3>
      )}
      {entry.full !== undefined && (
        <div
          data-testid="full-account"
          className="prose-read mt-2 whitespace-pre-wrap text-fg-muted"
        >
          {entry.full}
        </div>
      )}
      {entry.full === undefined && draft && (
        <div className="prose-read mt-2 text-fg-muted">
          <Writing text={draft} />
        </div>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-2 text-2xs text-fg-subtle">
        {entry.full === undefined && (
          <Button
            size="sm"
            variant="ghost"
            disabled={writing}
            onClick={() => void act(() => api.expandEntry(entry.id))}
          >
            {writing ? 'Writing…' : 'Read the full account'}
          </Button>
        )}
        {policies.length > 0 && 'Follows from'}
        {policies.map((p) => (
          <button
            key={p.id}
            type="button"
            className="rounded-full border border-border px-2 py-0.5 text-fg-muted hover:border-accent hover:text-accent"
            onClick={() => openPolicy(p.id)}
          >
            {p.title}
          </button>
        ))}
      </p>
    </li>
  );
}

/** Entries grouped into running stories, each in the order it unfolded; routine notices left out. */
function stories(entries: readonly ChronicleEntry[]) {
  const groups = new Map<string, { id: string; title: string; entries: ChronicleEntry[] }>();
  for (const entry of [...entries].reverse()) {
    if (entry.routine) continue;
    const group = groups.get(entry.story.id) ?? { ...entry.story, entries: [] };
    group.entries.push(entry);
    groups.set(entry.story.id, group);
  }
  return [...groups.values()].sort(
    (a, b) => (b.entries.at(-1)?.day ?? 0) - (a.entries.at(-1)?.day ?? 0),
  );
}

/** Saves the chronicle, turn by turn, as a Markdown file. */
function exportChronicle(view: View | null) {
  if (!view?.campaign) return;
  const lines = [
    `# ${view.campaign.title}: the chronicle`,
    '',
    'Everything here was generated by a simulation. None of it is a real report or a real statement.',
    '',
  ];
  for (const turn of [...view.turns].reverse()) {
    lines.push(
      `## ${turn.from}${turn.to === turn.from ? '' : ` to ${turn.to}`}`,
      '',
      `**Your move:** ${turn.move}`,
      ...turn.orders.map((o) => `> ${o}`),
      '',
    );
    for (const entry of view.chronicle
      .filter((e) => e.turn === turn.id)
      .sort((a, b) => a.day - b.day)) {
      lines.push(`- ${entry.date}: ${entry.speaker ? entry.quote : entry.headline}`);
      if (entry.full) lines.push('', entry.full, '');
    }
    lines.push('');
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown' }));
  link.download = `statecraft-chronicle-${view.campaign.date}.md`;
  link.click();
  URL.revokeObjectURL(link.href);
}
