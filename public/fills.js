// Fill Generation Logic
// Uses block-based generation and templates for natural sounding fills

export const FILL_TEMPLATES = {
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
        ],
        high: [
            // Syncopated 16ths
            {
                steps: [8, 10, 11, 13, 14],
                instruments: ['Snare', 'Snare', 'Kick', 'Snare', 'Kick'],
                velocities: [0.9, 0.4, 1.0, 0.9, 1.1],
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
        ],
        high: [
            // 16th note chaos with open hats
            {
                steps: [8, 9, 10, 11, 12, 13, 14, 15],
                instruments: ['Snare', 'Kick', 'Snare', 'Kick', 'Snare', 'Open', 'Snare', 'Crash'],
                velocities: [0.8, 0.9, 0.9, 1.0, 1.0, 1.1, 1.1, 1.2],
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
        ],
        high: [
            {
                steps: [8, 10, 12, 14],
                instruments: ['Snare', 'Snare', 'Snare', 'Crash'],
                velocities: [0.6, 0.7, 0.8, 0.9],
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

/**
 * Generates a fill based on genre and intensity.
 * @param {string} genre - 'Rock', 'Funk', or 'Jazz'
 * @param {number} intensity - 0.0 to 1.0
 * @param {number} stepsPerMeasure - Typically 16
 * @returns {Object} Map of step -> array of {name, vel}
 */
export function generateProceduralFill(genre, intensity, stepsPerMeasure) {
    const fill = {};
    const templates = FILL_TEMPLATES[genre] || FILL_TEMPLATES.Rock;

    let level = 'low';
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

    // Pick a random template
    const template = options[Math.floor(Math.random() * options.length)];

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
