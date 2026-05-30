// @ts-nocheck
import { describe, expect, it } from 'vitest';
import {
    generateDrumFills,
    generateDrumOrchestration,
    generateSoloistAccents,
} from '../../../public/engine/drum-seeder.js';
import { generateSessionSeed } from '../../../public/engine/soloist-seeder.js';
import { buildHookAuditArrangement } from '../../../scripts/soloist-analysis-utils.js';
import { makeSoloistMock } from '../../utils/mock-soloist.js';

describe('Drum Seeder', () => {
    const mockArranger = {
        timeSignature: '4/4',
        sectionMap: [
            { start: 0, end: 64, label: 'Intro' },
            { start: 64, end: 128, label: 'Verse 1' },
            { start: 128, end: 192, label: 'Chorus 1' },
            { start: 192, end: 256, label: 'Bridge' },
            { start: 256, end: 320, label: 'Chorus 2' },
            { start: 320, end: 384, label: 'Outro' },
        ],
    };

    const mockState = {};

    it('should generate deterministic orchestration maps', () => {
        const seed = 'TEST-SEED';
        const map1 = generateDrumOrchestration(mockState, mockArranger, 'Rock', 0.5, seed);
        const map2 = generateDrumOrchestration(mockState, mockArranger, 'Rock', 0.5, seed);

        expect(map1).toEqual(map2);
        expect(map1.length).toBe(6);
    });

    it('should generate deterministic fill maps', () => {
        const seed = 'FILL-SEED';
        const map1 = generateDrumFills(mockState, mockArranger, 'Rock', 0.8, seed);
        const map2 = generateDrumFills(mockState, mockArranger, 'Rock', 0.8, seed);

        expect(map1).toEqual(map2);
    });

    it('should schedule fills before section boundaries', () => {
        const map = generateDrumFills(mockState, mockArranger, 'Rock', 1.0, 'HEAVY');
        const keys = Object.keys(map).map(Number);

        // Fills should start 1 measure (16 steps) before section ends
        // Section 1 ends at 64, so fill at 48
        // Section 2 ends at 128, so fill at 112
        expect(keys).toContain(48);
        expect(keys).toContain(112);
    });

    it('should respect the Crash Contract on energy rises', () => {
        const map = generateDrumFills(mockState, mockArranger, 'Rock', 0.5, 'TRANSITION');

        // Chorus 1 starts at 128, fill starts at 112
        if (map[112]) {
            // Chorus is higher energy than Verse, should have a crash
            expect(map[112].crash).toBe(true);
        }
    });

    it('should reliably mark major chorus returns with a fill at medium intensity', () => {
        const map = generateDrumFills(mockState, mockArranger, 'Rock', 0.55, 'MEDIUM-RETURN');

        // Verse 1 -> Chorus 1
        expect(map[112]).toBeDefined();
        expect(map[112].crash).toBe(true);
    });

    it('should skip fills into seamless sections', () => {
        const seamlessArranger = {
            ...mockArranger,
            sections: [
                { id: 's1', seamless: false },
                { id: 's2', seamless: true },
                { id: 's3', seamless: false },
                { id: 's4', seamless: false },
                { id: 's5', seamless: false },
                { id: 's6', seamless: false },
            ],
            sectionMap: [
                { id: 's1', start: 0, end: 64, label: 'Intro' },
                { id: 's2', start: 64, end: 128, label: 'Verse 1' },
                { id: 's3', start: 128, end: 192, label: 'Chorus 1' },
                { id: 's4', start: 192, end: 256, label: 'Bridge' },
                { id: 's5', start: 256, end: 320, label: 'Chorus 2' },
                { id: 's6', start: 320, end: 384, label: 'Outro' },
            ],
        };
        const map = generateDrumFills(mockState, seamlessArranger, 'Rock', 1.0, 'SEAMLESS');

        expect(map[48]).toBeUndefined();
    });

    it('should catch soloist accents deterministically', () => {
        const soloistSeed = {
            notes: [
                { step: 10, velocity: 0.9, midi: 60 },
                { step: 20, velocity: 0.95, midi: 62 },
            ],
        };
        const seed = 'ACCENT-SEED';
        const map1 = generateSoloistAccents(
            mockState,
            mockArranger,
            soloistSeed,
            'Rock',
            0.8,
            seed,
        );
        const map2 = generateSoloistAccents(
            mockState,
            mockArranger,
            soloistSeed,
            'Rock',
            0.8,
            seed,
        );

        expect(map1).toEqual(map2);
        expect(Object.keys(map1).length).toBeGreaterThan(0);
    });

    it('should respect cooldown for accent catching', () => {
        const soloistSeed = {
            notes: [
                { step: 10, velocity: 0.95 },
                { step: 11, velocity: 0.95 }, // Too close to step 10 (cooldown is 4 beats = 16 steps in 4/4)
                { step: 12, velocity: 0.95 },
            ],
        };
        const map = generateSoloistAccents(
            mockState,
            mockArranger,
            soloistSeed,
            'Rock',
            1.0,
            'FORCE',
        );
        expect(Object.keys(map).length).toBe(1);
    });

    it('should apply higher complexity to Chorus sections', () => {
        const map = generateDrumOrchestration(mockState, mockArranger, 'Rock', 0.5, 'RANDOM');
        const intro = map.find((m) => m.start === 0);
        const chorus = map.find((m) => m.start === 128);

        expect(chorus.energyLevel).toBeGreaterThan(intro.energyLevel);
    });

    it('should select appropriate voices for sections', () => {
        const hookArranger = {
            timeSignature: '4/4',
            totalSteps: 256,
            stepMap: [
                { start: 0, end: 64, chord: { sectionId: 'a1', sectionLabel: 'A' } },
                { start: 64, end: 128, chord: { sectionId: 'b1', sectionLabel: 'B' } },
                { start: 128, end: 192, chord: { sectionId: 'a2', sectionLabel: 'A' } },
                { start: 192, end: 256, chord: { sectionId: 'b2', sectionLabel: 'B' } },
            ],
            sectionMap: [
                { id: 'a1', start: 0, end: 64, label: 'A' },
                { id: 'b1', start: 64, end: 128, label: 'B' },
                { id: 'a2', start: 128, end: 192, label: 'A' },
                { id: 'b2', start: 192, end: 256, label: 'B' },
            ],
        };
        const map = generateDrumOrchestration(mockState, hookArranger, 'Rock', 0.2, 'SOFT');
        const intro = map.find((m) => m.start === 0);

        // Without an explicit intro/breakdown label in the source material,
        // rock should keep a real backbeat even on the first macro-form pass.
        expect(intro.snareVoice).toBe('Snare');
    });

    it('should reserve rock sidestick for explicit low-intensity intro material', () => {
        const quietIntroArranger = {
            timeSignature: '4/4',
            totalSteps: 64,
            stepMap: [{ start: 0, end: 64, chord: { sectionId: 'intro', sectionLabel: 'Intro' } }],
            sectionMap: [{ id: 'intro', start: 0, end: 64, label: 'Intro' }],
        };
        const map = generateDrumOrchestration(mockState, quietIntroArranger, 'Rock', 0.2, 'QUIET');

        expect(map[0].snareVoice).toBe('Sidestick');
    });

    it('should keep disco on full snare at medium verse energy', () => {
        const hookArranger = {
            timeSignature: '4/4',
            totalSteps: 256,
            stepMap: [
                { start: 0, end: 64, chord: { sectionId: 'a1', sectionLabel: 'A' } },
                { start: 64, end: 128, chord: { sectionId: 'b1', sectionLabel: 'B' } },
                { start: 128, end: 192, chord: { sectionId: 'a2', sectionLabel: 'A' } },
                { start: 192, end: 256, chord: { sectionId: 'b2', sectionLabel: 'B' } },
            ],
            sectionMap: [
                { id: 'a1', start: 0, end: 64, label: 'A' },
                { id: 'b1', start: 64, end: 128, label: 'B' },
                { id: 'a2', start: 128, end: 192, label: 'A' },
                { id: 'b2', start: 192, end: 256, label: 'B' },
            ],
        };
        const map = generateDrumOrchestration(mockState, hookArranger, 'Disco', 0.55, 'DISCO');

        expect(map[0].snareVoice).toBe('Snare');
    });

    it('should handle missing sections gracefully', () => {
        const emptyArranger = { timeSignature: '4/4', sectionMap: [] };
        const map = generateDrumOrchestration(mockState, emptyArranger, 'Rock', 0.5);
        expect(map).toEqual([]);
    });
});

