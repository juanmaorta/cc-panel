import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.ts';
import { createHub } from '../src/hub.ts';

const MIN = 60_000;
const HOUR = 60 * MIN;

const config = loadConfig();
const hub = createHub({
  token: config.token,
  publicDir: fileURLToPath(new URL('../public/', import.meta.url)),
  uiDir: fileURLToPath(new URL('../src/ui/', import.meta.url)),
  relayCommand: `cd ${fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '').replace(homedir(), '~')} && npm run relay`,
  stateFile: config.hub.stateFile,
  view: { hostTtlMs: 3 * MIN, sessionWindowMs: 24 * HOUR },
  retentionMs: 48 * HOUR,
  saveDebounceMs: 1000,
});

hub.server.listen(config.hub.port, config.hub.bind, () => {
  console.error(`[cc-panel] hub listening on http://${config.hub.bind}:${config.hub.port}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    hub.close().finally(() => process.exit(0));
  });
}
