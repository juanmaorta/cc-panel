import type { SessionView } from '../types.ts';
import { fillPoly, project, type Point } from './iso.ts';
import { placeLabels } from './labels.ts';
import { px, smallText, smallWidth, sprite, type Ctx } from './pixel.ts';
import { lookFor, poseFor, type Pose, type Room } from './room-logic.ts';
import { AVATAR_H, AVATAR_W, avatarColors, composeAvatar } from './room-sprites.ts';

// World units (see iso.project): one floor tile is 4×4.
const X = 40;
const Y = 40;
const WALL = 28;
const LABEL_H = 10;
const GAP = 12;
const PAD = 6;
const SIT = 6; // px a seated avatar sinks
const SEATED_ROWS = 14; // rows drawn when seated; the desk hides the rest

export const ROOM_W = 2 * (X + Y);
export const ROOM_H = LABEL_H + WALL + X + Y + 2;

const DESK = { w: 6, d: 3, h: 5 } as const;
const DESK_SPOTS: readonly Point[] = [
  [3, 10], [16, 10], [29, 10],
  [3, 26], [16, 26], [29, 26],
];
const SOFA = { x: 6, y: 1, w: 13, d: 3 } as const;

const C = {
  floorA: '#d8c49a',
  floorB: '#c9b386',
  wallLeft: '#a7c4e2',
  wallRight: '#8eadd0',
  wallTrim: '#5f7fa5',
  skirting: '#6a5642',
  window: '#d6ecff',
  windowFrame: '#f4f4f4',
  deskTop: '#e0b07a',
  deskLeft: '#b98552',
  deskRight: '#946538',
  laptop: '#3a3a3a',
  laptopBack: '#5c5c5c',
  sofaTop: '#c2402f',
  sofaLeft: '#962f22',
  sofaRight: '#7a251a',
  plate: '#000000a0',
  leader: '#ffffff90',
  text: '#ffffff',
  shade: '#00000080',
  urgent: '#ff3030',
  done: '#f0cc3c',
  zzz: '#a8ccff',
  smoke: '#a0a0a0',
  bubble: '#ffffff',
  outline: '#1a1410',
  offline: '#000000a8',
  online: '#4ade80',
  hostOff: '#7a7a7a',
} as const;

const LED: Partial<Record<Pose, string>> = { typing: '#4f7cff', alert: '#ff3030', cheer: '#f0cc3c', smoke: '#ff5a1f' };

export interface RoomLayout {
  /** Native canvas size, before CSS upscaling. */
  width: number;
  height: number;
  scale: number;
  top: number;
  rooms: { left: number }[];
}

export function roomLayout(n: number, vw: number, vh: number): RoomLayout {
  const count = Math.max(n, 1);
  const contentW = count * ROOM_W + (count - 1) * GAP;
  const scale = Math.max(1, Math.floor(Math.min(vw / (contentW + 2 * PAD), vh / (ROOM_H + 2 * PAD))));
  const width = Math.max(1, Math.floor(vw / scale));
  const height = Math.max(1, Math.floor(vh / scale));
  const left0 = Math.max(0, Math.floor((width - contentW) / 2));
  const top = Math.max(0, Math.floor((height - ROOM_H) / 2));
  return { width, height, scale, top, rooms: Array.from({ length: n }, (_, i) => ({ left: left0 + i * (ROOM_W + GAP) })) };
}

interface Origin {
  ox: number;
  oy: number;
}

const at = (o: Origin, x: number, y: number, z: number): Point => {
  const [sx, sy] = project(x, y, z);
  return [o.ox + sx, o.oy + sy];
};

function quad(ctx: Ctx, o: Origin, pts: [number, number, number][], color: string): void {
  fillPoly(ctx, pts.map(([x, y, z]) => at(o, x, y, z)), color);
}

function box(ctx: Ctx, o: Origin, x: number, y: number, z: number, w: number, d: number, h: number, top: string, left: string, right: string): void {
  quad(ctx, o, [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], left);
  quad(ctx, o, [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], right);
  quad(ctx, o, [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], top);
}

