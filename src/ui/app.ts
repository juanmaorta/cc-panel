import type { SessionView, View } from '../types.ts';
import { flashFor, menuState, type Flash, type LimitState } from './menubar-logic.ts';
import { STATUS_LABEL, age, detailLabel } from './labels.ts';
import { hostsNeedingRelay } from './relay-hint.ts';
import { initialCat, stepCat, type Cat, type CatMode } from './neko-logic.ts';
import { CAT_H, catFrame } from './neko-sprites.ts';
import { FLOOR_H, FLOOR_SCALE, catColors, drawFloor, type Ink } from './neko.ts';
import { sprite } from './pixel.ts';
import { nextTheme, parseStored, resolveTheme } from './theme.ts';

const POLL_MS = 2000;
const CLOCK_MS = 10_000;
/** How long a clicked tile stays inverted, like a classic Mac button press. */
const PRESS_MS = 180;
/** A visual beep inverts the screen for about one frame, like the classic Mac. */
const BEEP_MS = 160;
const STEP_MS = 100;
const CAT_FRAME_STEPS = 3;
/** How long cats keep chasing after the last pointer movement. */
const CHASE_MS = 4000;
const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Token arrives in the fragment (never sent to the server), then moves to storage.
const fromHash = new URLSearchParams(location.hash.slice(1)).get('token');
if (fromHash) {
  store.set('cc-panel-token', fromHash);
  history.replaceState(null, '', location.pathname);
}
let token = store.get('cc-panel-token');

const menuCat = $<HTMLCanvasElement>('menucat');
menuCat.width = CAT_H;
menuCat.height = CAT_H;
const menuCatCtx = menuCat.getContext('2d')!;

let view: View | null = null;
let step = 0;
let mood: CatMode = 'sleep';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function flash(kind: Flash): void {
  if (reducedMotion.matches) return;
  if (kind === 'beep') {
    document.documentElement.classList.add('beep');
    setTimeout(() => document.documentElement.classList.remove('beep'), BEEP_MS);
    return;
  }
  const bar = $('menubar');
  bar.classList.remove('blink');
  void bar.offsetWidth; // restart the animation
  bar.classList.add('blink');
}

function renderLimit(id: string, l: LimitState | null): void {
  const root = $(id);
  const fill = root.querySelector<HTMLElement>('.fill')!;
  fill.style.width = `${l?.usedPct ?? 0}%`;
  fill.classList.toggle('full', (l?.usedPct ?? 0) >= 90);
  root.querySelector('.val')!.textContent = l ? `${l.usedPct}% · ${l.resetsIn}` : '--';
  root.title = l ? `${l.usedPct}% usado, reset en ${l.resetsIn}` : 'sin datos de la statusline';
}

function renderMenu(v: View): void {
  const m = menuState(v);
  $('hosts').replaceChildren(
    ...m.hosts.map((h) => {
      const n = el('span', `host${h.online ? ' online' : ''}`, `${h.online ? '●' : '○'} ${h.host}${h.relay ? ' ⌘' : ''}`);
      n.title = h.relay ? 'relay de cmux conectado: clic en una tarjeta para ir a su pestaña' : 'sin relay de cmux';
      return n;
    }),
  );
  renderLimit('l5', m.fiveHour);
  renderLimit('l7', m.sevenDay);
  const items: [string, number, boolean][] = [
    ['Espera', m.tally.waiting, m.tally.waiting > 0],
    ['Listo', m.tally.done, false],
    ['Curro', m.tally.working, false],
    ['Zzz', m.tally.idle, false],
  ];
  $('tally').replaceChildren(...items.map(([label, n, hot]) => el('span', hot ? 'hot' : '', `${label} ${n}`)));
  mood = m.mood;
}

function drawMenuCat(): void {
  menuCatCtx.clearRect(0, 0, CAT_H, CAT_H);
  sprite(menuCatCtx, catFrame(mood, 1, Math.floor(step / CAT_FRAME_STEPS)), catColors(menuColors), 0, 0);
}

