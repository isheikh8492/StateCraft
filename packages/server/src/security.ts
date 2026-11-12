/**
 * The server holds API keys and listens on the local machine, so it defends itself against
 * other web pages open in the same browser (requirements REQ-SEC-01 to REQ-SEC-04):
 *  - Host must be this server, which blocks DNS rebinding.
 *  - Origin, when the browser sends one, must be a page this server trusts.
 *  - Every API route except the token handshake needs the per-run session token.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { API_TOKEN_HEADER } from '@statecraft/protocol';
import type { FastifyReply, FastifyRequest } from 'fastify';

export interface GuardOptions {
  token: string;
  /** Origins allowed to call the API, such as http://127.0.0.1:4317. */
  allowedOrigins: readonly string[];
}

export const newSessionToken = (): string => randomBytes(32).toString('base64url');

function sameToken(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createGuard({ token, allowedOrigins }: GuardOptions) {
  const origins = new Set(allowedOrigins);
  const hosts = new Set(allowedOrigins.map((origin) => new URL(origin).host));

  return async function guard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!hosts.has(request.headers.host ?? '')) {
      return reply.code(403).send({ error: 'forbidden', detail: 'Unknown host.' });
    }
    const origin = request.headers.origin;
    if (origin !== undefined && !origins.has(origin)) {
      return reply.code(403).send({ error: 'forbidden', detail: 'Unknown origin.' });
    }
    const path = request.url.split('?')[0] ?? '';
    if (!path.startsWith('/api/')) return;

    if (path === '/api/session') {
      // Browsers label cross-site requests; refuse the handshake to any other site.
      const site = request.headers['sec-fetch-site'];
      if (site !== undefined && site !== 'same-origin' && site !== 'none') {
        return reply.code(403).send({ error: 'forbidden', detail: 'Cross-site request.' });
      }
      return;
    }
    if (!sameToken(request.headers[API_TOKEN_HEADER], token)) {
      return reply.code(401).send({ error: 'unauthorized', detail: 'Missing or wrong token.' });
    }
  };
}
