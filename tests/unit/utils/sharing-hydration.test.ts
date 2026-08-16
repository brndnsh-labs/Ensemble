/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatch, getState } from '../../../public/state.js';

const { arranger, playback, groove, chords, bass, soloist, harmony } = getState();

import { TIME_SIGNATURES } from '../../../public/config.js';
import {
    getCanonicalMeters,
    resolveGenre,
    SMART_GENRES,
} from '../../../public/data/smart-genres.js';
import { calculateStepDuration } from '../../../public/engine/groove-engine.js';
import { generateShareUrl, shareProgression } from '../../../public/export/sharing.js';
import { MIXER_SETTINGS_VERSION } from '../../../public/state/instruments.js';
import { encodeBase64Unicode } from '../../../public/state/share-codec.js';
import { loadFromUrl, normalizeSwingSub } from '../../../public/state/state-hydration.js';
import { ACTIONS } from '../../../public/types.js';

vi.mock('../../../public/ui.js', () => ({
    ui: {
        keySelect: { value: 'C' },
        bpmInput: { value: '120' },
        timeSigSelect: { value: '4/4' },
        notationSelect: { value: 'roman' },
        showToast: vi.fn(),
        updateKeySelectLabels: vi.fn(),
        updateRelKeyButton: vi.fn(),
    },
    showToast: vi.fn(),
    updateKeySelectLabels: vi.fn(),
    updateRelKeyButton: vi.fn(),
    switchInstrumentTab: vi.fn(),
}));

import * as uiModule from '../../../public/ui.js';

const mockUi = (uiModule as any).ui;

vi.mock('../../../public/controllers/app-controller.js', () => ({
    applyTheme: vi.fn(),
    setBpm: vi.fn((bpm) => {
        playback.bpm = parseInt(bpm, 10);
    }),
}));

vi.mock('../../../public/controllers/instrument-controller.js', () => ({
    loadDrumPreset: vi.fn(),
    flushBuffers: vi.fn(),
    restoreGains: vi.fn(),
}));

