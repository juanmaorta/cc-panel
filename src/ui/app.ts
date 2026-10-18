import type { SessionView, View } from '../types.ts';
import { barState, flashFor, healthTier, sessionFace, type Flash } from './doom-logic.ts';
import { drawRooms, roomLayout } from './room.ts';
import { buildRooms, urgentKey } from './room-logic.ts';
import { FACE_H, FACE_W } from './sprites.ts';
import { BAR_H, BAR_W, drawBar, drawFaceTile } from './statusbar.ts';

const POLL_MS = 2000;
const FRAME_MS = 1200;
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

const bar = $<HTMLCanvasElement>('bar');
bar.width = BAR_W;
bar.height = BAR_H;
const barCtx = bar.getContext('2d')!;

const roomCanvas = $<HTMLCanvasElement>('room');
const roomCtx = roomCanvas.getContext('2d')!;
const main = $('main');

type Mode = 'room' | 'tiles';
let mode: Mode = store.get('cc-panel-mode') === 'tiles' ? 'tiles' : 'room';

let view: View | null = null;
let frame = 0;
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
  const f = $('flash');
  f.className = '';
  void f.offsetWidth; // restart the animation
  f.className = kind;
}

function paintRoom(v: View): void {
  const rooms = buildRooms(v);
  const layout = roomLayout(rooms.length, main.clientWidth, main.clientHeight);
  if (roomCanvas.width !== layout.width || roomCanvas.height !== layout.height) {
    roomCanvas.width = layout.width;
    roomCanvas.height = layout.height;
  }
  roomCanvas.style.width = `${layout.width * layout.scale}px`;
  roomCanvas.style.height = `${layout.height * layout.scale}px`;
  drawRooms(roomCtx, rooms, layout, urgentKey(v), frame);
}

function applyMode(): void {
  main.className = `${mode}-mode`;
  $('mode').textContent = mode === 'room' ? 'LISTA' : 'SALA';
}

function paintFaces(): void {
  if (!view) return;
  const state = barState(view);
  drawBar(barCtx, state, frame);
  if (mode === 'room') {
    paintRoom(view);
    return;
  }
  const tier = healthTier(state.health);
  document.querySelectorAll<HTMLCanvasElement>('canvas.face').forEach((c, i) => {
    const s = view?.sessions[i];
    if (s) drawFaceTile(c.getContext('2d')!, state.face.expression === 'dead' ? state.face : sessionFace(s, tier), frame);
  });
}

function renderTiles(v: View): void {
  const multiHost = v.hosts.length > 1;
  const grid = $('sessions');
  if (v.sessions.length === 0) {
    grid.replaceChildren(el('p', 'empty', 'NADA QUE MATAR. SIN SESIONES EN 24 H.'));
    return;
  }
  grid.replaceChildren(
    ...v.sessions.map((s) => {
      const tile = el('article', `tile s-${s.status}${s.hostOnline ? '' : ' offline'}`);
      tile.title = `${s.cwd}\n${s.host} · ${s.sessionId}`;
      const face = el('canvas', 'face');
      face.width = FACE_W;
      face.height = FACE_H;
      const info = el('div', 'info');
      info.append(
        el('div', 'project', s.project),
        el('div', 'status', [LABEL[s.status], detailLabel(s.detail)].filter(Boolean).join(' · ')),
        el('div', 'meta', [age(v.generatedAt - s.since), multiHost ? s.host : null, s.hostOnline ? null : 'OFFLINE'].filter(Boolean).join(' · ')),
      );
      tile.append(face, info);
      return tile;
    }),
  );
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
    paintFaces();
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

$('mode').addEventListener('click', () => {
  mode = mode === 'room' ? 'tiles' : 'room';
  store.set('cc-panel-mode', mode);
  applyMode();
  paintFaces();
});
addEventListener('resize', paintFaces);

applyMode();
void tick();
setInterval(() => {
  if (token) void tick();
}, POLL_MS);
setInterval(() => {
  if (reducedMotion.matches) return;
  frame++;
  paintFaces();
}, FRAME_MS);
