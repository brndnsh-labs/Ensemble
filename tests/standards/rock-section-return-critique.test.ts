// @ts-nocheck
// Rock section-return critique (#996).
//
// One post-Head soloist/snare catch becomes a rehearsed hit at the same
// section-relative step in later matching Choruses. The drummer and comper own
// their mutes independently; practice folding consumes the dormant base-form
// template instead of losing the absolute-timeline gesture.
import { describe, expect, it } from 'vitest';
import { compingState, resetCompingState } from '../../public/engine/accompaniment.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { generateSoloistAccents } from '../../public/engine/drum-seeder.js';
import { ExportProcessor } from '../../public/engine/midi-worker-logic.js';
import { foldPracticeStep } from '../../public/engine/section-overrides.js';
import { generateNotesForStep } from '../../public/engine/tick-logic.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

const RETURN_OFFSET = 6; // open 16th: away from the One and both backbeats

function buildState() {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: 'Rock' });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart', mode: 'monophonic' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.8);
    dispatch(ACTIONS.SET_BPM, 118);

    const state = getState();
    state.arranger.sections = [
        {
            id: 'intro',
            label: 'Intro',
            value: 'C | G',
            key: 'C',
            timeSignature: '4/4',
        },
        {
            id: 'verse',
            label: 'Verse',
            value: 'Am | F',
            key: 'C',
            timeSignature: '4/4',
        },
        {
            id: 'chorus-1',
            label: 'Chorus 1',
            value: 'C | G',
            key: 'C',
            timeSignature: '4/4',
        },
        {
            id: 'bridge',
            label: 'Bridge',
            value: 'Dm | F',
            key: 'C',
            timeSignature: '4/4',
        },
        {
            id: 'chorus-2',
            label: 'Chorus II',
            value: 'C | G',
            key: 'C',
            timeSignature: '4/4',
        },
        {
            id: 'outro',
            label: 'Outro',
            value: 'F | C',
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

    const firstChorus = state.arranger.sectionMap.find((section) => section.id === 'chorus-1');
    const secondChorus = state.arranger.sectionMap.find((section) => section.id === 'chorus-2');
    const sourceStep = state.arranger.totalSteps + firstChorus.start + RETURN_OFFSET;
    const returnStep = state.arranger.totalSteps + secondChorus.start + RETURN_OFFSET;
    state.soloist.session.seed = {
        loopLengthSteps: state.arranger.totalSteps * 3,
        notes: [
            {
                step: sourceStep,
                midi: 72,
                velocity: 0.9,
                durationSteps: 0.5,
            },
        ],
    };
    state.groove.accentMap = generateSoloistAccents(
        state,
        state.arranger,
        state.soloist.session.seed,
        'Rock',
        state.playback.bandIntensity,
        'TYPE_0',
    );
    state.groove.seedTimelineStartStep = 0;
    state.playback.currentLoopCount = 1;

    return { state, firstChorus, secondChorus, sourceStep, returnStep };
}

function renderStep(state, step, includeChords = true) {
    resetCompingState(compingState);
    return generateNotesForStep(
        state,
        step,
        {
            mainCursor: { index: 0, sectionIndex: 0 },
            lookaheadCursor: { index: 0, sectionIndex: 0 },
        },
        {
            // Mirrors split live-worker heads: the soloist can already be
            // buffered while its enabled lane still owns the planned source.
            includeSoloist: false,
            includeBass: false,
            includeChords,
            includeHarmony: false,
            includeDrums: false,
        },
    );
}

function audibleChordNotes(result) {
    return result.notes.filter(
        (note) => note.module === 'chords' && note.midi > 0 && note.muted !== true,
    );
}

describe('Rock Chorus section-return critique (#996)', () => {
    it('reaches both producers at the same relative point in a later matching Chorus', () => {
        const { state, returnStep } = buildState();
        const result = renderStep(state, returnStep);
        const chords = audibleChordNotes(result);

        expect(result.coordination.sharedCatch).toEqual({
            type: 'snare-stab',
            velocity: 1.1,
            role: 'section-return',
        });
        expect(result.drumHits.some((hit) => hit.soundName === 'Snare')).toBe(true);
        expect(chords.length).toBeGreaterThanOrEqual(1);
        expect(chords.length).toBeLessThanOrEqual(2);
        expect(chords.every((note) => note.durationSteps <= 1)).toBe(true);
    });

    it('keeps drummer and comper mute ownership independent', () => {
        const chordMuted = buildState();
        chordMuted.state.chords.enabled = false;
        const drumsOnly = renderStep(chordMuted.state, chordMuted.returnStep, false);
        expect(audibleChordNotes(drumsOnly)).toHaveLength(0);
        expect(drumsOnly.drumHits.some((hit) => hit.soundName === 'Snare')).toBe(true);

        const drumMuted = buildState();
        drumMuted.state.groove.enabled = false;
        const chordsOnly = renderStep(drumMuted.state, drumMuted.returnStep);
        expect(chordsOnly.drumHits).toHaveLength(0);
        expect(chordsOnly.coordination.sharedCatch?.role).toBe('section-return');
        expect(audibleChordNotes(chordsOnly).length).toBeGreaterThanOrEqual(1);
    });

    it('preserves the relative hit when a Chorus is folded for section practice', () => {
        const { state, secondChorus } = buildState();
        state.playback.currentLoopCount = 0;
        state.playback.loopStartStep = secondChorus.start;
        state.playback.loopEndStep = secondChorus.end;
        state.groove.seedTimelineStartStep = 40;
        const rawPracticeStep = secondChorus.end + RETURN_OFFSET;
        const musicalStep = foldPracticeStep(rawPracticeStep, state.playback);

        expect(musicalStep).toBe(secondChorus.start + RETURN_OFFSET);
        const result = renderStep(state, musicalStep);
        expect(result.coordination.sharedCatch?.role).toBe('section-return');
        expect(audibleChordNotes(result).length).toBeGreaterThanOrEqual(1);
    });

    it('keeps the dormant template silent during the normal Head', () => {
        const { state, secondChorus } = buildState();
        state.playback.currentLoopCount = 0;
        state.playback.loopStartStep = -1;
        state.playback.loopEndStep = -1;

        const result = renderStep(state, secondChorus.start + RETURN_OFFSET);
        expect(result.coordination.sharedCatch).toBeNull();
    });

    it('exports the same rehearsed chord hit to chord-only MIDI across a real multi-loop horizon', () => {
        const { state, returnStep } = buildState();
        const processor = new ExportProcessor(state, {
            includedTracks: ['chords'],
            loopMode: 'time',
            targetDuration: 1,
        });
        expect(returnStep).toBeLessThan(processor.totalStepsWithoutEnding);

        for (let step = 0; step < returnStep; step++) {
            processor.processStep(step);
        }
        const eventCountBeforeReturn = processor.chordTrack.events.length;
        processor.processStep(returnStep);

        const chordNoteOns = processor.chordTrack.events
            .slice(eventCountBeforeReturn)
            .filter((event) => (event.data[0] & 0xf0) === 0x90);
        expect(chordNoteOns.length).toBeGreaterThanOrEqual(1);
        expect(chordNoteOns.length).toBeLessThanOrEqual(2);
        expect(processor.drumTrack.events).toHaveLength(1); // track-name metadata only
        processor.cleanup();
    });
});
