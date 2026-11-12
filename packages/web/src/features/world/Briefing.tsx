import { Globe } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDate, useGame } from '@/lib/game';
import { Badge } from '@/ui/badge';
import { EmptyState } from '@/ui/empty-state';

const MOOD_TONE: Record<string, 'bad' | 'warn' | 'neutral' | 'good'> = {
  hostile: 'bad',
  cold: 'warn',
  divided: 'neutral',
  warm: 'good',
  loyal: 'good',
};
const STAGE_TONE = { calm: 'good', protest: 'accent', riot: 'warn', insurgency: 'bad' } as const;
const FLAGS: Record<string, string> = {
  reserves_low: 'Foreign reserves are below three months of imports.',
  borrowing_cost_surge: 'Lenders are demanding a sharply higher premium.',
};

/** The state of play on one page: the figures, the public mood, each region, and the risks. */
export function Briefing() {
  const { view, world, moment, place, setPlace } = useGame();
  if (!world) {
    return (
      <EmptyState icon={Globe} title="No campaign yet">
        The figures, the public mood and the state of each region appear here once you take office.
      </EmptyState>
    );
  }
  const inForce = (view?.policies ?? []).filter((p) => p.status === 'active').length;
  const risks = [
    ...world.flags.map((f) => FLAGS[f] ?? f),
    ...world.regions
      .filter((r) => r.status !== 'held')
      .map((r) => `Control of ${r.name} is ${r.status}.`),
    ...world.regions.filter((r) => r.stage === 'riot').map((r) => `${r.name} is rioting.`),
  ];

  return (
    <div className="h-full overflow-auto p-4">
      {moment && (
        <p className="mb-3 rounded-control border border-accent/40 bg-accent-soft px-2 py-1 text-xs text-accent">
          As things stood on {formatDate(moment.date, true)}.
        </p>
      )}
      <section aria-labelledby="b-risks">
        <h3 id="b-risks" className="label-caps text-fg-subtle">
          State of play
        </h3>
        <p className="mt-1 text-fg-muted">
          {inForce} {inForce === 1 ? 'policy' : 'policies'} in force.
        </p>
        <ul className="mt-1 flex flex-col gap-1">
          {risks.length === 0 && <li className="text-fg-muted">No crisis line is crossed.</li>}
          {risks.map((risk) => (
            <li key={risk} className="text-warn">
              {risk}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="b-economy" className="mt-5">
        <h3 id="b-economy" className="label-caps text-fg-subtle">
          Official figures
        </h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
          {world.economy.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-2 border-b border-border py-1"
            >
              <dt className="text-fg-muted">{row.label}</dt>
              <dd className="tabular text-fg">
                {row.value.toFixed(row.digits)}{' '}
                <span className="text-2xs text-fg-subtle">{row.unit}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="b-mood" className="mt-5">
        <h3 id="b-mood" className="label-caps text-fg-subtle">
          How the public stands toward you
        </h3>
        <ul className="mt-2 flex flex-col gap-1">
          {world.groups.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-2">
              <span className="text-fg-muted">{g.name}</span>
              <Badge tone={MOOD_TONE[g.mood] ?? 'neutral'}>{g.mood}</Badge>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="b-regions" className="mt-5">
        <h3 id="b-regions" className="label-caps text-fg-subtle">
          Regions
        </h3>
        <ul className="mt-2 flex flex-col gap-1">
          {world.regions.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setPlace(place === r.id ? null : r.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-control px-1 py-0.5 text-left hover:bg-raised',
                  place === r.id && 'bg-accent-soft',
                )}
              >
                <span className="text-fg-muted">{r.name}</span>
                <span className="flex items-center gap-1">
                  {r.status !== 'held' && <Badge tone="warn">{r.status}</Badge>}
                  <Badge tone={STAGE_TONE[r.stage]}>{r.stage}</Badge>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
