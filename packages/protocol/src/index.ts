export * from './pose.js';
export * from './generated/index.js';

/** Wire protocol version negotiated in hello / auth / join. */
export const PROTO_VERSION = 1 as const;

/** Session code alphabet (PRD §8.1) — no confusable characters. */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function formatDisplayCode(code: string): string {
  const raw = code.replace(/-/g, '').toUpperCase();
  if (raw.length !== 6) return code;
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
}

export function normalizeCode(input: string): string {
  return input.replace(/-/g, '').toUpperCase();
}
