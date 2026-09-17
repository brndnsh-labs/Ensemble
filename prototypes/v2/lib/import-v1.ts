/**
 * import-v1.ts — one-time, source-preserving import of a v1 profile's saved music
 * into the v2 guest songbook (#1274).
 *
 * Why this exists: the rollout is a hard cut (`docs/design/ensemble-v2-rollout.md`
 * decisions 3 and 4) — the day v2 takes `/`, v1 is gone, with no `/v1/` grace path.
 * `/` and `/v2/` share an origin, so v1's `localStorage` is readable from here, and
 * this module is the ONLY path an existing musician's saved songs have into v2.
 *
 * Read-only by construction, three ways:
 *
 * 1. Every entry point takes a `V1ReadOnlyStorage` — a `getItem`-shaped handle. This
 *    module never holds anything it could call `setItem`/`removeItem` on, so it
 *    cannot write, rename or delete a v1 key even by accident.
 * 2. It reads the raw strings itself instead of going through v1's `storage.get`,
 *    which returns `[]` for BOTH "absent" and "unreadable" — a corrupt profile must
 *    be reported, never silently read as an empty library.
 * 3. It never calls v1's `hydrateState()`: that writes the live state slices (and,
 *    on a mixer-version bump, calls `saveCurrentState()`). Instead it reuses v1's own
 *    exported normalizers (`clamp`, `validateSections`, `normalizeSoloistPreset`, …)
 *    so an imported song is what v1 ITSELF would have loaded from those bytes —
 *    including the retired soloist presets and the numeric `density`/`swingSub` a
 *    pre-#1257 share link persisted, both of which a real profile still holds and
 *    neither of which the songbook codec would accept raw.
 *
 * Every candidate then goes through the canonical `validateChartDocument`, so nothing
 * lands in the songbook that the rest of the app cannot open. Conversion is per item:
 * one unconvertible progression is reported with a reason, never dropped silently and
 * never fatal to the rest of the import.
 */

import { KEY_ORDER, TIME_SIGNATURES } from '../../../public/config.js';
import {
    isKnownBassStyle,
    isKnownChordStyle,
    isKnownHarmonyStyle,
    isKnownSoloistStyle,
} from '../../../public/data/instrument-styles.js';
import { GENRE_FEELS, resolveGenre } from '../../../public/data/smart-genres.js';
import { packsForInstrument } from '../../../public/data/sound-packs.js';
import { stringHash31, stringHash33 } from '../../../public/engine/hash-utils.js';
import { hydrateVoice } from '../../../public/engine/instrument-registry.js';
import { resolveSoloistMode } from '../../../public/engine/soloist-mode-policy.js';
import { isValidTimeSignatureGrouping } from '../../../public/meter.js';
import { normalizeSongSeed, stripDangerousChars } from '../../../public/sanitize.js';
import { validateChartDocument } from '../../../public/songbook/codec.js';
import {
    CHART_GROOVE_PATTERN_LANE_NAMES,
    type ChartBand,
    type ChartContent,
    type ChartDocument,
    type ChartGroovePatternLane,
    type ChartPerformance,
    type ChartSection,
} from '../../../public/songbook/types.js';
import {
    INSTRUMENT_REVERB_DEFAULTS,
    MIXER_SETTINGS_VERSION,
} from '../../../public/state/instruments.js';
import { tryDecompressSections } from '../../../public/state/share-codec.js';
import {
    clamp,
    hydrateAutoSound,
    normalizeSoloistPreset,
    normalizeSwingSub,
    sanitizeDisplayString,
    validateSections,
} from '../../../public/state/state-hydration.js';
import {
    type InstrumentModule,
    type InstrumentVoice,
    isChordDensity,
} from '../../../public/types.js';
import { normalizeKey } from '../../../public/utils.js';

/** The two v1 keys this module reads. Never written, renamed or removed. */
export const V1_STATE_KEY = 'ensemble_currentState';
export const V1_PRESETS_KEY = 'ensemble_userPresets';