vi.mock('../../../public/state/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));

describe('Sharing & Hydration Round-trip', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset state
        arranger.sections = [{ id: '1', label: 'Intro', value: 'I' }];
        arranger.key = 'C';
        arranger.timeSignature = '4/4';
        playback.bpm = 120;
        chords.style = 'smart';

        // Mock clipboard
        vi.stubGlobal('navigator', {
            clipboard: {
                writeText: vi.fn().mockImplementation(() => Promise.resolve()),
            },
        });

        // Mock window.location
        vi.stubGlobal('location', new URL('http://localhost'));
    });

    it('should generate a URL containing critical state', async () => {
        groove.genreFeel = 'Funk';
        playback.bandIntensity = 0.85;
        playback.complexity = 0.6;
        shareProgression();

        expect(navigator.clipboard.writeText).toHaveBeenCalled();
        const urlString = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];
        const url = new URL(urlString);

        expect(url.searchParams.get('key')).toBe('C');
        expect(url.searchParams.get('bpm')).toBe('120');
        expect(url.searchParams.get('genre')).toBe('Funk');
        expect(url.searchParams.get('int')).toBe('0.85');
        expect(url.searchParams.get('comp')).toBe('0.60');
    });

    it('should hydrate state from a generated URL', () => {
        // 1. Setup specific state
        arranger.sections = [{ id: '1', label: 'Blues', value: 'I | IV | I | V' }];
        arranger.key = 'F';
        playback.bpm = 80;
        chords.style = 'jazz';
        chords.reverb = 0.22;
        bass.reverb = 0.08;
        soloist.reverb = 0.72;
        harmony.reverb = 0.44;
        groove.reverb = 0.18;
        groove.genreFeel = 'Jazz';
        playback.bandIntensity = 0.4;

        // 2. Generate Share URL
        mockUi.keySelect.value = 'F';
        mockUi.bpmInput.value = '80';

        shareProgression();
        const urlString = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];

        // 3. Reset State
        arranger.sections = [];
        arranger.key = 'C';
        playback.bpm = 120;
        chords.style = 'smart';
        groove.genreFeel = 'Rock';
        playback.bandIntensity = 0.5;

        // 4. Simulate Load from that URL
        vi.stubGlobal('location', new URL(urlString));
        loadFromUrl();

        // 5. Verify restored state
        expect(arranger.key).toBe('F');
        expect(playback.bpm).toBe(80);
        expect(chords.style).toBe('jazz');
        expect(chords.reverb).toBe(0.22);
        expect(bass.reverb).toBe(0.08);
        expect(soloist.reverb).toBe(0.72);
        expect(harmony.reverb).toBe(0.44);
        expect(groove.reverb).toBe(0.18);
        expect(arranger.sections[0].label).toBe('Blues');
        expect(groove.genreFeel).toBe('Jazz'); // Verified state update directly
        expect(playback.bandIntensity).toBe(0.4);
    });

    it('should fall back to unity volume and default reverb for legacy band payloads', () => {
        const legacyBandState = {
            s: {
                e: 1,
                s: 'smart',
                p: 'trumpet',
                o: 72,
                v: 0.5,
                r: 0.9,
                m: 'monophonic',
                sd: '',
            },
            b: {
                e: 1,
                s: 'smart',
                o: 36,
                v: 0.4,
                r: 0.8,
            },
            c: {
                e: 1,
                s: 'smart',
                o: 48,
                v: 0.5,
                r: 0.7,
                d: 'standard',
            },
            h: {
                e: 1,
                s: 'smart',
                o: 60,
                v: 0.4,
                r: 0.6,
                c: 0.5,
            },
            g: {
                e: 1,
                v: 0.5,
                r: 0.4,
                sw: 0,
                // '8th', not the number 8: no writer has ever emitted a numeric `ss`
                // (#1257). This fixture's old numeric value mirrored the buggy reader's
                // expectation and is very likely where that guard came from.
                ss: '8th',
                hu: 20,
            },
        };

        const encoded = btoa(JSON.stringify(legacyBandState));

        soloist.reverb = 0.1;
        bass.reverb = 0.1;
        chords.reverb = 0.1;
        harmony.reverb = 0.1;
        groove.reverb = 0.1;

        vi.stubGlobal('location', new URL(`http://localhost/?bnd=${encodeURIComponent(encoded)}`));
        loadFromUrl();

        expect(soloist.volume).toBe(1.0);
        expect(bass.volume).toBe(1.0);
        expect(chords.volume).toBe(1.0);
        expect(harmony.volume).toBe(1.0);
        expect(groove.volume).toBe(1.0);
        expect(soloist.reverb).toBe(0.6);
        expect(bass.reverb).toBe(0.05);
        expect(chords.reverb).toBe(0.3);
        expect(harmony.reverb).toBe(0.4);
        expect(groove.reverb).toBe(0.2);
    });

    it('should hydrate high-fidelity band settings (volume, reverb) from bnd parameter', () => {
        const { soloist, bass } = getState();
        // 1. Setup specific band state
        soloist.volume = 0.8;
        soloist.reverb = 0.7;
        bass.volume = 0.3;
        bass.style = 'funk';

        // 2. Generate Share URL
        shareProgression();
        const urlString = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];
        expect(urlString).toContain('bnd=');

        // 3. Reset State
        soloist.volume = 0.5;
        soloist.reverb = 0.6;
        bass.volume = 0.45;
        bass.style = 'walking';

        // 4. Simulate Load from that URL
        vi.stubGlobal('location', new URL(urlString));
        loadFromUrl();

        // 5. Verify restored high-fidelity state
        expect(soloist.volume).toBe(0.8);
        expect(soloist.reverb).toBe(0.7);
        expect(bass.volume).toBe(0.3);
        expect(bass.style).toBe('funk');
    });

    it('normalizes legacy soloist polyphonic mode to monophonic during URL hydration', () => {
        const { soloist } = getState();
        const legacyBandState = {
            s: {
                e: 1,
                s: 'smart',
                p: 'trumpet',
                o: 72,
                v: 0.5,
                r: 0.6,
                m: 'polyphonic',
                sd: '',
            },
        };
        const encoded = btoa(JSON.stringify(legacyBandState));

        soloist.mode = 'monophonic';
        vi.stubGlobal('location', new URL(`http://localhost/?bnd=${encodeURIComponent(encoded)}`));
        loadFromUrl();

        expect(soloist.mode).toBe('monophonic');
    });
});

