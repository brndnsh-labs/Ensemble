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
        const map = generateDrumOrchestration(mockState, mockArranger, 'Rock', 0.2, 'SOFT');
        const intro = map.find((m) => m.start === 0);

        // Low energy intro should probably have sidestick or no snare
        expect(['Sidestick', 'None']).toContain(intro.snareVoice);
    });

    it('should handle missing sections gracefully', () => {
        const emptyArranger = { timeSignature: '4/4', sectionMap: [] };
        const map = generateDrumOrchestration(mockState, emptyArranger, 'Rock', 0.5);
        expect(map).toEqual([]);
    });
});
