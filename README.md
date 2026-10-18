# cc-panel

Multi-host status panel for Claude Code sessions. Hooks on each machine push minimal
state (host, session id, cwd, event, tool name) to one hub; a static page polls the hub.
Prompts, tool inputs and outputs never leave the machine.

```
host A hooks ─┐  POST /api/events, /api/heartbeat (Bearer token)
host B hooks ─┴──► hub (node bin/hub.ts) ──► GET /  +  GET /api/state
```

Node ≥ 24 (runs the `.ts` files directly, no build). No runtime dependencies.

## Statuses

| Status | Set by |
|---|---|
| `waiting` | `PermissionRequest`, `PreToolUse` on `AskUserQuestion`/`ExitPlanMode`, `Notification` (`permission_prompt`, `elicitation_dialog`) |
| `working` | `UserPromptSubmit`, `PostToolUse` (clears `waiting` after approval) |
| `done` | `Stop` |
| `error` | `StopFailure` |
| `idle` | `SessionStart` |
| `ended` | `SessionEnd` (hidden) |

Hosts send a heartbeat every 60 s (launchd). No heartbeat for 3 min → host shown offline;
its sessions keep their last known status, dimmed. Sessions older than 24 h are hidden,
older than 48 h pruned.

## UI

Styled as the 1989 Mac that NekoDA ran on: 1-bit, black on white (or inverted, see the
theme switch), Chicago everywhere, no color. Status is told apart by patterns, borrowed
from classic Mac window chrome.

| Tile title bar | Status | Classic Mac meaning |
|---|---|---|
| inverted, blinking | waiting | selection |
| inverted | error | selection |
| horizontal stripes | done | active window |
| 50% gray dither | working | desktop pattern |
| plain | idle | inactive window |

Tiles on an offline host are dithered out, the way the Mac showed disabled items.

The menu bar:

| Menu bar | Meaning |
|---|---|
| Cat | most urgent live state: startled = waiting, scratching = error, washing = done, running = working, asleep = nothing going on |
| ● / ○ host | online / offline |
| 5H / SEM | usage of the 5 h and weekly windows as System 6 progress bars, with time to reset |
| Espera · Listo · Curro · Zzz | count per state; Espera is shown inverted when non-zero |
| Clock | local time |
| ◐ | light/dark; follows the system until you pick one (stored per screen) |

When a session starts waiting or fails the screen inverts for a moment (the classic Mac
visual beep); when one finishes, the menu bar blinks. Both off with `prefers-reduced-motion`.

Below it, one touch-friendly tile per session. Each tile has a floor where Neko lives:

| Cat | Status |
|---|---|
| runs back and forth | working |
| curled up asleep | idle (and everyone on an offline host) |
| startled, staring at you, `!` | waiting |
| washes its face, sparkle | done |
| scratches an itch, `!` | error |

Move the pointer or touch the screen and the cats chase it, each one confined to its own
floor, for a few seconds. Cats that need you do not chase: the alarm stays put.
Cat behaviour lives in `src/ui/neko-logic.ts` (pure, tested); tiles are reconciled by key
instead of rebuilt on every poll, so cats keep their position.

The cat sprites are oneko's 32×32 bitmaps, public domain per Debian's `debian/copyright`
for oneko. Art lineage: NEKO.COM (Naoshi Watanabe), NekoDA (Kenji Gotoh), xneko
(Masayuki Koba), oneko (Tatsuya Kato). `src/ui/neko-sprites.ts` is generated:

```sh
git clone https://github.com/tie/oneko /tmp/oneko
python3 -I scripts/gen-neko-sprites.py /tmp/oneko > src/ui/neko-sprites.ts
```

The font is ChicagoFLF, Robin Casady's revival of Susan Kare's Chicago, which he declared
public domain (statement in `public/fonts/README.ChicagoFLF.txt`, taken from the
`chicago.css` npm package). It is bundled and served by the hub, so the panel needs no
internet.

Earlier UIs are preserved as tags: `v0.2-room` (isometric room) and `v0.3-doom` (Doom
status bar).

UI modules are written in TS under `src/ui/` and served type-stripped by the hub
(`module.stripTypeScriptTypes`), so there is still no build step.

### Usage limits

Limits come from the statusline input (`rate_limits`). Add this to your statusline script
right after reading stdin; the heartbeat picks it up:

```sh
mkdir -p ~/.local/state/cc-panel && printf '%s' "$input" > ~/.local/state/cc-panel/statusline-last.json.$$ \
  && mv ~/.local/state/cc-panel/statusline-last.json.$$ ~/.local/state/cc-panel/statusline-last.json
```

Without it the 5H/SEM bars show `--`.

## Click a tile to jump to its cmux tab

Sessions running inside [cmux](https://cmux.com) report their workspace and tab
(`CMUX_WORKSPACE_ID` / `CMUX_SURFACE_ID`, inherited by the hooks). Clicking such a tile
(or Enter/Space on it) brings that tab to the front.

cmux only accepts socket commands from processes started inside cmux terminals, and the
hub runs under launchd. So on each machine, open a cmux tab and leave this running:

```sh
npm run relay
```

The relay long-polls the hub (`GET /api/relay/next`) and, for each click, runs exactly
`cmux workspace select`, `cmux focus-panel` and `open -b com.cmuxterm.app`, via
`execFile` with no shell and only validated UUIDs. It can switch tabs; it cannot type into
them. cmux's socket mode stays at its default (`cmuxOnly`).

A tile is clickable only when its session runs in cmux and that host's relay polled in the
last minute; the menu bar shows `⌘` next to hosts with a live relay. Clicks older than
10 s are dropped.

## Install

Hub machine:

```sh
npm install            # dev deps only (typescript, @types/node)
node bin/install.ts install
```

Prints the panel URL with the token in the fragment. Config lives at
`~/.config/cc-panel/config.json` (0600), state at `~/.local/state/cc-panel/state.json`,
logs at `~/Library/Logs/cc-panel/` and `~/.local/state/cc-panel/report.log`.

The installer merges its hooks into `~/.claude/settings.json` (backup at
`settings.json.bak-cc-panel`), leaving other hooks untouched, and is idempotent. It pins
the absolute Node path: re-run it after switching Node versions (nvm).

## Adding a second host (e.g. move the hub to an always-on machine)

1. On the hub machine: `node bin/install.ts install --bind <hub ip>`
2. Copy the hub machine's token from its config.
3. On every other host: `node bin/install.ts install --no-hub --hub-url http://<hub ip>:7420 --token <token>`

Binding to anything other than loopback exposes the API to that network; the token is
mandatory on every `/api` route. Keep it on the tailnet.

## Uninstall

`node bin/install.ts uninstall` removes hooks and launchd jobs; config and state stay.

## Not done yet

- Estimated cost.
- Pinned sessions.
