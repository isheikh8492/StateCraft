import { Users } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, useGame } from '@/lib/game';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Textarea } from '@/ui/textarea';

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

/** Everyone who answers what you do. Ask any of them a question; each answers in their own voice. */
export function People() {
  const { view, act } = useGame();
  const cast = view?.cast ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const person = cast.find((c) => c.id === chosen) ?? cast[0];
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
                    'block w-full px-3 py-1 text-left text-xs hover:bg-raised',
                    c.id === person.id ? 'bg-accent-soft text-fg' : 'text-fg-muted',
                  )}
                >
                  {c.name}
                </button>
              ))}
          </div>
        ))}
      </nav>
      <section aria-label={person.name} className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border px-4 py-2">
          <h3 className="min-w-0 flex-1 truncate font-semibold">{person.name}</h3>
          <Badge tone={STANCE_TONE[person.stance] ?? 'neutral'}>{person.stance}</Badge>
        </header>
        <ol aria-label="Conversation" className="min-h-0 flex-1 overflow-auto p-4">
          {thread.length === 0 && (
            <li className="text-fg-muted">
              {person.askable
                ? 'Ask what they make of something. They answer from what they know and where they stand, and they may not tell you everything.'
                : person.unreachable}
            </li>
          )}
          {thread.map((turn) => (
            <li key={turn.id} className="mb-4">
              <p className="text-fg">
                <span className="tabular mr-2 text-2xs text-fg-subtle">
                  {formatDate(turn.date)}
                </span>
                {turn.question}
              </p>
              {turn.reply === undefined ? (
                <p className="mt-1 text-fg-subtle">Waiting for an answer…</p>
              ) : (
                <blockquote className="prose-read mt-1 border-l-2 border-accent pl-3 whitespace-pre-wrap text-fg-muted">
                  {turn.reply}
                </blockquote>
              )}
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
