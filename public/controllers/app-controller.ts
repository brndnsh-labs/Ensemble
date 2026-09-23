import { dispatch, getState } from '../state.js';
import type { Mutable, Palette, ThemeMode } from '../types.js';
import { ACTIONS } from '../types.js';
import { syncWorker } from '../worker-client.js';

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
    fromDispatch = false,
    oldBpmParam: number | null = null,
): void {
    const { playback } = getState();
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
}
