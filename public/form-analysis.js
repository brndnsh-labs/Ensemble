import { getState } from './state.js';

const SECTION_ENERGY_MAP = {
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

/**
 * Returns a baseline energy level (0.0 - 1.0) based on section label.
 * @param {string} label
 * @returns {number}
 */
export function getSectionEnergy(label) {
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

/**
 * Calculates the "Harmonic Flux" (rate of change) for a specific section.
 * Higher flux implies higher energy/complexity.
 */
function calculateHarmonicFlux(sectionSteps) {
    if (!sectionSteps.length) {
        return 0;
    }

    // Count distinct chord changes within the step range
    let changes = 0;
    let lastChordId = null;

    sectionSteps.forEach((entry) => {
        // Simple heuristic: if the chord symbol or root changes, it's a "move"
        const chordId = `${entry.chord.value}_${entry.chord.rootMidi}`;
        if (chordId !== lastChordId) {
            changes++;
            lastChordId = chordId;
        }
    });

    // Flux = changes per bar (assuming 16 steps per bar)
    const bars = sectionSteps.length / 16;
    return bars > 0 ? changes / bars : 0;
}

/**
 * Analyzes the arranger's progression to detect musical form and assign functional roles.
 */
export function analyzeForm() {
    const { arranger } = getState();
    if (!arranger.stepMap.length) {
        return null;
    }

    // 1. Group by Sections
    const sections = [];
    let currentSection = null;

    arranger.stepMap.forEach((entry) => {
        if (!currentSection || entry.chord.sectionId !== currentSection.id) {
            currentSection = {
                id: entry.chord.sectionId,
                label: entry.chord.sectionLabel,
                steps: [],
                chords: [],
            };
            sections.push(currentSection);
        }
        currentSection.steps.push(entry);
        // Track unique chord symbols in this section for similarity matching
        const chordSym = entry.chord.value;
        if (currentSection.chords[currentSection.chords.length - 1] !== chordSym) {
            currentSection.chords.push(chordSym);
        }
    });

    // 2. Identify Patterns (Saliency)
    const sectionSignatures = sections.map((s) => s.chords.join('|'));
    const occurrenceCount = {};

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