const HINT_HIDDEN_KEY = 'cc-panel-relay-hint-hidden';
const hint = $('relayhint');
const copyBtn = hint.querySelector<HTMLButtonElement>('.copy')!;
// Clipboard needs a secure context (localhost is; plain http over the LAN is not).
copyBtn.hidden = !window.isSecureContext || !navigator.clipboard;
copyBtn.addEventListener('click', () => {
  const cmd = hint.querySelector('.cmd')!.textContent ?? '';
  navigator.clipboard.writeText(cmd).then(
    () => {
      copyBtn.textContent = 'Copiado';
      setTimeout(() => (copyBtn.textContent = 'Copiar'), 1500);
    },
    () => (copyBtn.textContent = 'No se pudo copiar'),
  );
});
hint.querySelector('.hide')!.addEventListener('click', () => {
  store.set(HINT_HIDDEN_KEY, '1');
  hint.hidden = true;
});

/** Shown only while some cmux sessions cannot be focused because their host has no relay. */
function renderRelayHint(v: View): void {
  const hosts = hostsNeedingRelay(v);
  hint.hidden = hosts.length === 0 || !v.relayCommand || store.get(HINT_HIDDEN_KEY) === '1';
  if (hint.hidden) return;
  hint.querySelector('.hosts')!.textContent = hosts.join(', ');
  hint.querySelector('.cmd')!.textContent = v.relayCommand ?? '';
}

function renderClock(): void {
  $('clock').textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

interface Tile {
  session: SessionView;
  el: HTMLElement;
  project: HTMLElement;
  status: HTMLElement;
  meta: HTMLElement;
  floor: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cat: Cat;
  /** Resolved --ink/--bg, refreshed on status and theme changes. */
  colors: Ink;
}

const tiles = new Map<string, Tile>();
const keyOf = (s: SessionView) => `${s.host}/${s.sessionId}`;

function createTile(s: SessionView): Tile {
  const root = el('article', 'tile');
  // Title bar like a classic Mac window; its pattern shows the status (see CSS).
  const titlebar = el('div', 'titlebar');
  const project = el('div', 'project');
  titlebar.append(project);
  const text = el('div', 'info');
  const status = el('div', 'status');
  const meta = el('div', 'meta');
  text.append(status, meta);
  const floor = el('canvas', 'floor');
  floor.height = FLOOR_H;
  floor.style.height = `${FLOOR_H * FLOOR_SCALE}px`;
  root.append(titlebar, text, floor);
  root.addEventListener('click', () => void focusTile(root));
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    void focusTile(root);
  });
  return { session: s, el: root, project, status, meta, floor, ctx: floor.getContext('2d')!, cat: initialCat(s.sessionId, 64), colors: { ink: '#000', paper: '#fff' } };
}

/** Keeps the floor at an integer scale; returns its native width. */
function fitFloor(t: Tile): number {
  const native = Math.max(1, Math.floor(t.el.clientWidth / FLOOR_SCALE) - 2);
  if (t.floor.width !== native) {
    t.floor.width = native;
    t.floor.style.width = `${native * FLOOR_SCALE}px`;
  }
  return native;
}

function renderTiles(v: View): void {
  const multiHost = v.hosts.length > 1;
  const grid = $('sessions');
  const empty = grid.querySelector('.empty');
  if (v.sessions.length === 0) {
    tiles.forEach((t) => t.el.remove());
    tiles.clear();
    if (!empty) grid.append(el('p', 'empty', 'Nada que hacer. Sin sesiones en 24 h.'));
    return;
  }
  empty?.remove();

  const live = new Set<string>();
  for (const s of v.sessions) {
    const key = keyOf(s);
    live.add(key);
    let t = tiles.get(key);
    if (!t) {
      t = createTile(s);
      tiles.set(key, t);
    }
    t.session = s;
    const cls = `tile s-${s.status}${s.hostOnline ? '' : ' offline'}${s.canFocus ? ' clickable' : ''}`;
    if (s.canFocus) {
      t.el.tabIndex = 0;
      t.el.setAttribute('role', 'button');
      t.el.setAttribute('aria-label', `Ir a la pestaña de ${s.name ?? s.project} en cmux`);
    } else {
      t.el.removeAttribute('tabindex');
      t.el.removeAttribute('role');
      t.el.removeAttribute('aria-label');
    }
    if (t.el.className !== cls || !t.el.isConnected) {
      t.el.className = cls;
      grid.append(t.el);
      t.colors = colorsOf(t.el);
    }
    t.el.title = `${s.cwd}\n${s.host} · ${s.sessionId}`;
    // Claude's session title when there is one; the folder otherwise.
    t.project.textContent = s.name ?? s.project;
    t.status.textContent = [STATUS_LABEL[s.status], detailLabel(s.detail)].filter(Boolean).join(' · ');
    t.meta.textContent = [s.agent === 'codex' ? 'codex' : null, s.name ? s.project : null, age(v.generatedAt - s.since), multiHost ? s.host : null, s.hostOnline ? null : 'offline']
      .filter(Boolean)
      .join(' · ');
    grid.append(t.el); // append moves existing nodes: keeps view order without rebuilding
  }
  for (const [key, t] of tiles) {
    if (!live.has(key)) {
      t.el.remove();
      tiles.delete(key);
    }
  }
}

