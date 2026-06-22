// @ts-nocheck
/* eslint-disable */
// Guard for #702: the voice-leading second pass (enabled for Jazz/Bossa/Blues)
// must not octave-fold an upper extension into an internal minor-2nd cluster.
// Repro: on a 12-bar blues, the C7->F7 change voiced the F7 13th (D) down onto a
// common-tone D4 a half-step from the b7 (Eb) — "a wrong note from the organ on
// the IV7." The clean baseline spread keeps the 13 an octave up (D5).
import { describe, expect, it, vi } from 'vitest';
import { CHORD_PRESETS } from '../../../public/data/chord-presets.js';
import {
    getBestInversion,
    getIntervals,
    validateProgression,
} from '../../../public/engine/chords-engine.js';
import { getState } from '../../../public/state.js';

vi.mock('../../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));
vi.mock('../../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));

const A4 = 440;
const f2m = (f) => Math.round(69 + 12 * Math.log2(f / A4));

function hasMinorSecond(midis) {
    const s = [...midis].sort((a, b) => a - b);
    for (let i = 1; i < s.length; i++) {
        if (s[i] - s[i - 1] === 1) {
            return true;
        }
    }
    return false;
}

describe('Voice-leading m2-cluster guard (#702)', () => {
    it('getBestInversion VL pass does not octave-fold the dom13 into an m2 cluster', () => {
        const st = getState();
        st.bass.enabled = true;
        st.groove.genreFeel = 'Blues';
        st.playback.bandIntensity = 0.8;
        st.chords.density = 'standard';

        // F7 dom13 rootless intervals, voice-led from a prior C7 voicing whose 9th
        // sits at D4 — the common-tone snap that used to pull the F7 13th down to
        // D4 (a m2 below the b7 Eb).
        const f7Intervals = getIntervals(st, '7', true, 'standard', 'Blues');
        const prevC7 = [55, 60, 64, 70]; // G3 C4 E4 Bb4
        const voiced = getBestInversion(st, 53 /* F3 */, f7Intervals, prevC7, {
            min: 52,
            max: 84,
            anchor: 60,
            enableVoiceLeading: true,
        });
        expect(hasMinorSecond(voiced), `VL voicing clustered: ${voiced.join(',')}`).toBe(false);
    });

    it('12-bar blues IV7 (bar 5, F7) comps with no internal m2 cluster, int 0.8', () => {
        const st = getState();
        const { arranger, playback, groove, bass, chords } = st;
        const preset = CHORD_PRESETS.find((p) => p.name === '12-Bar Blues');
        arranger.key = 'C';
        arranger.isMinor = false;
        arranger.timeSignature = '4/4';
        arranger.sections = preset.sections;
        groove.genreFeel = 'Blues';
        bass.enabled = true;
        chords.density = 'standard';
        playback.bandIntensity = 0.8;
        playback.conductorVelocity = 0.7 + 0.8 * 0.45;
        validateProgression(st);

        // Every dominant comp voicing in the blues should be cluster-free (these
        // are plain dom7/dom13 — NOT altered qualities that legitimately carry a
        // half-step). Bar 5 is the IV7 (F7) the report flagged.
        for (const c of arranger.progression) {
            const midis = (c.freqs || []).map(f2m);
            expect(
                hasMinorSecond(midis),
                `${c.absName} clustered: ${midis.sort((a, b) => a - b).join(',')}`,
            ).toBe(false);
        }
    });
});
