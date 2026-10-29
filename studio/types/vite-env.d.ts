/// <reference types="vite/client" />

// Kept outside src/: the Studio build auto-imports every src/**/*.ts file.
interface ImportMetaEnv {
  /** '1' points the client at the local backend (see src/config.ts). */
  readonly VITE_GOLFCRAFT_LOCAL?: string;
}