describe('Genre share round-trip (#1200)', () => {
    // The writer emits `groove.genreFeel` (the engine's keyspace); the reader must
    // land BOTH halves canonically — a canonical feel in `genreFeel` and a canonical
    // name in `lastSmartGenre` — no matter which keyspace arrived in the URL.
    const GENRE_PAIRS = Object.keys(SMART_GENRES).map((name) => ({
        name,
        feel: SMART_GENRES[name].feel as string,
    }));

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('location', new URL('http://localhost'));
    });

    it('covers all 13 canonical genres', () => {
        expect(GENRE_PAIRS).toHaveLength(13);
    });

    it.each(GENRE_PAIRS)('round-trips $name (feel "$feel")', ({ name, feel }) => {
        groove.genreFeel = feel;
        groove.lastSmartGenre = name;

        const url = generateShareUrl();
        expect(new URL(url).searchParams.get('genre')).toBe(feel);

        // Reset to a DIFFERENT genre than the one under test, so hydrating back to
        // the original is never vacuously true (Rock is the default fallback).
        const decoy = name === 'Rock' ? 'Jazz' : 'Rock';
        groove.genreFeel = SMART_GENRES[decoy].feel as string;
        groove.lastSmartGenre = decoy;

        vi.stubGlobal('location', new URL(url));
        loadFromUrl();

        expect(groove.genreFeel).toBe(feel);
        expect(groove.lastSmartGenre).toBe(name);
    });

    it('accepts a genre NAME in the url for back-compat and normalizes it to the feel', () => {
        groove.genreFeel = 'Rock';
        groove.lastSmartGenre = 'Rock';

        vi.stubGlobal('location', new URL('http://localhost/?genre=Ska-Punk'));
        loadFromUrl();

        expect(groove.genreFeel).toBe('Ska');
        expect(groove.lastSmartGenre).toBe('Ska-Punk');
    });

    it('ignores a genre param in neither keyspace', () => {
        groove.genreFeel = 'Funk';
        groove.lastSmartGenre = 'Funk';

        vi.stubGlobal('location', new URL('http://localhost/?genre=Polka'));
        loadFromUrl();

        expect(groove.genreFeel).toBe('Funk');
        expect(groove.lastSmartGenre).toBe('Funk');
    });

    it('applies a URL genre through the same reducer configuration as the picker (#1000)', () => {
        const resetToRock = () => {
            groove.genreFeel = 'Rock';
            groove.lastSmartGenre = 'Rock';
            groove.swing = 0;
            groove.swingSub = '8th';
            chords.style = 'smart';
            bass.style = 'rock';
            soloist.style = 'rock';
            harmony.style = 'smart';
        };
        const snapshot = () => ({
            genreFeel: groove.genreFeel,
            lastSmartGenre: groove.lastSmartGenre,
            swing: groove.swing,
            swingSub: groove.swingSub,
            chords: chords.style,
            bass: bass.style,
            soloist: soloist.style,
            harmony: harmony.style,
        });

        resetToRock();
        vi.stubGlobal('location', new URL('http://localhost/?genre=Funk'));
        const result = loadFromUrl();
        const urlState = snapshot();

        resetToRock();
        dispatch(ACTIONS.SET_GENRE_FEEL, { genreName: 'Funk', ...SMART_GENRES.Funk });

        expect(result.genreName).toBe('Funk');
        expect(urlState).toEqual(snapshot());
        expect(urlState).toMatchObject({
            genreFeel: 'Funk',
            lastSmartGenre: 'Funk',
            chords: 'funk',
            bass: 'funk',
            soloist: 'funk',
            harmony: 'horns',
        });
    });

    it('keeps explicit permalink and bnd settings above URL genre defaults (#1000)', () => {
        const bnd = encodeBase64Unicode(
            JSON.stringify({
                mv: MIXER_SETTINGS_VERSION,
                s: { e: 1, s: 'blues', m: 'monophonic', am: 0 },
                b: { e: 1, s: 'quarter' },
                c: { e: 1, s: 'jazz', d: 'thin' },
                h: { e: 1, s: 'strings' },
                g: { e: 1, sw: 73, ss: '8th', hu: 9 },
            }),
        );
        vi.stubGlobal(
            'location',
            new URL(`http://localhost/?genre=Funk&style=arp&bnd=${encodeURIComponent(bnd)}`),
        );

        const result = loadFromUrl();

        expect(chords.style).toBe('jazz');
        expect(bass.style).toBe('quarter');
        expect(soloist.style).toBe('blues');
        expect(harmony.style).toBe('strings');
        expect(groove.swing).toBe(73);
        expect(groove.swingSub).toBe('8th');
        expect(groove.humanize).toBe(9);
        expect(result.genreGrooveOverrides).toEqual({
            swing: 73,
            swingSub: '8th',
            humanize: 9,
        });
    });
});

