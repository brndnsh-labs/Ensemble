import { describe, expect, it } from 'vitest';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

/**
 * Epic 12 S3 — Profile-rotation sticky-retain.
 *
 * Before S3, `soloist.ts` re-rolled `currentPhrase.context.profile` at every
 * section boundary with `scrambleHash(...) < 0.8`, sampling the genre's full
 * `INFLUENCE_POOLS` entry. A user who picked "Bill Evans" got it for ~1 section
 * before the engine swapped to a random pool entry — UX bug.
 *
 * After S3, when `soloist.pinnedProfile` is non-null AND is present in the
 * active genre's pool, the rotation site short-circuits and writes the pinned
 * profile on every boundary (100% retain by construction). When `pinnedProfile`
 * is null, the legacy 80% auto-rotation behavior is preserved.
 *
 * The acceptance number is ≥90% retain rate when pinned. This test runs the
 * engine through many real section boundaries (every 4 bars × 16 steps =
 * every 64 steps) for both pinned and unpinned configurations, and asserts:
 *
 *   1. Pinned-evans on jazz → retain rate is ≥0.95 (in fact, by construction,
 *      it's 1.0 — pool-resident pins are deterministic).
 *   2. Unpinned (null) → retain rate is statistically distinct from pinned and
 *      noticeably lower (auto-rotation is alive and well; the gate didn't
 *      collapse into a constant-profile bug).
 *   3. Off-pool pin (e.g. 'evans' on a blues pool that doesn't list evans)
 *      falls back to auto-rotation rather than forcing the pinned string —
 *      retain rate behaves like the unpinned baseline.
 */

const NUM_BARS = 64; // 64 bars × 16 steps = 1024 steps; section every 4 bars
const STEPS_PER_BAR = 16;
const STEPS_PER_SECTION = STEPS_PER_BAR * 4; // 64 steps

const Dm7 = { rootMidi: 62, intervals: [0, 3, 7, 10] };
const G7 = { rootMidi: 67, intervals: [0, 4, 7, 10] };
const Cmaj7 = { rootMidi: 60, intervals: [0, 4, 7, 11] };
const JAZZ_PROGRESSION = [Dm7, G7, Cmaj7, Cmaj7];

// Blues progression — the 'blues' pool is ['srv', 'monk', 'armstrong', 'miles'],
// which doesn't include 'evans'. Used to exercise the off-pool fallback path.
const C7 = { rootMidi: 60, intervals: [0, 4, 7, 10] };
const F7 = { rootMidi: 65, intervals: [0, 4, 7, 10] };
const G7Blues = { rootMidi: 67, intervals: [0, 4, 7, 10] };
const BLUES_PROGRESSION = [C7, C7, F7, G7Blues];

interface BoundaryObservation {
    step: number;
    profile: string | null;
}

/**
 * Runs the soloist for NUM_BARS bars, calling getSoloistNote() on every step.
 * Records the value of `currentPhrase.context.profile` immediately after each
 * call at a section boundary (step 0, 64, 128, ...). Returns one observation
 * per boundary.
 */
function runAndObserveBoundaries(opts: {
    style: string;
    genreFeel: string;
    pinnedProfile: string | null;
    progression: Array<{ rootMidi: number; intervals: number[] }>;
}): BoundaryObservation[] {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: opts.genreFeel, enabled: true });
    dispatch(ACTIONS.UPDATE_SB, {
        enabled: true,
        style: opts.style,
        pinnedProfile: opts.pinnedProfile,
    });

    const observations: BoundaryObservation[] = [];
    let lastFreq = 440;

    for (let bar = 0; bar < NUM_BARS; bar++) {
        const chord = opts.progression[bar % opts.progression.length];
        for (let s = 0; s < STEPS_PER_BAR; s++) {
            const step = bar * STEPS_PER_BAR + s;
            const sectionStart = Math.floor(step / STEPS_PER_SECTION) * STEPS_PER_SECTION;
            const sectionEnd = sectionStart + STEPS_PER_SECTION;
            const isBoundary = step === sectionStart;

            const note = getSoloistNote(
                getState(),
                chord as never,
                null,
                step,
                lastFreq,
                0,
                opts.style,
                s,
                { sectionStart, sectionEnd },
                { mStep: s } as never,
            );

            if (note) {
                const results = Array.isArray(note) ? note : [note];
                lastFreq = results[results.length - 1].frequency || lastFreq;
            }

            if (isBoundary) {
                // Capture the profile that the rotation site just wrote (or
                // left alone). This is what downstream Greats logic reads
                // for the section that begins at `step`.
                const state = getState();
                observations.push({
                    step,
                    profile: state.soloist.session.currentPhrase.context.profile ?? null,
                });
            }
        }
    }
    return observations;
}

function retainRate(obs: BoundaryObservation[], targetProfile: string): number {
    if (obs.length === 0) {
        return 0;
    }
    const hits = obs.filter((o) => o.profile === targetProfile).length;
    return hits / obs.length;
}

function distinctCount(obs: BoundaryObservation[]): number {
    return new Set(obs.map((o) => o.profile)).size;
}

