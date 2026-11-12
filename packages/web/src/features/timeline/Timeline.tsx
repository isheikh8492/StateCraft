import { History } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatDate, useGame } from '@/lib/game';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Input } from '@/ui/input';

/** Every saved point of the campaign. Going back starts a new line; the old one is kept. */
export function Timeline() {
  const { view, act } = useGame();
  const [confirm, setConfirm] = useState<number | null>(null);
  const [date, setDate] = useState('');
  const points = [...(view?.timeline ?? [])].reverse();
  if (points.length === 0) {
    return (
      <EmptyState icon={History} title="No saved points yet">
        The game saves after every resolution. Each save appears here, and you can go back to any of
        them.
      </EmptyState>
    );
  }
  return (
    <div className="h-full overflow-auto">
      <p className="border-b border-border px-4 py-2 text-xs text-fg-muted">
        The game saves by itself. Going back to an earlier point starts a new line of history from
        there; nothing is deleted.
      </p>
      <form
        className="flex items-end gap-2 border-b border-border px-4 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (date !== '') void act(() => api.rewindToDate(date));
        }}
      >
        <label htmlFor="rewind-date" className="flex flex-col gap-1">
          <span className="text-xs text-fg-muted">Or go back to any date</span>
          <Input
            id="rewind-date"
            type="date"
            value={date}
            min={view?.campaign?.startDate}
            max={view?.campaign?.date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <Button type="submit" variant="danger" disabled={date === '' || view?.running != null}>
          Go back to this date
        </Button>
      </form>
      <ol aria-label="Saved points">
        {points.map((point, i) => (
          <li key={point.seq} className="flex items-center gap-3 border-b border-border px-4 py-2">
            <time dateTime={point.date} className="tabular w-24 shrink-0 text-xs text-fg-muted">
              {formatDate(point.date)}
            </time>
            <span className="min-w-0 flex-1 truncate">{point.label}</span>
            {i === 0 ? (
              <Badge tone="accent">Now</Badge>
            ) : confirm === point.seq ? (
              <>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    setConfirm(null);
                    void act(() => api.rewind(point.seq));
                  }}
                >
                  Go back to here
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                  Keep playing
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                disabled={view?.running != null}
                onClick={() => setConfirm(point.seq)}
              >
                Rewind
              </Button>
            )}
          </li>
        ))}
      </ol>
      {(view?.branches.length ?? 0) > 1 && (
        <section aria-labelledby="lines" className="p-4">
          <h3 id="lines" className="label-caps text-fg-subtle">
            Lines of history
          </h3>
          <ul className="mt-2 flex flex-col gap-1">
            {view?.branches.map((b) => (
              <li key={b.id} className="flex items-center gap-2 text-fg-muted">
                {b.label}
                {b.current && <Badge tone="accent">Current</Badge>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
