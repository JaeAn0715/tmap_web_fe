/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_TMAP_APP_KEY?: string;
  /** Google OAuth Web client ID (GIS). Must match backend GOOGLE_CLIENT_ID. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** Optional; same as backend DEMO_SEED_SECRET for POST /demo/baby-ai-summary-seed. */
  readonly VITE_DEMO_SEED_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
