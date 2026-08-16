/**
 * Story #1018 — stem export. Asserts two contracts for `renderStemsToWav`
 * without driving a real Web Audio render (there is no OfflineAudioContext in
 * the vitest `node` environment; `scripts/mix-report.ts`'s real renders only
 * run inside a headless Chromium via Playwright):
 *
 *   1. Flag behavior — each stem pass enables exactly ONE of the five
 *      stem-bearing slices (soloist/bass/chords/harmony/groove) and disables
 *      the rest, regardless of what was enabled live. Captured by spying on
 *      `initAudio`, which receives the fully-prepared per-stem clone.
 *   2. Non-silence — the WAV blob produced for each stem actually contains
 *      nonzero PCM samples (guards against an accidental zero-length buffer,
 *      a forgotten channel-data copy, or a totalSteps/frameCount mis-calculation
 *      that would silently produce an empty/silent file).
 *
 * `OfflineAudioContext` is stubbed with a fake that returns deterministic
 * nonzero channel data; `initAudio` / `scheduleGlobalEvent` /
 * `generateNotesForStep` / `validateProgression` are mocked no-ops since the
 * actual synthesis path is out of scope for a flag+non-silence contract test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const initAudioMock = vi.fn();
const scheduleGlobalEventMock = vi.fn();
const generateNotesForStepMock = vi.fn(() => ({ notes: [] }));
const validateProgressionMock = vi.fn();

vi.mock('../../public/engine/engine.js', () => ({
    initAudio: initAudioMock,
}));
vi.mock('../../public/engine/scheduler-core.js', () => ({
    scheduleGlobalEvent: scheduleGlobalEventMock,
}));
vi.mock('../../public/engine/tick-logic.js', () => ({
    generateNotesForStep: generateNotesForStepMock,
}));
vi.mock('../../public/engine/chords-engine.js', () => ({
    validateProgression: validateProgressionMock,
}));

function makeLiveState() {
    return {
        playback: {
            bpm: 120,
            modals: {},
            isPlaying: false,
            nextNoteTime: 0,
            unswungNextNoteTime: 0,
        },
        arranger: {
            sections: [{ id: 'a', label: 'A', value: 'C G Am F' }],
            totalSteps: 16,
            progression: [],
            stepMap: [],
            sectionMap: [],
            measureMap: [],
        },
        groove: {
            enabled: true,
            instruments: [{ name: 'Kick', steps: [1, 0, 0, 0] }],
            accentMap: { 20: { type: 'snare-stab', velocity: 1.1 } },
            seedTimelineStartStep: 48,
        },
        chords: { enabled: true, buffer: new Map() },
        bass: { enabled: true, buffer: new Map() },
        soloist: {
            enabled: true,
            audio: {},
            motifBuffer: [],
            pitchHistory: [],
            session: { currentPhrase: { context: {} } },
        },
        harmony: { enabled: true, buffer: new Map() },
        vizState: {},
        midi: {},
        conductor: { form: null },
        ui: {},
    };
}

// A fake OfflineAudioContext returning deterministic, nonzero PCM so we can
// assert the encoded WAV is non-silent without a real audio graph.
function makeFakeOfflineAudioContext() {
    return vi.fn(function FakeOAC(
        this: any,
        numberOfChannels: number,
        length: number,
        sampleRate: number,
    ) {
        this.numberOfChannels = numberOfChannels;
        this.length = length;
        this.sampleRate = sampleRate;
        this.startRendering = vi.fn(async () => ({
            numberOfChannels,
            sampleRate,
            duration: length / sampleRate,
            getChannelData: (ch: number) => {
                const data = new Float32Array(length);
                data.fill(0.2 + ch * 0.05);
                return data;
            },
        }));
    });
}

/** True if the WAV blob's PCM data section contains any nonzero 16-bit sample. */
async function wavHasNonSilentSamples(blob: Blob): Promise<boolean> {
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);
    // 44-byte canonical WAV header precedes the `data` chunk's samples.
    for (let offset = 44; offset + 1 < buf.byteLength; offset += 2) {
        if (view.getInt16(offset, true) !== 0) {
            return true;
        }
    }
    return false;
}

