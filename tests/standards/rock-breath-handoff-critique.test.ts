// @ts-nocheck
// Rock soloist-breath handoff critique (#997).
//
// Contract under test:
//   real Q&A seed window -> one nullable coordination owner -> exactly one
//   local interpretation. Chords reuse the established delayed Q&A echo as a
//   short shell; bass force-activates the same step and emits one diatonic
//   pickup toward the answer harmony. Paired owner/no-owner runs keep the test
//   from counting ordinary Rock comp or bass events as responses.

import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import {
    getBassNote,
    isBassActive,
    isRockQaBassResponseStep,
} from '../../public/engine/bass-engine.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { selectRockQaResponseOwner } from '../../public/engine/coordination-engine.js';
import { foldPracticeStep } from '../../public/engine/section-overrides.js';
import { getQaHangAt } from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import { getStepInfo } from '../../public/utils.js';

const TS = TIME_SIGNATURES['4/4'];

function buildRockState() {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: 'Rock' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.62);
    const state = getState();
    const preset = CHORD_PRESETS.find((row) => row.name === 'Pop (Ballad)');
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.timeSignature = '4/4';
    state.arranger.sections = preset.sections.map((section, index) => ({
        ...section,
        id: `handoff-${index}`,
    }));
    state.chords.enabled = true;
    state.chords.style = 'smart';
    state.bass.enabled = true;
    state.bass.style = 'rock';
    state.bass.lastFreq = null;
    state.bass.octave = 38;
    state.soloist.enabled = true;
    state.soloist.style = 'rock';
    state.soloist.session.phrasing.busySteps = 0;
    validateProgression(state);
    return state;
}

function resetComping() {
    compingState.currentCell = new Array(16).fill(0);
    compingState.lockedUntil = 0;
    compingState.grooveRetentionCount = 0;
    compingState.lastSectionId = null;
    compingState.lastVoicingMidis = [];
    compingState.statementChordKey = null;
    compingState.statementVoicingMidis = [];
    compingState.ringSuppressStep = -1;
    compingState.ringSuppressChordKey = null;
}

function controlledHang(echoStep = 3) {
    return {
        pc: 11,
        drawSalt: 997,
        hangStartStep: echoStep - 2,
        echoStep,
        answerEntryStep: 8,
        resolutionBarStart: 16,
        resolutionBarEnd: 32,
    };
}

function coordinationFor(owner, qaHang = controlledHang()) {
    return {
        soloistQaHang: qaHang,
        soloistQaResponseOwner: owner,
        soloistBusy: false,
        soloistActive: false,
        soloistResting: true,
        soloistNotesInPhrase: 4,
        bassHit: false,
        bassMidi: 0,
        kickHit: false,
        isFinalMeasure: false,
        introBarsElapsed: -1,
        outroBarsRemaining: -1,
        subtractionMutedLanes: [],
    };
}

function soundingComp(state, chord, step, owner) {
    resetComping();
    const info = getStepInfo(step, TS, [], TIME_SIGNATURES);
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
        return getAccompanimentNotes(
            state,
            chord,
            step,
            step,
            info.mStep,
            info,
            coordinationFor(owner),
        ).filter((note) => note.midi > 0 && !note.muted);
    } finally {
        Math.random = originalRandom;
    }
}

