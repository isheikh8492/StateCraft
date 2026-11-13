import { useDraft, useGame } from '@/lib/game';
import { Writing } from '@/ui/writing';

function Answer({ id, actorName }: { id: string; actorName: string }) {
  const draft = useDraft(id);
  return (
    <li>
      <p className="text-xs font-medium text-fg">{actorName}</p>
      <blockquote className="prose-read mt-1 border-l-2 border-accent pl-3 font-serif text-fg-muted">
        {draft ? <Writing text={draft} /> : <span className="text-fg-subtle">Yet to answer…</span>}
      </blockquote>
    </li>
  );
}

/**
 * The cast's answers to your last move, shown as they are written rather than when the last
 * of them is finished. Give a policy id to show only the answers to that order.
 */
export function ArrivingReactions({ policy }: { policy?: string }) {
  const { view } = useGame();
  const writing = (view?.arriving.writing ?? []).filter(
    (w) => policy === undefined || w.policy === policy,
  );
  if (writing.length === 0) return null;
  return (
    <ul aria-label="Answers being written" className="flex flex-col gap-3">
      {writing.map((w) => (
        <Answer key={w.id} id={w.id} actorName={w.actorName} />
      ))}
    </ul>
  );
}
