import { afterEach, describe, expect, it, vi } from 'vitest';
import { GENRE_NAMES } from '../../public/data/smart-genres.js';
import { getBandPocket } from '../../public/engine/coordination-engine.js';
import {
    getSoloistNotePhraseFirst,
    SOLOIST_VELOCITY_ENVELOPE,
} from '../../public/engine/soloist-phrase-first.js';
import { reserveSoloistHeadroom } from '../../public/engine/velocity-shaping.js';
import { getChordAtStep } from '../../public/engine/worker-utils.js';
import { makeChord } from '../utils/chord-fixture.js';
import { buildDynamicsState, performDynamics } from '../utils/soloist-dynamics.js';

// Identity reproduces the shipped pre-envelope base, including its primary and
// secondary clamps. No production A/B switch or alternate generator is needed.
vi.mock('../../public/engine/velocity-shaping.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../public/engine/velocity-shaping.js')>();
    return { ...actual, reserveSoloistHeadroom: vi.fn(actual.reserveSoloistHeadroom) };
});
const original = (
    await vi.importActual<typeof import('../../public/engine/velocity-shaping.js')>(
        '../../public/engine/velocity-shaping.js',
    )
).reserveSoloistHeadroom;

afterEach(() => {
    vi.mocked(reserveSoloistHeadroom).mockImplementation(original);
    vi.mocked(reserveSoloistHeadroom).mockClear();
    SOLOIST_VELOCITY_ENVELOPE.enabled = true;
});

it('reserves the complete authored envelope and secondary range without losing base progression', () => {
    for (const accent of [1, 1.05]) {
        let previous = 0;
        for (let i = 0; i <= 1170; i++) {
            const base = i / 1000;
            const shaped = reserveSoloistHeadroom(base, accent);
            expect(shaped).toBeGreaterThanOrEqual(0);
            // Independent musical bounds: all the primary/apex and Country snap
            // factors must fit together; the secondary doesn't lose its accent.
            expect(shaped * 1.15 * accent).toBeLessThanOrEqual(1 + 1e-12);
            if (base <= 0.65) {
                expect(shaped).toBe(base);
            }
            if (i > 0) {
                expect(shaped - previous).toBeGreaterThanOrEqual(0.001 / 3 - 1e-12);
            }
            previous = shaped;
        }
    }
    expect(reserveSoloistHeadroom(1.05, 1.05) * 1.06 * 1.05 * 1.1).toBeLessThan(1);
});

it('keeps the authored metric lean, pickup and release ratios at saturated activity', () => {
    const state = buildDynamicsState();
    state.playback.currentLoopCount = 8;
    state.playback.bandIntensity = 1;
    state.soloist.session.seed = {
        ...state.soloist.session.seed!,
        loopLengthSteps: 64,
        notes: [0, 32, 33, 36, 39].map((step) => ({
            step,
            midi: step === 0 ? 84 : 67,
            velocity: 0.9,
            durationSteps: 1,
            isAnchor: true,
        })),
    };
    for (const [step, ratio] of [
        [0, 1.15],
        [32, 1.06],
        [33, 0.91],
        [36, 1],
        [39, 1.06],
    ]) {
        const velocities = [true, false].map((enabled) => {
            SOLOIST_VELOCITY_ENVELOPE.enabled = enabled;
            const result = getSoloistNotePhraseFirst(
                state,
                makeChord(),
                null,
                step,
                null,
                72,
                'smart',
                step % 16,
            );
            expect(result).not.toBeNull();
            return (Array.isArray(result) ? result.at(-1) : result).velocity;
        });
        expect(velocities[0] / velocities[1], `envelope at step ${step}`).toBeCloseTo(ratio, 10);
    }
});

