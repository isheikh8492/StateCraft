import { type CardView, RESOLUTION_STEPS } from '@statecraft/protocol';
import {
  ArrowDown,
  ArrowUp,
  Check,
  LoaderCircle,
  Pencil,
  Pin,
  Play,
  Plus,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { type FormEvent, type KeyboardEvent, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useGame } from '@/lib/game';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Textarea } from '@/ui/textarea';

const MAX_LENGTH = 2000;
const STEP_LABEL: Record<string, string> = {
  compile: 'Reading your boxes',
  adjudicate: 'Judging the period',
  apply: 'Moving the world forward',
  commit: 'Saving',
};

/** Where policy is set: type what you want to do, press +, and it becomes a box. */
export function PolicyDesk() {
  const { view, act, error, clearError, moment, lookAt } = useGame();
  const [draft, setDraft] = useState('');
  const cards = view?.cards ?? [];
  const fresh = cards.filter((c) => !c.sent).length;
  const running = view?.running ?? null;
  const blocked = running ? null : (view?.blocked ?? null);
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
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
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
            {cards.map((card, index) => (
              <li
                key={card.id}
                className={cn(
                  'rounded-control border bg-surface-2 p-3',
                  inConflict.has(card.id) && conflictStillOpen ? 'border-warn/60' : 'border-border',
                )}
              >
                <BoxHead
                  card={card}
                  locked={running !== null}
                  previous={cards[index - 1]?.id}
                  afterNext={index < cards.length - 1 ? (cards[index + 2]?.id ?? null) : undefined}
                />
                {card.advice?.map((a) => (
                  <p
                    key={a.text}
                    data-testid="advice"
                    className="mt-2 border-t border-border pt-2 text-xs text-fg-muted"
                  >
                    <span className="label-caps mr-2 text-fg-subtle">{a.from}</span>
                    {a.text}
                  </p>
                ))}
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
            <Button size="sm" onClick={() => void act(() => api.move({ days: 7 }, true))}>
              Send both anyway
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

      {moment && (
        <div
          role="status"
          className="flex items-center gap-2 border-t border-accent/40 bg-accent-soft px-3 py-2 text-accent"
        >
          <span className="flex-1 text-xs">
            You are looking at the past. Orders can only be given in the present.
          </span>
          <Button size="sm" onClick={() => lookAt(null)}>
            Return to the present
          </Button>
        </div>
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
          disabled={draft.trim() === '' || view?.campaign == null || moment !== null}
        >
          <Plus />
        </Button>
      </form>

      {/* One press: whatever is on the desk goes out, and the clock runs to the next thing
          that needs you. It moves in hours and never past the next morning. To skip further
          ahead on purpose, the date control at the top is the place. */}
      <div className="flex items-center gap-2 border-t border-border bg-surface px-3 py-2">
        <p
          role="status"
          aria-label="Why the clock stopped"
          className="min-w-0 flex-1 text-xs text-fg-muted"
        >
          {view?.stoppedFor ? (
            <>
              <span className="label-caps mr-2 text-fg-subtle">
                {String(view.campaign?.hour ?? 0).padStart(2, '0')}:00
              </span>
              <span className="text-fg">{view.stoppedFor}</span>
            </>
          ) : fresh > 0 ? (
            `${fresh} ${fresh === 1 ? 'box' : 'boxes'} to send.`
          ) : (
            'Nothing to send. Play runs the clock to the next thing that needs you.'
          )}
        </p>
        <Button
          variant="primary"
          size="icon"
          className="size-9 shrink-0 rounded-full"
          aria-label={
            fresh > 0
              ? `Send ${fresh} ${fresh === 1 ? 'box' : 'boxes'} and run to the next thing`
              : 'Run to the next thing'
          }
          title={
            fresh > 0
              ? `Send ${fresh} ${fresh === 1 ? 'box' : 'boxes'}, then run to the next thing that needs you`
              : 'Run to the next thing that needs you'
          }
          disabled={running !== null || view?.campaign == null || moment !== null}
          onClick={() => void act(() => api.move({ next: true }))}
        >
          <Play />
        </Button>
      </div>
    </div>
  );
}

interface BoxHeadProps {
  card: CardView;
  locked: boolean;
  /** The box above, to move before; undefined at the top. */
  previous: string | undefined;
  /** The box to land before when moving down (null for the end); undefined at the bottom. */
  afterNext: string | null | undefined;
}

/** A box's own words with its controls: edit in place, move, pin as standing, delete. */
function BoxHead({ card, locked, previous, afterNext }: BoxHeadProps) {
  const { act } = useGame();
  const [draft, setDraft] = useState<string | null>(null);
  const save = async () => {
    const text = (draft ?? '').trim();
    if (text !== '' && text !== card.text) await act(() => api.patchCard(card.id, { text }));
    setDraft(null);
  };

  if (draft !== null) {
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label htmlFor={`edit-${card.id}`} className="sr-only">
          Edit policy box
        </label>
        <Textarea
          id={`edit-${card.id}`}
          rows={3}
          value={draft}
          maxLength={MAX_LENGTH}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm" variant="primary" disabled={draft.trim() === ''}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }
  return (
    <>
      <p className="break-words whitespace-pre-wrap text-fg">{card.text}</p>
      <div className="mt-1 flex items-center gap-0.5">
        {card.pinned && (
          <span className="label-caps mr-1 text-accent">
            {card.sent ? 'Standing · in force' : 'Standing'}
          </span>
        )}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Move policy box up"
          disabled={locked || previous === undefined}
          onClick={() => void act(() => api.patchCard(card.id, { beforeId: previous ?? null }))}
        >
          <ArrowUp />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Move policy box down"
          disabled={locked || afterNext === undefined}
          onClick={() => void act(() => api.patchCard(card.id, { beforeId: afterNext ?? null }))}
        >
          <ArrowDown />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={card.pinned ? 'Unpin policy box' : 'Pin policy box as standing'}
          aria-pressed={card.pinned === true}
          title="A pinned box stays on your desk as a standing instruction after it is executed."
          className={card.pinned ? 'text-accent' : undefined}
          disabled={locked}
          onClick={() => void act(() => api.patchCard(card.id, { pinned: !card.pinned }))}
        >
          <Pin />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Edit policy box"
          disabled={locked}
          onClick={() => setDraft(card.text)}
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete policy box"
          className="hover:text-bad"
          disabled={locked}
          onClick={() => void act(() => api.deleteCard(card.id))}
        >
          <Trash2 />
        </Button>
      </div>
    </>
  );
}
