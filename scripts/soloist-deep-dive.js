/**
 * Soloist Deep-Dive Diagnostic Script
 * Provides a granular, note-by-note log of a full simulated session.
 */

import { TIME_SIGNATURES } from '../public/config.js';
import { getSoloistNote } from '../public/engine/soloist.js';
import { dispatch, getState } from '../public/state.js';
import { ACTIONS } from '../public/types.js';
import { getStepInfo, midiToNote } from '../public/utils.js';

function deepDiveSession(genre = 'Rock', bpm = 102, measures = 32, intensity = 0.6) {
    console.log(`\n=== Soloist Deep Dive: ${genre} @ ${bpm} BPM (Intensity: ${intensity}) ===`);
    console.log(`Simulating ${measures} measures\n`);

    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: genre, enabled: true });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart' });
    dispatch(ACTIONS.UPDATE_PLAYBACK, { bandIntensity: intensity, bpm: bpm });

    const { arranger, soloist } = getState();
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;

    arranger.totalSteps = measures * stepsPerMeasure;
    const chord = {
        rootMidi: 60,
        scale: [0, 2, 4, 5, 7, 9, 11],
        intervals: [0, 4, 7],
        quality: 'major',
    };

    console.log(`Step | M:B  | Note | MIDI | Dur | Vel  | Role | Profile | Flags`);
    console.log(`-------------------------------------------------------------------`);

    let lastMidi = null;
    const intervals = [];

    for (let s = 0; s < arranger.totalSteps; s++) {
        const stepInfo = getStepInfo(s, ts, null, TIME_SIGNATURES);
        const res = getSoloistNote(
            getState(),
            chord,
            chord,
            s,
            440,
            0,
            'smart',
            s % 16,
            { sectionStart: 0, sectionEnd: 64, bypassRhythm: false },
            stepInfo,
        );

        if (res) {
            const notes = Array.isArray(res) ? res : [res];
            notes.forEach((n) => {
                const m_b =
                    `${Math.floor(s / stepsPerMeasure) + 1}:${Math.floor(stepInfo.mStep / ts.stepsPerBeat) + 1}`.padEnd(
                        5,
                    );
                const noteInfo = midiToNote(n.midi);
                const noteName = `${noteInfo.name}${noteInfo.octave}`.padEnd(4);
                const midi = `${n.midi}`.padStart(4);
                const dur = `${n.durationSteps || 1}`.padStart(3);
                const vel = n.velocity.toFixed(2);
                const role = (soloist.phraseContext.role || '-').padEnd(4);
                const profile = (soloist.phraseContext.profile || '-').padEnd(8);

                const flags = [];
                if (n.isSustained) {
                    flags.push('HOLD');
                }
                if (n.vibrato) {
                    flags.push('VIB');
                }
                if (n.isDoubleStop) {
                    flags.push('DBL');
                }
                if (n.device) {
                    flags.push(n.device.toUpperCase());
                }

                const flagStr = flags.join('|');

                console.log(
                    `${String(s).padStart(4)} | ${m_b} | ${noteName} | ${midi} | ${dur} | ${vel} | ${role} | ${profile} | ${flagStr}`,
                );

                if (lastMidi !== null && !n.isDoubleStop) {
                    intervals.push(Math.abs(n.midi - lastMidi));
                }
                lastMidi = n.midi;
            });
        }
    }

    // melo-stats
    const avgInterval =
        intervals.length > 0
            ? (intervals.reduce((a, b) => a + b, 0) / intervals.length).toFixed(1)
            : 0;
    const stepwise = intervals.filter((i) => i <= 2).length;
    const jumps = intervals.filter((i) => i > 2).length;
    const stepwisePct = intervals.length > 0 ? ((stepwise / intervals.length) * 100).toFixed(1) : 0;

    console.log(`\n--- Melodic Continuity Analysis ---`);
    console.log(`Avg Interval: ${avgInterval} semitones`);
    console.log(`Stepwise Motion (<= 2st): ${stepwisePct}%`);
    console.log(`Leaps (> 2st): ${jumps}`);
}

deepDiveSession('Rock', 102, 16, 0.6);
