import type { ModelSettings } from '@statecraft/protocol';

/**
 * One interface for every vendor (REQ-HARN-01). Each adapter turns a request into that
 * vendor's wire format and back. Local servers (LM Studio, Ollama, llama.cpp, vLLM) speak
 * the OpenAI-compatible format.
 */
export interface ChatRequest {
  system: string;
  /** The first message is the job input; later ones are repair instructions. */
  turns: { role: 'user' | 'assistant'; content: string }[];
  schema: unknown;
  schemaName: string;
  maxTokens: number;
  signal: AbortSignal;
  /**
   * Called with the whole reply so far as it is written, on servers that stream. It lets
   * prose reach the screen before the call ends; the finished reply is still what counts.
   */
  onText?: (soFar: string) => void;
}

export interface ChatReply {
  text: string;
  tokensIn: number;
  tokensOut: number;
  /** Tokens spent thinking before the answer, where the server reports or reveals them. */
  reasoningTokens: number;
  /** How the JSON was asked for: by schema, by JSON mode, or by prompt alone. */
  strategy: 'schema' | 'json' | 'prompt';
  /** Milliseconds to the first token. Only known when the reply was streamed. */
  ttftMs?: number;
  refused: boolean;
}

export type FailureKind =
  | 'network'
  | 'rate_limit'
  | 'context'
  | 'timeout'
  | 'refusal'
  | 'invalid'
  | 'auth';

export class ModelFailure extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
  ) {
    super(message);
    this.name = 'ModelFailure';
  }
}

export interface Adapter {
  (request: ChatRequest): Promise<ChatReply>;
  /**
   * Whether this server is known to hold replies to the JSON schema. False until a reply has
   * come back in the schema's exact shape, because a server that quietly ignores
   * `response_format` looks no different at the request. Until there is proof, the prompt
   * keeps describing the output shape (spec: Speed, "Small prompts").
   */
  schemaEnforced?(): boolean;
  /** Called by the harness when a reply came back in the schema's exact shape. */
  confirmSchema?(): void;
}

type Env = Readonly<Record<string, string | undefined>>;

/** A model on this machine: one request at a time, no cost, and it stays loaded. */
export function isLocal(settings: ModelSettings): boolean {
  if (settings.kind !== 'openai') return false;
  try {
    const host = new URL(settings.baseUrl || 'https://api.openai.com/v1').hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

async function request(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal,
): Promise<Response> {
  const send = () =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
    });
  const timedOut = (error: unknown) => {
    const name = error instanceof Error ? error.name : '';
    return name === 'TimeoutError' || name === 'AbortError';
  };
  let response: Response;
  try {
    response = await send();
  } catch (first) {
    if (timedOut(first)) throw new ModelFailure('timeout', 'The model took too long to answer.');
    // A connection that drops before anything is sent back is usually a stale socket, not a
    // dead server: try once more before giving the whole call up to built-in wording.
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      response = await send();
    } catch (second) {
      if (timedOut(second)) throw new ModelFailure('timeout', 'The model took too long to answer.');
      throw new ModelFailure('network', `Could not reach the model at ${new URL(url).origin}.`);
    }
  }
  if (response.ok) return response;
  const detail = (await response.text().catch(() => '')).slice(0, 300);
  if (response.status === 429)
    throw new ModelFailure('rate_limit', 'The model provider is rate limiting requests.');
  if (response.status === 401 || response.status === 403)
    throw new ModelFailure('auth', 'The model provider rejected the API key.');
  if (/context|too long|maximum.*tokens/i.test(detail))
    throw new ModelFailure('context', 'The request is too long for this model.');
  throw new ModelFailure('network', `The model server answered ${response.status}. ${detail}`);
}

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal,
) {
  const response = await request(url, headers, body, signal);
  return (await response.json()) as Record<string, unknown>;
}

// biome-ignore lint/suspicious/noExplicitAny: vendor replies are untyped JSON, read defensively.
type Loose = any;

/** What the server has turned out not to accept, so later calls skip straight to what works. */
interface Quirks {
  noSchema?: boolean;
  newTokenParam?: boolean;
  noTemperature?: boolean;
  noReasoningEffort?: boolean;
  noStream?: boolean;
  noStreamOptions?: boolean;
  /** Set once a call has come back with the schema accepted. */
  schemaOk?: boolean;
}
const quirks = new Map<string, Quirks>();

interface Streamed {
  text: string;
  reasoning: string;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number;
  ttftMs?: number;
  refused: boolean;
}

/**
 * Reads a streamed chat completion. The point is not to show words as they arrive — nothing
 * long is written during a turn — but to measure: the first token tells prompt-processing
 * time apart from generation, which is the number that matters when tuning a local server.
 */
