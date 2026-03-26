import { describe, expect, it } from 'vitest';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { buildHookAuditArrangement } from '../../scripts/soloist-analysis-utils.js';

function createHookSeedState(arrangement) {
    return {
        soloist: {
            enabled: true,
            busySteps: 0,
            phraseContext: { role: 'call', profile: 'srv' },
        },
        arranger: {
            timeSignature: arrangement.timeSignature,
            sectionMap: arrangement.sectionMap,
            totalSteps: arrangement.totalSteps,
            stepMap: arrangement.stepMap,
        },
        playback: { bandIntensity: 0.5, currentLoopCount: 0 },
        groove: { genreFeel: 'Rock', creativity: false, instruments: [] },
    };
}

function getLoopWindowNotes(seed, arrangement) {
    return seed.notes.filter((note) => note.step >= 0 && note.step < arrangement.totalSteps);
}

describe('Soloist Seeder Hook Shape', () => {
    it('keeps rock hook heads in a singable mid register', () => {
        const arrangement = buildHookAuditArrangement('4/4');
        const state = createHookSeedState(arrangement);
        const seed = generateSessionSeed(state, state.arranger, 'rock', 0.5, 'HEAD_AUDIT');
        const loopWindowNotes = getLoopWindowNotes(seed, arrangement);
        const averageMidi =
            loopWindowNotes.reduce((sum, note) => sum + note.midi, 0) / loopWindowNotes.length;
        const belowMiddleC =
            loopWindowNotes.filter((note) => note.midi < 60).length / loopWindowNotes.length;

        expect(averageMidi).toBeGreaterThanOrEqual(58);
        expect(belowMiddleC).toBeLessThan(0.6);
    });

    it('keeps rock hook heads rhythmically present in the opening loop window', () => {
        const arrangement = buildHookAuditArrangement('4/4');
        const state = createHookSeedState(arrangement);
        const seed = generateSessionSeed(state, state.arranger, 'rock', 0.5, 'HEAD_AUDIT');
        const loopWindowNotes = getLoopWindowNotes(seed, arrangement);
        const notesPerMeasure = loopWindowNotes.length / arrangement.measuresPerLoop;

        expect(notesPerMeasure).toBeGreaterThanOrEqual(2.25);
    });
});
