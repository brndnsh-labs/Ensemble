import { describe, expect, it, vi } from 'vitest';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';

const { mockArranger, stepMap, TOTAL_SECTIONS, STEPS_PER_SECTION } = vi.hoisted(() => {
    const stepMap = [];
    const TOTAL_SECTIONS = 1000;
    const STEPS_PER_SECTION = 4;
    for (let i = 0; i < TOTAL_SECTIONS; i++) {
        stepMap.push({
            start: i * STEPS_PER_SECTION,
            end: (i + 1) * STEPS_PER_SECTION,
            chord: {
                sectionId: `section_${i}`,
                rootMidi: 48,
                quality: 'major',
                beats: 1,
                intervals: [0, 4, 7],
            },
        });
    }
    return {
        stepMap,
        TOTAL_SECTIONS,
        STEPS_PER_SECTION,
        mockArranger: {
            key: 'C',
            isMinor: false,
            progression: [],
            totalSteps: TOTAL_SECTIONS * STEPS_PER_SECTION,
            timeSignature: '4/4',
            stepMap: stepMap,
        },
    };
});

// Mock state and global config
vi.mock('../../public/state.js', () => {
    const mockState = {
        bass: {
            enabled: true,
            busySteps: 0,
            lastFreq: 440,
            volume: 0.5,
            pocketOffset: 0,
            buffer: new Map(),
            style: 'smart',
        },
        soloist: {
            enabled: true,
            busySteps: 0,
            tension: 0,
            buffer: new Map(),
        },
        groove: {
            genreFeel: 'Rock',
            measures: 1,
            lastDrumPreset: 'Standard',
            instruments: [{ name: 'Kick', steps: new Array(16).fill(0), muted: false }],
        },
        playback: { bandIntensity: 0.5, bpm: 120, complexity: 0.3, intent: { soloistMod: 0 } },
        chords: { pianoRoots: true },
        harmony: { enabled: false, buffer: new Map() },
        arranger: mockArranger,
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

vi.mock('../../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': {
            beats: 4,
            stepsPerBeat: 4,
            subdivision: '16th',
            pulse: [0, 4, 8, 12],
            grouping: [2, 2],
        },
    },
    REGGAE_RIDDIMS: {},
}));

describe('Bass Logic Performance', () => {
    it('measures isBassActive performance for Bossa style', () => {
        const ITERATIONS = 10_000_000;
        const style = 'bossa';

        const start = performance.now();

        let activeCount = 0;
        for (let i = 0; i < ITERATIONS; i++) {
            // Cycle through steps 0-15 (one measure of 16th notes)
            const step = i % 16;
            // stepInChord is effectively same as step for this micro-benchmark
            if (isBassActive(getState(), style, step, step)) {
                activeCount++;
            }
        }

        const end = performance.now();
        const duration = end - start;

        console.log(
            `isBassActive ('bossa', ${ITERATIONS} iterations) took ${duration.toFixed(2)}ms`,
        );

        // Sanity check: bossa pattern is [0, 6, 8, 14] (4 hits per 16 steps)
        // 10,000,000 iterations / 16 steps = 625,000 measures
        // 625,000 * 4 hits = 2,500,000 hits
        expect(activeCount).toBe(2_500_000);
    });

    // Merged from bass-lookup.bench.test.js
    const ITERATIONS_LOOKUP = 10_000;
    const targetStep = (TOTAL_SECTIONS - 1) * STEPS_PER_SECTION + 1;
    const currentChord = stepMap[stepMap.length - 1].chord;
    const nextChord = stepMap[0].chord;
    const context = {
        sectionStart: stepMap[stepMap.length - 1].start,
        sectionEnd: stepMap[stepMap.length - 1].end,
    };

    it('Optimized: Direct Access (With Context)', () => {
        const start = performance.now();
        for (let i = 0; i < ITERATIONS_LOOKUP; i++) {
            getBassNote(
                getState(),
                currentChord,
                nextChord,
                0,
                440,
                48,
                'rock',
                TOTAL_SECTIONS - 1,
                targetStep,
                1,
                context,
            );
        }
        const duration = performance.now() - start;
        console.log(`Optimized Access (Run 1): ${duration.toFixed(2)}ms`);
    });

    it('Legacy: Linear Lookup (No Context)', () => {
        const start = performance.now();
        for (let i = 0; i < ITERATIONS_LOOKUP; i++) {
            getBassNote(
                getState(),
                currentChord,
                nextChord,
                0,
                440,
                48,
                'rock',
                TOTAL_SECTIONS - 1,
                targetStep,
                1,
            );
        }
        const duration = performance.now() - start;
        console.log(`Legacy Lookup (Run 2): ${duration.toFixed(2)}ms`);
    });
});
