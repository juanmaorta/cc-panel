import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import { loadStore, saveStore } from './persist.ts';
import { applyEvent, applyHeartbeat, buildView, prune, type ViewOptions } from './state.ts';
import type { Store } from './types.ts';
import { parseEvent, parseHeartbeat } from './validate.ts';

const MAX_BODY = 16 * 1024;
/** Browser modules are authored in TS and served type-stripped: no build step. */
const UI_MODULE = /^\/ui\/([a-z0-9-]+)\.ts$/;

export interface HubOptions {
  token: string;
  publicDir: string;
  uiDir: string;
  stateFile: string;
  view: ViewOptions;
  retentionMs: number;
  saveDebounceMs: number;
  now?: () => number;
  log?: (msg: string) => void;
}

export interface Hub {
  server: Server;
  snapshot(): Store;
  flush(): Promise<void>;
  close(): Promise<void>;
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const digest = (s: string) => createHash('sha256').update(s).digest();

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'body too large'));
        req.resume();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'invalid json'));
      }
    });
    req.on('error', reject);
  });
}

export function createHub(opts: HubOptions): Hub {
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((m: string) => console.error(`[cc-panel] ${m}`));
  const tokenDigest = digest(opts.token);
  let store = prune(loadStore(opts.stateFile, log), now(), opts.retentionMs);
  let saveTimer: NodeJS.Timeout | undefined;

  const save = () => {
    saveTimer = undefined;
    try {
      store = prune(store, now(), opts.retentionMs);
      saveStore(opts.stateFile, store);
    } catch (err) {
      log(`failed to persist state: ${String(err)}`);
    }
  };
  const scheduleSave = () => {
    saveTimer ??= setTimeout(save, opts.saveDebounceMs);
  };

  const authorized = (req: IncomingMessage) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return false;
    return timingSafeEqual(digest(h.slice(7)), tokenDigest);
  };

  const send = (res: ServerResponse, status: number, body?: unknown) => {
    if (body === undefined) {
      res.writeHead(status).end();
      return;
    }
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body));
  };

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = new URL(req.url ?? '/', 'http://x').pathname;

    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      const html = await readFile(join(opts.publicDir, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html);
      return;
    }
    const ui = req.method === 'GET' ? UI_MODULE.exec(path) : null;
    if (ui) {
      let source: string;
      try {
        source = await readFile(join(opts.uiDir, `${ui[1]}.ts`), 'utf8');
      } catch {
        throw new HttpError(404, 'not found');
      }
      res
        .writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
        .end(stripTypeScriptTypes(source));
      return;
    }
    if (!path.startsWith('/api/')) throw new HttpError(404, 'not found');
    if (!authorized(req)) throw new HttpError(401, 'unauthorized');

    if (req.method === 'GET' && path === '/api/state') {
      send(res, 200, buildView(store, now(), opts.view));
      return;
    }
    if (req.method === 'POST' && path === '/api/events') {
      const parsed = parseEvent(await readJson(req));
      if (!parsed.ok) throw new HttpError(400, parsed.error);
      store = applyEvent(store, parsed.value);
      scheduleSave();
      send(res, 204);
      return;
    }
    if (req.method === 'POST' && path === '/api/heartbeat') {
      const parsed = parseHeartbeat(await readJson(req));
      if (!parsed.ok) throw new HttpError(400, parsed.error);
      store = applyHeartbeat(store, parsed.value);
      scheduleSave();
      send(res, 204);
      return;
    }
    throw new HttpError(404, 'not found');
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      if (err instanceof HttpError) {
        send(res, err.status, { error: err.message });
        return;
      }
      log(`unhandled error: ${String(err)}`);
      send(res, 500, { error: 'internal error' });
    });
  });

  return {
    server,
    snapshot: () => store,
    async flush() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        save();
      }
    },
    async close() {
      await this.flush();
      await new Promise<void>((r) => (server.listening ? server.close(() => r()) : r()));
    },
  };
}
