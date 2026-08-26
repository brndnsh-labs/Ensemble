// @ts-nocheck
/**
 * @vitest-environment happy-dom
 *
 * #1259 — `RESET_STATE` must be a complete inverse of the persisted session.
 *
 * `hydrateState()` wraps `hydrateSavedState()` in a try/catch that dispatches
 * `RESET_STATE` to recover from a corrupt payload (#1244). That fallback's promise —
 * "starting fresh" — is only as strong as `RESET_STATE` itself, and it wasn't:
 * eight fields across six slices survived it and two slices had no case at all.
 *
 * **This guard is the deliverable, not the eight fixes.** Any future field added to
 * the persisted payload without a matching `RESET_STATE` line silently reopens the
 * class, and nothing else in the suite would notice.
 *
 * ## Why it is written this way
 *
 * The key list is **derived, never hand-maintained**: `saveCurrentState()`'s `data`
 * literal is the canonical round-trip manifest, so the test reads the manifest back
 * out of storage and compares whole snapshots. A newly persisted field therefore
 * enters this test's scope the moment it's added to `persistence.ts` — no one has to
 * remember to list it here.
 *
 * The loop is closed from both ends:
 *
 *  - `poisons every persisted key` fails if a new field can't be perturbed (no owner
 *    mapping, or a derived shape like `pattern`). Without it, the invariant assertion
 *    below would pass *vacuously* for that field — poisoned and fresh would be
 *    trivially equal because the poison never landed.
 *  - `restores every persisted key` fails if `RESET_STATE` doesn't undo the poison.
 *
 * Neither test alone is sufficient, which is why both are here.
 *
 * Deliberately scoped to what hydration actually writes: `midi.outputs` / `midi.inputs`
 * are a mirror of live hardware enumeration, are not persisted, and so are absent from
 * the manifest and out of scope by construction. See the `RESET_STATE` case in
 * `state/midi.ts` for why resetting them would be a desync rather than a reset.
 *
 * ## What this does NOT check
 *
 * The baseline is the post-`RESET_STATE` manifest, so this proves a reset is *complete*,
 * not that its values are *correct*: a case that reset `bpm` to 999 would define 999 as
 * "fresh" and pass here. Representative default values are asserted in the per-slice
 * reducer tests (`playback-reducer.test.ts`, `arranger-reducer.test.ts`,
 * `midi-reducer.test.ts`, `visualizer-reducer.test.ts`) — that split is intentional, but
 * don't read a green run here as "the defaults are right".
 *
 * "The persisted session" also excludes transport transients. `persistence.ts` writes
 * `bpm` as `rampBpmTarget > 0 ? rampBpmTarget : bpm`, and `RESET_STATE` deliberately does
 * not clear `rampBpmTarget` (see the note in `playback-reducer.test.ts`) — so one persisted
 * key has an input outside the inverse. Moot in production, where a reset only ever runs at
 * boot with the target at 0, and the tripwire below would catch it if it ever mattered: a
 * non-zero target makes `poisoned['bpm'] === fresh['bpm']`.
 *
 * It also only covers the persist→reset direction. The sibling invariant — every
 * persisted key is actually *read back* by `hydrateSavedState()` — is not enforced here;
 * diffing the two by hand is what turned up `midi.harmonyOctave` being saved on every
 * write and silently dropped on every load (fixed in #1259, pinned by the
 * `persisted MIDI config round-trips (#1259)` block in
 * `tests/unit/security/hydration-security.test.ts`). A generic guard for that direction needs a
 * documented allowlist for the keys hydration deliberately ignores (`metronome` and
 * `autoIntensity` are hardcoded fresh on every boot), which is why it isn't folded in.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { saveCurrentState } from '../../../public/state/persistence.js';
import { dispatch, getState, storage } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

/** manifest key → [slice, field] for the manifest's flat top-level block. */
const FLAT_KEY_OWNERS: Record<string, [string, string]> = {
    sections: ['arranger', 'sections'],
    key: ['arranger', 'key'],
    timeSignature: ['arranger', 'timeSignature'],
    grouping: ['arranger', 'grouping'],
    isMinor: ['arranger', 'isMinor'],
    notation: ['arranger', 'notation'],
    lastChordPreset: ['arranger', 'lastChordPreset'],
    seed: ['arranger', 'seed'],
    randomizeSeed: ['arranger', 'randomizeSeed'],
    palette: ['playback', 'palette'],
    mode: ['playback', 'mode'],
    bpm: ['playback', 'bpm'],
    complexity: ['playback', 'complexity'],
    metronome: ['playback', 'metronome'],
    visualFlash: ['playback', 'visualFlash'],
    qualityColors: ['playback', 'qualityColors'],
    countIn: ['playback', 'countIn'],
    applyPresetSettings: ['playback', 'applyPresetSettings'],
    sessionTimer: ['playback', 'sessionTimer'],
    songMode: ['playback', 'songMode'],
    autoIntensity: ['playback', 'autoIntensity'],
    practiceMode: ['playback', 'practiceMode'],
    masterVolume: ['playback', 'masterVolume'],
    vizEnabled: ['vizState', 'enabled'],
};