function shell(ctx: Ctx, o: Origin): void {
  quad(ctx, o, [[0, 0, 0], [0, Y, 0], [0, Y, WALL], [0, 0, WALL]], C.wallLeft);
  quad(ctx, o, [[0, 0, 0], [X, 0, 0], [X, 0, WALL], [0, 0, WALL]], C.wallRight);
  quad(ctx, o, [[0, 0, WALL - 2], [0, Y, WALL - 2], [0, Y, WALL], [0, 0, WALL]], C.wallTrim);
  quad(ctx, o, [[0, 0, WALL - 2], [X, 0, WALL - 2], [X, 0, WALL], [0, 0, WALL]], C.wallTrim);
  // Window on the right wall.
  quad(ctx, o, [[25, 0, 9], [36, 0, 9], [36, 0, 22], [25, 0, 22]], C.windowFrame);
  quad(ctx, o, [[26, 0, 10], [35, 0, 10], [35, 0, 21], [26, 0, 21]], C.window);
  quad(ctx, o, [[30, 0, 10], [31, 0, 10], [31, 0, 21], [30, 0, 21]], C.windowFrame);
  for (let tx = 0; tx < X; tx += 4) {
    for (let ty = 0; ty < Y; ty += 4) {
      quad(ctx, o, [[tx, ty, 0], [tx + 4, ty, 0], [tx + 4, ty + 4, 0], [tx, ty + 4, 0]], (tx + ty) % 8 === 0 ? C.floorA : C.floorB);
    }
  }
  quad(ctx, o, [[0, 0, 0], [0, Y, 0], [0, Y, 2], [0, 0, 2]], C.skirting);
  quad(ctx, o, [[0, 0, 0], [X, 0, 0], [X, 0, 2], [0, 0, 2]], C.skirting);
}

function desk(ctx: Ctx, o: Origin, x: number, y: number, pose: Pose | null): void {
  box(ctx, o, x, y, 0, DESK.w, DESK.d, DESK.h, C.deskTop, C.deskLeft, C.deskRight);
  // Laptop, lid open towards the seat, so we see its back.
  box(ctx, o, x + 2, y + 1, DESK.h, 2, 1, 1, C.laptop, C.laptop, C.laptop);
  if (pose) {
    quad(ctx, o, [[x + 2, y + 1, DESK.h + 1], [x + 4, y + 1, DESK.h + 1], [x + 4, y + 1, DESK.h + 4], [x + 2, y + 1, DESK.h + 4]], C.laptopBack);
    const led = LED[pose];
    if (led) {
      const [lx, ly] = at(o, x + 3, y + 1, DESK.h + 3);
      px(ctx, lx, ly, 1, 1, led);
    }
  }
}

interface Placed {
  session: SessionView;
  pose: Pose;
  /** Screen anchor: feet. */
  sx: number;
  sy: number;
  /** Screen y of the top of the head. */
  head: number;
}

function avatar(ctx: Ctx, p: Placed, frame: number): void {
  const rows = composeAvatar(p.pose);
  const colors = avatarColors(lookFor(p.session.sessionId));
  const seated = p.pose === 'typing' || p.pose === 'sleeping' || p.pose === 'smoke';
  const bob = p.pose === 'typing' && frame % 2 === 1 ? 1 : 0;
  const x = p.sx - Math.floor(AVATAR_W / 2);
  const y = p.sy - AVATAR_H + (seated ? SIT : 0) + bob;
  sprite(ctx, seated ? rows.slice(0, SEATED_ROWS) : rows, colors, x, y);
}

const NAME_MAX = 12;
const TAG_H = 7;

