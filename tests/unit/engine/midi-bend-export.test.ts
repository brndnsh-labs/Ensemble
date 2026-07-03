// @ts-nocheck
// #744/#747 — MIDI export of the soloist bend-and-release "cry" (`expression.bend`).
// Before this, midi-worker-logic rendered only the `bendStartInterval` scalar, so a
// `.mid` stem kept a bent note dead-flat. These guard that the gesture becomes a real
// pitch-bend curve (up to the harmonic peak, back to centre) on the export tracks.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MidiTrack } from '../../../public/engine/midi-utils.js';
import { ExportProcessor } from '../../../public/engine/midi-worker-logic.js';
import { generateResolutionNotes } from '../../../public/engine/resolution.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

vi.mock('../../../public/engine/worker-utils.js', () => ({
    getChordAtStep: vi.fn(() => ({
        chord: { sectionId: 's1', rootMidi: 60, intervals: [0, 4, 7], freqs: [261, 329, 392] },
        stepInChord: 0,
    })),
}));

vi.mock('../../../public/engine/resolution.js', () => ({
    generateResolutionNotes: vi.fn(() => []),
}));

function makeState() {
    return {
        playback: { bpm: 120, bandIntensity: 0.5, complexity: 0.5, intent: {} },
        arranger: {
            totalSteps: 32,
            timeSignature: '4/4',
            stepMap: [],
            progression: ['C'],
            key: 'C',
            isMinor: false,
        },
        chords: { enabled: true, style: 'Standard', volume: 0.5, octave: 0 },
        bass: { enabled: true, style: 'Standard', volume: 0.5, octave: 0 },
        soloist: makeSoloistMock({ enabled: true, style: 'Standard', lastMidi: 60, octave: 0 }),
        harmony: { enabled: true, style: 'Standard', volume: 0.5, octave: 0, complexity: 0.5 },
        groove: {
            enabled: true,
            volume: 0.5,
            instruments: [],
            lastDrumPreset: 'Standard',
            humanize: 0,
        },
        midi: {
            chordsChannel: 0,
            bassChannel: 1,
            soloistChannel: 2,
            harmonyChannel: 3,
            drumsChannel: 9,
            latency: 0,
            velocitySensitivity: 1.0,
        },
    };
}

// Decode every pitch-bend event on a MidiTrack to { pulse, val } (val signed,
// -8192..8191 — the inverse of MidiTrack.pitchBend's `+ 8192` normalization),
// sorted by pulse.
function bendCurve(track, channel) {
    return track.events
        .filter((e) => (e.data[0] & 0xf0) === 0xe0 && (e.data[0] & 0x0f) === channel)
        .map((e) => ({ pulse: e.time, val: (e.data[1] | (e.data[2] << 7)) - 8192 }))
        .sort((a, b) => a.pulse - b.pulse);
}

