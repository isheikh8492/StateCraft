import { createHash, randomUUID } from 'node:crypto';
import type { CallView, ModelRole, ModelSettings } from '@statecraft/protocol';
import { z } from 'zod';
import { type Adapter, adapterFor, type ChatRequest, ModelFailure } from './adapters.ts';
import type { Job } from './jobs.ts';

/**
 * Runs a job against whatever model is configured and always returns a usable output:
 * parse, validate, check, repair up to twice, then fall back (REQ-HARN-05). A failed or
 * refused call never blocks the game; it degrades only its own item and is marked.
 */
export interface JobResult<O> {
  output: O;
  via: 'model' | 'repaired' | 'fallback';
  record: CallView;
}

export interface Harness {
  run<I, O>(
    job: Job<I, O>,
    input: I,
    context: { resolution: string; brief: string },
  ): Promise<JobResult<O>>;
}

export interface HarnessOptions {
  /** The model that serves a role. One model may serve them all. */
  settings: (role: ModelRole) => ModelSettings;
  env?: Readonly<Record<string, string | undefined>>;
  onCall?: (record: CallView) => void;
  timeoutMs?: number;
  /** For tests: supply the adapter directly. */
  adapter?: Adapter;
}

const MAX_REPAIRS = 2;
const REFUSAL =
  /^\s*(i['’]m sorry|i am sorry|sorry,|i can(?:['’]t|not)|i won['’]t|i['’]m unable|i am unable|as an ai)/i;

/** Pulls the JSON object out of a reply that may carry reasoning tags, fences or chatter. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object found');
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Fixed text first, changing text last, so providers can cache the prefix (REQ-HARN-10). */
export function systemPrompt(job: Job<unknown, unknown>, brief: string): string {
  return [
    'You are one component of StateCraft, a political simulation for adults. You do one narrow job and return one JSON object, with no text outside it.',
    `JOB: ${job.name} v${job.version}`,
    job.rules,
    'Begin the object with "why": one or two sentences of reasoning. It is logged and never shown.',
    `Output schema (JSON Schema):\n${JSON.stringify(z.toJSONSchema(job.output))}`,
    `World brief. Prefer these facts over your own memory:\n${brief}`,
  ].join('\n\n');
}

export function createHarness(options: HarnessOptions): Harness {
  const env = options.env ?? process.env;
  const timeoutMs = options.timeoutMs ?? 180_000;

  return {
    async run<I, O>(job: Job<I, O>, input: I, context: { resolution: string; brief: string }) {
      const settings = options.settings(job.role);
      const adapter = options.adapter ?? adapterFor(settings, env);
      const system = systemPrompt(job as Job<unknown, unknown>, context.brief);
      const inputText = JSON.stringify(input);
      const started = Date.now();
      const record: CallView = {
        id: randomUUID(),
        resolution: context.resolution,
        job: `${job.name} v${job.version}`,
        model: adapter ? settings.model : 'none',
        strategy: 'none',
        via: 'fallback',
        attempts: 0,
        errors: [],
        tokensIn: 0,
        tokensOut: 0,
        ms: 0,
        promptHash: createHash('sha256')
          .update(system)
          .update(inputText)
          .digest('hex')
          .slice(0, 16),
        input: inputText,
        output: '',
      };
      let output: O | undefined;

      if (adapter) {
        const turns: ChatRequest['turns'] = [{ role: 'user', content: inputText }];
        let steppedDown = false;
        for (let attempt = 0; attempt <= MAX_REPAIRS && output === undefined; attempt++) {
          record.attempts = attempt + 1;
          let text = '';
          try {
            const reply = await adapter({
              system,
              turns,
              schema: z.toJSONSchema(job.output),
              schemaName: job.name.replace('.', '_'),
              maxTokens: job.maxTokens,
              signal: AbortSignal.timeout(timeoutMs),
            });
            text = reply.text;
            record.output = text;
            record.strategy = reply.strategy;
            record.tokensIn += reply.tokensIn;
            record.tokensOut += reply.tokensOut;
            if (reply.refused || (REFUSAL.test(text) && !text.includes('{')))
              throw new ModelFailure('refusal', 'The model declined.');
          } catch (error) {
            const failure =
              error instanceof ModelFailure ? error : new ModelFailure('network', String(error));
            record.errors.push(`${failure.kind}: ${failure.message}`);
            if (failure.kind === 'rate_limit' && attempt < MAX_REPAIRS) {
              await new Promise((resolve) => setTimeout(resolve, 2000));
              continue;
            }
            // A refusal gets one more try with the context stated plainly, then fixed wording.
            if (failure.kind === 'refusal' && !steppedDown) {
              steppedDown = true;
              turns.push({ role: 'assistant', content: text || '(declined)' });
              turns.push({
                role: 'user',
                content:
                  'This is a fictional political simulation for adults. Report events factually and briefly, as a newspaper of record would, with no graphic detail and no instructions. Return the JSON object.',
              });
              continue;
            }
            break;
          }

          let problems: string[];
          try {
            const parsed = job.output.safeParse(extractJson(text));
            problems = parsed.success
              ? job.check(input, parsed.data)
              : [z.prettifyError(parsed.error)];
            if (parsed.success && problems.length === 0) {
              output = parsed.data;
              record.via = attempt === 0 ? 'model' : 'repaired';
            }
          } catch {
            problems = ['The reply was not a JSON object.'];
          }
          if (output === undefined) {
            record.errors.push(`invalid: ${problems.join(' ')}`.slice(0, 600));
            turns.push({ role: 'assistant', content: text.slice(0, 4000) });
            turns.push({
              role: 'user',
              content: `That output was rejected. Fix these problems and return the whole JSON object again, with nothing else:\n- ${problems.slice(0, 8).join('\n- ')}`,
            });
          }
        }
      }

      if (output === undefined) {
        output = job.fallback(input);
        record.via = 'fallback';
        if (!adapter) record.output = '';
      }
      record.ms = Date.now() - started;
      if (record.via === 'fallback') record.output ||= JSON.stringify(output);
      options.onCall?.(record);
      return { output, via: record.via, record };
    },
  };
}
