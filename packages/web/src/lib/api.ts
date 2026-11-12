import {
  API_TOKEN_HEADER,
  ApiError,
  CardList,
  Health,
  PolicyCard,
  Session,
} from '@statecraft/protocol';
import type { z } from 'zod';

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

async function read<S extends z.ZodType>(schema: S, path: string, init: RequestInit = {}) {
  const response = await send(path, init);
  return schema.parse(await response.json()) as z.infer<S>;
}

export const api = {
  health: () => read(Health, '/api/health'),
  listCards: async () => (await read(CardList, '/api/cards')).cards,
  addCard: (text: string) =>
    read(PolicyCard, '/api/cards', { method: 'POST', body: JSON.stringify({ text }) }),
  deleteCard: async (id: string): Promise<void> => {
    await send(`/api/cards/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
