// @ts-nocheck
// Rock shared-catch critique (#994).
//
// This is a paired contract test: the same silent comp cell is rendered with
// and without the drummer-authored shared catch. The context only locates the
// moment; the assertions grade the comper's independent interpretation — one
// short 1-2 voice shell, no avoidable soloist pitch-class doubling, and no
// bypass of the existing cadence/subtraction precedence.
import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { generateSoloistAccents } from '../../public/engine/drum-seeder.js';
import { getAudibleSnareCatchAtStep } from '../../public/engine/groove-engine.js';
import { ExportProcessor } from '../../public/engine/midi-worker-logic.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import { getStepInfo } from '../../public/utils.js';

const CATCH_STEP = 6; // open 16th: not the One and not adjacent to beats 2/4

function buildState() {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: 'Rock' });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart', mode: 'monophonic' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.72);
    dispatch(ACTIONS.SET_BPM, 118);

    const state = getState();
    state.arranger.sections = [
        {
            id: 'rock-a',
            label: 'Rock Groove',
            value: 'C | G | Am | F | C | G | F | G',
            key: 'C',
            timeSignature: '4/4',
        },
    ];
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.timeSignature = '4/4';
    state.chords.enabled = true;
    state.chords.style = 'smart';
    state.bass.enabled = false;
    state.harmony.enabled = false;
    state.soloist.enabled = true;
    validateProgression(state);
    return state;
}

function resetComping(state, cellHit = false) {
    const entry = state.arranger.stepMap.find(
        (candidate) => CATCH_STEP >= candidate.start && CATCH_STEP < candidate.end,
    );
    compingState.currentCell = new Array(16).fill(0);
    compingState.currentCell[CATCH_STEP] = cellHit ? 1 : 0;
    compingState.lockedUntil = CATCH_STEP + 16;
    compingState.grooveRetentionCount = 0;
    compingState.lastSectionId = entry.chord.sectionId;
    compingState.lastVoicingMidis = [];
    compingState.statementChordKey = null;
    compingState.statementVoicingMidis = [];
    compingState.ringSuppressStep = -1;
    compingState.ringSuppressChordKey = null;
    return entry;
}

function renderCatch(state, sharedCatch, extraCoordination = {}, cellHit = false) {
    const entry = resetComping(state, cellHit);
    const ts = TIME_SIGNATURES['4/4'];
    const stepInfo = getStepInfo(CATCH_STEP, ts, state.arranger.measureMap, TIME_SIGNATURES);
    return getAccompanimentNotes(
        state,
        entry.chord,
        CATCH_STEP,
        CATCH_STEP - entry.start,
        stepInfo.mStep,
        stepInfo,
        {
            sharedCatch,
            soloistMidi: 72,
            soloistActive: true,
            soloistBusy: false,
            soloistResting: false,
            soloistNotesInPhrase: 1,
            bassHit: false,
            ...extraCoordination,
        },
    ).filter((note) => note.midi > 0 && !note.muted);
}

function exportedChordNoteOns(withCatch, includedTracks = ['drums', 'soloist', 'chords']) {
    const state = buildState();
    state.groove.accentMap = withCatch
        ? { [CATCH_STEP]: { type: 'snare-stab', velocity: 1.1 } }
        : null;
    state.groove.seedTimelineStartStep = 0;
    resetComping(state);

    const processor = new ExportProcessor(state, {
        includedTracks,
        loopMode: 'once',
    });
    processor.processStep(CATCH_STEP);

    return processor.chordTrack.events.filter((event) => (event.data[0] & 0xf0) === 0x90);
}

describe('Rock comper shared-catch critique (#994)', () => {
    it('has a reachable deterministic post-head snare catch in the listening fixture', () => {
        const state = buildState();
        const planSeed = 'rock-backbeat:CATCH_0';
        const sessionSeed = generateSessionSeed(
            state,
            state.arranger,
            state.soloist.style,
            state.playback.bandIntensity,
            planSeed,
        );
        const accentMap = generateSoloistAccents(
            state,
            state.arranger,
            sessionSeed,
            'Rock',
            state.playback.bandIntensity,
            planSeed,
        );
        const accentSteps = Object.keys(accentMap)
            .map(Number)
            .sort((a, b) => a - b);

        expect(accentSteps.every((step) => step >= state.arranger.totalSteps)).toBe(true);
        expect(
            accentSteps.every((step, index) => index === 0 || step - accentSteps[index - 1] >= 16),
        ).toBe(true);
        expect(
            getAudibleSnareCatchAtStep({ ...state.groove, accentMap }, 190, 14, 16, false),
        ).toEqual({ type: 'snare-stab', velocity: 1.1 });
    });

    it('turns one silent Rock cell into a deterministic, short 1-2 voice shell', () => {
        const state = buildState();
        const catchIntent = { type: 'snare-stab', velocity: 1.1 };

        const baseline = renderCatch(state, null);
        const first = renderCatch(state, catchIntent);
        const second = renderCatch(state, catchIntent);

        expect(baseline).toHaveLength(0);
        expect(first).toEqual(second);
        expect(first.length).toBeGreaterThanOrEqual(1);
        expect(first.length).toBeLessThanOrEqual(2); // intent: a catch is a shell, never a block chord
        expect(first.every((note) => note.durationSteps <= 1)).toBe(true); // intent: sixteenth-ish stab
        expect(first.every((note) => note.velocity <= 0.72)).toBe(true); // intent: sit under lead + snare
        expect(first.every((note) => note.midi % 12 !== 0)).toBe(true); // C5 soloist; alternate C-chord tones exist
    });

    it('re-voices an existing cell instead of stacking another attack', () => {
        const state = buildState();
        const baseline = renderCatch(state, null, {}, true);
        const caught = renderCatch(state, { type: 'snare-stab', velocity: 1.1 }, {}, true);

        expect(baseline.length).toBeGreaterThan(0);
        expect(caught.length).toBeGreaterThanOrEqual(1);
        expect(caught.length).toBeLessThanOrEqual(2);
        expect(
            new Set(caught.map((note) => note.timingOffset.toFixed(4))).size,
        ).toBeLessThanOrEqual(2);
    });

    it('does not consume the Rock-only intent in another genre', () => {
        const state = buildState();
        state.groove.genreFeel = 'Blues';

        expect(renderCatch(state, { type: 'snare-stab', velocity: 1.1 })).toHaveLength(0);
    });

    it('does not override subtraction or final-cadence precedence', () => {
        const state = buildState();
        const catchIntent = { type: 'snare-stab', velocity: 1.1 };

        expect(renderCatch(state, catchIntent, { subtractionMutedLanes: ['chords'] })).toHaveLength(
            0,
        );
        expect(renderCatch(state, catchIntent, { isFinalMeasure: true })).toHaveLength(0);
    });

    it('writes the engine-generated catch into the MIDI chord track', () => {
        const baseline = exportedChordNoteOns(false);
        const caught = exportedChordNoteOns(true);

        expect(baseline).toHaveLength(0);
        expect(caught.length).toBeGreaterThanOrEqual(1);
        expect(caught.length).toBeLessThanOrEqual(2);
    });

    it('does not write the MIDI catch when the selected export omits a participant', () => {
        expect(exportedChordNoteOns(true, ['drums', 'chords'])).toHaveLength(0);
        expect(exportedChordNoteOns(true, ['soloist', 'chords'])).toHaveLength(0);
    });
});
