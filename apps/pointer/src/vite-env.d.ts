/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WS_BASE_URL?: string;
  readonly VITE_POINTER_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __GH_LATENCY__?: { p50: number };
}