import type { SessionStatus } from '../types.ts';

export const STATUS_LABEL: Record<SessionStatus, string> = {
  waiting: 'Te espera',
  error: 'Error',
  done: 'Listo',
  working: 'Currando',
  idle: 'Zzz',
  ended: 'Fin',
};

export function detailLabel(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  if (detail.startsWith('permission: ')) return `permiso ${detail.slice(12)}`;
  const known: Record<string, string> = {
    question: 'pregunta',
    plan: 'plan',
    permission_prompt: 'permiso',
    elicitation_dialog: 'input',
  };
  return known[detail] ?? detail;
}

export function age(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h${String(m % 60).padStart(2, '0')}` : `${Math.floor(h / 24)}d`;
}
