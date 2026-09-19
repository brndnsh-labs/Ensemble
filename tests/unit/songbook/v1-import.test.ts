// @vitest-environment happy-dom
/**
 * v1 → v2 songbook import (#1274).
 *
 * The fixtures are produced by v1's OWN writers — `saveCurrentState()` for the current
 * session and `saveProgression()` (the Save-progression gesture, prompt and all) for the
 * preset library — driven through real `dispatch()` calls, never hand-typed JSON. That is
 * the point of this suite: the import has to survive the bytes v1 actually writes, and a
 * hand-written fixture would drift the moment the persisted payload changes. The only
 * hand-built payloads here are the deliberately corrupt ones, which no writer produces.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartDocument } from '../../../prototypes/v2/lib/documents.js';
import {
    convertV1,
    describeV1Outcome,
    findV1Data,
    hasV1Data,
    importV1,
    planV1Import,
    V1_PRESETS_KEY,
    V1_SESSION_ID,
    V1_STATE_KEY,
    type V1Finding,
    type V1ImportContext,
    type V1Source,
    v1ImportContext,
    v1ImportOffer,
    v1OfferDeclines,
} from '../../../prototypes/v2/lib/import-v1.js';
import {
    ConflictError,
    list as repositoryList,
    save as repositorySave,
} from '../../../prototypes/v2/lib/repository.js';
import {
    rememberV1Import,
    rememberV1SessionMark,
    v1ImportLedger,
    v1SessionMark,
} from '../../../prototypes/v2/lib/session.js';
import { saveProgression } from '../../../public/controllers/arranger-controller.js';
import { saveCurrentState } from '../../../public/state/persistence.js';
import {
    clamp,
    hydrateAutoSound,
    hydrateState,
    normalizeSoloistPreset,
    sanitizeDisplayString,
    validateSections,
} from '../../../public/state/state-hydration.js';
import { dispatch, getState } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';
import { installFakeIndexedDB } from '../../utils/fake-indexeddb.js';

/**
 * The two v2-side keys the import keeps its per-device memory under, spelled out rather
 * than imported: they are a storage contract with every browser that has already run this
 * build, and a test that renamed itself along with the constant would notice nothing.
 */
const V1_IMPORT_LEDGER_KEY = 'ensemble-v2-preview:v1-import';
const V1_SESSION_MARK_KEY = 'ensemble-v2-preview:v1-session-import';

// happy-dom in this repo ships no Storage implementation, so the v1 writers get the same
// manual mock the existing arranger-controller suite installs.
const store = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
    value: {
        getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
        setItem: (key: string, value: string) => store.set(key, String(value)),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
        key: (index: number) => [...store.keys()][index] ?? null,
        get length() {
            return store.size;
        },
    },
    writable: true,
});

const param = (module: string, name: string, value: unknown) =>
    dispatch(ACTIONS.SET_PARAM, { module, param: name, value });

/** Drives v1's own `saveCurrentState()` and returns the exact bytes it wrote. */
function writeSession(setup: () => void): string {
    dispatch(ACTIONS.RESET_STATE);
    setup();
    saveCurrentState();
    return window.localStorage.getItem(V1_STATE_KEY)!;
}

/** Drives v1's own Save-progression gesture and returns the preset it appended. */
function writePreset(name: string, setup: () => void): Record<string, unknown> {
    dispatch(ACTIONS.RESET_STATE);
    setup();
    vi.stubGlobal('prompt', () => name);
    window.localStorage.removeItem(V1_PRESETS_KEY);
    saveProgression();
    return JSON.parse(window.localStorage.getItem(V1_PRESETS_KEY)!)[0];
}

function storageOf(entries: Record<string, string | undefined>) {
    return {
        getItem: (key: string) => entries[key] ?? null,
    };
}

/**
 * The v2-side baseline: the band and tempo a document already in the songbook carries.
 * Only the fields v1 never persists (`soloist.tradeMode`, `groove.measures`' companion
 * defaults) are read from it, so the values here are deliberately un-v1-like.
 */
const BASE = {
    performance: { bpm: 100, complexity: 0.3, seed: '', randomizeSeed: true },
    band: {
        chords: {
            enabled: true,
            voice: 'synth' as const,
            autoSound: false,
            volume: 1,
            reverb: 0.3,
            style: 'smart',
            instrument: 'Piano',
            octave: 48,
            density: 'standard' as const,
        },
        bass: {
            enabled: true,
            voice: 'synth' as const,
            autoSound: false,
            volume: 1,
            reverb: 0.05,
            style: 'smart',
            octave: 36,
        },
        soloist: {
            enabled: false,
            voice: 'synth' as const,
            autoSound: false,
            volume: 1,
            reverb: 0.6,
            style: 'smart',
            preset: 'trumpet' as const,
            octave: 72,
            mode: 'monophonic' as const,
            autoMode: true,
            phrasingIntensity: 0.5,
            tradeMode: 'manual' as const,
        },
        harmony: {
            enabled: false,
            voice: 'synth' as const,
            autoSound: false,
            volume: 1,
            reverb: 0.4,
            style: 'smart',
            octave: 60,
            complexity: 0.5,
        },
        groove: {
            enabled: true,
            voice: 'synth' as const,
            autoSound: false,
            volume: 1,
            reverb: 0.2,
            measures: 1,
            swing: 0,
            swingSub: '8th' as const,
            humanize: 20,
            lastDrumPreset: 'Basic Rock',
            genreFeel: 'Rock',
            lastSmartGenre: 'Rock',
            pattern: [],
        },
    },
};

const CORRUPT_SESSION = '{"sections":[{"label":"Verse"';
const CORRUPT_SHAPE_SESSION = '{"sections":"I | IV | V | I","bpm":120}';
const CORRUPT_PRESET = { name: 'Broken tune', sections: '!!!not-base64!!!', isMinor: false };

let multiSection: string;
let oddMeter: string;
let tunedBand: string;
let minorKey: string;
let untouched: string;
let presetMajor: Record<string, unknown>;
let presetMinor: Record<string, unknown>;

beforeAll(() => {
    multiSection = writeSession(() => {
        param('arranger', 'sections', [
            { id: 'intro', label: 'Intro', value: 'I | IV', key: '', repeat: 2 },
            { id: 'verse', label: 'Verse', value: 'I | vi | IV | V', key: 'F' },
            {
                id: 'bridge',
                label: 'Bridge',
                value: 'ii | V | I',
                key: 'Bb',
                timeSignature: '3/4',
                seamless: true,
            },
        ]);
        param('arranger', 'key', 'C');
        param('arranger', 'notation', 'name');
        param('arranger', 'lastChordPreset', 'Long form');
        dispatch(ACTIONS.SET_BPM, 132);
    });
    oddMeter = writeSession(() => {
        param('arranger', 'sections', [{ id: 'a', label: 'A', value: 'i | iv | V | i' }]);
        param('arranger', 'timeSignature', '7/8');
        param('arranger', 'grouping', [2, 2, 3]);
        dispatch(ACTIONS.SET_BPM, 96);
    });
    tunedBand = writeSession(() => {
        param('arranger', 'sections', [{ id: 'a', label: 'A', value: 'I7 | IV7' }]);
        param('chords', 'style', 'funk');
        param('chords', 'voice', 'pack:rhodes');
        param('chords', 'autoSound', false);
        param('chords', 'volume', 0.62);
        param('chords', 'density', 'rich');
        param('bass', 'style', 'funk');
        param('bass', 'volume', 0.48);
        param('bass', 'octave', 34);
        param('soloist', 'enabled', true);
        param('soloist', 'style', 'funk');
        param('soloist', 'phrasingIntensity', 0.8);
        param('harmony', 'enabled', true);
        param('harmony', 'complexity', 0.7);
        param('groove', 'voice', 'pack:acoustic-kit');
        param('groove', 'autoSound', false);
        param('groove', 'swing', 62);
        param('groove', 'swingSub', '16th');
        param('groove', 'humanize', 35);
        param('groove', 'lastDrumPreset', 'Funk Break');
        param('groove', 'genreFeel', 'Funk');
        param('groove', 'lastSmartGenre', 'Funk');
        param(
            'groove',
            'instruments',
            getState().groove.instruments.map((instrument) => ({
                ...instrument,
                steps:
                    instrument.name === 'Kick'
                        ? instrument.steps.map((_, index) => (index % 8 === 0 ? 1 : 0))
                        : [...instrument.steps],
            })),
        );
    });
    minorKey = writeSession(() => {
        param('arranger', 'sections', [{ id: 'a', label: 'A', value: 'i | iv | v | i' }]);
        param('arranger', 'key', 'A');
        param('arranger', 'isMinor', true);
    });
    untouched = writeSession(() => {});
    presetMajor = writePreset('My Tune', () => {
        param('arranger', 'sections', [
            { id: 'a', label: 'Head', value: 'I | vi | ii | V', key: 'G' },
            { id: 'b', label: 'Tag', value: 'IV | I', repeat: 3 },
        ]);
    });
    presetMinor = writePreset('Minor thing', () => {
        param('arranger', 'sections', [{ id: 'a', label: 'A', value: 'i | bVI | bVII | i' }]);
        param('arranger', 'isMinor', true);
    });
});

