import type { ScenarioInfo } from '@statecraft/protocol';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useGame } from '@/lib/game';
import { Button } from '@/ui/button';

/** The first screen of a new campaign: pick a starting world and take office. */
export function StartScreen() {
  const { act } = useGame();
  const [scenarios, setScenarios] = useState<ScenarioInfo[] | null>(null);
  useEffect(() => {
    api.scenarios().then(setScenarios, () => setScenarios([]));
  }, []);

  return (
    <div className="absolute inset-0 flex items-start justify-center overflow-auto p-6">
      <section
        aria-labelledby="start-title"
        className="w-full max-w-[640px] rounded-window border border-border bg-surface p-6 shadow-window"
      >
        <p className="label-caps text-accent">New campaign</p>
        <h2 id="start-title" className="mt-1 text-xl font-semibold">
          Choose where to begin
        </h2>
        {scenarios === null && <p className="mt-4 text-fg-muted">Loading…</p>}
        {scenarios?.map((s) => (
          <article
            key={s.id}
            className="mt-4 rounded-control border border-border bg-surface-2 p-4"
          >
            <h3 className="text-lg font-semibold">{s.title}</h3>
            <p className="mt-1 text-fg-muted">
              You take office as {s.office}, in place of {s.holder}.
            </p>
            <p className="prose-read mt-3 text-fg-muted">{s.brief}</p>
            <Button
              variant="primary"
              className="mt-4"
              onClick={() => void act(() => api.start(s.id))}
            >
              Take office
            </Button>
          </article>
        ))}
        <p className="mt-4 text-xs text-fg-subtle">
          Real names appear in a fictional simulation. Every report and quote in the game is
          generated.
        </p>
      </section>
    </div>
  );
}
