import { validateProgression } from './engine/chords-engine.js';
import { initAudio } from './engine/engine.js';
import { scheduleGlobalEvent } from './engine/scheduler-core.js';
import { generateNotesForStep } from './engine/tick-logic.js';
import { encodeWav } from './engine/wav-encoder.js';
import { getState } from './state.js';

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
            state[sliceKey].enabled = stem === instrument; // @direct-mutation — throwaway clone
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

    fillBuffersForExport(state);

    for (let step = 0; step < totalSteps; step++) {
        const time = leadIn + step * sixteenth;
        // Throwaway cloned state, not the live deepSignal — no reactivity to
        // route through. Same pattern as the schedule loop in scripts/mix-report.ts.
        state.playback.nextNoteTime = time; // @direct-mutation
        state.playback.unswungNextNoteTime = time; // @direct-mutation
        scheduleGlobalEvent(state, step % stepsPerLoop, time);
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
 * Mirrors the cloneState helper inlined in `scripts/mix-report.ts`. Strips
 * the audio context and per-instrument runtime buffers so the offline render
 * starts from a clean slate; preserves every user-facing setting from the
 * live session (styles, volumes, intensity, etc.) so the export sounds like
 * what's on screen.
 */
// The clone temporarily carries legacy soloist fields (motifBuffer,
// pitchHistory) and a `ui` slot that the offline-render pipeline still
// reaches for; those fields are not on the typed EnsembleState. Until that
// scratch surface is migrated, this helper stays loosely typed.
function cloneStateForRender(liveState: any): any {
    return {
        playback: {
            ...liveState.playback,
            modals: { ...(liveState.playback.modals || {}) },
            drawQueue: [],
            audio: null,
            audioGraph: null,
            // #691 — these hold live-context sampled-voice handles; null them so
            // the offline render doesn't poke live nodes on its first chord change
            // (the lastSampledHatVoice clone-parity lesson, on the playback slice).
            activeChordVoices: [],
            lastChordKey: null,
            isPlaying: false,
            isScheduling: false,
            nextNoteTime: 0,
            unswungNextNoteTime: 0,
        },
        arranger: {
            ...liveState.arranger,
            sections: liveState.arranger.sections.map((section: any) => ({ ...section })),
            progression: [],
            stepMap: [],
            sectionMap: [],
            measureMap: [],
        },
        groove: {
            ...liveState.groove,
            instruments: liveState.groove.instruments.map((inst: any) => ({
                ...inst,
                steps: [...inst.steps],
            })),
            audioBuffers: {},
            buffer: new Map(),
            fillSteps: null,
            fillMap: null,
            accentMap: null,
            lastHatGain: null,
            lastSampledHatVoice: null,
            lastRideGain: null,
            lastCrashGain: null,
        },
        chords: {
            ...liveState.chords,
            buffer: new Map(),
            held: {},
            activeNotes: {},
            activeInstrument: {},
        },
        bass: {
            ...liveState.bass,
            buffer: new Map(),
            activeNotes: [],
            lastFreq: null,
            lastPlayedFreq: null,
        },
        soloist: {
            ...liveState.soloist,
            audio: {
                ...(liveState.soloist.audio || {}),
                activeVoices: [],
                buffer: new Map(),
                lastFreq: null,
                lastMidiPlayed: null,
                lastRenderedFreq: null,
                lastPlayedFreq: null,
                lastNoteEnd: 0,
            },
            motifBuffer: [...(liveState.soloist.motifBuffer || [])],
            pitchHistory: [...(liveState.soloist.pitchHistory || [])],
            phraseContext: { ...(liveState.soloist.session.currentPhrase.context || {}) },
        },
        harmony: {
            ...liveState.harmony,
            buffer: new Map(),
            activeVoices: [],
        },
        vizState: { ...liveState.vizState, enabled: false },
        midi: { ...liveState.midi, enabled: false, muteLocal: true },
        conductor: {
            ...liveState.conductor,
            form: liveState.conductor.form
                ? JSON.parse(JSON.stringify(liveState.conductor.form))
                : null,
        },
        ui: { ...(liveState.ui || {}) },
    };
}

function fillBuffersForExport(state: any): void {
    const cursors = {
        mainCursor: { index: 0, sectionIndex: 0 },
        lookaheadCursor: { index: 0, sectionIndex: 0 },
    };

    for (let step = 0; step < state.arranger.totalSteps; step++) {
        const result = generateNotesForStep(state, step, cursors, {
            includeBass: state.bass.enabled,
            includeChords: state.chords.enabled,
            includeSoloist: state.soloist.enabled,
            includeHarmony: state.harmony.enabled,
            includeDrums: false,
        });

        for (const note of result.notes) {
            if (note.module === 'bass') {
                storeNote(state.bass.buffer, step, note);
            } else if (note.module === 'chords') {
                storeNote(state.chords.buffer, step, note);
            } else if (note.module === 'harmony') {
                storeNote(state.harmony.buffer, step, note);
            } else if (note.module === 'soloist') {
                storeNote(state.soloist.audio.buffer, step, note);
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
