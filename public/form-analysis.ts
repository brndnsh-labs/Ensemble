import { scrambleHash } from './engine/hash-utils.js';
import type { ArrangerState } from './state/arranger.js';
import type { Chord } from './types.js';

const SECTION_ENERGY_MAP: Record<string, number> = {
    intro: 0.4,
    verse: 0.5,
    'pre-chorus': 0.6,
    build: 0.7,
    chorus: 0.9,
    drop: 1.0,
    bridge: 0.6,
    solo: 0.8,
    outro: 0.4,
    breakdown: 0.3,
};

export function getSectionEnergy(label: string | null | undefined): number {
    if (!label) {
        return 0.5;
    }
    const lower = label.toLowerCase();
    for (const [key, val] of Object.entries(SECTION_ENERGY_MAP)) {
        if (lower.includes(key)) {
            return val;
        }
    }
    return 0.5; // Default
}

// scrambleHash (canonical mulberry32) is imported from engine/hash-utils.ts —
// it pre-scrambles so consecutive jam-macro-arc cycles get well-distributed
// offsets (a bare `seed % N` would sawtooth; see feedback-seeded-prng-mulberry32).
// hash-utils.ts is worker-safe and dep-light, so the conductor (main thread) and
// tick-logic (worker / offline export) still consume one shared copy.

/**
 * Per-genre macro-arc cycle length (in form repeats) for the timer-less jam.
 *
 * why: an open-ended jam has no song arc, so the macro-arc is a slow swell
 * rather than a structured build. A genre that naturally stretches out
 * (jazz/bossa — long-form blowing, players take many choruses) wants a longer
 * swell so the energy doesn't churn; a high-energy genre (funk/disco/rock)
 * wants a shorter cycle so the jam keeps re-cresting. Genres absent from the
 * map use `JAM_CYCLE_DEFAULT`.
 */
export const JAM_CYCLE_LENGTHS: Record<string, number> = {
    // why: jazz/bossa long-form blowing — one slow swell over many choruses.
    Jazz: 18,
    'Bossa Nova': 18,
    // why: funk/disco re-crest often — the pocket wants frequent fresh peaks.
    Funk: 9,
    Disco: 9,
    // why: rock/metal sit between — a moderate swell that still rebuilds.
    Rock: 11,
    Metal: 11,
};
// why 13: shares no common factor with the usual 4- and 8-bar section counts,
// so the swell does not phase-lock to the form (a multiple like 12 would
// re-crest on the same form-repeat every cycle).
export const JAM_CYCLE_DEFAULT = 13;

/**
 * Timer-less open-jam macro-arc.
 *
 * Replaces the old rigid `formIteration % 8` ladder, which hard-reset the
 * energy band every 8 form-repeats — every cycle byte-identical, the snap
 * from quiet-outro back to quiet-intro audibly robotic (form-arranger.md
 * P1 #5 / P2 #10-11).
 *
 * Shape: a raised-cosine swell over `cycleLen` form repeats. Phase 0 sits at
 * the trough (quiet), phase 0.5 at the crest (loud), so the band rises and
 * falls smoothly instead of stepping. The floor and ceiling both track the
 * same swell, keeping a roughly constant ~0.3 dynamic window that itself
 * breathes slightly.
 *
 * Per-cycle variation: each grand-cycle is seeded by its cycle index, so
 * successive cycles get a small deterministic offset to crest height, trough
 * depth, and phase — the swell is no longer a fixed-period sawtooth. The
 * variation is reproducible (loop-comparison safe) because it is hashed, not
 * `Math.random()`.
 *
 * Output range stays inside roughly 0.1–1.0, matching the band the old ladder
 * spanned.
 */
