/**
 * 6/8 Soloist Evaluation Script (All Blues)
 * Analyzes the "Dynamic Head" and subsequent improvisation in 6/8 Jazz.
 */

import { TIME_SIGNATURES } from '../public/config.js';
import { getSoloistNote } from '../public/engine/soloist.js';
import { generateSessionSeed } from '../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../public/state.js';
import { ACTIONS } from '../public/types.js';
import { getStepInfo, midiToNote } from '../public/utils.js';

function evaluate68Soloist(intensity = 0.5) {
    const genre = 'Jazz';
    const bpm = 110;
    const timeSignature = '6/8';

    console.log(
        `\n=== 6/8 Soloist Evaluation: ${genre} @ ${bpm} BPM (Intensity: ${intensity}) ===`,
    );

    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: genre, enabled: true });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart' });
    dispatch(ACTIONS.SET_TIME_SIGNATURE, timeSignature);
    dispatch(ACTIONS.SET_BAND_INTENSITY, intensity);
    dispatch(ACTIONS.SET_BPM, bpm);
    getState().playback.currentLoopCount = 0;

    const { arranger, soloist } = getState();
    const ts = TIME_SIGNATURES[timeSignature];
    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;

    // All Blues Chords (Simplified: G7, C7, D7)
    const _chords = [
        { rootMidi: 55, quality: '7', intervals: [0, 4, 7, 10], beats: 4 }, // G7 (4 bars in 6/8 = 24 beats? No, let's use measures)
        { rootMidi: 60, quality: '7', intervals: [0, 4, 7, 10], beats: 4 }, // C7
        { rootMidi: 62, quality: '7', intervals: [0, 4, 7, 10], beats: 2 }, // D7
        { rootMidi: 61, quality: '7', intervals: [0, 4, 7, 10], beats: 2 }, // Eb7 (passing)
    ];

    // Build a 12-bar blues in 6/8
    // All Blues is actually G7 (4 bars), C7 (2 bars), G7 (2 bars), D7alt (1 bar), Eb7#9/D7#9 (1 bar), G7 (2 bars)
    // For simplicity:
    const barSequence = [
        { root: 55, bars: 4 },
        { root: 60, bars: 2 },
        { root: 55, bars: 2 },
        { root: 62, bars: 1 },
        { root: 63, bars: 1 },
        { root: 55, bars: 2 },
    ];

    const stepMap = [];
    const _sectionMap = [];
    let currentStep = 0;

    barSequence.forEach((bs) => {
        const _start = currentStep;
        const length = bs.bars * stepsPerMeasure;
        const chord = {
            rootMidi: bs.root,
            quality: '7',
            intervals: [0, 4, 7, 10],
            beats: bs.bars * ts.beats,
        };
        for (let i = 0; i < length; i++) {
            stepMap.push({ step: currentStep + i, chord });
        }
        currentStep += length;
    });

    arranger.totalSteps = currentStep;
    arranger.stepMap = stepMap;
    arranger.sectionMap = [{ start: 0, end: currentStep, label: 'head' }];

    console.log('Generating Dynamic Head (Seed)...');
    soloist.sessionSeed = generateSessionSeed(getState(), arranger, 'jazz', intensity, 'ALL_BLUES');

    console.log(`Seed Notes Generated: ${soloist.sessionSeed.notes.length}`);

    // Analyze Head Rhythms
    const headPulses = soloist.sessionSeed.notes.filter((n) =>
        ts.pulse.includes(n.step % stepsPerMeasure),
    );
    const _headOffbeats = soloist.sessionSeed.notes.filter(
        (n) => !ts.pulse.includes(n.step % stepsPerMeasure),
    );
    console.log(
        `Head Pulse Adherence: ${((headPulses.length / (soloist.sessionSeed.notes.length || 1)) * 100).toFixed(1)}%`,
    );

    console.log(`\nStep | M:B  | Note | MIDI | Dur | Vel  | Role | Flags`);
    console.log(`-------------------------------------------------------------------`);

    const loopsToSimulate = 2; // Loop 0 (Head), Loop 1 (Improv)

    for (let loop = 0; loop < loopsToSimulate; loop++) {
        getState().playback.currentLoopCount = loop;
        console.log(`\n>>> ${loop === 0 ? 'HEAD (LOOP 0)' : 'SOLO (LOOP 1)'} <<<`);

        for (let s = 0; s < arranger.totalSteps; s++) {
            const stepInfo = getStepInfo(s, ts, null, TIME_SIGNATURES);
            const entry = stepMap[s];
            const res = getSoloistNote(
                getState(),
                entry.chord,
                entry.chord,
                s,
                440,
                0,
                'smart',
                s % 16, // Use modulo 16 as an approximation for some engines
                { sectionStart: 0, sectionEnd: arranger.totalSteps, bypassRhythm: false },
                stepInfo,
            );

            if (res) {
                const notes = Array.isArray(res) ? res : [res];
                notes.forEach((n) => {
                    const measureInLoop = Math.floor(s / stepsPerMeasure) + 1;
                    const beatInMeasure = Math.floor(stepInfo.mStep / ts.stepsPerBeat) + 1;
                    const m_b = `${measureInLoop}:${beatInMeasure}`.padEnd(5);
                    const noteInfo = midiToNote(n.midi);
                    const noteName = `${noteInfo.name}${noteInfo.octave}`.padEnd(4);

                    console.log(
                        `${String(s).padStart(4)} | ${m_b} | ${noteName} | ${String(n.midi).padStart(4)} | ${String(n.durationSteps).padStart(3)} | ${n.velocity.toFixed(2)} | ${soloist.phraseContext.role.padEnd(4)} | ${n.device || '-'}`,
                    );
                });
            }
        }
    }
}

evaluate68Soloist(0.6);