/** The only storage capability this module is given: reads. */
export interface V1ReadOnlyStorage {
    getItem(key: string): string | null;
}

export type V1SourceKind = 'session' | 'preset';

/** One importable thing found in v1 storage. */
export interface V1Source {
    kind: V1SourceKind;
    /**
     * Content identity of the v1 bytes. The import ledger remembers digests rather
     * than a single "already offered" boolean, so v1 data that changes or appears
     * LATER is offered again instead of being silently skipped.
     */
    digest: string;
    /** Deterministic v2 document id — also where this song's v1 provenance lives. */
    id: string;
    title: string;
    /** The parsed v1 record. Held for conversion only; never written back. */
    record: Record<string, unknown>;
}

/** v1 data that exists but cannot be read. Reported, never treated as "nothing there". */
export interface V1Problem {
    digest: string;
    label: string;
    reason: string;
}

export interface V1Finding {
    sources: V1Source[];
    problems: V1Problem[];
}

/** Ledger of what this device has already imported or declined, keyed by digest. */
export type V1ImportLedger = ReadonlyMap<string, 'imported' | 'declined'>;

/**
 * Defaults for the fields a v1 save does not carry: `soloist.tradeMode` and
 * `chords.instrument` (never persisted), plus the whole band for a saved chord
 * progression, which stores only chords. Taken from a document already in the v2
 * songbook — the same baseline `lib/starters.ts` and the iReal import dialog use.
 */
export interface V1ImportContext {
    performance: ChartPerformance;
    band: ChartBand;
    /**
     * Key/meter for an imported progression. v1's own "load this preset" gesture
     * (`handleSelect` in `PresetLibrary.tsx`) replaces the sections and `isMinor` and
     * keeps the session's key and meter, so the import does the same.
     */
    key: string;
    timeSignature: string;
    grouping: number[] | null;
}

export type V1Conversion =
    | { kind: 'ok'; document: ChartDocument }
    | { kind: 'failed'; reason: string };

export interface V1ImportOutcome {
    imported: ChartDocument[];
    /** Items that could not be converted or saved, each with a reason to show. */
    failures: Array<{ title: string; reason: string }>;
    /** Items already in the songbook from an earlier run; not re-saved, not failures. */
    alreadyPresent: number;
    problems: V1Problem[];
}

const SESSION_TITLE = 'Last session from the old Ensemble';
/** Mirrors `validateSections`' own 500-section cap; a profile cannot hold more usefully. */
const MAX_PRESETS = 500;
const PROTOTYPE_MEMBER_NAMES: ReadonlySet<string> = new Set(
    Object.getOwnPropertyNames(Object.prototype),
);
const NOTATIONS = ['roman', 'name', 'nns'];
const PATTERN_LANE_NAMES: ReadonlySet<string> = new Set(CHART_GROOVE_PATTERN_LANE_NAMES);

/**
 * Content identity for a v1 record: two independent djb2 folds of its exact bytes,
 * concatenated as hex. Not a security boundary — it decides "have I seen this
 * already?", and the deterministic document id it feeds gives the repository a second,
 * independent guard against importing the same item twice.
 */
