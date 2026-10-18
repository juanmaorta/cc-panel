export interface Label {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Lower is placed first and never moves. */
  priority: number;
}

const GAP = 1;
const MAX_STEPS = 8;

const hit = (a: Label, ay: number, b: Label, by: number) =>
  a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP && ay < by + b.h + GAP && by < ay + a.h + GAP;

/** Greedy: place by priority, nudging each label upwards until it clears the ones already placed. */
export function placeLabels(labels: readonly Label[]): Map<string, number> {
  const order = [...labels].sort((a, b) => a.priority - b.priority || b.y - a.y || a.x - b.x || a.id.localeCompare(b.id));
  const placed: { l: Label; y: number }[] = [];
  const out = new Map<string, number>();
  for (const l of order) {
    let y = l.y;
    for (let step = 0; step < MAX_STEPS; step++) {
      const blocker = placed.find((p) => hit(l, y, p.l, p.y));
      if (!blocker) break;
      y = blocker.y - l.h - GAP;
    }
    placed.push({ l, y });
    out.set(l.id, y);
  }
  return out;
}