function onlySource(
    session?: string,
    presets?: unknown[],
): { source: V1Source; finding: V1Finding } {
    const finding = findV1Data(
        storageOf({
            [V1_STATE_KEY]: session,
            [V1_PRESETS_KEY]: presets ? JSON.stringify(presets) : undefined,
        }),
    );
    expect(finding.problems).toEqual([]);
    expect(finding.sources).toHaveLength(1);
    return { source: finding.sources[0], finding };
}

function convert(session?: string, presets?: unknown[]) {
    const { source, finding } = onlySource(session, presets);
    const result = convertV1(source, v1ImportContext(finding, BASE), '2026-09-17T12:00:00.000Z');
    if (result.kind !== 'ok') {
        throw new Error(`expected a converted document, got: ${result.reason}`);
    }
    return result.document;
}

/**
 * Which dismiss gesture records the permanent device-wide decline (#1274 patch N1). The
 * rule the card's label and its handler BOTH read, so they cannot say one thing and do
 * another — which is exactly what went wrong: "Done" was declining.
 */
describe('the dismiss gesture', () => {
    const offer = (over: Partial<Parameters<typeof v1OfferDeclines>[0]> = {}) =>
        v1OfferDeclines({ result: null, songs: 2, asked: false, ...over });

    it('declines only when there is something on offer to turn down', () => {
        expect(offer()).toBe(true);
        // "Everything is already here" and "nothing readable" both read Done, and both
        // used to decline anyway — the bug this rule exists to close.
        expect(offer({ songs: 0 })).toBe(false);
    });

    it('never declines after a run — the musician engaged with it', () => {
        expect(offer({ result: 'Imported 2' })).toBe(false);
        expect(offer({ result: 'Imported 0', songs: 0 })).toBe(false);
    });

    it('never declines an offer the musician went looking for', () => {
        expect(offer({ asked: true })).toBe(false);
        expect(offer({ asked: true, songs: 0 })).toBe(false);
    });
});

/**
 * The cheap probe behind the song menu's permanent entry (#1274 patch R3/N5): it decides
 * whether there is an old Ensemble here at all, without parsing a thing.
 */
describe('probing for a v1 profile', () => {
    it('is false for a browser that never ran v1', () => {
        expect(hasV1Data(storageOf({}))).toBe(false);
    });

    it('is false for the empty library v1 leaves behind, without parsing it', () => {
        expect(hasV1Data(storageOf({ [V1_PRESETS_KEY]: '[]' }))).toBe(false);
        expect(hasV1Data(storageOf({ [V1_PRESETS_KEY]: '  []  ' }))).toBe(false);
        expect(hasV1Data(storageOf({ [V1_STATE_KEY]: '{}' }))).toBe(false);
    });

    it('is true for real v1 data, and for data that cannot be read', () => {
        expect(hasV1Data(storageOf({ [V1_STATE_KEY]: multiSection }))).toBe(true);
        expect(hasV1Data(storageOf({ [V1_PRESETS_KEY]: JSON.stringify([presetMajor]) }))).toBe(
            true,
        );
        // Unreadable is the whole reason this feature reports rather than shrugging.
        expect(hasV1Data(storageOf({ [V1_STATE_KEY]: CORRUPT_SESSION }))).toBe(true);
    });

    it('is false when storage refuses to be read at all', () => {
        expect(
            hasV1Data({
                getItem: () => {
                    throw new Error('site data blocked');
                },
            }),
        ).toBe(false);
    });
});

describe('finding v1 data', () => {
    it('reports nothing for a profile that has never run v1', () => {
        expect(findV1Data(storageOf({}))).toEqual({ sources: [], problems: [] });
    });

    it('offers the session and every readable preset, and lists the unreadable ones', () => {
        const finding = findV1Data(
            storageOf({
                [V1_STATE_KEY]: multiSection,
                [V1_PRESETS_KEY]: JSON.stringify([presetMajor, CORRUPT_PRESET, presetMinor]),
            }),
        );
        expect(finding.sources.map((source) => [source.kind, source.title])).toEqual([
            ['session', 'Last session from the old Ensemble'],
            ['preset', 'My Tune'],
            ['preset', 'Minor thing'],
        ]);
        expect(finding.problems).toEqual([
            {
                digest: expect.any(String),
                label: 'Saved progression “Broken tune”',
                reason: 'its chords could not be read.',
            },
        ]);
    });

    it('reports unreadable JSON and a wrong-shaped blob instead of an empty library', () => {
        expect(findV1Data(storageOf({ [V1_STATE_KEY]: CORRUPT_SESSION })).problems).toEqual([
            {
                digest: expect.any(String),
                label: 'Your last session in the old Ensemble',
                reason: 'its saved data is not readable.',
            },
        ]);
        expect(findV1Data(storageOf({ [V1_STATE_KEY]: CORRUPT_SHAPE_SESSION })).problems).toEqual([
            {
                digest: expect.any(String),
                label: 'Your last session in the old Ensemble',
                reason: 'its saved data has an unexpected shape.',
            },
        ]);
        expect(findV1Data(storageOf({ [V1_PRESETS_KEY]: '{"not":"a list"}' })).problems).toEqual([
            {
                digest: expect.any(String),
                label: 'Your saved progressions',
                reason: 'the saved list has an unexpected shape.',
            },
        ]);
    });

    it('gives a changed v1 session a new digest, under the one document id it always has', () => {
        const first = findV1Data(storageOf({ [V1_STATE_KEY]: multiSection })).sources[0];
        const second = findV1Data(storageOf({ [V1_STATE_KEY]: minorKey })).sources[0];
        // The digest is what makes it offered again; the id is what makes the offer an
        // UPDATE of the song already here rather than a second copy of it (DECISION
        // 2026-09-19).
        expect(first.digest).not.toBe(second.digest);
        expect(first.id).toBe(V1_SESSION_ID);
        expect(second.id).toBe(V1_SESSION_ID);
    });

    it('gives a changed saved progression its own document id — a different song, not a version', () => {
        const first = findV1Data(storageOf({ [V1_PRESETS_KEY]: JSON.stringify([presetMajor]) }))
            .sources[0];
        const second = findV1Data(storageOf({ [V1_PRESETS_KEY]: JSON.stringify([presetMinor]) }))
            .sources[0];
        expect(first.id).toBe(`v1-preset-${first.digest}`);
        expect(second.id).not.toBe(first.id);
    });

    it('keeps a preset’s identity stable across an earlier deletion (#1274 P1-a)', () => {
        // The old digest folded in the ARRAY INDEX: deleting `presetMajor` shifts
        // `presetMinor` from index 1 to index 0, which used to mint it a brand-new
        // digest/id — offering (and re-importing) a song already in the songbook.
        const before = findV1Data(
            storageOf({ [V1_PRESETS_KEY]: JSON.stringify([presetMajor, presetMinor]) }),
        );
        const minorBefore = before.sources.find((source) => source.title === 'Minor thing')!;

        const after = findV1Data(storageOf({ [V1_PRESETS_KEY]: JSON.stringify([presetMinor]) }));
        const minorAfter = after.sources[0];

        expect(minorAfter.digest).toBe(minorBefore.digest);
        expect(minorAfter.id).toBe(minorBefore.id);
    });

    it('gives two byte-identical presets distinct identities, but collapses onto the survivor when the earlier one is removed', () => {
        const duplicate = JSON.parse(JSON.stringify(presetMajor));
        const both = findV1Data(
            storageOf({ [V1_PRESETS_KEY]: JSON.stringify([presetMajor, duplicate]) }),
        );
        expect(both.sources).toHaveLength(2);
        const [firstDigest, secondDigest] = both.sources.map((source) => source.digest);
        expect(firstDigest).not.toBe(secondDigest);

        // Removing the FIRST of the two identical rows: the survivor becomes the first
        // occurrence of that content and takes over the first row's (already-offered)
        // digest, rather than minting a third, never-before-seen identity.
        const afterDelete = findV1Data(
            storageOf({ [V1_PRESETS_KEY]: JSON.stringify([duplicate]) }),
        );
        expect(afterDelete.sources[0].digest).toBe(firstDigest);
    });

    it('reports the remainder instead of silently dropping progressions past the per-run cap (#1274 P1-c)', () => {
        const many = Array.from({ length: 501 }, (_, i) => ({
            name: `Song ${i}`,
            sections: [{ id: 'a', label: 'A', value: 'I' }],
            isMinor: false,
        }));
        const finding = findV1Data(storageOf({ [V1_PRESETS_KEY]: JSON.stringify(many) }));
        expect(finding.sources.filter((source) => source.kind === 'preset')).toHaveLength(500);
        expect(finding.problems).toEqual([
            {
                digest: expect.any(String),
                label: 'Your saved progressions',
                reason: expect.stringContaining('1 more progression'),
            },
        ]);
    });
});