/** Speech bubble whose pointer tip sits at (cx, bottom). Returns the bubble's top y. */
function bubbleFrame(ctx: Ctx, cx: number, bottom: number, w: number, border: string): number {
  const x = cx - Math.floor(w / 2);
  const y = bottom - 10;
  px(ctx, x, y, w, 8, border);
  px(ctx, x + 1, y + 1, w - 2, 6, C.bubble);
  px(ctx, cx - 1, y + 8, 3, 1, border);
  px(ctx, cx, y + 9, 1, 1, border);
  return y;
}

function bubble(ctx: Ctx, cx: number, bottom: number, text: string, fg: string, border: string): void {
  const w = smallWidth(text) + 4;
  const y = bubbleFrame(ctx, cx, bottom, w, border);
  smallText(ctx, text, cx - Math.floor(w / 2) + 2, y + 2, fg);
}

/** Small effects beside the head. Kept out of the tag's way: they must not hide names. */
function effects(ctx: Ctx, p: Placed, frame: number): void {
  if (p.pose === 'smoke') {
    for (let i = 0; i < 3; i++) {
      const rise = (frame + i * 2) % 4;
      px(ctx, p.sx + 6 + i * 2, p.head + 4 - rise * 2, 2, 2, C.smoke);
    }
  }
  if (p.pose === 'sleeping') {
    const rise = frame % 3;
    smallText(ctx, 'Z', p.sx + 6 + rise, p.head + 2 - rise * 2, C.zzz);
  }
}

/** Only the session behind the face's alarm gets a speech bubble, bouncing above its tag. */
function alarm(ctx: Ctx, p: Placed, tagY: number, frame: number): void {
  const lift = frame % 2 === 0 ? 2 : 0;
  bubble(ctx, p.sx, tagY - 1 - lift, p.pose === 'smoke' ? '!?' : '!', C.urgent, C.urgent);
}

const TAG_PREFIX: Partial<Record<Pose, string>> = { alert: '! ', smoke: '!? ', cheer: 'OK ' };

const tagText = (p: Placed) => (TAG_PREFIX[p.pose] ?? '') + p.session.project.toUpperCase().slice(0, NAME_MAX);

/** Placement order: the alarm first, then whatever needs you, then the rest. */
const TAG_PRIORITY: Record<Pose, number> = { alert: 1, smoke: 1, cheer: 2, typing: 3, sleeping: 4 };

function nameTag(ctx: Ctx, p: Placed, y: number, urgent: boolean): void {
  const s = p.session;
  const name = tagText(p);
  const w = smallWidth(name) + 2;
  const x = p.sx - Math.floor(w / 2);
  px(ctx, x, y, w, TAG_H, C.plate);
  const color = urgent || s.status === 'waiting' || s.status === 'error' ? C.urgent : s.status === 'done' ? C.done : C.text;
  smallText(ctx, name, x + 1, y + 1, color);
}

