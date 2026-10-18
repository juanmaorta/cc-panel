// Claude Code hook / launchd entrypoint. Must stay silent on stdout (SessionStart and
// UserPromptSubmit inject hook stdout into the model context) and must never fail the hook.
import { appendFileSync, mkdirSync, readFileSync, statSync, truncateSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import { loadConfig } from '../src/config.ts';
import { parseStatusline } from '../src/limits.ts';
import { post, toHubEvent } from '../src/report.ts';

const TIMEOUT_MS = 800;
const LOG_DIR = join(homedir(), '.local', 'state', 'cc-panel');
const LOG_FILE = join(LOG_DIR, 'report.log');
/** Written by ~/.claude/statusline.sh on every render. */
const STATUSLINE_FILE = join(LOG_DIR, 'statusline-last.json');
const MAX_LOG = 512 * 1024;

function logError(msg: string): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    try {
      if (statSync(LOG_FILE).size > MAX_LOG) truncateSync(LOG_FILE, 0);
    } catch {}
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

function readLimits() {
  try {
    const observedAt = statSync(STATUSLINE_FILE).mtimeMs;
    return parseStatusline(JSON.parse(readFileSync(STATUSLINE_FILE, 'utf8')), Math.round(observedAt)) ?? undefined;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') logError(`statusline: ${String(err)}`);
    return undefined;
  }
}

async function main(mode: string | undefined): Promise<void> {
  const config = loadConfig();
  if (mode === 'event') {
    const ev = toHubEvent(JSON.parse(await text(process.stdin)), config.host, Date.now(), process.env);
    if (ev) await post(config.hubUrl, config.token, '/api/events', ev, TIMEOUT_MS);
    return;
  }
  if (mode === 'heartbeat') {
    const limits = readLimits();
    await post(config.hubUrl, config.token, '/api/heartbeat', { host: config.host, ts: Date.now(), ...(limits && { limits }) }, TIMEOUT_MS);
    return;
  }
  throw new Error(`unknown mode: ${mode}`);
}

main(process.argv[2])
  .catch((err: unknown) => logError(`${process.argv[2]}: ${err instanceof Error ? err.message : String(err)}`))
  .finally(() => process.exit(0));