describe('round-tripping a real v1 session', () => {
    it('keeps the sections, their labels, chords, keys, meters and repeats', () => {
        const document = convert(multiSection);
        expect(document.schemaVersion).toBe(1);
        expect(document.chart.arrangement.sections).toEqual([
            {
                id: 'intro',
                label: 'Intro',
                value: 'I | IV',
                repeat: 2,
                key: '',
                timeSignature: '',
                seamless: false,
            },
            {
                id: 'verse',
                label: 'Verse',
                value: 'I | vi | IV | V',
                repeat: 1,
                key: 'F',
                timeSignature: '',
                seamless: false,
            },
            {
                id: 'bridge',
                label: 'Bridge',
                value: 'ii | V | I',
                repeat: 1,
                key: 'Bb',
                timeSignature: '3/4',
                seamless: true,
            },
        ]);
        expect(document.chart.arrangement.key).toBe('C');
        expect(document.chart.arrangement.isMinor).toBe(false);
        expect(document.chart.arrangement.notation).toBe('name');
        expect(document.chart.arrangement.lastChordPreset).toBe('Long form');
        expect(document.chart.performance.bpm).toBe(132);
    });

    it('keeps a non-4/4 meter and its custom grouping', () => {
        const document = convert(oddMeter);
        expect(document.chart.arrangement.timeSignature).toBe('7/8');
        expect(document.chart.arrangement.grouping).toEqual([2, 2, 3]);
        expect(document.chart.performance.bpm).toBe(96);
    });

    it('keeps a minor key', () => {
        const document = convert(minorKey);
        expect(document.chart.arrangement.key).toBe('A');
        expect(document.chart.arrangement.isMinor).toBe(true);
    });

    it('keeps non-default band voices, styles, volumes and groove feel', () => {
        const { band } = convert(tunedBand).chart;
        expect(band.chords).toMatchObject({
            style: 'funk',
            voice: 'pack:rhodes',
            autoSound: false,
            volume: 0.62,
            density: 'rich',
        });
        expect(band.bass).toMatchObject({ style: 'funk', volume: 0.48, octave: 34 });
        expect(band.soloist).toMatchObject({
            enabled: true,
            style: 'funk',
            phrasingIntensity: 0.8,
        });
        expect(band.harmony).toMatchObject({ enabled: true, complexity: 0.7 });
        expect(band.groove).toMatchObject({
            voice: 'pack:acoustic-kit',
            swing: 62,
            swingSub: '16th',
            humanize: 35,
            lastDrumPreset: 'Funk Break',
            genreFeel: 'Funk',
            lastSmartGenre: 'Funk',
        });
        // The drum pattern crosses too: a kick on every second beat of the bar.
        const kick = band.groove.pattern.find((lane) => lane.name === 'Kick');
        expect(kick?.steps.filter((step) => step === 1).length).toBe(16);
        // v1 never persists `soloist.tradeMode`, so it comes from the v2 baseline.
        expect(band.soloist.tradeMode).toBe('manual');
    });

    it('round-trips the default untouched session', () => {
        const document = convert(untouched);
        expect(document.chart.arrangement.sections.length).toBeGreaterThan(0);
        expect(document.chart.arrangement.key).toBe('C');
        expect(document.chart.performance.bpm).toBe(100);
        expect(document.chart.band.groove.lastSmartGenre).toBe('Rock');
    });

    it('applies v1 hydration rules the songbook codec would otherwise reject', () => {
        // Every value here is one a REAL v1 profile can hold: a retired soloist preset,
        // the numeric `density`/`swingSub` a pre-#1257 share link persisted, a retired
        // bass style, a pack this build no longer offers, and an out-of-range tempo.
        const blob = JSON.parse(multiSection);
        blob.bpm = 320.5;
        blob.chords.density = 0.5;
        blob.chords.style = 'retired-style';
        blob.groove.swingSub = 8;
        blob.groove.genreFeel = 'Shred';
        blob.bass.style = 'whole';
        blob.bass.voice = 'pack:pack-that-no-longer-exists';
        blob.soloist.preset = 'saxophone';
        blob.soloist.octave = 77;
        const { band, performance, arrangement } = convert(JSON.stringify(blob)).chart;
        expect(performance.bpm).toBe(240);
        expect(band.chords.density).toBe('standard');
        expect(band.chords.style).toBe('smart');
        expect(band.groove.swingSub).toBe('8th');
        expect(band.groove).toMatchObject({ genreFeel: 'Rock', lastSmartGenre: 'Rock' });
        expect(band.bass.style).toBe('smart');
        expect(band.bass.voice).toBe('synth');
        expect(band.soloist.preset).toBe('trumpet');
        expect(band.soloist.octave).toBe(72);
        expect(arrangement.sections).toHaveLength(3);
    });

    it('flags a landed document when a v1 voice names a sound pack this build no longer offers (#1274 P2-3)', () => {
        const blob = JSON.parse(multiSection);
        blob.bass.voice = 'pack:pack-that-no-longer-exists';
        const { source, finding } = onlySource(JSON.stringify(blob));
        const result = convertV1(source, v1ImportContext(finding, BASE));
        expect(result.kind).toBe('ok');
        expect(result.kind === 'ok' && result.soundFallback).toBe(true);
        expect(result.kind === 'ok' && result.document.chart.band.bass.voice).toBe('synth');
    });

    it('does not flag an import whose voices are all synth or a pack this build has', () => {
        const { source, finding } = onlySource(tunedBand);
        const result = convertV1(source, v1ImportContext(finding, BASE));
        expect(result.kind === 'ok' && result.soundFallback).toBe(false);
    });

    it('bounds a repeatedly-colliding section id at the codec cap instead of growing past it (#1274 P2-7)', () => {
        // Builds the exact chain the (unfixed) while-loop would walk: every rung one
        // more `-${targetIndex + 1}` suffix longer than the last, stopping just short of
        // the codec's 100-char id cap.
        const targetIndex = 60;
        const suffix = `-${targetIndex + 1}`;
        let chain = `v1-section-${targetIndex + 1}`;
        const chainIds: string[] = [chain];
        while (chainIds[chainIds.length - 1].length < 100) {
            chain = `${chain}${suffix}`;
            chainIds.push(chain);
        }
        chainIds.pop(); // that last rung is already >=100; keep only the shorter ones "used".
        expect(chainIds.length).toBeLessThan(targetIndex);

        const seedSections = chainIds.map((id, i) => ({ id, label: `Seed ${i}`, value: 'I' }));
        const fillerSections = Array.from(
            { length: targetIndex - seedSections.length },
            (_, i) => ({ id: `filler-${i}`, label: `Filler ${i}`, value: 'I' }),
        );
        const preset = {
            name: 'Chained ids',
            sections: [
                ...seedSections,
                ...fillerSections,
                // A prototype-member id at exactly `targetIndex`: rejected outright, so
                // it falls to the fallback `v1-section-${targetIndex + 1}` — already
                // `used` from the seeded chain above, forcing the while-loop to walk
                // every rung up to the one that would, uncapped, exceed 100 chars.
                { id: '__proto__', label: 'Target', value: 'IV | V' },
            ],
            isMinor: false,
        };
        const document = convert(undefined, [preset]);
        const ids = document.chart.arrangement.sections.map((section) => section.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) {
            expect(id.length).toBeLessThanOrEqual(100);
        }
    });

    it('rejects prototype-member keys instead of indexing a table with them', () => {
        const blob = JSON.parse(multiSection);
        blob.sections[0].id = 'constructor';
        blob.sections[1].id = '__proto__';
        blob.timeSignature = 'constructor';
        blob.key = '__proto__';
        blob.notation = 'constructor';
        const { arrangement } = convert(JSON.stringify(blob)).chart;
        expect(arrangement.sections.map((section) => section.id)).not.toContain('constructor');
        expect(arrangement.sections.map((section) => section.id)).not.toContain('__proto__');
        expect(new Set(arrangement.sections.map((section) => section.id)).size).toBe(3);
        expect(arrangement.timeSignature).toBe('4/4');
        expect(arrangement.key).toBe('C');
        expect(arrangement.notation).toBe('roman');
    });

    it('refuses a session with no chords left rather than saving a song nothing can open', () => {
        const blob = JSON.parse(multiSection);
        blob.sections = [{ id: 'a', label: 'A', value: '' }];
        const { source, finding } = onlySource(JSON.stringify(blob));
        expect(convertV1(source, v1ImportContext(finding, BASE))).toEqual({
            kind: 'failed',
            reason: 'it has no chords left to import.',
        });
    });
});