/** Manifest blocks that map 1:1 onto the slice of the same name. */
const NESTED_SLICES = ['chords', 'bass', 'soloist', 'harmony', 'groove', 'midi'];

/**
 * Persisted keys that are not user state and so cannot be perturbed.
 *
 * `mixerVersion` is the `MIXER_SETTINGS_VERSION` constant — a schema stamp read on
 * hydration to decide whether to discard saved mixer values. It has no slice field
 * behind it, so there is nothing to poison and nothing for a reset to restore.
 */
const NOT_USER_STATE = new Set(['mixerVersion']);

/**
 * Captures the payload `saveCurrentState()` writes.
 *
 * Spies on `storage.save` rather than round-tripping through `localStorage`: the
 * suite runs `environment: 'node'` by default and even the `happy-dom` docblock leaves
 * `localStorage` undefined here, so `storage.save` silently no-ops and `storage.get`
 * returns `[]` — which made an earlier draft of this file pass completely vacuously.
 * The spy also gives us the `data` literal itself, which is the thing under test.
 *
 * The JSON round-trip is deliberate: it reproduces what actually reaches storage
 * (dropping `undefined`, `Map`s and other non-serializable values), so the snapshot
 * compares persisted reality rather than live object graphs.
 */
function manifest(): Record<string, any> {
    const saveSpy = vi.spyOn(storage, 'save');
    saveSpy.mockClear();
    saveCurrentState();
    const call = saveSpy.mock.calls.at(-1);
    if (!call) {
        throw new Error('saveCurrentState() did not call storage.save');
    }
    const raw = call[1] as Record<string, any>;
    const serialized = JSON.parse(JSON.stringify(raw));
    assertNoKeysDropped(raw, serialized);
    return serialized;
}

/**
 * Fails if the JSON round-trip silently dropped a key.
 *
 * `JSON.stringify` omits `undefined`-valued keys entirely, and both `poison()` and
 * `flatten()` iterate the *parsed* object — so a dropped key is invisible to both
 * tripwires at once, and the field falls quietly outside this guard. That is exactly the
 * "reopens the class without anyone noticing" case the file exists to prevent, and it is
 * reachable: `ChordState.instrument` is declared optional and persisted, and only stays
 * in scope because `RESET_STATE` happens to assign it.
 *
 * Checked to the same depth `flatten()` compares — top level plus each slice block.
 */
function assertNoKeysDropped(raw: Record<string, any>, serialized: Record<string, any>): void {
    const dropped = Object.keys(raw).filter((key) => !(key in serialized));
    for (const key of NESTED_SLICES) {
        if (raw[key] && typeof raw[key] === 'object' && serialized[key]) {
            dropped.push(
                ...Object.keys(raw[key])
                    .filter((sub) => !(sub in serialized[key]))
                    .map((sub) => `${key}.${sub}`),
            );
        }
    }
    if (dropped.length > 0) {
        throw new Error(
            `Persisted keys dropped by JSON serialization (undefined values?): ${dropped.join(', ')}. ` +
                'They are outside this guard until they hold a serializable value.',
        );
    }
}

/**
 * One flat `path -> JSON` map per snapshot, so a failure names the exact field
 * rather than dumping two ~85-key objects at each other.
 */
function flatten(payload: Record<string, any>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(payload)) {
        if (NESTED_SLICES.includes(key) && value && typeof value === 'object') {
            for (const [sub, subValue] of Object.entries(value)) {
                out[`${key}.${sub}`] = JSON.stringify(subValue);
            }
        } else {
            out[key] = JSON.stringify(value);
        }
    }
    return out;
}

/**
 * Produces a value guaranteed to differ from `value`.
 *
 * `+ 7` rather than a fixed constant so no field can accidentally be "poisoned" to
 * the default it already holds — every numeric default in the manifest is its own
 * value, and none equals itself plus seven.
 */
function perturb(value: unknown, path: string): unknown {
    if (typeof value === 'boolean') {
        return !value;
    }
    if (typeof value === 'number') {
        return value + 7;
    }
    if (typeof value === 'string') {
        return `${value}~poisoned`;
    }
    if (Array.isArray(value)) {
        return [{ poisoned: path }];
    }
    // Covers null (`selectedOutputId`, `selectedInputId`) and plain objects
    // (`sectionSeedMap`) alike — both want a distinguishable non-default.
    return value === null ? `poisoned:${path}` : { poisoned: path };
}

