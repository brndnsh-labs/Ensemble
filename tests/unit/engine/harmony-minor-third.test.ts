// @ts-nocheck
/* eslint-disable */
// Guard for #701: harmony must never harmonize a MINOR chord with a MAJOR 3rd.
// The Rock spread-10th voicing encodes the b3 an octave up (interval 15), so the
// old `intervals.includes(3)` third-detection missed it and harmony defaulted to
// a major 3rd over the vi — a C/C# cross-relation against the chord's natural b3.
// Covers BOTH touched lanes: Rock harmonized-3rds and the Acoustic fingerpick arp.
import { describe, expect, it, vi } from 'vitest';
import { validateProgression } from '../../../public/engine/chords-engine.js';
import { chordThirdIsMinor, getHarmonyNotes } from '../../../public/engine/harmonies.js';
import { getState } from '../../../public/state.js';

vi.mock('../../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));
vi.mock('../../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));

// pitch class of the MAJOR 3rd above the chord root
const majorThirdPc = (rootMidi) => ((((rootMidi % 12) + 4) % 12) + 12) % 12;

// A progression with three diatonic minor degrees (vi=Am, iii=Em, ii=Dm) plus a
// major control (IV=F) so the invariant is exercised over several roots.
const MULTI_MINOR = [{ id: 'sec1', label: 'M', value: 'vi | iii | ii | IV' }];

function setupProgression(sections, genre, intensity) {
    const st = getState();
    const { arranger, playback, groove, harmony, soloist, bass, chords } = st;
    arranger.key = 'C';
    arranger.isMinor = false;
    arranger.timeSignature = '4/4';
    arranger.sections = sections;
    groove.enabled = true;
    groove.genreFeel = genre;
    harmony.enabled = true;
    harmony.style = 'smart';
    // Isolate the harmony voicing: no soloist-driven shadow/anchor injection.
    soloist.enabled = false;
    bass.enabled = false;
    chords.enabled = true;
    playback.bandIntensity = intensity;
    playback.conductorVelocity = 0.7 + intensity * 0.45;
    validateProgression(st);
    return st;
}

describe('Harmony minor-third invariant (#701)', () => {
    it('chordThirdIsMinor: folds octave-displaced b3, and a dominant keeps its major 3rd', () => {
        // Rock minor voicing encodes the b3 as interval 15 (the original bug).
        expect(chordThirdIsMinor({ intervals: [0, 7, 15, 19] })).toBe(true);
        // Rock major voicing has the major 3rd as interval 16 — not a minor third.
        expect(chordThirdIsMinor({ intervals: [0, 7, 16, 19] })).toBe(false);
        // Standard minor triad still detected.
        expect(chordThirdIsMinor({ intervals: [0, 3, 7] })).toBe(true);
        // 7#9 carries BOTH a natural 3 (pc4) and a #9 that folds to pc3 — the
        // chord tone is the MAJOR 3rd, so the third must read major, not minor.
        expect(chordThirdIsMinor({ intervals: [0, 4, 7, 10, 15] })).toBe(false);
    });

    // Rock → harmonized-3rds lane; Acoustic → fingerpick arp lane. Both were
    // changed by the fix, so both must be guarded.
    for (const genre of ['Rock', 'Acoustic']) {
        it(`${genre} harmony never emits a major 3rd over any minor chord (ii/iii/vi)`, () => {
            // Sweep across the Rock powerDoubling>0.7 boundary (where the third is
            // present vs dropped); Acoustic rolls a third at every intensity.
            for (const intensity of [0.3, 0.5, 0.7, 0.9]) {
                const st = setupProgression(MULTI_MINOR, genre, intensity);
                const { arranger, harmony } = st;
                for (const entry of arranger.stepMap) {
                    const chord = entry.chord;
                    // Decide minor-ness from the authoritative chord flag, NOT from
                    // chordThirdIsMinor — using the helper here would make the test
                    // circular. chord.isMinor is set in parseProgressionPart
                    // independent of the voicing.
                    if (!chord.isMinor) {
                        continue;
                    }
                    const majPc = majorThirdPc(chord.rootMidi);
                    for (let step = entry.start; step < entry.end; step++) {
                        const notes = getHarmonyNotes(
                            st,
                            chord,
                            null,
                            step,
                            60,
                            harmony.style,
                            step - entry.start,
                        );
                        for (const n of notes) {
                            expect(
                                ((n.midi % 12) + 12) % 12,
                                `${genre} harmony emitted the major 3rd (pc ${majPc}) over ${chord.absName} at intensity ${intensity}, step ${step}`,
                            ).not.toBe(majPc);
                        }
                    }
                }
            }
        });
    }
});
