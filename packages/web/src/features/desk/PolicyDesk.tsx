import { RESOLUTION_STEPS } from '@statecraft/protocol';
import { Check, FastForward, LoaderCircle, Play, Plus, SquarePen, Trash2 } from 'lucide-react';
import { type FormEvent, type KeyboardEvent, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useGame } from '@/lib/game';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Select } from '@/ui/input';
import { Textarea } from '@/ui/textarea';

const MAX_LENGTH = 2000;
const STEP_LABEL: Record<string, string> = {
  compile: 'Reading your boxes',
  adjudicate: 'Judging the period',
  apply: 'Moving the world forward',
  narrate: 'Writing the chronicle',
  report: 'Collecting ministry reports',
  commit: 'Saving',
};
const JUMPS = [
  [7, 'One week'],
  [14, 'Two weeks'],
  [30, 'One month'],
  [91, 'Three months'],
  [183, 'Six months'],
] as const;

/** Where policy is set: type what you want to do, press +, and it becomes a box. */
export function PolicyDesk() {
  const { view, act, error, clearError } = useGame();
  const [draft, setDraft] = useState('');
  const [jump, setJump] = useState(30);
  const cards = view?.cards ?? [];
  const running = view?.running ?? null;
  const blocked = running ? null : (view?.blocked ?? null);
  const question = new Map((blocked?.needsDetail ?? []).map((n) => [n.card, n.question]));
  const inConflict = new Set((blocked?.conflicts ?? []).flatMap((c) => c.cards));
  const conflictStillOpen = (blocked?.conflicts ?? []).some((c) =>
    c.cards.every((id) => cards.some((card) => card.id === id)),
  );

  const add = async () => {
    const text = draft.trim();
    if (text === '') return;
    setDraft('');
    if (!(await act(() => api.addCard(text)))) setDraft(text);
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void add();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void add();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        {view === null && <p className="p-4 text-fg-muted">Loading…</p>}
        {view !== null && cards.length === 0 && (
          <EmptyState icon={SquarePen} title="No policy boxes yet">
            Type what you want your government to do, in your own words, and press + to add it as a
            box. One idea per box works best.
          </EmptyState>
        )}
        {cards.length > 0 && (
          <ul aria-label="Policy boxes" className="flex flex-col gap-2 p-3">
            {cards.map((card) => (
              <li
                key={card.id}
                className={cn(
                  'rounded-control border bg-surface-2 p-3',
                  inConflict.has(card.id) && conflictStillOpen ? 'border-warn/60' : 'border-border',
                )}
              >
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 break-words whitespace-pre-wrap text-fg">
                    {card.text}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete policy box"
                    className="hover:text-bad"
                    disabled={running !== null}
                    onClick={() => void act(() => api.deleteCard(card.id))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <p
                  data-testid="reading"
                  className="mt-2 border-t border-border pt-2 text-xs text-fg-muted"
                >
                  {card.reading ? (
                    <>
                      <span className="label-caps mr-2 text-fg-subtle">Read as</span>
                      {card.reading.reading}
                    </>
                  ) : (
                    <span className="text-fg-subtle">Reading…</span>
                  )}
                </p>
                {(question.get(card.id) ?? card.reading?.question) && (
                  <p className="mt-1 text-xs text-warn">
                    {question.get(card.id) ?? card.reading?.question} Delete this box and add a
                    fuller one.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {blocked && conflictStillOpen && (
        <div role="alert" className="border-t border-warn/40 bg-warn-soft px-3 py-2">
          <p className="font-medium text-warn">Some boxes pull against each other</p>
          {blocked.conflicts.map((c) => (
            <p key={c.cards.join()} className="mt-1 text-xs text-fg-muted">
              {c.explanation}
            </p>
          ))}
          <div className="mt-2 flex items-center gap-2">
            <span className="flex-1 text-xs text-fg-muted">
              Delete one of the marked boxes, or send both.
            </span>
            <Button size="sm" onClick={() => void act(() => api.execute(true))}>
              Send mixed signals
            </Button>
          </div>
        </div>
      )}

      {error !== null && (
        <div
          role="alert"
          className="flex items-center gap-2 border-t border-bad/40 bg-bad-soft px-3 py-2 text-bad"
        >
          <span className="flex-1">{error}</span>
          <Button size="sm" onClick={clearError}>
            Dismiss
          </Button>
        </div>
      )}

      {running && (
        <section
          aria-label="Resolution progress"
          className="border-t border-border bg-surface-2 px-3 py-2"
        >
          <ol className="flex flex-col gap-1">
            {(running.kind === 'execute' ? RESOLUTION_STEPS : RESOLUTION_STEPS.slice(1)).map(
              (step) => {
                const done = running.done.includes(step);
                const current = running.step === step;
                return (
                  <li
                    key={step}
                    className={cn(
                      'flex items-center gap-2 text-xs',
                      done ? 'text-fg-muted' : current ? 'text-fg' : 'text-fg-subtle',
                    )}
                  >
                    {done ? (
                      <Check className="size-3.5 text-good" />
                    ) : current ? (
                      <LoaderCircle className="size-3.5 animate-spin text-accent motion-reduce:animate-none" />
                    ) : (
                      <span className="size-3.5" />
                    )}
                    {STEP_LABEL[step]}
                  </li>
                );
              },
            )}
          </ol>
          <div className="mt-2 flex items-center gap-2">
            <span className="flex-1 text-xs text-fg-subtle">
              Nothing changes until this finishes. You can keep using every window.
            </span>
            <Button size="sm" variant="danger" onClick={() => void act(() => api.cancel())}>
              Cancel
            </Button>
          </div>
        </section>
      )}

      <form
        onSubmit={onSubmit}
        className="flex items-end gap-2 border-t border-border bg-surface-2 p-3"
      >
        <label htmlFor="policy-composer" className="flex-1">
          <span className="sr-only">New policy box</span>
          <Textarea
            id="policy-composer"
            rows={2}
            value={draft}
            maxLength={MAX_LENGTH}
            placeholder="What do you want to do next?"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </label>
        <Button
          type="submit"
          variant="primary"
          size="icon"
          className="size-8"
          aria-label="Add policy box"
          disabled={draft.trim() === '' || view?.campaign == null}
        >
          <Plus />
        </Button>
      </form>

      <div className="flex items-center gap-2 border-t border-border bg-surface px-3 py-2">
        <Button
          variant="primary"
          disabled={cards.length === 0 || running !== null}
          onClick={() => void act(() => api.execute(false))}
        >
          <Play />
          Execute{' '}
          {cards.length > 0 ? `${cards.length} ${cards.length === 1 ? 'box' : 'boxes'}` : ''}
        </Button>
        <div className="flex-1" />
        <label htmlFor="jump" className="sr-only">
          How far to advance
        </label>
        <Select id="jump" value={jump} onChange={(event) => setJump(Number(event.target.value))}>
          {JUMPS.map(([days, label]) => (
            <option key={days} value={days}>
              {label}
            </option>
          ))}
        </Select>
        <Button
          disabled={running !== null || view?.campaign == null}
          onClick={() => void act(() => api.advance(jump))}
        >
          <FastForward />
          Advance
        </Button>
      </div>
    </div>
  );
}
