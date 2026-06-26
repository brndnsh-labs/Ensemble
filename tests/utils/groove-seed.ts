// @ts-nocheck
/**
 * Deterministic groove-seed helpers for the drum critique harnesses (#791).
 *
 * Before #791 the groove engine, when a section had no seed in
 * `groove.sectionSeedMap`, fell back to a per-BAR `Math.random`-shaped formula
 * (`((barIndex * 137 + 42) % 256) / 256`). The critique harnesses leaned on
 * that per-bar drift to sweep a genre's whole motif vocabulary inside a single
 * run, and several predicted "bar N plays motif X" by replaying the formula.
 *
 * #791 made the engine derive ONE sticky `sectionSeed` per `(sectionId,
 * songSeed)` — matching production (the conductor writes the same value) and
 * killing the mid-section groove swap. A consequence: an empty-arranger mock
 * now plays a single motif for the entire run, so the old per-bar sweep is gone.
 *
 * These helpers restore the sweep deterministically and production-shaped: each
 * section gets its own reproducible seed, and the harness sweeps across
 * sections (instead of relying on per-bar randomness) to sample the vocabulary.
 */
import { getDrumMotif } from '../../public/engine/groove-engine.js';
import { deriveSectionSeed } from '../../public/engine/hash-utils.js';

const DEFAULT_SONG_SEED = 'CRITIQUE';

/**
 * Build an arranger whose bars are grouped into sections (`sec0`, `sec1`, …),
 * `barsPerSection` bars each. Every section gets a distinct, reproducible
 * sectionSeed via `deriveSectionSeed(sectionId, songSeed)`, so sweeping bars
 * sweeps the motif vocabulary — deterministically, the same way a real
 * multi-section song does.
 *
 * `barsPerSection: 2` mirrors the engine's old Latin/Bossa 2-bar grouping for
 * clave-stable genres.
 */
export function sectionSweepArranger(
    numBars,
    {
        songSeed = DEFAULT_SONG_SEED,
        stepsPerBar = 16,
        barsPerSection = 1,
        timeSignature = '4/4',
    } = {},
) {
    const stepMap = [];
    const sectionMap = [];
    let curSection = null;
    for (let bar = 0; bar < numBars; bar++) {
        const sectionId = `sec${Math.floor(bar / barsPerSection)}`;
        const barStart = bar * stepsPerBar;
        if (!curSection || curSection.id !== sectionId) {
            curSection = {
                id: sectionId,
                start: barStart,
                end: barStart + stepsPerBar,
                label: 'Verse',
            };
            sectionMap.push(curSection);
        } else {
            curSection.end = barStart + stepsPerBar;
        }
        for (let s = 0; s < stepsPerBar; s++) {
            const step = barStart + s;
            stepMap.push({
                start: step,
                end: step + 1,
                chord: { sectionId, sectionLabel: 'Verse' },
            });
        }
    }
    return { seed: songSeed, timeSignature, stepMap, sectionMap };
}

/** The sectionSeed the engine will compute for section index `i`. */
function sectionSeedFor(i, songSeed = DEFAULT_SONG_SEED) {
    return deriveSectionSeed(`sec${i}`, songSeed);
}

/**
 * The motif the engine will pick for section index `i` of a
 * `sectionSweepArranger`. The engine selects its motif with the always-on
 * `drumComplexity = 0.8`; `intensity` defaults to 1.0 (motif selection is
 * intensity-independent for most genres). Matches the long-standing
 * `getDrumMotif(seed, genre, 0.8)` prediction convention in the harnesses.
 */
function motifForSection(
    i,
    genre,
    { complexity = 0.8, intensity = 1.0, songSeed = DEFAULT_SONG_SEED } = {},
) {
    return getDrumMotif(sectionSeedFor(i, songSeed), genre, complexity, intensity);
}

/**
 * First section index in [0, max) whose motif equals `targetMotif`, or -1.
 * Use to point a "this is what motif X does" test at a section that actually
 * plays motif X under the deterministic seed.
 */
export function findSectionForMotif(targetMotif, genre, opts = {}) {
    const { complexity = 0.8, intensity = 1.0, songSeed = DEFAULT_SONG_SEED, max = 256 } = opts;
    for (let i = 0; i < max; i++) {
        if (motifForSection(i, genre, { complexity, intensity, songSeed }) === targetMotif) {
            return i;
        }
    }
    return -1;
}
