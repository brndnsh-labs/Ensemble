/**
 * @vitest-environment happy-dom
 *
 * #1322: the live-vs-export PARITY gate for the interpretation dimensions the
 * issue named. Drum-name→GM-pitch parity is already covered by
 * `tests/unit/app/midi-controller.test.ts` (added in #1321, which shipped
 * first) — not duplicated here. This file covers the other two:
 *
 * - Bend-direction sign: now a single shared formula (`entryBendToPitchWheel`
 *   in `midi-utils.ts`), consumed by live MIDI-out and both exporter
 *   emission sites — a future divergence like #963 is now structurally
 *   impossible rather than merely alarmed-on.
 * - Note existence: does a generated note actually sound, on the live path?
 *   Bass and chords are both expected to agree across live playback and export.
 *   #938 resolved the former chord-ghost exclusion: a ghost is a reduced-velocity
 *   real note, while boolean `true` is silence on every sink.
 *
 * #1325 adds the VELOCITY-CURVE dimension: the soloist's band-intensity swell
 * (which the export applied and live didn't, until live gained it) and the
 * bass's clamped sqrt compression (which live applied and the export didn't).
 * Both are now single shared functions in `velocity-shaping.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { entryBendToPitchWheel } from '../../../public/engine/midi-utils.js';
import { isSilentSentinel } from '../../../public/engine/mute-contract.js';
import { soloistIntensityGain } from '../../../public/engine/velocity-shaping.js';
import { makeSoloistMock } from '../../utils/mock-soloist.js';

vi.mock('../../../public/engine/engine.js', () => ({
    initAudio: vi.fn(),
    killAllNotes: vi.fn(),
    playBassNote: vi.fn(),
    playDrumSound: vi.fn(),
    playHarmonyNote: vi.fn(),
    playNote: vi.fn(),
    playSoloNote: vi.fn(),
    releaseHarmonyVoicing: vi.fn(),
    restoreGains: vi.fn(),
    updateSustain: vi.fn(),
}));

vi.mock('../../../public/engine/midi-scheduler.js', () => ({
    dispatchMidiAutomation: vi.fn(),
    dispatchMidiBass: vi.fn(),
    dispatchMidiChordNote: vi.fn(),
    dispatchMidiChordSustain: vi.fn(),
    dispatchMidiDrum: vi.fn(),
    dispatchMidiHarmonyNote: vi.fn(),
    dispatchMidiSoloist: vi.fn(),
    startMidiTransport: vi.fn(),
    stopMidiTransport: vi.fn(),
}));

const { scheduleBass, scheduleChords, scheduleSoloist } = await import(
    '../../../public/engine/scheduler-core.js'
);
const { dispatchMidiBass, dispatchMidiChordNote, dispatchMidiSoloist } = await import(
    '../../../public/engine/midi-scheduler.js'
);
const { playNote, playSoloNote } = await import('../../../public/engine/engine.js');
const { applyConductor } = await import('../../../public/engine/conductor.js');
const { ExportProcessor } = await import('../../../public/engine/midi-worker-logic.js');
const { MidiTrack } = await import('../../../public/engine/midi-utils.js');

beforeEach(() => {
    vi.clearAllMocks();
});

describe('#1322 — bend-direction-sign parity (entryBendToPitchWheel)', () => {
    it('is the single formula now shared by live MIDI-out and both exporter emission sites', () => {
        expect(entryBendToPitchWheel(0)).toBe(0);
        expect(entryBendToPitchWheel(1)).toBe(4096); // +1 semitone above target → wheel UP
        expect(entryBendToPitchWheel(-1)).toBe(-4096); // -1 semitone below target → wheel DOWN
        expect(entryBendToPitchWheel(0.5)).toBe(2048);
    });

    it('sign always matches the documented convention: positive interval → positive wheel value (#963)', () => {
        for (const interval of [0.1, 0.5, 1, 1.5]) {
            expect(entryBendToPitchWheel(interval)).toBeGreaterThan(0);
            expect(entryBendToPitchWheel(-interval)).toBeLessThan(0);
        }
    });
});

describe('#1322 — note-existence parity: bass mute', () => {
    const CHORD_DATA = { chord: { freqs: [] } };

    function makeBassState(notes: Array<Record<string, unknown>>) {
        return {
            bass: { buffer: new Map([[0, notes]]) },
            playback: { bpm: 120, conductorVelocity: 1.0 },
            vizState: { enabled: false },
            groove: { humanize: 0 },
        } as never;
    }

    function bassNote(overrides: Record<string, unknown> = {}) {
        return { freq: 82.4069, durationSteps: 1, velocity: 1.0, timingOffset: 0, ...overrides };
    }

    it('a numeric palm-mute amount SOUNDS on live MIDI-out (attenuated, not dropped) — matching the export side', () => {
        // #1288 pins the live path's exact attenuated velocity already
        // (tests/unit/engine/bass-mute-midi-out.test.ts); this test's job is the
        // EXISTENCE half: mute-contract.ts's isSilentSentinel only excludes a
        // boolean `true`, so both live and export agree a numeric amount is a
        // real, sounding note.
        scheduleBass(makeBassState([bassNote({ muted: 1 })]), CHORD_DATA, 0, 0);
        expect(dispatchMidiBass).toHaveBeenCalledTimes(1);
        expect(isSilentSentinel(1)).toBe(false);
    });

    it('the boolean CC-only sentinel is dropped on live MIDI-out — matching mute-contract, the sole authority both paths read', () => {
        scheduleBass(makeBassState([bassNote({ muted: true })]), CHORD_DATA, 0, 0);
        expect(dispatchMidiBass).not.toHaveBeenCalled();
        expect(isSilentSentinel(true)).toBe(true);
    });
});

describe('#1325 — soloist band-intensity swell: live playback now applies the export curve', () => {
    const CHORD_DATA = { chord: {} };

    function makeSoloistState(bandIntensity: number | undefined, conductorVelocity: number) {
        return {
            soloist: {
                mode: 'mono',
                audio: {
                    buffer: new Map([
                        [
                            0,
                            [
                                {
                                    freq: 440,
                                    midi: 69,
                                    durationSteps: 1,
                                    velocity: 1.0,
                                    timingOffset: 0,
                                },
                            ],
                        ],
                    ]),
                    lastPlayedFreq: 0,
                    lastNoteEnd: -999,
                },
            },
            playback: { bpm: 120, conductorVelocity, bandIntensity },
            vizState: { enabled: false },
        } as never;
    }

    /**
     * The `conductorVelocity` the REAL auto-conductor produces at this intensity.
     * Driven through `applyConductor` rather than re-typing its `0.7 + I * 0.45`
     * — re-typing the formula is the exact duplication this whole story exists
     * to stop, and it would rot the moment the conductor is retuned.
     */
    function conductorVelocityFor(bandIntensity: number): number {
        let captured = Number.NaN;
        applyConductor(
            {
                playback: { bandIntensity, complexity: 0.5, songMode: false },
                groove: { genreFeel: 'Rock' },
            } as never,
            ((_action: unknown, payload: { velocity?: number }) => {
                if (typeof payload?.velocity === 'number') {
                    captured = payload.velocity;
                }
            }) as never,
        );
        expect(Number.isFinite(captured)).toBe(true);
        return captured;
    }

    /**
     * The velocity the live audio voice is actually asked to play.
     *
     * `conductorVelocity` defaults to whatever the real conductor emits at this
     * intensity, because production ALWAYS co-varies the two — a fixture that
     * freezes it at 1.0 while sweeping `bandIntensity` pins a combination the
     * conductor only produces at I≈0.667, and would stay green straight through
     * a regression in the composite curve.
     */
    function liveSoloistVelocity(
        bandIntensity: number | undefined,
        conductorVelocity = conductorVelocityFor(bandIntensity ?? 0.5),
    ): number {
        vi.clearAllMocks();
        scheduleSoloist(
            makeSoloistState(bandIntensity, conductorVelocity),
            CHORD_DATA as never,
            0,
            0,
        );
        expect(playSoloNote).toHaveBeenCalledTimes(1);
        // playSoloNote(state, freq, time, duration, vel, ...)
        return vi.mocked(playSoloNote).mock.calls[0][4] as number;
    }

    it('the SHARED CURVE brackets both ends: intensity 0 → 0.5x, intensity 1 → 1.4x (conductor held neutral)', () => {
        // Bracketed at the ends rather than sampled mid-band, so a curve that
        // merely trends the right way can't pass — these are the exact values
        // the exporter has always written. `conductorVelocity` is pinned to 1.0
        // here to isolate THIS factor; see the composite test below for the
        // number a listener actually hears.
        expect(liveSoloistVelocity(0, 1.0)).toBeCloseTo(0.5, 10);
        expect(liveSoloistVelocity(1, 1.0)).toBeCloseTo(1.4, 10);
    });

    it('is the SAME formula the .mid exporter applies — one shared function, not two copies (conductor held neutral)', () => {
        // The exporter's soloist branch is `noteVel * soloistIntensityGain(...)`
        // (midi-worker-logic.ts `_writeNotesToTrack`). With noteVel 1.0, a single
        // voice and a neutral conductor, live lands on exactly that number.
        for (const intensity of [0, 0.25, 0.35, 0.5, 0.75, 1]) {
            expect(liveSoloistVelocity(intensity, 1.0)).toBeCloseTo(
                soloistIntensityGain(intensity),
                10,
            );
        }
    });

    it('the LIVE COMPOSITE is quadratic and wider than the export — 0.35x at rest-floor, 1.61x at climax', () => {
        // The number a listener actually hears. `conductorVelocity` is itself
        // `0.7 + I * 0.45`, so the live curve is (0.7 + 0.45I)(0.5 + 0.9I) —
        // NOT the export's 0.5..1.4. Pinning it here means a future change to
        // either curve has to come here and restate the composite deliberately,
        // rather than silently doubling the lead's dynamic range again.
        expect(liveSoloistVelocity(0)).toBeCloseTo(0.7 * 0.5, 10); // 0.350
        expect(liveSoloistVelocity(1)).toBeCloseTo(1.15 * 1.4, 10); // 1.610
        // Production's at-rest seat is bandIntensity 0.35, not 0.5.
        expect(liveSoloistVelocity(0.35)).toBeCloseTo(0.8575 * 0.815, 10); // ~0.699
    });

    it('KNOWN DIVERGENCE: live is strictly louder than the export above I≈0.667 and quieter below — the shared formula does not equalize them', () => {
        // Pinned as an explicit exclusion, not a bug. The exporter never reads
        // `conductorVelocity` even though it IS synced to the worker.
        const exportVel = (i: number) => 1.0 * soloistIntensityGain(i);
        expect(liveSoloistVelocity(0)).toBeLessThan(exportVel(0));
        expect(liveSoloistVelocity(1)).toBeGreaterThan(exportVel(1));
        // They cross where conductorVelocity passes through unity.
        expect(liveSoloistVelocity(2 / 3)).toBeCloseTo(exportVel(2 / 3), 6);
    });

    it('varies monotonically with bandIntensity — the swell is audible, not a constant', () => {
        // The regression this pins: before #1325 live carried the arc only in
        // timbre and generated weight, never in playback level.
        const swept = [0, 0.35, 0.7, 1].map((i) => liveSoloistVelocity(i));
        for (let i = 1; i < swept.length; i++) {
            expect(swept[i]).toBeGreaterThan(swept[i - 1]);
        }
    });

    it('an absent bandIntensity falls back to the neutral 0.5 → 0.95x, never ducking the lead to silence', () => {
        expect(liveSoloistVelocity(undefined, 1.0)).toBeCloseTo(0.95, 10);
    });

    it('a non-finite bandIntensity cannot fan a NaN into MIDI-out (normalizeMidiVelocity would pass it through as a data byte)', () => {
        expect(liveSoloistVelocity(Number.NaN, 1.0)).toBeCloseTo(0.95, 10);
    });

    it('the swell reaches live MIDI-out too, so an external synth hears the same dynamics', () => {
        vi.clearAllMocks();
        scheduleSoloist(makeSoloistState(1, 1.0), CHORD_DATA as never, 0, 0);
        // dispatchMidiSoloist(state, midi, vel, time, duration, bend, isMono)
        expect(vi.mocked(dispatchMidiSoloist).mock.calls[0][2]).toBeCloseTo(1.4, 10);
    });
});