describe('Rock soloist-breath handoff critique (#997)', () => {
    it('real production seeds assign exactly one stable owner and exercise both players', () => {
        const state = buildRockState();
        const owners = [];
        let windows = 0;

        for (let seedIndex = 0; seedIndex < 8; seedIndex++) {
            const seed = generateSessionSeed(
                state,
                state.arranger,
                'rock',
                0.62,
                `ROCK_HANDOFF_${seedIndex}`,
            );
            const seen = new Set();
            const scanEnd = Math.min(seed.loopLengthSteps, state.arranger.totalSteps * 12);
            for (let step = 0; step < scanEnd; step++) {
                const qaHang = getQaHangAt(
                    seed,
                    step,
                    TS.stepsPerBeat,
                    TS.beats * TS.stepsPerBeat,
                    state.arranger.totalSteps,
                );
                if (!qaHang || seen.has(qaHang.hangStartStep)) {
                    continue;
                }
                seen.add(qaHang.hangStartStep);
                const owner = selectRockQaResponseOwner(qaHang, 'Rock', true, true);
                const again = selectRockQaResponseOwner(qaHang, 'Rock', true, true);
                expect(['chords', 'bass']).toContain(owner);
                expect(again).toBe(owner);
                owners.push(owner);
                windows++;
            }
        }

        const chordShare = owners.filter((owner) => owner === 'chords').length / owners.length;
        console.log(
            `\n--- ROCK BREATH OWNER CRITIQUE ---\n` +
                `[Q&A windows] ${windows}\n` +
                `[Chord share] ${(100 * chordShare).toFixed(1)}% (measured guard: 20-80%)\n` +
                '------------------------------------\n',
        );
        expect(windows).toBeGreaterThan(8);
        expect(chordShare).toBeGreaterThan(0.2); // measured: seeded split should exercise both owners
        expect(chordShare).toBeLessThan(0.8); // measured: catches an accidentally one-sided selector
    });

    it('availability, genre, and practice folding keep ownership nullable and deterministic', () => {
        const qaHang = controlledHang(6);
        expect(selectRockQaResponseOwner(qaHang, 'Jazz', true, true)).toBeNull();
        expect(selectRockQaResponseOwner(null, 'Rock', true, true)).toBeNull();
        expect(selectRockQaResponseOwner(qaHang, 'Rock', false, false)).toBeNull();
        expect(selectRockQaResponseOwner(qaHang, 'Rock', true, false)).toBe('chords');
        expect(selectRockQaResponseOwner(qaHang, 'Rock', false, true)).toBe('bass');

        const state = buildRockState();
        const seed = generateSessionSeed(
            state,
            state.arranger,
            'rock',
            0.62,
            'ROCK_HANDOFF_PRACTICE',
        );
        let liveWindow = null;
        for (let step = 0; step < seed.loopLengthSteps && !liveWindow; step++) {
            liveWindow = getQaHangAt(
                seed,
                step,
                TS.stepsPerBeat,
                TS.beats * TS.stepsPerBeat,
                state.arranger.totalSteps,
            );
        }
        expect(liveWindow).not.toBeNull();
        const loopStart = Math.floor(liveWindow.echoStep / 16) * 16;
        const loop = { loopStartStep: loopStart, loopEndStep: loopStart + 16 };
        const repeatedRawStep = liveWindow.echoStep + 16;
        const repeatedMusicalStep = foldPracticeStep(repeatedRawStep, loop);
        const repeatedWindow = getQaHangAt(
            seed,
            repeatedMusicalStep,
            TS.stepsPerBeat,
            TS.beats * TS.stepsPerBeat,
            state.arranger.totalSteps,
        );

        expect(repeatedMusicalStep).toBe(liveWindow.echoStep);
        expect(repeatedWindow).toEqual(liveWindow);
        expect(selectRockQaResponseOwner(repeatedWindow, 'Rock', true, true)).toBe(
            selectRockQaResponseOwner(liveWindow, 'Rock', true, true),
        );
    });

    it('chord ownership inserts one lean delayed shell while bass/no-owner leaves comp resting', () => {
        const state = buildRockState();
        const chord = state.arranger.stepMap[0].chord;
        const step = controlledHang().echoStep;
        const chordOwned = soundingComp(state, chord, step, 'chords');
        const bassOwned = soundingComp(state, chord, step, 'bass');
        const unowned = soundingComp(state, chord, step, null);

        expect(chordOwned.length).toBeGreaterThanOrEqual(1);
        expect(chordOwned.length).toBeLessThanOrEqual(2); // intent: a shell, never a block chord
        expect(Math.max(...chordOwned.map((note) => note.durationSteps))).toBeLessThanOrEqual(1);
        expect(bassOwned).toEqual(unowned);
        expect(bassOwned).toEqual([]);
    });

    it('bass ownership shares one predicate across activation and a short diatonic pickup', () => {
        const state = buildRockState();
        const step = controlledHang().echoStep; // odd sixteenth: ordinary Rock bass is inactive
        const info = getStepInfo(step, TS, [], TIME_SIGNATURES);
        const chord = state.arranger.stepMap[0].chord;
        const answerChord =
            state.arranger.stepMap.find((entry) => entry.start >= 8)?.chord ?? chord;
        const bassCoordination = coordinationFor('bass');
        const chordCoordination = coordinationFor('chords');

        expect(isRockQaBassResponseStep(state, step, bassCoordination)).toBe(true);
        expect(isBassActive(state, 'rock', step, step, info, bassCoordination)).toBe(true);
        expect(isBassActive(state, 'rock', step, step, info, chordCoordination)).toBe(false);

        const response = getBassNote(
            state,
            chord,
            answerChord,
            0,
            null,
            38,
            'rock',
            0,
            step,
            step,
            { sectionStart: 0, sectionEnd: 16, stepCoordination: bassCoordination },
            info,
        );
        const noOwner = getBassNote(
            state,
            chord,
            answerChord,
            0,
            null,
            38,
            'rock',
            0,
            step,
            step,
            { sectionStart: 0, sectionEnd: 16, stepCoordination: chordCoordination },
            info,
        );

        expect(response).not.toBeNull();
        expect(response.durationSteps).toBeLessThanOrEqual(1);
        expect(response.midi % 12).not.toBe(answerChord.rootMidi % 12);
        const approachDistance = Math.min(
            (answerChord.rootMidi - response.midi + 120) % 12,
            (response.midi - answerChord.rootMidi + 120) % 12,
        );
        expect(approachDistance).toBeLessThanOrEqual(2); // intent: adjacent scale step into harmony
        expect(noOwner).toBeNull();
    });

    it('bass response yields to subtraction and the final-cadence tonic', () => {
        const state = buildRockState();
        const chord = state.arranger.stepMap[0].chord;
        const muted = coordinationFor('bass', controlledHang(3));
        muted.subtractionMutedLanes = ['bass'];
        const mutedInfo = getStepInfo(3, TS, [], TIME_SIGNATURES);
        expect(isBassActive(state, 'rock', 3, 3, mutedInfo, muted)).toBe(false);
        expect(
            getBassNote(
                state,
                chord,
                chord,
                0,
                null,
                38,
                'rock',
                0,
                3,
                3,
                { sectionStart: 0, sectionEnd: 16, stepCoordination: muted },
                mutedInfo,
            ),
        ).toBeNull();

        const cadence = coordinationFor('bass', controlledHang(0));
        cadence.isFinalMeasure = true;
        const cadenceInfo = getStepInfo(0, TS, [], TIME_SIGNATURES);
        const cadenceNote = getBassNote(
            state,
            chord,
            chord,
            0,
            null,
            38,
            'rock',
            0,
            0,
            0,
            { sectionStart: 0, sectionEnd: 16, stepCoordination: cadence },
            cadenceInfo,
        );
        expect(isRockQaBassResponseStep(state, 0, cadence)).toBe(false);
        expect(cadenceNote.midi % 12).toBe(chord.rootMidi % 12);
        expect(cadenceNote.durationSteps).toBe(16); // intent: cadence rings; pickup cannot preempt it
    });
});