describe('swingSub share round-trip (#1257)', () => {
    // Self-contained setup: this suite calls shareProgression(), which writes to
    // navigator.clipboard. Do NOT rely on a sibling describe's vi.stubGlobal leaking
    // in — stubs persist across describes, so a reorder or a .only elsewhere would
    // silently strand these tests without a clipboard.
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('navigator', {
            clipboard: { writeText: vi.fn().mockImplementation(() => Promise.resolve()) },
        });
        vi.stubGlobal('location', new URL('http://localhost'));
        arranger.sections = [{ id: '1', label: 'Intro', value: 'I' }];
        arranger.key = 'C';
        arranger.timeSignature = '4/4';
        playback.bpm = 120;
    });

    // The suite stubs globals; restore them so nothing appended after this describe
    // inherits them (Vitest isolates per file, but not per describe).
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    // why (#1257): the share writer emits `swingSub` as the canonical STRING
    // ('8th' | '16th') but the reader used to validate it against NUMBERS
    // (`[4, 8, 16].includes(...)`), so the check never matched and every share link
    // landed the number 8 — permanently disabling the 16th-note swing grid for that
    // session. The absence of any swing coverage in this round-trip suite is why it
    // survived; these are that gap closed. Per the repo's swing doctrine the grid
    // (8th vs 16th subdivision) *is* the feel, so this changed the pocket a recipient
    // heard versus what the sender shared.
    /** Shares current state and returns the generated URL string. */
    const roundTripUrl = () => {
        shareProgression();
        const calls = vi.mocked(navigator.clipboard.writeText).mock.calls;
        return calls[calls.length - 1][0] as string;
    };

    it('preserves a 16th-note swing grid across a share round-trip', () => {
        groove.swing = 50;
        groove.swingSub = '16th';
        const url = roundTripUrl();

        // Reset to the default before loading, so a pass can't come from
        // the value simply never having been touched.
        groove.swingSub = '8th';
        groove.swing = 0;

        vi.stubGlobal('location', new URL(url));
        loadFromUrl();

        expect(groove.swingSub).toBe('16th');
        expect(groove.swing).toBe(50);
    });

    // This replaced a round-trip test asserting that '8th' survives a share, which was
    // vacuous: '8th' is both a keyspace member AND the fallback, so narrowing the guard
    // to reject '8th' outright left every test green. Worth being precise about why —
    // that mutant (`value === '16th' ? value : '8th'`) is **semantically equivalent** to
    // the real implementation for every possible input, so no test can distinguish it
    // and none should try. The claims that ARE observable, and are asserted here:
    // '16th' is accepted, and everything outside the keyspace normalizes to '8th'.
    it('normalizes the swingSub keyspace: accepts 16th, rejects everything out-of-keyspace', () => {
        expect(normalizeSwingSub('16th')).toBe('16th');
        expect(normalizeSwingSub('8th')).toBe('8th');

        // Reject branch, incl. the numbers the old broken guard was written for.
        for (const bad of [8, 16, 4, '8', 'eighth', '', null, undefined, {}, ['16th']]) {
            expect(normalizeSwingSub(bad)).toBe('8th');
        }
    });

    // why: asserting the field alone would still have passed if the reader wrote
    // some other truthy value. This asserts the *consumer* branch is reachable —
    // `calculateStepDuration`'s 16th path alternates ±shift per step (so steps 0
    // and 2 come out equal), while the 8th path applies the loping weights
    // [1.5, 0.5, -0.5, -1.5] (so steps 0 and 2 differ). That signature is what
    // actually distinguishes the two feels, and it is float-robust.
    it('makes the 16th-note branch of calculateStepDuration reachable after a share load', () => {
        groove.swing = 50;
        groove.swingSub = '16th';
        const url = roundTripUrl();

        groove.swingSub = '8th';
        vi.stubGlobal('location', new URL(url));
        loadFromUrl();

        const ts = TIME_SIGNATURES['4/4'];
        const d = [0, 1, 2, 3].map((step) => calculateStepDuration(step, 120, ts, groove));

        // 16th signature: alternating, so 0 === 2 and 1 === 3, long-short.
        expect(d[0]).toBeCloseTo(d[2], 10);
        expect(d[1]).toBeCloseTo(d[3], 10);
        expect(d[0]).toBeGreaterThan(d[1]);

        // Control: the 8th path over the same steps is NOT alternating, which is
        // what the bug forced every shared session into.
        groove.swingSub = '8th';
        const eighth = [0, 1, 2, 3].map((step) => calculateStepDuration(step, 120, ts, groove));
        expect(eighth[0]).not.toBeCloseTo(eighth[2], 10);
    });

    it('falls back to the string 8th — never a number — for a payload in neither keyspace', () => {
        groove.swingSub = '16th';

        // A hand-forged `bnd` payload carrying the numeric value the old guard
        // was (wrongly) written for. It must not be accepted.
        const bnd = encodeBase64Unicode(
            JSON.stringify({ mv: MIXER_SETTINGS_VERSION, g: { e: 1, sw: 0, ss: 8, hu: 20 } }),
        );
        vi.stubGlobal('location', new URL(`http://localhost/?bnd=${encodeURIComponent(bnd)}`));
        loadFromUrl();

        expect(groove.swingSub).toBe('8th');
        // The historical failure was a *number* leaking into a string field, which
        // broke every `=== '16th'` comparison downstream.
        expect(typeof groove.swingSub).toBe('string');
    });
});

