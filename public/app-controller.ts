import { dispatch, getState } from './state.js';
import type { Mutable, Palette, ThemeMode } from './types.js';
import { ACTIONS } from './types.js';
import { getStepsPerMeasure } from './utils.js';
import { syncWorker } from './worker-client.js';

/** Resolve a light/dark preference to a concrete mode. 'auto' follows the OS. */
export function resolveMode(mode: ThemeMode): 'light' | 'dark' {
    if (mode === 'auto') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return mode;
}

/** Write the resolved palette + light/dark mode to `<html>`. Single source of
 *  truth shared by the pre-mount paint (main.ts), the HYDRATE effect, and the
 *  reactive App-level effect (which also wires the prefers-color-scheme
 *  listener while mode === 'auto'). */
export function applyThemeToDom(palette: Palette, mode: ThemeMode): void {
    const resolved = resolveMode(mode);
    const root = document.documentElement;
    root.setAttribute('data-palette', palette);
    root.setAttribute('data-mode', resolved);
    root.style.colorScheme = resolved;
}

/** Choose the color-palette identity. The App-level resolver picks up the
 *  state change and rewrites `<html data-palette>`. */
export function setPalette(palette: Palette): void {
    const { playback } = getState();
    if (palette !== playback.palette) {
        dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'palette', value: palette });
    }
}

/** Choose the light/dark preference ('auto' follows the OS). The App-level
 *  resolver picks up the state change and rewrites `<html data-mode>`. */
export function setMode(mode: ThemeMode): void {
    const { playback } = getState();
    if (mode !== playback.mode) {
        dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'mode', value: mode });
    }
}

export function setBpm(
    val: string | number,
    viz?: any,
    fromDispatch = false,
    oldBpmParam: number | null = null,
): void {
    const { playback, arranger } = getState();
    const newBpm = Math.max(40, Math.min(240, parseInt(val.toString(), 10)));
    const currentBpm = fromDispatch ? oldBpmParam || playback.bpm : playback.bpm;

    if (!fromDispatch && newBpm === currentBpm) {
        return;
    }

    // Audio parameters use direct mutation for precision timing
    if (playback.isPlaying && playback.audio) {
        const now = playback.audio.currentTime;
        const ratio = currentBpm / newBpm;
        const noteTimeRemaining = playback.nextNoteTime - now;
        if (noteTimeRemaining > 0) {
            (playback as Mutable<typeof playback>).nextNoteTime = now + noteTimeRemaining * ratio; // @direct-mutation
        }

        const unswungNextNoteTimeRemaining = playback.unswungNextNoteTime - now;
        if (unswungNextNoteTimeRemaining > 0) {
            (playback as Mutable<typeof playback>).unswungNextNoteTime =
                now + unswungNextNoteTimeRemaining * ratio; // @direct-mutation
        }
    }

    if (!fromDispatch) {
        dispatch(ACTIONS.SET_BPM, newBpm);
    }

    syncWorker();
    // #1144 — no immediate save: setBpm's only live caller is the SET_BPM
    // case in state-effects.ts's handleEffects, so the dispatch that reached
    // this call already schedules the #1127 chokepoint's debounced save once
    // this function returns and the switch falls through.
    if (viz && playback.isPlaying && playback.audio) {
        const secondsPerBeat = 60.0 / playback.bpm;
        const sixteenth = 0.25 * secondsPerBeat;
        const stepsPerMeasure = getStepsPerMeasure(arranger.timeSignature);
        const measureTime =
            playback.unswungNextNoteTime - (playback.step % stepsPerMeasure) * sixteenth;
        viz.setBeatReference(measureTime);
    }
}
