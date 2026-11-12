import type { PolicyView } from '@statecraft/protocol';
import { ArrowLeft, Landmark } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, useGame } from '@/lib/game';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';

const STAGES = ['announced', 'enacted', 'implemented', 'felt'] as const;
const STATUS_TONE = { active: 'good', blocked: 'bad', repealed: 'neutral' } as const;

/** The policy ledger: everything you have ordered, and a page for each built from the record. */
export function Policies() {
  const { view, policy, openPolicy } = useGame();
  const policies = view?.policies ?? [];
  const open = policies.find((p) => p.id === policy);
  if (open) return <PolicyPage policy={open} onBack={() => openPolicy(null)} />;
  if (policies.length === 0) {
    return (
      <EmptyState icon={Landmark} title="No policies yet">
        When you execute your boxes they become policies. Each gets a page here showing what you
        ordered and what it did.
      </EmptyState>
    );
  }
  return (
    <ul aria-label="Policies" className="h-full overflow-auto">
      {policies.map((p) => (
        <li key={p.id} className="border-b border-border">
          <button
            type="button"
            onClick={() => openPolicy(p.id)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-raised"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-fg">{p.title}</span>
              <span className="tabular text-2xs text-fg-subtle">
                Ordered {formatDate(p.announcedDate)}
              </span>
            </span>
            {p.status === 'active' && <Badge>{p.stage}</Badge>}
            <Badge tone={STATUS_TONE[p.status]}>
              {p.status === 'active' ? 'in force' : p.status}
            </Badge>
          </button>
        </li>
      ))}
    </ul>
  );
}

function PolicyPage({ policy: p, onBack }: { policy: PolicyView; onBack: () => void }) {
  const { view, act, setPlace } = useGame();
  const events = (view?.events ?? []).filter((e) => p.linkedEvents.includes(e.id));
  const at = STAGES.indexOf(p.stage);
  return (
    <article aria-label={p.title} className="h-full overflow-auto p-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft />
        All policies
      </Button>
      <h3 className="mt-2 font-serif text-xl text-fg">{p.title}</h3>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
        <Badge tone={STATUS_TONE[p.status]}>{p.status === 'active' ? 'in force' : p.status}</Badge>
        {p.instrumentTitle}
        {p.result && <span>· went {p.result}</span>}
      </p>

      {p.status === 'blocked' ? (
        <p
          role="alert"
          className="mt-3 rounded-control border border-bad/40 bg-bad-soft p-3 text-bad"
        >
          {p.blockedReason}
        </p>
      ) : (
        <ol aria-label="Stage" className="mt-4 flex gap-1">
          {STAGES.map((stage, i) => (
            <li
              key={stage}
              aria-current={i === at ? 'step' : undefined}
              className={cn(
                'flex-1 border-t-2 pt-1 text-2xs',
                i <= at ? 'border-accent text-fg' : 'border-border text-fg-subtle',
              )}
            >
              {stage[0]?.toUpperCase()}
              {stage.slice(1)}
            </li>
          ))}
        </ol>
      )}

      <Section title="What you ordered">
        {p.orders.map((order) => (
          <blockquote key={order} className="prose-read border-l-2 border-accent pl-3 text-fg">
            {order}
          </blockquote>
        ))}
        {p.note && <p className="mt-2 text-fg-muted">{p.note}</p>}
      </Section>

      {p.status !== 'blocked' && (
        <>
          <Section title="Cost">
            <p className="text-fg-muted">{p.funding}</p>
          </Section>

          {(p.reactions.length > 0 || p.alsoNoted.length > 0) && (
            <Section title="Reactions">
              <ul className="flex flex-col gap-3">
                {p.reactions.map((r) => (
                  <li key={r.id}>
                    <p className="text-xs font-medium text-fg">
                      {r.actorName}
                      {r.kind === 'action' && <span className="ml-2 text-warn">acted</span>}
                    </p>
                    <blockquote className="prose-read mt-1 border-l-2 border-accent pl-3 font-serif text-fg-muted">
                      {r.text}
                    </blockquote>
                  </li>
                ))}
              </ul>
              {p.alsoNoted.length > 0 && (
                <p className="mt-2 text-xs text-fg-subtle">
                  Also watching: {p.alsoNoted.join(', ')}.
                </p>
              )}
              <p className="mt-1 text-2xs text-fg-subtle">
                Simulated. To hear more from any of them, ask them in the People window.
              </p>
            </Section>
          )}

          {p.targets.length > 0 && (
            <Section title="Before and since">
              <table className="w-full text-left">
                <thead className="text-2xs text-fg-subtle">
                  <tr>
                    <th className="py-1 font-normal">Measure</th>
                    <th className="py-1 font-normal">When ordered</th>
                    <th className="py-1 font-normal">Now</th>
                  </tr>
                </thead>
                <tbody>
                  {p.targets.map((t) => (
                    <tr key={t.label} className="border-t border-border">
                      <td className="py-1 text-fg-muted">{t.label}</td>
                      <td className="tabular py-1">
                        {t.before} <span className="text-2xs text-fg-subtle">{t.unit}</span>
                      </td>
                      <td className="tabular py-1">
                        {t.now} <span className="text-2xs text-fg-subtle">{t.unit}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-2xs text-fg-subtle">
                Other things moved these too. The figures show what changed, not how much this
                policy caused.
              </p>
            </Section>
          )}

          {p.effects.length > 0 && (
            <Section title="What it sets in motion">
              <ul className="flex flex-col gap-1">
                {p.effects.map((e) => (
                  <li
                    key={e.label}
                    className="flex items-baseline justify-between gap-2 text-fg-muted"
                  >
                    <span>
                      {e.label} <span className="text-fg">{e.change}</span>
                    </span>
                    <span className="tabular text-2xs text-fg-subtle">
                      from {formatDate(e.from)}
                      {e.until ? ` to ${formatDate(e.until)}` : ', until repealed'}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}

      {events.length > 0 && (
        <Section title="Events it caused">
          <ul className="flex flex-col gap-1">
            {events.map((e) => (
              <li key={e.id} className="text-fg-muted">
                <time dateTime={e.date} className="tabular mr-2 text-2xs text-fg-subtle">
                  {formatDate(e.date)}
                </time>
                {e.place ? (
                  <button
                    type="button"
                    className="text-left hover:text-accent"
                    onClick={() => setPlace(e.place ?? null)}
                  >
                    {e.summary}
                  </button>
                ) : (
                  e.summary
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {p.status === 'active' && (
        <div className="mt-6 border-t border-border pt-3">
          <Button
            variant="danger"
            disabled={view?.running != null}
            onClick={() => void act(() => api.repeal(p.id))}
          >
            Repeal this policy
          </Button>
        </div>
      )}
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h4 className="label-caps mb-2 text-fg-subtle">{title}</h4>
      {children}
    </section>
  );
}