describe('round-tripping a real v1 saved progression', () => {
    it('keeps its name, chords, section labels and per-section key', () => {
        const document = convert(undefined, [presetMajor]);
        expect(document.title).toBe('My Tune');
        expect(document.id).toMatch(/^v1-preset-[0-9a-f]{16}$/);
        expect(
            document.chart.arrangement.sections.map((section) => [
                section.label,
                section.value,
                section.key,
                section.repeat,
            ]),
        ).toEqual([
            ['Head', 'I | vi | ii | V', 'G', 1],
            ['Tag', 'IV | I', '', 3],
        ]);
        expect(document.chart.arrangement.lastChordPreset).toBe('My Tune');
        // v1's own Save-progression payload carries `timestamp`; keep it as the origin.
        expect(document.createdAt).toBe(new Date(presetMajor.timestamp as number).toISOString());
    });

    it('keeps the minor flag the progression was saved with', () => {
        expect(convert(undefined, [presetMinor]).chart.arrangement.isMinor).toBe(true);
    });

    it('takes key and meter from the v1 session, as loading it in v1 would', () => {
        const finding = findV1Data(
            storageOf({
                [V1_STATE_KEY]: oddMeter,
                [V1_PRESETS_KEY]: JSON.stringify([presetMajor]),
            }),
        );
        const preset = finding.sources.find((source) => source.kind === 'preset')!;
        const result = convertV1(preset, v1ImportContext(finding, BASE));
        expect(result.kind === 'ok' && result.document.chart.arrangement).toMatchObject({
            timeSignature: '7/8',
            grouping: [2, 2, 3],
        });
    });

    it('inherits the v1 session band and tempo, as loading it in v1 would', () => {
        const withBand = findV1Data(
            storageOf({
                [V1_STATE_KEY]: tunedBand,
                [V1_PRESETS_KEY]: JSON.stringify([presetMajor]),
            }),
        );
        const preset = withBand.sources.find((source) => source.kind === 'preset')!;
        const converted = convertV1(preset, v1ImportContext(withBand, BASE));
        expect(converted.kind).toBe('ok');
        const band = converted.kind === 'ok' ? converted.document.chart.band : null;
        expect(band?.chords).toMatchObject({ style: 'funk', voice: 'pack:rhodes', volume: 0.62 });
        expect(band?.groove).toMatchObject({ swing: 62, genreFeel: 'Funk' });
        // Still the only two fields v1 never persisted, so still from the v2 baseline.
        expect(band?.soloist.tradeMode).toBe('manual');

        const withTempo = findV1Data(
            storageOf({
                [V1_STATE_KEY]: multiSection,
                [V1_PRESETS_KEY]: JSON.stringify([presetMajor]),
            }),
        );
        const tempoPreset = withTempo.sources.find((source) => source.kind === 'preset')!;
        const result = convertV1(tempoPreset, v1ImportContext(withTempo, BASE));
        expect(result.kind === 'ok' && result.document.chart.performance.bpm).toBe(132);
    });

    it('falls back to C major in 4/4 when there is no readable session', () => {
        const document = convert(undefined, [presetMajor]);
        expect(document.chart.arrangement.key).toBe('C');
        expect(document.chart.arrangement.timeSignature).toBe('4/4');
    });

    it('caps a long preset name at the codec lastChordPreset limit, not the title limit (#1274 P2-6)', () => {
        const longName = `${'A'.repeat(90)} — a very long saved progression name`;
        expect(longName.length).toBeGreaterThan(100);
        expect(longName.length).toBeLessThanOrEqual(200);
        const preset = {
            name: longName,
            sections: [{ id: 'a', label: 'A', value: 'I | IV | V | I' }],
            isMinor: false,
        };
        const document = convert(undefined, [preset]);
        expect(document.title).toBe(longName);
        expect(document.chart.arrangement.lastChordPreset.length).toBeLessThanOrEqual(100);
        expect(document.chart.arrangement.lastChordPreset).toBe(longName.slice(0, 100));
    });
});

