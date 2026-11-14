import type { ChronicleEntry, StoryView, View } from '@statecraft/protocol';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  History,
  ScrollText,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, useDraft, useGame } from '@/lib/game';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Prose } from '@/ui/prose';
import { ArrivingReactions } from './Arriving';

/** How many events fill a page before the next one starts. */
const PER_PAGE = 10;

/**
 * What happened, one card to an event, oldest first, in pages. It opens on the latest page
 * and stays there as things happen; the arrows go back through everything before.
 */
export function Chronicle() {
  const { view, moment, lookAt } = useGame();
  // The figures published at dawn are left out: the numbers show elsewhere. Notices about
  // your own orders stay, as short cards.
  const entries = [...(view?.chronicle ?? [])]
    .filter((e) => !(e.routine && e.story.id === 'economy'))
    .sort((a, b) => a.day - b.day || (a.hour ?? 0) - (b.hour ?? 0));
  const pages = Math.max(1, Math.ceil(entries.length / PER_PAGE));
  // Null follows the latest page; a number holds a page you went back to.
  const [chosen, setChosen] = useState<number | null>(null);
  const page = chosen === null ? pages : Math.min(chosen, pages);
  const shown = entries.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const latest = page === pages;
  const scroller = useRef<HTMLDivElement>(null);

  // On the latest page, a new event scrolls into view; turning a page starts at its top.
  const count = entries.length;
  useEffect(() => {
    if (latest && count > 0) scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [latest, count]);
  useEffect(() => {
    if (!latest) scroller.current?.scrollTo({ top: 0 });
  }, [latest]);

  // A card asked for from the stories strip: its page is turned to and it is brought into
  // view, marked until another is asked for or the page is turned.
  const [marked, setMarked] = useState<string | null>(null);
  useEffect(() => {
    if (!marked) return;
    scroller.current
      ?.querySelector(`[data-entry="${CSS.escape(marked)}"]`)
      ?.scrollIntoView({ block: 'center' });
  }, [marked]);
  const show = (id: string) => {
    const at = entries.findIndex((e) => e.id === id);
    if (at < 0) return;
    const target = Math.floor(at / PER_PAGE) + 1;
    setChosen(target >= pages ? null : target);
    // Cleared first, so that asking for the same card again brings it back into view.
    setMarked(null);
    requestAnimationFrame(() => setMarked(id));
  };

  if ((view?.turns ?? []).length === 0) {
    return (
      <EmptyState icon={ScrollText} title="Nothing has happened yet">
        Write an order and press play on the policy desk. What happens appears here, as it happens.
      </EmptyState>
    );
  }
  const go = (n: number) => {
    setMarked(null);
    setChosen(n >= pages ? null : Math.max(1, n));
  };
  // The moment to look back at: the turn of the last event on this page.
  const turn = shown.at(-1)?.turn;
  const looking = turn !== undefined && moment?.turn === turn;
  return (
    <div className="flex h-full flex-col">
      <p className="border-b border-border px-4 py-1.5 text-2xs text-fg-subtle">
        Everything here is simulated by the game: none of it is a real report or a real statement.
      </p>
      <Stories stories={view?.stories ?? []} onShow={show} />
      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {shown.length === 0 && (
          <p className="px-1 py-2 text-fg-muted">Nothing of note has happened yet.</p>
        )}
        <ol aria-label="Chronicle" className="space-y-3">
          {shown.map((entry) => (
            <Entry key={entry.id} entry={entry} marked={entry.id === marked} />
          ))}
        </ol>
        {latest && (view?.arriving.writing.length ?? 0) > 0 && (
          <section
            aria-label="Reactions coming in"
            className="rounded-window border border-border bg-surface-2 px-4 py-3"
          >
            <p className="label-caps mb-2 text-accent">Coming in now</p>
            <ArrivingReactions />
          </section>
        )}
        {latest && (view?.arriving.later ?? 0) > 0 && !view?.arriving.reactions && (
          <p role="status" className="px-1 text-2xs text-fg-muted">
            {view?.arriving.later} more{' '}
            {view?.arriving.later === 1 ? 'response is' : 'responses are'} expected in the coming
            hours
          </p>
        )}
      </div>
      <nav
        aria-label="Chronicle pages"
        className="flex items-center gap-1 border-t border-border px-2 py-1"
      >
        <Button
          size="icon"
          variant="ghost"
          aria-label="Earlier page"
          disabled={page <= 1}
          onClick={() => go(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="tabular text-xs text-fg-muted" aria-live="polite">
          {page} / {pages}
        </span>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Later page"
          disabled={latest}
          onClick={() => go(page + 1)}
        >
          <ChevronRight />
        </Button>
        {turn !== undefined && (
          <Button
            size="icon"
            variant={looking ? 'primary' : 'ghost'}
            aria-label={looking ? 'Return to the present' : 'See the world at this point'}
            title={looking ? 'Return to the present' : 'See the world as it was at this page'}
            onClick={() => lookAt(looking ? null : turn)}
          >
            <History />
          </Button>
        )}
        <div className="flex-1" />
        {view?.arriving.reactions && (
          <span role="status" className="text-2xs text-accent">
            Reactions are coming in…
          </span>
        )}
        <Button
          size="icon"
          variant="ghost"
          aria-label="Export"
          title="Save the chronicle as a file"
          onClick={() => exportChronicle(view)}
        >
          <Download />
        </Button>
      </nav>
    </div>
  );
}

/** The time of day an entry happened at, to follow its date; nothing for older entries. */
const when = (hour: number | undefined) =>
  hour === undefined ? '' : `, ${String(hour).padStart(2, '0')}:00`;

/** What each stage of a story is called, by how many developments it has had. */
const STAGES = ['Just begun', 'Stirring', 'Building'] as const;

/**
 * The stories still running in the background: one line when closed, a row to a story when
 * open. Choosing a row brings that story's latest card into view.
 */
function Stories({ stories, onShow }: { stories: StoryView[]; onShow: (card: string) => void }) {
  const [open, setOpen] = useState(false);
  if (stories.length === 0) return null;
  return (
    <section aria-label="Stories" className="border-b border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-4 py-1.5 text-left text-xs text-fg-muted hover:text-fg"
      >
        <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} />
        {stories.length} {stories.length === 1 ? 'story' : 'stories'} running
      </button>
      {open && (
        <ul className="px-2 pb-2">
          {stories.map((story) => (
            <li key={story.id}>
              <button
                type="button"
                onClick={() => onShow(story.card)}
                title="Show its latest card"
                className="flex w-full items-center gap-2 rounded-control px-2 py-1 text-left text-xs hover:bg-raised"
              >
                <span className="min-w-0 flex-1 truncate text-fg">
                  {story.by ? `${story.by}: ${story.title}` : story.title}
                </span>
                {story.place && <span className="shrink-0 text-fg-subtle">{story.place}</span>}
                {/* Three dots: stirring, building, coming to a head. */}
                <span
                  role="img"
                  aria-label={STAGES[story.stage] ?? 'Building'}
                  title={STAGES[story.stage] ?? 'Building'}
                  className="flex shrink-0 items-center gap-0.5"
                >
                  {[1, 2, 3].map((dot) => (
                    <span
                      key={dot}
                      className={cn(
                        'size-1.5 rounded-full',
                        dot <= story.stage ? 'bg-accent' : 'bg-border-strong',
                      )}
                    />
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Entry({ entry, marked = false }: { entry: ChronicleEntry; marked?: boolean }) {
  const { view, act, place } = useGame();
  const writing = view?.arriving.entries.includes(entry.id) ?? false;
  const draft = useDraft(entry.id);
  const body = entry.full ?? draft;

  return (
    <li
      data-entry={entry.id}
      className={cn(
        'rounded-window border border-border bg-surface px-4 py-3',
        entry.place && entry.place === place && 'border-accent',
        marked && 'border-accent ring-1 ring-accent',
      )}
    >
      <time
        dateTime={entry.date}
        className="tabular inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-2xs font-medium text-accent"
      >
        <Clock className="size-3" />
        {formatDate(entry.date)}
        {when(entry.hour)}
      </time>
      <h3 className="mt-2 font-semibold text-fg">{entry.headline}</h3>
      {entry.speaker && (
        <blockquote data-testid="quote" className="prose-read mt-1 text-accent">
          {entry.quote}
        </blockquote>
      )}
      {body !== undefined && body !== '' && (
        <div
          data-testid={entry.full !== undefined ? 'full-account' : undefined}
          aria-busy={entry.full === undefined}
          className="prose-read mt-2 max-w-[100ch] text-fg"
        >
          <Prose text={body} />
          {entry.full === undefined && (
            <span aria-hidden="true" className="animate-pulse text-accent">
              ▍
            </span>
          )}
        </div>
      )}
      {entry.full === undefined && !draft && !entry.routine && (
        <button
          type="button"
          disabled={writing}
          className="mt-1 text-2xs text-fg-subtle hover:text-accent disabled:cursor-default"
          onClick={() => void act(() => api.expandEntry(entry.id))}
        >
          {writing ? 'Writing…' : 'Read the full account'}
        </button>
      )}
    </li>
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
