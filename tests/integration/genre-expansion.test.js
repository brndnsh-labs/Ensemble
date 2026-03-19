import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRUM_PRESETS } from '../../public/data/drum-presets.js';
import { BASS_STYLES, CHORD_STYLES, SOLOIST_STYLES } from '../../public/data/instrument-styles.js';
import { getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getBassNote } from '../../public/engine/bass-engine.js';
import { getScaleForChord } from '../../public/engine/theory-scales.js';
import { getState } from '../../public/state.js';

const { chords, groove } = getState();

// Mock state
vi.mock('../../public/state.js', () => {
    const mockState = {
        arranger: {
            timeSignature: '4/4',
            progression: [],
            key: 'C',
            isMinor: false,
        },
        groove: {
            genreFeel: 'Country',
            lastDrumPreset: 'Country (Two-Step)',
            instruments: [],
        },
        chords: { enabled: true, style: 'strum-country' },
        bass: { enabled: true, pocketOffset: 0 },
        soloist: { enabled: true, tension: 0, busySteps: 0, motifBuffer: [] },
        harmony: { enabled: false },
        playback: {
            bandIntensity: 0.5,
            complexity: 0.5,
            intent: { anticipation: 0, layBack: 0 },
        },
        vizState: {},
        midi: {},
        storage: {},
        dispatch: vi.fn(),
    };
    return {
        ...mockState,
        stateMap: mockState,
        getState: () => mockState,
    };
});

describe('Genre Expansion Integration', () => {
    describe('Definitions', () => {
        it('should have Country (Two-Step) drum preset', () => {
            expect(DRUM_PRESETS['Country (Two-Step)']).toBeDefined();
            expect(DRUM_PRESETS['Country (Two-Step)'].category).toBe('Country/Folk');
            expect(DRUM_PRESETS['Country (Two-Step)'].Kick).toBeDefined();
        });

        it('should have Metal (Speed) drum preset', () => {
            expect(DRUM_PRESETS['Metal (Speed)']).toBeDefined();
            expect(DRUM_PRESETS['Metal (Speed)'].category).toBe('Rock/Metal');
        });

        it('should have new Chord Styles', () => {
            expect(CHORD_STYLES.find((s) => s.id === 'strum-country')).toBeDefined();
            expect(CHORD_STYLES.find((s) => s.id === 'power-metal')).toBeDefined();
        });

        it('should have new Bass Styles', () => {
            expect(BASS_STYLES.find((s) => s.id === 'country')).toBeDefined();
            expect(BASS_STYLES.find((s) => s.id === 'metal')).toBeDefined();
        });

        it('should have new Soloist Styles', () => {
            expect(SOLOIST_STYLES.find((s) => s.id === 'country')).toBeDefined();
            expect(SOLOIST_STYLES.find((s) => s.id === 'metal')).toBeDefined();
        });
    });

    describe('Country Logic', () => {
        const mockChord = {
            rootMidi: 48, // C3
            quality: 'major',
            freqs: [130.81, 164.81, 196.0], // C, E, G
            intervals: [0, 4, 7],
            beats: 4,
        };

        beforeEach(() => {
            groove.genreFeel = 'Country';
            chords.style = 'strum-country';
        });

        it('should generate alternating bass on beats 1 and 3 for chords', () => {
            // Beat 1 (Step 0) -> Root Bass
            const notes1 = getAccompanimentNotes(mockChord, 0, 0, 0, { isBeatStart: true });
            expect(notes1.length).toBeGreaterThan(0);
            // Should be single note (Bass) usually around rootMidi
            // Our logic: notes.push({ midi: note ... })
            // Logic: if isBass (step 0) -> note
            const bassNote = notes1.find((n) => Math.abs(n.midi - 48) < 12);
            expect(bassNote).toBeDefined();
            expect(bassNote.durationSteps).toBe(2);

            // Beat 3 (Step 8) -> Fifth Bass (usually)
            const notes3 = getAccompanimentNotes(mockChord, 8, 0, 8, { isBeatStart: true });
            // Should ideally trigger the fifth logic or at least a bass note
            expect(notes3.length).toBeGreaterThan(0);
        });

        it('should generate strums on beats 2 and 4', () => {
            // Beat 2 (Step 4)
            const notes2 = getAccompanimentNotes(mockChord, 4, 0, 4, { isBeatStart: true });
            // Expect full voicing (3 notes)
            expect(notes2.length).toBeGreaterThanOrEqual(2);
            expect(notes2[0].durationSteps).toBe(2);
        });

        it('should use Country scale for soloist', () => {
            const scale = getScaleForChord(mockChord, null, 'country');
            // Country scale logic: Major Pentatonic [0, 2, 4, 7, 9]
            expect(scale).toContain(2);
            expect(scale).toContain(4); // Major 3rd
            expect(scale).toContain(9); // 6th
            expect(scale).not.toContain(3); // Pure pentatonic (no blue note at default tension)
        });
    });

    describe('Metal Logic', () => {
        const mockChord = {
            rootMidi: 48, // C3
            quality: 'minor',
            freqs: [130.81, 155.56, 196.0], // C, Eb, G
            intervals: [0, 3, 7],
            beats: 4,
        };

        beforeEach(() => {
            groove.genreFeel = 'Metal';
            chords.style = 'power-metal';
        });

        it('should generate power chords (root+5) on 8th notes', () => {
            // Step 0 (Downbeat)
            const notes = getAccompanimentNotes(mockChord, 0, 0, 0, { isBeatStart: true });
            // Power chord: Root, 5th, Octave
            expect(notes.length).toBeGreaterThanOrEqual(2);
            const intervals = notes.map((n) => n.midi - 48);
            expect(intervals).toContain(7); // 5th
            // Should use 'Warm' instrument for distortion potential
            expect(notes[0].instrument).toBe('Warm');
        });

        it('should use Metal scale for soloist', () => {
            const scale = getScaleForChord(mockChord, null, 'metal');
            // Metal (Minor): [0, 2, 3, 5, 7, 8, 10]
            expect(scale).toContain(3); // Minor 3rd
            expect(scale).toContain(8); // Minor 6th
        });

        it('should produce galloping bass logic', () => {
            const bassNote = getBassNote(mockChord, null, 0, 48, 36, 'metal', 0, 0, 0);
            expect(bassNote).not.toBeNull();
            // Should be 8th note duration (step % (stepsPerBeat/2) === 0)
            // 4/4 stepsPerBeat is 4. Subdiv is 2. 0 % 2 === 0.
        });
    });
});
