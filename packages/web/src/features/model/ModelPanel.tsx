import {
  MODEL_KINDS,
  type ModelCheck,
  type ModelConfig,
  type ModelRole,
  type ModelSettings,
} from '@statecraft/protocol';
import { type FormEvent, useEffect, useState } from 'react';
import { api, type ModelInfo } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Input, Select } from '@/ui/input';

type Slot = 'main' | ModelRole;
const SLOTS: { id: Slot; label: string; does: string }[] = [
  { id: 'main', label: 'Main model', does: 'Does every job that has no model of its own.' },
  {
    id: 'adjudicator',
    label: 'Judge',
    does: 'Judges what each period brings, inside limits the engine sets. The hardest job: give it your strongest model.',
  },
  {
    id: 'extractor',
    label: 'Reader',
    does: 'Reads your boxes and turns them into policies. A small, fast model is enough.',
  },
  {
    id: 'narrator',
    label: 'Narrator',
    does: 'Writes the chronicle and ministry reports. Choose for prose, and for willingness to report violence plainly.',
  },
];
const KIND_LABEL: Record<ModelSettings['kind'], string> = {
  none: 'No model (built-in wording only)',
  openai: 'OpenAI-compatible (LM Studio, Ollama, OpenAI, others)',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
};
const EMPTY: ModelSettings = { kind: 'none', baseUrl: '', model: '', keyEnv: '' };
const PRESETS: { label: string; baseUrl: string }[] = [
  { label: 'LM Studio', baseUrl: 'http://localhost:1234/v1' },
  { label: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
];
const VERDICT_TONE = {
  suitable: 'good',
  usable: 'accent',
  unsuitable: 'bad',
  unreachable: 'bad',
} as const;

/** Connect models, one for everything or one per role, and check each before relying on it. */
export function ModelPanel() {
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [config, setConfig] = useState<ModelConfig>({ main: EMPTY, roles: {} });
  const [slot, setSlot] = useState<Slot>('main');
  const [check, setCheck] = useState<ModelCheck | 'running' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.model().then(
      (loaded) => {
        setInfo(loaded);
        setConfig(loaded.config);
      },
      (e: unknown) => setMessage(e instanceof Error ? e.message : 'Could not load the settings.'),
    );
  }, []);

  const own = slot === 'main' ? config.main : config.roles[slot];
  const form = own ?? config.main;
  const inherits = slot !== 'main' && own === undefined;
  const set = (patch: Partial<ModelSettings>) => {
    const next = { ...form, ...patch };
    setConfig((c) =>
      slot === 'main' ? { ...c, main: next } : { ...c, roles: { ...c.roles, [slot]: next } },
    );
    setMessage(null);
  };
  const setInherit = (on: boolean) => {
    if (slot === 'main') return;
    setConfig((c) => {
      const roles = { ...c.roles };
      if (on) delete roles[slot];
      else roles[slot] = { ...c.main };
      return { ...c, roles };
    });
    setMessage(null);
  };

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    try {
      setInfo(await api.saveModel(config));
      setMessage('Saved.');
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save.');
      return false;
    }
  };
  const runCheck = async () => {
    if (!(await save())) return;
    setCheck('running');
    try {
      setCheck(await api.checkModel(slot === 'main' ? undefined : slot));
    } catch (e) {
      setCheck(null);
      setMessage(e instanceof Error ? e.message : 'The check could not run.');
    }
  };
  const needsKey =
    form.kind === 'anthropic' ||
    form.kind === 'gemini' ||
    (form.kind === 'openai' && !/localhost|127\.0\.0\.1/.test(form.baseUrl));
  const current = SLOTS.find((s) => s.id === slot);

  return (
    <div className="h-full overflow-auto p-4">
      <p className="text-fg-muted">
        Models read your boxes, judge each period inside limits the engine sets, and write the
        chronicle. Without one, the game still plays, in plain built-in wording.
      </p>
      <div
        role="tablist"
        aria-label="Which model"
        className="mt-3 flex gap-1 border-b border-border"
      >
        {SLOTS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={slot === s.id}
            className={cn(
              '-mb-px border-b-2 px-2 py-1 text-xs',
              slot === s.id
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-muted hover:text-fg',
            )}
            onClick={() => {
              setSlot(s.id);
              setCheck(null);
            }}
          >
            {s.label}
            {s.id !== 'main' && config.roles[s.id] && <span className="ml-1 text-accent">•</span>}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-fg-subtle">{current?.does}</p>

      <form onSubmit={save} className="mt-3 flex flex-col gap-3">
        {slot !== 'main' && (
          <label className="flex items-center gap-2 text-fg-muted">
            <input
              type="checkbox"
              className="accent-accent"
              checked={inherits}
              onChange={(e) => setInherit(e.target.checked)}
            />
            Use the main model for this role
          </label>
        )}
        {!inherits && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-fg-subtle">Quick setup</span>
              {PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  size="sm"
                  onClick={() => set({ kind: 'openai', baseUrl: preset.baseUrl, keyEnv: '' })}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <label htmlFor="m-kind" className="flex flex-col gap-1">
              <span className="text-xs text-fg-muted">Connection</span>
              <Select
                id="m-kind"
                value={form.kind}
                onChange={(e) => set({ kind: e.target.value as ModelSettings['kind'] })}
              >
                {MODEL_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABEL[kind]}
                  </option>
                ))}
              </Select>
            </label>
            {form.kind !== 'none' && (
              <>
                <label htmlFor="m-url" className="flex flex-col gap-1">
                  <span className="text-xs text-fg-muted">
                    Server address {form.kind !== 'openai' && '(leave empty for the default)'}
                  </span>
                  <Input
                    id="m-url"
                    value={form.baseUrl}
                    placeholder={form.kind === 'openai' ? 'http://localhost:1234/v1' : ''}
                    onChange={(e) => set({ baseUrl: e.target.value })}
                  />
                </label>
                <label htmlFor="m-model" className="flex flex-col gap-1">
                  <span className="text-xs text-fg-muted">
                    Model name, exactly as the server lists it
                  </span>
                  <Input
                    id="m-model"
                    value={form.model}
                    onChange={(e) => set({ model: e.target.value })}
                  />
                </label>
                {needsKey && (
                  <label htmlFor="m-key" className="flex flex-col gap-1">
                    <span className="text-xs text-fg-muted">
                      Name of the variable in your .env file that holds the key
                    </span>
                    <Input
                      id="m-key"
                      value={form.keyEnv}
                      placeholder={
                        form.kind === 'anthropic'
                          ? 'ANTHROPIC_API_KEY'
                          : form.kind === 'gemini'
                            ? 'GEMINI_API_KEY'
                            : 'OPENAI_API_KEY'
                      }
                      onChange={(e) => set({ keyEnv: e.target.value })}
                    />
                    <span className="text-2xs text-fg-subtle">
                      The key itself stays in the .env file in the StateCraft folder and is never
                      shown or stored here.{' '}
                      {info &&
                        (info.keys[slot]
                          ? 'A key was found when last saved.'
                          : 'No key was found under that name when last saved; restart StateCraft after editing .env.')}
                    </span>
                  </label>
                )}
              </>
            )}
          </>
        )}
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary">
            Save
          </Button>
          <Button
            disabled={form.kind === 'none' || check === 'running'}
            onClick={() => void runCheck()}
          >
            {check === 'running' ? 'Checking…' : 'Check this model'}
          </Button>
          {message && (
            <span role="status" className="text-xs text-fg-muted">
              {message}
            </span>
          )}
        </div>
      </form>

      {check === 'running' && (
        <p className="mt-4 text-fg-muted">
          Running four short jobs. A local model can take a minute or two.
        </p>
      )}
      {check && check !== 'running' && (
        <section
          aria-label="Model check result"
          className="mt-4 rounded-control border border-border bg-surface-2 p-3"
        >
          <p className="flex items-center gap-2">
            <Badge tone={VERDICT_TONE[check.verdict]}>{check.verdict}</Badge>
            <span className="text-fg">{check.summary}</span>
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {check.jobs.map((job) => (
              <li
                key={job.job}
                className="flex items-center justify-between gap-2 text-xs text-fg-muted"
              >
                <span>{job.job}</span>
                <span className="tabular">
                  {job.via === 'model'
                    ? 'first try'
                    : job.via === 'repaired'
                      ? 'needed a second try'
                      : 'failed'}{' '}
                  · {(job.ms / 1000).toFixed(1)} s
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
