import { createHash, randomUUID } from 'node:crypto';
import type { CallView, ModelRole, ModelSettings } from '@statecraft/protocol';
import { z } from 'zod';
import { type Adapter, adapterFor, type ChatRequest, isLocal, ModelFailure } from './adapters.ts';
import type { Job } from './jobs.ts';
import { partialStrings } from './partial.ts';
import { mend } from './shape.ts';

/**
 * Runs a job against whatever model is configured and always returns a usable output:
 * parse, mend what is mechanically wrong, validate, check, repair up to twice, then fall
 * back (REQ-HARN-05). A failed or refused call never blocks the game; it degrades only its
 * own item and is marked.
 */
export interface JobResult<O> {
  output: O;
  via: 'model' | 'repaired' | 'fallback';
  record: CallView;
}

/**
 * Thrown when a call was called off by whoever asked for it. Nothing is recorded and no
 * built-in wording is put in its place: the work was not wanted any more.
 */
export class Cancelled extends Error {
  constructor() {
    super('The call was called off.');
    this.name = 'Cancelled';
  }
}

/** What a call is for. `signal` lets whoever asked call it off while it is being written. */
export interface CallContext {
  resolution: string;
  brief: string;
  signal?: AbortSignal;
}

export interface Harness {
  run<I, O>(job: Job<I, O>, input: I, context: CallContext, watch?: Watch): Promise<JobResult<O>>;
  /**
   * True when the model behind a role is a server on this machine, which answers one
   * request at a time. Work that would run side by side on a hosted provider is better
   * asked for in one call there (spec: Speed, "Reactions run after the commit").
   */
  oneAtATime(role: ModelRole): boolean;
  /**
   * True when a model is set for a role at all. Work whose only point is better wording is
   * not worth starting when the answer can only be the built-in wording it already has.
   */
  ready(role: ModelRole): boolean;
  /** A tiny call that loads the model and learns what the server accepts, before play. */
  warmUp(role?: ModelRole): Promise<void>;
}

/**
 * For prose the player is waiting to read: called while the reply is being written with
 * every string in it so far, keyed by path (`reply`, `body`, `answers.a2.text`). What it
 * shows is provisional, and an empty object means the model has been asked again and the
 * text starts over. Only the finished, checked reply is returned and saved.
 */
export interface Watch {
  onDraft(strings: Record<string, string>): void;
}

/** How often, at most, a draft is passed on while a reply streams, in milliseconds. */
const DRAFT_EVERY_MS = 80;

export interface HarnessOptions {
  /** The model that serves a role. One model may serve them all. */
  settings: (role: ModelRole) => ModelSettings;
  env?: Readonly<Record<string, string | undefined>>;
  onCall?: (record: CallView) => void;
  timeoutMs?: number;
  /** For tests: supply the adapter directly. */
  adapter?: Adapter;
}

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

/**
 * The schema for one call. A job that builds its own gets the allowed answers written in as
 * enums; anything else falls back to the schema Zod can export.
 */
const exported = new WeakMap<object, unknown>();
function schemaOf<I>(job: Job<I, unknown>, input: I): unknown {
  if (job.schema) return job.schema(input);
  let schema = exported.get(job as object);
  if (!schema) {
    schema = z.toJSONSchema(job.output);
    exported.set(job as object, schema);
  }
  return schema;
}

/**
 * Fixed text first, changing text last, so providers can cache the prefix (REQ-HARN-10).
 * When the server enforces the schema there is nothing for the prompt to say about the
 * output's shape, and saying it anyway costs tokens on every call.
 */
export function systemPrompt(
  job: Job<unknown, unknown>,
  brief: string,
  schemaEnforced = false,
): string {
  return [
    'You are one component of StateCraft, a political simulation for adults. You do one narrow job and return one JSON object, with no text outside it.',
    `JOB: ${job.name} v${job.version}`,
    job.rules,
    'Begin the object with "why": your reasoning in at most 20 words. Do not think before answering; keep every field short. Output length is what makes you slow.',
    ...(schemaEnforced
      ? ['The reply must match the JSON schema you have been given.']
      : [`Output shape (? marks an optional field):\n${job.shape}`]),
    ...(job.usesBrief ? [`World brief. Prefer these facts over your own memory:\n${brief}`] : []),
  ].join('\n\n');
}

