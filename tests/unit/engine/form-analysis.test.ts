import { describe, expect, it } from 'vitest';
import { GENRE_NAMES } from '../../../public/data/smart-genres.js';
import { analyzeForm, getSectionEnergy } from '../../../public/form-analysis.js';
import { predictStructure } from '../../../public/song-generator.js';

describe('Form Analysis Engine', () => {
    describe('getSectionEnergy', () => {
        it('should return correct energy for known labels', () => {
            expect(getSectionEnergy('Verse')).toBe(0.5);
            expect(getSectionEnergy('Chorus')).toBe(0.9);
            expect(getSectionEnergy('Build up')).toBe(0.7);
            expect(getSectionEnergy('Dropping the beat')).toBe(1.0);
        });

        it('winds the outro below the intro (an outro should decay, not match the opener) — #800', () => {
            expect(getSectionEnergy('Outro')).toBeLessThan(getSectionEnergy('Intro'));
        });

        it('should return default energy for unknown labels', () => {
            expect(getSectionEnergy('Unknown')).toBe(0.5);
            expect(getSectionEnergy(null)).toBe(0.5);
        });

        // #1199 — the wizard emits the bare label 'Pre', which matched no key
        // and silently sat at the 0.5 verse default. A pre-chorus IS the build
        // into the chorus, so it belongs above a verse; and the drop mechanic's
        // strict `>0.3` threshold is calibrated on the assumption that
        // Pre→Chorus is +0.3 EXACTLY. At 0.5 it was +0.4 and fired a full-band
        // cut before every back-half chorus.
        it("seats the wizard's bare 'Pre' at the pre-chorus energy, not the verse default (#1199)", () => {
            expect(getSectionEnergy('Pre')).toBe(0.6);
            // Both spellings must agree — 'Pre-Chorus' is listed first in the
            // map precisely so the more specific key wins the substring race.
            expect(getSectionEnergy('Pre')).toBe(getSectionEnergy('Pre-Chorus'));
            // The arithmetic the drop mechanic depends on.
            expect(getSectionEnergy('Chorus') - getSectionEnergy('Pre')).toBeCloseTo(0.3, 5);
        });

        // #1201 — 'hook' is hip-hop's (and much of pop's) own word for the
        // chorus, not a lesser section. Unmapped it read as verse-energy.
        it("seats 'Hook' at chorus energy — it IS the chorus in hip-hop (#1201)", () => {
            expect(getSectionEnergy('Hook')).toBe(0.9);
            expect(getSectionEnergy('Hook')).toBe(getSectionEnergy('Chorus'));
        });

        // The durable guard, and the one that would have caught BOTH bugs
        // above: an unmapped label doesn't throw, it resolves to a plausible
        // 0.5 — so a vocabulary gap is invisible until someone notices the
        // music isn't building. Drive the labels the app ACTUALLY EMITS
        // (`predictStructure` is the wizard's own structure picker) and require
        // every one to be deliberate, rather than trusting the default.
        it('maps every section label the song generator can emit (#1199/#1201)', () => {
            const emitted = new Set<string>();
            for (const form of ['verse-chorus', 'loop'] as const) {
                for (const feel of GENRE_NAMES) {
                    // Sweep target length — the wizard picks the template whose
                    // bar count is closest to BPM × minutes, so short and long
                    // targets reach different templates (the 'Pre' one is the
                    // longest VERSE_CHORUS_FORMS entry and only appears here).
                    for (const minutes of [0.5, 1, 2, 3, 5, 8]) {
                        for (const bpm of [60, 90, 120, 160, 200]) {
                            for (const label of predictStructure(minutes, bpm, '4/4', form, feel)) {
                                emitted.add(label);
                            }
                        }
                    }
                }
            }

            // 0.5 is CORRECT for these, not a fallthrough:
            //   'A1'..'A4' — the AABA head. An A section states the tune; it
            //                carries no build claim, so neutral is the answer.
            //   'Main'     — the one-section loop chart. 0.5 is the exact
            //                pocket-neutral point (getBandPocket scale 1.0) and
            //                every delta in a single-section form is 0 anyway.
            //   'Verse'    — genuinely mapped to 0.5 by design.
            const TRULY_NEUTRAL = /^(a\d*|main|verse)$/;

            // KNOWN GAPS — labels that reach the 0.5 default and SHOULDN'T.
            // Listed explicitly so the guard neither hides them nor blocks this
            // commit, and so the next reader has to confront the claim rather
            // than inherit a blanket allowlist. Each entry needs a filed issue.
            //
            //   'B' — in AABA_FORMS the B section IS the bridge (the
            //         middle-eight of a 32-bar standard), and this very file
            //         already agrees: `analyzeForm` maps `label === 'b'` to the
            //         'Bridge' role, and soloist-seeder lists category 'b' as a
            //         departure. The map seats `bridge: 0.6` but 'B' resolves to
            //         0.5, so Jazz/Bossa/Neo-Soul — the three genres routed to
            //         AABA — get zero lift into the only structural contrast in
            //         the tune. It cannot be fixed with a substring key ('b'
            //         would hijack bridge/build/breakdown); it needs an
            //         exact-match pre-pass, which is its own change. See #1205.
            const KNOWN_GAPS = ['B'];

            const unmapped = [...emitted]
                .filter((l) => !TRULY_NEUTRAL.test(l.toLowerCase()))
                .filter((l) => getSectionEnergy(l) === 0.5);

            // Asserting EQUALITY with the known-gap list, not merely "no new
            // ones": when a gap is fixed the test goes red until its entry is
            // removed, so a stale exemption can't quietly outlive the bug.
            expect(
                unmapped.sort(),
                `generator-emitted labels landing on the 0.5 default changed. Either map the ` +
                    `label in SECTION_ENERGY_MAP, add it to TRULY_NEUTRAL with a musical reason, ` +
                    `or — if you just FIXED one — drop it from KNOWN_GAPS. Got: ${unmapped.join(', ')}`,
            ).toEqual([...KNOWN_GAPS].sort());

            // Sanity: the sweep must actually be reaching the vocabulary,
            // otherwise the assertion above is vacuous.
            expect(emitted.has('Pre')).toBe(true);
            expect(emitted.has('Chorus')).toBe(true);
            expect(emitted.size).toBeGreaterThan(5);
        });
    });

    describe('analyzeForm', () => {
        it('should return null if stepMap is empty', () => {
            expect(analyzeForm({ stepMap: [] } as any)).toBeNull();
        });

        it('should detect functional roles in a simple Verse-Chorus structure', () => {
            const stepMap = [
                // Verse (16 steps)
                ...Array(16)
                    .fill(0)
                    .map((_, _i) => ({
                        chord: {
                            sectionId: 's1',
                            sectionLabel: 'Verse',
                            absName: 'C',
                            rootMidi: 60,
                        },
                    })),
                // Chorus (16 steps)
                ...Array(16)
                    .fill(0)
                    .map((_, _i) => ({
                        chord: {
                            sectionId: 's2',
                            sectionLabel: 'Chorus',
                            absName: 'F',
                            rootMidi: 65,
                        },
                    })),
            ];

            const analysis = analyzeForm({ stepMap } as any);
            expect(analysis!.sections).toHaveLength(2);
            expect(analysis!.sections[0].role).toBe('Main Theme');
            expect(analysis!.sections[1].role).toBe('Peak'); // Chorus is Peak
        });

        it('should detect iterations and refrains', () => {
            const v = { sectionId: 'v', sectionLabel: 'Verse', absName: 'C', rootMidi: 60 };
            const stepMap = [
                ...Array(16).fill({ chord: v }), // V1
                ...Array(16).fill({ chord: { ...v, sectionId: 'v2' } }), // V2 (Repeat)
                ...Array(16).fill({ chord: { ...v, sectionId: 'v3' } }), // V3 (Repeat)
            ];

            const analysis = analyzeForm({ stepMap } as any);
            expect(analysis!.sections[0].iteration).toBe(1);
            expect(analysis!.sections[1].iteration).toBe(2);
            expect(analysis!.sections[2].iteration).toBe(3);
            expect(analysis!.sections[2].role).toBe('Refrain');
        });

        it('should calculate harmonic flux and detect Variation', () => {
            const stepMap = [
                // Section 1: Low flux (Main Theme)
                ...Array(16).fill({
                    chord: { sectionId: 's1', sectionLabel: 'V', absName: 'C', rootMidi: 60 },
                }),
                // Section 2: High flux (Variation)
                ...Array(16)
                    .fill(0)
                    .map((_, i) => ({
                        chord: {
                            sectionId: 'high',
                            sectionLabel: 'Wild',
                            absName: i % 2 === 0 ? 'C' : 'G',
                            rootMidi: i % 2 === 0 ? 60 : 67,
                        },
                    })),
            ];

            const analysis = analyzeForm({ stepMap } as any);
            expect(analysis!.sections[1].flux).toBe(16);
            expect(analysis!.sections[1].role).toBe('Variation');
        });

        it('should detect Bridge role', () => {
            const stepMap = [
                ...Array(16).fill({
                    chord: { sectionId: 'v', sectionLabel: 'Verse', absName: 'C' },
                }),
                ...Array(16).fill({
                    chord: { sectionId: 'b', sectionLabel: 'Bridge', absName: 'Am' },
                }),
            ];

            const analysis = analyzeForm({ stepMap } as any);
            expect(analysis!.sections[1].role).toBe('Bridge');
        });

        it('should detect Intro and Outro', () => {
            const stepMap = [
                ...Array(16).fill({
                    chord: { sectionId: 'in', sectionLabel: 'The Intro', absName: 'C' },
                }),
                ...Array(16).fill({
                    chord: { sectionId: 'out', sectionLabel: 'Final Outro', absName: 'C' },
                }),
            ];

            const analysis = analyzeForm({ stepMap } as any);
            expect(analysis!.sections[0].role).toBe('Intro');
            expect(analysis!.sections[1].role).toBe('Outro');
        });

        it('should handle "Build" role for repeated high-flux sections', () => {
            const chords = ['C', 'G'];
            const stepMap = [
                // V1: High flux first occurrence (Variation)
                ...Array(16)
                    .fill(0)
                    .map((_, i) => ({
                        chord: {
                            sectionId: 'v1',
                            sectionLabel: 'V',
                            absName: chords[i % 2],
                            rootMidi: 60,
                        },
                    })),
                // V2: High flux repeat (Build)
                ...Array(16)
                    .fill(0)
                    .map((_, i) => ({
                        chord: {
                            sectionId: 'v2',
                            sectionLabel: 'V',
                            absName: chords[i % 2],
                            rootMidi: 60,
                        },
                    })),
                // V3: Different section to ensure V2 is not "isLastSection"
                ...Array(16).fill({
                    chord: { sectionId: 'v3', sectionLabel: 'Final', absName: 'Am' },
                }),
            ];

            const analysis = analyzeForm({ stepMap } as any);
            expect(analysis!.sections[1].iteration).toBe(2);
            expect(analysis!.sections[1].role).toBe('Build');
        });
        it('should detect Refrain for high iteration counts', () => {
            const stepMap = [
                ...Array(16).fill({ chord: { sectionId: 's1', sectionLabel: 'V', absName: 'C' } }),
                ...Array(16).fill({ chord: { sectionId: 's2', sectionLabel: 'V', absName: 'C' } }),
                ...Array(16).fill({ chord: { sectionId: 's3', sectionLabel: 'V', absName: 'C' } }),
            ];
            const analysis = analyzeForm({ stepMap } as any);
            expect(analysis!.sections[2].iteration).toBe(3);
            expect(analysis!.sections[2].role).toBe('Refrain');
        });
        it('should handle labels named "b" specifically and re-occurrence (Line 131)', () => {
            const stepMap = [
                ...Array(16).fill({
                    chord: { sectionId: 'v', sectionLabel: 'Verse', absName: 'C' },
                }),
                ...Array(16).fill({
                    chord: { sectionId: 'b1', sectionLabel: 'Bridge', absName: 'Am' },
                }),
                ...Array(16).fill({
                    chord: { sectionId: 'b2', sectionLabel: 'Other', absName: 'Am' },
                }), // Match chord sig, but not 'b' label
            ];

            const analysis = analyzeForm({ stepMap } as any);
            expect(analysis!.sections[1].role).toBe('Bridge');
            expect(analysis!.sections[2].role).toBe('Refrain');
        });

        it('should handle re-occurrence of low-flux sections (Line 135)', () => {
            const stepMap = [
                ...Array(16).fill({ chord: { sectionId: 'v1', sectionLabel: 'V', absName: 'C' } }),
                ...Array(16).fill({ chord: { sectionId: 'v2', sectionLabel: 'V', absName: 'F' } }),
                ...Array(16).fill({ chord: { sectionId: 'v3', sectionLabel: 'V', absName: 'C' } }),
            ];
            const analysis = analyzeForm({ stepMap } as any);
            expect(analysis!.sections[2].role).toBe('Refrain');
        });
    });
});
