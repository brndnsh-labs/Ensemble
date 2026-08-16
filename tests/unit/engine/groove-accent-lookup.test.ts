import { describe, expect, it } from 'vitest';
import {
    getAudibleSnareCatchAtStep,
    getSoloistAccentAtStep,
} from '../../../public/engine/groove-engine.js';

function makeGroove() {
    return {
        seedTimelineStartStep: 32,
        accentMap: {
            20: { type: 'snare-stab', velocity: 1.1 },
            21: { type: 'crash-catch', velocity: 1.2 },
            22: { type: 'snare-stab', velocity: 1.05, role: 'section-return' },
        },
    } as any;
}

describe('seeded soloist accent lookup (#994)', () => {
    it('resolves through seedTimelineStartStep instead of indexing the transport step', () => {
        const groove = makeGroove();

        expect(getSoloistAccentAtStep(groove, 52)).toEqual({
            type: 'snare-stab',
            velocity: 1.1,
        });
        expect(getSoloistAccentAtStep(groove, 20)).toBeNull();
    });

    it('publishes only snare stabs the audible drum path accepts in open space', () => {
        const groove = makeGroove();

        expect(getAudibleSnareCatchAtStep(groove, 52, 6, 16, false)).toEqual({
            type: 'snare-stab',
            velocity: 1.1,
        });
        expect(getAudibleSnareCatchAtStep(groove, 52, 5, 16, false)).toBeNull();
        expect(getAudibleSnareCatchAtStep(groove, 52, 6, 16, true)).toBeNull();
        expect(getAudibleSnareCatchAtStep(groove, 53, 7, 16, false)).toBeNull();
    });

    it('keeps dormant Head templates silent until a later loop or practice fold activates them', () => {
        const groove = makeGroove();

        expect(getSoloistAccentAtStep(groove, 54, false)).toBeNull();
        expect(getAudibleSnareCatchAtStep(groove, 54, 6, 16, false, false)).toBeNull();
        expect(getAudibleSnareCatchAtStep(groove, 54, 6, 16, false, true)).toEqual({
            type: 'snare-stab',
            velocity: 1.05,
            role: 'section-return',
        });
    });

    it('resolves a practice-folded return at chart coordinates after a nonzero reseed', () => {
        const groove = makeGroove();

        expect(getSoloistAccentAtStep(groove, 22, true)).toBeNull();
        expect(getSoloistAccentAtStep(groove, 22, true, true)).toEqual({
            type: 'snare-stab',
            velocity: 1.05,
            role: 'section-return',
        });
        expect(getAudibleSnareCatchAtStep(groove, 22, 6, 16, false, true, true)).toEqual({
            type: 'snare-stab',
            velocity: 1.05,
            role: 'section-return',
        });
    });
});
