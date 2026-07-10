// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHarmonyNotes } from '../../public/engine/harmonies.js';
import { resolveHarmonyProfile } from '../../public/engine/harmony-styles.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

/**
 * Disco harmony critique (#559).
 *
 * Before #559, Disco harmony was misrouted to the `plucks` voice (octave-shifted
 * synth blips) while a dedicated `disco` StyleConfig sat unreachable (not in
 * HARMONY_STYLES, never selected). Disco's signature is the soaring Philly /
 * MFSB / Salsoul **string** section, so harmony now routes to the `strings`
 * voice (no +12 pluck octave-shift) and the dead config is gone. The 16th-note
 * funk grid is retained for the rhythmic disco-string stab feel; the soaring
 * legato line *character* is a by-ear follow-up.
 */
describe('Disco Harmony Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5 },
            groove: {
                genreFeel: 'Disco',
            },
            soloist: makeSoloistMock({ enabled: true, isResting: true, notesInPhrase: 0 }),
            harmony: { enabled: true, complexity: 0.5, lastMidis: [], rhythmicMask: 0 },
            arranger: { timeSignature: '4/4' },
        };
        getState.mockReturnValue(mockState);
    });

    // funk16 onset grid (nonzero steps of the 2-bar pattern).
    const FUNK16_STEPS = new Set([0, 3, 6, 8, 14, 16, 21, 23, 25, 26, 28]);

    it('routes Disco harmony to the strings voice (not plucks/disco)', () => {
        expect(resolveHarmonyProfile('Disco').smartStyle).toBe('strings');
    });

    it('should pass an authenticity critique for a 128-bar Disco harmony performance', () => {
        const chordC = { rootMidi: 60, quality: 'maj7', intervals: [0, 4, 7, 11], sectionId: 'A' };
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let totalStabs = 0;
        let stringsHits = 0;
        let onGridHits = 0;
        const seenStyles = new Set();

        for (let i = 0; i < totalSteps; i++) {
            const stepInMeasure = i % 16;
            const stepInTwoBars = i % 32;
            const notes = getHarmonyNotes(
                getState(),
                chordC,
                null,
                i,
                64,
                'smart',
                stepInMeasure,
                null,
                { soloistResting: true, soloistNotesInPhrase: 0 },
            );

            if (notes.length > 0) {
                totalStabs++;
                for (const n of notes) {
                    seenStyles.add(n.style);
                }
                if (notes.every((n) => n.style === 'strings')) {
                    stringsHits++;
                }
                if (FUNK16_STEPS.has(stepInTwoBars)) {
                    onGridHits++;
                }
            }
        }

        const stringsShare = stringsHits / totalStabs;
        const onGridShare = onGridHits / totalStabs;

        console.log(
            '\n--- DISCO HARMONY CRITIQUE REPORT ---\n' +
                `[Strings Voice Share]  ${(stringsShare * 100).toFixed(1)}% (Target: 100%)\n` +
                `[On-Grid (funk16)]     ${(onGridShare * 100).toFixed(1)}% (Target: 100%)\n` +
                `[Styles seen]          ${[...seenStyles].join(', ')}\n` +
                '-------------------------------------\n',
        );

        // Every harmony attack uses the strings voice — never the old plucks
        // (octave blip) or the removed dead 'disco' config.
        expect(stringsShare).toBe(1.0);
        expect(seenStyles.has('plucks')).toBe(false);
        expect(seenStyles.has('disco')).toBe(false);
        // Rhythmic placement stays on the disco 16th grid.
        expect(onGridShare).toBe(1.0);
    });
});