describe('#1325 — the EXPORTER actually calls the shared curves (not just the helper in isolation)', () => {
    function exportState(bandIntensity: number) {
        return {
            playback: { bpm: 120, bandIntensity, complexity: 0.5, intent: {} },
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
            groove: { enabled: true, volume: 0.5, instruments: [], humanize: 0 },
            midi: {
                chordsChannel: 1,
                bassChannel: 2,
                soloistChannel: 3,
                harmonyChannel: 4,
                drumsChannel: 10,
                latency: 0,
                velocitySensitivity: 1.0,
            },
        };
    }

    /** The MIDI velocity byte the exporter writes for a single note on `moduleName`. */
    function exportedVelocityByte(
        moduleName: string,
        noteVel: number,
        bandIntensity = 0.5,
        overrides: Record<string, unknown> = {},
    ): number | null {
        const processor = new ExportProcessor(
            exportState(bandIntensity) as never,
            {
                includedTracks: [moduleName],
            } as never,
        );
        const track = new MidiTrack();
        processor._writeNotesToTrack(
            track,
            0,
            [
                {
                    midi: 60,
                    velocity: noteVel,
                    durationSteps: 1,
                    timingOffset: 0,
                    ...overrides,
                },
            ] as never,
            0,
            moduleName,
            {} as never,
            0,
        );
        const noteOn = track.events.find((e) => (e.data[0] & 0xf0) === 0x90);
        return noteOn ? (noteOn as { data: number[] }).data[2] : null;
    }

    it("BASS: #1325 DECLINED live's [0,1] clamp here — accents above 1.0 must stay distinguishable in the exported .mid", () => {
        // Pinned as a DECISION, not an oversight. `getBassNote` emits up to
        // `Math.min(1.25, …)` and at ordinary intensities most notes are already
        // above 1.0, so clamping collapses the exported bass lane to a single
        // velocity (measured: Rock and Jazz @0.6 both go 3-4 distinct values → 1).
        // If someone "restores parity" by adding the clamp, this goes red.
        expect(exportedVelocityByte('bass', 1.25)).toBeGreaterThan(
            exportedVelocityByte('bass', 1.0),
        );
    });

    it('BASS: the metric accent structure survives export — distinct velocities across the engine’s real [0,1.25] range', () => {
        // The property the clamp destroyed: `bassEnvelope`'s lean-into-the-strong-beat
        // shaping has to reach the .mid as distinct velocities, or a DAW shows a
        // flat line and the line reads sequenced rather than played.
        const spread = [0.85, 1.0, 1.1, 1.25].map((v) => exportedVelocityByte('bass', v));
        expect(new Set(spread).size).toBeGreaterThan(2);
    });

    it('SOLOIST: the exported swell tracks the same shared curve live now applies', () => {
        // Ordered low→high across the intensity range, i.e. the exporter is
        // reading `bandIntensity` through `soloistIntensityGain` as before.
        const low = exportedVelocityByte('soloist', 0.7, 0);
        const mid = exportedVelocityByte('soloist', 0.7, 0.5);
        const high = exportedVelocityByte('soloist', 0.7, 1);
        expect(low).toBeLessThan(mid);
        expect(mid).toBeLessThan(high);
    });

    it('CHORDS: an audible ghost keeps its engine velocity without a second export attenuation', () => {
        const ghostVelocity = 0.18;
        expect(exportedVelocityByte('chords', ghostVelocity, 0.5, { muted: false })).toBe(
            exportedVelocityByte('chords', ghostVelocity),
        );
    });

    it('CHORDS: a boolean silent sentinel never becomes an exported note', () => {
        expect(exportedVelocityByte('chords', 0.5, 0.5, { muted: true })).toBeNull();
    });
});

