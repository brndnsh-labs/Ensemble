import { getScaleForChord } from './public/theory-scales.js';

export function parseContourSkeleton(skeleton, targetChord, style, startMidi) {
    if (!skeleton || skeleton.length === 0) return null;

    // Parse the skeleton into absolute MIDI notes based on the target chord/scale
    // We should return an array of notes to go into a buffer, like melodic devices do

    // Determine scale available
    const scaleIntervals = getScaleForChord(targetChord, null, style);
    let scaleMask = 0;
    for (let i = 0; i < scaleIntervals.length; i++) {
        scaleMask |= (1 << scaleIntervals[i]);
    }

    const buffer = [];
    let currentMidi = startMidi;
    const rootMidi = targetChord.rootMidi;

    // Let's create a mutation chance
    const isMutated = Math.random() < 0.2;
    const directionMult = isMutated && Math.random() < 0.5 ? -1 : 1;

    for (const node of skeleton) {
        let targetInterval = node.interval * directionMult;

        // Find next scale tone moving targetInterval steps
        let stepsMoved = 0;
        let dir = targetInterval > 0 ? 1 : -1;
        let absTarget = Math.abs(targetInterval);

        let m = currentMidi;
        while (stepsMoved < absTarget) {
            m += dir;
            const pc = ((m % 12) + 12) % 12;
            const relativeInterval = (pc - (rootMidi % 12) + 12) % 12;
            if ((scaleMask >> relativeInterval) & 1) {
                stepsMoved++;
            }
            // failsafe
            if (Math.abs(m - currentMidi) > 24) break;
        }

        currentMidi = m;

        buffer.push({
            midi: currentMidi,
            durationSteps: node.durationSteps,
            velocity: 0.8, // will be scaled dynamically later
            style: style
        });
    }

    return buffer;
}
