// Run this in a cmux tab and leave it open: it brings a session's tab to the front when
// you click its tile in the panel. cmux only accepts commands from processes started
// inside cmux, which is why this lives in a visible tab instead of launchd.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from '../src/config.ts';
import { backoffMs, focusArgv, insideCmux, parseFocusCommand } from '../src/relay.ts';

const run = promisify(execFile);
const POLL_TIMEOUT_MS = 40_000; // the hub holds the request for up to 25s
const EXEC_TIMEOUT_MS = 5_000;
const DEFAULT_CMUX = '/Applications/cmux.app/Contents/Resources/bin/cmux';

const stamp = () => new Date().toLocaleTimeString('es-ES');
const log = (msg: string) => console.log(`[${stamp()}] ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (!insideCmux(process.env)) {
  console.error('cc-panel relay must run inside a cmux terminal (cmux rejects other processes).');
  process.exit(1);
}

const config = loadConfig();
const cmuxBin = process.env.CMUX_BUNDLED_CLI_PATH || DEFAULT_CMUX;
const url = new URL('/api/relay/next', config.hubUrl);
url.searchParams.set('host', config.host);

let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    stopping = true;
    log('bye');
    process.exit(0);
  });
}

log(`relay for "${config.host}" → ${config.hubUrl}. Leave this tab open; Ctrl-C to stop.`);

let failures = 0;
while (!stopping) {
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
    });
    if (res.status === 204) {
      failures = 0;
      continue;
    }
    if (!res.ok) throw new Error(`hub responded ${res.status}`);
    failures = 0;
    const cmd = parseFocusCommand(await res.json());
    if (!cmd.ok) {
      log(`ignored invalid command: ${cmd.error}`);
      continue;
    }
    for (const [bin, ...args] of focusArgv(cmd.value, cmuxBin)) {
      await run(bin!, args, { timeout: EXEC_TIMEOUT_MS });
    }
    log(`→ ${cmd.value.project}`);
  } catch (err) {
    const wait = backoffMs(failures++);
    log(`${err instanceof Error ? err.message : String(err)}; retrying in ${wait / 1000}s`);
    await sleep(wait);
  }
}
