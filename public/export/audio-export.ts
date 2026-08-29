import { validateProgression } from '../engine/chords-engine.js';
import type { CoordinationCarryover } from '../engine/coordination-engine.js';
import { initAudio } from '../engine/engine.js';
import { resetHiddenGenerationMemory } from '../engine/generation-run.js';
import { scheduleGlobalEvent } from '../engine/scheduler-core.js';
import { generateNotesForStep } from '../engine/tick-logic.js';
import { encodeWav } from '../engine/wav-encoder.js';
import { getState } from '../state.js';
import type { EnsembleState, Mutable } from '../types.js';
import { cloneStateForDetachedGeneration } from './detached-generation-state.js';

export interface AudioExportOptions {
    /** How many times to repeat the current chord progression. Defaults to 1. */
    loops?: number;
    /** Sample rate for the render. Defaults to 44100 (matches mix-report). */
    sampleRate?: number;
    /** Filename hint for the resulting Blob (used by the UI for the download). */
    filename?: string;
}

export interface AudioExportResult {
    blob: Blob;
    durationSeconds: number;
    sampleRate: number;
    filename: string;
}

/** The five instrument stems a session can be exported as. `drums` maps to the `groove` state slice. */
export type StemInstrument = 'soloist' | 'bass' | 'chords' | 'harmony' | 'drums';

export const STEM_INSTRUMENTS: StemInstrument[] = ['soloist', 'bass', 'chords', 'harmony', 'drums'];

/** Maps a stem name to the state-slice key that carries its `.enabled` gate (read by `scheduleGlobalEvent`). */
const STEM_ENABLE_SLICE: Record<
    StemInstrument,
    'soloist' | 'bass' | 'chords' | 'harmony' | 'groove'
> = {
    soloist: 'soloist',
    bass: 'bass',
    chords: 'chords',
    harmony: 'harmony',
    drums: 'groove',
};

export interface StemExportOptions extends AudioExportOptions {
    /** Called right before each stem starts rendering. */
    onStemProgress?: (progress: {
        instrument: StemInstrument;
        index: number;
        total: number;
    }) => void;
}

export interface StemExportResult extends AudioExportResult {
    instrument: StemInstrument;
}

/**
 * Renders the user's current session into a downloadable WAV. Mirrors the
 * offline-render approach proven by `scripts/mix-report.ts`: clone the live
 * state, drive `initAudio` with an `OfflineAudioContext`, fill the per-
 * instrument buffers via `generateNotesForStep`, then walk the schedule
 * step by step. The result is the same audio graph that drives playback,
 * captured to PCM and packaged as a Blob ready for `URL.createObjectURL`.
 *
 * The live session is not disturbed — only a cloned state participates in
 * the offline graph.
 */
export async function renderCurrentSessionToWav(
    opts: AudioExportOptions = {},
): Promise<AudioExportResult> {
    const loops = Math.max(1, Math.floor(opts.loops ?? 1));
    const sampleRate = opts.sampleRate ?? 44100;
    const filename = sanitizeFilename(opts.filename ?? 'ensemble-export');

    const live = getState();
    const state = cloneStateForRender(live);
    return renderClonedStateToWav(state, loops, sampleRate, filename);
}

/**
 * Renders one WAV per requested instrument stem, each with exactly that
 * instrument's `.enabled` flag on and every other stem-bearing slice
 * (`soloist`/`bass`/`chords`/`harmony`/`groove`) forced off. Every stem gets
 * its own fresh clone of the live state (via `cloneStateForRender`) — same
 * per-scene re-clone discipline `scripts/mix-report.ts`'s `createSceneState`
 * uses for its per-stem renders — so one stem's in-place `@direct-mutation`
 * schedule-walk can never bleed into the next, and each clone independently
 * nulls the live-audio-handle fields (the #691 clone-parity gotcha).
 *
 * Stems render sequentially (not in parallel): each pass owns its own
 * `OfflineAudioContext`, and `onStemProgress` fires before each one starts so
 * the UI can show real progress.
 */
