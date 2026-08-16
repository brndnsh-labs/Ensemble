// @ts-nocheck
// Funk shared-catch critique (#995).
//
// The drummer owns the catch moment; this suite grades the Funk comper's
// independent interpretation: one short upper-shell clav answer in open space,
// never a second attack stacked onto the existing Funk cell.
import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import {
    compingState,
    getAccompanimentNotes,
    resetCompingState,
} from '../../public/engine/accompaniment.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { generateSoloistAccents } from '../../public/engine/drum-seeder.js';
import { ExportProcessor } from '../../public/engine/midi-worker-logic.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { generateNotesForStep } from '../../public/engine/tick-logic.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import { getStepInfo } from '../../public/utils.js';

const CATCH_STEP = 6; // open 16th: not the One and not adjacent to beats 2/4
const LISTENING_CATCH_STEP = 194; // loop 2, mStep 2: survives all earlier comp returns
const SOLOIST_MIDI = 74; // D5 — the clav cell has two clean alternatives

function buildState() {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: 'Funk' });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart', mode: 'monophonic' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.72);
    dispatch(ACTIONS.SET_BPM, 104);

    const state = getState();
    state.arranger.sections = [
        {
            id: 'funk-a',
            label: 'Funk Vamp',
            value: 'C9 | C9 | F9 | G9 | C9 | C9 | F9 | G9',
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

function resetFunkComping(state, cellHit = false) {
    resetCompingState(compingState);
    const entry = state.arranger.stepMap.find(
        (candidate) => CATCH_STEP >= candidate.start && CATCH_STEP < candidate.end,
    );
    compingState.currentCell = new Array(16).fill(0);
    compingState.currentCell[CATCH_STEP] = cellHit ? 1 : 0;
    compingState.lockedUntil = CATCH_STEP + 16;
    compingState.lastSectionId = entry.chord.sectionId;
    return entry;
}

function renderCatch(state, sharedCatch, extraCoordination = {}, cellHit = false) {
    const entry = resetFunkComping(state, cellHit);
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
            soloistMidi: SOLOIST_MIDI,
            soloistActive: true,
            soloistBusy: false,
            soloistResting: false,
            soloistNotesInPhrase: 1,
            bassHit: false,
            ...extraCoordination,
        },
    ).filter((note) => note.midi > 0 && !note.muted);
}

function exportedFunkChordNoteOns(withCatch) {
    const state = buildState();
    state.soloist.session.seed = {
        notes: [
            {
                step: CATCH_STEP,
                midi: SOLOIST_MIDI,
                velocity: 0.92,
                durationSteps: 0.5,
            },
        ],
        loopLengthSteps: state.arranger.totalSteps,
    };
    state.groove.accentMap = withCatch
        ? { [CATCH_STEP]: { type: 'snare-stab', velocity: 1.1 } }
        : null;
    state.groove.seedTimelineStartStep = 0;

    const processor = new ExportProcessor(state, {
        includedTracks: ['drums', 'soloist', 'chords'],
        loopMode: 'once',
    });
    resetFunkComping(state);
    processor.processStep(CATCH_STEP);

    return processor.chordTrack.events.filter((event) => (event.data[0] & 0xf0) === 0x90);
}

function renderProductionListeningCatch(includeSoloist = true) {
    const state = buildState();
    const planSeed = 'funk-pocket:CATCH_240';
    state.arranger.seed = planSeed;
    state.soloist.session.seed = generateSessionSeed(
        state,
        state.arranger,
        state.soloist.style,
        state.playback.bandIntensity,
        planSeed,
    );
    state.groove.accentMap = generateSoloistAccents(
        state,
        state.arranger,
        state.soloist.session.seed,
        'Funk',
        state.playback.bandIntensity,
        planSeed,
    );
    state.groove.seedTimelineStartStep = 0;
    resetCompingState(compingState);

    const cursors = {
        mainCursor: { index: 0, sectionIndex: 0 },
        lookaheadCursor: { index: 0, sectionIndex: 0 },
    };
    let carryover = { lastActiveSoloistMidi: 0, lastActiveSoloistStep: 0 };
    let result = null;
    for (let step = 0; step <= LISTENING_CATCH_STEP; step++) {
        state.playback.currentLoopCount = Math.floor(step / state.arranger.totalSteps);
        result = generateNotesForStep(
            state,
            step,
            cursors,
            {
                includeSoloist,
                includeBass: false,
                includeChords: true,
                includeHarmony: false,
                includeDrums: false,
            },
            carryover,
        );
        if (result.coordination.lastActiveSoloistMidi) {
            carryover = {
                lastActiveSoloistMidi: result.coordination.lastActiveSoloistMidi,
                lastActiveSoloistStep: result.coordination.lastActiveSoloistStep,
            };
        }
    }

    return {
        coordination: result.coordination,
        chordNotes: result.notes.filter(
            (note) => note.module === 'chords' && note.midi > 0 && !note.muted,
        ),
    };
}

