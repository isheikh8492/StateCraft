import { Users } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, useDraft, useGame } from '@/lib/game';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Textarea } from '@/ui/textarea';
import { Writing } from '@/ui/writing';

const KIND_LABEL: Record<string, string> = {
  advisor: 'Your office',
  military: 'Security',
  militant: 'Armed groups',
  ally: 'Coalition',
  opposition: 'Opposition',
  religious: 'Religious parties',
  business: 'Business',
  lender: 'Lenders',
  province: 'Provinces',
  foreign: 'Abroad',
};
const STANCE_TONE: Record<string, 'bad' | 'warn' | 'neutral' | 'good'> = {
  hostile: 'bad',
  wary: 'warn',
  watchful: 'neutral',
  'on your side': 'good',
};

/** An answer: the words so far while it is being written, then the finished text. */
function Reply({ id, reply }: { id: string; reply: string | undefined }) {
  const draft = useDraft(id);
  if (reply === undefined && !draft)
    return <p className="mt-1 text-fg-subtle">Waiting for an answer…</p>;
  return (
    <blockquote className="prose-read mt-1 max-w-none border-l-2 border-accent pl-3 whitespace-pre-wrap text-fg-muted">
      {reply ?? <Writing text={draft ?? ''} />}
    </blockquote>
  );
}

/** Orders an adviser drafted: each can be put on the desk as written, to edit or send. */
function DraftOrders({ orders }: { orders: string[] }) {
  const { act, openWindow } = useGame();
  const [added, setAdded] = useState<string[]>([]);
  return (
    <ul aria-label="Draft orders" className="mt-2 flex flex-col gap-1.5">
      {orders.map((order) => (
        <li
          key={order}
          className="flex items-start gap-2 rounded-control border border-border bg-surface-2 px-2 py-1.5"
        >
          <span className="min-w-0 flex-1 text-xs text-fg">{order}</span>
          <Button
            size="sm"
            disabled={added.includes(order)}
            onClick={() =>
              void act(() => api.addCard(order)).then((ok) => {
                if (!ok) return;
                setAdded((all) => [...all, order]);
                openWindow('desk');
              })
            }
          >
            {added.includes(order) ? 'On your desk' : 'Put on desk'}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Everyone who answers what you do. Ask any of them a question; each answers in their own voice. */
export function People() {
  const { view, act } = useGame();
  const cast = view?.cast ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const person = cast.find((c) => c.id === chosen) ?? cast[0];
  const unread = person?.unread ?? 0;
  const personId = person?.id;
  useEffect(() => {
    if (unread > 0 && personId) void api.markRead(personId);
  }, [unread, personId]);
  if (!person) {
    return (
      <EmptyState icon={Users} title="Nobody here yet">
        Once you take office, the people and bodies who answer your decisions are listed here, and
        you can put questions to them.
      </EmptyState>
    );
  }
  const thread = view?.talks[person.id] ?? [];
  const kinds = [...new Set(cast.map((c) => c.kind))];
  const send = (event: FormEvent) => {
    event.preventDefault();
    const question = draft.trim();
    if (question === '') return;
    setDraft('');
    void act(() => api.ask(person.id, question));
  };

  return (
    <div className="flex h-full min-h-0">
      <nav aria-label="People" className="w-52 shrink-0 overflow-auto border-r border-border py-2">
        {kinds.map((kind) => (
          <div key={kind} className="mb-2">
            <p className="label-caps px-3 py-1 text-fg-subtle">{KIND_LABEL[kind] ?? kind}</p>
            {cast
              .filter((c) => c.kind === kind)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-current={c.id === person.id}
                  onClick={() => setChosen(c.id)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1 text-left text-xs hover:bg-raised',
                    c.id === person.id ? 'bg-accent-soft text-fg' : 'text-fg-muted',
                  )}
                >
                  <span className="min-w-0 flex-1">{c.name}</span>
                  {c.unread > 0 && <Badge tone="accent">{c.unread} new</Badge>}
                </button>
              ))}
          </div>
        ))}
      </nav>
      <section aria-label={person.name} className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border px-4 py-2">
          <h3 className="min-w-0 flex-1 truncate font-semibold">{person.name}</h3>
          {person.trend !== 'steady' && (
            <span className={cn('text-2xs', person.trend === 'warming' ? 'text-good' : 'text-bad')}>
              {person.trend}
            </span>
          )}
          <Badge tone={STANCE_TONE[person.stance] ?? 'neutral'}>{person.stance}</Badge>
        </header>
        {person.undertakings.length > 0 && (
          <ul
            aria-label="What you have undertaken"
            className="border-b border-border bg-surface-2 px-4 py-2 text-xs"
          >
            {person.undertakings.map((u) => (
              <li key={u.text} className="flex items-baseline gap-2 text-fg-muted">
                <Badge tone={u.state === 'kept' ? 'good' : u.state === 'broken' ? 'bad' : 'warn'}>
                  {u.state === 'open' ? `due by ${formatDate(u.by)}` : u.state}
                </Badge>
                <span className="min-w-0 flex-1">You said: {u.text}</span>
              </li>
            ))}
          </ul>
        )}
        <ol aria-label="Conversation" className="min-h-0 flex-1 overflow-auto p-4">
          {thread.length === 0 && (
            <li className="text-fg-muted">
              {person.askable
                ? 'Ask what they make of something, or put something on the table. An undertaking you give is remembered and you will be held to it.'
                : person.unreachable}
            </li>
          )}
          {thread.map((turn) => (
            <li key={turn.id} className="mb-4">
              <p className="text-fg">
                <span className="tabular mr-2 text-2xs text-fg-subtle">
                  {formatDate(turn.date)}
                </span>
                {turn.incoming ? (
                  <span className="label-caps text-accent">They wrote to you</span>
                ) : (
                  turn.question
                )}
              </p>
              <Reply id={turn.id} reply={turn.reply} />
              {turn.orders && turn.orders.length > 0 && <DraftOrders orders={turn.orders} />}
            </li>
          ))}
        </ol>
        {person.askable && (
          <form
            onSubmit={send}
            className="flex items-end gap-2 border-t border-border bg-surface-2 p-3"
          >
            <label htmlFor="ask" className="flex-1">
              <span className="sr-only">Your question</span>
              <Textarea
                id="ask"
                rows={2}
                value={draft}
                maxLength={1000}
                placeholder={`Ask ${person.name.replace(/^The /, 'the ')}…`}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
            <Button type="submit" variant="primary" disabled={draft.trim() === ''}>
              Ask
            </Button>
          </form>
        )}
        <p className="border-t border-border px-4 py-1 text-2xs text-fg-subtle">
          Simulated. Nothing said here is a real statement by a real person or body.
        </p>
      </section>
    </div>
  );
}