describe('importing', () => {
    function runner(finding: V1Finding, ledger: Map<string, 'imported' | 'declined'>) {
        const saved: string[] = [];
        const context: V1ImportContext = v1ImportContext(finding, BASE);
        return {
            saved,
            async run(options: { fail?: string; existing?: string[] } = {}) {
                const outcome = await importV1({
                    offer: v1ImportOffer(finding, ledger),
                    context,
                    existing: new Map(
                        (options.existing ?? []).map((id) => [
                            id,
                            { document: placeholder(id), drafts: 0 },
                        ]),
                    ),
                    sessionMark: null,
                    save: async (document) => {
                        if (options.fail && document.title === options.fail) {
                            throw new Error('Storage is full.');
                        }
                        saved.push(document.id);
                        return { revision: 0 };
                    },
                    remember: (digest) => ledger.set(digest, 'imported'),
                    markSession: () => {},
                });
                return outcome;
            },
        };
    }

    /**
     * A row that is present but holds something else — enough for the "already here" guard,
     * which for a progression is answered by the id alone. The session's own rerun rules are
     * exercised against the REAL repository in the describe below, never against this.
     */
    function placeholder(id: string) {
        return { schemaVersion: 1, title: id, revision: 0, chart: {} };
    }

    const profile = () =>
        findV1Data(
            storageOf({
                [V1_STATE_KEY]: multiSection,
                [V1_PRESETS_KEY]: JSON.stringify([presetMajor, presetMinor]),
            }),
        );

    it('imports every offered item once, and nothing on a rerun', async () => {
        const ledger = new Map<string, 'imported' | 'declined'>();
        const finding = profile();
        const first = runner(finding, ledger);
        expect((await first.run()).imported).toHaveLength(3);
        expect(first.saved).toHaveLength(3);

        const second = runner(finding, ledger);
        const rerun = await second.run();
        expect(rerun.imported).toEqual([]);
        expect(second.saved).toEqual([]);
        expect(rerun.failures).toEqual([]);
    });

    it('never duplicates a saved progression the songbook already holds, even with the ledger lost', async () => {
        const finding = findV1Data(
            storageOf({ [V1_PRESETS_KEY]: JSON.stringify([presetMajor, presetMinor]) }),
        );
        const ids = finding.sources.map((source) => source.id);
        const fresh = runner(finding, new Map());
        const outcome = await fresh.run({ existing: ids });
        expect(fresh.saved).toEqual([]);
        expect(outcome.alreadyPresent).toBe(2);
        expect(outcome.failures).toEqual([]);
    });

    it('imports nothing new after an earlier preset is deleted from v1 and the run repeats (#1274 P1-a)', async () => {
        const ledger = new Map<string, 'imported' | 'declined'>();
        const existing = new Map<string, { document: ReturnType<typeof placeholder>; drafts: 0 }>();
        const save = async (document: { id: string }) => {
            existing.set(document.id, { document: placeholder(document.id), drafts: 0 });
            return { revision: 0 };
        };
        const remember = (digest: string) => ledger.set(digest, 'imported');
        const markSession = () => {};

        const before = findV1Data(
            storageOf({ [V1_PRESETS_KEY]: JSON.stringify([presetMajor, presetMinor]) }),
        );
        const first = await importV1({
            offer: v1ImportOffer(before, ledger),
            context: v1ImportContext(before, BASE),
            existing,
            sessionMark: null,
            save,
            remember,
            markSession,
        });
        expect(first.imported.map((document) => document.title)).toEqual([
            'My Tune',
            'Minor thing',
        ]);

        // Delete the FIRST v1 preset: every later index shifts down by one. The old,
        // index-folded digest would have re-minted "Minor thing" as a brand-new item —
        // caught by neither the ledger nor the existing-id guard, since both are keyed
        // off that same unstable digest.
        const after = findV1Data(storageOf({ [V1_PRESETS_KEY]: JSON.stringify([presetMinor]) }));
        const second = await importV1({
            offer: v1ImportOffer(after, ledger),
            context: v1ImportContext(after, BASE),
            existing,
            sessionMark: null,
            save,
            remember,
            markSession,
        });
        expect(second.imported).toEqual([]);
        expect(second.failures).toEqual([]);
        // "Minor thing" is recognized as already handled either way: the ledger still
        // carries its (stable) digest as imported, so `v1ImportOffer` drops it from the
        // offer before `importV1` ever sees it.
        expect(v1ImportOffer(after, ledger).sources).toEqual([]);
    });

    it('keeps what landed, reports the failure, and resumes only the rest', async () => {
        const ledger = new Map<string, 'imported' | 'declined'>();
        const finding = profile();
        const first = runner(finding, ledger);
        const outcome = await first.run({ fail: 'Minor thing' });
        expect(outcome.imported).toHaveLength(2);
        expect(outcome.failures).toEqual([{ title: 'Minor thing', reason: 'Storage is full.' }]);
        expect(first.saved).toHaveLength(2);

        const second = runner(finding, ledger);
        const resumed = await second.run();
        expect(resumed.imported.map((document) => document.title)).toEqual(['Minor thing']);
        expect(second.saved).toHaveLength(1);
    });

    it('imports the readable items and still reports the unreadable ones', async () => {
        const finding = findV1Data(
            storageOf({
                [V1_STATE_KEY]: CORRUPT_SESSION,
                [V1_PRESETS_KEY]: JSON.stringify([CORRUPT_PRESET, presetMajor]),
            }),
        );
        const ledger = new Map<string, 'imported' | 'declined'>();
        const outcome = await runner(finding, ledger).run();
        expect(outcome.imported.map((document) => document.title)).toEqual(['My Tune']);
        expect(outcome.problems.map((problem) => problem.label)).toEqual([
            'Your last session in the old Ensemble',
            'Saved progression “Broken tune”',
        ]);
        expect(describeV1Outcome(outcome)).toBe(
            "Imported 1 · 2 couldn't be brought over: Your last session in the old Ensemble — its saved data is not readable. · Saved progression “Broken tune” — its chords could not be read.",
        );
    });

    it('surfaces sound-pack fallbacks in the outcome and its summary line (#1274 P2-3)', async () => {
        const blob = JSON.parse(multiSection);
        blob.bass.voice = 'pack:pack-that-no-longer-exists';
        const finding = findV1Data(storageOf({ [V1_STATE_KEY]: JSON.stringify(blob) }));
        const outcome = await runner(finding, new Map()).run();
        expect(outcome.soundFallbacks).toBe(1);
        expect(describeV1Outcome(outcome)).toBe(
            "Imported 1 · 1 song had sounds this app doesn't have; it uses the synth instead",
        );
    });

    it('drops a declined offer without hiding v1 data that shows up later', () => {
        const finding = profile();
        const ledger = new Map<string, 'imported' | 'declined'>(
            [...finding.sources, ...finding.problems].map((entry) => [entry.digest, 'declined']),
        );
        expect(v1ImportOffer(finding, ledger)).toEqual({ sources: [], problems: [] });

        const later = findV1Data(
            storageOf({
                [V1_STATE_KEY]: multiSection,
                [V1_PRESETS_KEY]: JSON.stringify([presetMajor, presetMinor, CORRUPT_PRESET]),
            }),
        );
        const offer = v1ImportOffer(later, ledger);
        expect(offer.problems.map((problem) => problem.label)).toEqual([
            'Saved progression “Broken tune”',
        ]);
    });
});

