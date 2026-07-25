// @ts-nocheck
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../../public/config.js';
import { hydrateState } from '../../../public/state/state-hydration.js';
import * as stateModule from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Consolidated State and Storage Mock
vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: { bpm: 100, bandIntensity: 0.5, complexity: 0.3 },
        arranger: { sections: [], key: 'C', timeSignature: '4/4', notation: 'roman' },
        groove: {
            enabled: true,
            measures: 1,
            volume: 0.5,
            reverb: 0.2,
            swing: 0,
            humanize: 20,
            instruments: [],
        },
        chords: { enabled: true, volume: 0.5, reverb: 0.3 },
        bass: { enabled: true, volume: 0.5, reverb: 0.05 },
        soloist: makeSoloistMock({ enabled: false, volume: 0.5, reverb: 0.6 }),
        harmony: { enabled: false, volume: 0.4, reverb: 0.4 },
        vizState: { enabled: false },
        midi: { enabled: false },
    };

    const storage = {
        get: vi.fn((key) => {
            const item = localStorage.getItem(`ensemble_${key}`);
            if (!item) {
                return [];
            }
            try {
                return JSON.parse(item);
            } catch (_e) {
                return [];
            }
        }),
        save: vi.fn(),
    };

    return {
        stateMap: mockState,
        getState: () => mockState,
        dispatch: vi.fn(),
        storage,
        arranger: mockState.arranger,
        playback: mockState.playback,
        groove: mockState.groove,
        bass: mockState.bass,
        soloist: mockState.soloist,
    };
});

vi.mock('../../../public/controllers/app-controller.js', () => ({
    applyTheme: vi.fn(),
}));

vi.mock('../../../public/controllers/midi-controller.js', () => ({
    initMIDI: vi.fn(),
}));