// why (#1257): found by auditing the rest of the `band.*` reader for the same
// writer/reader keyspace mismatch that broke `swingSub`. Both of these were live bugs
// on every share link, and neither had any coverage.
describe('band.c share round-trip — the same mismatch class (#1257)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('navigator', {
            clipboard: { writeText: vi.fn().mockImplementation(() => Promise.resolve()) },
        });
        vi.stubGlobal('location', new URL('http://localhost'));
        arranger.sections = [{ id: '1', label: 'Intro', value: 'I' }];
        arranger.key = 'C';
        arranger.timeSignature = '4/4';
        playback.bpm = 120;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const roundTripUrl = () => {
        shareProgression();
        const calls = vi.mocked(navigator.clipboard.writeText).mock.calls;
        return calls[calls.length - 1][0] as string;
    };

    // `chords.density` is a string ('thin'|'standard'|'rich') but the reader ran it
    // through `clamp`, so `parseFloat('rich')` → NaN → the numeric default 0.5 landed
    // in a string field. `chords-styles.ts` compares `density === 'rich'` / `=== 'thin'`,
    // both then permanently false, collapsing a shared voicing choice to standard.
    it.each(['rich', 'thin', 'standard'])('preserves chord density %s across a share', (d) => {
        chords.density = d;
        const url = roundTripUrl();

        chords.density = d === 'standard' ? 'rich' : 'standard';
        vi.stubGlobal('location', new URL(url));
        loadFromUrl();

        expect(chords.density).toBe(d);
        expect(typeof chords.density).toBe('string');
    });

    it('falls back to the string standard — never a number — for an out-of-keyspace density', () => {
        chords.density = 'rich';
        const bnd = encodeBase64Unicode(
            JSON.stringify({ mv: MIXER_SETTINGS_VERSION, c: { e: 1, s: 'smart', o: 48, d: 0.5 } }),
        );
        vi.stubGlobal('location', new URL(`http://localhost/?bnd=${encodeURIComponent(bnd)}`));
        loadFromUrl();

        expect(chords.density).toBe('standard');
    });

    // `'arp'` is routed by the Acoustic genre (`chord: 'arp'` in smart-genres) and read
    // by `comping-emit.ts` via `chords.style === 'arp'`, but it is deliberately not in
    // the CHORD_STYLES *picker* list — so validating against the picker rejected a live
    // style and dropped a shared Acoustic session's fingerpick arpeggio.
    it("preserves the genre-routed 'arp' chord style across a share round-trip", () => {
        chords.style = 'arp';
        const url = roundTripUrl();

        chords.style = 'smart';
        vi.stubGlobal('location', new URL(url));
        loadFromUrl();

        expect(chords.style).toBe('arp');
    });

    // why a hand-forged payload rather than a full round-trip: `generateShareUrl` sets
    // BOTH `?style=` and `bnd`, and `?style=` is handled first, so a round-trip cannot
    // isolate the `bnd` reader — if `bnd` rejects the style, its fallback is
    // `chords.style`, which the `?style=` handler has *already* set correctly. That
    // masking is real: mutating only the `bnd` site left the round-trip test green.
    it("accepts a genre-routed 'arp' in the bnd payload with no ?style= to mask it", () => {
        chords.style = 'smart';
        const bnd = encodeBase64Unicode(
            JSON.stringify({
                mv: MIXER_SETTINGS_VERSION,
                c: { e: 1, s: 'arp', o: 48, d: 'standard' },
            }),
        );
        vi.stubGlobal('location', new URL(`http://localhost/?bnd=${encodeURIComponent(bnd)}`));
        loadFromUrl();

        expect(chords.style).toBe('arp');
    });

    it('rejects an unknown style in the bnd payload, preserving the current one', () => {
        chords.style = 'jazz';
        const bnd = encodeBase64Unicode(
            JSON.stringify({
                mv: MIXER_SETTINGS_VERSION,
                c: { e: 1, s: 'not-a-style', o: 48, d: 'standard' },
            }),
        );
        vi.stubGlobal('location', new URL(`http://localhost/?bnd=${encodeURIComponent(bnd)}`));
        loadFromUrl();

        expect(chords.style).toBe('jazz');
    });

    it("accepts 'arp' from a ?style= permalink too", () => {
        chords.style = 'smart';
        vi.stubGlobal('location', new URL('http://localhost/?style=arp'));
        loadFromUrl();

        expect(chords.style).toBe('arp');
    });

    it('still rejects a chord style in neither the picker list nor the genre table', () => {
        chords.style = 'jazz';
        vi.stubGlobal('location', new URL('http://localhost/?style=definitely-not-a-style'));
        loadFromUrl();

        expect(chords.style).toBe('jazz');
    });
});

