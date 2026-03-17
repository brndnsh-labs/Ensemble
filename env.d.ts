// Global declarations for variables injected by build tools like esbuild.

/**
 * The path to the logic worker script.
 * Injected at build time by esbuild in production, defined locally in dev.
 * @type {string | undefined}
 */
declare const WORKER_PATH: string | undefined;

/**
 * The path to the visualizer worker script.
 * Injected at build time by esbuild in production, defined locally in dev.
 * @type {string | undefined}
 */
declare const VIZ_WORKER_PATH: string | undefined;