const WARM_SCHEMA = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
  additionalProperties: false,
};

/** The most calls sent to one local server at once, whatever its window would hold. */
const MOST_AT_ONCE = 4;
/** The share of a server's context window that calls running together may fill. */
const WINDOW_SHARE = 0.9;

/**
 * Lets calls to one server on this machine run together for as long as they fit. Such a
 * server writes several replies at once, faster in total than one after another, but its
 * context window is shared between them: three long prompts sent together are all refused.
 * So each call states what it will take, prompt and reply, and waits its turn, first come
 * first served, until that much is free. A call bigger than the whole window runs alone.
 */
export class Gate {
  private used = 0;
  private running = 0;
  private readonly waiting: { cost: number; go: () => void }[] = [];
  constructor(
    private readonly room: number,
    private readonly most: number,
  ) {}

  private drain() {
    for (;;) {
      const next = this.waiting[0];
      if (!next) return;
      const fits = this.running < this.most && this.used + next.cost <= this.room;
      if (!fits && this.running > 0) return;
      this.waiting.shift();
      this.used += next.cost;
      this.running += 1;
      next.go();
    }
  }

  /** Waits for room, then returns what to call when the work is over. */
  enter(cost: number, signal?: AbortSignal): Promise<() => void> {
    const need = Math.min(Math.max(1, cost), this.room);
    return new Promise((resolve, reject) => {
      let left = false;
      const leave = () => {
        if (left) return;
        left = true;
        this.used -= need;
        this.running -= 1;
        this.drain();
      };
      const entry = { cost: need, go: () => resolve(leave) };
      signal?.addEventListener(
        'abort',
        () => {
          const at = this.waiting.indexOf(entry);
          if (at < 0) return;
          this.waiting.splice(at, 1);
          reject(new Cancelled());
        },
        { once: true },
      );
      this.waiting.push(entry);
      this.drain();
    });
  }
}

/** Roughly how many tokens a text is. Erring high only makes calls wait a little longer. */
const tokensIn = (text: string) => Math.ceil(text.length / 3.4) + 120;

