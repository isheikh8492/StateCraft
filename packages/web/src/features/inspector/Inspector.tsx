import type { CallView } from '@statecraft/protocol';
import { Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useGame } from '@/lib/game';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';

const VIA_TONE = { model: 'good', repaired: 'accent', fallback: 'warn' } as const;

/** Per call: what the server did with the schema, and how fast it answered. */
function Measures({ call }: { call: CallView }) {
  const parts = [
    `${call.tokensIn}/${call.tokensOut} tok`,
    ...(call.reasoningTokens ? [`${call.reasoningTokens} thinking`] : []),
    ...(call.ttftMs === undefined ? [] : [`${(call.ttftMs / 1000).toFixed(1)} s to first token`]),
    ...(call.tokensPerSecond === undefined ? [] : [`${call.tokensPerSecond} tok/s`]),
    `${call.ms} ms`,
    `${call.attempts} ${call.attempts === 1 ? 'try' : 'tries'}`,
  ];
  return <span className="tabular text-2xs text-fg-subtle">{parts.join(' · ')}</span>;
}

/** A developer tool: every model call of the last resolution, and what it cost. */
export function Inspector() {
  const { view } = useGame();
  const last = view?.lastResolution ?? null;
  const [calls, setCalls] = useState<CallView[]>([]);
  const [numbers, setNumbers] = useState<string | null>(null);
  const id = last?.id;
  useEffect(() => {
    if (id) api.calls(id).then(setCalls, () => setCalls([]));
  }, [id]);

  if (!last) {
    return (
      <EmptyState icon={Wrench} title="Nothing to inspect yet">
        After each resolution this shows every model call: what was sent, what came back, which
        checks failed, the tokens used, the time to the first token and the tokens a second, and
        whether the server held the reply to the JSON schema or the shape was asked for in the
        prompt.
      </EmptyState>
    );
  }
  return (
    <div className="h-full overflow-auto p-4">
      <dl aria-label="Cost of the last resolution" className="grid grid-cols-3 gap-2">
        {[
          ['Model calls', String(last.calls)],
          ['Built-in wording used', String(last.fallbacks)],
          ['Tokens in / out', `${last.tokensIn} / ${last.tokensOut}`],
          ['Time in models', `${(last.ms / 1000).toFixed(1)} s`],
          [
            'Held to the schema',
            calls.length === 0
              ? '—'
              : `${calls.filter((c) => c.schemaEnforced).length} of ${calls.length}`,
          ],
          ['Put right here', String(calls.reduce((total, c) => total + (c.fixes?.length ?? 0), 0))],
        ].map(([label, value]) => (
          <div key={label} className="rounded-control border border-border bg-surface-2 p-2">
            <dt className="text-2xs text-fg-subtle">{label}</dt>
            <dd className="tabular text-fg">{value}</dd>
          </div>
        ))}
      </dl>
      <ul aria-label="Model calls" className="mt-3 flex flex-col gap-2">
        {calls.map((call) => (
          <li key={call.id} className="rounded-control border border-border bg-surface-2">
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2">
                <span className="flex-1 font-mono text-xs">{call.job}</span>
                <Measures call={call} />
                <Badge tone={call.schemaEnforced ? 'good' : 'warn'}>
                  {call.schemaEnforced ? 'schema' : 'prompted'}
                </Badge>
                <Badge tone={VIA_TONE[call.via]}>{call.via}</Badge>
              </summary>
              <div className="border-t border-border p-3">
                {call.errors.map((e) => (
                  <p key={e} className="mb-2 text-xs text-warn">
                    {e}
                  </p>
                ))}
                {(call.fixes?.length ?? 0) > 0 && (
                  <>
                    <p className="label-caps text-fg-subtle">
                      Put right here, without asking again
                    </p>
                    <ul className="mt-1 mb-2 flex flex-col gap-0.5">
                      {call.fixes?.map((fix) => (
                        <li key={fix} className="text-2xs text-fg-muted">
                          {fix}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="label-caps text-fg-subtle">Input</p>
                <pre className="mt-1 max-h-40 overflow-auto font-mono text-2xs break-all whitespace-pre-wrap text-fg-muted">
                  {call.input}
                </pre>
                <p className="label-caps mt-2 text-fg-subtle">Output</p>
                <pre className="mt-1 max-h-40 overflow-auto font-mono text-2xs break-all whitespace-pre-wrap text-fg-muted">
                  {call.output}
                </pre>
              </div>
            </details>
          </li>
        ))}
      </ul>
      <div className="mt-4 border-t border-border pt-3">
        <Button
          size="sm"
          onClick={() =>
            numbers
              ? setNumbers(null)
              : api.debugWorld().then((w) => setNumbers(JSON.stringify(w, null, 1)))
          }
        >
          {numbers ? 'Hide the true numbers' : 'Show the true numbers'}
        </Button>
        <span className="ml-2 text-2xs text-fg-subtle">
          For development. In play, moods and pressure are never shown as numbers.
        </span>
        <a href="#gallery" className="ml-3 text-2xs text-fg-muted underline hover:text-fg">
          Component gallery
        </a>
        {numbers && (
          <pre className="mt-2 max-h-80 overflow-auto font-mono text-2xs whitespace-pre-wrap text-fg-muted">
            {numbers}
          </pre>
        )}
      </div>
    </div>
  );
}