function colorsOf(el: Element): Ink {
  const css = getComputedStyle(el);
  return { ink: css.getPropertyValue('--ink').trim() || '#000', paper: css.getPropertyValue('--bg').trim() || '#fff' };
}

/** The menu bar cat follows the theme like the tile cats. */
let menuColors: Ink = colorsOf(document.documentElement);

/** Canvas floors cache their colors; re-read them whenever the theme changes. */
function refreshColors(): void {
  for (const t of tiles.values()) t.colors = colorsOf(t.el);
  menuColors = colorsOf(document.documentElement);
}

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
$('theme').addEventListener('click', () => {
  const next = nextTheme(resolveTheme(parseStored(store.get('cc-panel-theme')), darkQuery.matches));
  document.documentElement.dataset.theme = next;
  store.set('cc-panel-theme', next);
  refreshColors();
});
darkQuery.addEventListener('change', refreshColors);

async function focusTile(el: HTMLElement): Promise<void> {
  const t = [...tiles.values()].find((x) => x.el === el);
  if (!t?.session.canFocus || !token) return;
  el.classList.add('pressed');
  setTimeout(() => el.classList.remove('pressed'), PRESS_MS);
  try {
    const res = await fetch('/api/focus', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ host: t.session.host, sessionId: t.session.sessionId }),
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
  } catch (e) {
    $('error').textContent = `No se pudo ir a la pestaña: ${e instanceof Error ? e.message : String(e)}`;
  }
}

let pointer: { x: number; at: number } | null = null;
const trackPointer = (e: PointerEvent) => {
  pointer = { x: e.clientX, at: Date.now() };
};
addEventListener('pointermove', trackPointer);
addEventListener('pointerdown', trackPointer);

function animateCats(): void {
  const chasing = pointer && Date.now() - pointer.at < CHASE_MS ? pointer.x : null;
  const moving = !reducedMotion.matches;
  if (moving) step++;
  const catFrame = Math.floor(step / CAT_FRAME_STEPS);
  for (const t of tiles.values()) {
    const width = fitFloor(t);
    const left = t.floor.getBoundingClientRect().left;
    const target = moving && chasing !== null ? (chasing - left) / FLOOR_SCALE : null;
    const next = stepCat(t.cat, { status: t.session.status, hostOnline: t.session.hostOnline, width, target });
    t.cat = moving ? next : { ...next, x: t.cat.x };
    drawFloor(t.ctx, width, t.cat, t.colors, catFrame);
  }
}

async function tick(): Promise<void> {
  const login = $<HTMLFormElement>('login');
  const err = $('error');
  if (!token) {
    login.hidden = false;
    return;
  }
  try {
    const res = await fetch('/api/state', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (res.status === 401) {
      token = null;
      login.hidden = false;
      err.textContent = 'Token inválido';
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const next = (await res.json()) as View;
    const f = flashFor(view, next);
    view = next;
    renderTiles(next);
    renderMenu(next);
    renderRelayHint(next);
    if (f) flash(f);
    const waiting = next.sessions.filter((s) => s.hostOnline && (s.status === 'waiting' || s.status === 'error')).length;
    document.title = waiting ? `(${waiting}) cc-panel` : 'cc-panel';
    err.textContent = '';
  } catch (e) {
    err.textContent = `Hub inaccesible (${e instanceof Error ? e.message : String(e)})`;
  }
}

$<HTMLFormElement>('login').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.currentTarget as HTMLFormElement;
  token = String(new FormData(form).get('token') ?? '').trim();
  store.set('cc-panel-token', token);
  form.hidden = true;
  void tick();
});

void tick();
setInterval(() => {
  if (token) void tick();
}, POLL_MS);
renderClock();
setInterval(renderClock, CLOCK_MS);
setInterval(() => {
  animateCats();
  drawMenuCat();
}, STEP_MS);
