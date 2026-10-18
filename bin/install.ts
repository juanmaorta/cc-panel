// Usage:
//   node bin/install.ts install [--host NAME] [--hub-url URL] [--token T] [--bind ADDR] [--no-hub]
//   node bin/install.ts uninstall
// Hub machine:      install (optionally --bind <tailscale-ip>)
// Reporter-only:    install --no-hub --hub-url http://<hub>:7420 --token <hub token>
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { configPath, defaultHostName, parseConfig } from '../src/config.ts';
import { CODEX_SPEC, installHooks, uninstallHooks } from '../src/hooks-config.ts';
import { renderPlist, type JobSpec } from '../src/launchd.ts';

const HOME = homedir();
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NODE = process.execPath;
const SETTINGS = join(HOME, '.claude', 'settings.json');
const CODEX_DIR = join(HOME, '.codex');
const CODEX_HOOKS = join(CODEX_DIR, 'hooks.json');
const AGENTS = join(HOME, 'Library', 'LaunchAgents');
const LOGS = join(HOME, 'Library', 'Logs', 'cc-panel');
const DOMAIN = `gui/${process.getuid?.() ?? 501}`;
const HUB_LABEL = 'com.cc-panel.hub';
const HB_LABEL = 'com.cc-panel.heartbeat';

const reportCmd = (mode: string) => `"${NODE}" "${join(ROOT, 'bin', 'report.ts')}" ${mode}`;

/** Rewrites a JSON hooks file through `transform`, keeping a backup next to it. */
function rewriteJson(file: string, transform: (s: Record<string, unknown>) => Record<string, unknown>): void {
  const current = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : {};
  if (existsSync(file)) copyFileSync(file, `${file}.bak-cc-panel`);
  writeFileSync(file, `${JSON.stringify(transform(current), null, 2)}\n`);
}

function launchctl(...args: string[]): void {
  execFileSync('launchctl', args, { stdio: 'ignore' });
}

function isLoaded(label: string): boolean {
  try {
    launchctl('print', `${DOMAIN}/${label}`);
    return true;
  } catch {
    return false;
  }
}

function unload(label: string): void {
  try {
    launchctl('bootout', `${DOMAIN}/${label}`);
  } catch {
    // not loaded
  }
  // bootout returns before the job is gone; bootstrapping too early fails with EIO (5).
  const deadline = Date.now() + 5000;
  while (isLoaded(label)) {
    if (Date.now() > deadline) throw new Error(`launchd did not unload ${label}`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  rmSync(join(AGENTS, `${label}.plist`), { force: true });
}

function load(job: JobSpec): void {
  unload(job.label);
  mkdirSync(AGENTS, { recursive: true });
  const file = join(AGENTS, `${job.label}.plist`);
  writeFileSync(file, renderPlist(job));
  launchctl('bootstrap', DOMAIN, file);
}

function install(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      host: { type: 'string' },
      'hub-url': { type: 'string' },
      token: { type: 'string' },
      bind: { type: 'string' },
      'no-hub': { type: 'boolean', default: false },
    },
  });

  const file = configPath(HOME);
  const raw: Record<string, unknown> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  raw.host = values.host ?? raw.host ?? defaultHostName(hostname());
  raw.token = values.token ?? raw.token ?? randomBytes(32).toString('base64url');
  if (values['hub-url']) raw.hubUrl = values['hub-url'];
  if (values.bind) raw.hub = { ...(raw.hub as object | undefined), bind: values.bind };

  const parsed = parseConfig(raw, HOME);
  if (!parsed.ok) throw new Error(`invalid config: ${parsed.error}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, { mode: 0o600 });

  rewriteJson(SETTINGS, (s) => installHooks(s, reportCmd('event')));
  const codex = existsSync(CODEX_DIR);
  if (codex) rewriteJson(CODEX_HOOKS, (s) => installHooks(s, reportCmd('event codex'), CODEX_SPEC));

  mkdirSync(LOGS, { recursive: true });
  if (values['no-hub']) {
    unload(HUB_LABEL);
  } else {
    load({ label: HUB_LABEL, args: [NODE, '--disable-warning=ExperimentalWarning', join(ROOT, 'bin', 'hub.ts')], keepAlive: true, logFile: join(LOGS, 'hub.log') });
  }
  load({ label: HB_LABEL, args: [NODE, join(ROOT, 'bin', 'report.ts'), 'heartbeat'], intervalSec: 60, logFile: join(LOGS, 'heartbeat.log') });

  const c = parsed.value;
  console.log(`config:   ${file}`);
  console.log(`host:     ${c.host}`);
  console.log(`reports → ${c.hubUrl}`);
  if (!values['no-hub']) console.log(`panel:    http://${c.hub.bind === '0.0.0.0' ? 'localhost' : c.hub.bind}:${c.hub.port}/#token=${c.token}`);
  console.log(`hooks:    ${SETTINGS} (backup at settings.json.bak-cc-panel)`);
  if (codex) console.log(`          ${CODEX_HOOKS} (backup at hooks.json.bak-cc-panel); Codex asks you to trust new hooks once`);
  console.log(`node:     ${NODE}  — re-run install after switching Node versions`);
}

function uninstall(): void {
  rewriteJson(SETTINGS, uninstallHooks);
  if (existsSync(CODEX_HOOKS)) rewriteJson(CODEX_HOOKS, uninstallHooks);
  unload(HUB_LABEL);
  unload(HB_LABEL);
  console.log('hooks and launchd jobs removed; config and state left in place');
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'install') install(rest);
else if (cmd === 'uninstall') uninstall();
else {
  console.error('usage: install.ts install|uninstall [options]');
  process.exit(1);
}
