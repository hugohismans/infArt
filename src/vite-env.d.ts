/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL du Worker (ex. https://galerie-infinie-api.xxx.workers.dev). Absente = mode direct. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
