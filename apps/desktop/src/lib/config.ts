/** Build-time / env client config for the sharer app. */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'https://api.ghosthands.fortunealebiosu.dev';

export const WS_BASE_URL =
  import.meta.env.VITE_WS_BASE_URL ?? 'wss://api.ghosthands.fortunealebiosu.dev';

export const POINTER_BASE_URL =
  import.meta.env.VITE_POINTER_BASE_URL ?? 'https://ghosthands.fortunealebiosu.dev';

export function joinUrl(displayCode: string): string {
  return `${POINTER_BASE_URL.replace(/\/$/, '')}/join/${displayCode}`;
}
