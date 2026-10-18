import type { SessionView, View } from '../types.ts';
import { flashFor, menuState, type Flash, type LimitState } from './menubar-logic.ts';
import { initialCat, stepCat, type Cat, type CatMode } from './neko-logic.ts';
import { CAT_H, CAT_PALETTE, catFrame } from './neko-sprites.ts';
import { FLOOR_H, FLOOR_SCALE, drawFloor } from './neko.ts';
import { sprite } from './pixel.ts';

const POLL_MS = 2000;
const CLOCK_MS = 10_000;
/** A visual beep inverts the screen for about one frame, like the classic Mac. */
const BEEP_MS = 160;
const STEP_MS = 100;
const CAT_FRAME_STEPS = 3;
/** How long cats keep chasing after the last pointer movement. */
const CHASE_MS = 4000;
const LABEL: Record<SessionView['status'], string> = {
  waiting: 'TE ESPERA',
  error: 'ERROR',
  done: 'LISTO',
  working: 'CURRANDO',
  idle: 'ZZZ',
  ended: 'FIN',
};

function detailLabel(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  if (detail.startsWith('permission: ')) return `PERMISO ${detail.slice(12).toUpperCase()}`;
  const known: Record<string, string> = {
    question: 'PREGUNTA',
    plan: 'PLAN',
    permission_prompt: 'PERMISO',
    elicitation_dialog: 'INPUT',
  };
  return known[detail] ?? detail.toUpperCase();
}

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

function age(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h${String(m % 60).padStart(2, '0')}` : `${Math.floor(h / 24)}d`;
}

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
    ...m.hosts.map((h) => el('span', `host${h.online ? ' online' : ''}`, `${h.online ? '●' : '○'} ${h.host}`)),
  );
  renderLimit('l5', m.fiveHour);
  renderLimit('l7', m.sevenDay);
  const items: [string, number, boolean][] = [
    ['ESPERA', m.tally.waiting, m.tally.waiting > 0],
    ['LISTO', m.tally.done, false],
    ['CURRO', m.tally.working, false],
    ['ZZZ', m.tally.idle, false],
  ];
  $('tally').replaceChildren(...items.map(([label, n, hot]) => el('span', hot ? 'hot' : '', `${label} ${n}`)));
  mood = m.mood;
}

function drawMenuCat(): void {
  menuCatCtx.clearRect(0, 0, CAT_H, CAT_H);
  sprite(menuCatCtx, catFrame(mood, 1, Math.floor(step / CAT_FRAME_STEPS)), CAT_PALETTE, 0, 0);
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
}

const tiles = new Map<string, Tile>();
const keyOf = (s: SessionView) => `${s.host}/${s.sessionId}`;

function createTile(s: SessionView): Tile {
  const root = el('article', 'tile');
  const text = el('div', 'info');
  const project = el('div', 'project');
  const status = el('div', 'status');
  const meta = el('div', 'meta');
  text.append(project, status, meta);
  const floor = el('canvas', 'floor');
  floor.height = FLOOR_H;
  floor.style.height = `${FLOOR_H * FLOOR_SCALE}px`;
  root.append(text, floor);
  return { session: s, el: root, project, status, meta, floor, ctx: floor.getContext('2d')!, cat: initialCat(s.sessionId, 64) };
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
    if (!empty) grid.append(el('p', 'empty', 'NADA QUE HACER. SIN SESIONES EN 24 H.'));
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
    t.el.className = `tile s-${s.status}${s.hostOnline ? '' : ' offline'}`;
    t.el.title = `${s.cwd}\n${s.host} · ${s.sessionId}`;
    t.project.textContent = s.project;
    t.status.textContent = [LABEL[s.status], detailLabel(s.detail)].filter(Boolean).join(' · ');
    t.meta.textContent = [age(v.generatedAt - s.since), multiHost ? s.host : null, s.hostOnline ? null : 'OFFLINE']
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
    drawFloor(t.ctx, width, t.cat, t.session.status, catFrame);
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
      err.textContent = 'TOKEN INVÁLIDO';
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const next = (await res.json()) as View;
    const f = flashFor(view, next);
    view = next;
    renderTiles(next);
    renderMenu(next);
    if (f) flash(f);
    const waiting = next.sessions.filter((s) => s.hostOnline && (s.status === 'waiting' || s.status === 'error')).length;
    document.title = waiting ? `(${waiting}) cc-panel` : 'cc-panel';
    err.textContent = '';
  } catch (e) {
    err.textContent = `HUB INACCESIBLE (${e instanceof Error ? e.message : String(e)})`;
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
