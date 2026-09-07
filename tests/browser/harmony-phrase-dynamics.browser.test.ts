// @ts-nocheck
import { afterEach, expect, test, vi } from 'vitest';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { resetHiddenGenerationMemory } from '../../public/engine/generation-run.js';
import { HARMONY_GENRE_PROFILES } from '../../public/engine/harmony-styles.js';
import { clearPack, registerPackBuffer } from '../../public/engine/instrument-registry.js';
import { playSampledNote } from '../../public/engine/sample-voice.js';
import { scheduleHarmonies } from '../../public/engine/scheduler-core.js';
import { generateNotesForStep } from '../../public/engine/tick-logic.js';
import { cloneStateForDetachedGeneration } from '../../public/export/detached-generation-state.js';
import { getState } from '../../public/state.js';

const samples = vi.hoisted(() => ({ zones: null }));
vi.mock('../../public/engine/pack-runtime.js', async (importOriginal) => ({
    ...(await importOriginal()),
    getPackZones: () => samples.zones,
}));

const random = Math.random;
afterEach(() => {
    Math.random = random;
    samples.zones = null;
    clearPack('strings-ensemble');
    HARMONY_GENRE_PROFILES.Rock.phraseDynamics = true;
    HARMONY_GENRE_PROFILES.Acoustic.phraseDynamics = true;
});

async function render(genre, intensity, sampled, baseline) {
    Math.random = () => 0.5;
    HARMONY_GENRE_PROFILES[genre].phraseDynamics = !baseline;
    const sampleRate = 24000;
    const ctx = new OfflineAudioContext(1, sampleRate * 10, sampleRate);
    const bus = ctx.createGain();
    bus.connect(ctx.destination);
    // A known sustained waveform isolates gain/continuity from a recording's
    // own bowing. The sample player, tone shaping, scheduler and synth are real.
    const buffer = ctx.createBuffer(1, sampleRate * 14, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
        data[i] = 0.1 * Math.sin((2 * Math.PI * 261.625565 * i) / sampleRate);
    }
    samples.zones = [
        { rootMidi: 60, buffer },
        { rootMidi: 84, buffer },
    ];
    registerPackBuffer('strings-ensemble', 'held', buffer);
    const initial = cloneStateForDetachedGeneration(getState());
    const state = {
        ...initial,
        playback: {
            ...initial.playback,
            audio: ctx,
            audioGraph: { harmonies: { gain: bus } },
            bpm: 120,
            bandIntensity: intensity,
            autoIntensity: false,
            conductorVelocity: 1,
        },
        arranger: {
            ...initial.arranger,
            timeSignature: '4/4',
            key: 'C',
            sections: [
                { id: 'verse', label: 'Verse', value: 'C | C | C | C', timeSignature: '4/4' },
            ],
        },
        harmony: {
            ...initial.harmony,
            enabled: true,
            style: 'smart',
            voice: sampled ? 'pack:strings-ensemble' : 'synth',
            octave: 60,
            volume: 0.5,
            complexity: 0.55,
        },
        groove: { ...initial.groove, genreFeel: genre, enabled: false, humanize: 0 },
        chords: { ...initial.chords, enabled: false },
        bass: { ...initial.bass, enabled: false },
        soloist: { ...initial.soloist, enabled: false },
        vizState: { ...initial.vizState, enabled: false },
    };
    validateProgression(state);
    resetHiddenGenerationMemory(state);
    const cursors = {
        mainCursor: { index: 0, sectionIndex: 0 },
        lookaheadCursor: { index: 0, sectionIndex: 0 },
    };
    const events = [];
    let _firstVoices;
    let commonContinuations = 0;
    for (let step = 0; step < state.arranger.totalSteps; step++) {
        const notes = generateNotesForStep(state, step, cursors, {}, null).notes.filter(
            (n) => n.module === 'harmony',
        );
        if (!notes.length) {
            continue;
        }
        events.push({ step, notes });
        state.harmony.buffer.set(step, notes);
        const prior = [...state.harmony.activeVoices];
        scheduleHarmonies(state, {}, step, 0.1 + step * 0.125);
        expect(
            state.harmony.activeVoices.every((v) => (sampled ? !!v.sampleHandle : !!v.gain)),
        ).toBe(true);
        for (const note of notes.filter((n) => n.isLegato)) {
            const before = prior.find((v) => v.midi === note.midi);
            const after = state.harmony.activeVoices.find((v) => v.midi === note.midi);
            expect(before, 'legato fixture must have a sounding common tone').toBeDefined();
            expect(after, 'same source survives the gain change').toBe(before);
            commonContinuations++;
        }
        _firstVoices ??= [...state.harmony.activeVoices];
    }
    expect(events).toHaveLength(4);
    expect(commonContinuations).toBeGreaterThanOrEqual(3);
    const pcm = (await ctx.startRendering()).getChannelData(0);
    expect(Array.from(pcm).every(Number.isFinite)).toBe(true);
    if (sampled) {
        expect(state.harmony.activeVoices).toHaveLength(0);
    }
    const rms = (start, end) => {
        let sum = 0;
        for (let i = Math.floor(start * sampleRate); i < Math.floor(end * sampleRate); i++) {
            sum += pcm[i] * pcm[i];
        }
        return Math.sqrt(sum / ((end - start) * sampleRate));
    };
    return {
        levels: [0, 1, 2, 3].map((bar) => rms(0.1 + bar * 2 + 0.65, 0.1 + bar * 2 + 1.1)),
        tail: rms(9.5, 9.9),
    };
}

