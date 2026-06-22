import { describe, expect, it } from 'vitest';
import { shouldReleasePriorVoicing } from '../../../public/engine/scheduler-core.js';

// #691 — the chords scheduler releases the previous voicing (sampled voices)
// only on a real harmony change, so a sustained pack (e.g. the Drawbar Organ)
// doesn't ring into the next chord — while re-strikes and arpeggios of the SAME
// chord keep ringing, and the sustain pedal is left to own the ring.
describe('shouldReleasePriorVoicing (#691 chord-change cut)', () => {
    it('releases when the chord identity changes mid-progression', () => {
        expect(shouldReleasePriorVoicing('C7', 'F7', false, 3)).toBe(true);
    });

    it('does NOT release on a re-strike / arpeggio of the same chord', () => {
        // Same absName across steps (an arp or comp re-hit) → keep ringing.
        expect(shouldReleasePriorVoicing('C7', 'C7', false, 3)).toBe(false);
    });

    it('does NOT release on the first chord (nothing struck before)', () => {
        expect(shouldReleasePriorVoicing(null, 'C7', false, 0)).toBe(false);
    });

    it('does NOT release while the sustain pedal is down (pedal owns the ring)', () => {
        expect(shouldReleasePriorVoicing('C7', 'F7', true, 3)).toBe(false);
    });

    it('does NOT release when nothing is ringing (no sampled voices tracked)', () => {
        expect(shouldReleasePriorVoicing('C7', 'F7', false, 0)).toBe(false);
    });

    it('does NOT release when the new chord identity is unknown (dummy/empty data)', () => {
        // dummyChordData carries no absName → null key → leave the ring alone.
        expect(shouldReleasePriorVoicing('C7', null, false, 3)).toBe(false);
    });
});
