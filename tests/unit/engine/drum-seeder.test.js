import { describe, expect, it } from 'vitest';
import {
    generateDrumFills,
    generateDrumOrchestration,
    generateSoloistAccents,
} from '../../../public/engine/drum-seeder.js';

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