describe('Security: Hydration & Storage Resilience', () => {
    const mockStorage = (() => {
        let store = {};
        return {
            getItem: (key) => store[key] || null,
            setItem: (key, value) => {
                store[key] = value.toString();
            },
            removeItem: (key) => {
                delete store[key];
            },
            clear: () => {
                store = {};
            },
            get length() {
                return Object.keys(store).length;
            },
            key: (i) => Object.keys(store)[i] || null,
        };
    })();

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup localStorage mock using Vitest stubbing
        vi.stubGlobal('localStorage', mockStorage);
        mockStorage.clear();

        // Reset state defaults
        const state = stateModule.getState();
        state.arranger.sections = [];
        state.arranger.key = 'C';
        state.arranger.timeSignature = '4/4';
        state.arranger.notation = 'roman';
        state.playback.bpm = 100;
        state.playback.bandIntensity = 0.5;
        state.playback.complexity = 0.3;
        state.groove.measures = 1;
        state.groove.volume = 0.5;
        state.groove.swing = 0;
        state.groove.humanize = 20;
        state.bass.volume = 0.5;
        state.soloist.reverb = 0.6;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('State Hydration Validation & Clamping', () => {
        it('should clamp invalid numeric values from storage', () => {
            const maliciousState = {
                sections: [{ id: '1', label: 'A', value: 'I' }],
                bpm: 99999,
                bandIntensity: 100,
                complexity: -5,
                chords: {
                    volume: 999,
                    reverb: 9,
                },
                bass: {
                    volume: 2,
                    reverb: 8,
                },
                soloist: makeSoloistMock({ reverb: 5.5 }),
                harmony: { reverb: 7 },
                groove: {
                    genreFeel: 'MaliciousScript',
                    measures: 1000,
                    volume: 999,
                    reverb: -10,
                },
                notation: 'literal',
            };

            // Use setItem to trigger the functional mock we wrote above
            localStorage.setItem('ensemble_currentState', JSON.stringify(maliciousState));
            hydrateState();

            const state = stateModule.getState();

            // Notation check
            expect(state.arranger.notation).not.toBe('literal');
            expect(['roman', 'name', 'nns']).toContain(state.arranger.notation);

            // Playback clamping
            expect(state.playback.bpm).toBeLessThanOrEqual(300);
            expect(state.playback.bandIntensity).toBeLessThanOrEqual(1);
            expect(state.playback.complexity).toBeGreaterThanOrEqual(0);

            // Mixer defaults and clamping
            expect(state.groove.measures).toBeLessThanOrEqual(8);
            expect(state.groove.volume).toBe(1.0);
            expect(state.bass.volume).toBe(1.0);
            expect(state.chords.reverb).toBe(0.3);
            expect(state.bass.reverb).toBe(0.05);
            expect(state.soloist.reverb).toBe(0.6);
            expect(state.harmony.reverb).toBe(0.4);
            expect(state.groove.reverb).toBe(0.2);

            expect(stateModule.storage.save).toHaveBeenCalledWith(
                'currentState',
                expect.objectContaining({
                    mixerVersion: 2,
                }),
            );

            // Genre validation
            expect(state.groove.genreFeel).not.toBe('MaliciousScript');
            expect(state.groove.genreFeel).toBe('Rock'); // Default fallback
        });

        it('should clamp swing and humanize values', () => {
            const payload = {
                sections: [{ id: '1', label: 'A', value: 'I' }],
                groove: { swing: 150, humanize: -20 },
            };
            localStorage.setItem('ensemble_currentState', JSON.stringify(payload));

            hydrateState();

            const state = stateModule.getState();
            expect(state.groove.swing).toBe(100);
            expect(state.groove.humanize).toBe(0);
        });

        // why (#1257): the recovery half of the share-URL `swingSub` bug. The broken
        // share reader wrote the *number* 8 into this string field; `saveCurrentState()`
        // then persisted it, and this persist reader used to pass it straight back
        // through unguarded — so anyone who had once opened a share link stayed locked
        // to 8th-note swing on every subsequent boot, with no share URL involved.
        // Normalizing here is what actually un-sticks them.
        it('recovers a persisted numeric swingSub written by the pre-fix share reader', () => {
            const payload = {
                sections: [{ id: '1', label: 'A', value: 'I' }],
                groove: { swingSub: 8 },
            };
            localStorage.setItem('ensemble_currentState', JSON.stringify(payload));

            hydrateState();

            const state = stateModule.getState();
            expect(state.groove.swingSub).toBe('8th');
            expect(typeof state.groove.swingSub).toBe('string');
        });

        it('still restores a valid persisted 16th swingSub (the accept direction)', () => {
            const payload = {
                sections: [{ id: '1', label: 'A', value: 'I' }],
                groove: { swingSub: '16th' },
            };
            localStorage.setItem('ensemble_currentState', JSON.stringify(payload));

            hydrateState();

            expect(stateModule.getState().groove.swingSub).toBe('16th');
        });

        it('should treat retired classic soloist preset values as unsupported', () => {
            const payload = {
                sections: [{ id: '1', label: 'A', value: 'I' }],
                soloist: makeSoloistMock({ preset: 'classic' }),
            };
            localStorage.setItem('ensemble_currentState', JSON.stringify(payload));

            hydrateState();

            expect(stateModule.getState().soloist.preset).toBe('trumpet');
        });

        it('should clamp numeric fields even if strings are provided', () => {
            const payload = {
                sections: [{ id: '1', label: 'A', value: 'I' }],
                groove: { volume: '50', swing: '200' },
            };
            localStorage.setItem('ensemble_currentState', JSON.stringify(payload));

            hydrateState();

            const state = stateModule.getState();
            expect(state.groove.volume).toBe(1.0);
            expect(state.groove.swing).toBe(100);
        });
    });

    // why (#1258): four allowlist checks validated untrusted input by indexing a plain
    // object literal and testing truthiness. Every `Object.prototype` member resolves
    // through the prototype chain and reads as truthy, so `TIME_SIGNATURES['__proto__']`
    // was a valid-looking hit — and because `Object.prototype` is truthy it ALSO defeated
    // the `TIME_SIGNATURES[x] || TIME_SIGNATURES['4/4']` fallback that ~17 consumers rely
    // on, poisoning meter math into NaN instead of defaulting to 4/4. Fixed at the two
    // declarations (null prototype) rather than at the guards, so the next lookup is
    // correct by default too.
    describe('Prototype-pollution-shaped keys in allowlist lookups (#1258)', () => {
        const validSection = { id: '1', label: 'A', value: 'I' };

        // The pin. A null prototype looks like a stylistic quirk, so a future "simplify
        // this back to a plain literal" would silently reopen every case below. Only
        // TIME_SIGNATURES is asserted directly (LEGACY_THEME_MAP is module-private); that
        // one is covered behaviorally by the `theme: 'constructor'` test further down.
        it('keeps the untrusted-input lookup tables prototype-less', () => {
            expect(Object.getPrototypeOf(TIME_SIGNATURES)).toBeNull();

            // Indexed through a variable, not a literal — both because Biome's
            // `noProto`/`useLiteralKeys` rules reject the literal form, and because the
            // dynamic read is the shape that actually matters here: these keys arrive at
            // runtime from a persisted value or a URL param.
            for (const key of ['__proto__', 'constructor', 'toString', 'valueOf']) {
                expect(TIME_SIGNATURES[key]).toBeUndefined();

                // The consequence that made this worth fixing: `Object.prototype` is
                // truthy, so it defeated the `|| fallback` every consumer relies on.
                expect(TIME_SIGNATURES[key] || TIME_SIGNATURES['4/4']).toBe(TIME_SIGNATURES['4/4']);
            }

            // ...without breaking ordinary reads, which is why this is safe to do here.
            expect(Object.keys(TIME_SIGNATURES)).toContain('4/4');
            expect(TIME_SIGNATURES['4/4'].beats).toBe(4);
        });

        it.each(['__proto__', 'constructor', 'toString'])(
            'falls back to 4/4 for a persisted timeSignature of %s',
            (key) => {
                localStorage.setItem(
                    'ensemble_currentState',
                    JSON.stringify({ sections: [validSection], timeSignature: key }),
                );

                hydrateState();

                const ts = stateModule.getState().arranger.timeSignature;
                expect(ts).toBe('4/4');
                // The consequence was NaN meter math, so assert the derived value too --
                // asserting the string alone would miss a fallback that returns a
                // truthy-but-wrong config.
                const cfg = TIME_SIGNATURES[ts] || TIME_SIGNATURES['4/4'];
                expect(cfg.beats * cfg.stepsPerBeat).toBe(16);
            },
        );

        // The both-directions control: a *valid* meter must still load. Without this, a
        // guard that rejected everything would pass the assertions above.
        it('still loads a valid non-4/4 persisted timeSignature', () => {
            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({ sections: [validSection], timeSignature: '7/8' }),
            );

            hydrateState();

            expect(stateModule.getState().arranger.timeSignature).toBe('7/8');
        });

        it('rejects a prototype-shaped section timeSignature from a persisted payload', () => {
            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({
                    sections: [{ ...validSection, timeSignature: '__proto__' }],
                }),
            );

            hydrateState();

            expect(stateModule.getState().arranger.sections[0].timeSignature).toBe('');
        });

        it('falls back to the default theme for a persisted theme of constructor', () => {
            // LEGACY_THEME_MAP['constructor'] used to return the Object constructor -- a
            // truthy hit that sailed past the `??` and produced
            // { palette: undefined, mode: undefined }.
            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({ sections: [validSection], theme: 'constructor' }),
            );

            hydrateState();

            // migrateTheme's result lands on the playback slice.
            const { palette, mode } = stateModule.getState().playback;
            expect(palette).toBe('after-hours');
            expect(mode).toBe('auto');
        });
    });

    // why (#1258): `clamp` coerced with `Number()`, so null/false/[] became 0 rather than
    // NaN -- landing on `min` instead of the intended default. For a volume field that
    // meant a silently muted instrument, which is worse than the default it skipped.
    describe('clamp() rejects non-numbers instead of coercing them to zero (#1258)', () => {
        const validSection = { id: '1', label: 'A', value: 'I' };

        it.each([
            ['null', null],
            ['false', false],
            ['an empty array', []],
            ['an object', {}],
        ])('uses the default volume, not the minimum, for %s', (_label, bad) => {
            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({
                    sections: [validSection],
                    mixerVersion: 2,
                    chords: { volume: bad },
                }),
            );

            hydrateState();

            // The bug: Number(null) === 0 -> clamped to min -> muted. Assert the actual
            // contract (the 1.0 default), not merely "not muted" -- `not.toBe(0)` would
            // also pass on 0.5 or NaN.
            expect(stateModule.getState().chords.volume).toBe(1.0);
        });

        it('still accepts a legitimate numeric string (the accept direction)', () => {
            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({ sections: [validSection], bpm: '140' }),
            );

            hydrateState();

            expect(stateModule.getState().playback.bpm).toBe(140);
        });
    });

    // why (#1258): section ids key `sectionSeedMap` in groove-engine. The old
    // `s.id || generateId()` was a truthiness check, so a non-string id passed straight
    // through; an object-valued id stringifies to "[object Object]" and therefore
    // COLLIDES across every section carrying one, silently collapsing their independent
    // groove seeds into a single shared one.
    // why (#1257 residue, caught in #1258's review): the share reader validated density
    // but the persist reader passed it through raw -- so every user who opened a share
    // link before #1257 had the number 0.5 written to disk and restored on every boot,
    // pinned to standard voicing with no share URL involved. Same asymmetry the swingSub
    // fix already called fatal.
    describe('chords.density persist recovery (#1257 residue)', () => {
        const validSection = { id: '1', label: 'A', value: 'I' };

        it('recovers a persisted numeric density written by the pre-fix share reader', () => {
            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({ sections: [validSection], chords: { density: 0.5 } }),
            );

            hydrateState();

            expect(stateModule.getState().chords.density).toBe('standard');
        });

        it('still restores a valid persisted density (the accept direction)', () => {
            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({ sections: [validSection], chords: { density: 'rich' } }),
            );

            hydrateState();

            expect(stateModule.getState().chords.density).toBe('rich');
        });

        it('falls back to standard when a pre-#1257 save has no density key at all', () => {
            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({ sections: [validSection], chords: { volume: 1 } }),
            );

            hydrateState();

            expect(stateModule.getState().chords.density).toBe('standard');
        });
    });

    describe('validateSections type-checks section ids (#1258)', () => {
        it.each([
            ['an object', {}],
            ['a number', 7],
            ['an array', []],
            ['true', true],
        ])('mints a fresh string id when the persisted id is %s', (_label, badId) => {
            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({
                    sections: [
                        { id: badId, label: 'A', value: 'I' },
                        { id: badId, label: 'B', value: 'IV' },
                    ],
                }),
            );

            hydrateState();

            const [a, b] = stateModule.getState().arranger.sections;
            expect(typeof a.id).toBe('string');
            expect(typeof b.id).toBe('string');
            // The actual defect was collision, not just the wrong type.
            expect(a.id).not.toBe(b.id);
            expect(a.id).not.toBe('[object Object]');
        });

        it('preserves a legitimate string id (the accept direction)', () => {
            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({ sections: [{ id: 'sec-abc', label: 'A', value: 'I' }] }),
            );

            hydrateState();

            expect(stateModule.getState().arranger.sections[0].id).toBe('sec-abc');
        });
    });

    describe('DoS & XSS Prevention during Hydration', () => {
        it('should limit the number of sections loaded from storage (DoS Prevention)', () => {
            const massiveSections = Array(1000)
                .fill(0)
                .map((_, i) => ({
                    id: `sec-${i}`,
                    label: `Section ${i}`,
                    value: 'I | IV',
                }));

            const payload = { sections: massiveSections };
            localStorage.setItem('ensemble_currentState', JSON.stringify(payload));

            hydrateState();

            expect(stateModule.getState().arranger.sections.length).toBeLessThanOrEqual(500);
        });

        it('should sanitize section labels and values (XSS Prevention)', () => {
            const payload = {
                sections: [
                    { id: 'xss1', label: '<script>alert(1)</script>', value: 'I | IV' },
                    { id: 'xss2', label: 'Safe', value: '<img src=x>' },
                ],
            };

            localStorage.setItem('ensemble_currentState', JSON.stringify(payload));
            hydrateState();

            const sections = stateModule.getState().arranger.sections;
            const sec1 = sections.find((s) => s.id === 'xss1');
            const sec2 = sections.find((s) => s.id === 'xss2');

            expect(sec1).toBeDefined();
            expect(sec1.label).not.toContain('<script>');
            expect(sec2).toBeDefined();
            expect(sec2.value).not.toContain('<img');
        });

        it('should validate key and timeSignature against allowlists', () => {
            const payload = {
                sections: [{ id: '1', label: 'Intro', value: 'I' }],
                key: 'InvalidKey',
                timeSignature: '99/8',
            };

            localStorage.setItem('ensemble_currentState', JSON.stringify(payload));
            hydrateState();

            const state = stateModule.getState();
            expect(state.arranger.key).toBe('C');
            expect(state.arranger.timeSignature).toBe('4/4');
        });
    });

    // #1244 — a saved payload that is valid JSON but the wrong shape used to throw
    // out of hydrateState(), which runs inside the same `try` as mountComponents()
    // in main.ts. The throw skipped the mount, so the user got a blank page with no
    // ErrorBoundary and no recovery path. Two layers are covered here: the specific
    // groove.pattern guard, and the structural fallback that caps the blast radius
    // of any *other* unguarded field in the function.
    describe('Malformed persisted shapes (#1244)', () => {
        const validSection = { id: '1', label: 'A', value: 'I' };

        /** Give the mock a real drum lane so the inner steps loop is reachable. */
        function seedInstrument(steps: number[]) {
            const state = stateModule.getState();
            state.groove.instruments = [{ name: 'Kick', steps }];
            return state.groove.instruments[0];
        }

        /**
         * Assert the *guards* handled the payload, not the try/catch fallback.
         * Without this the part-1 tests are vacuous: part 2 swallows the throw, so
         * "does not throw" alone passes even with every `Array.isArray` reverted.
         */
        function expectNoFallback() {
            expect(stateModule.dispatch).not.toHaveBeenCalledWith(ACTIONS.RESET_STATE);
        }

        it('survives a non-array groove.pattern', () => {
            seedInstrument(new Array(16).fill(0));
            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({
                    sections: [validSection],
                    // A string has a truthy `.length` and no `.forEach` — the exact
                    // shape that passed the old guard and then threw.
                    groove: { pattern: 'corrupted' },
                }),
            );

            expect(() => hydrateState()).not.toThrow();
            expectNoFallback();
            // Hydration completed rather than bailing: a sibling field still landed.
            expect(stateModule.getState().arranger.sections.length).toBe(1);
        });

        it('survives an object-shaped groove.pattern from a partial write', () => {
            seedInstrument(new Array(16).fill(0));
            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({
                    sections: [validSection],
                    groove: { pattern: { 0: { name: 'Kick' }, length: 1 } },
                }),
            );

            expect(() => hydrateState()).not.toThrow();
            expectNoFallback();
        });

        it('skips an entry whose steps are not an array, leaving the lane untouched', () => {
            const inst = seedInstrument(new Array(16).fill(0));
            inst.steps[0] = 1;

            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({
                    sections: [validSection],
                    groove: { pattern: [{ name: 'Kick', steps: 'nope' }] },
                }),
            );

            expect(() => hydrateState()).not.toThrow();
            expectNoFallback();
            // The guard gates the `fill(0)` as well, so an unreadable saved pattern
            // preserves the live default rather than blanking the lane to silence.
            expect(inst.steps[0]).toBe(1);
        });

        it('tolerates a null entry inside an otherwise valid pattern array', () => {
            const inst = seedInstrument(new Array(16).fill(0));
            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({
                    sections: [validSection],
                    groove: { pattern: [null, { name: 'Kick', steps: [1, 0, 1, 0] }] },
                }),
            );

            expect(() => hydrateState()).not.toThrow();
            expectNoFallback();
            // The valid sibling still applied — the guard rejects bad entries, not the batch.
            expect(inst.steps[0]).toBe(1);
            expect(inst.steps[2]).toBe(1);
        });

        // Control for the three tests above: proves the guards reject only malformed
        // shapes. Without this, an `Array.isArray` that always returned false would
        // pass every "does not throw" assertion.
        it('still hydrates a well-formed pattern', () => {
            const inst = seedInstrument(new Array(16).fill(0));
            inst.steps[5] = 1;

            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({
                    sections: [validSection],
                    groove: { pattern: [{ name: 'Kick', steps: [1, 0, 0, 1] }] },
                }),
            );

            hydrateState();

            expect(inst.steps[0]).toBe(1);
            expect(inst.steps[3]).toBe(1);
            // The stale live step outside the saved range was cleared by `fill(0)`.
            expect(inst.steps[5]).toBe(0);
        });

        // Asserts the fallback is *signalled*, not that the resulting state is
        // fully coherent: `dispatch` is a bare spy in this file's mock, so no
        // reducer runs. RESET_STATE's completeness as an inverse of hydration is
        // a separate concern (see the groove RESET_STATE case, #1244).
        it('dispatches RESET_STATE instead of throwing when a field throws mid-hydration', () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

            // Simulate an unguarded field we have NOT specifically hardened: the
            // point of the fallback is that it does not depend on knowing which one.
            // `groove` is read late, so arranger/playback are already partly applied
            // when this throws — i.e. recovery from a *partial* hydration.
            vi.mocked(stateModule.storage.get).mockReturnValueOnce({
                sections: [validSection],
                get groove(): never {
                    throw new TypeError('savedState.groove.pattern.forEach is not a function');
                },
            });

            expect(() => hydrateState()).not.toThrow();
            expect(stateModule.dispatch).toHaveBeenCalledWith(ACTIONS.RESET_STATE);
            expect(consoleError).toHaveBeenCalled();

            consoleError.mockRestore();
        });

        it('routes a wrong-shape sections field to the fresh-session fallback', () => {
            // The one bad shape the try/catch cannot catch, because it never throws:
            // a truthy non-array passed the old gate, validateSections returned [],
            // and the app booted an empty chart that the next save made permanent.
            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({ sections: 'corrupt', bpm: 140 }),
            );

            hydrateState();

            expect(stateModule.dispatch).toHaveBeenCalledWith(ACTIONS.RESET_STATE);
        });

        it('still hydrates a session whose sections array is legitimately empty', () => {
            // Guards a deliberate choice: an empty chart is a reachable user state,
            // not corruption, so it keeps the rest of the saved session rather than
            // being reset along with it.
            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({ sections: [], bpm: 140 }),
            );

            hydrateState();

            expectNoFallback();
            expect(stateModule.getState().playback.bpm).toBe(140);
        });

        it('always dispatches HYDRATE, on the failure path as well as the success one', () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

            vi.mocked(stateModule.storage.get).mockReturnValueOnce({
                sections: [validSection],
                get groove(): never {
                    throw new TypeError('boom');
                },
            });

            hydrateState();

            // Nothing observes HYDRATE at this point in boot — `subscribe()`'s only
            // call site (main.ts) attaches long after hydrateState() runs, so the
            // listener list is empty and state-effects' `case 'HYDRATE'` never fires
            // here. The guard is against a successor moving that subscribe earlier
            // and finding the action silently absent on the recovery path.
            expect(stateModule.dispatch).toHaveBeenCalledWith(ACTIONS.HYDRATE);

            consoleError.mockRestore();
        });
    });

    /**
     * #1259 — the persisted MIDI block has to survive a round-trip.
     *
     * `harmonyOctave` was saved by `persistence.ts` on every write and simply absent
     * from hydration's `SET_MIDI_CONFIG` payload, so the setting was silently discarded
     * on every load while its four sibling octave offsets restored fine. Nothing failed
     * loudly — the field just quietly went back to 0 on each boot.
     *
     * Asserted on the dispatched payload rather than resulting state because that
     * payload IS the reader's whole contract here: the mocked `dispatch` means the real
     * `midiReducer` never runs, so a key missing from the payload is exactly the defect.
     */
    describe('persisted MIDI config round-trips (#1259)', () => {
        const validSection = { id: '1', label: 'A', value: 'I' };
        const MIDI_OCTAVE_KEYS = [
            'chordsOctave',
            'bassOctave',
            'soloistOctave',
            'harmonyOctave',
            'drumsOctave',
        ] as const;

        it.each(MIDI_OCTAVE_KEYS)('restores midi.%s from the saved payload', (key) => {
            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({
                    sections: [validSection],
                    midi: { [key]: 2 },
                }),
            );

            hydrateState();

            expect(stateModule.dispatch).toHaveBeenCalledWith(
                ACTIONS.SET_MIDI_CONFIG,
                expect.objectContaining({ [key]: 2 }),
            );
        });

        // The whole block, not just the octaves — a key added to `saveCurrentState()`'s
        // midi literal and forgotten here would be dropped just as quietly.
        it('restores every key persistence.ts writes for midi', () => {
            const saved = {
                enabled: true,
                selectedOutputId: 'out-1',
                inputEnabled: true,
                selectedInputId: 'in-1',
                chordsChannel: 5,
                bassChannel: 6,
                soloistChannel: 7,
                harmonyChannel: 8,
                drumsChannel: 9,
                chordsOctave: 1,
                bassOctave: -1,
                soloistOctave: 2,
                harmonyOctave: -2,
                drumsOctave: 1,
                latency: 12,
                muteLocal: false,
                velocitySensitivity: 0.75,
            };
            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({ sections: [validSection], midi: saved }),
            );

            hydrateState();

            expect(stateModule.dispatch).toHaveBeenCalledWith(
                ACTIONS.SET_MIDI_CONFIG,
                expect.objectContaining(saved),
            );
        });
    });

    /**
     * #1259 — `vizState.enabled` was the least-validated write in `hydrateSavedState()`:
     * `savedState.vizEnabled !== undefined ? savedState.vizEnabled : false` put any JSON
     * value straight into a field typed `boolean`.
     *
     * It matters more than a stray type because of *where* it sits. The write is early,
     * so it survives a throw almost anywhere later in the function; a truthy non-boolean
     * makes the scheduler emit visualizer events every step; and `saveCurrentState()`
     * writes the value back out unchanged — so the bad value outlives the very reload
     * that was supposed to clear it. Coercion at the read is what breaks that cycle.
     */
    describe('vizState.enabled is coerced to a real boolean (#1259)', () => {
        const validSection = { id: '1', label: 'A', value: 'I' };

        const hydrateWith = (vizEnabled: unknown) => {
            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({ sections: [validSection], vizEnabled }),
            );
            hydrateState();
            return stateModule.getState().vizState.enabled;
        };

        it.each([
            ['a non-empty string', 'true'],
            ['a truthy number', 1],
            ['an object', { on: true }],
            ['an array', [1]],
        ])('coerces %s to true, not the raw value', (_label, value) => {
            const enabled = hydrateWith(value);
            expect(enabled).toBe(true);
            expect(typeof enabled).toBe('boolean');
        });

        it.each([
            ['an empty string', ''],
            ['zero', 0],
            ['null', null],
        ])('coerces %s to false', (_label, value) => {
            expect(hydrateWith(value)).toBe(false);
        });

        // The missing-key case has to keep behaving exactly as the old ternary did —
        // `!!undefined` is false, which is the point of replacing it rather than
        // adding a guard around it.
        it('defaults to false when the key is absent', () => {
            localStorage.setItem(
                'ensemble_currentState',
                JSON.stringify({ sections: [validSection] }),
            );
            hydrateState();
            expect(stateModule.getState().vizState.enabled).toBe(false);
        });
    });
});
