import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import { DirectorError } from '@statecraft/director';
import { ENGINE_VERSION } from '@statecraft/engine';
import { checkModel } from '@statecraft/models';
import {
  AdvanceRequest,
  ExecuteRequest,
  type Health,
  ModelSettings,
  NewPolicyCard,
  type PolicyCard,
  RewindRequest,
  SCHEMA_VERSION,
  type Session,
  StartRequest,
} from '@statecraft/protocol';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import type { z } from 'zod';
import type { Game } from './game.ts';
import { createGuard } from './security.ts';

export interface AppOptions {
  game: Game;
  token: string;
  allowedOrigins: readonly string[];
  version: string;
  /** Folder holding the built web app. When absent, only the API is served. */
  webDist?: string;
  logger?: boolean;
}

const STATUS: Record<DirectorError['code'], number> = {
  no_campaign: 409,
  busy: 409,
  nothing_to_do: 400,
  not_found: 404,
  bad_request: 400,
};

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { game, token, allowedOrigins, version, webDist } = options;
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 256 * 1024 });

  app.addHook('onRequest', createGuard({ token, allowedOrigins }));
  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cache-Control', 'no-store');
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DirectorError) {
      return reply.code(STATUS[error.code]).send({ error: error.code, detail: error.message });
    }
    app.log.error(error);
    return reply
      .code(500)
      .send({ error: 'internal', detail: 'Something went wrong on the server.' });
  });

  /** Parses a request body, or answers 400 and returns undefined. */
  const body = <S extends z.ZodType>(
    schema: S,
    value: unknown,
    reply: FastifyReply,
    detail: string,
  ) => {
    const parsed = schema.safeParse(value ?? {});
    if (parsed.success) return parsed.data as z.infer<S>;
    reply.code(400).send({ error: 'invalid_request', detail });
    return undefined;
  };
  const view = () => game.director().view();

  app.get('/api/session', async (): Promise<Session> => ({ token }));
  app.get(
    '/api/health',
    async (): Promise<Health> => ({
      ok: true,
      version,
      engineVersion: ENGINE_VERSION,
      schemaVersion: SCHEMA_VERSION,
      events: game.ledger().count(),
    }),
  );

  app.get('/api/view', async () => view());
  app.get('/api/scenarios', async () => game.director().scenarios());

  app.post('/api/campaign', async (request, reply) => {
    const data = body(StartRequest, request.body, reply, 'Choose a scenario.');
    if (!data) return reply;
    game.director().start(data.scenarioId);
    return reply.code(201).send(view());
  });
  app.post('/api/campaign/new', async () => {
    if (view().running) throw new DirectorError('busy', 'A resolution is still running.');
    game.newCampaign();
    return view();
  });

  app.post('/api/cards', async (request, reply) => {
    const data = body(
      NewPolicyCard,
      request.body,
      reply,
      'A policy box needs between 1 and 2,000 characters of text.',
    );
    if (!data) return reply;
    const card: PolicyCard = {
      id: randomUUID(),
      text: data.text,
      source: data.source ?? 'composer',
      createdAt: new Date().toISOString(),
    };
    game.director().addCard(card);
    return reply.code(201).send(card);
  });
  app.delete<{ Params: { id: string } }>('/api/cards/:id', async (request, reply) => {
    game.director().deleteCard(request.params.id);
    return reply.code(204).send();
  });

  app.post('/api/execute', async (request, reply) => {
    const data = body(ExecuteRequest, request.body, reply, 'Bad request.');
    if (!data) return reply;
    game.director().execute(data.mixedSignals);
    return reply.code(202).send(view());
  });
  app.post('/api/advance', async (request, reply) => {
    const data = body(
      AdvanceRequest,
      request.body,
      reply,
      'Time can be advanced by 1 to 183 days.',
    );
    if (!data) return reply;
    game.director().advance(data.days);
    return reply.code(202).send(view());
  });
  app.post('/api/cancel', async () => {
    game.director().cancel();
    return view();
  });
  app.post<{ Params: { id: string } }>('/api/policies/:id/repeal', async (request) => {
    game.director().repeal(request.params.id);
    return view();
  });
  app.post('/api/rewind', async (request, reply) => {
    const data = body(RewindRequest, request.body, reply, 'Choose a point on the timeline.');
    if (!data) return reply;
    game.director().rewind(data.seq);
    return view();
  });

  const modelInfo = () => ({ settings: game.settings(), keyPresent: game.hasKey() });
  app.get('/api/model', async () => modelInfo());
  app.put('/api/model', async (request, reply) => {
    const data = body(ModelSettings, request.body, reply, 'Those model settings are not valid.');
    if (!data) return reply;
    game.saveSettings(data);
    return modelInfo();
  });
  app.post('/api/model/check', async () => checkModel(game.settings()));

  app.get<{ Querystring: { resolution?: string } }>('/api/calls', async (request) =>
    game.director().calls(request.query.resolution),
  );
  app.get('/api/debug/world', async () => game.director().debugWorld());

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
