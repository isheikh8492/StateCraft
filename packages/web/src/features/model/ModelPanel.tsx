import { MODEL_KINDS, type ModelCheck, type ModelSettings } from '@statecraft/protocol';
import { type FormEvent, useEffect, useState } from 'react';
import { api, type ModelInfo } from '@/lib/api';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Input, Select } from '@/ui/input';

const KIND_LABEL: Record<ModelSettings['kind'], string> = {
  none: 'No model (built-in wording only)',
  openai: 'OpenAI-compatible (LM Studio, Ollama, OpenAI, others)',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
};
const PRESETS: { label: string; settings: ModelSettings }[] = [
  {
    label: 'LM Studio',
    settings: { kind: 'openai', baseUrl: 'http://localhost:1234/v1', model: '', keyEnv: '' },
  },
  {
    label: 'Ollama',
    settings: { kind: 'openai', baseUrl: 'http://localhost:11434/v1', model: '', keyEnv: '' },
  },
];
const VERDICT_TONE = {
  suitable: 'good',
  usable: 'accent',
  unsuitable: 'bad',
  unreachable: 'bad',
} as const;

/** Connect a model, and find out whether it is up to the job before you rely on it. */
export function ModelPanel() {
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [form, setForm] = useState<ModelSettings>({
    kind: 'none',
    baseUrl: '',
    model: '',
    keyEnv: '',
  });
  const [check, setCheck] = useState<ModelCheck | 'running' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.model().then(
      (loaded) => {
        setInfo(loaded);
        setForm(loaded.settings);
      },
      (e: unknown) => setMessage(e instanceof Error ? e.message : 'Could not load the settings.'),
    );
  }, []);

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    try {
      setInfo(await api.saveModel(form));
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
      setCheck(await api.checkModel());
    } catch (e) {
      setCheck(null);
      setMessage(e instanceof Error ? e.message : 'The check could not run.');
    }
  };
  const set = (patch: Partial<ModelSettings>) => {
    setForm((current) => ({ ...current, ...patch }));
    setMessage(null);
  };
  const needsKey =
    form.kind === 'anthropic' ||
    form.kind === 'gemini' ||
    (form.kind === 'openai' && !/localhost|127\.0\.0\.1/.test(form.baseUrl));

  return (
    <div className="h-full overflow-auto p-4">
      <p className="text-fg-muted">
        Models write the readings, judge each period inside limits the engine sets, and write the
        chronicle. Without one, the game still plays, in plain built-in wording.
      </p>
      <form onSubmit={save} className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-fg-subtle">Quick setup</span>
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              size="sm"
              onClick={() => set({ ...preset.settings, model: form.model })}
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
                  The key itself stays in the .env file in the StateCraft folder and is never shown
                  or stored here.{' '}
                  {info &&
                    form.kind === info.settings.kind &&
                    (info.keyPresent
                      ? 'A key was found.'
                      : 'No key was found under that name; restart StateCraft after editing .env.')}
                </span>
              </label>
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