async function readStream(
  response: Response,
  started: number,
  onText?: (soFar: string) => void,
): Promise<Streamed> {
  const out: Streamed = {
    text: '',
    reasoning: '',
    tokensIn: 0,
    tokensOut: 0,
    reasoningTokens: 0,
    refused: false,
  };
  const reader = response.body?.getReader();
  if (!reader) throw new ModelFailure('network', 'The model server sent an empty reply.');
  const decoder = new TextDecoder();
  let buffer = '';
  let deltas = 0;
  const take = (line: string) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (payload === '' || payload === '[DONE]') return;
    let chunk: Loose;
    try {
      chunk = JSON.parse(payload);
    } catch {
      return;
    }
    const usage = chunk?.usage;
    if (usage) {
      out.tokensIn = Number(usage.prompt_tokens ?? out.tokensIn);
      out.tokensOut = Number(usage.completion_tokens ?? out.tokensOut);
      const reported = usage.completion_tokens_details?.reasoning_tokens;
      if (reported !== undefined) out.reasoningTokens = Number(reported);
    }
    const choice = chunk?.choices?.[0];
    const delta = choice?.delta;
    const piece = typeof delta?.content === 'string' ? delta.content : '';
    // LM Studio, Ollama and vLLM all expose a model's thinking under one of these names.
    const thought =
      (typeof delta?.reasoning_content === 'string' ? delta.reasoning_content : '') ||
      (typeof delta?.reasoning === 'string' ? delta.reasoning : '');
    if (piece === '' && thought === '') {
      if (choice?.finish_reason === 'content_filter' || delta?.refusal) out.refused = true;
      return;
    }
    if (out.ttftMs === undefined) out.ttftMs = Date.now() - started;
    deltas++;
    out.text += piece;
    if (piece !== '') onText?.(out.text);
    out.reasoning += thought;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) take(line.trim());
    }
    for (const line of buffer.split('\n')) take(line.trim());
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'TimeoutError' || name === 'AbortError')
      throw new ModelFailure('timeout', 'The model took too long to answer.');
    if (out.text === '') throw new ModelFailure('network', 'The reply was cut off.');
  }
  // A server that reports no usage still gives a usable count: one delta is about one token.
  if (out.tokensOut === 0) out.tokensOut = deltas;
  if (out.reasoningTokens === 0 && out.reasoning !== '')
    out.reasoningTokens = Math.ceil(out.reasoning.length / 4);
  return out;
}

/** Thinking a model leaves in the reply itself, when the server does not separate it out. */
function thinkingIn(text: string): number {
  let total = 0;
  for (const match of text.matchAll(/<think>([\s\S]*?)<\/think>/gi)) total += match[1]?.length ?? 0;
  return Math.ceil(total / 4);
}

function openaiCompatible(settings: ModelSettings, env: Env): Adapter {
  const base = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const key = env[settings.keyEnv || 'OPENAI_API_KEY'];
  const headers: Record<string, string> = key ? { authorization: `Bearer ${key}` } : {};
  const cacheKey = `${base}|${settings.model}`;

  const adapter: Adapter = async (chat) => {
    const known = quirks.get(cacheKey) ?? {};
    quirks.set(cacheKey, known);
    // Servers differ in what they accept. A rejected option is dropped and the call retried.
    for (let attempt = 0; ; attempt++) {
      const useSchema = !known.noSchema;
      const stream = !known.noStream;
      const body: Record<string, unknown> = {
        model: settings.model,
        messages: [{ role: 'system', content: chat.system }, ...chat.turns],
        [known.newTokenParam ? 'max_completion_tokens' : 'max_tokens']: chat.maxTokens,
        ...(known.noTemperature ? {} : { temperature: 0.4 }),
        // Thinking is pure latency here: the engine decides outcomes, the model only words
        // them, and every allowed answer is in the schema. Dropped if the server objects.
        ...(known.noReasoningEffort ? {} : { reasoning_effort: 'low' }),
        ...(stream
          ? {
              stream: true,
              ...(known.noStreamOptions ? {} : { stream_options: { include_usage: true } }),
            }
          : {}),
        ...(useSchema
          ? {
              response_format: {
                type: 'json_schema',
                json_schema: { name: chat.schemaName, schema: chat.schema },
              },
            }
          : {}),
      };
      const started = Date.now();
      let response: Response;
      try {
        response = await request(`${base}/chat/completions`, headers, body, chat.signal);
      } catch (error) {
        const rejected =
          error instanceof ModelFailure &&
          error.kind === 'network' &&
          /answered 4\d\d/.test(error.message);
        if (!rejected || attempt >= 5) throw error;
        const message = (error as ModelFailure).message;
        if (/max_completion_tokens/.test(message) && !known.newTokenParam)
          known.newTokenParam = true;
        else if (/temperature/.test(message) && !known.noTemperature) known.noTemperature = true;
        else if (/reasoning/i.test(message) && !known.noReasoningEffort)
          known.noReasoningEffort = true;
        else if (/stream_options/.test(message) && !known.noStreamOptions)
          known.noStreamOptions = true;
        else if (/stream/i.test(message) && !known.noStream) known.noStream = true;
        else if (useSchema) known.noSchema = true;
        else throw error;
        continue;
      }

      // A server may answer a streaming request with a plain body; read whichever arrived.
      const sse = (response.headers.get('content-type') ?? '').includes('text/event-stream');
      if (stream && sse) {
        const read = await readStream(response, started, chat.onText);
        return {
          text: read.text,
          tokensIn: read.tokensIn,
          tokensOut: read.tokensOut,
          reasoningTokens: read.reasoningTokens || thinkingIn(read.text),
          strategy: useSchema ? 'schema' : 'prompt',
          ...(read.ttftMs === undefined ? {} : { ttftMs: read.ttftMs }),
          refused: read.refused,
        };
      }
      const data: Loose = await response.json();
      const message = data?.choices?.[0]?.message;
      const text = String(message?.content ?? '');
      const reported = data?.usage?.completion_tokens_details?.reasoning_tokens;
      const thought =
        typeof message?.reasoning_content === 'string' ? message.reasoning_content : '';
      return {
        text,
        tokensIn: Number(data?.usage?.prompt_tokens ?? 0),
        tokensOut: Number(data?.usage?.completion_tokens ?? 0),
        reasoningTokens:
          reported !== undefined
            ? Number(reported)
            : thought !== ''
              ? Math.ceil(thought.length / 4)
              : thinkingIn(text),
        strategy: useSchema ? 'schema' : 'prompt',
        refused: Boolean(message?.refusal),
      };
    }
  };
  adapter.schemaEnforced = () => quirks.get(cacheKey)?.schemaOk === true;
  adapter.confirmSchema = () => {
    const known = quirks.get(cacheKey);
    if (known && !known.noSchema) known.schemaOk = true;
  };
  return adapter;
}

