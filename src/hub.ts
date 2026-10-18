import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
import { basename, join } from 'node:path';
import { loadStore, saveStore } from './persist.ts';
import { applyEvent, applyHeartbeat, applyRelaySeen, buildView, prune, sessionKey, type ViewOptions } from './state.ts';
import type { FocusCommand, Store } from './types.ts';
import { isHost, parseEvent, parseFocusRequest, parseHeartbeat } from './validate.ts';

const MAX_BODY = 16 * 1024;
/** Browser modules are authored in TS and served type-stripped: no build step. */
const UI_MODULE = /^\/ui\/([a-z0-9-]+)\.ts$/;
const FONT = /^\/fonts\/([A-Za-z0-9-]+)\.woff$/;
/** A focus click older than this is not worth acting on. */
const FOCUS_TTL_MS = 10_000;
const DEFAULT_RELAY_WAIT_MS = 25_000;
const DEFAULT_RELAY_TTL_MS = 60_000;


export interface HubOptions {
  token: string;
  publicDir: string;
  uiDir: string;
  stateFile: string;
  view: ViewOptions;
  retentionMs: number;
  saveDebounceMs: number;
  /** How long a relay long-poll is held open before answering 204. */
  relayWaitMs?: number;
  /** Shown in the UI when a host has cmux sessions but no relay. */
  relayCommand?: string;
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

  const relayWaitMs = opts.relayWaitMs ?? DEFAULT_RELAY_WAIT_MS;
  const relayTtlMs = opts.view.relayTtlMs ?? DEFAULT_RELAY_TTL_MS;
  /** One pending focus per host: a newer click replaces an older one. */
  const pending = new Map<string, { cmd: FocusCommand; at: number }>();
  /** Relays currently long-polling, per host. */
  const waiters = new Map<string, Set<(cmd: FocusCommand | null) => void>>();

  const relayAlive = (host: string) => {
    const seen = store.hosts[host]?.relaySeenAt;
    return seen !== undefined && now() - seen <= relayTtlMs;
  };

  function takePending(host: string): FocusCommand | null {
    const p = pending.get(host);
    pending.delete(host);
    return p && now() - p.at <= FOCUS_TTL_MS ? p.cmd : null;
  }

  function deliver(host: string, cmd: FocusCommand): void {
    const set = waiters.get(host);
    const first = set?.values().next().value;
    if (first) {
      first(cmd);
      return;
    }
    pending.set(host, { cmd, at: now() });
  }

  function relayNext(host: string, req: IncomingMessage, res: ServerResponse): void {
    store = applyRelaySeen(store, host, now());
    scheduleSave();
    const ready = takePending(host);
    if (ready) {
      send(res, 200, ready);
      return;
    }
    const set = waiters.get(host) ?? new Set();
    waiters.set(host, set);
    const finish = (cmd: FocusCommand | null) => {
      clearTimeout(timer);
      set.delete(finish);
      if (res.writableEnded) return;
      if (cmd) send(res, 200, cmd);
      else send(res, 204);
    };
    const timer = setTimeout(() => {
      store = applyRelaySeen(store, host, now());
      finish(null);
    }, relayWaitMs);
    set.add(finish);
    req.on('close', () => {
      clearTimeout(timer);
      set.delete(finish);
    });
  }

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
    const font = req.method === 'GET' ? FONT.exec(path) : null;
    if (font) {
      let data: Buffer;
      try {
        data = await readFile(join(opts.publicDir, 'fonts', `${font[1]}.woff`));
      } catch {
        throw new HttpError(404, 'not found');
      }
      res.writeHead(200, { 'content-type': 'font/woff', 'cache-control': 'public, max-age=604800' }).end(data);
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

    if (req.method === 'GET' && path === '/api/relay/next') {
      const host = new URL(req.url ?? '/', 'http://x').searchParams.get('host');
      if (!isHost(host)) throw new HttpError(400, 'invalid host');
      relayNext(host, req, res);
      return;
    }
    if (req.method === 'POST' && path === '/api/focus') {
      const parsed = parseFocusRequest(await readJson(req));
      if (!parsed.ok) throw new HttpError(400, parsed.error);
      const { host, sessionId } = parsed.value;
      const session = store.sessions[sessionKey(host, sessionId)];
      if (!session) throw new HttpError(404, 'unknown session');
      if (!session.cmux) throw new HttpError(409, 'session is not running in cmux');
      if (!relayAlive(host)) throw new HttpError(409, 'no cmux relay for this host');
      deliver(host, { ...session.cmux, project: session.name ?? (basename(session.cwd) || session.cwd) });
      send(res, 202);
      return;
    }
    if (req.method === 'GET' && path === '/api/state') {
      const view = buildView(store, now(), opts.view);
      send(res, 200, opts.relayCommand ? { ...view, relayCommand: opts.relayCommand } : view);
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
      // Release held long-polls, or server.close() would wait for them.
      for (const set of waiters.values()) for (const finish of [...set]) finish(null);
      await this.flush();
      await new Promise<void>((r) => (server.listening ? server.close(() => r()) : r()));
    },
  };
}
