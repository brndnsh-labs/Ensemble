/**
 * @vitest-environment happy-dom
 *
 * #1064 — the auto-conductor must never write `chords.density` or
 * `harmony.complexity` directly. Both are `document`-owned (persisted,
 * shareable — see `songbook/state-ownership.ts`); the conductor's computed
 * values live only in the runtime-derived `playback.conductorDensity` /
 * `playback.conductorHarmonyComplexity` mirrors, composed at READ time by
 * generation consumers (chords-engine.ts, harmonies.ts).
 *
 * Unlike `tests/unit/engine/conductor.test.ts`, this file does NOT mock
 * `public/state.js` — it drives the REAL dispatch → reducer pipeline so a
 * regression in either the conductor's dispatch shape or the instrument/
 * playback reducers' handling of it would be caught end to end.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { applyConductor, updateAutoConductor } from '../../../public/engine/conductor.js';
import { dispatch, getState } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

describe('#1064 — conductor never overwrites chords.density/harmony.complexity', () => {
    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE, undefined);
    });

    it('leaves the user-authored density/complexity untouched across a full simulated ramp with autoIntensity on', () => {
        const { playback, chords, harmony, conductor } = getState();
        chords.density = 'rich';
        harmony.complexity = 0.2;
        playback.autoIntensity = true;
        playback.isPlaying = true;
        playback.songMode = false;
        playback.complexity = 0.7;

        // Sweep bandIntensity through every density tier (thin <0.4, standard,
        // rich >0.85) — exactly the range that used to overwrite chords.density
        // on every tick.
        for (const intensity of [0.1, 0.3, 0.5, 0.7, 0.9, 0.95, 0.2, 0.6]) {
            playback.bandIntensity = intensity;
            applyConductor(getState(), dispatch);
        }

        // Also drive the actual per-step live entrypoint (updateAutoConductor),
        // which internally re-invokes applyConductor every tick while a ramp is
        // in flight — the real call site during playback.
        conductor.targetIntensity = 0.9;
        for (let i = 0; i < 50; i++) {
            updateAutoConductor(getState(), dispatch);
        }

        expect(chords.density).toBe('rich');
        expect(harmony.complexity).toBe(0.2);

        // Confirm the split actually works — the conductor's OWN runtime
        // mirrors DID move, proving this is a real ownership split and not a
        // silent no-op that also stopped the conductor from doing anything.
        expect(playback.conductorDensity).not.toBeNull();
        expect(playback.conductorHarmonyComplexity).not.toBeNull();
    });

    it('still floors harmony complexity toward song-ending build via the runtime mirror only', () => {
        const { playback, harmony } = getState();
        harmony.complexity = 0.1;
        playback.songMode = true;
        playback.isEndingPending = true;
        playback.complexity = 0.1;

        applyConductor(getState(), dispatch);

        expect(harmony.complexity).toBe(0.1); // document field untouched
        expect(playback.conductorHarmonyComplexity).toBeGreaterThanOrEqual(0.85); // runtime mirror floored
    });
});
