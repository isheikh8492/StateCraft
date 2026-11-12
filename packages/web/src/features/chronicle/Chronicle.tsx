import type { ChronicleEntry } from '@statecraft/protocol';
import { MapPin, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, useGame } from '@/lib/game';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';

/**
 * What happened. By turn, each move of yours is followed by what the world did in return;
 * by time, it is one dated stream. Entries are short; the full account of any of them is
 * written when you ask for it.
 */
export function Chronicle() {
  const { view } = useGame();
  const [mode, setMode] = useState<'turn' | 'time'>('turn');
  const entries = view?.chronicle ?? [];
  const turns = view?.turns ?? [];

  if (turns.length === 0) {
    return (
      <EmptyState icon={ScrollText} title="Nothing has happened yet">
        Write an order and move time forward with the date control at the top. Each move appears
        here, followed by what the world did in return.
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
        {(['turn', 'time'] as const).map((m) => (
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
            {m === 'turn' ? 'By turn' : 'By time'}
          </button>
        ))}
        <div className="flex-1" />
        {view?.arriving.reactions && (
          <span role="status" className="text-2xs text-accent">
            Reactions are coming in…
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {mode === 'time' ? (
          <ol aria-label="Chronicle">
            {entries.map((entry) => (
              <Entry key={entry.id} entry={entry} />
            ))}
          </ol>
        ) : (
          turns.map((turn) => {
            const mine = entries.filter((e) => e.turn === turn.id).sort((a, b) => a.day - b.day);
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

function Entry({ entry }: { entry: ChronicleEntry }) {
  const { view, act, place, setPlace, openPolicy } = useGame();
  const event = view?.events.find((e) => e.id === entry.id);
  const policies = (view?.policies ?? []).filter((p) => event?.causes.includes(p.id));
  const region = view?.world?.regions.find((r) => r.id === entry.place)?.name;
  const writing = view?.arriving.entries.includes(entry.id) ?? false;

  if (entry.routine) {
    return (
      <li className="flex items-baseline gap-2 border-b border-border px-4 py-1.5 text-xs text-fg-muted">
        <time dateTime={entry.date} className="tabular shrink-0 text-2xs text-fg-subtle">
          {formatDate(entry.date)}
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
      <p className="mt-2 flex flex-wrap items-center gap-2 text-2xs text-fg-subtle">
        {entry.full === undefined && !entry.speaker && (
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
