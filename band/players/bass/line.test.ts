import { DEFAULT_SETTINGS, type PitchedNote } from '../../core/types.js';
import { compileTimeline } from '../../form/timeline.js';
import { performPass } from '../../perform.js';
import { score } from '../../test/scores.js';

/**
 * #2071 (from #2008): a lead-in across a section change aims at the new section's root in the
 * new section's own register, so the section starts in the octave it then keeps. Placed in the
 * old section's register, the lead-in's promise held the new section's first bar an octave off
 * the rest of it.
 */
describe('a lead-in across a section change lands in the new section’s register', () => {
    // F through the chorus: its first bar's root and its second's are the same chord, so they
    // are the same note unless the first was placed somewhere the section does not play.
    const timeline = compileTimeline(
        score([
            { label: 'Verse', bars: 'C | C | C | G' },
            { label: 'Chorus', bars: 'F | F | F | F' },
        ]),
    );
    for (const style of ['reggae', 'rock'] as const) {
        it(style, () => {
            let leadIns = 0;
            const off: string[] = [];
            for (let s = 0; s < 60; s++) {
                const { events } = performPass(
                    timeline,
                    { ...DEFAULT_SETTINGS, style, seed: `s${s}` },
                    { pass: 0, looping: true },
                );
                const bass = events.filter((e): e is PitchedNote => e.lane === 'bass');
                const inBar = (bar: number) =>
                    bass.filter((e) => e.bar === bar).sort((a, b) => a.tick - b.tick);
                const into = inBar(3).at(-1);
                const [arrival] = inBar(4);
                const [settled] = inBar(5);
                // Only the bars a half-step lead-in walked into: those carry its promise.
                if (!into || !arrival || !settled || Math.abs(into.midi - arrival.midi) !== 1) {
                    continue;
                }
                leadIns++;
                if (arrival.midi !== settled.midi) {
                    off.push(`seed s${s}: ${into.midi} → ${arrival.midi}, then ${settled.midi}`);
                }
            }
            // The check judged real lead-ins, not none.
            expect(leadIns).toBeGreaterThan(5);
            expect(off).toEqual([]);
        });
    }
});
