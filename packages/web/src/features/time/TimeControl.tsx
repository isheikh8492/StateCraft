import type { MoveSpan } from '@statecraft/protocol';
import { ArrowRight, CalendarClock, ChevronsLeft, ChevronsRight, History, Zap } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatDate, useGame } from '@/lib/game';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';

const JUMPS: { label: string; span: MoveSpan; days: number }[] = [
  { label: '1 hour later', span: { hours: 1 }, days: 0 },
  { label: '1 day later', span: { days: 1 }, days: 1 },
  { label: '1 week later', span: { days: 7 }, days: 7 },
  { label: '1 month later', span: { days: 30 }, days: 30 },
  { label: '3 months later', span: { days: 91 }, days: 91 },
  { label: '6 months later', span: { days: 183 }, days: 183 },
  { label: '1 year later', span: { days: 365 }, days: 365 },
];
const MAX_DAYS = 366;
const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const clock = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/**
 * The one control for time. The pill shows the date; the right arrow opens the ways to move
 * forward, the left arrow opens history. Moving forward sends whatever is on the desk first.
 */
export function TimeControl() {
  const { view, act, timeOpen, setTimeOpen, openWindow, moment } = useGame();
  const [until, setUntil] = useState('');
  const campaign = view?.campaign;
  if (!view || !campaign) return null;
  const busy = view.running !== null || moment !== null;
  const waiting = view.cards.filter((c) => !c.sent).length;
  const daysUntil =
    until === '' ? 0 : Math.round((Date.parse(until) - Date.parse(campaign.date)) / 86_400_000);
  const go = (span: MoveSpan) => {
    setTimeOpen(false);
    void act(() => api.move(span));
  };

  return (
    <div className="relative">
      <div className="flex items-center rounded-full border border-border bg-surface-2">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Open history"
          onClick={() => openWindow('chronicle')}
        >
          <ChevronsLeft />
        </Button>
        <time
          dateTime={campaign.date}
          data-testid="game-date"
          className="tabular px-1 text-ui font-medium whitespace-nowrap text-fg"
        >
          {formatDate(campaign.date, true)}
        </time>
        <span data-testid="game-hour" className="tabular pr-1 text-2xs text-fg-subtle">
          {clock(campaign.hour)}
        </span>
        <Button
          variant={timeOpen ? 'primary' : 'ghost'}
          size="icon"
          className="rounded-full"
          aria-label="Move time forward"
          aria-expanded={timeOpen}
          disabled={busy}
          onClick={() => setTimeOpen(!timeOpen)}
        >
          <ChevronsRight />
        </Button>
      </div>

      {timeOpen && (
        <section
          aria-label="Move time forward"
          className="absolute top-10 right-0 z-[1000] w-[360px] rounded-window border border-border bg-surface p-3 shadow-window"
        >
          <div className="flex items-start justify-between gap-2">
            <p>
              <span className="label-caps block text-fg-subtle">Now</span>
              <span className="text-lg font-semibold">{formatDate(campaign.date, true)}</span>
            </p>
            <Button
              size="sm"
              onClick={() => {
                setTimeOpen(false);
                openWindow('chronicle');
              }}
            >
              <History />
              View history
            </Button>
          </div>
          <p className="mt-1 text-xs text-fg-muted">
            {waiting > 0
              ? `Whichever you choose sends your ${waiting} ${waiting === 1 ? 'box' : 'boxes'} first.`
              : 'Nothing on your desk: this only runs the clock.'}
          </p>

          <button
            type="button"
            onClick={() => go({ untilMajor: true })}
            className="mt-3 flex w-full items-center gap-3 rounded-control border border-border bg-surface-2 p-3 text-left hover:border-accent"
          >
            <Zap className="size-5 shrink-0 text-accent" />
            <span>
              <span className="block font-semibold text-fg">To next major event</span>
              <span className="text-xs text-fg-muted">
                Runs until something happens that needs you, up to a year
              </span>
            </span>
          </button>

          <p className="label-caps mt-3 text-fg-subtle">Jump to</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {JUMPS.map((jump) => (
              <button
                key={jump.label}
                type="button"
                onClick={() => go(jump.span)}
                className="rounded-control border border-border bg-surface-2 px-3 py-2 text-left hover:border-accent"
              >
                <span className="block font-medium text-fg">{jump.label}</span>
                <span className="tabular text-2xs text-fg-subtle">
                  {jump.days === 0
                    ? clock((campaign.hour + 1) % 24)
                    : formatDate(addDays(campaign.date, jump.days))}
                </span>
              </button>
            ))}
          </div>

          <form
            className="mt-3 flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (daysUntil >= 1 && daysUntil <= MAX_DAYS) go({ days: daysUntil });
            }}
          >
            <label htmlFor="jump-date" className="flex flex-1 flex-col gap-1">
              <span className="flex items-center gap-1 text-xs text-fg-muted">
                <CalendarClock className="size-3.5" />
                Jump to a specific date
              </span>
              <Input
                id="jump-date"
                type="date"
                value={until}
                min={addDays(campaign.date, 1)}
                max={addDays(campaign.date, MAX_DAYS)}
                onChange={(event) => setUntil(event.target.value)}
              />
            </label>
            <Button
              type="submit"
              size="icon"
              className="size-8"
              aria-label="Go to that date"
              disabled={daysUntil < 1 || daysUntil > MAX_DAYS}
            >
              <ArrowRight />
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}
