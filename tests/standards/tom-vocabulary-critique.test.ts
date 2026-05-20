// @ts-nocheck
/**
 * Tom Vocabulary Critique — drums-idiom/S4
 *
 * Verifies the fix for drums.md P1 #5: prior to this work, the FILL_TEMPLATES
 * registry only contained tom-bearing templates for Rock and Bossa Nova. Funk,
 * Country, Blues, Neo-Soul, Hip-Hop, Disco, and Acoustic had no idiomatic
 * tom vocabulary in fills — every transition collapsed to snare rolls.
 *
 * Acceptance contract:
 *
 *  1. Each of the 7 affected genres now has at least one tom-bearing template
 *     in `medium` or `high` levels (the levels that actually fire at typical
 *     intensities).
 *  2. Running `generateDeterministicFill` across enough seeds produces tom
 *     hits a meaningful fraction of the time for each genre (not 0 — proves
 *     the toms are reachable, not just defined).
 *  3. Rock and Bossa Nova templates are NOT regressed — their existing tom
 *     templates still appear at medium+ levels.
 *
 * Reliability: run with
 *   for i in 1 2 3 4 5; do npx vitest run tests/standards/tom-vocabulary-critique.test.ts 2>&1 | grep -E "FAIL|Tests"; done
 */
import { describe, expect, it } from 'vitest';
import { FILL_TEMPLATES, generateDeterministicFill } from '../../public/engine/fills.js';

const TOM_NAMES = ['High Tom', 'Mid Tom', 'Low Tom'];

/** Does this template's instruments list include any tom voice? */
function hasTom(template: { instruments: string[] }): boolean {
    return template.instruments.some((n) => TOM_NAMES.includes(n));
}

/** Count how many of a level's templates contain at least one tom hit. */
function countTomTemplates(templates: { instruments: string[] }[] | undefined): number {
    if (!templates) {
        return 0;
    }
    return templates.filter(hasTom).length;
}

/**
 * Tiny seeded LCG so the test PRNG is reproducible across runs but cycles
 * through every template across a sweep — Math.random would let us miss a
 * regression where the tom template is defined but unreachable by `prng()`.
 * The fill engine itself picks templates via `Math.floor(prng() * length)`.
 */
function makePrng(seed: number): () => number {
    let s = seed | 0;
    return () => {
        s = (s * 1664525 + 1013904223) | 0;
        // why: standard LCG → [0,1) float by dividing the unsigned 32-bit
        // state by 2^32. Uniform across the template index space when we
        // sweep 100+ seeds, which is what the reachability assertions need.
        return (s >>> 0) / 0x100000000;
    };
}

/**
 * Sweep N seeds at a given intensity and count how many fills contain a tom.
 * Returns { tomFills, totalFills } so the test can assert a ratio.
 */
function sweepFills(
    genre: string,
    intensity: number,
    seeds: number,
): { tomFills: number; totalFills: number; tomHitCount: number } {
    let tomFills = 0;
    let totalFills = 0;
    let tomHitCount = 0;

    for (let i = 0; i < seeds; i++) {
        // why: vary the seed so we sweep every template in the level. The
        // fill engine picks one template per call via `prng() * length`,
        // and we need to hit each index at least once to prove every
        // tom-bearing template is reachable.
        const prng = makePrng(i * 2654435761 + 7);
        const fill = generateDeterministicFill(genre, intensity, 16, prng);
        const allNotes: { name: string; vel: number }[] = [];
        Object.values(fill).forEach((notes) => {
            (notes as { name: string; vel: number }[]).forEach((n) => allNotes.push(n));
        });
        if (allNotes.length > 0) {
            totalFills++;
            const tomsInFill = allNotes.filter((n) => TOM_NAMES.includes(n.name));
            if (tomsInFill.length > 0) {
                tomFills++;
                tomHitCount += tomsInFill.length;
            }
        }
    }
    return { tomFills, totalFills, tomHitCount };
}

