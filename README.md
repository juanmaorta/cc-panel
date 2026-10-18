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

## UI: Doom status bar

Original pixel art in the spirit of Doom's status bar (no id Software assets), rendered on a
320×32 canvas and scaled with `image-rendering: pixelated` — exactly 6× on a 1920×720 bar display.

| Bar | Meaning |
|---|---|
| AMMO | sessions in the last 24 h |
| HEALTH | % left of the 5 h usage window |
| ARMOR | % left of the weekly usage window |
| ARMS | host slots 1-6, lit when online |
| Face | most urgent live session: ouch = waiting, pain = error, evil grin = done, gritted teeth = working, looking around = idle; bloodier as HEALTH drops, dead at 0 % |
| Keys | red = something needs you, yellow = new result, blue = working |
| Table | count per state |

Above the bar, one touch-friendly tile per session. Each tile has a floor where Neko lives:

| Cat | Status |
|---|---|
| runs back and forth | working |
| curled up asleep, Z | idle (and everyone on an offline host) |
| startled, staring at you, red `!` | waiting |
| washes its face, yellow sparkle | done |
| scratches an itch, orange `!` | error |

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

The previous isometric room view is preserved at tag `v0.2-room`.

Screen flashes red when a session starts waiting or
fails, gold when one finishes (off with `prefers-reduced-motion`).

UI modules are written in TS under `src/ui/` and served type-stripped by the hub
(`module.stripTypeScriptTypes`), so there is still no build step.

### Usage limits

Limits come from the statusline input (`rate_limits`). Add this to your statusline script
right after reading stdin; the heartbeat picks it up:

```sh
mkdir -p ~/.local/state/cc-panel && printf '%s' "$input" > ~/.local/state/cc-panel/statusline-last.json.$$ \
  && mv ~/.local/state/cc-panel/statusline-last.json.$$ ~/.local/state/cc-panel/statusline-last.json
```

Without it HEALTH/ARMOR show `--%`.

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

- Tap a session to open/focus its terminal (local host only; remote sessions stay read-only).
- Estimated cost.
- Pinned sessions.
