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
 *
 * Two identity rules, because the two kinds of v1 item are different things (DECISION
 * 2026-09-19 on #1274):
 *
 * - The v1 SESSION is one document with the fixed id `v1-session`. There is only ever one
 *   "last session in the old Ensemble", so re-running the import UPDATES that document
 *   rather than landing a second copy of it. What stops a rerun from overwriting work: an
 *   unchanged v1 session is never offered at all (the ledger holds its digest), a changed
 *   one whose conversion is byte-identical to the document already there is counted as
 *   already present and not written, and a changed one whose v2 copy has been EDITED here
 *   is reported in the result list, not written — see `sessionUpdate`.
 * - A saved PROGRESSION keeps its content-derived id (`v1-preset-<digest>`), because the v1
 *   library is a list of independent songs and an edit there makes a different song, not a
 *   new version of one. That id is also the second guard against a duplicate copy when the
 *   ledger is lost.
 *
 * Deliberately NOT `public/songbook/legacy-score.ts`'s `proposeLegacyScoreConversion`:
 * that conversion blocks the WHOLE song on one unparseable bar, which is the wrong
 * failure mode for an import whose only other option is losing the song outright. Every
 * imported document therefore lands as `schemaVersion: 1` — read-only until the user
 * makes an "editable copy" — the same landing state a v2 starter song has.
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
// The one v2-store import here, and only for its TYPE at runtime: a refused write has to be
// recognised as a collision rather than reported in the store's own editing vocabulary (R7).
import { ConflictError } from './repository';

/** The two v1 keys this module reads. Never written, renamed or removed. */
export const V1_STATE_KEY = 'ensemble_currentState';
export const V1_PRESETS_KEY = 'ensemble_userPresets';

/**
 * Is there an old-Ensemble profile on this origin at all?
 *
 * Two `getItem`s and a length check — deliberately NOT `findV1Data`, which parses the
 * session, Base64-decodes up to 500 saved progressions and validates each one. That answer
 * is only needed when something is actually going to be offered; this one is needed on every
 * load, to decide whether the song menu shows its permanent way back (#1274 patch R3).
 */
export function hasV1Data(storage: V1ReadOnlyStorage): boolean {
    for (const key of [V1_STATE_KEY, V1_PRESETS_KEY]) {
        try {
            const raw = storage.getItem(key);
            // `[]` is what v1 leaves behind for a musician who opened its preset library and
            // never saved one, and it is not something to offer — a string compare rather
            // than a parse keeps this the cheap probe it exists to be (#1274 patch N5). Any
            // other content, including a corrupt blob, still counts: unreadable v1 data is
            // exactly the thing this import must be able to tell somebody about.
            const value = raw === null ? '' : raw.trim();
            if (value !== '' && value !== '[]' && value !== '{}' && value !== 'null') {
                return true;
            }
        } catch {
            // Blocked site data: nothing readable, so nothing to offer.
            return false;
        }
    }
    return false;
}

/**
 * The one document the v1 session imports as, on every run (DECISION 2026-09-19). Fixed
 * rather than content-derived: a musician has exactly one last session in the old app, so a
 * changed one is a new version of that song and not a second song.
 */
export const V1_SESSION_ID = 'v1-session';

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
    /**
     * The v2 document id this item lands as — also where this song's v1 provenance lives,
     * since a v1 document has no sanctioned `importSource` slot. `v1-session` for the
     * session, `v1-preset-<digest>` for a saved progression; see the module header for why
     * one is fixed and the other content-derived.
     */
    id: string;
    title: string;
    /** The parsed v1 record. Held for conversion only; never written back. */
    record: Record<string, unknown>;
    /**
     * A saved progression's decoded sections, kept from the pass that proved them readable.
     * `findV1Data` has to decode them to decide whether this is an offerable item at all, and
     * `content()` would otherwise Base64-decode and re-parse every one of them a second time
     * (#1274 patch R3). Absent for a session, whose sections are already plain objects.
     */
    sections?: Array<Record<string, unknown>>;
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

/**
 * Ledger of what this device has already imported, or been shown and can do nothing more
 * about, keyed by the digest of the v1 bytes. The states themselves are `lib/session.ts`'s
 * (`V1ImportState`); every one of them means the same thing to the automatic offer, so this
 * only ever asks whether a digest is in it.
 */
export type V1ImportLedger = ReadonlyMap<string, string>;

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
    /**
     * Lanes whose v1 voice named a sound pack this build doesn't offer, coerced to
     * `synth` by `laneVoice` (#1274 P2-3). Computed once here because every preset item
     * inherits `band` verbatim from the v1 session (or the v2 baseline, which is never
     * coerced) — so this is the one place that needs to detect it, and every item that
     * lands with this `band` shares the same answer.
     */
    coercedLanes: InstrumentModule[];
}

