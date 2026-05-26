// @ts-nocheck
/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

// Mock the state module
vi.mock('../../public/state.js', () => {
    const mockState = {
        playback: {
            bandIntensity: 0.6,
            complexity: 0.5,
            bpm: 120,
            intent: { syncopation: 0, anticipation: 0, layBack: 0 },
            audio: { currentTime: 0 },
        },
        arranger: {
            timeSignature: '4/4',
            progression: [],
            key: 'C',
            isMinor: false,
        },
        chords: { enabled: true, style: 'smart', density: 'standard', octave: 60 },
        bass: { enabled: true, lastFreq: 65.41 }, // C2
        soloist: makeSoloistMock({ enabled: true, busySteps: 0, lastFreq: 440 }),
        groove: { genreFeel: 'Jazz' },
        harmony: { enabled: false, rhythmicMask: 0, buffer: new Map() },
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

// Mock config
vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' },
    },
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
}));

vi.mock('../../public/utils.js', () => ({
    normalizeKey: (k) => k || 'C',
    getFrequency: (m) => 440 * 2 ** ((m - 69) / 12),
    getMidi: (f) => (f > 0 ? Math.round(12 * Math.log2(f / 440) + 69) : 0),
    calculateTimingOffset: vi.fn(() => 0),
    applyBluesBends: vi.fn(),
}));

vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));

import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getState } from '../../public/state.js';

const { arranger, playback, chords, bass, groove } = getState();

/**
 * Drive a fixed-cell comper across `barCount` bars and count hits per step.
 * Returns { totalHits, hitsByMeasureStep, attacksPerBar }.
 *
 * The cell is forced to a 7-hit Charleston-family pattern (every step except 0
 * is alternated 1/0) so we have a stable hit count to compare against the
 * phrase-end-thinned condition. Tests must reset `compingState` between calls.
 */
function runComping(barCount, coordinationFactory, seed) {
    // why: stub Math.random so the various inline RNG gates (Multi-way
    // Coordination yield-to-bass/soloist, Conversational Displacement, etc.)
    // produce stable outcomes across both phrase-end and phrase-middle runs.
    // Without this the comparison is dominated by RNG noise from biases that
    // are NOT what we're measuring.
    const origRandom = Math.random;
    let rngSeed = seed;
    Math.random = () => {
        // Mulberry32-flavored simple sequence — deterministic per run.
        rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0;
        return rngSeed / 0x100000000;
    };

    const mockChord = {
        rootMidi: 60,
        freqs: [261.63, 329.63, 392.0, 493.88],
        quality: 'maj7',
        intervals: [0, 4, 7, 11],
        is7th: true,
        beats: 4,
        sectionId: 'A',
    };

    // why: SYNTHETIC harness cell — 8 hits on every other 16th. This is not a
    // production jazz/blues/funk comping cell (real cells from the standard
    // bank are sparser and syncopated); it exists purely to give the
    // phrase-end gate something to thin uniformly so the predicate's effect
    // is measurable in isolation. Reported `attacks/bar` numbers are relative
    // to this dense baseline; the *relative* drop generalizes to production
    // cells, but the absolute attack count does not. Real production cell
    // shapes are covered indirectly by the broader critique-test suite
    // (e.g. funk-bass-critique runs at full engine state with the real picker).
    // (Epic 9 S2.a review P1 #3.)
    const denseCell = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
    compingState.currentCell = [...denseCell];
    compingState.lockedUntil = 1_000_000; // lock forever
    compingState.lastSectionId = 'A';
    compingState.lastVoicingMidis = [];

    let totalAttacks = 0;
    const totalSteps = barCount * 16;
    const hitsByMeasureStep = new Array(16).fill(0);

    for (let step = 0; step < totalSteps; step++) {
        const measureStep = step % 16;
        const coord = coordinationFactory(step, measureStep);
        // Make sure cell stays pinned (defensive — updateRhythmicIntent skips
        // when step < lockedUntil).
        compingState.currentCell = [...denseCell];
        const notes = getAccompanimentNotes(
            getState(),
            mockChord,
            step,
            step,
            measureStep,
            {
                isBeatStart: measureStep % 4 === 0,
                isGroupStart: measureStep === 0,
                mStep: measureStep,
                beatIndex: Math.floor(measureStep / 4),
                tsConfig: { beats: 4, stepsPerBeat: 4 },
            },
            coord,
        );
        const isHit = notes.some((n) => n.midi > 0 && !n.muted);
        if (isHit) {
            totalAttacks++;
            hitsByMeasureStep[measureStep]++;
        }
    }

    Math.random = origRandom;
    return {
        totalAttacks,
        hitsByMeasureStep,
        attacksPerBar: totalAttacks / barCount,
    };
}