export function createHarness(options: HarnessOptions): Harness {
  const env = options.env ?? process.env;
  const timeoutMs = options.timeoutMs ?? 180_000;
  const warmed = new Set<string>();
  const keyOf = (settings: ModelSettings) =>
    `${settings.kind}|${settings.baseUrl}|${settings.model}`;
  /** The context window each local server was found to have loaded, in tokens. */
  const windows = new Map<string, number>();
  const gates = new Map<string, Gate>();
  /** What each job's replies have run to, to judge the room the next one needs. */
  const written = new Map<string, number>();
  const gateFor = (settings: ModelSettings): Gate | undefined => {
    if (options.adapter !== undefined || settings.kind === 'none' || !isLocal(settings)) return;
    const key = keyOf(settings);
    const window = windows.get(key);
    let gate = gates.get(key);
    if (!gate) {
      // A server that has not said how much it holds is sent one call at a time.
      gate = window ? new Gate(Math.floor(window * WINDOW_SHARE), MOST_AT_ONCE) : new Gate(1, 1);
      gates.set(key, gate);
    }
    return gate;
  };
  /**
   * Asks a server on this machine how large a context window it has loaded. LM Studio
   * answers this; a server that does not is treated as taking one call at a time.
   */
  const learnWindow = async (settings: ModelSettings) => {
    if (!isLocal(settings) || windows.has(keyOf(settings))) return;
    try {
      const response = await fetch(new URL('/api/v0/models', settings.baseUrl), {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return;
      const listed = (await response.json()) as {
        data?: { id?: string; loaded_context_length?: number }[];
      };
      const window = listed.data?.find((m) => m.id === settings.model)?.loaded_context_length;
      if (typeof window === 'number' && window >= 2048) {
        windows.set(keyOf(settings), window);
        gates.delete(keyOf(settings));
      }
    } catch {
      // Not a server that says: one call at a time.
    }
  };

  return {
    oneAtATime(role) {
      const settings = options.settings(role);
      return settings.kind !== 'none' && isLocal(settings) && !windows.has(keyOf(settings));
    },
    ready(role) {
      const settings = options.settings(role);
      return (
        options.adapter !== undefined || (settings.kind !== 'none' && settings.model.trim() !== '')
      );
    },

    /**
     * One throwaway call before play: the server loads the weights, and the adapter learns
     * in the process whether the schema, streaming and the rest are accepted. The real first
     * turn then starts against a warm model with the lean prompt already in use.
     */
    async warmUp(role: ModelRole = 'adjudicator') {
      const settings = options.settings(role);
      const adapter = options.adapter ?? adapterFor(settings, env);
      const key = keyOf(settings);
      if (!adapter || warmed.has(key)) return;
      warmed.add(key);
      if (options.adapter === undefined) await learnWindow(settings);
      const started = Date.now();
      try {
        const reply = await adapter({
          system: 'Reply with {"ok":true} and nothing else.',
          turns: [{ role: 'user', content: '{}' }],
          schema: WARM_SCHEMA,
          schemaName: 'warm_up',
          // Room for a model that thinks before it answers, however briefly.
          maxTokens: 200,
          signal: AbortSignal.timeout(Math.min(timeoutMs, 120_000)),
        });
        // The warm-up doubles as the schema test, so the first real call already runs with
        // the shorter prompt on a server that honours it.
        try {
          const warm = mend(extractJson(reply.text), WARM_SCHEMA);
          if (warm.shapeOk && reply.strategy === 'schema') adapter.confirmSchema?.();
        } catch {
          // A server that cannot even answer this is left to prove itself on a real call.
        }
        options.onCall?.({
          id: randomUUID(),
          resolution: 'warm-up',
          job: 'model.warmUp v1',
          model: settings.model,
          strategy: reply.strategy,
          schemaEnforced: reply.strategy === 'schema',
          via: 'model',
          attempts: 1,
          errors: [],
          fixes: [],
          tokensIn: reply.tokensIn,
          tokensOut: reply.tokensOut,
          reasoningTokens: reply.reasoningTokens,
          ...(reply.ttftMs === undefined ? {} : { ttftMs: reply.ttftMs }),
          ms: Date.now() - started,
          promptHash: 'warmup',
          input: '{}',
          output: reply.text.slice(0, 200),
        });
      } catch {
        // A model that cannot be reached yet is not a reason to refuse to start.
        warmed.delete(key);
      }
    },

    async run<I, O>(job: Job<I, O>, input: I, context: CallContext, watch?: Watch) {
      if (context.signal?.aborted) throw new Cancelled();
      const settings = options.settings(job.role);
      const adapter = options.adapter ?? adapterFor(settings, env);
      const enforced = adapter?.schemaEnforced?.() ?? false;
      const system = systemPrompt(job as Job<unknown, unknown>, context.brief, enforced);
      const schema = schemaOf(job as Job<I, unknown>, input);
      const inputText = JSON.stringify(input);
      let started = Date.now();
      const record: CallView = {
        id: randomUUID(),
        resolution: context.resolution,
        job: `${job.name} v${job.version}`,
        model: adapter ? settings.model : 'none',
        strategy: 'none',
        schemaEnforced: false,
        via: 'fallback',
        attempts: 0,
        errors: [],
        fixes: [],
        tokensIn: 0,
        tokensOut: 0,
        reasoningTokens: 0,
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
      /** Milliseconds spent generating, with the wait for the first token taken out. */
      let genMs = 0;

      // On a server on this machine the call waits here until its prompt and its reply
      // fit in the window alongside whatever else is being written.
      const gate = adapter ? gateFor(settings) : undefined;
      const room =
        tokensIn(system + inputText) +
        Math.min(job.maxTokens, Math.round((written.get(job.name) ?? 700) * 1.25));
      let leave = gate ? await gate.enter(room, context.signal) : undefined;
      let alone = false;
      // The wait for room is not time the model took.
      started = Date.now();
      try {
        if (adapter) {
          const turns: ChatRequest['turns'] = [{ role: 'user', content: inputText }];
          let steppedDown = false;
          for (let attempt = 0; attempt <= job.repairs && output === undefined; attempt++) {
            record.attempts = attempt + 1;
            // A second try writes the text afresh, so whatever was on screen is cleared.
            if (attempt > 0) watch?.onDraft({});
            let lastDraft = 0;
            let text = '';
            const attemptStart = Date.now();
            try {
              const reply = await adapter({
                system,
                turns,
                schema,
                schemaName: job.name.replace('.', '_'),
                maxTokens: job.maxTokens,
                signal: context.signal
                  ? AbortSignal.any([AbortSignal.timeout(timeoutMs), context.signal])
                  : AbortSignal.timeout(timeoutMs),
                ...(watch
                  ? {
                      onText: (soFar: string) => {
                        const now = Date.now();
                        if (now - lastDraft < DRAFT_EVERY_MS) return;
                        lastDraft = now;
                        watch.onDraft(partialStrings(soFar));
                      },
                    }
                  : {}),
              });
              text = reply.text;
              if (watch && reply.ttftMs !== undefined) watch.onDraft(partialStrings(text));
              record.output = text;
              record.strategy = reply.strategy;
              record.schemaEnforced = reply.strategy === 'schema';
              record.tokensIn += reply.tokensIn;
              record.tokensOut += reply.tokensOut;
              record.reasoningTokens = (record.reasoningTokens ?? 0) + reply.reasoningTokens;
              // Generation time only counts where the first token was timed; without it the
              // server's prompt processing and the model's writing cannot be told apart, and
              // a tokens-a-second figure would be a different measurement under the same name.
              if (reply.ttftMs !== undefined) {
                record.ttftMs ??= reply.ttftMs;
                genMs += Math.max(Date.now() - attemptStart - reply.ttftMs, 1);
              }
              if (reply.refused || (REFUSAL.test(text) && !text.includes('{')))
                throw new ModelFailure('refusal', 'The model declined.');
            } catch (error) {
              // Called off by whoever asked: not a failure, and nothing to fall back to.
              if (context.signal?.aborted) throw new Cancelled();
              const failure =
                error instanceof ModelFailure ? error : new ModelFailure('network', String(error));
              record.errors.push(`${failure.kind}: ${failure.message}`);
              // The estimate was too low and the window overflowed: once everything else
              // has finished, try again with the server to itself. Not counted as a try.
              if (gate && !alone && /context (size|length|window)/i.test(failure.message)) {
                alone = true;
                leave?.();
                leave = await gate.enter(Number.MAX_SAFE_INTEGER, context.signal);
                attempt -= 1;
                continue;
              }
              if (failure.kind === 'rate_limit' && attempt < job.repairs) {
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
              // Mechanical mistakes are put right here, not sent back: a number outside its
              // range is clamped, over-long text is trimmed, an unasked field is dropped.
              const mended = mend(extractJson(text), schema as Record<string, unknown>);
              if (mended.fixes.length > 0)
                record.fixes = [...(record.fixes ?? []), ...mended.fixes];
              const parsed = job.output.safeParse(mended.value);
              if (parsed.success) {
                // A reply that came back in the schema's exact shape is proof that this server
                // holds the model to it, so later prompts stop describing the shape.
                if (mended.shapeOk && record.strategy === 'schema') adapter.confirmSchema?.();
                const more = job.mend?.(input, parsed.data) ?? [];
                if (more.length > 0) record.fixes = [...(record.fixes ?? []), ...more];
                problems = job.check(input, parsed.data);
              } else problems = [z.prettifyError(parsed.error)];
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
      } finally {
        leave?.();
      }
      // What this job's replies run to, for judging the room the next one needs.
      if (record.tokensOut > 0)
        written.set(
          job.name,
          Math.round(((written.get(job.name) ?? record.tokensOut) + record.tokensOut) / 2),
        );

      if (output === undefined) {
        output = job.fallback(input);
        record.via = 'fallback';
        if (!adapter) record.output = '';
      }
      record.ms = Date.now() - started;
      if (genMs > 0 && record.tokensOut > 0) {
        const rate = (record.tokensOut / genMs) * 1000;
        record.tokensPerSecond = rate >= 100 ? Math.round(rate) : Math.round(rate * 10) / 10;
      }
      if (record.via === 'fallback') record.output ||= JSON.stringify(output);
      options.onCall?.(record);
      return { output, via: record.via, record };
    },
  };
}