describe('agreement with v1 itself', () => {
    /**
     * The claim the whole module rests on: an imported song is what v1 would have
     * loaded from those same bytes. Checked against v1's own `hydrateState()` — the
     * reader that runs on every v1 boot — rather than against this file's expectations.
     */
    it('lands every shared field where v1 hydration puts it', () => {
        window.localStorage.setItem(V1_STATE_KEY, tunedBand);
        dispatch(ACTIONS.RESET_STATE);
        hydrateState();
        const live = getState();
        const { arrangement, performance, band } = convert(tunedBand).chart;

        expect(arrangement.key).toBe(live.arranger.key);
        expect(arrangement.isMinor).toBe(live.arranger.isMinor);
        expect(arrangement.timeSignature).toBe(live.arranger.timeSignature);
        expect(arrangement.notation).toBe(live.arranger.notation);
        expect(arrangement.lastChordPreset).toBe(live.arranger.lastChordPreset);
        expect(arrangement.sections.map((section) => section.value)).toEqual(
            live.arranger.sections.map((section) => section.value),
        );
        expect(performance.bpm).toBe(live.playback.bpm);
        expect(performance.complexity).toBe(live.playback.complexity);
        expect(performance.randomizeSeed).toBe(live.arranger.randomizeSeed);
        for (const lane of ['chords', 'bass', 'soloist', 'harmony', 'groove'] as const) {
            expect(band[lane].enabled).toBe(live[lane].enabled);
            expect(band[lane].voice).toBe(live[lane].voice);
            expect(band[lane].autoSound).toBe(live[lane].autoSound);
            expect(band[lane].volume).toBe(live[lane].volume);
            expect(band[lane].reverb).toBe(live[lane].reverb);
        }
        expect(band.chords).toMatchObject({
            style: live.chords.style,
            octave: live.chords.octave,
            density: live.chords.density,
        });
        expect(band.bass).toMatchObject({ style: live.bass.style, octave: live.bass.octave });
        expect(band.soloist).toMatchObject({
            style: live.soloist.style,
            preset: live.soloist.preset,
            octave: live.soloist.octave,
            mode: live.soloist.mode,
            autoMode: live.soloist.autoMode,
            phrasingIntensity: live.soloist.phrasingIntensity,
        });
        expect(band.harmony).toMatchObject({
            style: live.harmony.style,
            octave: live.harmony.octave,
            complexity: live.harmony.complexity,
        });
        expect(band.groove).toMatchObject({
            swing: live.groove.swing,
            swingSub: live.groove.swingSub,
            humanize: live.groove.humanize,
            lastDrumPreset: live.groove.lastDrumPreset,
            genreFeel: live.groove.genreFeel,
            lastSmartGenre: live.groove.lastSmartGenre,
            measures: live.groove.measures,
        });
        expect(band.groove.pattern.find((lane) => lane.name === 'Kick')?.steps).toEqual(
            live.groove.instruments.find((instrument) => instrument.name === 'Kick')?.steps,
        );
    });

    /**
     * The normalizers `import-v1.ts` borrows from v1's hydration, pinned in the repo that
     * owns them. Each line is a rule a real profile depends on and the songbook codec
     * would otherwise reject outright.
     */
    it('pins the hydration normalizers the import depends on', () => {
        // #1258 — a forged/legacy `null` must land on the default, not coerce to 0 and
        // silently mute the lane.
        expect(clamp(null, 0, 1, 1)).toBe(1);
        expect(clamp('0.42', 0, 1, 1)).toBeCloseTo(0.42);
        expect(clamp(Number.POSITIVE_INFINITY, 0, 100, 20)).toBe(20);
        // Retired soloist presets coerce to the one surviving voice.
        expect(normalizeSoloistPreset('saxophone')).toBe('trumpet');
        expect(normalizeSoloistPreset('trumpet')).toBe('trumpet');
        // Sound-source mode: a save with no `autoSound` follows the voice it pinned.
        expect(hydrateAutoSound(undefined, 'synth')).toBe(true);
        expect(hydrateAutoSound(undefined, 'pack:rhodes')).toBe(false);
        expect(hydrateAutoSound(false, 'synth')).toBe(false);
        // Free-text display strings: stripped and bounded, never dropped.
        expect(sanitizeDisplayString('Verse <b>=1', 'fallback')).toBe('Verse b1');
        expect(sanitizeDisplayString(42, 'fallback')).toBe('fallback');
        // Sections: prototype-member ids rejected, chord text stripped and capped.
        const [section] = validateSections([
            { id: 'constructor', label: 'A', value: 'I | <IV>', key: 'A#', repeat: 999 },
        ]);
        expect(section.id).not.toBe('constructor');
        expect(section.value).toBe('I | IV');
        expect(section.key).toBe('Bb');
        expect(section.repeat).toBe(64);
        expect(validateSections('not an array' as unknown as unknown[])).toEqual([]);
    });
});

describe('the v1 keys', () => {
    it('are byte-identical after a find, a conversion and a full import', async () => {
        window.localStorage.clear();
        window.localStorage.setItem(V1_STATE_KEY, tunedBand);
        window.localStorage.setItem(
            V1_PRESETS_KEY,
            JSON.stringify([presetMajor, CORRUPT_PRESET, presetMinor]),
        );
        const before = {
            state: window.localStorage.getItem(V1_STATE_KEY),
            presets: window.localStorage.getItem(V1_PRESETS_KEY),
            keys: [...store.keys()],
        };

        const finding = findV1Data(window.localStorage);
        await importV1({
            offer: finding,
            context: v1ImportContext(finding, BASE),
            existing: new Map(),
            sessionMark: null,
            save: async () => ({ revision: 0 }),
            remember: () => {},
            markSession: () => {},
        });

        expect(window.localStorage.getItem(V1_STATE_KEY)).toBe(before.state);
        expect(window.localStorage.getItem(V1_PRESETS_KEY)).toBe(before.presets);
        expect([...store.keys()]).toEqual(before.keys);
    });
});

/**
 * The session's identity and rerun rules (DECISION 2026-09-19), driven through the REAL
 * guest repository and the REAL per-device ledger — the same four collaborators
 * `app/ensemble.tsx`'s `importV1Songs` wires together, so a rule that only holds against a
 * stand-in for the songbook is not one this suite can report as passing.
 */