// why (#1258): the `?ts=` route is the one reachable straight from an attacker-supplied
// URL, with no length check at all (`'__proto__'` is 9 chars, so even the share-code
// route's `length < 10` guard wouldn't have stopped it). The poisoned value was then
// persisted and re-accepted on the next boot, so a single link left a visitor's saved
// session permanently non-playing.
describe('untrusted URL input hardening (#1258)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('navigator', {
            clipboard: { writeText: vi.fn().mockImplementation(() => Promise.resolve()) },
        });
        vi.stubGlobal('location', new URL('http://localhost'));
        arranger.sections = [{ id: '1', label: 'Intro', value: 'I' }];
        arranger.timeSignature = '4/4';
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it.each(['__proto__', 'constructor', 'toString'])('ignores ?ts=%s', (key) => {
        arranger.timeSignature = '4/4';
        vi.stubGlobal('location', new URL(`http://localhost/?ts=${encodeURIComponent(key)}`));
        loadFromUrl();

        expect(arranger.timeSignature).toBe('4/4');
        // Assert the *derived* meter too: the bug's consequence was NaN meter math via a
        // truthy-but-wrong config, which a string-only assertion would miss.
        const cfg = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        expect(cfg.beats * cfg.stepsPerBeat).toBe(16);
    });

    // why (#1258, P0 found in review): the `?genre=` route is the same
    // `SOME_MAP[untrusted]` truthiness bug and a HARDER failure than `?ts=`.
    // `feelToCanon` is `(feel && GENRE_NAME_BY_FEEL[feel]) || null` over a plain object,
    // so a prototype key returned a *hit* and `groove.genreFeel` was set to '__proto__'
    // before Preact mounted. `getCanonicalMeters` then returned `Object.prototype` in
    // place of an array (same defeated `||`), so `canonicalMeters.includes(...)` in
    // KeySignatureControls threw during the initial render and dropped the whole app to
    // the ErrorBoundary — whose Refresh reloads the same URL and crashes again. Fixed by
    // null-prototyping the feel-keyed reduce seeds in smart-genres.
    it.each(['__proto__', 'constructor', 'toString', 'valueOf'])('ignores ?genre=%s', (key) => {
        groove.genreFeel = 'Rock';
        groove.lastSmartGenre = 'Rock';
        vi.stubGlobal('location', new URL(`http://localhost/?genre=${encodeURIComponent(key)}`));
        loadFromUrl();

        expect(groove.genreFeel).toBe('Rock');
        expect(groove.lastSmartGenre).toBe('Rock');

        // The crash was downstream of the poisoned feel, so assert the derived value is
        // still a usable array -- a string-only assertion would miss it.
        const meters = getCanonicalMeters(groove.genreFeel);
        expect(Array.isArray(meters)).toBe(true);
        expect(meters.includes('4/4')).toBe(true);
    });

    it('resolveGenre returns null for prototype-shaped input', () => {
        for (const key of ['__proto__', 'constructor', 'toString', 'valueOf']) {
            expect(resolveGenre(key)).toBeNull();
        }
        // Accept direction: both keyspaces still resolve.
        expect(resolveGenre('Ska-Punk')).toEqual({ name: 'Ska-Punk', feel: 'Ska' });
        expect(resolveGenre('Ska')).toEqual({ name: 'Ska-Punk', feel: 'Ska' });
    });

    // Both-directions control: a valid meter from the same param must still apply.
    it('still applies a valid ?ts= meter', () => {
        arranger.timeSignature = '4/4';
        vi.stubGlobal('location', new URL('http://localhost/?ts=7%2F8'));
        loadFromUrl();

        expect(arranger.timeSignature).toBe('7/8');
    });

    // The `bnd.s.sd` route accepted any string up to the payload's ~100KB ceiling, while
    // its `?seed=` sibling sanitized and capped at 64. That value is persisted, re-shared,
    // and fed per-section into deriveSectionSeed, so the drift carried forward forever.
    it('sanitizes and caps a bnd seed the same way ?seed= does', () => {
        const longSeed = 'a'.repeat(500);
        const bnd = encodeBase64Unicode(
            JSON.stringify({ mv: MIXER_SETTINGS_VERSION, s: { e: 1, sd: longSeed } }),
        );
        vi.stubGlobal('location', new URL(`http://localhost/?bnd=${encodeURIComponent(bnd)}`));
        loadFromUrl();

        expect(arranger.seed.length).toBe(64);
    });

    it('still accepts a normal bnd seed unchanged (the accept direction)', () => {
        const bnd = encodeBase64Unicode(
            JSON.stringify({ mv: MIXER_SETTINGS_VERSION, s: { e: 1, sd: 'blue-note-42' } }),
        );
        vi.stubGlobal('location', new URL(`http://localhost/?bnd=${encodeURIComponent(bnd)}`));
        loadFromUrl();

        expect(arranger.seed).toBe('blue-note-42');
    });
});

