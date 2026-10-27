/// <reference types="vite/client" />

declare const __RELEASE__: string;

interface ImportMetaEnv {
  readonly VITE_METRICS_URL?: string;
  readonly VITE_METRICS_SAMPLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