export async function renderStemsToWav(
    instruments: StemInstrument[] = STEM_INSTRUMENTS,
    opts: StemExportOptions = {},
): Promise<StemExportResult[]> {
    const loops = Math.max(1, Math.floor(opts.loops ?? 1));
    const sampleRate = opts.sampleRate ?? 44100;
    const baseFilename = sanitizeFilename(opts.filename ?? 'ensemble-export');

    const results: StemExportResult[] = [];
    const total = instruments.length;

    for (let index = 0; index < total; index++) {
        const instrument = instruments[index];
        opts.onStemProgress?.({ instrument, index, total });

        const live = getState();
        const state = cloneStateForRender(live);

        // Solo exactly this stem on the clone: force the target slice on and
        // every other stem-bearing slice off. This is independent of what's
        // enabled live — a stem export always renders that instrument, even
        // if it happens to be muted in the current mix.
        for (const stem of STEM_INSTRUMENTS) {
            const sliceKey = STEM_ENABLE_SLICE[stem];
            (state[sliceKey] as Mutable<(typeof state)[typeof sliceKey]>).enabled =
                stem === instrument; // @direct-mutation — throwaway clone
        }
        // Section force-on is musical authorship, while a stem choice is a sink
        // mask. Force every excluded lane off at the section layer too; preserve
        // target-lane overrides so its authored rests still render.
        for (const section of state.arranger.sections) {
            section.instruments = { ...(section.instruments || {}) };
            for (const stem of STEM_INSTRUMENTS) {
                if (stem !== instrument) {
                    section.instruments[STEM_ENABLE_SLICE[stem]] = false;
                }
            }
        }
        if (!state.soloist.enabled) {
            // A solo stem is a sound-source isolation, not permission to render
            // gestures driven by a lane that is absent from that stem.
            (state.groove as Mutable<typeof state.groove>).accentMap = null; // @direct-mutation — throwaway clone
        }

        const filename = `${baseFilename}-stem-${instrument}`;
        const result = await renderClonedStateToWav(state, loops, sampleRate, filename);
        results.push({ ...result, instrument });
    }

    return results;
}

/**
 * Shared render core: walks a fully-prepared cloned state through
 * `initAudio` + the offline schedule loop and encodes the result to WAV.
 * Extracted so `renderCurrentSessionToWav` and `renderStemsToWav` share the
 * exact same offline-render mechanics and only differ in how the clone's
 * per-instrument `.enabled` flags are set before this runs.
 */
async function renderClonedStateToWav(
    state: any,
    loops: number,
    sampleRate: number,
    filename: string,
): Promise<AudioExportResult> {
    resetHiddenGenerationMemory(state);
    validateProgression(state);

    const sixteenth = 60 / state.playback.bpm / 4;
    const leadIn = 0.25;
    const stepsPerLoop = state.arranger.totalSteps;
    if (stepsPerLoop <= 0) {
        throw new Error('Cannot export audio: arranger has no steps to render');
    }
    const totalSteps = stepsPerLoop * loops;
    const renderSeconds = leadIn + totalSteps * sixteenth + 2;
    const frameCount = Math.ceil(renderSeconds * sampleRate);

    const offlineCtx = new OfflineAudioContext(2, frameCount, sampleRate);
    // initAudio's option type is AudioContext but the function already branches
    // on `startRendering` to handle the OfflineAudioContext path (skips the
    // watchdog, state-change resume, etc.). Same shape as `scripts/mix-report.ts`.
    initAudio(state, {
        audioContext: offlineCtx as unknown as AudioContext,
        enableWatchdog: false,
    });

    // Sticky coordination belongs to this detached render only. Keep it alive
    // across loop refills, but never reuse it for a later full-session or stem render.
    const carryover: CoordinationCarryover = {
        lastActiveSoloistMidi: 0,
        lastActiveSoloistStep: 0,
    };

    for (let loopIndex = 0; loopIndex < loops; loopIndex++) {
        const timelineStartStep = loopIndex * stepsPerLoop;
        state.playback.currentLoopCount = loopIndex; // @direct-mutation — throwaway clone
        fillBuffersForExport(state, timelineStartStep, carryover);

        for (let step = 0; step < stepsPerLoop; step++) {
            const absoluteStep = timelineStartStep + step;
            const time = leadIn + absoluteStep * sixteenth;
            // Throwaway cloned state, not the live deepSignal — no reactivity to
            // route through. Absolute steps match live/MIDI seed framing; buffers
            // are refilled per loop because the scheduler consumes each entry.
            state.playback.nextNoteTime = time; // @direct-mutation
            state.playback.unswungNextNoteTime = time; // @direct-mutation
            scheduleGlobalEvent(state, absoluteStep, time);
        }
    }

    const rendered = await offlineCtx.startRendering();
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
        // .slice() copies — without it, the underlying buffer is shared with
        // the AudioBuffer and may be reclaimed by the context's GC.
        channels.push(rendered.getChannelData(ch).slice());
    }

    const wav = encodeWav(channels, rendered.sampleRate);
    return {
        blob: new Blob([wav], { type: 'audio/wav' }),
        durationSeconds: rendered.duration,
        sampleRate: rendered.sampleRate,
        filename: `${filename}.wav`,
    };
}