describe('bnd payload keyspace guards (#1264)', () => {
    // #1264 typed the `?bnd=` wire format (`SharedBandPayload`) so writer/reader
    // keyspace drift is a compile error. The types are a SECOND line, not a
    // replacement — the payload is still untrusted input that a forged or
    // hand-edited link can put anything into, and `tsc` is not present at runtime.
    // These cover the runtime half: an out-of-keyspace value must be REJECTED, and
    // rejection must leave the slice's existing value alone rather than resetting it.
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('navigator', {
            clipboard: { writeText: vi.fn().mockImplementation(() => Promise.resolve()) },
        });
        arranger.sections = [{ id: '1', label: 'Intro', value: 'I' }];
    });

    const loadBnd = (payload) => {
        const bnd = encodeBase64Unicode(JSON.stringify(payload));
        vi.stubGlobal('location', new URL(`http://localhost/?bnd=${encodeURIComponent(bnd)}`));
        loadFromUrl();
    };

    it('rejects the pre-#1257 numeric swingSub a forged link could still carry', () => {
        groove.swingSub = '16th';
        // The exact shape the broken reader used to WRITE, now arriving as input.
        loadBnd({ mv: MIXER_SETTINGS_VERSION, g: { e: 1, ss: 8 } });

        expect(groove.swingSub).toBe('8th'); // normalizeSwingSub's documented fallback
        expect(typeof groove.swingSub).toBe('string');
    });

    it('round-trips a valid 16th-note grid through the typed payload', () => {
        groove.swingSub = '8th';
        loadBnd({ mv: MIXER_SETTINGS_VERSION, g: { e: 1, ss: '16th' } });

        expect(groove.swingSub).toBe('16th');
    });

    it('rejects a numeric chords.density and falls back to standard', () => {
        chords.density = 'rich';
        // 0.5 is what the pre-#1257 numeric `clamp` landed on every share link.
        loadBnd({ mv: MIXER_SETTINGS_VERSION, c: { e: 1, d: 0.5 } });

        expect(chords.density).toBe('standard');
    });

    it('round-trips a valid rich voicing through the typed payload', () => {
        chords.density = 'standard';
        loadBnd({ mv: MIXER_SETTINGS_VERSION, c: { e: 1, d: 'rich' } });

        expect(chords.density).toBe('rich');
    });

    it('rejects an out-of-keyspace string rather than storing it verbatim', () => {
        // The failure mode a bare `typeof x === 'string'` check would miss: a
        // plausible-looking value that no consumer branches on, which would leave
        // both `=== 'rich'` and `=== 'thin'` false and silently read as standard
        // WITHOUT the slice ever holding a legal value.
        chords.density = 'thin';
        groove.swingSub = '16th';
        loadBnd({
            mv: MIXER_SETTINGS_VERSION,
            c: { e: 1, d: 'constructor' },
            g: { e: 1, ss: '32nd' },
        });

        expect(chords.density).toBe('standard');
        expect(groove.swingSub).toBe('8th');
    });
});

