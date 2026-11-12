import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION } from '@statecraft/engine';
import { openLedger } from '@statecraft/ledger';
import { buildApp } from './app.ts';
import { openBrowser } from './open-browser.ts';
import { newSessionToken } from './security.ts';

const HOST = '127.0.0.1';
const root = fileURLToPath(new URL('../../..', import.meta.url));
const flags = new Set(process.argv.slice(2));
const dev = flags.has('--dev');

const port = Number(process.env.STATECRAFT_PORT ?? 4317);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`STATECRAFT_PORT must be a port number, got "${process.env.STATECRAFT_PORT}".`);
  process.exit(1);
}
const dataDir = resolve(root, process.env.STATECRAFT_DATA ?? 'data');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  version: string;
};

const allowedOrigins = [`http://${HOST}:${port}`, `http://localhost:${port}`];
// In development the page is served by Vite on its own port and proxies /api here.
if (dev) allowedOrigins.push('http://localhost:5173', 'http://127.0.0.1:5173');

const ledger = openLedger(join(dataDir, 'campaign.statecraft'), ENGINE_VERSION);
const app = await buildApp({
  ledger,
  token: newSessionToken(),
  allowedOrigins,
  version,
  webDist: join(root, 'packages/web/dist'),
});

const shutdown = async (): Promise<void> => {
  await app.close();
  ledger.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await app.listen({ host: HOST, port });
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  console.error(
    code === 'EADDRINUSE'
      ? `Port ${port} is already in use. Close the other StateCraft window, or set STATECRAFT_PORT to another port.`
      : error,
  );
  ledger.close();
  process.exit(1);
}

const url = `http://${HOST}:${port}`;
console.log(dev ? `StateCraft API listening on ${url}` : `StateCraft is running at ${url}`);
console.log(`Campaign file: ${join(dataDir, 'campaign.statecraft')}`);
if (flags.has('--open')) openBrowser(url);