describe('#938 — note-existence parity: audible chord ghosts and silent sentinels', () => {
    const CHORD_DATA = { chord: { absName: 'C' } };

    function makeChordsState(notes: Array<Record<string, unknown>>, voice = 'Piano') {
        return {
            chords: { buffer: new Map([[0, notes]]), voice },
            playback: {
                bpm: 120,
                sustainActive: false,
                activeChordVoices: [],
                lastChordKey: null,
                drawQueue: [],
            },
            vizState: { enabled: false },
        } as never;
    }

    function chordNote(overrides: Record<string, unknown> = {}) {
        return {
            freq: 261.63,
            durationSteps: 2,
            velocity: 0.5,
            timingOffset: 0,
            muted: false,
            ...overrides,
        };
    }

    it('an ordinary audible note (muted: false) sounds on the live path', () => {
        scheduleChords(makeChordsState([chordNote()]), CHORD_DATA, 0, 0);
        expect(playNote).toHaveBeenCalledTimes(1);
        expect(dispatchMidiChordNote).toHaveBeenCalledTimes(1);
    });

    it('a boolean silent sentinel is dropped by live audio and MIDI-out', () => {
        scheduleChords(makeChordsState([chordNote({ muted: true })]), CHORD_DATA, 0, 0);
        expect(playNote).not.toHaveBeenCalled();
        expect(dispatchMidiChordNote).not.toHaveBeenCalled();
    });

    it('an audible ghost reaches audio, MIDI-out, and the visualizer at its reduced velocity', () => {
        const state = makeChordsState([chordNote({ velocity: 0.18, durationSteps: 0.1 })]);
        state.vizState.enabled = true;

        scheduleChords(state, CHORD_DATA, 0, 0);

        expect(playNote).toHaveBeenCalledTimes(1);
        expect((vi.mocked(playNote).mock.calls[0][4] as { vol: number }).vol).toBeCloseTo(0.18, 10);
        expect(vi.mocked(dispatchMidiChordNote).mock.calls[0][2]).toBeCloseTo(0.18, 10);
        expect(state.playback.drawQueue).toEqual([
            expect.objectContaining({ track: 'chords', velocity: 0.18 }),
        ]);
    });

    it('numVoices/strum-rank stay in sync with the dispatch gate (#938 paired-site trap) — a mixed sentinel+real step counts only the real note', () => {
        scheduleChords(
            makeChordsState([
                chordNote({ muted: true, freq: 300 }),
                chordNote({ muted: false, freq: 261.63 }),
            ]),
            CHORD_DATA,
            0,
            0,
        );
        expect(playNote).toHaveBeenCalledTimes(1);
        // playNote(state, freq, playTime, duration, { vol, index, instrument, numVoices })
        const opts = vi.mocked(playNote).mock.calls[0][4] as { numVoices: number };
        expect(opts.numVoices).toBe(1);
    });

    it('the strum-rank loop excludes the sentinel too and ranks by pitch, not array position (only engages for a guitar voice — isStrummedChordVoice, chords-styles.ts)', () => {
        // Array order deliberately puts the HIGHER-freq real note first, so a
        // rank computed from array position (wrong) would disagree with a rank
        // computed from sorted pitch (right, and what the code actually does).
        scheduleChords(
            makeChordsState(
                [
                    chordNote({ muted: true, freq: 300 }), // sentinel — excluded from ranking
                    chordNote({ freq: 400 }), // higher pitch — should rank LAST (1)
                    chordNote({ freq: 200 }), // lower pitch — should rank FIRST (0)
                ],
                'Acoustic Guitar',
            ),
            CHORD_DATA,
            0,
            0,
        );

        expect(playNote).toHaveBeenCalledTimes(2);
        const calls = vi.mocked(playNote).mock.calls;
        // First call is the 400Hz note (array position 1) — expect strum rank 1.
        expect((calls[0][4] as { index: number }).index).toBe(1);
        // Second call is the 200Hz note (array position 2) — expect strum rank 0.
        expect((calls[1][4] as { index: number }).index).toBe(0);
    });
});