describe('song seed: one bound, at the write side (#1266)', () => {
    // Before this, the seed had three readers on two bounds. #1258 aligned
    // `bnd.s.sd` with `?seed=` (both cap at 64) but the persist reader was a third,
    // unbounded reader and `SongSeedControl` had no length cap — so a >64-char seed
    // was reachable BY TYPING, survived locally, and was emitted whole by the share
    // writer, while the recipient's reader truncated it. The seed is the PRNG input
    // for the whole session, so sender and recipient then heard different soloist
    // lines off the "same" seed. Bounding at the write side is what makes them agree.
    beforeEach(() => {
        vi.clearAllMocks();
        arranger.sections = [{ id: '1', label: 'Intro', value: 'I' }];
        arranger.seed = '';
        vi.stubGlobal('navigator', {
            clipboard: { writeText: vi.fn().mockImplementation(() => Promise.resolve()) },
        });
        vi.stubGlobal('location', new URL('http://localhost'));
    });

    it('a >64-char typed seed round-trips identically for sender and recipient', () => {
        // The "typed" path: the seed input dispatches SET_SONG_SEED per keystroke.
        dispatch(ACTIONS.SET_SONG_SEED, 'x'.repeat(200));

        const senderSeed = arranger.seed;
        expect(senderSeed.length).toBe(64);

        // Sender shares. The writer emits whatever the slice holds — which is now
        // already bounded, so there is nothing left for a reader to truncate.
        const shareUrl = generateShareUrl();

        // Recipient opens the link on a fresh session.
        arranger.seed = '';
        vi.stubGlobal('location', new URL(shareUrl));
        loadFromUrl();

        expect(arranger.seed).toBe(senderSeed);
    });

    it('normalizes at the reducer, not only at the readers', () => {
        dispatch(ACTIONS.SET_SONG_SEED, `<script>${'y'.repeat(100)}`);
        expect(arranger.seed.length).toBe(64);
        expect(arranger.seed.startsWith('script')).toBe(true);

        // Non-strings coerce to the empty seed rather than into the PRNG.
        dispatch(ACTIONS.SET_SONG_SEED, { evil: 1 });
        expect(arranger.seed).toBe('');
    });

    it('leaves an ordinary seed untouched (the accept direction)', () => {
        dispatch(ACTIONS.SET_SONG_SEED, 'A1B2C3');
        expect(arranger.seed).toBe('A1B2C3');

        const shareUrl = generateShareUrl();
        arranger.seed = '';
        vi.stubGlobal('location', new URL(shareUrl));
        loadFromUrl();

        expect(arranger.seed).toBe('A1B2C3');
    });
});
