export type Theme = 'light' | 'dark';

export function parseStored(v: string | null): Theme | null {
  return v === 'light' || v === 'dark' ? v : null;
}

/** An explicit choice beats the system preference. */
export function resolveTheme(stored: Theme | null, prefersDark: boolean): Theme {
  return stored ?? (prefersDark ? 'dark' : 'light');
}

export function nextTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark';
}