describe('Comper Phrase-End Critique', () => {
    beforeEach(() => {
        // Reset comping state between tests
        compingState.currentCell = new Array(16).fill(0);
        compingState.lockedUntil = 0;
        compingState.grooveRetentionCount = 0;
        compingState.lastSectionId = null;
        compingState.lastVoicingMidis = [];

        arranger.key = 'C';
        chords.style = 'smart';
        chords.enabled = true;
        bass.enabled = true;
        playback.bandIntensity = 0.6;
        playback.complexity = 0.5;
    });

    // why: Jazz/Blues/Funk all share the same musical claim — "the chord channel
    // breathes when the soloist breathes." Critique each via the same harness
    // and assert the relative drop on non-downbeat hits when phrase-end coord
    // is published. Threshold: ≥25% relative drop in non-downbeat hits between
    // the always-resting "phrase-end" condition and the always-active "phrase-
    // middle" condition. 25% is a deliberate musical floor — large enough to
    // be audible to a listener (the engine multiplies attack-prob by 0.35 on
    // ~65% of eligible offbeat steps via the deterministic hash, so the
    // expected drop is much higher; 25% gives ~10pp headroom against the
    // hash's per-bar variance).
    const genreCases = [
        { genre: 'Jazz', label: 'Jazz' },
        { genre: 'Blues', label: 'Blues' },
        { genre: 'Funk', label: 'Funk' },
    ];

    for (const { genre, label } of genreCases) {
        it(`${label}: phrase-end thins comper non-downbeat hits vs phrase-middle`, () => {
            groove.genreFeel = genre;

            const barCount = 64;
            // Phrase-end: soloist resting after a 5-note phrase, sustained for
            // the whole window. Engine should thin ~65% of non-downbeat hits.
            const phraseEndCoord = () => ({
                soloistResting: true,
                soloistNotesInPhrase: 5,
                bassHit: false,
                soloistActive: false,
                soloistBusy: false,
                accompanimentHit: false,
            });
            // Phrase-middle: soloist still playing, no phrase-end signal —
            // engine emits normal density.
            const phraseMidCoord = () => ({
                soloistResting: false,
                soloistNotesInPhrase: 1,
                bassHit: false,
                soloistActive: false,
                soloistBusy: false,
                accompanimentHit: false,
            });

            const phraseEnd = runComping(barCount, phraseEndCoord, 0xdeadbeef);
            // Reset between runs
            compingState.currentCell = new Array(16).fill(0);
            compingState.lockedUntil = 0;
            compingState.lastSectionId = null;
            compingState.lastVoicingMidis = [];
            const phraseMid = runComping(barCount, phraseMidCoord, 0xdeadbeef);

            // Sum non-downbeat hits (measureStep > 0).
            const sumNonDownbeat = (hits) => hits.reduce((s, h, i) => (i === 0 ? s : s + h), 0);
            const endNonDownbeat = sumNonDownbeat(phraseEnd.hitsByMeasureStep);
            const midNonDownbeat = sumNonDownbeat(phraseMid.hitsByMeasureStep);
            const relativeDrop =
                midNonDownbeat > 0 ? (midNonDownbeat - endNonDownbeat) / midNonDownbeat : 0;

            console.log(
                `\n--- ${label} COMPER PHRASE-END CRITIQUE ---\n` +
                    `[Total attacks/bar]      phrase-end ${phraseEnd.attacksPerBar.toFixed(2)}  |  phrase-mid ${phraseMid.attacksPerBar.toFixed(2)}\n` +
                    `[Non-downbeat hits]      phrase-end ${endNonDownbeat}  |  phrase-mid ${midNonDownbeat}\n` +
                    `[Relative drop]          ${(relativeDrop * 100).toFixed(1)}%  (Target: > 25%)\n` +
                    '-----------------------------------------------\n',
            );

            // Sanity: phrase-mid run should have non-zero non-downbeat hits
            expect(midNonDownbeat).toBeGreaterThan(0);
            // Acceptance: phrase-end thinning produces a meaningful relative drop.
            expect(relativeDrop).toBeGreaterThan(0.25);
        });
    }

    it('Bossa: NOT thinned (own partido-alto idiom is S5.c work, not S2.a)', () => {
        // why: confirm we didn't accidentally include Bossa in the gate. Bossa
        // currently shares Jazz's cell bank as a port-for-fidelity (see
        // accompaniment.ts:148-156); thinning Bossa here would compound with
        // the upcoming S5.c partido-alto bank when it ships. Leave Bossa alone.
        groove.genreFeel = 'Bossa Nova';

        const phraseEndCoord = () => ({
            soloistResting: true,
            soloistNotesInPhrase: 5,
        });
        const phraseMidCoord = () => ({
            soloistResting: false,
            soloistNotesInPhrase: 1,
        });
        const barCount = 32;

        const phraseEnd = runComping(barCount, phraseEndCoord, 0x1234);
        compingState.currentCell = new Array(16).fill(0);
        compingState.lockedUntil = 0;
        const phraseMid = runComping(barCount, phraseMidCoord, 0x1234);

        const sumNonDownbeat = (hits) => hits.reduce((s, h, i) => (i === 0 ? s : s + h), 0);
        const endNonDownbeat = sumNonDownbeat(phraseEnd.hitsByMeasureStep);
        const midNonDownbeat = sumNonDownbeat(phraseMid.hitsByMeasureStep);
        const relativeDrop =
            midNonDownbeat > 0 ? (midNonDownbeat - endNonDownbeat) / midNonDownbeat : 0;

        console.log(
            `[Bossa Comper] phrase-end ${endNonDownbeat} / phrase-mid ${midNonDownbeat} (relative drop ${(relativeDrop * 100).toFixed(1)}%, expected ≤ 10%)`,
        );

        // Bossa should NOT be affected by the phrase-end gate — relative drop
        // should be within RNG noise (≤ 10%).
        expect(Math.abs(relativeDrop)).toBeLessThan(0.1);
    });

    it('Jazz: phrase-end gate respects the 3-note floor (2 notes = no thinning)', () => {
        // why: the 3-note floor is the audit-doc-specified threshold. A
        // 1-note or 2-note "phrase" is more likely a pickup or a stray stab;
        // the comper shouldn't go quiet for it. This regression-guards the
        // floor — if a future refactor accidentally drops the floor to 1, the
        // comper would thin on every rest tick (over-quiet, conversation-
        // breaking).
        groove.genreFeel = 'Jazz';

        const phraseEndShortCoord = () => ({
            soloistResting: true,
            soloistNotesInPhrase: 2, // BELOW the floor
        });
        const phraseMidCoord = () => ({
            soloistResting: false,
            soloistNotesInPhrase: 1,
        });

        const barCount = 32;
        const phraseEndShort = runComping(barCount, phraseEndShortCoord, 0x5678);
        compingState.currentCell = new Array(16).fill(0);
        compingState.lockedUntil = 0;
        const phraseMid = runComping(barCount, phraseMidCoord, 0x5678);

        const sumNonDownbeat = (hits) => hits.reduce((s, h, i) => (i === 0 ? s : s + h), 0);
        const endNonDownbeat = sumNonDownbeat(phraseEndShort.hitsByMeasureStep);
        const midNonDownbeat = sumNonDownbeat(phraseMid.hitsByMeasureStep);
        const relativeDrop =
            midNonDownbeat > 0 ? (midNonDownbeat - endNonDownbeat) / midNonDownbeat : 0;

        // Below the 3-note floor: relative drop should be small (RNG noise only).
        expect(Math.abs(relativeDrop)).toBeLessThan(0.1);
    });
});