describe('Soloist profile-rotation sticky-retain (Epic 12 S3)', () => {
    it('pinned profile survives ≥95% of jazz section boundaries', () => {
        const obs = runAndObserveBoundaries({
            style: 'jazz',
            genreFeel: 'Jazz',
            pinnedProfile: 'evans',
            progression: JAZZ_PROGRESSION,
        });
        const retain = retainRate(obs, 'evans');

        console.log(
            '\n--- SOLOIST PROFILE-PIN RETAIN (Epic 12 S3) ---\n' +
                `[Boundaries observed]   ${obs.length}\n` +
                `[Pinned profile]        evans\n` +
                `[Retain rate]           ${(retain * 100).toFixed(1)}% (target: ≥95%)\n` +
                `[Distinct profiles]     ${distinctCount(obs)}\n` +
                '-----------------------------------------------\n',
        );

        // Acceptance: ≥90% (story target). Construction guarantees 100% for an
        // in-pool pin, so 0.95 leaves no headroom for spurious flake yet still
        // catches any regression where the gate leaks an auto-rotation through.
        expect(retain).toBeGreaterThanOrEqual(0.95);
    });

    it('unpinned (null) auto-rotation still produces a meaningfully diverse profile mix', () => {
        const obs = runAndObserveBoundaries({
            style: 'jazz',
            genreFeel: 'Jazz',
            pinnedProfile: null,
            progression: JAZZ_PROGRESSION,
        });
        // The jazz pool is ['bird', 'evans', 'coltrane', 'miles'] (4 entries).
        // With the legacy 80% rotation gate fired on EVERY boundary, every
        // boundary independently re-rolls a pool index; a constant-profile
        // collapse would show as `distinctCount === 1`. We assert ≥2 distinct
        // profiles across the run — the bar that proves auto-rotation is
        // alive and statistically distinct from the pinned path above.
        const distinct = distinctCount(obs);
        // Whichever profile happens to dominate, no single one should run
        // away with the whole sequence — that would mean the rotation
        // collapsed (or accidentally inherited a pin from a prior test).
        const evansRate = retainRate(obs, 'evans');

        console.log(
            '\n--- SOLOIST AUTO-ROTATION DIVERSITY (Epic 12 S3 / negative control) ---\n' +
                `[Boundaries observed]   ${obs.length}\n` +
                `[Distinct profiles]     ${distinct} (target: ≥2)\n` +
                `[Evans share]           ${(evansRate * 100).toFixed(1)}% (target: <90%)\n` +
                '------------------------------------------------------------------------\n',
        );

        expect(distinct).toBeGreaterThanOrEqual(2);
        // The pinned path runs at 95%+; the unpinned path must run below that
        // for any single profile, otherwise the "pinned vs unpinned" signal
        // doesn't actually separate.
        expect(evansRate).toBeLessThan(0.9);
    });

    it('off-pool pin (evans on blues) falls back to auto-rotation', () => {
        const obs = runAndObserveBoundaries({
            style: 'blues',
            genreFeel: 'Blues',
            pinnedProfile: 'evans', // not in the blues pool
            progression: BLUES_PROGRESSION,
        });
        const evansRate = retainRate(obs, 'evans');
        const distinct = distinctCount(obs);

        console.log(
            '\n--- SOLOIST OFF-POOL PIN FALLBACK (Epic 12 S3) ---\n' +
                `[Boundaries observed]   ${obs.length}\n` +
                `[Evans share]           ${(evansRate * 100).toFixed(1)}% (target: <30%)\n` +
                `[Distinct profiles]     ${distinct} (target: ≥2)\n` +
                '---------------------------------------------------\n',
        );

        // 'evans' is NOT in the blues pool. The fallback path rotates
        // through actual pool members only, so the auto-rotation branch
        // cannot write 'evans'. The only way evans could appear is if
        // the off-pool detection broke and the pin was honored anyway.
        // Healthy run: 0%. Broken run: 100%. The 0.3 threshold just has
        // to land between, well clear of both.
        expect(evansRate).toBeLessThan(0.3);
        expect(distinct).toBeGreaterThanOrEqual(2);
    });

    it('no-pool pin (evans on reggae) is honored since there is no auto-rotation to fall back to', () => {
        // 'reggae' has no INFLUENCE_POOLS entry. Pre-S3 (and the initial
        // S3 implementation) treated this as a complete no-op, silently
        // dropping the pin. The patched behavior honors the pin so the
        // user's intent is observable.
        const obs = runAndObserveBoundaries({
            style: 'reggae',
            genreFeel: 'Reggae',
            pinnedProfile: 'evans',
            progression: JAZZ_PROGRESSION,
        });
        const retain = retainRate(obs, 'evans');

        console.log(
            '\n--- SOLOIST NO-POOL PIN RETAIN (Epic 12 S3 patch) ---\n' +
                `[Boundaries observed]   ${obs.length}\n` +
                `[Pinned profile]        evans (on no-pool style 'reggae')\n` +
                `[Retain rate]           ${(retain * 100).toFixed(1)}% (target: ≥95%)\n` +
                '------------------------------------------------------\n',
        );

        expect(retain).toBeGreaterThanOrEqual(0.95);
    });
});