test('sample extension preserves an in-flight attack and releases the held voice without a discontinuity', async () => {
    const rate = 24000;
    const ctx = new OfflineAudioContext(1, rate * 2, rate);
    const buffer = ctx.createBuffer(1, rate * 5, rate);
    buffer.getChannelData(0).fill(0.1); // DC isolates the gain envelope's continuity.
    const voice = playSampledNote(ctx, { rootMidi: 60, buffer }, ctx.destination, 60, 0.1, {
        attack: 0.2,
        duration: 0.5,
        release: 0.1,
        velocity: 1,
    });
    expect(voice?.extend(0.2, 1, 1.08)).toBe(true);
    voice?.release(0.7, 0.06);
    const pcm = (await ctx.startRendering()).getChannelData(0);
    expect(pcm[Math.round(0.15 * rate)]).toBeCloseTo(0.025, 3);
    expect(pcm[Math.round(0.2 * rate)]).toBeCloseTo(0.05, 3);
    expect(pcm[Math.round(0.4 * rate)]).toBeCloseTo(0.108, 3);
    expect(Math.abs(pcm[Math.round(0.85 * rate)])).toBeLessThan(0.0001);
    let largestStep = 0;
    for (let i = 1; i < pcm.length; i++) {
        largestStep = Math.max(largestStep, Math.abs(pcm[i] - pcm[i - 1]));
    }
    expect(largestStep).toBeLessThan(0.001);
});

test('panic before a future extension preserves the audible attack up to the stop', async () => {
    const rate = 24000;
    const ctx = new OfflineAudioContext(1, rate, rate);
    const buffer = ctx.createBuffer(1, rate * 5, rate);
    buffer.getChannelData(0).fill(0.1);
    const voice = playSampledNote(ctx, { rootMidi: 60, buffer }, ctx.destination, 60, 0.1, {
        attack: 0.2,
        duration: 0.5,
        velocity: 1,
    });
    expect(voice?.extend(0.25, 0.5, 1.08)).toBe(true);
    voice?.release(0.15, 0.05);
    const pcm = (await ctx.startRendering()).getChannelData(0);
    expect(pcm[Math.round(0.14 * rate)]).toBeCloseTo(0.02, 3);
    expect(pcm[Math.round(0.15 * rate)]).toBeCloseTo(0.025, 3);
    expect(Math.abs(pcm[Math.round(0.28 * rate)])).toBeLessThan(0.0001);
});

for (const genre of ['Rock', 'Acoustic']) {
    for (const intensity of [0.2, 0.55, 0.95]) {
        for (const sampled of [false, true]) {
            test(`${genre} ${intensity} ${sampled ? 'sample' : 'synth'} carries the contour through held common tones to PCM`, async () => {
                const before = await render(genre, intensity, sampled, true);
                const after = await render(genre, intensity, sampled, false);
                const ratios = after.levels.map((level, i) => level / before.levels[i]);
                for (let i = 0; i < 4; i++) {
                    expect(before.levels[i]).toBeGreaterThan(0.0001);
                    expect(ratios[i]).toBeCloseTo([1, 1.04, 1.08, 1][i], 2);
                }
                expect(after.tail).toBeLessThan(0.0001);
                console.log(
                    `PCM contour: ${genre} ${intensity} ${sampled ? 'sample' : 'synth'}: ${ratios.map((n) => n.toFixed(4)).join(' / ')}`,
                );
            });
        }
    }
}
