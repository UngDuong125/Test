import { appendFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const logPath = path.resolve(__dirname, '../../../debug-a7d7cc.log');

function agentLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>,
) {
  const payload = {
    sessionId: 'a7d7cc',
    runId: 'pre-fix',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  // #region agent log
  try {
    appendFileSync(logPath, `${JSON.stringify(payload)}\n`);
  } catch {
    /* ignore */
  }
  fetch('http://127.0.0.1:7601/ingest/25081864-4aff-45e3-a9a9-8666ea9c0d2c', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': 'a7d7cc',
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion
}

async function boot() {
  const cwd = process.cwd();
  const rootMulter = path.resolve(cwd, 'node_modules/multer/package.json');
  const parentMulter = path.resolve(cwd, '../node_modules/multer/package.json');
  const backendMulter = path.resolve(__dirname, '../../node_modules/multer/package.json');

  let resolved: string | null = null;
  let resolveError: string | null = null;
  try {
    resolved = require.resolve('multer');
  } catch (err) {
    resolveError = err instanceof Error ? `${(err as NodeJS.ErrnoException).code}: ${err.message}` : String(err);
  }

  // A: incomplete install / multer missing on disk
  agentLog('A', 'server.ts:boot', 'multer disk presence', {
    cwd,
    rootMulterExists: existsSync(rootMulter),
    parentMulterExists: existsSync(parentMulter),
    backendMulterExists: existsSync(backendMulter),
    dirname: __dirname,
  });

  // B/C: require.resolve from server.ts context vs cwd
  agentLog('B', 'server.ts:boot', 'multer require.resolve', {
    resolved,
    resolveError,
    cwd,
  });

  // D: dynamic import createApp (pulls upload.routes → multer)
  try {
    const { createApp } = await import('./app.js');
    const { env } = await import('./config/env.js');
    agentLog('D', 'server.ts:boot', 'createApp import success', {
      port: env.PORT,
    });
    const app = createApp();
    app.listen(env.PORT, () => {
      agentLog('E', 'server.ts:listen', 'API listening', { port: env.PORT });
      console.log(`API listening on http://localhost:${env.PORT}`);
      console.log(`CORS origin: ${env.FRONTEND_ORIGIN}`);
    });
  } catch (err) {
    agentLog('D', 'server.ts:boot', 'createApp import FAILED', {
      code: err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined,
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : typeof err,
    });
    throw err;
  }
}

void boot();
