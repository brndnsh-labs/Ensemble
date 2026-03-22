import { TIME_SIGNATURES } from '../public/config.js';
import { getAccompanimentNotes } from '../public/engine/accompaniment.js';
import { getBassNote } from '../public/engine/bass-engine.js';
import { validateProgression } from '../public/engine/chords-engine.js';
import { getSoloistNote } from '../public/engine/soloist.js';
import { generateSessionSeed } from '../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../public/state.js';
import { ACTIONS } from '../public/types.js';
import { getStepInfo, midiToNote } from '../public/utils.js';

/**
 * STANDARDS AUDIT SCRIPT
 * Run this to verify band musicality across famous Jazz standards.
 * Usage: node scripts/audit-standards.js [stella|attya|giant-steps]
 */

const STANDARDS = {
    stella: {
        name: 'Stella by Starlight',
        key: 'Bb',
        bpm: 120,
        intensity: 0.75,
        sections: [
            { label: 'A', value: '#ivm7b5 | VII7alt | iim7 | V7 | vm7 | I7 | IVmaj7 | bVII7' },
            {
                label: 'B',
                value: 'Imaj7 | #ivm7b5 VII7 | iiim7b5 | VI7alt | iim7b5 | V7alt | Imaj7 | vm7 I7',
            },
        ],
    },
    attya: {
        name: 'All The Things You Are',
        key: 'Ab',
        bpm: 135,
        intensity: 0.75,
        sections: [
            { label: 'A (Tonic)', value: 'vi7 | ii7 | V7 | Imaj7 | IVmaj7' },
            { label: 'A (III)', value: '#ivm7 | VII7 | IIImaj7', seamless: true },
            { label: 'A2 (V)', value: 'iiim7 | vi7 | II7 | Vmaj7 | Imaj7' },
        ],
    },
    'giant-steps': {
        name: 'Giant Steps',
        key: 'B',
        bpm: 220,
        intensity: 0.8,
        sections: [
            {
                label: 'Main',
                value: 'Imaj7 bIII7 | bVImaj7 VII7 | IIImaj7 | bviim7 bIII7 | bVImaj7 VII7 | IIImaj7 V7 | Imaj7',
            },
        ],
    },
};

async function runAudit(target = 'stella') {
    const standard = STANDARDS[target];
    if (!standard) {
        console.error(
            `Unknown standard: ${target}. Available: ${Object.keys(STANDARDS).join(', ')}`,
        );
        return;
    }

    console.log(`\n=== 🎷 AUDIT: ${standard.name.toUpperCase()} 🎷 ===`);
    console.log(`Key: ${standard.key} | BPM: ${standard.bpm} | Intensity: ${standard.intensity}\n`);

    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.UPDATE_GB, { genreFeel: 'Jazz', enabled: true });
    dispatch(ACTIONS.UPDATE_PLAYBACK, {
        bandIntensity: standard.intensity,
        bpm: standard.bpm,
        currentLoopCount: 0,
    });
    dispatch(ACTIONS.SET_KEY, standard.key);
    dispatch(ACTIONS.UPDATE_SOLOIST, { enabled: true, style: 'smart' });

    const state = getState();
    state.arranger.sections = standard.sections;
    validateProgression(state);

    const { arranger, soloist } = state;
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;

    soloist.sessionSeed = generateSessionSeed(
        state,
        arranger,
        'jazz',
        standard.intensity,
        'AUDIT_SEED',
    );

    console.log(`Step | M:B  | Chord   | Soloist | Ivl | Bass | Ivl | Accomp`);
    console.log(`-----------------------------------------------------------------------`);

    let lastSoloFreq = null;
    let lastBassFreq = null;
    let voiceLeadingJumps = 0;

    for (let step = 0; step < arranger.totalSteps; step++) {
        const stepInfo = getStepInfo(step, ts, arranger.stepMap, TIME_SIGNATURES);
        const currentChordEntry = arranger.stepMap.find((e) => step >= e.start && step < e.end);
        if (!currentChordEntry) {
            continue;
        }

        const currentChord = currentChordEntry.chord;
        const nextChord =
            arranger.stepMap.find((e) => step + 4 >= e.start && step + 4 < e.end)?.chord ||
            currentChord;

        const soloRes = getSoloistNote(
            state,
            currentChord,
            nextChord,
            step,
            lastSoloFreq,
            60,
            'smart',
            step % stepsPerMeasure,
            {},
            stepInfo,
        );
        const bassRes = getBassNote(
            state,
            currentChord,
            nextChord,
            Math.floor((step % 16) / 4),
            lastBassFreq,
            38,
            'smart',
            0,
            step,
            step % 16,
            {},
            stepInfo,
        );
        const accRes = getAccompanimentNotes(
            state,
            currentChord,
            step,
            step % 16,
            step % 16,
            stepInfo,
        );

        if (!soloRes && !bassRes && (!accRes || accRes.length === 0)) {
            continue;
        }

        const measure = Math.floor(step / stepsPerMeasure) + 1;
        const beat = Math.floor(stepInfo.mStep / ts.stepsPerBeat) + 1;
        const m_b = `${measure}:${beat}`.padEnd(5);

        let soloStr = '-'.padEnd(7);
        let soloIvl = '   ';
        if (soloRes) {
            const note = Array.isArray(soloRes) ? soloRes[0] : soloRes;
            soloStr = midiToNote(note.midi).name + midiToNote(note.midi).octave;
            soloIvl = getIntervalLabel(note.midi, currentChord.rootMidi);
            if (
                lastSoloFreq &&
                Math.abs(note.midi - Math.round(69 + 12 * Math.log2(lastSoloFreq / 440))) > 7
            ) {
                voiceLeadingJumps++;
                soloStr += '⚠️';
            }
            lastSoloFreq = note.freq;
        }

        let bassStr = '-'.padEnd(4);
        let bassIvl = '   ';
        if (bassRes) {
            bassStr = midiToNote(bassRes.midi).name + midiToNote(bassRes.midi).octave;
            bassIvl = getIntervalLabel(bassRes.midi, currentChord.rootMidi);
            lastBassFreq = bassRes.freq;
        }

        const accStr =
            accRes?.length > 0 ? accRes.map((n) => midiToNote(n.midi).name).join(',') : '';

        console.log(
            `${String(step).padStart(4)} | ${m_b} | ${(currentChord.absName || '').padEnd(7)} | ${soloStr.padEnd(7)} | ${soloIvl} | ${bassStr.padEnd(4)} | ${bassIvl} | ${accStr}`,
        );
    }

    console.log(`\n--- 🏁 Audit Summary ---`);
    console.log(`Voice-leading Gaps (>5th): ${voiceLeadingJumps}`);
}

function getIntervalLabel(midi, rootMidi) {
    const semitones = (midi - rootMidi + 120) % 12;
    const labels = ['R', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];
    return labels[semitones].padStart(3);
}

const target = process.argv[2] || 'stella';
runAudit(target);
