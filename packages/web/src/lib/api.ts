import {
  API_TOKEN_HEADER,
  ApiError,
  type CallView,
  Health,
  type ModelCheck,
  type ModelConfig,
  type ModelRole,
  type Moment,
  type MoveSpan,
  type ScenarioInfo,
  Session,
  type View,
} from '@statecraft/protocol';

export class ApiFailure extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let tokenRequest: Promise<string> | null = null;

function sessionToken(): Promise<string> {
  tokenRequest ??= fetch('/api/session')
    .then(async (response) => {
      if (!response.ok) throw new ApiFailure(response.status, 'Could not start a session.');
      return Session.parse(await response.json()).token;
    })
    .catch((error: unknown) => {
      tokenRequest = null;
      throw error;
    });
  return tokenRequest;
}

async function send(path: string, init: RequestInit, retry = true): Promise<Response> {
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set(API_TOKEN_HEADER, await sessionToken());
    if (init.body !== undefined) headers.set('Content-Type', 'application/json');
    response = await fetch(path, { ...init, headers });
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure(0, 'The StateCraft server is not responding. Is it still running?');
  }
  // The token changes when the server restarts; fetch a new one once.
  if (response.status === 401 && retry) {
    tokenRequest = null;
    return send(path, init, false);
  }
  if (!response.ok) {
    const body = ApiError.safeParse(await response.json().catch(() => null));
    throw new ApiFailure(
      response.status,
      body.success ? (body.data.detail ?? body.data.error) : `Request failed (${response.status}).`,
    );
  }
  return response;
}

/** The server builds these replies itself, so they are trusted as typed. */
async function get<T>(path: string): Promise<T> {
  return (await (await send(path, {})).json()) as T;
}
async function post<T>(path: string, body: unknown = {}, method = 'POST'): Promise<T> {
  return (await (await send(path, { method, body: JSON.stringify(body) })).json()) as T;
}

export interface ModelInfo {
  config: ModelConfig;
  /** Whether a key was found for the main model and for each role. */
  keys: Record<string, boolean>;
}

export const api = {
  health: async () => Health.parse(await get('/api/health')),
  view: () => get<View>('/api/view'),
  scenarios: () => get<ScenarioInfo[]>('/api/scenarios'),
  start: (scenarioId: string) => post<View>('/api/campaign', { scenarioId }),
  newCampaign: () => post<View>('/api/campaign/new'),
  addCard: (text: string) => post<unknown>('/api/cards', { text }),
  deleteCard: async (id: string): Promise<void> => {
    await send(`/api/cards/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  patchCard: (id: string, patch: { text?: string; pinned?: boolean; beforeId?: string | null }) =>
    post<View>(`/api/cards/${encodeURIComponent(id)}`, patch, 'PATCH'),
  execute: (mixedSignals: boolean, days: number) =>
    post<View>('/api/execute', { mixedSignals, days }),
  advance: (days: number) => post<View>('/api/advance', { days }),
  move: (span: MoveSpan, mixedSignals = false) => post<View>('/api/move', { span, mixedSignals }),
  expandEntry: (id: string) => post<View>(`/api/entries/${encodeURIComponent(id)}/expand`),
  ask: (actorId: string, question: string) => post<View>('/api/ask', { actorId, question }),
  moment: (turnId: string) => get<Moment>(`/api/moment/${encodeURIComponent(turnId)}`),
  markRead: (actorId: string) => post<View>(`/api/people/${encodeURIComponent(actorId)}/read`),
  cancel: () => post<View>('/api/cancel'),
  repeal: (id: string) => post<View>(`/api/policies/${encodeURIComponent(id)}/repeal`),
  rewind: (seq: number) => post<View>('/api/rewind', { seq }),
  rewindToDate: (date: string) => post<View>('/api/rewind', { date }),
  map: () => get<{ regions: unknown; world: unknown } | null>('/api/map'),
  model: () => get<ModelInfo>('/api/model'),
  saveModel: (config: ModelConfig) => post<ModelInfo>('/api/model', config, 'PUT'),
  checkModel: (role?: ModelRole) => post<ModelCheck>('/api/model/check', role ? { role } : {}),
  /**
   * The server's live line. `onChange` is called every time the state changes, so the screen
   * is pushed to instead of asking over and over while a turn runs. `onDraft` is called with
   * prose as it is being written: the id of what it will become and its text so far, or null
   * once the writing has ended. Resolves when the line closes; the caller reopens it.
   */
  stream: async (
    handlers: { onChange: () => void; onDraft: (id: string, text: string | null) => void },
    signal: AbortSignal,
  ): Promise<void> => {
    const response = await send('/api/stream', { signal });
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = '';
    let event = 'message';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        // Lines beginning with a colon are keep-alives and carry nothing.
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line === '') event = 'message';
        else if (line.startsWith('data:')) {
          if (event !== 'draft') handlers.onChange();
          else {
            try {
              const draft = JSON.parse(line.slice(5)) as { id: string; text: string | null };
              handlers.onDraft(draft.id, draft.text);
            } catch {
              // A line cut short tells nothing; the next one carries the whole text again.
            }
          }
        }
      }
    }
  },
  calls: (resolution?: string) =>
    get<CallView[]>(
      `/api/calls${resolution ? `?resolution=${encodeURIComponent(resolution)}` : ''}`,
    ),
  debugWorld: () => get<unknown>('/api/debug/world'),
};