describe('renderStemsToWav (#1018 stem export)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
        vi.stubGlobal('OfflineAudioContext', makeFakeOfflineAudioContext());
    });

    it('solos exactly one stem-bearing slice per stem and disables the rest', async () => {
        vi.doMock('../../public/state.js', () => ({
            getState: () => makeLiveState(),
        }));
        const { renderStemsToWav } = await import('../../public/export/audio-export.js');

        const results = await renderStemsToWav(['soloist', 'bass', 'drums'], {
            filename: 'my-song',
        });

        expect(results.map((r) => r.instrument)).toEqual(['soloist', 'bass', 'drums']);
        expect(results.map((r) => r.filename)).toEqual([
            'my-song-stem-soloist.wav',
            'my-song-stem-bass.wav',
            'my-song-stem-drums.wav',
        ]);

        expect(initAudioMock).toHaveBeenCalledTimes(3);

        const sliceForStem = {
            soloist: 'soloist',
            bass: 'bass',
            chords: 'chords',
            harmony: 'harmony',
            drums: 'groove',
        } as const;
        const expectedSoloed: Array<keyof typeof sliceForStem> = ['soloist', 'bass', 'drums'];

        initAudioMock.mock.calls.forEach(([clonedState], i) => {
            const soloed = expectedSoloed[i];
            for (const [stem, sliceKey] of Object.entries(sliceForStem)) {
                const shouldBeEnabled = stem === soloed;
                expect(clonedState[sliceKey].enabled).toBe(shouldBeEnabled);
            }
        });
    });

    it('renders non-silent audio for every stem', async () => {
        vi.doMock('../../public/state.js', () => ({
            getState: () => makeLiveState(),
        }));
        const { renderStemsToWav } = await import('../../public/export/audio-export.js');

        const results = await renderStemsToWav(['chords', 'harmony']);

        expect(results).toHaveLength(2);
        for (const result of results) {
            expect(result.blob.size).toBeGreaterThan(44); // header + at least one sample
            await expect(wavHasNonSilentSamples(result.blob)).resolves.toBe(true);
        }
    });

    it('defaults to all five stems when no instrument list is passed', async () => {
        vi.doMock('../../public/state.js', () => ({
            getState: () => makeLiveState(),
        }));
        const { renderStemsToWav, STEM_INSTRUMENTS } = await import(
            '../../public/export/audio-export.js'
        );

        const results = await renderStemsToWav();

        expect(results.map((r) => r.instrument)).toEqual(STEM_INSTRUMENTS);
    });

    it('gives each stem a fresh clone (soloing one stem does not leak into another)', async () => {
        vi.doMock('../../public/state.js', () => ({
            getState: () => makeLiveState(),
        }));
        const { renderStemsToWav } = await import('../../public/export/audio-export.js');

        await renderStemsToWav(['soloist', 'harmony']);

        const [firstState] = initAudioMock.mock.calls[0];
        const [secondState] = initAudioMock.mock.calls[1];
        expect(firstState).not.toBe(secondState);
        expect(firstState.soloist.enabled).toBe(true);
        expect(firstState.harmony.enabled).toBe(false);
        expect(secondState.soloist.enabled).toBe(false);
        expect(secondState.harmony.enabled).toBe(true);
    });

    it('preserves a detached accent plan for a full-session export and rebases its timeline', async () => {
        const liveState = makeLiveState();
        vi.doMock('../../public/state.js', () => ({
            getState: () => liveState,
        }));
        const { renderCurrentSessionToWav } = await import('../../public/export/audio-export.js');

        await renderCurrentSessionToWav();

        const [clonedState] = initAudioMock.mock.calls[0];
        expect(clonedState.groove.accentMap).toEqual(liveState.groove.accentMap);
        expect(clonedState.groove.accentMap).not.toBe(liveState.groove.accentMap);
        expect(clonedState.groove.accentMap[20]).not.toBe(liveState.groove.accentMap[20]);
        expect(clonedState.groove.seedTimelineStartStep).toBe(0);
    });

    it('does not carry a soloist-driven accent plan into an isolated non-soloist stem', async () => {
        vi.doMock('../../public/state.js', () => ({
            getState: () => makeLiveState(),
        }));
        const { renderStemsToWav } = await import('../../public/export/audio-export.js');

        await renderStemsToWav(['soloist', 'chords', 'drums']);

        expect(initAudioMock.mock.calls[0][0].groove.accentMap).not.toBeNull();
        expect(initAudioMock.mock.calls[1][0].groove.accentMap).toBeNull();
        expect(initAudioMock.mock.calls[2][0].groove.accentMap).toBeNull();
    });

    it('refills and schedules repeated exports on the absolute seed timeline', async () => {
        vi.doMock('../../public/state.js', () => ({
            getState: () => makeLiveState(),
        }));
        const { renderCurrentSessionToWav } = await import('../../public/export/audio-export.js');

        await renderCurrentSessionToWav({ loops: 2 });

        expect(generateNotesForStepMock).toHaveBeenCalledTimes(32);
        expect(generateNotesForStepMock.mock.calls.map((call) => call[1])).toEqual(
            Array.from({ length: 32 }, (_, step) => step),
        );
        expect(scheduleGlobalEventMock.mock.calls.map((call) => call[1])).toEqual(
            Array.from({ length: 32 }, (_, step) => step),
        );
    });
});