describe('Funk comper shared-catch critique (#995)', () => {
    it('reaches the Funk consumer through the two-loop production listening fixture', () => {
        const { coordination, chordNotes } = renderProductionListeningCatch();

        expect(coordination.sharedCatch).toEqual({ type: 'snare-stab', velocity: 1.02 });
        expect(coordination.soloistActive).toBe(true);
        expect(chordNotes.map((note) => note.midi)).toEqual([64, 70]);
        expect(chordNotes.every((note) => note.durationSteps === 0.25)).toBe(true);
    });

    it('turns an open Funk cell into one deterministic short upper-shell stab', () => {
        const state = buildState();
        const catchIntent = { type: 'snare-stab', velocity: 1.1 };

        const first = renderCatch(state, catchIntent);
        const second = renderCatch(state, catchIntent);

        expect(first).toEqual(second);
        expect(first.length).toBeGreaterThanOrEqual(1);
        expect(first.length).toBeLessThanOrEqual(2);
        expect(first.every((note) => note.durationSteps === 0.25)).toBe(true);
        expect(first.every((note) => note.velocity >= 0.3 && note.velocity <= 0.68)).toBe(true);
        expect(first.every((note) => note.midi % 12 !== SOLOIST_MIDI % 12)).toBe(true);
    });

    it('leaves an existing Funk cell intact instead of stacking or narrowing it', () => {
        const state = buildState();
        const baseline = renderCatch(state, null, {}, true);
        const caught = renderCatch(state, { type: 'snare-stab', velocity: 1.1 }, {}, true);

        expect(baseline).toHaveLength(3);
        expect(caught).toEqual(baseline);
    });

    it('consumes only the approved snare intent and survives split worker lane heads', () => {
        const state = buildState();

        const withoutIntent = renderCatch(state, null);
        const hatBark = renderCatch(state, { type: 'hat-bark', velocity: 1.1 });
        const liveWorkerCatch = renderProductionListeningCatch(false).chordNotes;

        expect(withoutIntent.filter((note) => note.durationSteps !== 0.1)).toHaveLength(0);
        expect(hatBark.filter((note) => note.durationSteps !== 0.1)).toHaveLength(0);
        expect(liveWorkerCatch.length).toBeGreaterThanOrEqual(1);
        expect(liveWorkerCatch.length).toBeLessThanOrEqual(2);
        expect(liveWorkerCatch.every((note) => note.durationSteps === 0.25)).toBe(true);
    });

    it('does not override subtraction or final-cadence precedence', () => {
        const state = buildState();
        const catchIntent = { type: 'snare-stab', velocity: 1.1 };

        expect(renderCatch(state, catchIntent, { subtractionMutedLanes: ['chords'] })).toHaveLength(
            0,
        );
        expect(renderCatch(state, catchIntent, { isFinalMeasure: true })).toHaveLength(0);
    });

    it('writes the drummer-authored Funk catch into the MIDI chord track', () => {
        const baseline = exportedFunkChordNoteOns(false);
        const caught = exportedFunkChordNoteOns(true);
        const caughtMidis = caught.map((event) => event.data[1]);

        expect(baseline.filter((event) => event.data[2] > 40)).toHaveLength(0);
        expect(caught.length).toBeGreaterThanOrEqual(1);
        expect(caught.length).toBeLessThanOrEqual(2);
        expect(caughtMidis.every((midi) => midi % 12 !== SOLOIST_MIDI % 12)).toBe(true);
    });
});