describe('Tom Vocabulary Critique (drums-idiom/S4)', () => {
    // -------------------------------------------------------------------
    // 1. Template registry: every affected genre defines tom templates
    // -------------------------------------------------------------------
    describe('FILL_TEMPLATES registry contract', () => {
        const expectedTomGenres = [
            'Funk',
            'Country',
            'Blues',
            'Neo-Soul',
            'Hip Hop',
            'Disco',
            'Acoustic',
            // why: epic-deferred-followups S8(a) — Reggae + Ska-Punk were
            // trimmed from the Epic 7 S4 tom-template sweep; both have real
            // tom vocabulary (One Drop tom-down out of the beat-1 gap;
            // Travis Barker / Tim Armstrong tom-laden punk fills).
            'Reggae',
            'Ska-Punk',
        ];

        expectedTomGenres.forEach((genre) => {
            it(`${genre} has at least one tom-bearing template in medium or high level`, () => {
                const levels = FILL_TEMPLATES[genre];
                expect(levels, `${genre} entry missing from FILL_TEMPLATES`).toBeDefined();

                const mediumToms = countTomTemplates(levels.medium);
                const highToms = countTomTemplates(levels.high);

                // why: low-intensity fills are intentionally sparse (a single
                // snare pickup, a kick hit) — toms reading "fill weight" don't
                // belong there. Tom vocabulary must live at medium/high where
                // the listener expects a real fill gesture.
                expect(
                    mediumToms + highToms,
                    `${genre} has no tom templates in medium (${mediumToms}) or high (${highToms}) — every transition will collapse to snare-only`,
                ).toBeGreaterThan(0);
            });
        });

        // ----- Guard: don't regress Rock + Bossa Nova -----
        it('Rock medium + high still contain tom templates (no regression)', () => {
            const rock = FILL_TEMPLATES.Rock;
            expect(countTomTemplates(rock.medium)).toBeGreaterThan(0);
            expect(countTomTemplates(rock.high)).toBeGreaterThan(0);
        });

        it('Bossa Nova medium + high still contain tom templates (no regression)', () => {
            const bossa = FILL_TEMPLATES['Bossa Nova'];
            expect(countTomTemplates(bossa.medium)).toBeGreaterThan(0);
            expect(countTomTemplates(bossa.high)).toBeGreaterThan(0);
        });
    });

    // -------------------------------------------------------------------
    // 2. Reachability: tom templates actually fire across seed sweeps
    // -------------------------------------------------------------------
    describe('Tom hits across seed sweep (medium intensity = 0.6)', () => {
        const expectedTomGenres = [
            'Funk',
            'Country',
            'Blues',
            'Neo-Soul',
            'Hip Hop',
            'Disco',
            'Acoustic',
            // why: epic-deferred-followups S8(a) — Reggae + Ska-Punk were
            // trimmed from the Epic 7 S4 tom-template sweep; both have real
            // tom vocabulary (One Drop tom-down out of the beat-1 gap;
            // Travis Barker / Tim Armstrong tom-laden punk fills).
            'Reggae',
            'Ska-Punk',
        ];
        const SEEDS = 120;

        expectedTomGenres.forEach((genre) => {
            it(`${genre}: tom-bearing fills appear across a 120-seed sweep at intensity 0.6`, () => {
                const { tomFills, totalFills, tomHitCount } = sweepFills(genre, 0.6, SEEDS);

                // why: at intensity 0.6 the fill engine uses the `medium`
                // level (gate is `> 0.4` → medium, `> 0.75` → high). Each
                // genre has at least one tom-bearing template among its
                // medium options; with a swept PRNG the share should be
                // roughly `tomTemplates / totalTemplates`. Threshold > 30
                // (25%) is the minimum reachability bar: even Blues (3
                // medium templates, 1 tom-bearing → ~33% expected) clears
                // it, but a regression that silently swaps one tom
                // template back to snare-only would drop a 2-template
                // genre under the line.
                const ratio = totalFills > 0 ? tomFills / totalFills : 0;
                // eslint-disable-next-line no-console
                console.log(
                    `[${genre}] medium=0.6: ${tomFills}/${totalFills} fills carry toms ` +
                        `(${(ratio * 100).toFixed(1)}%, ${tomHitCount} tom hits total)`,
                );
                expect(totalFills, `${genre}: no fills generated at intensity 0.6`).toBeGreaterThan(
                    100,
                );
                expect(
                    tomFills,
                    `${genre}: too few fills carry toms at intensity 0.6 — template unreachable or silently snare-only`,
                ).toBeGreaterThan(30);
            });
        });
    });

    describe('Tom hits across seed sweep (high intensity = 0.85)', () => {
        const expectedTomGenres = [
            'Funk',
            'Country',
            'Blues',
            'Neo-Soul',
            'Hip Hop',
            'Disco',
            'Acoustic',
            // why: epic-deferred-followups S8(a) — Reggae + Ska-Punk were
            // trimmed from the Epic 7 S4 tom-template sweep; both have real
            // tom vocabulary (One Drop tom-down out of the beat-1 gap;
            // Travis Barker / Tim Armstrong tom-laden punk fills).
            'Reggae',
            'Ska-Punk',
        ];
        const SEEDS = 120;

        expectedTomGenres.forEach((genre) => {
            it(`${genre}: tom-bearing fills appear across a 120-seed sweep at intensity 0.85`, () => {
                const { tomFills, totalFills, tomHitCount } = sweepFills(genre, 0.85, SEEDS);

                // why: at intensity 0.85 the fill engine uses the `high`
                // level. Most genres added a tom template at high; Country
                // and Hip Hop only have one each, so the prng-driven
                // selection should still land on it a sizable fraction of
                // the time. Threshold > 30 (25%) is the same reachability
                // floor as medium — proves the template is reachable and
                // not silently regressed back to snare-only.
                const ratio = totalFills > 0 ? tomFills / totalFills : 0;
                // eslint-disable-next-line no-console
                console.log(
                    `[${genre}] high=0.85: ${tomFills}/${totalFills} fills carry toms ` +
                        `(${(ratio * 100).toFixed(1)}%, ${tomHitCount} tom hits total)`,
                );
                expect(
                    totalFills,
                    `${genre}: no fills generated at intensity 0.85`,
                ).toBeGreaterThan(100);
                expect(
                    tomFills,
                    `${genre}: too few fills carry toms at intensity 0.85 — template unreachable or silently snare-only`,
                ).toBeGreaterThan(30);
            });
        });
    });

    // -------------------------------------------------------------------
    // 3. Diversity: tom vocabulary spans more than one tom voice per
    //    genre (so it doesn't all collapse to e.g. LowTom-only).
    // -------------------------------------------------------------------
    describe('Tom voice diversity per genre', () => {
        const expectedTomGenres = [
            'Funk',
            'Country',
            'Blues',
            'Disco',
            'Acoustic',
            'Neo-Soul',
            'Hip Hop',
            // why: S8(a) — Reggae + Ska-Punk tom-template additions.
            'Reggae',
            'Ska-Punk',
        ];

        expectedTomGenres.forEach((genre) => {
            it(`${genre} uses more than one tom voice across its tom-bearing templates`, () => {
                const levels = FILL_TEMPLATES[genre];
                const used = new Set<string>();
                for (const level of [levels.low, levels.medium, levels.high]) {
                    level?.forEach((t) => {
                        t.instruments.forEach((n) => {
                            if (TOM_NAMES.includes(n)) {
                                used.add(n);
                            }
                        });
                    });
                }
                // why: a tom vocabulary that's only LowTom (or only HighTom)
                // doesn't read as a real fill — the descending/ascending
                // motion across shells is the gesture. Even Hip-Hop's sparse
                // 808-style fill mixes Mid Tom into the LowTom emphasis to
                // shape the gesture; if that ever collapses to LowTom-only,
                // this test catches it as a regression.
                expect(
                    used.size,
                    `${genre} only uses {${[...used].join(',')}} — needs at least 2 tom voices for a real descent`,
                ).toBeGreaterThanOrEqual(2);
            });
        });
    });
});