function drawRoom(ctx: Ctx, room: Room, o: Origin, urgent: string | null, frame: number): void {
  shell(ctx, o);

  type Drawable = { depth: number; draw: () => void };
  const scene: Drawable[] = [];
  const placed: Placed[] = [];

  // Sofa: back against the wall, sleepers sit on it.
  scene.push({
    depth: SOFA.x + SOFA.y,
    draw: () => {
      box(ctx, o, SOFA.x, SOFA.y, 0, SOFA.w, 1, 9, C.sofaTop, C.sofaLeft, C.sofaRight);
      box(ctx, o, SOFA.x, SOFA.y + 1, 0, SOFA.w, SOFA.d - 1, 4, C.sofaTop, C.sofaLeft, C.sofaRight);
    },
  });
  room.seating.sofa.forEach((s, i) => {
    const [sx, sy] = at(o, SOFA.x + 2 + i * 4, SOFA.y + 2, 4);
    const p: Placed = { session: s, pose: 'sleeping', sx, sy, head: sy - AVATAR_H + SIT };
    placed.push(p);
    scene.push({ depth: SOFA.x + SOFA.y + 0.5, draw: () => avatar(ctx, p, frame) });
  });

  room.seating.desks.forEach((s, i) => {
    const [dx, dy] = DESK_SPOTS[i]!;
    const pose = s ? poseFor(s) : null;
    scene.push({ depth: dx + dy + DESK.w / 2 + DESK.d / 2, draw: () => desk(ctx, o, dx, dy, pose) });
    if (!s || !pose) return;

    const standing = pose === 'alert' || pose === 'cheer';
    // Standing up = stepping out in front of the desk, facing the viewer.
    const [ax, ay] = standing ? [dx + DESK.w / 2, dy + DESK.d + 3] : [dx + DESK.w / 2, dy - 1];
    const [sx, sy] = at(o, ax, ay, 0);
    const p: Placed = { session: s, pose, sx, sy, head: sy - AVATAR_H + (standing ? 0 : SIT) };
    placed.push(p);
    scene.push({ depth: ax + ay, draw: () => avatar(ctx, p, frame) });
  });

  scene.sort((a, b) => a.depth - b.depth).forEach((d) => d.draw());

  // Overlays always on top so nothing important gets occluded.
  const key = (p: Placed) => `${p.session.host}/${p.session.sessionId}`;
  for (const p of placed) effects(ctx, p, frame);
  const ys = placeLabels(
    placed.map((p) => {
      const w = smallWidth(tagText(p)) + 2;
      const alarmed = key(p) === urgent;
      // The alarm's bubble sits on top of its tag: reserve room for both.
      const extra = alarmed ? 12 : 0;
      return { id: key(p), x: p.sx - Math.floor(w / 2), y: p.head - TAG_H - 1 - extra, w, h: TAG_H + extra, priority: alarmed ? 0 : TAG_PRIORITY[p.pose] };
    }),
  );
  for (const p of placed) {
    const alarmed = key(p) === urgent;
    const home = p.head - TAG_H - 1;
    const y = (ys.get(key(p)) ?? home - (alarmed ? 12 : 0)) + (alarmed ? 12 : 0);
    // Nudged tags keep a leader line to their head so they are not orphaned.
    if (home - y > 2) px(ctx, p.sx, y + TAG_H, 1, home - y, C.leader);
    nameTag(ctx, p, y, alarmed);
    if (alarmed) alarm(ctx, p, y, frame);
  }

  const { count, urgent: urgentOverflow } = room.seating.overflow;
  if (count > 0) {
    const [sx, sy] = at(o, 0, Y - 6, 16);
    const label = `+${count}`;
    px(ctx, sx - 2, sy - 1, smallWidth(label) + 4, 7, C.outline);
    smallText(ctx, label, sx, sy, urgentOverflow > 0 ? C.urgent : C.text);
  }

  if (!room.online) {
    fillPoly(ctx, [at(o, 0, 0, WALL), at(o, X, 0, WALL), at(o, X, 0, 0), at(o, X, Y, 0), at(o, 0, Y, 0), at(o, 0, Y, WALL)], C.offline);
    const [cx, cy] = at(o, X / 2, Y / 2, 0);
    smallText(ctx, 'OFFLINE', cx - Math.floor(smallWidth('OFFLINE') / 2), cy - 3, C.hostOff);
  }

  const label = `${room.slot} ${room.host.toUpperCase()}`;
  const [lx, ly] = at(o, 0, 0, WALL);
  const lw = smallWidth(label) + 6;
  const left = lx + (X - Y) - Math.floor(lw / 2);
  px(ctx, left, ly - LABEL_H, 3, 3, room.online ? C.online : C.hostOff);
  smallText(ctx, label, left + 5, ly - LABEL_H - 1, C.text, C.shade);
}

export function drawRooms(ctx: Ctx, rooms: Room[], layout: RoomLayout, urgent: string | null, frame: number): void {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, layout.width, layout.height);
  rooms.forEach((room, i) => {
    const slot = layout.rooms[i];
    if (!slot) return;
    drawRoom(ctx, room, { ox: slot.left + 2 * Y, oy: layout.top + LABEL_H + WALL }, urgent, frame);
  });
}