/**
 * Perturbs every field behind every key in `fresh`, writing directly through the
 * slices — this is a persistence/reset round-trip, so hydration's validators are not
 * in the loop and the poison values only have to *differ*, not be valid.
 *
 * Returns the manifest paths it could not reach, which the tripwire test asserts is
 * empty. Direct slice writes are correct here: the point is to simulate arbitrary
 * pre-existing state, and routing through reducers would launder it.
 */
function poison(fresh: Record<string, any>): string[] {
    const state = getState() as Record<string, any>;
    const unreached: string[] = [];

    for (const [key, value] of Object.entries(fresh)) {
        if (NOT_USER_STATE.has(key)) {
            continue;
        }

        if (NESTED_SLICES.includes(key) && value && typeof value === 'object') {
            for (const [sub, subValue] of Object.entries(value)) {
                // `pattern` is derived from `groove.instruments`, not a `groove.pattern`
                // field — poison the lanes it is built from. `RESET_STATE` blanks them
                // with `inst.steps.fill(0)`.
                if (key === 'groove' && sub === 'pattern') {
                    for (const inst of state.groove.instruments) {
                        inst.steps[0] = 9;
                    }
                    continue;
                }
                if (!(sub in state[key])) {
                    unreached.push(`${key}.${sub}`);
                    continue;
                }
                state[key][sub] = perturb(subValue, `${key}.${sub}`);
            }
            continue;
        }

        const owner = FLAT_KEY_OWNERS[key];
        if (!owner) {
            unreached.push(key);
            continue;
        }
        const [slice, field] = owner;
        state[slice][field] = perturb(value, key);
    }

    return unreached;
}

let fresh: Record<string, string>;
let poisoned: Record<string, string>;
let afterReset: Record<string, string>;
let unreached: string[];

beforeAll(() => {
    // A reset IS the definition of "a fresh session", so the post-reset manifest is
    // the baseline — not the slices' declared literals, which a reset case is free to
    // legitimately diverge from.
    dispatch(ACTIONS.RESET_STATE);
    const freshPayload = manifest();
    fresh = flatten(freshPayload);

    unreached = poison(freshPayload);
    poisoned = flatten(manifest());

    dispatch(ACTIONS.RESET_STATE);
    afterReset = flatten(manifest());
});

// This file poisons the real, shared slices, so it would be a textbook ordering-leak
// source. Two things make it safe, and both are deliberate: `isolate` defaults to true
// so each file gets its own module registry, AND the last state mutation above is a full
// `RESET_STATE` — which, if this file's own assertions pass, provably leaves every
// persisted field at its fresh value. The spy is restored for the same reason.
afterAll(() => {
    vi.restoreAllMocks();
});

describe('#1259 RESET_STATE is a complete inverse of the persisted session', () => {
    // The load-bearing precondition. An empty manifest makes *every* other assertion in
    // this file pass trivially — `unreached` is empty, `untouched` is empty, and two
    // empty snapshots are equal. An earlier draft read the payload back through
    // `localStorage`, which is undefined here, and reported all-green while testing
    // nothing. Assert the manifest is real before trusting anything derived from it.
    it('derives a populated manifest covering every persisted slice', () => {
        // Asserted as an exact key set rather than a count floor: a floor loose enough not
        // to break on every legitimately-added field is also loose enough to hide three
        // whole slices going missing. `FLAT_KEY_OWNERS` is the list this file already
        // maintains, so checking against it is tight *and* survives new fields.
        expect(Object.keys(FLAT_KEY_OWNERS).filter((key) => !(key in fresh))).toEqual([]);
        for (const slice of NESTED_SLICES) {
            expect(
                Object.keys(fresh).filter((path) => path.startsWith(`${slice}.`)).length,
            ).toBeGreaterThan(4);
        }
    });

    it('poisons every persisted key — otherwise the guard below is vacuous', () => {
        expect(unreached).toEqual([]);

        const untouched = Object.keys(fresh).filter(
            (path) => !NOT_USER_STATE.has(path) && poisoned[path] === fresh[path],
        );
        expect(untouched).toEqual([]);
    });

    it('restores every persisted key', () => {
        expect(afterReset).toEqual(fresh);
    });

    // The eight originally-surviving fields, named individually. The snapshot
    // comparison above already covers them, but a regression there reports as one
    // opaque diff — these keep the specific defects legible, and `midi` stands for
    // the whole slice, which had no case at all.
    it.each([
        ['lastChordPreset'],
        ['randomizeSeed'],
        ['practiceMode'],
        ['songMode'],
        ['masterVolume'],
        ['chords.style'],
        ['soloist.autoMode'],
        ['vizEnabled'],
        ['midi.chordsChannel'],
        ['midi.harmonyOctave'],
    ])('restores %s specifically', (path) => {
        expect(poisoned[path]).not.toBe(fresh[path]);
        expect(afterReset[path]).toBe(fresh[path]);
    });
});