function anthropic(settings: ModelSettings, env: Env): Adapter {
  const base = (settings.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
  const key = env[settings.keyEnv || 'ANTHROPIC_API_KEY'] ?? '';
  return async (chat) => {
    const data: Loose = await post(
      `${base}/v1/messages`,
      { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      {
        model: settings.model,
        system: chat.system,
        messages: chat.turns,
        max_tokens: chat.maxTokens,
      },
      chat.signal,
    );
    const blocks = data?.content ?? [];
    const text = blocks
      .filter((b: Loose) => b?.type === 'text')
      .map((b: Loose) => b.text)
      .join('');
    const thinking = blocks
      .filter((b: Loose) => b?.type === 'thinking')
      .map((b: Loose) => String(b.thinking ?? ''))
      .join('');
    return {
      text,
      tokensIn: Number(data?.usage?.input_tokens ?? 0),
      tokensOut: Number(data?.usage?.output_tokens ?? 0),
      reasoningTokens: thinking === '' ? 0 : Math.ceil(thinking.length / 4),
      strategy: 'prompt',
      refused: data?.stop_reason === 'refusal',
    };
  };
}

function gemini(settings: ModelSettings, env: Env): Adapter {
  const base = (settings.baseUrl || 'https://generativelanguage.googleapis.com').replace(
    /\/+$/,
    '',
  );
  const key = env[settings.keyEnv || 'GEMINI_API_KEY'] ?? '';
  return async (chat) => {
    const data: Loose = await post(
      `${base}/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`,
      { 'x-goog-api-key': key },
      {
        systemInstruction: { parts: [{ text: chat.system }] },
        contents: chat.turns.map((t) => ({
          role: t.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: t.content }],
        })),
        generationConfig: {
          maxOutputTokens: chat.maxTokens,
          responseMimeType: 'application/json',
          temperature: 0.4,
        },
      },
      chat.signal,
    );
    const candidate = data?.candidates?.[0];
    return {
      text: (candidate?.content?.parts ?? []).map((p: Loose) => p?.text ?? '').join(''),
      tokensIn: Number(data?.usageMetadata?.promptTokenCount ?? 0),
      tokensOut: Number(data?.usageMetadata?.candidatesTokenCount ?? 0),
      reasoningTokens: Number(data?.usageMetadata?.thoughtsTokenCount ?? 0),
      strategy: 'json',
      refused: candidate?.finishReason === 'SAFETY' || Boolean(data?.promptFeedback?.blockReason),
    };
  };
}

/** Returns undefined when no model is configured: the game then runs on fallbacks. */
export function adapterFor(settings: ModelSettings, env: Env): Adapter | undefined {
  if (settings.kind === 'none' || settings.model.trim() === '') return undefined;
  if (settings.kind === 'openai') return openaiCompatible(settings, env);
  if (settings.kind === 'anthropic') return anthropic(settings, env);
  return gemini(settings, env);
}