describe('re-running the import', () => {
    const database = installFakeIndexedDB();
    /** Unsaved drafts this "device" is holding, by document id — the shell reads these from
     * `repository.recoverySlotCount`, which needs no IndexedDB and is not what is under test. */
    const drafts = new Map<string, number>();

    beforeEach(() => {
        database.reset();
        drafts.clear();
        store.delete(V1_IMPORT_LEDGER_KEY);
        store.delete(V1_SESSION_MARK_KEY);
    });

    /**
     * Exactly the wiring in `importV1Songs`, minus the React state it writes afterwards.
     *
     * `options.save` replaces the store call for the crash tests: the seam this import is
     * built to survive is "the page went away part way through a write", and the only honest
     * way to test it is to make the write end that way.
     */
    async function runImport(
        session?: string,
        presets?: unknown[],
        options: {
            save?: (document: ChartDocument, expected: number | null) => Promise<unknown>;
            wholeFinding?: boolean;
        } = {},
    ) {
        const finding = findV1Data(
            storageOf({
                [V1_STATE_KEY]: session,
                [V1_PRESETS_KEY]: presets ? JSON.stringify(presets) : undefined,
            }),
        );
        const library = await repositoryList();
        const outcome = await importV1({
            // `wholeFinding` is the song-menu path, which offers everything regardless of the
            // ledger; the default is the automatic offer, which the ledger filters.
            offer: options.wholeFinding ? finding : v1ImportOffer(finding, v1ImportLedger()),
            context: v1ImportContext(finding, BASE),
            existing: new Map(
                library.map((song) => [
                    song.id,
                    { document: song, drafts: drafts.get(song.id) ?? 0 },
                ]),
            ),
            sessionMark: v1SessionMark(),
            save: options.save ?? ((document, expected) => repositorySave(document, expected)),
            remember: (digest) => rememberV1Import([digest], 'imported'),
            markSession: rememberV1SessionMark,
        });
        // The shell's own last two steps, which the ledger rules depend on (patch R1/R6).
        rememberV1Import(outcome.acknowledged, 'shown');
        return outcome;
    }

    /** The same session bytes with a different tempo: changed v1 data, same song. */
    function atTempo(session: string, bpm: number): string {
        return JSON.stringify({ ...JSON.parse(session), bpm });
    }

    async function sessionDocument() {
        return (await repositoryList()).find((song) => song.id === V1_SESSION_ID);
    }

    it('lands the v1 session as one document with the stable id', async () => {
        const outcome = await runImport(multiSection, [presetMajor]);
        expect(outcome.imported.map((document) => document.id)).toContain(V1_SESSION_ID);
        const landed = await sessionDocument();
        expect(landed?.title).toBe('Last session from the old Ensemble');
        expect(landed?.revision).toBe(0);
    });

    it('imports nothing at all when the same profile is run again', async () => {
        await runImport(multiSection, [presetMajor]);
        const rerun = await runImport(multiSection, [presetMajor]);
        expect(rerun.imported).toEqual([]);
        expect(rerun.updated).toEqual([]);
        expect(rerun.failures).toEqual([]);
        expect((await sessionDocument())?.revision).toBe(0);
        expect(await repositoryList()).toHaveLength(2);
    });

    it('still writes nothing on a rerun whose ledger has been lost', async () => {
        await runImport(multiSection);
        // The whole per-device memory gone (cleared site data, a different profile copy):
        // the offer comes back, and the songbook's own copy is what stops a second write.
        store.delete(V1_IMPORT_LEDGER_KEY);
        store.delete(V1_SESSION_MARK_KEY);
        const rerun = await runImport(multiSection);
        expect(rerun.imported).toEqual([]);
        expect(rerun.updated).toEqual([]);
        expect(rerun.alreadyPresent).toBe(1);
        expect((await sessionDocument())?.revision).toBe(0);
    });

    it('updates the one document when the old app has moved on, never adding a second', async () => {
        await runImport(multiSection);
        const changed = atTempo(multiSection, 88);
        const rerun = await runImport(changed);

        expect(rerun.imported).toEqual([]);
        expect(rerun.updated.map((document) => document.id)).toEqual([V1_SESSION_ID]);
        const library = await repositoryList();
        expect(library.map((song) => song.id)).toEqual([V1_SESSION_ID]);
        expect(library[0].chart.performance.bpm).toBe(88);
        expect(library[0].revision).toBe(1);
        // And the update itself is not mistaken for a musician's edit next time round.
        const third = await runImport(atTempo(multiSection, 76));
        expect(third.failures).toEqual([]);
        expect((await sessionDocument())?.chart.performance.bpm).toBe(76);
    });

    it('leaves a copy that was edited here alone, and says so', async () => {
        await runImport(multiSection);
        const landed = (await sessionDocument())!;
        // A Save in v2: the musician has made this song theirs.
        await repositorySave({ ...landed, title: 'My arrangement' }, landed.revision);

        const rerun = await runImport(atTempo(multiSection, 88));
        expect(rerun.updated).toEqual([]);
        expect(rerun.failures).toEqual([
            {
                title: 'Last session from the old Ensemble',
                reason: 'it has changed in the old Ensemble, but you have edited this copy here — nothing was overwritten.',
            },
        ]);
        const kept = (await sessionDocument())!;
        expect(kept.title).toBe('My arrangement');
        expect(kept.chart.performance.bpm).toBe(JSON.parse(multiSection).bpm);
    });

    it('leaves it alone for an unsaved draft too, which no revision can see', async () => {
        await runImport(multiSection);
        drafts.set(V1_SESSION_ID, 1);

        const rerun = await runImport(atTempo(multiSection, 88));
        expect(rerun.updated).toEqual([]);
        expect(rerun.failures.map((failure) => failure.title)).toEqual([
            'Last session from the old Ensemble',
        ]);
        expect((await sessionDocument())?.chart.performance.bpm).toBe(JSON.parse(multiSection).bpm);
    });

    it('stops the automatic offer from re-opening for data it has already reported (patch R1)', async () => {
        const outcome = await runImport(CORRUPT_SESSION, [CORRUPT_PRESET, presetMajor]);
        expect(outcome.problems).toHaveLength(2);
        expect(outcome.acknowledged).toHaveLength(2);
        expect(outcome.imported.map((document) => document.title)).toEqual(['My Tune']);

        // The next load asks the ledger the same question the shell does, and there is
        // nothing left to open the card for.
        const rerun = await runImport(CORRUPT_SESSION, [CORRUPT_PRESET, presetMajor]);
        expect(rerun.problems).toEqual([]);
        expect(rerun.imported).toEqual([]);
        expect(rerun.alreadyPresent).toBe(0);

        // But the menu path — which ignores the ledger — still has the item and its reason.
        const asked = await runImport(CORRUPT_SESSION, [CORRUPT_PRESET, presetMajor], {
            wholeFinding: true,
        });
        expect(asked.problems.map((problem) => problem.reason)).toEqual([
            'its saved data is not readable.',
            'its chords could not be read.',
        ]);
    });

    it('does NOT acknowledge a failure the store produced — that one is retryable (patch R1)', async () => {
        const full = await runImport(multiSection, undefined, {
            save: async () => {
                throw new Error('Storage is full.');
            },
        });
        expect(full.failures).toEqual([
            { title: 'Last session from the old Ensemble', reason: 'Storage is full.' },
        ]);
        expect(full.acknowledged).toEqual([]);

        // Storage frees up: the same bytes are still on offer, and land.
        const retry = await runImport(multiSection);
        expect(retry.imported.map((document) => document.id)).toEqual([V1_SESSION_ID]);
    });

    it('says a collision is a collision, in its own words, and keeps it retryable (patch R7)', async () => {
        const clash = await runImport(multiSection, undefined, {
            save: async () => {
                throw new ConflictError();
            },
        });
        expect(clash.failures[0].reason).toBe(
            'another tab was bringing this over at the same time. Nothing was lost — try again and it will be here.',
        );
        // Never the store's own editing advice, which is about a chart on a stand.
        expect(clash.failures[0].reason).not.toContain('save a copy');
        expect(clash.acknowledged).toEqual([]);
    });

    it('calls an unchanged old app with an edited copy here "already here", not a failure (patch R4)', async () => {
        await runImport(multiSection);
        const landed = (await sessionDocument())!;
        await repositorySave({ ...landed, title: 'My arrangement' }, landed.revision);

        // Same v1 bytes, asked for again from the menu: there is no newer old-Ensemble
        // version of this song, so there is nothing to bring over and nothing to report.
        const asked = await runImport(multiSection, undefined, { wholeFinding: true });
        expect(asked.failures).toEqual([]);
        expect(asked.updated).toEqual([]);
        expect(asked.alreadyPresent).toBe(1);
        expect((await sessionDocument())?.title).toBe('My arrangement');
    });

    it('still refuses, and says why, when the old app HAS moved on (patch R4)', async () => {
        await runImport(multiSection);
        const landed = (await sessionDocument())!;
        await repositorySave({ ...landed, title: 'My arrangement' }, landed.revision);

        const rerun = await runImport(atTempo(multiSection, 88), undefined, {
            wholeFinding: true,
        });
        expect(rerun.failures[0].reason).toContain('it has changed in the old Ensemble');
        // A standing refusal, not a transient one: acknowledged, so the automatic offer
        // stops re-opening for these exact v1 bytes.
        expect(rerun.acknowledged).toHaveLength(1);
        expect((await sessionDocument())?.title).toBe('My arrangement');
    });

    it('heals when the page dies AFTER the store committed the update (patch R5)', async () => {
        await runImport(multiSection);
        // The write lands; the tab goes away before anything else in the run does.
        await runImport(atTempo(multiSection, 88), undefined, {
            save: async (document, expected) => {
                await repositorySave(document, expected);
                throw new Error('the tab went away');
            },
        });
        expect((await sessionDocument())?.chart.performance.bpm).toBe(88);

        // A third version must still be recognised as the import's own work.
        const third = await runImport(atTempo(multiSection, 76), undefined, {
            wholeFinding: true,
        });
        expect(third.failures).toEqual([]);
        expect(third.updated).toHaveLength(1);
        expect((await sessionDocument())?.chart.performance.bpm).toBe(76);
    });

    it('heals when the page dies BEFORE the store committed the update (patch R5)', async () => {
        await runImport(multiSection);
        await runImport(atTempo(multiSection, 88), undefined, {
            save: async () => {
                throw new Error('the tab went away');
            },
        });
        // Nothing was written, so the copy here is still the first import's.
        expect((await sessionDocument())?.chart.performance.bpm).toBe(JSON.parse(multiSection).bpm);

        const third = await runImport(atTempo(multiSection, 76), undefined, {
            wholeFinding: true,
        });
        expect(third.failures).toEqual([]);
        expect(third.updated).toHaveLength(1);
        expect((await sessionDocument())?.chart.performance.bpm).toBe(76);
    });

    it('never heals in the unsafe direction: a real edit after a lost write is still refused (patch R5)', async () => {
        await runImport(multiSection);
        await runImport(atTempo(multiSection, 88), undefined, {
            save: async () => {
                throw new Error('the tab went away');
            },
        });
        // The musician now saves their own version over the copy that is here. Its revision
        // is exactly the one the lost write would have produced — which is why the mark
        // records CONTENT and not a revision number.
        const landed = (await sessionDocument())!;
        await repositorySave({ ...landed, title: 'My arrangement' }, landed.revision);

        const third = await runImport(atTempo(multiSection, 76), undefined, {
            wholeFinding: true,
        });
        expect(third.updated).toEqual([]);
        expect(third.failures[0].reason).toContain('you have edited this copy here');
        expect((await sessionDocument())?.title).toBe('My arrangement');
    });

    /**
     * The card's promise and the run's behaviour, over every state the session can be in
     * (#1274 patch N2). They used to be two rules and disagreed after an interrupted
     * update — the card said "everything is already here" while the run would have finished
     * the job, with no button to press. `planV1Import` and `importV1` now reach the same
     * verdict through `decideV1Item`, and this is what holds them to it.
     */
    describe('the card and the run agree', () => {
        /** Puts the songbook and the device memory into one named state. */
        const states: Array<{ name: string; setUp: () => Promise<string> }> = [
            {
                name: 'nothing here yet',
                setUp: async () => multiSection,
            },
            {
                name: 'already here, unchanged',
                setUp: async () => {
                    await runImport(multiSection);
                    return multiSection;
                },
            },
            {
                name: 'the old app has moved on',
                setUp: async () => {
                    await runImport(multiSection);
                    return atTempo(multiSection, 88);
                },
            },
            {
                name: 'moved on AND edited here',
                setUp: async () => {
                    await runImport(multiSection);
                    const landed = (await sessionDocument())!;
                    await repositorySave({ ...landed, title: 'Mine now' }, landed.revision);
                    return atTempo(multiSection, 88);
                },
            },
            {
                name: 'edited here, old app unchanged (localOnly)',
                setUp: async () => {
                    await runImport(multiSection);
                    const landed = (await sessionDocument())!;
                    await repositorySave({ ...landed, title: 'Mine now' }, landed.revision);
                    return multiSection;
                },
            },
            {
                name: 'an update interrupted before it committed',
                setUp: async () => {
                    await runImport(multiSection);
                    await runImport(atTempo(multiSection, 88), undefined, {
                        save: async () => {
                            throw new Error('the tab went away');
                        },
                    });
                    return atTempo(multiSection, 88);
                },
            },
            {
                name: 'an update interrupted after it committed',
                setUp: async () => {
                    await runImport(multiSection);
                    await runImport(atTempo(multiSection, 88), undefined, {
                        save: async (document, expected) => {
                            await repositorySave(document, expected);
                            throw new Error('the tab went away');
                        },
                    });
                    return atTempo(multiSection, 76);
                },
            },
            {
                name: 'the mark is gone and the copy is identical',
                setUp: async () => {
                    await runImport(multiSection);
                    store.delete(V1_SESSION_MARK_KEY);
                    return multiSection;
                },
            },
            {
                name: 'the mark is gone and the old app has moved on',
                setUp: async () => {
                    await runImport(multiSection);
                    store.delete(V1_SESSION_MARK_KEY);
                    return atTempo(multiSection, 88);
                },
            },
            {
                name: 'an unsaved draft is being held here',
                setUp: async () => {
                    await runImport(multiSection);
                    drafts.set(V1_SESSION_ID, 1);
                    return atTempo(multiSection, 88);
                },
            },
        ];

        for (const state of states) {
            it(`promises what it delivers — ${state.name}`, async () => {
                const session = await state.setUp();
                // The menu path: everything on offer, so the plan has to answer for the
                // whole profile rather than whatever the ledger happens to have filtered.
                const finding = findV1Data(storageOf({ [V1_STATE_KEY]: session }));
                const library = await repositoryList();
                const existing = new Map(
                    library.map((song) => [
                        song.id,
                        { document: song, drafts: drafts.get(song.id) ?? 0 },
                    ]),
                );
                const plan = planV1Import(
                    finding,
                    v1ImportContext(finding, BASE),
                    existing,
                    v1SessionMark(),
                );
                const outcome = await runImport(session, undefined, { wholeFinding: true });

                expect(plan.fresh).toBe(outcome.imported.length + outcome.updated.length);
                expect(plan.alreadyHere).toBe(outcome.alreadyPresent);
                expect(plan.blocked.map((item) => item.reason)).toEqual(
                    outcome.failures.map((failure) => failure.reason),
                );
                // A dismissal without a run acknowledges `plan.blocked`'s digests, so they must
                // be exactly what the run itself would have acknowledged (no unreadable data in
                // these profiles, so `acknowledged` holds refused sources only).
                expect(plan.blocked.map((item) => item.digest)).toEqual(outcome.acknowledged);
            });
        }
    });

    it('retires the content it replaced once that write is finished (patch N3)', async () => {
        await runImport(multiSection);
        const first = (await sessionDocument())!;
        await runImport(atTempo(multiSection, 88));
        expect(v1SessionMark()?.replaced).toBeNull();

        // The musician reverts to what the copy held BEFORE that update and saves it. Its
        // content is the mark's old `replaced` witness — which must no longer authorise
        // anything, or their revert reads as the import's own work.
        const updated = (await sessionDocument())!;
        if (first.schemaVersion !== 1 || updated.schemaVersion !== 1) {
            throw new Error('an imported v1 session lands at schemaVersion 1');
        }
        await repositorySave(
            { ...updated, title: first.title, chart: first.chart },
            updated.revision,
        );

        const later = await runImport(atTempo(multiSection, 76), undefined, {
            wholeFinding: true,
        });
        expect(later.updated).toEqual([]);
        expect(later.failures[0].reason).toContain('you have edited this copy here');
    });

    it('writes nothing whatsoever when the v1 profile cannot be read', async () => {
        const outcome = await runImport(CORRUPT_SESSION, [CORRUPT_PRESET]);
        expect(outcome.imported).toEqual([]);
        expect(outcome.updated).toEqual([]);
        expect(outcome.problems).toHaveLength(2);
        expect(await repositoryList()).toEqual([]);
    });
});