describe.each(GENRE_NAMES)('High-energy phrase headroom (#1135) - %s', (genre) => {
    it('retains the full apex envelope, secondary balance and every non-velocity event', () => {
        const state = buildDynamicsState(genre);
        expect(state.soloist.session.seed!.notes.every((note) => note.velocity <= 0.9)).toBe(true);
        const stripVelocity = (trace: ReturnType<typeof performDynamics>) =>
            trace.map((tick) => ({
                ...tick,
                notes: tick.notes.map(({ velocity: _velocity, ...note }) => note),
            }));
        const means: number[] = [];
        const shippedMeans: number[] = [];
        let secondaries = 0;
        for (const intensity of [0.3, 0.6, 1]) {
            vi.mocked(reserveSoloistHeadroom).mockImplementation(original);
            SOLOIST_VELOCITY_ENVELOPE.enabled = true;
            const shaped = performDynamics(state, intensity);
            const notes = shaped.flatMap((tick) => tick.notes);
            means.push(notes.reduce((sum, note) => sum + note.velocity, 0) / notes.length);
            expect(notes.length).toBeGreaterThan(100);
            expect(shaped.some((tick) => tick.notes.length === 0)).toBe(true);
            expect(notes.every((note) => note.velocity > 0 && note.velocity <= 1)).toBe(true);
            for (const tick of shaped) {
                if (tick.notes.length < 2) {
                    continue;
                }
                secondaries++;
                const [secondary, lead] = tick.notes;
                const ratio =
                    genre === 'Country' ? (secondary.bendStartInterval === -1 ? 1.1 : 1.05) : 0.9;
                expect(secondary.velocity / lead.velocity).toBeCloseTo(ratio, 10);
            }
            vi.mocked(reserveSoloistHeadroom).mockImplementation((base) => base);
            const shipped = performDynamics(state, intensity);
            const shippedNotes = shipped.flatMap((tick) => tick.notes);
            shippedMeans.push(
                shippedNotes.reduce((sum, note) => sum + note.velocity, 0) / shippedNotes.length,
            );
            expect(stripVelocity(shaped)).toEqual(stripVelocity(shipped));
            if (intensity !== 1) {
                continue;
            }

            // Compare each development window's authored highest note with ITSELF
            // envelope-off, not an unrelated runner-up with a different seed accent.
            vi.mocked(reserveSoloistHeadroom).mockImplementation(original);
            SOLOIST_VELOCITY_ENVELOPE.enabled = false;
            const off = performDynamics(state, intensity);
            expect(stripVelocity(off)).toEqual(stripVelocity(shaped));
            const seed = state.soloist.session.seed!;
            const windows = new Map<number, { step: number; midi: number }>();
            for (const note of seed.notes) {
                if (note.step < 0) {
                    continue;
                }
                const window = Math.floor(note.step / 192); // this fixture is a 64-step chart
                if (!windows.has(window) || note.midi > windows.get(window)!.midi) {
                    windows.set(window, note);
                }
            }
            let recovered = 0;
            for (const { step } of windows.values()) {
                // The second full seed pass is unambiguously beyond the entrance ramp.
                const index = step + seed.loopLengthSteps;
                const onLead = shaped[index].notes.at(-1);
                const offLead = off[index].notes.at(-1);
                if (!onLead || !offLead) {
                    continue;
                }
                expect(onLead.velocity / offLead.velocity).toBeCloseTo(1.15, 10);
                // 15% is the authored crest, not a tuned epsilon floor. At a
                // formerly clipped apex it must contribute >.1 velocity again.
                if (shipped[index].notes.at(-1)!.velocity === 1) {
                    expect(onLead.velocity - offLead.velocity).toBeGreaterThan(0.1);
                    recovered++;
                }
            }
            expect(recovered).toBeGreaterThanOrEqual(3);
            console.log(
                `[#1135 ${genre}] recovered apices=${recovered}; mean velocity low/mid/high=${means.map((v) => v.toFixed(4)).join('/')}`,
            );
        }
        expect(means[1]).toBeGreaterThan(means[0] + 0.01);
        expect(means[2]).toBeGreaterThan(means[1] + 0.01);
        expect(secondaries).toBeGreaterThan(0);
        console.log(
            `[#1135 ${genre}] shipped/shaped means: ${JSON.stringify({ shippedMeans, means })}`,
        );
    });
});

// These UI labels differ from their runtime feel keys. Keep the production
// microtiming context while retaining the velocity-only comparisons above.
it.each([
    ['Bossa', 'Bossa Nova', -0.003],
    ['Ska-Punk', 'Ska', -0.004],
] as const)('%s dynamics fixture retains its runtime pocket', (genre, feel, pocket) => {
    const state = buildDynamicsState(genre);
    expect(state.groove.genreFeel).toBe(feel);
    expect(getBandPocket(state.groove.genreFeel)).toBe(pocket);
    const seed = state.soloist.session.seed!;
    const authored = seed.notes.find((note) => note.step >= 0)!;
    const position = getChordAtStep(authored.step, state.arranger, { index: 0, sectionIndex: 0 })!;
    const result = getSoloistNotePhraseFirst(
        state,
        position.chord,
        null,
        authored.step,
        null,
        state.soloist.octave,
        'smart',
        authored.step % 16,
        { sectionStart: position.sectionStart, sectionEnd: position.sectionEnd },
    );
    const lead = Array.isArray(result) ? result.at(-1) : result;
    expect(lead).toBeTruthy();
    expect(lead!.timingOffset).toBeCloseTo(
        (authored.timingOffset ?? 0) + getBandPocket(feel, position.chord.sectionLabel),
        10,
    );
});
