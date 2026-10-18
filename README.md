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

Above the bar sits the room view (the Doom "viewport"): one isometric, Habbo-style room per
host, in ARMS slot order. Six desks, a sofa and a `+N` sign for overflow. Desks are assigned
by hashing the session id with linear probing, oldest session first (`firstSeenAt`), so
nobody changes desks when a new session shows up. When desks run out, sessions that need you
win desks over busy ones, and idle ones go to the sofa.

| Pose | Status |
|---|---|
| seated, typing, laptop LED blue | working |
| asleep, Z | idle (and everyone on an offline host) |
| stands up in front of the desk, hand up, red `!` tag | waiting |
| stands up, arms up, yellow `OK` tag | done |
| seated, red eyes, smoke, `!?` tag | error |

Only the session behind the face's alarm gets a bouncing speech bubble. Name tags are placed
greedily by priority so they never overlap; a nudged tag keeps a leader line to its head.
Offline hosts get a dark room. The `LISTA` button switches to the plain tile list.

In the tile list, every session tile gets its own face. Screen flashes red when a session starts waiting or
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