export type V1Conversion =
    | { kind: 'ok'; document: ChartDocument; soundFallback: boolean }
    | { kind: 'failed'; reason: string };

export interface V1ImportOutcome {
    imported: ChartDocument[];
    /**
     * The v1 session document a rerun brought up to date with changed v1 bytes — at most
     * one, since it is the only item with a fixed id.
     */
    updated: ChartDocument[];
    /**
     * Items that could not be converted or saved, or that this run deliberately did not
     * write over, each with a reason to show. Nothing here is lost: the v1 bytes are
     * untouched and the v2 copy, where there is one, is exactly as the musician left it.
     */
    failures: Array<{ title: string; reason: string }>;
    /** Items already in the songbook from an earlier run; not re-saved, not failures. */
    alreadyPresent: number;
    problems: V1Problem[];
    /**
     * Digests of everything this run SHOWED the musician and will not do anything more
     * about: v1 data that could not be read, an item that could not be converted, and the
     * deliberate refusal to write over a copy edited here (#1274 patch R1).
     *
     * The caller records these so the AUTOMATIC offer stops re-opening for them on every
     * load — they are acknowledged, not pending. A changed digest is a different item and is
     * offered again, and the song-menu path ignores the ledger entirely, so nothing here is
     * hidden from someone who goes looking.
     *
     * A failure the STORE produced (quota, an interrupted transaction, another tab writing
     * the same id) is deliberately NOT here: nothing about it says the item was dealt with,
     * and the next run should try it again.
     */
    acknowledged: string[];
    /**
     * How many landed songs play at least one lane through the synth because v1 named a
     * sound pack this build doesn't offer (#1274 P2-3) — never a failure, since the song
     * itself still plays; just not with the exact sound it had in v1.
     */
    soundFallbacks: number;
}

const SESSION_TITLE = 'Last session from the old Ensemble';
/**
 * How many saved progressions ONE import run reads, oldest-first in the v1 array. A
 * different axis from `presetSections`' own 500-section-per-song cap below (sections
 * within one progression, not progressions in the library) — the two just happen to
 * share a round number. A profile with more than this is not silently truncated:
 * `findV1Data` reports the remainder as a problem naming the count still unread. That
 * remainder becomes visible on a later run once enough earlier rows are imported/removed
 * in v1 to shift it inside this window — this cap does not promise it arrives next run.
 */
const MAX_PRESETS = 500;
const PROTOTYPE_MEMBER_NAMES: ReadonlySet<string> = new Set(
    Object.getOwnPropertyNames(Object.prototype),
);
const NOTATIONS = ['roman', 'name', 'nns'];
const PATTERN_LANE_NAMES: ReadonlySet<string> = new Set(CHART_GROOVE_PATTERN_LANE_NAMES);

