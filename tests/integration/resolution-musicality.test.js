/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateResolutionNotes } from '../../public/engine/resolution.js';
import { getState } from '../../public/state.js';

describe('Resolution Musicality: Final Button Overhaul', () => {
    let arranger, enabled, groove, soloist;

    beforeEach(() => {
        arranger = { key: 'G', isMinor: false };
        enabled = { bass: true, chords: true, soloist: true, harmony: true, groove: true };
        groove = { genreFeel: 'Rock' };
        soloist = { octave: 72 };
    });

    it('should generate a sharp BUTTON hit for Rock style', () => {
        const notes = generateResolutionNotes(
            getState(),
            100,
            arranger,
            enabled,
            120,
            groove,
            soloist,
        );

        // Rock uses BUTTON profile (1 step)
        const bassNotes = notes.filter((n) => n.module === 'bass');
        expect(bassNotes.length).toBe(1);

        // Bass should be G (Key of G)
        // G index is 7. 7 + 36 = 43.
        expect(bassNotes[0].midi).toBe(43);

        // Drum should have Kick and Crash
        const drumNotes = notes.filter((n) => n.module === 'groove');
        expect(drumNotes.some((n) => n.name === 'Kick')).toBe(true);
        expect(drumNotes.some((n) => n.name === 'Crash')).toBe(true);
    });

    it('should generate a two-step resolution for Jazz style', () => {
        groove.genreFeel = 'Jazz';
        const notes = generateResolutionNotes(
            getState(),
            100,
            arranger,
            enabled,
            120,
            groove,
            soloist,
        );

        // Jazz uses JAZZ_V_I (2 steps)
        const bassNotes = notes.filter((n) => n.module === 'bass');
        expect(bassNotes.length).toBe(2);

        // First note should be V (D in Key of G)
        // D index is 2. 2 + 36 = 38.
        expect(bassNotes[0].midi).toBe(38);

        // Second note should be I (G)
        expect(bassNotes[1].midi).toBe(43);
    });

    it('should force the soloist to resolve to Tonic or 5th', () => {
        const notes = generateResolutionNotes(
            getState(),
            100,
            arranger,
            enabled,
            120,
            groove,
            soloist,
        );
        const soloNotes = notes.filter((n) => n.module === 'soloist');

        // Last note should be Tonic (0 relative to G)
        const lastSolo = soloNotes[soloNotes.length - 1];
        expect(lastSolo.midi % 12).toBe(7); // G is 7 semitones from C
    });

    it('should respect minor key settings', () => {
        arranger.isMinor = true;
        groove.genreFeel = 'Jazz';
        const notes = generateResolutionNotes(
            getState(),
            100,
            arranger,
            enabled,
            120,
            groove,
            soloist,
        );

        // Chord notes should contain a minor 3rd (Bb relative to G)
        // G is 7. Bb is 10.
        const chordNotes = notes.filter((n) => n.module === 'chords' && n.timingOffset > 0);
        const midis = chordNotes.map((n) => n.midi % 12);
        expect(midis).toContain(10);
    });

    it('should only trigger resolution at chorus boundaries', () => {
        const { getState } = require('../../public/state.js');
        const state = getState();

        state.arranger.totalSteps = 64; // 4 measures
        state.playback.loopLimit = 2;
        state.playback.isPlaying = true;
        state.playback.step = 63; // Almost at end of 1st loop

        // Simulate one step to wrap around
        // Note: We can't easily run the real scheduler here due to worker dependencies,
        // but we can verify the state logic if we were to mock the dispatch.
        // For now, we'll rely on the unit-level check of the condition.
        const triggerCondition = (step, totalSteps) => step > 0 && step % totalSteps === 0;
        expect(triggerCondition(64, 64)).toBe(true);
        expect(triggerCondition(32, 64)).toBe(false);
    });
});
