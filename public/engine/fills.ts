// Fill Generation Logic
// Uses block-based generation and templates for natural sounding fills

interface FillTemplate {
    steps: number[];
    instruments: string[];
    velocities: number[];
}

interface GenreFills {
    low: FillTemplate[];
    medium: FillTemplate[];
    high: FillTemplate[];
}

export const FILL_TEMPLATES: Record<string, GenreFills> = {
    Rock: {
        low: [
            // Simple snare hits on 4, 4&
            { steps: [12, 14], instruments: ['Snare', 'Snare'], velocities: [0.8, 0.7] },
            // Kick/Snare interplay
            {
                steps: [12, 13, 14],
                instruments: ['Kick', 'Snare', 'Snare'],
                velocities: [1.0, 0.7, 0.9],
            },
        ],
        medium: [
            // 8th note build
            {
                steps: [8, 10, 12, 14],
                instruments: ['Snare', 'Snare', 'Snare', 'Snare'],
                velocities: [0.6, 0.7, 0.8, 0.9],
            },
            // Tom-Snare movement
            {
                steps: [8, 10, 12, 14],
                instruments: ['High Tom', 'Mid Tom', 'Low Tom', 'Kick'],
                velocities: [0.8, 0.8, 0.9, 1.1],
            },
        ],
        high: [
            // 16th note roll
            {
                steps: [8, 9, 10, 11, 12, 13, 14, 15],
                instruments: [
                    'Snare',
                    'Snare',
                    'High Tom',
                    'High Tom',
                    'Mid Tom',
                    'Mid Tom',
                    'Low Tom',
                    'Low Tom',
                ],
                velocities: [0.5, 0.4, 0.6, 0.5, 0.7, 0.6, 0.9, 0.8],
            },
            // Flam-like accents (using Flam logic if engine supported, or just tight notes)
            {
                steps: [0, 2, 4, 6, 8, 10, 12, 14],
                instruments: ['Kick', 'Crash', 'Snare', 'Snare', 'Kick', 'Crash', 'Snare', 'Kick'],
                velocities: [1.2, 1.0, 0.9, 0.9, 1.2, 1.0, 1.0, 1.2],
            },
        ],
    },
    Funk: {
        low: [
            // Ghost note syncopation
            { steps: [13, 15], instruments: ['Snare', 'Snare'], velocities: [0.3, 0.4] },
            // Hi-hat open on upbeat
            { steps: [14], instruments: ['Open'], velocities: [0.8] },
        ],
        medium: [
            // Linear pattern
            {
                steps: [12, 13, 14, 15],
                instruments: ['Kick', 'Snare', 'Kick', 'Snare'],
                velocities: [0.9, 0.4, 0.9, 0.8],
            },
            // why: Funk tom-syncopation — Stubblefield/Brown idiom drops a
            // tight Mid→Low tom figure on the "e" and "&" of beat 4 (steps
            // 13/14) instead of a snare roll, then snaps back to the kick
            // on the "a" (step 15). Velocities sit just below the snare
            // backbeat so the fill reads as a drop, not a peak.
            {
                steps: [12, 13, 14, 15],
                instruments: ['Snare', 'Mid Tom', 'Low Tom', 'Kick'],
                velocities: [0.8, 0.85, 0.95, 1.05],
            },
        ],
        high: [
            // Syncopated 16ths
            {
                steps: [8, 10, 11, 13, 14],
                instruments: ['Snare', 'Snare', 'Kick', 'Snare', 'Kick'],
                velocities: [0.9, 0.4, 1.0, 0.9, 1.1],
            },
            // why: high-energy funk tom drop — a syncopated 16th figure that
            // weaves snare ghosts with Mid/Low toms in the second half of the
            // bar (Clyde Stubblefield "Funky Drummer" Bonham-influenced fill).
            // Final kick on 15 lands as the pickup into the next bar's "one".
            {
                steps: [8, 10, 11, 13, 14, 15],
                instruments: ['Snare', 'Mid Tom', 'Low Tom', 'Mid Tom', 'Low Tom', 'Kick'],
                velocities: [0.7, 0.85, 0.95, 0.9, 1.0, 1.1],
            },
        ],
    },
    Jazz: {
        low: [
            // Soft snare comping
            { steps: [11, 14], instruments: ['Snare', 'Snare'], velocities: [0.4, 0.5] },
        ],
        medium: [
            // Triplet feel on snare (mapped to 16ths roughly or Swing engine handles it)
            {
                steps: [8, 11, 14],
                instruments: ['Snare', 'Snare', 'Snare'],
                velocities: [0.5, 0.6, 0.7],
            },
        ],
        high: [
            // Busy snare/kick interaction
            {
                steps: [4, 7, 10, 13],
                instruments: ['Snare', 'Kick', 'Snare', 'Kick'],
                velocities: [0.7, 0.8, 0.8, 0.9],
            },
        ],
    },
    Blues: {
        low: [
            // Simple shuffle pickup (the 'and' of 4)
            { steps: [14], instruments: ['Snare'], velocities: [0.6] },
            // Kick pickup
            { steps: [14], instruments: ['Kick'], velocities: [0.8] },
        ],
        medium: [
            // Standard shuffle fill (3... and-4-and)
            {
                steps: [10, 12, 14],
                instruments: ['Snare', 'Snare', 'Snare'],
                velocities: [0.6, 0.7, 0.9],
            },
            // Kick support on the beat
            { steps: [12, 14], instruments: ['Kick', 'Snare'], velocities: [0.9, 0.8] },
            // why: Blues tom-down — H→M→L descent across steps 10/12/13
            // landing on a Snare backbeat at 14. The engine quantizes to
            // 16ths so the shuffle feel comes from the swing engine on top
            // of these grid positions, not from the steps themselves. Reads
            // like a Fred Below tom-down behind a Muddy Waters turnaround.
            {
                steps: [10, 12, 13, 14],
                instruments: ['High Tom', 'Mid Tom', 'Low Tom', 'Snare'],
                velocities: [0.7, 0.8, 0.9, 0.95],
            },
        ],
        high: [
            // Classic triplet-feel turnaround (on 8th grid: 3, 3&, 4, 4&)
            {
                steps: [8, 10, 12, 14],
                instruments: ['Snare', 'Kick', 'Snare', 'Crash'],
                velocities: [0.8, 0.9, 0.9, 1.1],
            },
            // Snare roll (8th notes only)
            {
                steps: [8, 10, 12, 14],
                instruments: ['Snare', 'Snare', 'Snare', 'Snare'],
                velocities: [0.7, 0.8, 0.9, 1.0],
            },
            // why: high-energy blues turnaround tom drop — descending tom
            // triplet (high→mid→low) on the 8th grid lands as a "ba-da-bum"
            // pickup into beat 1 with a Crash at the top. Classic 12-bar
            // turnaround punctuation (Stevie Ray Vaughan, "Pride and Joy").
            {
                steps: [8, 10, 12, 14, 15],
                instruments: ['High Tom', 'Mid Tom', 'Low Tom', 'Snare', 'Crash'],
                velocities: [0.75, 0.85, 0.95, 1.0, 1.15],
            },
        ],
    },
    Disco: {
        low: [
            // Open Hi-hat bark
            { steps: [14], instruments: ['Open'], velocities: [0.9] },
            // Snare pickup
            { steps: [12, 14], instruments: ['Snare', 'Snare'], velocities: [0.7, 0.8] },
        ],
        medium: [
            // Classic Disco roll (Snare build)
            {
                steps: [8, 10, 12, 13, 14, 15],
                instruments: ['Snare', 'Snare', 'Snare', 'Snare', 'Snare', 'Snare'],
                velocities: [0.6, 0.7, 0.8, 0.9, 0.9, 1.0],
            },
            // why: Disco tom tumble — descending H→M→L across the back half
            // of the bar, returning to snare on the "and-a" of beat 4. The
            // motion mimics the four-on-the-floor energy lift heard on Earth
            // Wind & Fire "September" / Chic fills.
            {
                steps: [8, 10, 12, 13, 14, 15],
                instruments: ['High Tom', 'Mid Tom', 'Low Tom', 'Snare', 'Snare', 'Open'],
                velocities: [0.75, 0.85, 0.95, 0.9, 1.0, 1.05],
            },
        ],
        high: [
            // 16th note chaos with open hats
            {
                steps: [8, 9, 10, 11, 12, 13, 14, 15],
                instruments: ['Snare', 'Kick', 'Snare', 'Kick', 'Snare', 'Open', 'Snare', 'Crash'],
                velocities: [0.8, 0.9, 0.9, 1.0, 1.0, 1.1, 1.1, 1.2],
            },
            // why: high-disco tom tumble — alternating 16ths between toms
            // (descending) and kick, then snare→Crash on the final 8th.
            // Reads as the "drop into the chorus" fill on a classic disco
            // track. Crash on 15 is the lift over the bar line.
            {
                steps: [8, 9, 10, 11, 12, 13, 14, 15],
                instruments: [
                    'High Tom',
                    'Kick',
                    'Mid Tom',
                    'Kick',
                    'Low Tom',
                    'Snare',
                    'Snare',
                    'Crash',
                ],
                velocities: [0.8, 0.9, 0.9, 1.0, 1.0, 1.05, 1.1, 1.2],
            },
        ],
    },
    Acoustic: {
        low: [
            { steps: [14], instruments: ['Kick'], velocities: [0.6] },
            { steps: [12, 14], instruments: ['Snare', 'Snare'], velocities: [0.4, 0.5] },
        ],
        medium: [
            {
                steps: [12, 13, 14, 15],
                instruments: ['Snare', 'Snare', 'Snare', 'Snare'],
                velocities: [0.4, 0.5, 0.6, 0.5],
            },
            {
                steps: [10, 12, 14],
                instruments: ['Kick', 'Snare', 'Kick'],
                velocities: [0.7, 0.6, 0.8],
            },
            // why: Acoustic softened tom phrase — sparse Mid-Tom hits at
            // ghost-velocity (~0.45) as a gentler alternative to a snare
            // roll. Suits singer-songwriter/folk territory where a snare
            // roll would be too rock-aggressive. Kick anchors beat 4.
            {
                steps: [10, 12, 14],
                instruments: ['Mid Tom', 'Mid Tom', 'Kick'],
                velocities: [0.45, 0.55, 0.75],
            },
        ],
        high: [
            {
                steps: [8, 10, 12, 14],
                instruments: ['Snare', 'Snare', 'Snare', 'Crash'],
                velocities: [0.6, 0.7, 0.8, 0.9],
            },
            // why: high-acoustic tom build — soft H→M→L descent leading
            // into a Snare on the "and-a" of beat 4. Velocities stay below
            // the Rock band so the fill feels human (not arena-rock). No
            // Crash here — acoustic high-intensity reads as a band peak,
            // not a stadium peak.
            {
                steps: [8, 10, 12, 14, 15],
                instruments: ['High Tom', 'Mid Tom', 'Low Tom', 'Snare', 'Snare'],
                velocities: [0.65, 0.75, 0.85, 0.9, 0.95],
            },
        ],
    },
    'Bossa Nova': {
        low: [{ steps: [14, 15], instruments: ['Snare', 'Snare'], velocities: [0.6, 0.4] }],
        medium: [
            {
                steps: [12, 13, 14, 15],
                instruments: ['Snare', 'High Tom', 'Mid Tom', 'Conga'],
                velocities: [0.7, 0.6, 0.7, 0.9],
            },
        ],
        high: [
            {
                steps: [8, 10, 12, 14, 15],
                instruments: ['High Tom', 'Conga', 'Mid Tom', 'Snare', 'Crash'],
                velocities: [0.6, 0.8, 0.7, 0.9, 1.1],
            },
        ],
    },
    Country: {
        // why: Country fills key off the "train-beat" idiom — continuous 16ths
        // on snare with rolling tom pickups into beat 1. Each level adds one
        // more tom event so the listener hears the fill grow as intensity
        // rises rather than collapsing to a snare roll (the prior Rock
        // fallback was too rock-aggressive for country contexts).
        low: [
            // Sparse Snare + Kick pickup — the "ba-dum" minimal country fill
            { steps: [14], instruments: ['Snare'], velocities: [0.7] },
            { steps: [12, 14], instruments: ['Kick', 'Snare'], velocities: [0.85, 0.8] },
        ],
        medium: [
            // Pure train-beat snare lead-in — the Nashville session-drummer
            // snare-fours pickup that defines country drumming as much as
            // the tom roll does. Without this, every medium fill plays
            // toms and the listener never hears a clean snare-only pickup.
            {
                steps: [10, 11, 12, 13, 14, 15],
                instruments: ['Snare', 'Snare', 'Snare', 'Snare', 'Snare', 'Kick'],
                velocities: [0.55, 0.65, 0.75, 0.8, 0.85, 1.0],
            },
            // Train-beat snare lead-in + Mid-Tom pickup on the "and-a" of 4
            {
                steps: [10, 12, 14, 15],
                instruments: ['Snare', 'Snare', 'Mid Tom', 'Low Tom'],
                velocities: [0.7, 0.8, 0.85, 0.95],
            },
            // Classic country tom roll into beat 1 — H→M→L→Kick (Nashville
            // session-drummer style, "King of the Road" lineage). This is
            // the genre-defining fill.
            {
                steps: [11, 12, 13, 14, 15],
                instruments: ['High Tom', 'High Tom', 'Mid Tom', 'Low Tom', 'Kick'],
                velocities: [0.7, 0.8, 0.85, 0.95, 1.05],
            },
        ],
        high: [
            // 16th-note train fill with full tom descent — the "Texas swing"
            // pickup into the next chorus. Crash on 15 marks the arrival.
            {
                steps: [8, 9, 10, 11, 12, 13, 14, 15],
                instruments: [
                    'Snare',
                    'Snare',
                    'High Tom',
                    'High Tom',
                    'Mid Tom',
                    'Mid Tom',
                    'Low Tom',
                    'Crash',
                ],
                velocities: [0.65, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0, 1.2],
            },
        ],
    },
    'Hip Hop': {
        // why: Hip-Hop fills favor sparse 808-style low-tom drops over
        // snare rolls. The genre's fill vocabulary is closer to a "boom →
        // boom → BOOM" pickup than a continuous build. Use Low Tom as the
        // primary tom voice (the closest in-engine analogue to an 808 tom).
        low: [
            // Boom-bap pickup — single LowTom on the "and" of 4
            { steps: [14], instruments: ['Low Tom'], velocities: [0.85] },
            // Snare pickup (fallback)
            { steps: [12, 14], instruments: ['Snare', 'Snare'], velocities: [0.6, 0.75] },
        ],
        medium: [
            // 808-style tom drop — Mid + Low on the back half of bar
            {
                steps: [10, 12, 14],
                instruments: ['Snare', 'Low Tom', 'Low Tom'],
                velocities: [0.7, 0.95, 1.05],
            },
            // Boom-bap variation — kick anchor + low-tom punctuation
            {
                steps: [12, 13, 14, 15],
                instruments: ['Kick', 'Snare', 'Low Tom', 'Kick'],
                velocities: [1.0, 0.7, 0.95, 1.05],
            },
        ],
        high: [
            // Trap tom drop — sparse, heavy LowTom hits over the back half
            // (modern trap producer tom drop). Crash on 15 marks the
            // section change. TODO: an 808-tagged sub voice would suit
            // hip-hop more authentically than Low Tom alone.
            {
                steps: [8, 10, 12, 13, 14, 15],
                instruments: ['Low Tom', 'Low Tom', 'Mid Tom', 'Low Tom', 'Low Tom', 'Crash'],
                velocities: [0.85, 0.95, 0.9, 1.0, 1.1, 1.2],
            },
        ],
    },
    'Neo-Soul': {
        // why: Neo-Soul fills sit between Hip-Hop's sparseness and Funk's
        // ghost-note density. Use Mid/Low toms at laid-back velocities to
        // keep the Dilla "drunken swing" feel — the displaced final tom
        // can punch through (peak ~1.0) but the body of the fill stays
        // ghosted. Phrases resolve into the snare backbeat rather than
        // peaking on a Crash.
        low: [
            // Ghosted Mid-Tom pickup on the "and-a" of 4
            { steps: [14, 15], instruments: ['Mid Tom', 'Snare'], velocities: [0.5, 0.6] },
            // Sidestick-and-tom — the laid-back conversational fill
            { steps: [12, 14], instruments: ['Sidestick', 'Mid Tom'], velocities: [0.55, 0.7] },
        ],
        medium: [
            // Mid+Low tom triplet feel mapped onto 8th grid — a Questlove
            // tom-down ("Voodoo"-era D'Angelo). Snare arrival on the "and"
            // of 4 lands the gesture without a Crash.
            {
                steps: [10, 12, 13, 14],
                instruments: ['Mid Tom', 'Low Tom', 'Mid Tom', 'Snare'],
                velocities: [0.7, 0.85, 0.75, 0.9],
            },
        ],
        high: [
            // Dilla-style tom-down fill — sparse-to-dense across the last
            // two beats, ending with a Snare on 14 + Low Tom on 15 (the
            // "displaced one" that pulls into the next bar's downbeat).
            {
                steps: [8, 10, 11, 12, 13, 14, 15],
                instruments: [
                    'High Tom',
                    'Mid Tom',
                    'Mid Tom',
                    'Low Tom',
                    'Snare',
                    'Snare',
                    'Low Tom',
                ],
                velocities: [0.7, 0.8, 0.75, 0.9, 0.85, 0.95, 1.0],
            },
        ],
    },
    'Ska-Punk': {
        low: [
            {
                steps: [12, 14, 15],
                instruments: ['Snare', 'Snare', 'Snare'],
                velocities: [0.8, 0.9, 1.1],
            },
        ],
        medium: [
            {
                steps: [8, 10, 12, 13, 14, 15],
                instruments: ['Snare', 'Snare', 'Snare', 'Snare', 'Snare', 'Crash'],
                velocities: [0.6, 0.7, 0.8, 0.9, 1.0, 1.2],
            },
        ],
        high: [
            {
                steps: [0, 2, 4, 6, 8, 10, 12, 14],
                instruments: ['Kick', 'Crash', 'Kick', 'Crash', 'Kick', 'Crash', 'Snare', 'Crash'],
                velocities: [1.2, 1.1, 1.2, 1.1, 1.2, 1.1, 1.2, 1.3],
            },
        ],
    },
};

