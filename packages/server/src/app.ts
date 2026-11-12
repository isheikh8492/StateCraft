import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import { ENGINE_VERSION } from '@statecraft/engine';
import type { Ledger } from '@statecraft/ledger';
import {
  type CardList,
  type Health,
  NewPolicyCard,
  type PolicyCard,
  SCHEMA_VERSION,
  type Session,
} from '@statecraft/protocol';
import Fastify, { type FastifyInstance } from 'fastify';
import { createGuard } from './security.ts';

export interface AppOptions {
  ledger: Ledger;
  token: string;
  allowedOrigins: readonly string[];
  version: string;
  /** Folder holding the built web app. When absent, only the API is served. */
  webDist?: string;
  logger?: boolean;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { ledger, token, allowedOrigins, version, webDist } = options;
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 256 * 1024 });

  app.addHook('onRequest', createGuard({ token, allowedOrigins }));
  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cache-Control', 'no-store');
  });

  app.get('/api/session', async (): Promise<Session> => ({ token }));

  app.get(
    '/api/health',
    async (): Promise<Health> => ({
      ok: true,
      version,
      engineVersion: ENGINE_VERSION,
      schemaVersion: SCHEMA_VERSION,
      events: ledger.count(),
    }),
  );

  app.get('/api/cards', async (): Promise<CardList> => ({ cards: ledger.draftCards() }));

  app.post('/api/cards', async (request, reply) => {
    const parsed = NewPolicyCard.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_card',
        detail: 'A policy box needs between 1 and 2,000 characters of text.',
      });
    }
    const card: PolicyCard = {
      id: randomUUID(),
      text: parsed.data.text,
      source: parsed.data.source,
      createdAt: new Date().toISOString(),
    };
    ledger.append({ type: 'card.created', card });
    return reply.code(201).send(card);
  });

  app.delete<{ Params: { id: string } }>('/api/cards/:id', async (request, reply) => {
    const { id } = request.params;
    if (!ledger.draftCards().some((card) => card.id === id)) {
      return reply.code(404).send({ error: 'not_found', detail: 'No such policy box.' });
    }
    ledger.append({ type: 'card.deleted', cardId: id });
    return reply.code(204).send();
  });

  if (webDist !== undefined && existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not_found' });
    });
  } else {
    app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'not_found' }));
  }

  return app;
}
