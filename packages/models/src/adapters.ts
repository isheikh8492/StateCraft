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
}

export interface ChatReply {
  text: string;
  tokensIn: number;
  tokensOut: number;
  /** How the JSON was asked for: by schema, by JSON mode, or by prompt alone. */
  strategy: 'schema' | 'json' | 'prompt';
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

export type Adapter = (request: ChatRequest) => Promise<ChatReply>;
type Env = Readonly<Record<string, string | undefined>>;

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal,
) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'TimeoutError' || name === 'AbortError')
      throw new ModelFailure('timeout', 'The model took too long to answer.');
    throw new ModelFailure('network', `Could not reach the model at ${new URL(url).origin}.`);
  }
  if (response.ok) return (await response.json()) as Record<string, unknown>;
  const detail = (await response.text().catch(() => '')).slice(0, 300);
  if (response.status === 429)
    throw new ModelFailure('rate_limit', 'The model provider is rate limiting requests.');
  if (response.status === 401 || response.status === 403)
    throw new ModelFailure('auth', 'The model provider rejected the API key.');
  if (/context|too long|maximum.*tokens/i.test(detail))
    throw new ModelFailure('context', 'The request is too long for this model.');
  throw new ModelFailure('network', `The model server answered ${response.status}. ${detail}`);
}

// biome-ignore lint/suspicious/noExplicitAny: vendor replies are untyped JSON, read defensively.
type Loose = any;

/** What each server has turned out not to accept, so later calls skip straight to what works. */
const quirks = new Map<
  string,
  { noSchema?: boolean; newTokenParam?: boolean; noTemperature?: boolean }
>();

function openaiCompatible(settings: ModelSettings, env: Env): Adapter {
  const base = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const key = env[settings.keyEnv || 'OPENAI_API_KEY'];
  const headers: Record<string, string> = key ? { authorization: `Bearer ${key}` } : {};
  const cacheKey = `${base}|${settings.model}`;
  return async (request) => {
    const known = quirks.get(cacheKey) ?? {};
    quirks.set(cacheKey, known);
    // Servers differ in what they accept. A rejected option is dropped and the call retried.
    for (let attempt = 0; ; attempt++) {
      const useSchema = !known.noSchema;
      const body: Record<string, unknown> = {
        model: settings.model,
        messages: [{ role: 'system', content: request.system }, ...request.turns],
        [known.newTokenParam ? 'max_completion_tokens' : 'max_tokens']: request.maxTokens,
        ...(known.noTemperature ? {} : { temperature: 0.4 }),
        ...(useSchema
          ? {
              response_format: {
                type: 'json_schema',
                json_schema: { name: request.schemaName, schema: request.schema },
              },
            }
          : {}),
      };
      let data: Loose;
      try {
        data = await post(`${base}/chat/completions`, headers, body, request.signal);
      } catch (error) {
        const rejected =
          error instanceof ModelFailure &&
          error.kind === 'network' &&
          /answered 4\d\d/.test(error.message);
        if (!rejected || attempt >= 3) throw error;
        const message = (error as ModelFailure).message;
        if (/max_completion_tokens/.test(message) && !known.newTokenParam)
          known.newTokenParam = true;
        else if (/temperature/.test(message) && !known.noTemperature) known.noTemperature = true;
        else if (useSchema) known.noSchema = true;
        else throw error;
        continue;
      }
      const message = data?.choices?.[0]?.message;
      return {
        text: String(message?.content ?? ''),
        tokensIn: Number(data?.usage?.prompt_tokens ?? 0),
        tokensOut: Number(data?.usage?.completion_tokens ?? 0),
        strategy: useSchema ? 'schema' : 'prompt',
        refused: Boolean(message?.refusal),
      };
    }
  };
}

function anthropic(settings: ModelSettings, env: Env): Adapter {
  const base = (settings.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
  const key = env[settings.keyEnv || 'ANTHROPIC_API_KEY'] ?? '';
  return async (request) => {
    const data: Loose = await post(
      `${base}/v1/messages`,
      { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      {
        model: settings.model,
        system: request.system,
        messages: request.turns,
        max_tokens: request.maxTokens,
      },
      request.signal,
    );
    const text = (data?.content ?? [])
      .filter((b: Loose) => b?.type === 'text')
      .map((b: Loose) => b.text)
      .join('');
    return {
      text,
      tokensIn: Number(data?.usage?.input_tokens ?? 0),
      tokensOut: Number(data?.usage?.output_tokens ?? 0),
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
  return async (request) => {
    const data: Loose = await post(
      `${base}/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`,
      { 'x-goog-api-key': key },
      {
        systemInstruction: { parts: [{ text: request.system }] },
        contents: request.turns.map((t) => ({
          role: t.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: t.content }],
        })),
        generationConfig: {
          maxOutputTokens: request.maxTokens,
          responseMimeType: 'application/json',
          temperature: 0.4,
        },
      },
      request.signal,
    );
    const candidate = data?.candidates?.[0];
    return {
      text: (candidate?.content?.parts ?? []).map((p: Loose) => p?.text ?? '').join(''),
      tokensIn: Number(data?.usageMetadata?.promptTokenCount ?? 0),
      tokensOut: Number(data?.usageMetadata?.candidatesTokenCount ?? 0),
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