describe('MIDI bend-and-release export (#744/#747)', () => {
    let processor;
    beforeEach(() => {
        vi.stubGlobal('postMessage', vi.fn());
        generateResolutionNotes.mockReturnValue([]);
        processor = new ExportProcessor(makeState(), { includedTracks: ['soloist'] });
    });

    it('renders a whole-step gesture as an up-then-down curve peaking at +8192', () => {
        const track = new MidiTrack();
        // 1.0s..2.0s note; default-ish gesture: onset .12, peak .4, release .85.
        processor.emitBendGesture(
            track,
            2,
            { peakSemitones: 2, onsetFrac: 0.12, peakFrac: 0.4, releaseFrac: 0.85 },
            1.0,
            2.0,
        );
        const curve = bendCurve(track, 2);
        // A real glide, not a 3-event snap.
        expect(curve.length).toBeGreaterThan(6);
        // Bend is one-directional (up only) — never goes below centre.
        expect(Math.min(...curve.map((p) => p.val))).toBe(0);
        // Peaks at the full 2-semitone range (range is 2 → MIDI max +8191).
        expect(Math.max(...curve.map((p) => p.val))).toBe(8191);
        // Starts and ends at centre 0 (clean handoff to the next note).
        expect(curve[0].val).toBe(0);
        expect(curve[curve.length - 1].val).toBe(0);
        // Shape: rises to a single peak, then falls (no second hump).
        const peakIdx = curve.findIndex((p) => p.val === 8191);
        for (let i = 1; i <= peakIdx; i++) {
            expect(curve[i].val).toBeGreaterThanOrEqual(curve[i - 1].val);
        }
        for (let i = peakIdx + 1; i < curve.length; i++) {
            expect(curve[i].val).toBeLessThanOrEqual(curve[i - 1].val);
        }
    });

    it('HOLDS the bent target for a held cry (no releaseFrac), re-centring only after the note (#960)', () => {
        const track = new MidiTrack();
        // Held cry: rises to the target at 0.5, then sustains it (no releaseFrac) —
        // the .mid must hold the destination, not sag back down like a release.
        processor.emitBendGesture(
            track,
            2,
            { peakSemitones: 2, onsetFrac: 0.35, peakFrac: 0.5 },
            1.0,
            2.0,
        );
        const curve = bendCurve(track, 2);
        expect(curve.length).toBeGreaterThan(6);
        // Reaches the full 2-semitone peak.
        expect(Math.max(...curve.map((p) => p.val))).toBe(8191);
        // Once at the peak, it STAYS there for the rest of the note — no in-note
        // down-ramp (the up-then-down artifact #960 removes). Every event from the
        // peak onward, except the single closing reset, is pinned at the target.
        const peakIdx = curve.findIndex((p) => p.val === 8191);
        for (let i = peakIdx; i < curve.length - 1; i++) {
            expect(curve[i].val).toBe(8191);
        }
        // The held target rings right up to the note's end...
        expect(curve[curve.length - 2].val).toBe(8191);
        // ...and the channel is re-centred exactly once, by the safety-net, AFTER it.
        expect(curve[curve.length - 1].val).toBe(0);
    });

    it('scales the peak to the bend interval (half-step → +4096)', () => {
        const track = new MidiTrack();
        processor.emitBendGesture(track, 2, { peakSemitones: 1, releaseFrac: 0.8 }, 1.0, 2.0);
        expect(Math.max(...bendCurve(track, 2).map((p) => p.val))).toBe(4096);
    });

    it('is a no-op for a zero/absent peak or a non-positive duration', () => {
        const track = new MidiTrack();
        processor.emitBendGesture(track, 2, { peakSemitones: 0 }, 1.0, 2.0);
        processor.emitBendGesture(track, 2, {}, 1.0, 2.0);
        processor.emitBendGesture(track, 2, { peakSemitones: 2 }, 2.0, 2.0); // zero duration
        expect(bendCurve(track, 2).length).toBe(0);
    });

    it('always ends at centre 0 even on a very short note (dedup never drops the reset)', () => {
        // Boundary guard: when steps collapse onto few pulses, the final reset-to-0
        // must still survive the per-pulse dedup, or the channel is left bent and
        // the next note plays sharp. Use a 10ms note (far shorter than the picker's
        // durationSteps>=4 gate ever yields) to stress the collapse.
        const track = new MidiTrack();
        processor.emitBendGesture(track, 2, { peakSemitones: 2, releaseFrac: 0.85 }, 1.0, 1.01);
        const curve = bendCurve(track, 2);
        expect(curve.length).toBeGreaterThan(0);
        expect(curve[curve.length - 1].val).toBe(0);
    });

    it('wires the gesture through the resolution-note export path', () => {
        // The second render site: a soloist note carrying expression.bend that arrives
        // via the resolution buffer must also get the full pitch-bend curve.
        const soloTrack = new MidiTrack();
        processor.soloistTrack = soloTrack;
        generateResolutionNotes.mockReturnValue([
            {
                module: 'soloist',
                midi: 67,
                durationSteps: 8,
                expression: {
                    bend: { peakSemitones: 2, onsetFrac: 0.12, peakFrac: 0.4, releaseFrac: 0.8 },
                },
            },
        ]);
        processor.finish();
        // Soloist export channel is soloistChannel - 1 (= 1 here).
        const curve = bendCurve(soloTrack, processor.state.midi.soloistChannel - 1);
        expect(curve.length).toBeGreaterThan(6);
        expect(Math.max(...curve.map((p) => p.val))).toBe(8191);
        expect(curve[curve.length - 1].val).toBe(0); // reset to centre after the note
    });
});
