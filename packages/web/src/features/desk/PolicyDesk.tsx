import type { PolicyCard } from '@statecraft/protocol';
import { Plus, SquarePen, Trash2 } from 'lucide-react';
import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Textarea } from '@/ui/textarea';

const MAX_LENGTH = 2000;
const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

interface PolicyDeskProps {
  /** Called after a box is added or removed, so other parts of the screen can refresh. */
  onChanged?: () => void;
}

/** Where policy is set: type what you want to do, press +, and it becomes a box. */
export function PolicyDesk({ onChanged }: PolicyDeskProps) {
  const [cards, setCards] = useState<PolicyCard[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCards(await api.listCards());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your policy boxes.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const text = draft.trim();
    if (text === '' || busy) return;
    setBusy(true);
    try {
      const card = await api.addCard(text);
      setCards((current) => [...(current ?? []), card]);
      setDraft('');
      setError(null);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the policy box.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteCard(id);
      setCards((current) => (current ?? []).filter((card) => card.id !== id));
      setError(null);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the policy box.');
    }
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
        {cards === null && error === null && <p className="p-4 text-fg-muted">Loading…</p>}
        {cards !== null && cards.length === 0 && (
          <EmptyState icon={SquarePen} title="No policy boxes yet">
            Type what you want your government to do, in your own words, and press + to add it as a
            box. One idea per box works best.
          </EmptyState>
        )}
        {cards !== null && cards.length > 0 && (
          <ul aria-label="Policy boxes" className="flex flex-col gap-2 p-3">
            {cards.map((card) => (
              <li
                key={card.id}
                className="group rounded-control border border-border bg-surface-2 p-3"
              >
                <p className="break-words whitespace-pre-wrap text-fg">{card.text}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge>{card.source}</Badge>
                  <time dateTime={card.createdAt} className="tabular text-2xs text-fg-subtle">
                    {clock.format(new Date(card.createdAt))}
                  </time>
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete policy box"
                    className="hover:text-bad"
                    onClick={() => void remove(card.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error !== null && (
        <div
          role="alert"
          className="flex items-center gap-2 border-t border-bad/40 bg-bad-soft px-3 py-2 text-bad"
        >
          <span className="flex-1">{error}</span>
          <Button size="sm" onClick={() => void load()}>
            Try again
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
          disabled={draft.trim() === '' || busy}
        >
          <Plus />
        </Button>
      </form>
    </div>
  );
}
