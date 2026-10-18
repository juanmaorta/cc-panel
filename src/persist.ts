import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { emptyStore } from './state.ts';
import type { Store } from './types.ts';

export function loadStore(file: string, log: (msg: string) => void): Store {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') log(`cannot read ${file}: ${String(err)}`);
    return emptyStore();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<Store>;
    if (typeof parsed.sessions !== 'object' || typeof parsed.hosts !== 'object' || !parsed.sessions || !parsed.hosts) {
      throw new Error('unexpected shape');
    }
    const store: Store = { sessions: parsed.sessions, hosts: parsed.hosts };
    if (parsed.limits) store.limits = parsed.limits;
    return store;
  } catch (err) {
    log(`ignoring corrupt state file ${file}: ${String(err)}`);
    return emptyStore();
  }
}

/** Atomic write: a crash mid-write never leaves a truncated state file. */
export function saveStore(file: string, store: Store): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(store), { mode: 0o600 });
  renameSync(tmp, file);
}