export function getJamMacroArc(
    formIteration: number,
    genreFeel: string,
): {
    macroFloor: number;
    macroCeiling: number;
} {
    const cycleLen = JAM_CYCLE_LENGTHS[genreFeel] ?? JAM_CYCLE_DEFAULT;
    const cycleIndex = Math.floor(formIteration / cycleLen);
    // phase in [0, 1) across the current grand-cycle.
    const phaseRaw = (formIteration % cycleLen) / cycleLen;

    // why: per-cycle seeded offsets. Each draw is a fresh hash slot off the
    // cycle index so cycle N+1 never reproduces cycle N. Magnitudes are kept
    // small (±) so the swell stays recognizably the same gesture — a jam that
    // breathes, not one that lurches.
    // - phaseShift ±0.12 of a cycle: shifts where the crest lands so the peak
    //   doesn't always fall on the same form-repeat.
    const phaseShift = (scrambleHash(cycleIndex * 7 + 1) - 0.5) * 0.24;
    // - crestLift ±0.1: some cycles peak hotter, some stay cooler.
    const crestLift = (scrambleHash(cycleIndex * 7 + 2) - 0.5) * 0.2;
    // - windowBreath ±0.06: the floor/ceiling gap widens or narrows a touch.
    const windowBreath = (scrambleHash(cycleIndex * 7 + 3) - 0.5) * 0.12;

    const phase = phaseRaw + phaseShift;
    // Raised cosine: 0 at phase 0/1 (trough), 1 at phase 0.5 (crest).
    const swell = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);

    // why: base band — trough centers near 0.2, crest near 0.85. The swell
    // interpolates the centre between those, then crestLift nudges the whole
    // cycle's hotness and windowBreath flexes the floor/ceiling spread.
    const centre = 0.2 + swell * (0.65 + crestLift);
    const halfWindow = 0.18 + swell * 0.06 + windowBreath;

    const macroFloor = Math.max(0.1, centre - halfWindow);
    const macroCeiling = Math.min(1.0, centre + halfWindow);
    return { macroFloor, macroCeiling };
}

function calculateHarmonicFlux(sectionSteps: Array<{ chord: Chord }>): number {
    if (!sectionSteps.length) {
        return 0;
    }

    // Count distinct chord changes within the step range
    let changes = 0;
    let lastChordId: string | null = null;

    sectionSteps.forEach((entry) => {
        // Simple heuristic: if the chord symbol or root changes, it's a "move"
        const chordId = `${entry.chord.absName}_${entry.chord.rootMidi}`;
        if (chordId !== lastChordId) {
            changes++;
            lastChordId = chordId;
        }
    });

    // Flux = changes per bar (assuming 16 steps per bar)
    const bars = sectionSteps.length / 16;
    return bars > 0 ? changes / bars : 0;
}

export function analyzeForm(arranger: Pick<ArrangerState, 'stepMap'>) {
    if (!arranger.stepMap.length) {
        return null;
    }

    // 1. Group by Sections
    const sections: any[] = [];
    let currentSection: any = null;

    arranger.stepMap.forEach((entry) => {
        const chord = entry.chord;
        if (!currentSection || chord.sectionId !== currentSection.id) {
            currentSection = {
                id: chord.sectionId,
                label: chord.sectionLabel,
                steps: [],
                chords: [],
            };
            sections.push(currentSection);
        }
        currentSection.steps.push(entry);
        // Track unique chord symbols in this section for similarity matching
        const chordSym = chord.absName;
        if (currentSection.chords[currentSection.chords.length - 1] !== chordSym) {
            currentSection.chords.push(chordSym);
        }
    });

    // 2. Identify Patterns (Saliency)
    const sectionSignatures = sections.map((s: any) => s.chords.join('|'));
    const occurrenceCount: Record<string, number> = {};

    sections.forEach((s, i) => {
        const sig = sectionSignatures[i];
        occurrenceCount[sig] = (occurrenceCount[sig] || 0) + 1;
        s.iteration = occurrenceCount[sig];
        s.flux = calculateHarmonicFlux(s.steps);
    });

    // 3. Assign Functional Roles via Heuristics
    const roles = sections.map((s, i) => {
        const isFirstOccurrence = s.iteration === 1;
        const isLastSection = i === sections.length - 1;
        const label = s.label.toLowerCase();

        // Hard overrides based on common naming conventions
        if (label.includes('intro')) {
            return 'Intro';
        }
        if (label.includes('outro')) {
            return 'Outro';
        }
        if (label.includes('solo') || label.includes('chorus') || label.includes('drop')) {
            return 'Peak';
        }

        // Pattern-based roles
        if (isFirstOccurrence) {
            if (i === 0) {
                return 'Main Theme';
            }
            if (label === 'b' || label.includes('bridge')) {
                return 'Bridge';
            }
            if (s.flux > 2.8) {
                return 'Variation';
            }
            return 'Theme B';
        } else {
            // Repeated sections
            if (label === 'b' || label.includes('bridge')) {
                return 'Bridge';
            }

            // "Cool Down" heuristic: if we've seen a section 3+ times, it's likely a refrain
            if (s.iteration >= 3) {
                return 'Refrain';
            }

            if (s.flux > 2.2) {
                return 'Build';
            }
            if (isLastSection) {
                return 'Refrain';
            }
            return 'Main Theme';
        }
    });

    return {
        sections: sections.map((s, i) => ({
            id: s.id,
            label: s.label,
            role: roles[i],
            flux: s.flux,
            iteration: s.iteration,
        })),
        sequence: roles.join('-'),
    };
}
