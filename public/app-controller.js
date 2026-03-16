import { saveCurrentState } from './persistence.js';
import { dispatch, getState } from './state.js';
import { ACTIONS } from './types.js';
import { getStepsPerMeasure } from './utils.js';
import { syncWorker } from './worker-client.js';

export function applyTheme(theme) {
    const { playback } = getState();
    playback.theme = theme; // @direct-mutation
    if (theme === 'auto') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    } else {
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.style.colorScheme = theme;
    }
}

export function setBpm(val, viz, fromDispatch = false, oldBpmParam = null) {
    const { playback, arranger } = getState();
    const newBpm = Math.max(40, Math.min(240, parseInt(val, 10)));
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
            playback.nextNoteTime = now + noteTimeRemaining * ratio; // @direct-mutation
        }

        const unswungNextNoteTimeRemaining = playback.unswungNextNoteTime - now;
        if (unswungNextNoteTimeRemaining > 0) {
            playback.unswungNextNoteTime = now + unswungNextNoteTimeRemaining * ratio; // @direct-mutation
        }
    }

    if (!fromDispatch) {
        dispatch(ACTIONS.SET_BPM, newBpm);
    }

    syncWorker();
    saveCurrentState();

    if (viz && playback.isPlaying && playback.audio) {
        const secondsPerBeat = 60.0 / playback.bpm;
        const sixteenth = 0.25 * secondsPerBeat;
        const stepsPerMeasure = getStepsPerMeasure(arranger.timeSignature);
        const measureTime =
            playback.unswungNextNoteTime - (playback.step % stepsPerMeasure) * sixteenth;
        viz.setBeatReference(measureTime);
    }
}
