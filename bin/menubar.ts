// SwiftBar plugin: prints the menu (default) or, when a session is chosen, asks the hub to
// focus it (`menubar.ts focus <host> <sessionId>`); the cmux relay does the actual switch.
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.ts';
import { catTemplatePng } from '../src/png.ts';
import { post } from '../src/report.ts';
import { swiftbarMenu } from '../src/swiftbar.ts';
import type { View } from '../src/types.ts';
import { CAT_H, catFrame } from '../src/ui/neko-sprites.ts';
import { CAT_W } from '../src/ui/neko-logic.ts';

const TIMEOUT_MS = 2_000;
/** Menu bar icons top out around 18pt. */
const ICON_PT = 18;
const config = loadConfig();
const [mode, host, sessionId] = process.argv.slice(2);

const ALERT_RGB = [255, 59, 48] as const; // macOS system red
const icons = {
  calm: catTemplatePng(catFrame('sit', 1, 0), CAT_W, CAT_H, ICON_PT).toString('base64'),
  alert: catTemplatePng(catFrame('alert', 1, 0), CAT_W, CAT_H, ICON_PT, ALERT_RGB).toString('base64'),
};

if (mode === 'focus') {
  try {
    if (!host || !sessionId) throw new Error('usage: menubar.ts focus <host> <sessionId>');
    await post(config.hubUrl, config.token, '/api/focus', { host, sessionId }, TIMEOUT_MS);
  } catch (err) {
    // SwiftBar shows nothing for failed actions; at least leave a trace in its log.
    console.error(`cc-panel focus failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
} else {
  try {
    const res = await fetch(new URL('/api/state', config.hubUrl), {
      headers: { authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`hub responded ${res.status}`);
    const view = (await res.json()) as View;
    console.log(
      swiftbarMenu(view, {
        node: process.execPath,
        script: fileURLToPath(import.meta.url),
        panelUrl: new URL('/', config.hubUrl).toString(),
        icons,
      }),
    );
  } catch (err) {
    console.log(`? | templateImage=${icons.calm}`);
    console.log('---');
    console.log(`Hub inaccesible: ${(err instanceof Error ? err.message : String(err)).replace(/\|/g, '¦')}`);
  }
}
