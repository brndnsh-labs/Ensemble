import { describe, expect, it } from 'vitest';
import { STATE_OWNERSHIP_MANIFEST } from '../../../public/songbook/state-ownership.js';

// The manifest's completeness is a compile-time guard (`satisfies` in state-ownership.ts); this
// suite pins the classification decisions themselves. Its other half — classifying every field
// v1's session writer emitted — went with that writer (#1424).
describe('Songbook state ownership manifest (#1044)', () => {
    it('records the settled ownership decisions exactly once', () => {
        expect(STATE_OWNERSHIP_MANIFEST.arranger.notation).toBe('document');
        for (const lane of ['chords', 'bass', 'soloist', 'groove'] as const) {
            expect(STATE_OWNERSHIP_MANIFEST[lane].volume).toBe('document');
            expect(STATE_OWNERSHIP_MANIFEST[lane].reverb).toBe('document');
        }
        expect(STATE_OWNERSHIP_MANIFEST.playback.sessionTimer).toBe('preferences');
        expect(STATE_OWNERSHIP_MANIFEST.playback.songMode).toBe('preferences');
        // A chart's energy (DECISION 2026-09-26): saved with the chart, set only by the user.
        expect(STATE_OWNERSHIP_MANIFEST.playback.bandIntensity).toBe('document');
        expect(STATE_OWNERSHIP_MANIFEST.playback.autoIntensity).toBe('document');
    });

    it('keeps derived maps, transport, buffers, audio handles, undo, and transient UI runtime-owned', () => {
        expect(STATE_OWNERSHIP_MANIFEST.arranger.progression).toBe('runtime-derived');
        expect(STATE_OWNERSHIP_MANIFEST.arranger.stepMap).toBe('runtime-derived');
        expect(STATE_OWNERSHIP_MANIFEST.arranger.history).toBe('runtime-derived');
        expect(STATE_OWNERSHIP_MANIFEST.playback.step).toBe('runtime-derived');
        expect(STATE_OWNERSHIP_MANIFEST.playback.loopStartStep).toBe('runtime-derived');
        expect(STATE_OWNERSHIP_MANIFEST.playback.audioGraph).toBe('runtime-derived');
        expect(STATE_OWNERSHIP_MANIFEST.groove.sectionSeedMap).toBe('runtime-derived');
        expect(STATE_OWNERSHIP_MANIFEST.groove.buffer).toBe('runtime-derived');
        expect(STATE_OWNERSHIP_MANIFEST.soloist.session).toBe('runtime-derived');
        expect(STATE_OWNERSHIP_MANIFEST.soloist.audio).toBe('runtime-derived');
    });
});
