/**
 * True inside the Tauri shell. In a plain browser (`pnpm --filter @percival/desktop dev`) the
 * frontend still runs, with browser fallbacks for the few native features it uses.
 */
export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