/**
 * The bytes a digest is taken over differ by item kind, and deliberately stay that way: the
 * SESSION is digested from the raw `localStorage` string exactly as v1 wrote it, a saved
 * PROGRESSION from `JSON.stringify` of its parsed entry (the array element, which has no raw
 * substring of its own to point at). Re-basing either one would hand every already-imported
 * item a new identity and offer the whole profile again, so this is a documented convention
 * rather than something to unify (#1274 patch R11).
 *
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
                id: V1_SESSION_ID,
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
            // Content-only, keyed by occurrence WITHIN a run of identical bytes — not the
            // array index. An index-based digest looked stable but wasn't: deleting an
            // earlier v1 preset shifts every later index, so a rerun would see "new" bytes
            // at each shifted position and re-import them as duplicates. Two genuinely
            // identical library rows (same name, same chords, same save time) still need
            // distinct digests, so the Nth occurrence of one exact byte string gets an
            // ordinal suffix; the first occurrence stays bare so a later deletion of an
            // EARLIER duplicate just relabels who is "first" without losing ledger/id
            // continuity for the row(s) that remain.
            const occurrences = new Map<string, number>();
            for (const [index, entry] of presets.value.slice(0, MAX_PRESETS).entries()) {
                const bytes = JSON.stringify(entry) ?? 'null';
                const base = digestOf(bytes);
                const occurrence = occurrences.get(base) ?? 0;
                occurrences.set(base, occurrence + 1);
                const digest = occurrence === 0 ? base : `${base}-${occurrence}`;
                const name =
                    isPlainRecord(entry) && typeof entry.name === 'string' ? entry.name : '';
                // Decoded ONCE, here, and carried on the source: this pass has to decode to
                // know whether the item is offerable at all, and `content()` would otherwise
                // Base64-decode and re-parse every progression a second time (patch R3).
                const sections = isPlainRecord(entry) ? presetSections(entry) : null;
                if (!isPlainRecord(entry) || !name || !sections) {
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
                    sections,
                });
            }
            const overflow = presets.value.length - MAX_PRESETS;
            if (overflow > 0) {
                problems.push({
                    // Stable across reruns of an unchanged profile, so once this has been
                    // shown the automatic offer stops re-opening for it; it moves only when
                    // the overflow count itself changes, which IS news worth showing again.
                    digest: digestOf(`v1-presets-overflow:${presets.value.length}`),
                    label: 'Your saved progressions',
                    reason: `this run reads at most ${MAX_PRESETS} at a time; ${overflow} more progression${overflow === 1 ? '' : 's'} could not be read this time.`,
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
 * Does the card's dismiss button record the permanent per-device decline (#1274 patch N1)?
 *
 * The ONE answer behind both the button's label and what pressing it does. They were worked
 * out separately once, and drifted: a card reading "Everything from the old Ensemble is
 * already here" with a button marked "Done" was quietly recording "never offer this again",
 * so a musician who tidied up after importing never saw next week's new songs.
 *
 * Only a real "Not now" declines: there has to be something on offer to turn down, the run
 * must not already have happened, and an offer the musician went looking for from the song
 * menu never declines — coming to find it is the opposite of asking to be left alone.
 *
 * Lives here rather than in the card so it can be tested as the rule it is.
 */
export function v1OfferDeclines(offer: {
    result: string | null;
    songs: number;
    asked: boolean;
}): boolean {
    return !offer.result && offer.songs > 0 && !offer.asked;
}

/**
 * The import ledger's view of a finding: what the AUTOMATIC offer still has to say.
 *
 * Anything this device has already imported, or has already been shown and can do nothing
 * more about (`'shown'` — unreadable v1 data, an unconvertible item, the refusal to write
 * over a copy edited here), is filtered out. Identity is the DIGEST, so the same v1 item
 * re-saved in the old app is a new item and is offered again.
 *
 * The song-menu path deliberately does not call this: asking is asking, and everything v1
 * holds is on the table there (#1274 patch R1).
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
        coercedLanes: [],
    };
    if (!session) {
        return context;
    }
    const coerced = new Set<InstrumentModule>();
    return {
        ...context,
        performance: sessionPerformance(session, context),
        band: sessionBand(session, context, coerced),
        coercedLanes: [...coerced],
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
 * part that cannot be recreated. `coerced`, when given, records which lane this happened
 * to (#1274 P2-3) so the caller can tell the musician instead of the fallback being silent.
 */
