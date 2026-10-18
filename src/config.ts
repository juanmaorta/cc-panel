import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Result } from './types.ts';
import { isHost } from './validate.ts';

export interface HubConfig {
  bind: string;
  port: number;
  stateFile: string;
}

export interface Config {
  /** Name this machine reports as. */
  host: string;
  /** Where this machine's reporter sends events. */
  hubUrl: string;
  token: string;
  /** Only used on the machine that runs the hub. */
  hub: HubConfig;
}

export const DEFAULT_PORT = 7420;
const MIN_TOKEN = 32;

export function configPath(home = homedir()): string {
  return process.env.CC_PANEL_CONFIG ?? join(home, '.config', 'cc-panel', 'config.json');
}

export function defaultHostName(raw: string): string {
  return raw
    .replace(/\.local$/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function parseConfig(raw: unknown, home: string): Result<Config> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'config must be an object' };
  const c = raw as Record<string, unknown>;
  const hub = (typeof c.hub === 'object' && c.hub !== null ? c.hub : {}) as Record<string, unknown>;

  if (typeof c.token !== 'string' || c.token.length < MIN_TOKEN) {
    return { ok: false, error: `token must be a string of at least ${MIN_TOKEN} chars` };
  }
  if (!isHost(c.host)) return { ok: false, error: 'host must match [A-Za-z0-9._-]{1,64}' };

  const port = hub.port ?? DEFAULT_PORT;
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: 'hub.port must be 1-65535' };
  }
  const bind = hub.bind ?? '127.0.0.1';
  if (typeof bind !== 'string') return { ok: false, error: 'hub.bind must be a string' };
  const stateFile = hub.stateFile ?? join(home, '.local', 'state', 'cc-panel', 'state.json');
  if (typeof stateFile !== 'string') return { ok: false, error: 'hub.stateFile must be a string' };

  const hubUrl = c.hubUrl ?? `http://127.0.0.1:${port}`;
  if (typeof hubUrl !== 'string' || !URL.canParse(hubUrl) || !/^https?:$/.test(new URL(hubUrl).protocol)) {
    return { ok: false, error: 'hubUrl must be an http(s) URL' };
  }

  return { ok: true, value: { host: c.host, hubUrl, token: c.token, hub: { bind, port, stateFile } } };
}

export function loadConfig(file = configPath()): Config {
  const parsed = parseConfig(JSON.parse(readFileSync(file, 'utf8')), homedir());
  if (!parsed.ok) throw new Error(`${file}: ${parsed.error}`);
  return parsed.value;
}
