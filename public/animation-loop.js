import { TIME_SIGNATURES } from './config.js';
import { getVisualTime } from './engine/engine.js';
import { switchMeasure } from './instrument-controller.js';
import { dispatch, getState } from './state.js';
import { ACTIONS } from './types.js';
import { getStepsPerMeasure } from './utils.js';

let lastFrameTime = 0;
let missedFrames = 0;
let vizCrashCount = 0;

export function draw(viz) {
    const { playback, groove, chords, bass, soloist, harmony, vizState, arranger } = getState();
    if (!playback.isDrawing) {
        return;
    }

    // --- Performance Resilience Monitoring ---
    const nowFrame = performance.now();
    if (lastFrameTime > 0) {
        const delta = nowFrame - lastFrameTime;
        if (delta > 35) {
            // Missed at least 2 frames (at 60fps)
            missedFrames++;
            if (missedFrames > 15) {
                dispatch(ACTIONS.TRIGGER_EMERGENCY_LOOKAHEAD);
                missedFrames = 0;
            }
        } else if (delta < 20) {
            missedFrames = Math.max(0, missedFrames - 1);
        }
    }
    lastFrameTime = nowFrame;

    if (!playback.audio) {
        playback.isDrawing = false; // @direct-mutation
        return;
    }
    if (!playback.isPlaying && playback.drawQueue.length === 0) {
        playback.isDrawing = false; // @direct-mutation
        if (chords.lastActiveChordIndex !== null) {
            chords.lastActiveChordIndex = null; // @direct-mutation
            dispatch('VIS_RESET');
        }
        if (viz) {
            viz.clear();
        }
        return;
    }
    const now = getVisualTime();
    while (playback.drawQueue.length > 0 && playback.drawQueue[0].time < now - 2.0) {
        playback.drawQueue.shift();
    }
    if (playback.drawQueue.length > 300) {
        playback.drawQueue = playback.drawQueue.slice(playback.drawQueue.length - 200); // @direct-mutation
    }
    const spm = getStepsPerMeasure(arranger.timeSignature);
    while (playback.drawQueue.length && playback.drawQueue[0].time <= now) {
        const ev = playback.drawQueue.shift();
        if (ev.type === 'drum_vis') {
            const stepMeasure = Math.floor(ev.step / spm);
            if (
                groove.followPlayback &&
                stepMeasure !== groove.currentMeasure &&
                playback.isPlaying
            ) {
                switchMeasure(stepMeasure, true);
            }
            playback.lastPlayingStep = ev.step; // @direct-mutation
        } else if (ev.type === 'chord_vis') {
            if (chords.lastActiveChordIndex !== ev.index) {
                chords.lastActiveChordIndex = ev.index; // @direct-mutation
                dispatch('VIS_UPDATE', { type: 'chord', index: ev.index });
            }
            if (viz && vizState.enabled && playback.isDrawing) {
                ev.notes = ev.chordNotes;
                viz.pushChord(ev);
            }
        } else if (ev.type === 'bass_vis') {
            if (viz && vizState.enabled && playback.isDrawing) {
                ev.noteName = ev.name;
                viz.pushNote('bass', ev);
            }
        } else if (ev.type === 'soloist_vis') {
            if (viz && vizState.enabled && playback.isDrawing) {
                viz.truncateNotes('soloist', ev.time);
                ev.noteName = ev.name;
                viz.pushNote('soloist', ev);
            }
        } else if (ev.type === 'harmony_vis') {
            if (viz && vizState.enabled && playback.isDrawing) {
                ev.noteName = ev.name;
                viz.pushNote('harmony', ev);
            }
        } else if (ev.type === 'drums_vis') {
            if (viz && vizState.enabled && playback.isDrawing) {
                viz.pushNote('drums', ev);
            }
        } else if (ev.type === 'fill_active') {
            if (viz && vizState.enabled && playback.isDrawing) {
                viz.isFillActive = ev.active;
            }
        }
    }
    if (viz && vizState.enabled && playback.isDrawing) {
        try {
            viz.setRegister('bass', bass.octave);
            viz.setRegister('soloist', soloist.octave);
            viz.setRegister('chords', chords.octave);
            viz.setRegister('harmony', harmony.octave);
            const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
            viz.render(now, playback.bpm, ts);
            vizCrashCount = 0;
        } catch (e) {
            console.error('[Visualizer Error]', e);
            vizCrashCount++;
            if (vizCrashCount > 3) {
                console.warn('Visualizer disabled due to repeated errors.');
                vizState.enabled = false; // @direct-mutation
                vizCrashCount = 0;
            }
        }
    }

    requestAnimationFrame(() => draw(viz));
}