describe('Drum Seeder — fill restraint + defer-to-soloist (drum audit 2026-05-29)', () => {
    // Four same-label 'Verse' sections give pure base-rate (minor) seams: no
    // chorus/drop arrival, no role change, flat energy, and not the loop return.
    const minorArranger = {
        timeSignature: '4/4',
        sectionMap: [
            { start: 0, end: 64, label: 'Verse' },
            { start: 64, end: 128, label: 'Verse' },
            { start: 128, end: 192, label: 'Verse' },
            { start: 192, end: 256, label: 'Verse' },
        ],
    };
    // Same, but section 2 → a Chorus arrival (structural boundary).
    const chorusArranger = {
        timeSignature: '4/4',
        sectionMap: [
            { start: 0, end: 64, label: 'Verse' },
            { start: 64, end: 128, label: 'Verse' },
            { start: 128, end: 192, label: 'Chorus' },
            { start: 192, end: 256, label: 'Verse' },
        ],
    };
    // Fill bar for the section ending at 128 is its last measure: [112, 128).
    const BOUNDARY_STEP = 112;

    const fillRateAt = (step, arranger, intensity, soloistSeed, runs = 300) => {
        let hits = 0;
        for (let i = 0; i < runs; i++) {
            const map = generateDrumFills(
                {},
                arranger,
                'Rock',
                intensity,
                `SEED-${i}`,
                soloistSeed,
            );
            if (map[step]) {
                hits++;
            }
        }
        return hits / runs;
    };

    it('restrains fills on ordinary (minor) seams (~30% at mid intensity)', () => {
        // base 0.15 + 0.25*0.6 = 0.30, well below the old 0.35 + 0.35*0.6 = 0.56.
        const rate = fillRateAt(BOUNDARY_STEP, minorArranger, 0.6);
        expect(rate).toBeGreaterThan(0.18);
        expect(rate).toBeLessThan(0.42);
    });

    it('still fills hard into a structural chorus arrival', () => {
        const rate = fillRateAt(BOUNDARY_STEP, chorusArranger, 0.6);
        expect(rate).toBeGreaterThan(0.95);
    });

    // The Head melody averages ~4 onsets/bar (measured against generateSessionSeed),
    // so "busy" must mean a genuine run: SOLOIST_BUSY_ONSETS is 6. These synthetic
    // fixtures bracket that threshold.
    const busySolo = {
        loopLengthSteps: 256,
        // 6 onsets inside [112, 128) — a sub-8th run through the turnaround bar.
        notes: [112, 114, 116, 118, 120, 122].map((step) => ({ step, velocity: 0.85 })),
    };
    const normalSolo = {
        loopLengthSteps: 256,
        // 4 onsets — a typical melodic bar, below the busy threshold.
        notes: [113, 117, 121, 125].map((step) => ({ step, velocity: 0.85 })),
    };

    it('lays out on a minor seam when the soloist is genuinely busy (a run) through it', () => {
        expect(fillRateAt(BOUNDARY_STEP, minorArranger, 0.6, busySolo)).toBe(0);
    });

    it('still fills under a normal-density solo (a median bar is not "busy")', () => {
        const rate = fillRateAt(BOUNDARY_STEP, minorArranger, 0.6, normalSolo);
        expect(rate).toBeGreaterThan(0.18);
        expect(rate).toBeLessThan(0.42);
    });

    it('still marks a structural arrival even when the soloist is busy', () => {
        // The chorus arrival trumps the defer — the band's moment still lands.
        expect(fillRateAt(BOUNDARY_STEP, chorusArranger, 0.6, busySolo)).toBeGreaterThan(0.95);
    });

    it('keeps the busy-defer threshold above the soloist Head density (calibration guard)', () => {
        // generateDrumFills defers a minor-seam fill only when the soloist plays
        // SOLOIST_BUSY_ONSETS (6) onsets in the fill bar. That constant MUST stay above
        // the soloist's median bar density or the defer over-fires and collapses fills
        // (the reviewed bug: a threshold of 3 fired on 82–97% of bars). Drive the REAL
        // Blues seed (the busiest genre) and assert the density it produces still leaves
        // 6 firmly in the "genuinely busy minority" zone — a permanent guard against the
        // soloist drifting busier (or the threshold drifting down) under our feet.
        const BUSY_THRESHOLD = 6;
        const arrangement = buildHookAuditArrangement('4/4');
        const stepsPerBar = Math.round(arrangement.totalSteps / arrangement.measuresPerLoop);
        const totalBars = Math.round(arrangement.totalSteps / stepsPerBar);

        const counts: number[] = [];
        for (let i = 0; i < 16; i++) {
            const state = {
                soloist: makeSoloistMock({
                    enabled: true,
                    busySteps: 0,
                    phraseContext: { role: 'call', profile: 'srv' },
                }),
                arranger: {
                    timeSignature: arrangement.timeSignature,
                    sectionMap: arrangement.sectionMap,
                    totalSteps: arrangement.totalSteps,
                    stepMap: arrangement.stepMap,
                },
                playback: { bandIntensity: 0.6, currentLoopCount: 0 },
                groove: { genreFeel: 'Blues', instruments: [] },
            };
            const seed = generateSessionSeed(state, state.arranger, 'smart', 0.6, `CAL-${i}`);
            const perBar = new Array(totalBars).fill(0);
            for (const note of seed.notes) {
                if (note.step >= 0 && note.step < arrangement.totalSteps) {
                    perBar[Math.floor(note.step / stepsPerBar)]++;
                }
            }
            counts.push(...perBar);
        }

        const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
        const busyFraction = counts.filter((c) => c >= BUSY_THRESHOLD).length / counts.length;

        // The blues Head melody sits ~4 onsets/bar — comfortably below the threshold.
        expect(mean).toBeGreaterThan(2.5);
        expect(mean).toBeLessThan(BUSY_THRESHOLD);
        // The defer must fire on only the genuinely-busy minority of bars, not the median.
        expect(busyFraction).toBeLessThan(0.45);
    });
});
