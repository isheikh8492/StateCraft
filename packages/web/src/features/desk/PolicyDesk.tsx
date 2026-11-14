import { type CardView, RESOLUTION_STEPS } from '@statecraft/protocol';
import { Check, LoaderCircle, Pin, Play, Plus, X } from 'lucide-react';
import { type FormEvent, type KeyboardEvent, useLayoutEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useGame } from '@/lib/game';
import { Button } from '@/ui/button';

const MAX_LENGTH = 2000;
const STEP_LABEL: Record<string, string> = {
  compile: 'Reading your boxes',
  adjudicate: 'Judging the period',
  apply: 'Moving the world forward',
  commit: 'Saving',
};

/** A text box that grows with what is typed, up to a few lines. */
function useGrow(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 160)}px`;
  }, [value]);
  return ref;
}

/**
 * Where policy is set. One line to type an action into; each action becomes a numbered
 * row of this turn's plan; the button at the end of the line sends the plan and runs the
 * clock to the next thing that needs you.
 */
export function PolicyDesk() {
  const { view, act, error, clearError, moment, lookAt } = useGame();
  const [draft, setDraft] = useState('');
  const grow = useGrow(draft);
  const cards = view?.cards ?? [];
  const fresh = cards.filter((c) => !c.sent).length;
  const running = view?.running ?? null;
  const blocked = running ? null : (view?.blocked ?? null);
  const inConflict = new Set((blocked?.conflicts ?? []).flatMap((c) => c.cards));
  const conflictStillOpen = (blocked?.conflicts ?? []).some((c) =>
    c.cards.every((id) => cards.some((card) => card.id === id)),
  );
  const closed = view?.campaign == null || moment !== null;

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
  const send = fresh > 0 ? `Send ${fresh} ${fresh === 1 ? 'box' : 'boxes'}` : '';

  return (
    <div className="flex h-full min-w-0 flex-col justify-end overflow-hidden">
      {view === null && <p className="p-4 text-fg-muted">Loading…</p>}
      {cards.length > 0 && (
        <section aria-label="This turn's plan" className="min-h-0 overflow-auto px-3 pt-3">
          <p className="label-caps mb-1.5 text-fg-subtle">This turn's plan · {cards.length}</p>
          <ol aria-label="Policy boxes" className="flex flex-col gap-1.5">
            {cards.map((card, index) => (
              <Row
                key={card.id}
                card={card}
                number={index + 1}
                locked={running !== null}
                conflict={inConflict.has(card.id) && conflictStillOpen}
              />
            ))}
          </ol>
        </section>
      )}

      {blocked && conflictStillOpen && (
        <div role="alert" className="mx-3 mt-2 rounded-control bg-warn-soft px-3 py-2">
          <p className="font-medium text-warn">Some boxes pull against each other</p>
          {blocked.conflicts.map((c) => (
            <p key={c.cards.join()} className="mt-1 text-xs text-fg-muted">
              {c.explanation}
            </p>
          ))}
          <div className="mt-2 flex items-center gap-2">
            <span className="flex-1 text-xs text-fg-muted">
              Remove one of the marked boxes, or send both.
            </span>
            <Button size="sm" onClick={() => void act(() => api.move({ days: 7 }, true))}>
              Send both anyway
            </Button>
          </div>
        </div>
      )}

      {error !== null && (
        <div
          role="alert"
          className="mx-3 mt-2 flex items-center gap-2 rounded-control bg-bad-soft px-3 py-2 text-bad"
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
          className="mx-3 mt-2 rounded-control bg-surface-2 px-3 py-2"
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

      {moment && (
        <div
          role="status"
          className="mx-3 mt-2 flex items-center gap-2 rounded-control bg-accent-soft px-3 py-2 text-accent"
        >
          <span className="flex-1 text-xs">
            You are looking at the past. Orders can only be given in the present.
          </span>
          <Button size="sm" onClick={() => lookAt(null)}>
            Return to the present
          </Button>
        </div>
      )}

      <form onSubmit={onSubmit} className="flex items-end gap-2 p-3">
        <label htmlFor="policy-composer" className="sr-only">
          New policy box
        </label>
        <div className="flex min-w-0 flex-1 items-end rounded-2xl border border-border bg-bg pr-1 focus-within:border-accent hover:border-border-strong">
          <textarea
            id="policy-composer"
            ref={grow}
            rows={1}
            value={draft}
            maxLength={MAX_LENGTH}
            placeholder="Add an action for this turn…"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 resize-none bg-transparent px-3.5 py-2.5 text-ui text-fg placeholder:text-fg-subtle focus-visible:outline-none"
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="mb-1.5 rounded-full"
            aria-label="Add policy box"
            disabled={draft.trim() === '' || closed}
          >
            <Plus />
          </Button>
        </div>
        {/* One press: whatever is in the plan goes out, and the clock runs to the next thing
            that needs you, in hours and never past the next morning. To skip further ahead on
            purpose, the date control at the top is the place. */}
        <Button
          variant="primary"
          className={cn('h-10 shrink-0 rounded-full', fresh > 0 ? 'px-4' : 'w-10 px-0')}
          aria-label={send ? `${send} and run to the next thing` : 'Run to the next thing'}
          title={
            send
              ? `${send}, then run to the next thing that needs you`
              : 'Run to the next thing that needs you'
          }
          disabled={running !== null || closed}
          onClick={() => void act(() => api.move({ next: true }))}
        >
          {fresh > 0 ? 'Send' : <Play />}
        </Button>
      </form>
    </div>
  );
}

interface RowProps {
  card: CardView;
  number: number;
  locked: boolean;
  conflict: boolean;
}

/** One action in the plan: its number, its words (click to edit), and a cross to remove it. */
function Row({ card, number, locked, conflict }: RowProps) {
  const { act } = useGame();
  const [draft, setDraft] = useState<string | null>(null);
  const grow = useGrow(draft ?? '');
  const save = async () => {
    const text = (draft ?? '').trim();
    setDraft(null);
    if (text !== '' && text !== card.text) await act(() => api.patchCard(card.id, { text }));
  };

  return (
    <li className="group">
      <div className="flex items-start gap-2">
        <span className="tabular mt-2 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-2xs text-fg-muted">
          {number}
        </span>
        <div
          className={cn(
            'min-w-0 flex-1 rounded-control border bg-surface-2',
            conflict ? 'border-warn/60' : 'border-border',
          )}
        >
          {draft !== null ? (
            <>
              <label htmlFor={`edit-${card.id}`} className="sr-only">
                Edit policy box
              </label>
              <textarea
                id={`edit-${card.id}`}
                ref={grow}
                rows={1}
                value={draft}
                maxLength={MAX_LENGTH}
                // biome-ignore lint/a11y/noAutofocus: opened by a click on the words to edit them.
                autoFocus
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => void save()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void save();
                  }
                  if (event.key === 'Escape') setDraft(null);
                }}
                className="block w-full resize-none bg-transparent px-2.5 py-1.5 text-ui text-fg focus-visible:outline-none"
              />
            </>
          ) : (
            <button
              type="button"
              aria-label="Edit policy box"
              title="Click to edit"
              disabled={locked}
              onClick={() => setDraft(card.text)}
              className="block w-full px-2.5 py-1.5 text-left break-words whitespace-pre-wrap text-fg disabled:cursor-default"
            >
              {card.text}
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={card.pinned ? 'Unpin policy box' : 'Pin policy box as standing'}
          aria-pressed={card.pinned === true}
          title="A pinned box stays on your desk as a standing instruction after it is executed."
          className={cn(
            'mt-0.5',
            card.pinned
              ? 'text-accent'
              : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          )}
          disabled={locked}
          onClick={() => void act(() => api.patchCard(card.id, { pinned: !card.pinned }))}
        >
          <Pin />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete policy box"
          className="mt-0.5 hover:text-bad"
          disabled={locked}
          onClick={() => void act(() => api.deleteCard(card.id))}
        >
          <X />
        </Button>
      </div>
      {card.pinned && (
        <p className="label-caps ml-7 mt-0.5 text-accent">
          {card.sent ? 'Standing · in force' : 'Standing'}
        </p>
      )}
    </li>
  );
}
