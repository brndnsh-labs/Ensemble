// @ts-nocheck
import { vi } from 'vitest';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

// --- MOCKS ---
const { mockState } = vi.hoisted(() => ({
    mockState: {
        soloist: makeSoloistMock({
            enabled: true,
            busySteps: 0,
            currentPhraseSteps: 0,
            notesInPhrase: 0,
            qaState: 'Question',
            isResting: true, // Start resting
            pitchHistory: [],
            deviceBuffer: [],
            motifBuffer: [],
            sessionSteps: 0,
            phraseContext: {
                role: 'call',
                skeleton: [],
                lastInterval: null,
                profile: 'srv',
            },
        }),
        groove: { genreFeel: 'Jazz' },
        playback: { bandIntensity: 0.5, bpm: 120, complexity: 0.5, intent: { soloistMod: 0 } },
        arranger: { timeSignature: '4/4' },
        chords: {},
        bass: {},
        harmony: { enabled: false, rhythmicMask: 0 },
    },
}));

// Minimal Mocking to make soloist.js run
vi.mock('../../public/state.js', () => ({
    getState: () => mockState,
    stateMap: mockState,
}));
vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: { '4/4': { beats: 4, stepsPerBeat: 4, grouping: [4] } },
    STYLE_CONFIG: {
        /* Loaded from actual file if possible, or we rely on defaults/imports in soloist.js if not mocked. 
       Wait, soloist.js imports STYLE_CONFIG locally. We can't easily mock an internal const unless we export it or mock the module.
       However, soloist.js defines STYLE_CONFIG internally. We don't need to mock it, we want the REAL config.
       The imports in soloist.js are: utils, state, config, theory-scales.
    */
    },
}));
vi.mock('../../public/utils.js', () => ({
    getFrequency: () => 440,
    applyBluesBends: vi.fn(),
    getMidi: () => 60,
    calculateTimingOffset: vi.fn(() => 0),
}));
vi.mock('../../public/engine/theory-scales.js', () => ({
    getScaleForChord: () => [0, 2, 4, 5, 7, 9, 11],
}));

// We need to re-import to apply mocks
// Since this is a script, we can't easily use 'vi.mock' if we run it with node directly.
// But we can run it with 'vitest run' as a test file that logs output.

import { describe, it } from 'vitest';

describe('Soloist Density Analysis', () => {
    function runSimulation(style, intensity, measures = 100) {
        // Reset State
        mockState.soloist = makeSoloistMock({
            enabled: true,
            busySteps: 0,
            currentPhraseSteps: 0,
            notesInPhrase: 0,
            qaState: 'Question',
            isResting: true,
            pitchHistory: [],
            deviceBuffer: [],
            motifBuffer: [],
            sessionSteps: 0,
            phraseContext: {
                role: 'call',
                skeleton: [],
                lastInterval: null,
                profile: 'srv',
            },
        });
        mockState.playback.bandIntensity = intensity;

        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        const totalSteps = measures * 16;

        let attacks = 0;
        let activeSteps = 0;
        const notes = [];

        for (let s = 0; s < totalSteps; s++) {
            const stepInMeasure = s % 16;

            // We need to simulate the state updates that happen inside the loop or external to it?
            // getSoloistNote modifies state internally (busySteps, isResting, etc.)

            const res = getSoloistNote(getState(), chord, chord, s, 440, 60, style, stepInMeasure);

            if (res) {
                attacks++;
                activeSteps++; // Count the attack step itself
                notes.push({ step: s, dur: res.durationSteps || 1 });
            } else if (mockState.soloist.session.phrasing.busySteps > 0) {
                activeSteps++;
            }
        }

        const density = (activeSteps / totalSteps) * 100;
        const notesPerMeasure = attacks / measures;

        return {
            style,
            intensity,
            density: `${density.toFixed(1)}%`,
            notesPerMeasure: notesPerMeasure.toFixed(1),
        };
    }

    it('Generates Density Report', () => {
        const scenarios = [
            { style: 'minimal', intensity: 0.3 },
            { style: 'minimal', intensity: 0.8 },
            { style: 'scalar', intensity: 0.5 },
            { style: 'blues', intensity: 0.6 },
            { style: 'bird', intensity: 0.5 },
            { style: 'bird', intensity: 0.9 },
            { style: 'shred', intensity: 0.8 },
            { style: 'shred', intensity: 0.4 }, // Low intensity shred?
        ];

        console.log('\n--- SOLOIST DENSITY REPORT (100 Measures) ---');
        console.table(scenarios.map((s) => runSimulation(s.style, s.intensity)));
        console.log('---------------------------------------------');
    });
});