function laneVoice(
    module: InstrumentModule,
    saved: unknown,
    coerced?: Set<InstrumentModule>,
): InstrumentVoice {
    const voice = hydrateVoice(saved);
    if (voice === 'synth') {
        return 'synth';
    }
    if (packsForInstrument(module).some((pack) => `pack:${pack.id}` === voice)) {
        return voice;
    }
    coerced?.add(module);
    return 'synth';
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
            // Re-truncate the base on every pass, not just append: the codec's id cap is
            // 100 chars, and an id already near that limit growing a suffix on top of its
            // own bytes would sail past it and fail the whole song (#1274 P2-7).
            const suffix = `-${index + 1}`;
            id = `${id.slice(0, Math.max(0, 100 - suffix.length))}${suffix}`;
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
function sessionBand(
    saved: Record<string, unknown>,
    context: V1ImportContext,
    coerced?: Set<InstrumentModule>,
): ChartBand {
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
            voice: laneVoice('chords', chords.voice, coerced),
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
            voice: laneVoice('bass', bass.voice, coerced),
            autoSound: hydrateAutoSound(bass.autoSound, hydrateVoice(bass.voice)),
            style: knownStyle(bass.style, isKnownBassStyle),
            octave: wholeNumber(bass.octave, 0, 127, 36),
            volume: volume(bass),
            reverb: reverb(bass, 'bass'),
        },
        soloist: {
            ...context.band.soloist,
            enabled: boolOr(soloist.enabled, false),
            voice: laneVoice('soloist', soloist.voice, coerced),
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
            voice: laneVoice('harmony', harmony.voice, coerced),
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
            voice: laneVoice('groove', groove.voice, coerced),
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
    // `source.sections` is the decode `findV1Data` already did (patch R3); the fallback is
    // for a source built by hand in a test, never for the live path.
    const raw = source.sections ?? presetSections(source.record);
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
            // `title` (the document field) allows up to 200 chars, matching `findV1Data`'s
            // own sanitize call; `lastChordPreset` is a DIFFERENT codec field capped at 100
            // (#1274 P2-6) — reusing `source.title` unsliced here failed the whole song for
            // any name past 100 chars even though the title itself was perfectly valid.
            lastChordPreset: source.title.slice(0, 100),
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
    return { kind: 'ok', document: checked.value, soundFallback: context.coercedLanes.length > 0 };
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

/**
 * A document already in the songbook, and whether this device holds unsaved edits to it.
 *
 * The document is typed structurally rather than as a `ChartDocument`, because the v2
 * shell's own document type is a union that also carries the score-editor schema — and an
 * imported v1 song the musician has since turned into an editable copy is exactly one of
 * the cases this has to be able to look at.
 */
export interface V1ExistingDocument {
    document: { schemaVersion: number; title: string; revision: number; chart: unknown };
    /**
     * Retained (unsaved) drafts for this document on this device. Non-zero is a v2 edit the
     * document's own `revision` cannot see — `lib/repository.ts` writes a recovery slot only
     * when the live chart differs from what was last saved — so it counts as "edited here".
     */
    drafts: number;
}

/**
 * What the last import of the v1 session WROTE, or set out to write, on this device.
 *
 * This is what makes "has the musician edited this song here?" answerable at all. The
 * document's own revision cannot answer it: the import's update bumps it, so a second
 * changed-source rerun would read its own write as somebody's edit and refuse forever.
 *
 * Recorded as CONTENT rather than as a revision number (#1274 patch R5), and recorded
 * BEFORE the save rather than after it, so a tab that dies mid-write heals either way:
 *
 * - died after the store committed → the document holds `document`, which this run wrote;
 * - died before it committed → the document still holds `replaced`, which the previous run
 *   wrote and this one had already established as untouched.
 *
 * Both are contents the import itself produced, so neither can be confused with an edit: a
 * musician's Save moves the content away from both, and the next run refuses, which is the
 * safe direction. A revision pair could not tell those apart — the revision a failed write
 * would have produced is exactly the revision a musician's own next Save does produce.
 */
export interface V1SessionMark {
    /**
     * The v1 bytes that write was made from. Read back to tell "the old app has moved on"
     * from "v1 is unchanged and you edited the copy here" (#1274 patch R4/R9), which are
     * the same `!sameContent` to every other test in this file but are not the same event.
     */
    digest: string;
    /** Content digest of the document the import wrote (or was about to write). */
    document: string;
    /** Content digest it was replacing, or null for a create. */
    replaced: string | null;
}

/** Content identity of a songbook document — the three fields `sameContent` compares. */
function documentDigest(document: {
    schemaVersion: number;
    title: string;
    chart: unknown;
}): string {
    return digestOf(
        JSON.stringify({
            schemaVersion: document.schemaVersion,
            title: document.title,
            chart: document.chart,
        }),
    );
}

export interface V1ImportRun {
    offer: V1Finding;
    context: V1ImportContext;
    /**
     * The songbook's documents by id — the second guard against duplicates, and, for the
     * fixed `v1-session` id, what a rerun compares against before it writes anything.
     */
    existing: ReadonlyMap<string, V1ExistingDocument>;
    /** What the last import of the v1 session committed on this device, if any. */
    sessionMark: V1SessionMark | null;
    /**
     * Commits one document. `expected` is null for a create, the row's revision for an
     * update.
     */
    save: (document: ChartDocument, expected: number | null) => Promise<unknown>;
    /** Called per item as it lands, so a run interrupted halfway is still remembered. */
    remember: (digest: string) => void;
    /**
     * Records what the session write is about to do. Called BEFORE the save, never after:
     * the whole point is that it survives a tab that dies during the write — see
     * `V1SessionMark`.
     */
    markSession: (mark: V1SessionMark) => void;
    now?: string;
}

/** Does the songbook's copy still hold exactly what an import put there? */
function sameContent(candidate: ChartDocument, existing: V1ExistingDocument['document']): boolean {
    return (
        candidate.title === existing.title &&
        candidate.schemaVersion === existing.schemaVersion &&
        JSON.stringify(candidate.chart) === JSON.stringify(existing.chart)
    );
}

/**
 * What to do about a `v1-session` document that is already in the songbook, given a
 * conversion of v1's current bytes (DECISION 2026-09-19).
 *
 * `'present'` — the two are identical, so there is nothing to write. This is what keeps a
 * rerun honest after the per-device ledger is lost: the offer comes back, and the import
 * still lands nothing.
 *
 * `'localOnly'` — v1 holds exactly the bytes this device already brought over, and the
 * difference is the musician's own editing here (#1274 patch R4). Nothing to bring over and
 * nothing wrong: there is no newer old-Ensemble version of this song, so this is reported as
 * already here, not as a failure. Only reachable from the song-menu path, which offers
 * everything regardless of the ledger.
 *
 * `'edited'` — the old app HAS moved on and this device's copy is no longer what the import
 * left there, either because a Save committed different content or because an unsaved draft
 * is being held. Overwriting would destroy work done HERE, so the run reports the item.
 *
 * `'update'` — the v1 bytes changed and the v2 copy is untouched since the import, so the
 * song is brought up to date in place. With no mark at all (an import by a build before the
 * mark existed, or a cleared ledger) revision 0 is the equivalent evidence: nothing in v2 has
 * ever committed a version over it.
 */
function sessionUpdate(
    candidate: ChartDocument,
    sourceDigest: string,
    existing: V1ExistingDocument,
    mark: V1SessionMark | null,
): 'present' | 'localOnly' | 'edited' | 'update' {
    if (sameContent(candidate, existing.document)) {
        return 'present';
    }
    const current = documentDigest(existing.document);
    const ours = mark
        ? current === mark.document || current === mark.replaced
        : existing.document.revision === 0;
    if (ours && existing.drafts === 0) {
        return 'update';
    }
    return mark?.digest === sourceDigest ? 'localOnly' : 'edited';
}

const SESSION_EDITED_REASON =
    'it has changed in the old Ensemble, but you have edited this copy here — nothing was overwritten.';

/**
 * What an import would do about ONE offered item — the single verdict both the card's
 * preview and the run itself read (#1274 patch N2).
 *
 * They used to answer this separately, and disagreed in exactly the case that matters: after
 * an interrupted update the run would happily finish the job while the card said "everything
 * is already here" and offered no button to press. A verdict computed once, from the same
 * inputs, cannot drift — so the plan below and `importV1` both call this and nothing else.
 *
 * `retire` rides along on a verdict rather than being a fifth kind: it is bookkeeping the RUN
 * should do (see `V1SessionMark.replaced`, patch N3), and the plan simply ignores it.
 */
export type V1ItemVerdict =
    | { kind: 'new'; document: ChartDocument; soundFallback: boolean }
    | { kind: 'update'; document: ChartDocument; soundFallback: boolean; expected: number }
    | { kind: 'present'; mark: V1SessionMark | null }
    | { kind: 'localOnly' }
    | { kind: 'edited'; reason: string }
    | { kind: 'unconvertible'; reason: string };

export function decideV1Item(
    source: V1Source,
    context: V1ImportContext,
    existing: V1ExistingDocument | undefined,
    mark: V1SessionMark | null,
    now: string,
): V1ItemVerdict {
    // A saved progression's id IS its content, so an id that is already here is the same
    // song — there is nothing to update and nothing to compare.
    if (existing && source.kind !== 'session') {
        return { kind: 'present', mark: null };
    }
    const conversion = convertV1(source, context, now);
    if (conversion.kind === 'failed') {
        return { kind: 'unconvertible', reason: conversion.reason };
    }
    if (!existing) {
        return {
            kind: 'new',
            document: conversion.document,
            soundFallback: conversion.soundFallback,
        };
    }
    switch (sessionUpdate(conversion.document, source.digest, existing, mark)) {
        case 'present':
            return {
                kind: 'present',
                // Re-anchor on the content that IS the import's work. Without this, a rerun
                // after a lost ledger could only fall back to "revision 0", which an earlier
                // in-place update has already moved past. It also retires a stale `replaced`
                // (patch N3): the write it was insurance against is long finished.
                mark: {
                    digest: source.digest,
                    document: documentDigest(existing.document),
                    replaced: null,
                },
            };
        case 'localOnly':
            // The musician's own editing, over v1 bytes this device already brought across.
            // Deliberately no mark: marking their document as ours would authorise
            // overwriting it later.
            return { kind: 'localOnly' };
        case 'edited':
            return { kind: 'edited', reason: SESSION_EDITED_REASON };
        default:
            return {
                kind: 'update',
                document: conversion.document,
                soundFallback: conversion.soundFallback,
                expected: existing.document.revision,
            };
    }
}

/**
 * What the card may promise, from the same verdicts the run will reach (#1274 patch R12/N2).
 *
 * `fresh` is exactly what an Import would land — created or updated — so the heading is a
 * promise the run keeps. `alreadyHere` is everything that is genuinely here already. An item
 * the run would refuse is neither: it is listed, with the reason the run would give, beside
 * the v1 data that could not be read at all, because "we will not overwrite your edit" is
 * something to say before the button is pressed, not only afterwards.
 */
export interface V1ImportPlan {
    fresh: number;
    alreadyHere: number;
    /**
     * `digest` is what a dismissal acknowledges: a card whose only item is blocked has no Import
     * button, so no run will ever record it as `'shown'` — the dismiss has to, or the automatic
     * offer re-opens on every load. These are exactly the verdicts `importV1` acknowledges itself.
     */
    blocked: Array<{ label: string; reason: string; digest: string }>;
}

export function planV1Import(
    offer: V1Finding,
    context: V1ImportContext,
    existing: ReadonlyMap<string, V1ExistingDocument>,
    mark: V1SessionMark | null,
    now = new Date().toISOString(),
): V1ImportPlan {
    const plan: V1ImportPlan = { fresh: 0, alreadyHere: 0, blocked: [] };
    for (const source of offer.sources) {
        const verdict = decideV1Item(source, context, existing.get(source.id), mark, now);
        if (verdict.kind === 'new' || verdict.kind === 'update') {
            plan.fresh++;
        } else if (verdict.kind === 'present' || verdict.kind === 'localOnly') {
            plan.alreadyHere++;
        } else {
            plan.blocked.push({
                label: source.title,
                reason: verdict.reason,
                digest: source.digest,
            });
        }
    }
    return plan;
}

/**
 * What a musician sees instead of the store's own words when two tabs import at once
 * (#1274 patch R7). `repository.ts`'s `ConflictError` says "save a copy or reopen the newer
 * version", which is advice for someone editing a chart — there is no chart on a stand here,
 * and the other tab is writing the very same thing this one is.
 */
const CONFLICT_REASON =
    'another tab was bringing this over at the same time. Nothing was lost — try again and it will be here.';

/**
 * Import the offered items one at a time.
 *
 * **Item-atomic and resumable by design, not transactional.** "Zero partial writes" holds
 * where it can: unreadable or unconvertible v1 data writes nothing at all, because every
 * item is parsed and converted before it is saved. A save that fails halfway through a run
 * is the other case, and rolling back the songs that already landed would be the wrong
 * answer — they are real music the musician keeps. So item k's failure leaves items 1..k-1
 * saved and remembered, reports k with a reason, and carries on; a rerun then touches only
 * what is still missing, because each landed item is remembered (and a progression's
 * document id is derived from its v1 bytes, so the repository would reject a second copy
 * anyway).
 */
export async function importV1(run: V1ImportRun): Promise<V1ImportOutcome> {
    const now = run.now ?? new Date().toISOString();
    const outcome: V1ImportOutcome = {
        imported: [],
        updated: [],
        failures: [],
        alreadyPresent: 0,
        problems: run.offer.problems,
        soundFallbacks: 0,
        // Reported v1 data is acknowledged the moment it is shown: it will read the same way
        // on every future run, so re-opening the offer for it forever is nagging, not safety.
        acknowledged: run.offer.problems.map((problem) => problem.digest),
    };
    // One live copy of the mark through the run: a session write re-anchors it, and a second
    // session item (impossible today, but the loop does not assume that) would otherwise
    // decide against a record two writes out of date.
    let mark = run.sessionMark;
    const remark = (next: V1SessionMark) => {
        mark = next;
        run.markSession(next);
    };
    for (const source of run.offer.sources) {
        const existing = run.existing.get(source.id);
        const verdict = decideV1Item(source, run.context, existing, mark, now);
        if (verdict.kind === 'unconvertible') {
            outcome.failures.push({ title: source.title, reason: verdict.reason });
            // These bytes cannot be converted by this build, and will not convert on the
            // next load either. Shown once is enough for the automatic offer.
            outcome.acknowledged.push(source.digest);
            continue;
        }
        if (verdict.kind === 'present' || verdict.kind === 'localOnly') {
            outcome.alreadyPresent++;
            run.remember(source.digest);
            // Written only when it actually says something new, so an unchanged profile
            // opened from the menu does not rewrite this key on every look (patch N3).
            if (
                verdict.kind === 'present' &&
                verdict.mark &&
                (verdict.mark.digest !== mark?.digest ||
                    verdict.mark.document !== mark?.document ||
                    mark?.replaced !== null)
            ) {
                remark(verdict.mark);
            }
            continue;
        }
        if (verdict.kind === 'edited') {
            outcome.failures.push({ title: source.title, reason: verdict.reason });
            // A standing situation, not a transient one: it resolves when v1 changes
            // again (new digest, offered again) or when the musician asks from the menu.
            outcome.acknowledged.push(source.digest);
            continue;
        }
        const expected = verdict.kind === 'update' ? verdict.expected : null;
        if (source.kind === 'session') {
            // BEFORE the save (patch R5): this is the record that survives a tab dying
            // mid-write, and it names both the content the write produces and the content it
            // replaces, so the next run recognises its own work whichever side of the commit
            // the page was lost on.
            remark({
                digest: source.digest,
                document: documentDigest(verdict.document),
                replaced: existing ? documentDigest(existing.document) : null,
            });
        }
        try {
            await run.save(verdict.document, expected);
        } catch (error) {
            outcome.failures.push({
                title: source.title,
                reason:
                    error instanceof ConflictError
                        ? CONFLICT_REASON
                        : error instanceof Error
                          ? error.message
                          : String(error),
            });
            // NOT acknowledged: the store failed, the item did not. Quota frees up, the other
            // tab finishes, the transaction is retried — the next run should offer it again.
            continue;
        }
        if (source.kind === 'session' && mark?.replaced !== null) {
            // The write landed, so the content it replaced is no longer evidence of anything
            // (patch N3): leaving it as a standing witness would let a musician's later
            // revert-and-Save back to that exact content read as the import's own work.
            remark({
                digest: source.digest,
                document: documentDigest(verdict.document),
                replaced: null,
            });
        }
        // The candidate as converted. The repository's committed copy differs only in the
        // two fields it owns (`revision`, `updatedAt`), and nothing downstream of here
        // stores this list — it is counted and its titles are shown.
        if (expected === null) {
            outcome.imported.push(verdict.document);
        } else {
            outcome.updated.push(verdict.document);
        }
        if (verdict.soundFallback) {
            outcome.soundFallbacks++;
        }
        run.remember(source.digest);
    }
    return outcome;
}

/** The one-line result the songbook shows after a run. */
export function describeV1Outcome(outcome: V1ImportOutcome): string {
    const parts = [`Imported ${outcome.imported.length}`];
    if (outcome.updated.length) {
        parts.push(`${outcome.updated.length} updated`);
    }
    if (outcome.alreadyPresent) {
        parts.push(`${outcome.alreadyPresent} already here`);
    }
    if (outcome.soundFallbacks) {
        const singular = outcome.soundFallbacks === 1;
        parts.push(
            `${outcome.soundFallbacks} song${singular ? '' : 's'} had sounds this app doesn't have; ${singular ? 'it uses' : 'they use'} the synth instead`,
        );
    }
    const trouble = [
        ...outcome.failures.map((failure) => `${failure.title} — ${failure.reason}`),
        ...outcome.problems.map((problem) => `${problem.label} — ${problem.reason}`),
    ];
    if (trouble.length) {
        // "Couldn't be brought over", not "couldn't be converted": the list also carries the
        // item this run deliberately declined to write over (a v1 session whose v2 copy has
        // been edited here), which converted perfectly well.
        parts.push(`${trouble.length} couldn't be brought over: ${trouble.join(' · ')}`);
    }
    return parts.join(' · ');
}
