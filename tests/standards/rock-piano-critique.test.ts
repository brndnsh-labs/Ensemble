// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getIntervals } from '../../public/engine/chords-styles.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// #551 (genre-audit Wave 1, Rock/Piano): at intensity >= 0.8 the Rock voicing
// block in chords-styles.ts added a b7 (interval 10) to ANY chord including plain
// major triads, turning a I/IV into a dom7 and contradicting the file's own
// "power-triad clarity" intent. AC/DC/Stones rhythm parts stay triadic/power at
// full energy; the b7 belongs to dominant/blues charts (spelled explicitly).
//
// getIntervals() is the voicing function the live piano consumes: parseProgressionPart
// (chords-engine.ts) computes each chord's intervals via getIntervals, and the
// per-tick comper (getAccompanimentNotes) voices those. So the bug is gated here at
// the voicing source; the rhythm of the live comp is pinned separately below.
describe('Rock Piano Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.95, complexity: 0.7, step: 0, intent: {} },
            groove: { genreFeel: 'Rock', pocket: 0, instruments: [] },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0, lastFreq: 0 }),
            bass: { enabled: true, lastFreq: 55 },
            harmony: { enabled: false },
            chords: { enabled: true, style: 'rock', density: 'balanced' },
            arranger: { timeSignature: '4/4', totalSteps: 512, progression: [] },
        };
        getState.mockReturnValue(mockState);
    });

    // Rock voices a plain triad as a spread power voicing (root/5th/10th/octave);
    // pc 10 = b7 is the bug's signature.
    function voicePitchClasses(quality, is7th, intensity) {
        mockState.playback.bandIntensity = intensity;
        const intervals = getIntervals(getState(), quality, is7th, 'standard', 'Rock');
        return new Set(intervals.map((i) => ((i % 12) + 12) % 12));
    }

    // (a) THE FIX: plain major AND minor triads stay b7-free across the WHOLE
    // intensity sweep — especially >= 0.8 where the bug fired.
    it('keeps plain major/minor triads b7-free across the intensity sweep', () => {
        const sweep = [0.2, 0.5, 0.7, 0.8, 0.9, 0.95, 1.0];
        const report = [];
        for (const quality of ['major', 'minor']) {
            for (const intensity of sweep) {
                const pcs = voicePitchClasses(quality, false, intensity);
                report.push(
                    `  ${quality.padEnd(5)} i=${intensity.toFixed(2)}  pcs={${[...pcs].sort((a, b) => a - b).join(',')}}`,
                );
                // The voicing is real (a triad has at least root/3rd/5th present),
                // so "no b7" is not vacuously true on an empty voicing.
                expect(pcs.size).toBeGreaterThanOrEqual(3);
                expect(pcs.has(10)).toBe(false); // no b7 on a plain triad
            }
        }
        console.log('\n--- ROCK PIANO: plain-triad pitch classes by intensity ---');
        console.log(report.join('\n'));
        console.log('----------------------------------------------------------\n');
    });

    // (b) HIGH-INTENSITY STRUCTURE PIN. At full energy a Rock major triad is still
    // a driving power+octave voicing — the root, the P5 (7) and the octave (0) are
    // all present. Guards that the fix removed ONLY the spurious b7, not the
    // high-intensity body of the voicing.
    it('keeps the power+octave body of a major triad at full intensity', () => {
        const pcs = voicePitchClasses('major', false, 1.0);
        expect(pcs.has(0)).toBe(true); // root / octave
        expect(pcs.has(4)).toBe(true); // major 3rd
        expect(pcs.has(7)).toBe(true); // perfect 5th
        expect(pcs.has(10)).toBe(false); // still no b7
    });

    // (c) REGRESSION GUARD: the grit b7 is NOT deleted — a chart that IS a
    // dominant 7th still voices its b7 at high intensity. Without this, (a) could
    // be satisfied by never adding a 7th at all (a false fix that strips dominant
    // charts of their function).
    it('still voices the b7 on an explicit dominant-7th chord at high intensity', () => {
        const pcs = voicePitchClasses('7', true, 0.95);
        console.log(`\n[Rock dom7 @0.95] pcs={${[...pcs].sort((a, b) => a - b).join(',')}}\n`);
        expect(pcs.has(10)).toBe(true);
    });

    // (e) #611 — augmaj7 carries its OWN natural 7 (pc 11). The high-intensity
    // grit-b7 add must skip it (as it skips the maj7 family) or the voicing rubs
    // a b7 (10) against the maj7 (11) — a 10+11 semitone clash the chart never
    // asked for. Pins: the natural 7 stays, no b7 is added, and 10+11 never
    // sound together. Sibling-confirms the robust `!intervals.includes(11)` gate.
    it('voices augmaj7 with its natural 7 and no b7 clash at high intensity', () => {
        const pcs = voicePitchClasses('augmaj7', true, 0.95);
        console.log(`\n[Rock augmaj7 @0.95] pcs={${[...pcs].sort((a, b) => a - b).join(',')}}\n`);
        expect(pcs.has(11)).toBe(true); // natural maj7 preserved
        expect(pcs.has(10)).toBe(false); // no grit b7 slammed on top
        expect(pcs.has(10) && pcs.has(11)).toBe(false); // no 10+11 rub
    });

    // (d) DRIVING-COMP RHYTHM PIN. The live Rock comp (getAccompanimentNotes, the
    // per-tick chord part tick-logic plays) is a driving comp, not a sparse pad: it
    // fires on multiple steps per bar at high intensity. Pins a floor so a future
    // rhythm change can't silently gut the part. (Functional pin, not a snapshot.)
    it('pins a driving-comp rhythm (multiple hits per bar) at high intensity', () => {
        const chord = {
            rootMidi: 52,
            quality: 'major',
            intervals: [0, 4, 7],
            freqs: [164.81, 207.65, 246.94],
            sectionId: 'A',
        };
        mockState.playback.bandIntensity = 0.95;
        mockState.arranger.progression = [chord];
        let firingSteps = 0;
        for (let step = 0; step < 16; step++) {
            mockState.playback.step = step;
            const notes = getAccompanimentNotes(getState(), chord, step, step, step, {
                isBeatStart: step % 4 === 0,
                isBackbeat: step % 8 === 4,
            });
            const midis = (notes || [])
                .map((n) => n.midi)
                .filter((m) => typeof m === 'number' && m > 0);
            if (midis.length > 0) {
                firingSteps++;
            }
        }
        console.log(`\n[Rock driving comp] firing steps/bar @0.95 = ${firingSteps}\n`);
        expect(firingSteps).toBeGreaterThan(1);
    });
});