export function generateProceduralFill(
    genre: string,
    intensity: number,
    stepsPerMeasure: number,
): Record<number, { name: string; vel: number }[]> {
    return generateDeterministicFill(genre, intensity, stepsPerMeasure, Math.random);
}

export function generateDeterministicFill(
    genre: string,
    intensity: number,
    stepsPerMeasure: number,
    prng: () => number,
): Record<number, { name: string; vel: number }[]> {
    const fill: Record<number, { name: string; vel: number }[]> = {};
    const templates = FILL_TEMPLATES[genre] || FILL_TEMPLATES.Rock;

    let level: 'low' | 'medium' | 'high' = 'low';
    if (intensity > 0.4) {
        level = 'medium';
    }
    if (intensity > 0.75) {
        level = 'high';
    }

    const options = templates[level];
    if (!options || options.length === 0) {
        return fill;
    }

    // Pick a deterministic template
    const template = options[Math.floor(prng() * options.length)];

    // Apply template to the LAST beat(s) of the measure
    // Templates use steps relative to a standard 16-step measure (ending at 15).
    // We shift them to align with the actual stepsPerMeasure.
    const offset = stepsPerMeasure - 16;

    template.steps.forEach((stepIdx, i) => {
        const inst = template.instruments[i];
        const vel = template.velocities[i];

        const actualStep = stepIdx + offset;

        // Ensure we don't produce negative steps if the measure is super short
        if (actualStep >= 0 && actualStep < stepsPerMeasure) {
            if (!fill[actualStep]) {
                fill[actualStep] = [];
            }
            fill[actualStep].push({ name: inst, vel });
        }
    });

    return fill;
}