/**
 * Triggers a browser download for an export result. Returns the same result
 * so callers can chain or display metadata.
 */
export function downloadExportResult(result: AudioExportResult): AudioExportResult {
    const url = URL.createObjectURL(result.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    // Defer revoke so Chromium gets a chance to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return result;
}

function sanitizeFilename(input: string): string {
    const cleaned = input
        .replace(/[^a-zA-Z0-9\s\-_()]/g, '')
        .substring(0, 64)
        .trim();
    return cleaned || 'ensemble-export';
}

/**
 * Adds WAV/stem-specific full-form resets to the shared detached generation
 * snapshot. Musical settings remain intact while derived arrangement data is
 * rebuilt by the offline renderer.
 */
function cloneStateForRender(liveState: EnsembleState): EnsembleState {
    const state = cloneStateForDetachedGeneration(liveState);

    // WAV/stem export always renders the full authored form and rebuilds its
    // derived maps. MIDI export deliberately keeps those snapshot values so its
    // existing paused/live semantics do not change.
    const playback = state.playback as Mutable<typeof state.playback>;
    playback.startStep = 0; // @direct-mutation — throwaway clone
    playback.loopStartStep = -1; // @direct-mutation — throwaway clone
    playback.loopEndStep = -1; // @direct-mutation — throwaway clone

    const arranger = state.arranger as Mutable<typeof state.arranger>;
    arranger.progression = []; // @direct-mutation — throwaway clone
    arranger.stepMap = []; // @direct-mutation — throwaway clone
    arranger.sectionMap = []; // @direct-mutation — throwaway clone
    arranger.measureMap = []; // @direct-mutation — throwaway clone

    const groove = state.groove as Mutable<typeof state.groove>;
    groove.fillSteps = {}; // @direct-mutation — throwaway clone; matches groove.ts's default, not nullable
    groove.fillMap = null; // @direct-mutation — throwaway clone
    groove.seedTimelineStartStep = 0; // @direct-mutation — throwaway clone

    return state;
}

function fillBuffersForExport(
    state: any,
    timelineStartStep: number,
    carryover: CoordinationCarryover,
): void {
    const cursors = {
        mainCursor: { index: 0, sectionIndex: 0 },
        lookaheadCursor: { index: 0, sectionIndex: 0 },
    };

    for (let step = 0; step < state.arranger.totalSteps; step++) {
        const absoluteStep = timelineStartStep + step;
        const result = generateNotesForStep(
            state,
            absoluteStep,
            cursors,
            {
                includeBass: true,
                includeChords: true,
                includeSoloist: true,
                includeHarmony: true,
                includeDrums: false,
            },
            carryover,
        );

        if (result.coordination.lastActiveSoloistMidi) {
            carryover.lastActiveSoloistMidi = result.coordination.lastActiveSoloistMidi;
            carryover.lastActiveSoloistStep = result.coordination.lastActiveSoloistStep;
        }

        for (const note of result.notes) {
            if (note.module === 'bass') {
                storeNote(state.bass.buffer, absoluteStep, note);
            } else if (note.module === 'chords') {
                storeNote(state.chords.buffer, absoluteStep, note);
            } else if (note.module === 'harmony') {
                storeNote(state.harmony.buffer, absoluteStep, note);
            } else if (note.module === 'soloist') {
                storeNote(state.soloist.audio.buffer, absoluteStep, note);
            }
        }
    }
}

function storeNote(targetMap: Map<number, any[]>, step: number, note: any): void {
    if (!targetMap.has(step)) {
        targetMap.set(step, []);
    }
    targetMap.get(step)!.push(note);
}
