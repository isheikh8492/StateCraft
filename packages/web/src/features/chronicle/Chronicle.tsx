import { MapPin, ScrollText } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDate, useGame } from '@/lib/game';
import { Badge } from '@/ui/badge';
import { EmptyState } from '@/ui/empty-state';

/** What happened, newest first. Every entry is built from recorded events and links to them. */
export function Chronicle() {
  const { view, place, setPlace, openPolicy } = useGame();
  const entries = view?.chronicle ?? [];
  const events = new Map((view?.events ?? []).map((e) => [e.id, e]));
  const policies = new Map((view?.policies ?? []).map((p) => [p.id, p]));
  const regions = new Map((view?.world?.regions ?? []).map((r) => [r.id, r.name]));
  const last = view?.lastResolution;

  if (entries.length === 0) {
    return (
      <EmptyState icon={ScrollText} title="Nothing has happened yet">
        Execute your policy boxes or advance time. The story of each period appears here, in order,
        told once.
      </EmptyState>
    );
  }
  return (
    <div className="h-full overflow-auto">
      {last?.stoppedEarly && (
        <p className="border-b border-warn/40 bg-warn-soft px-4 py-2 text-xs text-warn">
          Time stopped early: {last.stoppedEarly}
        </p>
      )}
      <ol aria-label="Chronicle" className="flex flex-col">
        {entries.map((entry) => {
          const cited = entry.cites.map((id) => events.get(id)).filter((e) => e !== undefined);
          const linked = [...new Set(cited.flatMap((e) => e.causes))]
            .map((id) => policies.get(id))
            .filter((p) => p !== undefined);
          const where = entry.place ?? cited.find((e) => e.place)?.place;
          return (
            <li
              key={entry.id}
              className={cn(
                'border-b border-border px-4 py-3',
                where && where === place && 'bg-accent-soft',
              )}
            >
              <div className="flex items-center gap-2">
                <time dateTime={entry.date} className="tabular text-2xs text-fg-subtle">
                  {formatDate(entry.date)}
                </time>
                {cited.some((e) => e.size === 'major') && <Badge tone="bad">Major</Badge>}
                {where && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-control text-2xs text-fg-muted hover:text-accent"
                    onClick={() => setPlace(where)}
                  >
                    <MapPin className="size-3" />
                    {regions.get(where) ?? where}
                  </button>
                )}
                <div className="flex-1" />
                <span
                  className="text-2xs text-fg-subtle"
                  title="Written by the game, not a real news report"
                >
                  Simulated{entry.via === 'fallback' ? ' · plain wording' : ''}
                </span>
              </div>
              <h3 className="mt-1 font-serif text-lg text-fg">{entry.headline}</h3>
              {entry.body !== '' && entry.body !== entry.headline && (
                <p className="prose-read mt-1 text-fg-muted">{entry.body}</p>
              )}
              {linked.length > 0 && (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-2xs text-fg-subtle">
                  Follows from
                  {linked.map((p) => (
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
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
