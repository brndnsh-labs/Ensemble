/**
 * Leaf type module for the per-tick pipeline.
 *
 * `tick-logic.ts` orchestrates a tick and imports `runDrumTick` from
 * `drums-tick.ts`; `drums-tick.ts` needs the shapes it hands back. Declaring
 * those shapes here — in a module that imports NOTHING — keeps that dependency
 * one-directional. Homing them in `tick-logic.ts` made the pair circular
 * (`drums-tick -> tick-logic -> drums-tick`). Same leaf-module remedy as the
 * synth-utils <-> sample-voice split in #1192.
 *
 * The cycle was type-only, so it erased at compile time and was harmless at
 * runtime. Note the `npm run depcheck` gate would NOT have caught it: Biome's
 * `noImportCycles` ignores `import type` edges (#1191). The reason to fix it
 * anyway is structural — `drums-tick.ts` exists specifically so the real-time
 * scheduler can pull drums WITHOUT dragging the heavy lane generators in behind
 * it, and that promise shouldn't rest on the one edge back happening to be a
 * type import. There is now no edge back at all for a future value import to
 * travel along — and a value import IS caught by the gate.
 *
 * Keep this module import-free. Anything needing a dependency belongs in the
 * module that owns the behavior, not here.
 */

/**
 * Buffer-fill positions shared across a tick. `mainCursor` tracks the audible
 * playhead; `lookaheadCursor` runs ahead of it filling the scheduler's buffer.
 */
export interface TickCursors {
    mainCursor: { index: number; sectionIndex: number };
    lookaheadCursor: { index: number; sectionIndex: number };
}

/** One resolved drum strike, emitted by the drum block and consumed downstream. */
export interface DrumHitInfo {
    shouldPlay: boolean;
    velocity: number;
    soundName: string;
    instTimeOffset: number;
    inst: any;
}