function digestOf(text: string): string {
    const high = (stringHash33(text) >>> 0).toString(16).padStart(8, '0');
    const low = (stringHash31(text) >>> 0).toString(16).padStart(8, '0');
    return `${high}${low}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readJson(
    storage: V1ReadOnlyStorage,
    key: string,
):
    | { kind: 'absent' }
    | { kind: 'ok'; raw: string; value: unknown }
    | { kind: 'unreadable'; raw: string } {
    let raw: string | null = null;
    try {
        raw = storage.getItem(key);
    } catch {
        // A storage read can throw outright (blocked site data). Nothing to import, and
        // nothing is wrong with the user's data, so stay quiet.
        return { kind: 'absent' };
    }
    if (raw === null || raw === '') {
        return { kind: 'absent' };
    }
    try {
        return { kind: 'ok', raw, value: JSON.parse(raw) };
    } catch {
        return { kind: 'unreadable', raw };
    }
}

/**
 * What is importable in this browser's v1 profile, and what is there but unreadable.
 *
 * Defensive on purpose: a JSON parse failure or a wrong-shaped blob is REPORTED as a
 * problem. Reporting is the whole point — with v1 about to be deleted, "we found
 * nothing" and "we could not read your songs" must not look the same.
 */
export function findV1Data(storage: V1ReadOnlyStorage): V1Finding {
    const sources: V1Source[] = [];
    const problems: V1Problem[] = [];

    const session = readJson(storage, V1_STATE_KEY);
    if (session.kind === 'unreadable') {
        problems.push({
            digest: digestOf(session.raw),
            label: 'Your last session in the old Ensemble',
            reason: 'its saved data is not readable.',
        });
    } else if (session.kind === 'ok') {
        // `Array.isArray(sections)` is v1's own gate on this blob (`hydrateSavedState`):
        // anything else is a wrong-shape payload, which it treats as no saved session.
        if (isPlainRecord(session.value) && Array.isArray(session.value.sections)) {
            sources.push({
                kind: 'session',
                digest: digestOf(session.raw),
                id: `v1-session-${digestOf(session.raw)}`,
                title: SESSION_TITLE,
                record: session.value,
            });
        } else {
            problems.push({
                digest: digestOf(session.raw),
                label: 'Your last session in the old Ensemble',
                reason: 'its saved data has an unexpected shape.',
            });
        }
    }

    const presets = readJson(storage, V1_PRESETS_KEY);
    if (presets.kind === 'unreadable') {
        problems.push({
            digest: digestOf(presets.raw),
            label: 'Your saved progressions',
            reason: 'the saved list is not readable.',
        });
    } else if (presets.kind === 'ok') {
        if (!Array.isArray(presets.value)) {
            problems.push({
                digest: digestOf(presets.raw),
                label: 'Your saved progressions',
                reason: 'the saved list has an unexpected shape.',
            });
        } else {
            for (const [index, entry] of presets.value.slice(0, MAX_PRESETS).entries()) {
                // Stable per entry, so editing or adding one progression re-offers only
                // that one. Index is in the digest because two identically-named saves
                // with identical chords are genuinely two library rows in v1.
                const digest = digestOf(`${index}:${JSON.stringify(entry) ?? 'null'}`);
                const name =
                    isPlainRecord(entry) && typeof entry.name === 'string' ? entry.name : '';
                if (!isPlainRecord(entry) || !name || !presetSections(entry)) {
                    problems.push({
                        digest,
                        label: name
                            ? `Saved progression “${sanitizeDisplayString(name, 'untitled', 60)}”`
                            : `Saved progression ${index + 1}`,
                        reason: 'its chords could not be read.',
                    });
                    continue;
                }
                sources.push({
                    kind: 'preset',
                    digest,
                    id: `v1-preset-${digest}`,
                    title: sanitizeDisplayString(name, 'Untitled progression', 200),
                    record: entry,
                });
            }
        }
    }

    return { sources, problems };
}

/**
 * The v1 sections of a saved progression, or null when they cannot be read.
 * Accepts both shapes the v1 library reads (`getRawPresetSections`): the compressed
 * string `saveProgression` writes, and the plain array a built-in preset carries.
 */
function presetSections(preset: Record<string, unknown>): Array<Record<string, unknown>> | null {
    if (typeof preset.sections === 'string') {
        const decoded = tryDecompressSections(preset.sections);
        return decoded?.length ? (decoded as unknown as Array<Record<string, unknown>>) : null;
    }
    if (Array.isArray(preset.sections) && preset.sections.length && preset.sections.length <= 500) {
        return preset.sections.filter(isPlainRecord);
    }
    return null;
}

/**
 * The import ledger's view of a finding: what is still on offer. Anything already
 * imported (or declined for these exact bytes) is filtered out, so a rerun resumes
 * where the last one stopped and a dismissal does not hide a later, different set.
 */
export function v1ImportOffer(finding: V1Finding, ledger: V1ImportLedger): V1Finding {
    return {
        sources: finding.sources.filter((source) => !ledger.has(source.digest)),
        problems: finding.problems.filter((problem) => !ledger.has(problem.digest)),
    };
}

/**
 * Baseline for everything a v1 saved progression does not carry — which is everything
 * but its chords.
 *
 * Resolved against the v1 SESSION when the profile has a readable one, so an imported
 * progression arrives with the band, tempo, key and meter it would have got from v1's
 * own "load this preset" gesture, which replaces the chords and the minor flag and
 * keeps the rest of the session. `base` (a document already in the v2 songbook) is the
 * fallback for a profile with presets but no readable session, and always supplies the
 * two fields v1 never persisted at all: `soloist.tradeMode` and `chords.instrument`.
 */
export function v1ImportContext(
    finding: V1Finding,
    base: Pick<ChartContent, 'performance' | 'band'>,
): V1ImportContext {
    const session = finding.sources.find((source) => source.kind === 'session')?.record;
    const timeSignature = signature(session?.timeSignature);
    const context: V1ImportContext = {
        performance: base.performance,
        band: base.band,
        key: chartKey(session?.key),
        timeSignature,
        grouping: grouping(session?.grouping, timeSignature),
    };
    if (!session) {
        return context;
    }
    return {
        ...context,
        performance: sessionPerformance(session, context),
        band: sessionBand(session, context),
    };
}

function chartKey(saved: unknown): string {
    if (typeof saved === 'string') {
        const normalized = normalizeKey(saved);
        if (KEY_ORDER.includes(normalized)) {
            return normalized;
        }
    }
    return 'C';
}

function signature(saved: unknown): string {
    return typeof saved === 'string' && TIME_SIGNATURES[saved] ? saved : '4/4';
}

function grouping(saved: unknown, timeSignature: string): number[] | null {
    return isValidTimeSignatureGrouping(saved, timeSignature) ? [...saved] : null;
}

function boolOr(saved: unknown, fallback: boolean): boolean {
    return saved === undefined ? fallback : !!saved;
}

/**
 * A style key the engine still knows, else the genre-routed `smart` default — the same
 * question v1's persist reader asks (`isKnown*Style`), which matters: a retired key
 * loads as a silently muted instrument, and the codec rejects the document outright.
 */
function knownStyle(saved: unknown, known: (value: unknown) => boolean): string {
    return typeof saved === 'string' && known(saved) ? saved : 'smart';
}

/** Integer fields (octaves, bpm) — v1 clamps to a range but tolerates fractions. */
function wholeNumber(saved: unknown, min: number, max: number, fallback: number): number {
    return Math.round(clamp(saved, min, max, fallback));
}

/**
 * The lane's voice, coerced to `synth` when it names a pack this build does not offer
 * for that lane. Losing a whole song over a retired sound pack would be the wrong
 * trade: `lib/repository.ts` rejects an unknown voice outright, and the music is the
 * part that cannot be recreated.
 */
function laneVoice(module: InstrumentModule, saved: unknown): InstrumentVoice {
    const voice = hydrateVoice(saved);
    if (voice === 'synth') {
        return 'synth';
    }
    return packsForInstrument(module).some((pack) => `pack:${pack.id}` === voice) ? voice : 'synth';
}

/**
 * v1's readers escape a section label but leave the rest of the codec's
 * display-string rule (no `=`) alone, and a corrupt blob can repeat a section id. This
 * pass makes already-v1-validated sections acceptable to the songbook codec without
 * escaping anything a second time — `escapeHTML` is not idempotent, and double-escaping
 * would visibly corrupt a label containing `&`.
 */
function codecSafeSections(sections: Array<Record<string, unknown>>): ChartSection[] {
    const used = new Set<string>();
    return sections.map((section, index) => {
        const savedId = section.id;
        let id =
            typeof savedId === 'string' &&
            savedId.length > 0 &&
            savedId.length <= 100 &&
            !PROTOTYPE_MEMBER_NAMES.has(savedId) &&
            savedId === stripDangerousChars(savedId) &&
            !used.has(savedId)
                ? savedId
                : `v1-section-${index + 1}`;
        while (used.has(id)) {
            id = `${id}-${index + 1}`;
        }
        used.add(id);
        const key = typeof section.key === 'string' ? normalizeKey(section.key) : '';
        const value = typeof section.value === 'string' ? section.value : '';
        const repeat = section.repeat;
        const targetIntensity = section.targetIntensity;
        const instruments = section.instruments;
        return {
            id,
            label: sanitizeDisplayString(section.label, `Section ${index + 1}`, 100),
            value: stripDangerousChars(value).slice(0, 1000),
            repeat:
                typeof repeat === 'number' && Number.isFinite(repeat)
                    ? Math.min(64, Math.max(1, Math.round(repeat)))
                    : 1,
            key: KEY_ORDER.includes(key) ? key : '',
            ...(typeof section.isMinor === 'boolean' ? { isMinor: section.isMinor } : {}),
            timeSignature:
                typeof section.timeSignature === 'string' && TIME_SIGNATURES[section.timeSignature]
                    ? section.timeSignature
                    : '',
            seamless: !!section.seamless,
            ...(typeof targetIntensity === 'number' && Number.isFinite(targetIntensity)
                ? { targetIntensity: Math.min(1, Math.max(0, targetIntensity)) }
                : {}),
            ...(isPlainRecord(instruments)
                ? {
                      instruments: Object.fromEntries(
                          (['groove', 'bass', 'chords', 'harmony', 'soloist'] as const)
                              .filter((lane) => typeof instruments[lane] === 'boolean')
                              .map((lane) => [lane, instruments[lane] as boolean]),
                      ),
                  }
                : {}),
        };
    });
}

/**
 * The drum pattern, filtered to lanes the songbook schema knows. An unknown lane name
 * or an out-of-range step would make the codec reject the ENTIRE song, so drop/round
 * the unrecognisable parts of the groove rather than lose the chart.
 */
function patternLanes(saved: unknown): ChartGroovePatternLane[] {
    if (!Array.isArray(saved)) {
        return [];
    }
    const lanes: ChartGroovePatternLane[] = [];
    const used = new Set<string>();
    for (const entry of saved.slice(0, 64)) {
        if (!isPlainRecord(entry) || typeof entry.name !== 'string') {
            continue;
        }
        if (!PATTERN_LANE_NAMES.has(entry.name) || used.has(entry.name)) {
            continue;
        }
        used.add(entry.name);
        const steps = Array.isArray(entry.steps) ? entry.steps.slice(0, 128) : [];
        lanes.push({
            name: entry.name as ChartGroovePatternLane['name'],
            steps: steps.map((step) =>
                typeof step === 'number' && Number.isFinite(step)
                    ? Math.min(2, Math.max(0, Math.round(step)))
                    : 0,
            ),
        });
    }
    return lanes;
}

/**
 * The band a v1 saved session describes, expressed as songbook content.
 *
 * Every field mirrors the matching line in `hydrateSavedState`, including its
 * migrations: the #787 Acoustic `pad` → `arp` chord style, the #856 Auto-phrasing
 * default, the soloist octave's legacy 77/67 values, and the mixer-version reset that
 * returns volumes/reverbs to defaults for a pre-#1257 save. Anything this file decides
 * differently from v1 is a codec requirement, and says so.
 */
function sessionBand(saved: Record<string, unknown>, context: V1ImportContext): ChartBand {
    const shouldResetMixer = Number(saved.mixerVersion) !== MIXER_SETTINGS_VERSION;
    const chords = isPlainRecord(saved.chords) ? saved.chords : {};
    const bass = isPlainRecord(saved.bass) ? saved.bass : {};
    const soloist = isPlainRecord(saved.soloist) ? saved.soloist : {};
    const harmony = isPlainRecord(saved.harmony) ? saved.harmony : {};
    const groove = isPlainRecord(saved.groove) ? saved.groove : {};
    // #787 — Acoustic's chord default moved 'pad' → 'arp'; a session saved under the
    // old default would otherwise import as a static pad with no fingerpicking.
    const chordStyle =
        groove.genreFeel === 'Acoustic' && chords.style === 'pad' ? 'arp' : chords.style;
    // Resolved as ONE pair, like the persist and share readers: the codec additionally
    // rejects a document whose genre name and engine feel describe different genres.
    const savedGenre =
        resolveGenre(typeof groove.genreFeel === 'string' ? groove.genreFeel : null) ??
        resolveGenre(typeof groove.lastSmartGenre === 'string' ? groove.lastSmartGenre : null);
    const genre = savedGenre && GENRE_FEELS.includes(savedGenre.feel) ? savedGenre : null;
    const volume = (lane: Record<string, unknown>) =>
        shouldResetMixer ? 1.0 : clamp(lane.volume, 0, 1, 1.0);
    const reverb = (lane: Record<string, unknown>, module: InstrumentModule) =>
        shouldResetMixer
            ? INSTRUMENT_REVERB_DEFAULTS[module]
            : clamp(lane.reverb, 0, 1, INSTRUMENT_REVERB_DEFAULTS[module]);
    return {
        chords: {
            ...context.band.chords,
            enabled: boolOr(chords.enabled, true),
            voice: laneVoice('chords', chords.voice),
            autoSound: hydrateAutoSound(chords.autoSound, hydrateVoice(chords.voice)),
            style: knownStyle(chordStyle, isKnownChordStyle),
            octave: wholeNumber(chords.octave, 0, 127, 48),
            density: isChordDensity(chords.density) ? chords.density : 'standard',
            volume: volume(chords),
            reverb: reverb(chords, 'chords'),
        },
        bass: {
            ...context.band.bass,
            enabled: boolOr(bass.enabled, true),
            voice: laneVoice('bass', bass.voice),
            autoSound: hydrateAutoSound(bass.autoSound, hydrateVoice(bass.voice)),
            style: knownStyle(bass.style, isKnownBassStyle),
            octave: wholeNumber(bass.octave, 0, 127, 36),
            volume: volume(bass),
            reverb: reverb(bass, 'bass'),
        },
        soloist: {
            ...context.band.soloist,
            enabled: boolOr(soloist.enabled, false),
            voice: laneVoice('soloist', soloist.voice),
            autoSound: hydrateAutoSound(soloist.autoSound, hydrateVoice(soloist.voice)),
            style: knownStyle(soloist.style, isKnownSoloistStyle),
            preset: normalizeSoloistPreset(soloist.preset, 'trumpet') as 'trumpet',
            octave:
                soloist.octave === 77 || soloist.octave === 67 || soloist.octave === undefined
                    ? 72
                    : wholeNumber(soloist.octave, 0, 127, 72),
            mode: resolveSoloistMode(
                typeof soloist.mode === 'string'
                    ? soloist.mode
                    : soloist.doubleStops
                      ? 'guitar'
                      : 'monophonic',
            ),
            // #856 — pre-#856 saves have no `autoMode`; default to Auto.
            autoMode: typeof soloist.autoMode === 'boolean' ? soloist.autoMode : true,
            phrasingIntensity: clamp(soloist.phrasingIntensity, 0, 1, 0.5),
            volume: volume(soloist),
            reverb: reverb(soloist, 'soloist'),
        },
        harmony: {
            ...context.band.harmony,
            enabled: boolOr(harmony.enabled, false),
            voice: laneVoice('harmony', harmony.voice),
            autoSound: hydrateAutoSound(harmony.autoSound, hydrateVoice(harmony.voice)),
            style: knownStyle(harmony.style, isKnownHarmonyStyle),
            octave: wholeNumber(harmony.octave, 0, 127, 60),
            complexity: clamp(harmony.complexity, 0, 1, 0.5),
            volume: volume(harmony),
            reverb: reverb(harmony, 'harmony'),
        },
        groove: {
            ...context.band.groove,
            enabled: boolOr(groove.enabled, true),
            voice: laneVoice('groove', groove.voice),
            autoSound: hydrateAutoSound(groove.autoSound, hydrateVoice(groove.voice)),
            // `measures` is not in v1's persisted payload at all, so v1 itself reloads
            // every session at 1. Mirrored rather than "improved": a 2-measure drum
            // pattern was already lost on v1's own next reload.
            measures: wholeNumber(groove.measures, 1, 8, 1),
            swing: clamp(groove.swing, 0, 100, 0),
            swingSub: normalizeSwingSub(groove.swingSub),
            humanize: clamp(groove.humanize, 0, 100, 20),
            lastDrumPreset: sanitizeDisplayString(groove.lastDrumPreset, 'Basic Rock'),
            genreFeel: genre ? genre.feel : 'Rock',
            lastSmartGenre: genre ? genre.name : 'Rock',
            pattern: patternLanes(groove.pattern),
            volume: volume(groove),
            reverb: reverb(groove, 'groove'),
        },
    };
}

function sessionPerformance(
    saved: Record<string, unknown>,
    context: V1ImportContext,
): ChartPerformance {
    return {
        // v1 tolerates 20–300 and fractional tempos; the songbook schema is a whole
        // 40–240. A tempo outside that lands on the nearest end of the range — the only
        // field this import can move audibly, and only for a session v1 itself kept
        // outside the range every other part of the app offers.
        bpm: Math.min(240, Math.max(40, wholeNumber(saved.bpm, 20, 300, context.performance.bpm))),
        complexity: clamp(saved.complexity, 0, 1, 0.3),
        // Prefer the top-level seed, falling back to the pre-#791 nested one.
        seed:
            normalizeSongSeed(saved.seed) ||
            normalizeSongSeed(isPlainRecord(saved.soloist) ? saved.soloist.seed : undefined) ||
            '',
        randomizeSeed: typeof saved.randomizeSeed === 'boolean' ? saved.randomizeSeed : true,
    };
}

/** A chart with no chord text cannot be opened or played, so it is not a silent import. */
function playable(sections: ChartSection[]): boolean {
    return sections.some((section) => section.value.trim().length > 0);
}

function content(source: V1Source, context: V1ImportContext): ChartContent | string {
    if (source.kind === 'session') {
        const saved = source.record;
        const sections = codecSafeSections(validateSections(saved.sections as unknown[] as any[]));
        if (!playable(sections)) {
            return 'it has no chords left to import.';
        }
        const timeSignature = signature(saved.timeSignature);
        const notation = saved.notation;
        return {
            arrangement: {
                sections,
                key: chartKey(saved.key),
                timeSignature,
                grouping: grouping(saved.grouping, timeSignature),
                isMinor: !!saved.isMinor,
                notation: (typeof notation === 'string' && NOTATIONS.includes(notation)
                    ? notation
                    : 'roman') as ChartContent['arrangement']['notation'],
                lastChordPreset: sanitizeDisplayString(saved.lastChordPreset, 'Pop (Standard)'),
            },
            performance: sessionPerformance(saved, context),
            band: sessionBand(saved, context),
        };
    }
    const raw = presetSections(source.record);
    const sections = raw ? codecSafeSections(raw) : [];
    if (!playable(sections)) {
        return 'its chords could not be read.';
    }
    return {
        arrangement: {
            sections,
            key: context.key,
            timeSignature: context.timeSignature,
            grouping: context.grouping,
            isMinor: !!source.record.isMinor,
            notation: 'roman',
            lastChordPreset: source.title,
        },
        performance: context.performance,
        band: context.band,
    };
}

/**
 * One v1 item to one validated songbook document, or a reason it cannot be converted.
 *
 * The canonical `validateChartDocument` is the gate: a candidate this module builds
 * wrong is a reported failure, not a document the rest of the app chokes on later.
 */
export function convertV1(
    source: V1Source,
    context: V1ImportContext,
    now = new Date().toISOString(),
): V1Conversion {
    let chart: ChartContent | string;
    try {
        chart = content(source, context);
    } catch (error) {
        // Nothing here should throw, but the v1 record is untrusted input and one bad
        // song must not take down the whole import.
        return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
    }
    if (typeof chart === 'string') {
        return { kind: 'failed', reason: chart };
    }
    const candidate = {
        schemaVersion: 1,
        id: source.id,
        title: source.title,
        createdAt: createdAt(source, now),
        updatedAt: now,
        revision: 0,
        chart,
    };
    const checked = validateChartDocument(candidate);
    if (checked.kind !== 'ok') {
        return {
            kind: 'failed',
            reason:
                checked.kind === 'invalid'
                    ? checked.issues
                          .slice(0, 2)
                          .map((issue) => issue.message)
                          .join('; ')
                    : 'it is not a version this songbook can read.',
        };
    }
    return { kind: 'ok', document: checked.value };
}

/** A saved progression remembers when it was saved; keep it as the document's origin. */
function createdAt(source: V1Source, now: string): string {
    const timestamp = source.record.timestamp;
    if (typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0) {
        const date = new Date(timestamp);
        if (Number.isFinite(date.getTime())) {
            return date.toISOString();
        }
    }
    return now;
}

export interface V1ImportRun {
    offer: V1Finding;
    context: V1ImportContext;
    /** Document ids already in the songbook — the second guard against duplicates. */
    existingIds: ReadonlySet<string>;
    save: (document: ChartDocument) => Promise<void>;
    /** Called per item as it lands, so a run interrupted halfway is still remembered. */
    remember: (digest: string) => void;
    now?: string;
}

/**
 * Import the offered items one at a time.
 *
 * Deliberately sequential and item-atomic: item k's failure leaves items 1..k-1 saved
 * and remembered, reports k with a reason, and carries on. Nothing is rolled back —
 * a partial import is real music the musician keeps — and a rerun only touches what is
 * still missing, because each landed item is remembered (and its document id is derived
 * from its v1 bytes, so the repository would reject a second copy anyway).
 */
export async function importV1(run: V1ImportRun): Promise<V1ImportOutcome> {
    const now = run.now ?? new Date().toISOString();
    const outcome: V1ImportOutcome = {
        imported: [],
        failures: [],
        alreadyPresent: 0,
        problems: run.offer.problems,
    };
    for (const source of run.offer.sources) {
        if (run.existingIds.has(source.id)) {
            outcome.alreadyPresent++;
            run.remember(source.digest);
            continue;
        }
        const conversion = convertV1(source, run.context, now);
        if (conversion.kind === 'failed') {
            outcome.failures.push({ title: source.title, reason: conversion.reason });
            continue;
        }
        try {
            await run.save(conversion.document);
        } catch (error) {
            outcome.failures.push({
                title: source.title,
                reason: error instanceof Error ? error.message : String(error),
            });
            continue;
        }
        outcome.imported.push(conversion.document);
        run.remember(source.digest);
    }
    return outcome;
}

/** The one-line result the songbook shows after a run. */
export function describeV1Outcome(outcome: V1ImportOutcome): string {
    const parts = [`Imported ${outcome.imported.length}`];
    if (outcome.alreadyPresent) {
        parts.push(`${outcome.alreadyPresent} already here`);
    }
    const trouble = [
        ...outcome.failures.map((failure) => `${failure.title} — ${failure.reason}`),
        ...outcome.problems.map((problem) => `${problem.label} — ${problem.reason}`),
    ];
    if (trouble.length) {
        parts.push(`${trouble.length} couldn't be converted: ${trouble.join(' · ')}`);
    }
    return parts.join(' · ');
}
