import { KEY_ORDER, TIME_SIGNATURES } from '../config.js';
import {
    isKnownBassStyle,
    isKnownChordStyle,
    isKnownHarmonyStyle,
    isKnownSoloistStyle,
} from '../data/instrument-styles.js';
import { GENRE_FEELS, resolveGenre, SMART_GENRES } from '../data/smart-genres.js';
import { hydrateVoice } from '../engine/instrument-registry.js';
import { resolveSoloistMode } from '../engine/soloist-mode-policy.js';
import { isValidTimeSignatureGrouping } from '../meter.js';
import { escapeHTML, normalizeSongSeed, stripDangerousChars } from '../sanitize.js';
import { dispatch, getState, storage } from '../state.js';
import type {
    BassState,
    ChordState,
    GrooveState,
    HarmonyState,
    InstrumentVoice,
    Mutable,
    Palette,
    Section,
    SectionInstrumentKey,
    SharedBandPayload,
    SoloistState,
    SwingSub,
    ThemeMode,
} from '../types.js';
import { ACTIONS, isChordDensity, isSwingSub } from '../types.js';
import { normalizeKey } from '../utils.js';
import { INSTRUMENT_REVERB_DEFAULTS, MIXER_SETTINGS_VERSION } from './instruments.js';
import { saveCurrentState } from './persistence.js';
import { decodeBase64Unicode, decompressSections, generateId } from './share-codec.js';

/**
 * Clamp an untrusted numeric field, falling back to `defaultVal` for anything that
 * isn't a real number.
 *
 * why the explicit type test (#1258): this used to do `Number(val)`, which coerces
 * `null`/`false`/`[]`/`''` to **0** rather than `NaN` — so a forged payload with
 * `v: null` didn't get the intended `1.0` default, it got clamped to `min` and
 * **silently muted the instrument**. `o: null` likewise gave octave 0. Only genuine
 * numbers and numeric strings should pass; everything else is the default.
 * `Number.isFinite` (not `!isNaN`) so `Infinity` also lands on the default instead of
 * pinning to `max`.
 */
const clamp = (val: any, min: number, max: number, defaultVal: number): number => {
    const num = typeof val === 'string' ? parseFloat(val) : typeof val === 'number' ? val : NaN;
    if (!Number.isFinite(num)) {
        return defaultVal;
    }
    return Math.min(Math.max(min, num), max);
};

/**
 * Hydrate the #675 sound-source mode. A persisted boolean wins; for pre-#675
 * saves with no `autoSound`, default to **Auto** — unless the session had
 * explicitly picked a pack voice (via the old per-instrument picker), in which
 * case preserve that choice as a pin so auto-follow doesn't override it.
 */
const hydrateAutoSound = (saved: unknown, voice: InstrumentVoice): boolean =>
    typeof saved === 'boolean' ? saved : voice === 'synth';

// Mix-pass consolidation (2026-05-23) — soloist is now a single trumpet voice;
// legacy presets (neo / vowel / saxophone / shred) coerce to trumpet here so
// older saved sessions and share URLs keep loading without throwing.
const SUPPORTED_SOLOIST_PRESETS = new Set(['trumpet']);

function normalizeSoloistPreset(preset: any, fallback = 'trumpet'): string {
    return typeof preset === 'string' && SUPPORTED_SOLOIST_PRESETS.has(preset) ? preset : fallback;
}

/**
 * The one authority that normalizes an untrusted value into the swing-subdivision
 * keyspace. (#1264 moved the keyspace itself to `types.ts` as `SwingSub` /
 * `isSwingSub`; this function stays here because its FALLBACK — '8th' — is a
 * hydration policy, not a property of the type.)
 *
 * why (#1257): `swingSub` is a **string** ('8th' | '16th') — the swing-base `<select>`
 * in `InstrumentSettings.tsx` only ever dispatches those two, and the branching
 * consumer `calculateStepDuration` compares `=== '16th'`. The share reader used to
 * validate it against **numbers** (`[4, 8, 16].includes(...)`), which matched nothing
 * the writer has ever emitted (verified across all of git history: the writer's line
 * has only ever been `ss: groove.swingSub`). So *every* share link landed the number
 * 8 and locked the session to 8th-note swing. Per the repo's swing doctrine the grid
 * (8th vs 16th subdivision) *is* the feel, so a shared Funk or Neo-Soul session
 * reached the recipient with a different pocket than the sender heard. The swing-base
 * dropdown also showed an unmatched value, so it was visibly desynced from what was
 * playing — wrong, but not literally invisible.
 *
 * Used by **both** readers on purpose. The share path is where the corruption
 * originated, but `saveCurrentState()` then persisted the poisoned value and the
 * persist path passed it straight back through unguarded, so anyone who had already
 * opened a share link stayed stuck at 8th-note swing on every subsequent boot, with
 * no share URL involved. Fixing only the share reader would leave them there.
 */
export function normalizeSwingSub(value: unknown): SwingSub {
    return isSwingSub(value) ? value : '8th';
}

/**
 * Sanitize a free-text persisted display string (#1266).
 *
 * `arranger.lastChordPreset` is the case this exists for. It deliberately gets a
 * *sanitizer*, not an allowlist: user-saved progressions put arbitrary names in
 * this field (see `saveProgression` in arranger-controller.ts), so validating it
 * against the built-in preset table would discard a real user's own preset name.
 * What it needs instead is the same treatment as any other untrusted display
 * string — a type check, a length cap, and the dangerous-character strip — since
 * it is rendered in `PresetLibrary` and pre-fills the `prompt()` in
 * `saveProgression`.
 */
function sanitizeDisplayString(value: unknown, fallback: string, maxLen = 100): string {
    if (typeof value !== 'string') {
        return fallback;
    }
    const safe = stripDangerousChars(value).slice(0, maxLen);
    return safe || fallback;
}

/**
 * Is `id` usable as a section id — and therefore as a `sectionSeedMap` KEY (#1266)?
 *
 * Rejects the `Object.prototype` member names. A section id is what indexes
 * `groove.sectionSeedMap`, so an id of `'constructor'` makes `map[sectionId]`
 * return an inherited function instead of a seed on any prototype-bearing copy of
 * that map — and *every* live copy is prototype-bearing: `grooveReducer` re-creates
 * the map as a plain `{}` on `SET_SONG_SEED` / `RESET_STATE`, and `toRaw` in
 * `worker-client.ts` copies every synced object into a fresh `{}` before
 * `postMessage`. Rejecting the KEY at the source is therefore the only guard that
 * actually reaches every reader; null-prototyping the map does not survive either
 * hop. `Object.getOwnPropertyNames(Object.prototype)` rather than a hand-listed
 * `['__proto__', 'constructor', …]` so the set can't drift.
 *
 * Safe to reject outright rather than repair: every legitimate id is minted by
 * `generateId()`, and `decompressSections` mints fresh ones on the share path.
 */
const PROTOTYPE_MEMBER_NAMES: ReadonlySet<string> = new Set(
    Object.getOwnPropertyNames(Object.prototype),
);

function isSafeSectionId(id: unknown): id is string {
    return typeof id === 'string' && !!id && !PROTOTYPE_MEMBER_NAMES.has(id);
}

/**
 * Shape-validate the persisted `groove.sectionSeedMap` (#1266).
 *
 * This was the one place the persist reader assigned an untrusted **object**
 * wholesale (`savedState.groove.sectionSeedMap || {}`), and it is not an inert
 * one: it is `Record<string, number>`, it crosses to the logic worker via
 * `getSyncState()`, and `drums-tick.ts` used to read it as
 * `groove.sectionSeedMap[sectionId] || 0` — a plain-literal truthiness lookup, so
 * on a prototype-bearing object a section id of `'constructor'` yielded the
 * `Object` constructor *as a seed index*, and any non-numeric value flowed into
 * the drum-motif index arithmetic as `NaN`. (That read is type-checked as of this
 * change; the shape validation here is the other half.)
 *
 * Deliberately NOT null-prototyped, though that is the reflex the rest of this
 * file would suggest. It would be theatre here: this map's prototype is rebuilt as
 * a plain object twice over before any consumer sees it — `grooveReducer` assigns a
 * fresh `{}` on `SET_SONG_SEED` (which `state-effects.ts` fires on the FIRST
 * `TOGGLE_PLAY`, because `randomizeSeed` defaults true) and on `RESET_STATE`, and
 * `toRaw` in `worker-client.ts` copies every synced object into a plain `{}` before
 * `postMessage`. A null prototype would also silently drop the field out of
 * deepsignal's reactive graph, since its proxy predicate is
 * `SUPPORTED.has(value.constructor)` and a null-prototype object has no
 * `.constructor`.
 *
 * What actually holds, at three layers: the KEYS are rejected at the source
 * (`isSafeSectionId` above, so no section id can name a prototype member), the
 * VALUES are filtered here to finite numbers, and each of the four engine reads
 * type-checks what it gets back (`groove-engine.ts`, `drums-tick.ts`, and both
 * reads in `conductor.ts`). That combination reaches the worker; a prototype guard
 * on this object cannot.
 *
 * The 1000-entry cap mirrors `validateSections`' 500-section cap with headroom:
 * this map is keyed by section id, so it cannot legitimately outgrow the chart by
 * much. It bounds the SYNCED SNAPSHOT, not the parse — `JSON.parse` has already
 * materialized the whole payload by the time we get here.
 */
function validateSectionSeedMap(saved: unknown): Record<string, number> {
    const out: Record<string, number> = {};
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
        return out;
    }
    for (const [id, seed] of Object.entries(saved).slice(0, 1000)) {
        if (isSafeSectionId(id) && typeof seed === 'number' && Number.isFinite(seed)) {
            out[id] = seed;
        }
    }
    return out;
}

const VALID_PALETTES = new Set<Palette>([
    'after-hours',
    'midnight',
    'high-contrast',
    'forest',
    'sunset',
    'synthwave',
]);

// Theme migration (2026-05-31) — the single `theme` value split into two axes:
// `palette` (color identity) + `mode` (auto/light/dark). Map any legacy `theme`
// from an older saved session onto the new pair so sessions keep their look.
// Null-prototype for the same reason as TIME_SIGNATURES (#1258): `migrateTheme` indexes
// this with a persisted `theme` string, and on a plain literal
// `LEGACY_THEME_MAP['constructor']` returns the `Object` constructor — a truthy hit that
// sails past the `??` and yields `{ palette: undefined, mode: undefined }`.
const LEGACY_THEME_MAP: Record<string, { palette: Palette; mode: ThemeMode }> = Object.assign(
    Object.create(null),
    {
        auto: { palette: 'after-hours', mode: 'auto' },
        'after-hours': { palette: 'after-hours', mode: 'dark' },
        dark: { palette: 'after-hours', mode: 'dark' },
        'lead-sheet': { palette: 'after-hours', mode: 'light' },
        light: { palette: 'after-hours', mode: 'light' },
        midnight: { palette: 'midnight', mode: 'dark' },
        'high-contrast': { palette: 'high-contrast', mode: 'dark' },
    },
);

function migrateTheme(savedState: any): { palette: Palette; mode: ThemeMode } {
    // Prefer the new two-axis fields when present.
    if (VALID_PALETTES.has(savedState?.palette)) {
        const mode: ThemeMode = ['auto', 'light', 'dark'].includes(savedState?.mode)
            ? savedState.mode
            : 'auto';
        return { palette: savedState.palette, mode };
    }
    // Fall back to the legacy single `theme` value.
    return LEGACY_THEME_MAP[savedState?.theme] ?? { palette: 'after-hours', mode: 'auto' };
}

/**
 * #1264 — returns `SharedBandPayload | null`, not `any`. The parse itself is still
 * unchecked at runtime (it is `JSON.parse` on untrusted input), so this is an
 * ASSERTION about the wire format, not a validation of it — every field below is
 * still guarded before it reaches a slice. What the type buys is the other
 * direction: the writer in `export/sharing.ts` is annotated with the same interface,
 * so a reader that validates against a keyspace the writer never emits is now a
 * compile error rather than a bug that ships and survives for months (#1257).
 */
function decompressBandSettings(str: string): SharedBandPayload | null {
    try {
        // Bound untrusted `bnd` share-URL input before decode/parse to prevent
        // memory exhaustion — mirrors the 100KB cap in decompressSections (utils.ts).
        if (!str || typeof str !== 'string' || str.length > 102400) {
            return null;
        }
        const json = decodeBase64Unicode(str);
        return JSON.parse(json);
    } catch (e) {
        console.error('Failed to decompress band settings', e);
        return null;
    }
}

/**
 * Validates and sanitizes sections array from untrusted source.
 */
function validateSections(sections: any[]): any[] {
    if (!Array.isArray(sections)) {
        return [];
    }
    const safeSections = sections.slice(0, 500);
    return safeSections.map((s, i) => {
        if (!s || typeof s !== 'object') {
            return {
                id: generateId(),
                label: `Section ${i + 1}`,
                value: '',
                key: '',
                isMinor: undefined,
                repeat: 1,
                timeSignature: '',
                seamless: false,
            };
        }

        let safeLabel = escapeHTML(s.label || `Section ${i + 1}`);
        if (safeLabel.length > 100) {
            safeLabel = safeLabel.substring(0, 100);
        }

        let safeValue = typeof s.value === 'string' ? s.value : '';
        if (safeValue.length > 1000) {
            safeValue = safeValue.substring(0, 1000);
        }
        safeValue = stripDangerousChars(safeValue);

        let safeKey = '';
        if (s.key && typeof s.key === 'string') {
            const normKey = normalizeKey(s.key);
            if (KEY_ORDER.includes(normKey)) {
                safeKey = normKey;
            }
        }

        const safeInstruments: NonNullable<Section['instruments']> = {};
        if (s.instruments && typeof s.instruments === 'object' && !Array.isArray(s.instruments)) {
            const rawInstruments = s.instruments as Record<string, unknown>;
            const instrumentKeys: readonly SectionInstrumentKey[] = [
                'groove',
                'bass',
                'chords',
                'harmony',
                'soloist',
            ];
            for (const instrument of instrumentKeys) {
                if (
                    Object.hasOwn(rawInstruments, instrument) &&
                    typeof rawInstruments[instrument] === 'boolean'
                ) {
                    safeInstruments[instrument] = rawInstruments[instrument];
                }
            }
        }

        const targetIntensity =
            typeof s.targetIntensity === 'number' && Number.isFinite(s.targetIntensity)
                ? Math.max(0, Math.min(1, s.targetIntensity))
                : undefined;

        return {
            // why (#1258): type-check, don't just truthiness-check. Section ids key
            // `sectionSeedMap` in groove-engine; an object-valued id stringifies to
            // "[object Object]" and therefore *collides* across every section that
            // carries one, silently collapsing their independent groove seeds into one.
            // `decompressSections` always mints fresh ids, so only the persist path
            // could supply a caller-controlled id — but it's a one-word fix.
            //
            // #1266 adds the prototype-shape rejection. Section ids are the KEYS of
            // `sectionSeedMap`, so an id of 'constructor' turns `map[sectionId]` into
            // the `Object` constructor on any prototype-bearing copy of that map — and
            // hydration's null-prototype hardening cannot help there, because
            // `structuredClone` does not preserve a null prototype and the two hottest
            // readers (`groove-engine.ts`, `drums-tick.ts`) run on the WORKER's cloned
            // mirror. Rejecting the id at the source closes it on both threads at once.
            // Safe to reject outright: every legitimate id comes from `generateId()`.
            id: isSafeSectionId(s.id) ? s.id : generateId(),
            label: safeLabel,
            value: safeValue,
            key: safeKey,
            isMinor: typeof s.isMinor === 'boolean' ? s.isMinor : undefined,
            repeat: Math.min(Math.max(1, parseInt(s.repeat, 10) || 1), 64),
            timeSignature:
                typeof s.timeSignature === 'string' && TIME_SIGNATURES[s.timeSignature]
                    ? s.timeSignature
                    : '',
            seamless: !!s.seamless,
            ...(targetIntensity === undefined ? {} : { targetIntensity }),
            ...(Object.keys(safeInstruments).length === 0 ? {} : { instruments: safeInstruments }),
        };
    });
}

/**
 * A custom grouping is a positive-integer partition of the selected meter.
 *
 * The UI currently exposes only a few idiomatic alternatives, but the engine contract is
 * broader and future-safe: any bounded partition is meaningful. Rejecting malformed input
 * to `null` delegates to TIME_SIGNATURES' default grouping without persisting poisoned meter
 * math. The length bound runs before iteration so an untrusted array cannot make hydration do
 * unbounded work.
 */
function validateGrouping(grouping: unknown, timeSignature: string): number[] | null {
    if (!isValidTimeSignatureGrouping(grouping, timeSignature)) {
        return null;
    }
    return [...grouping];
}

/**
 * Load the persisted session, falling back to a fresh one if it can't be read.
 *
 * The fallback is structural, not belt-and-suspenders. `hydrateState()` runs
 * inside `init()`'s outer `try` in `main.ts`, and `mountComponents()` runs inside
 * that *same* `try` — so a throw here doesn't degrade to a default session, it
 * skips the mount entirely. The Preact tree never renders, which means
 * `ui-root.tsx`'s `<ErrorBoundary>` never renders either, and the user gets a
 * blank page with no on-screen error and no recovery path short of clearing site
 * storage from devtools. One unguarded field anywhere in `hydrateSavedState()`
 * is enough to do that, so the blast radius is capped here once rather than
 * re-litigated per field.
 *
 * Silent by design: a user whose saved session just failed to load is better
 * served by a working app than by a toast about a storage error they can't act
 * on. The console error is for us. The corrupt payload is left in place — the
 * next `saveCurrentState()` overwrites it, and deleting a user's data on a read
 * failure we may have misdiagnosed is the more destructive default.
 */
export function hydrateState(): void {
    try {
        hydrateSavedState();
    } catch (e) {
        console.error('[Hydration] Saved session could not be loaded; starting fresh:', e);
        dispatch(ACTIONS.RESET_STATE);
    }
    dispatch(ACTIONS.HYDRATE);
}

function hydrateSavedState(): void {
    const { playback, chords, bass, soloist, harmony, groove, arranger, vizState } = getState();
    const savedState = storage.get('currentState');
    // Array.isArray, not truthiness — and this gate is the one the try/catch below
    // structurally cannot cover, because a wrong-shape `sections` doesn't throw.
    // A string or `{length: n}` here is truthy, so hydration used to proceed while
    // `validateSections` correctly returned `[]`, booting an empty chart and never
    // reaching the RESET_STATE `else`. `saveCurrentState()` then persisted the empty
    // chart, making it permanent. Routing wrong-shape to the `else` gives the user
    // the default song instead.
    //
    // Deliberately NOT `&& length > 0`: a legitimately empty `sections` array is a
    // reachable user state, and sending it to RESET_STATE would discard their BPM,
    // genre and mixer along with the empty chart. Wrong shape is the bug; empty is
    // just empty.
    if (Array.isArray(savedState?.sections)) {
        const shouldResetMixer = Number(savedState.mixerVersion) !== MIXER_SETTINGS_VERSION;
        const validatedSections = validateSections(savedState.sections);

        let validatedKey = 'C';
        if (savedState.key) {
            const normKey = normalizeKey(savedState.key);
            if (KEY_ORDER.includes(normKey)) {
                validatedKey = normKey;
            }
        }

        let validatedTS = '4/4';
        if (savedState.timeSignature && TIME_SIGNATURES[savedState.timeSignature]) {
            validatedTS = savedState.timeSignature;
        }

        const validNotations = ['roman', 'name', 'nns'];
        const validatedNotation = validNotations.includes(savedState.notation)
            ? savedState.notation
            : 'roman';

        Object.assign(arranger, {
            sections: validatedSections,
            key: validatedKey,
            timeSignature: validatedTS,
            grouping: validateGrouping(savedState.grouping, validatedTS),
            isMinor: !!savedState.isMinor,
            notation: validatedNotation,
            lastChordPreset: sanitizeDisplayString(savedState.lastChordPreset, 'Pop (Standard)'),
            // #1266 — the third reader of `arranger.seed`, now on the same bound as
            // the other two. `normalizeSongSeed` also subsumes the old
            // `typeof === 'string'` tests, so the `||` chain still means "prefer the
            // top-level seed, fall back to the pre-#791 nested one."
            seed:
                normalizeSongSeed(savedState.seed) ||
                normalizeSongSeed(savedState.soloist?.seed) ||
                '',
            randomizeSeed:
                typeof savedState.randomizeSeed === 'boolean' ? savedState.randomizeSeed : true,
        });

        const { palette, mode } = migrateTheme(savedState);
        Object.assign(playback, {
            palette,
            mode,
            bpm: clamp(savedState.bpm, 20, 300, 100),
            bandIntensity: clamp(savedState.bandIntensity, 0, 1, 0.35),
            complexity: clamp(savedState.complexity, 0, 1, 0.3),
            // `autoIntensity` and `metronome` are persisted by `saveCurrentState()` but
            // deliberately NOT restored — every session starts with the conductor on and
            // the click off, regardless of how the last one ended. Stated here because
            // this is otherwise indistinguishable from the `harmonyOctave` bug fixed in
            // #1259 (saved on every write, silently dropped on every load), and the next
            // person diffing writer against reader will land on exactly these two lines.
            autoIntensity: true,
            practiceMode: savedState.practiceMode !== undefined ? !!savedState.practiceMode : true,
            metronome: false,
            visualFlash: !!savedState.visualFlash,
            qualityColors:
                savedState.qualityColors !== undefined ? !!savedState.qualityColors : true,
            countIn: savedState.countIn !== undefined ? !!savedState.countIn : true,
            sessionTimer: clamp(savedState.sessionTimer, 0, 60, 5),
            songMode: savedState.songMode !== undefined ? !!savedState.songMode : true,
            applyPresetSettings: !!savedState.applyPresetSettings,
            masterVolume: clamp(savedState.masterVolume, 0, 1, 0.4),
        });

        // #1259 — coerced, not passed through. This was the least-validated write in the
        // whole function: the old `!== undefined ? … : false` accepted any JSON value
        // (a string, an object) into a field typed `boolean`. A garbage-truthy value made
        // the scheduler emit visualizer events on every step, and `saveCurrentState()`
        // wrote it straight back, so it outlived the reload meant to clear it. `!!` also
        // covers the missing-key case identically to the old ternary.
        (vizState as Mutable<typeof vizState>).enabled = !!savedState.vizEnabled; // @direct-mutation

        if (savedState.chords) {
            // #787: Acoustic's chord-style default changed 'pad' → 'arp' (the
            // fingerpick lane). A session saved under the old default would
            // otherwise reload as a static block pad with no arpeggio, so
            // upgrade that one stale default. A deliberately-chosen 'pad' on
            // any other genre is preserved.
            const migratedChordStyle =
                savedState.groove?.genreFeel === 'Acoustic' && savedState.chords.style === 'pad'
                    ? 'arp'
                    : savedState.chords.style;
            Object.assign(chords, {
                enabled:
                    savedState.chords.enabled !== undefined ? !!savedState.chords.enabled : true,
                voice: hydrateVoice(savedState.chords.voice),
                autoSound: hydrateAutoSound(
                    savedState.chords.autoSound,
                    hydrateVoice(savedState.chords.voice),
                ),
                // #1266 — validated against the same predicate the share reader uses.
                // The #787 migration runs FIRST so its 'pad' → 'arp' rewrite is what
                // gets validated (both are known styles, so the order is a statement of
                // intent rather than a behavior difference).
                style: isKnownChordStyle(migratedChordStyle) ? migratedChordStyle : 'smart',
                instrument: 'Piano',
                octave: clamp(savedState.chords.octave, 0, 127, 48),
                // Normalized, same reasoning as `swingSub` below (#1257/#1258): every
                // share link before #1257 landed the *number* 0.5 here, `persistence.ts`
                // wrote it back verbatim, and an unguarded read restores it on every boot
                // — so that population stays pinned to standard voicing forever. Also
                // stops a pre-#1257 save with no `density` key from overwriting the
                // slice's 'standard' default with `undefined`.
                density: isChordDensity(savedState.chords.density)
                    ? savedState.chords.density
                    : 'standard',
                volume: shouldResetMixer ? 1.0 : clamp(savedState.chords.volume, 0, 1, 1.0),
                reverb: shouldResetMixer
                    ? INSTRUMENT_REVERB_DEFAULTS.chords
                    : clamp(savedState.chords.reverb, 0, 1, INSTRUMENT_REVERB_DEFAULTS.chords),
            });
        }
        if (savedState.bass) {
            Object.assign(bass, {
                enabled: savedState.bass.enabled !== undefined ? !!savedState.bass.enabled : true,
                voice: hydrateVoice(savedState.bass.voice),
                autoSound: hydrateAutoSound(
                    savedState.bass.autoSound,
                    hydrateVoice(savedState.bass.voice),
                ),
                // #1266 — same predicate as the share reader. A retired style key
                // (e.g. the #628 'whole' drone) now falls back to the genre-routed
                // 'smart' default here as well as on the share path, which is what the
                // BASS_STYLES comment has claimed hydration did since #628; the guard
                // it names was only ever on the share reader.
                style: isKnownBassStyle(savedState.bass.style) ? savedState.bass.style : 'smart',
                octave: clamp(savedState.bass.octave, 0, 127, 36),
                volume: shouldResetMixer ? 1.0 : clamp(savedState.bass.volume, 0, 1, 1.0),
                reverb: shouldResetMixer
                    ? INSTRUMENT_REVERB_DEFAULTS.bass
                    : clamp(savedState.bass.reverb, 0, 1, INSTRUMENT_REVERB_DEFAULTS.bass),
            });
        }
        if (savedState.soloist) {
            Object.assign(soloist, {
                enabled:
                    savedState.soloist.enabled !== undefined ? !!savedState.soloist.enabled : false,
                voice: hydrateVoice(savedState.soloist.voice),
                autoSound: hydrateAutoSound(
                    savedState.soloist.autoSound,
                    hydrateVoice(savedState.soloist.voice),
                ),
                // #1266 — the sharpest of the unguarded persist fields: a raw value
                // here reaches `STYLE_CONFIG[style] || STYLE_CONFIG.scalar` in
                // soloist-seeder.ts and synth-soloist.ts. (That table is now
                // null-prototype too — belt and braces, since the seeder's copy runs on
                // the worker's mirror of this slice.)
                style: isKnownSoloistStyle(savedState.soloist.style)
                    ? savedState.soloist.style
                    : 'smart',
                preset: normalizeSoloistPreset(savedState.soloist.preset, 'trumpet'),
                octave:
                    savedState.soloist.octave === 77 ||
                    savedState.soloist.octave === 67 ||
                    savedState.soloist.octave === undefined
                        ? 72
                        : clamp(savedState.soloist.octave, 0, 127, 72),
                volume: shouldResetMixer ? 1.0 : clamp(savedState.soloist.volume, 0, 1, 1.0),
                reverb: shouldResetMixer
                    ? INSTRUMENT_REVERB_DEFAULTS.soloist
                    : clamp(savedState.soloist.reverb, 0, 1, INSTRUMENT_REVERB_DEFAULTS.soloist),
                mode: resolveSoloistMode(
                    savedState.soloist.mode
                        ? savedState.soloist.mode
                        : savedState.soloist.doubleStops
                          ? 'guitar'
                          : 'monophonic',
                ),
                // #856 — Auto phrasing mode. Pre-#856 saves have no `autoMode`;
                // default to Auto so they pick up voice-derived guitar mode.
                autoMode:
                    typeof savedState.soloist.autoMode === 'boolean'
                        ? savedState.soloist.autoMode
                        : true,
                // #1167 — pre-#1167 saves have no `phrasingIntensity` (and may carry
                // a stale `complexity`, always inert and deleted from state in
                // #1070); clamp() falls back to the 0.5 default when the key is
                // missing or out of range. This allow-listed Object.assign is also
                // what silently drops the retired key — see
                // tests/unit/state/soloist-complexity-removal.test.ts.
                phrasingIntensity: clamp(savedState.soloist.phrasingIntensity, 0, 1, 0.5),
            });
        }
        if (savedState.harmony) {
            Object.assign(harmony, {
                enabled:
                    savedState.harmony.enabled !== undefined ? !!savedState.harmony.enabled : false,
                voice: hydrateVoice(savedState.harmony.voice),
                autoSound: hydrateAutoSound(
                    savedState.harmony.autoSound,
                    hydrateVoice(savedState.harmony.voice),
                ),
                // #1266 — same predicate as the share reader; feeds the
                // `STYLE_CONFIGS[activeStyle]` lookup in harmonies.ts.
                style: isKnownHarmonyStyle(savedState.harmony.style)
                    ? savedState.harmony.style
                    : 'smart',
                octave: clamp(savedState.harmony.octave, 0, 127, 60),
                volume: shouldResetMixer ? 1.0 : clamp(savedState.harmony.volume, 0, 1, 1.0),
                reverb: shouldResetMixer
                    ? INSTRUMENT_REVERB_DEFAULTS.harmony
                    : clamp(savedState.harmony.reverb, 0, 1, INSTRUMENT_REVERB_DEFAULTS.harmony),
                complexity: clamp(savedState.harmony.complexity, 0, 1, 0.5),
            });
        }
        if (savedState.groove) {
            // #1266 — genreFeel and lastSmartGenre resolved as ONE pair, matching the
            // share reader's `?genre=` path (which lands both halves off a single
            // `resolveGenre` call). Derived independently, they could disagree: a
            // payload carrying only `lastSmartGenre: 'Jazz'` used to yield feel 'Rock'
            // + name 'Jazz', so the picker read Jazz while every feel-keyed engine
            // table played Rock. `resolveGenre` normalizes either keyspace, so
            // whichever half survived the payload reconstructs the other.
            const savedGenre =
                resolveGenre(
                    typeof savedState.groove.genreFeel === 'string'
                        ? savedState.groove.genreFeel
                        : null,
                ) ??
                resolveGenre(
                    typeof savedState.groove.lastSmartGenre === 'string'
                        ? savedState.groove.lastSmartGenre
                        : null,
                );
            Object.assign(groove, {
                enabled:
                    savedState.groove.enabled !== undefined ? !!savedState.groove.enabled : true,
                voice: hydrateVoice(savedState.groove.voice),
                autoSound: hydrateAutoSound(
                    savedState.groove.autoSound,
                    hydrateVoice(savedState.groove.voice),
                ),
                volume: shouldResetMixer ? 1.0 : clamp(savedState.groove.volume, 0, 1, 1.0),
                reverb: shouldResetMixer
                    ? INSTRUMENT_REVERB_DEFAULTS.groove
                    : clamp(savedState.groove.reverb, 0, 1, INSTRUMENT_REVERB_DEFAULTS.groove),
                swing: clamp(savedState.groove.swing, 0, 100, 0),
                // Normalized, not passed through: a pre-fix share load could have
                // persisted the number 8 here (see `normalizeSwingSub`), and an
                // unguarded passthrough would restore it on every boot forever.
                swingSub: normalizeSwingSub(savedState.groove.swingSub),
                measures: clamp(savedState.groove.measures, 1, 8, 1),
                humanize: clamp(savedState.groove.humanize, 0, 100, 20),
                // #1181: `followPlayback` (and its even older `autoFollow` alias) removed —
                // no control has been able to set it since the chart-first migration, so
                // the reader in Visualizer is now inlined as always-on. Both stale keys are
                // simply ignored here rather than migrated: an unread extra key in a
                // persisted payload is harmless, and the next save drops it.
                // Not allowlisted against DRUM_PRESETS on purpose: `loadDrumPreset`
                // already guards its own lookup with `Object.hasOwn` (#1244) and is the
                // field's only consumer beyond display, so the single-read-site half of
                // the prototype-guard rule applies. Sanitized as a display string.
                lastDrumPreset: sanitizeDisplayString(
                    savedState.groove.lastDrumPreset,
                    'Basic Rock',
                ),
                // Both halves come from the one `savedGenre` resolution above, so they
                // can no longer disagree. `GENRE_FEELS.includes` is kept as the outer
                // gate for the feel because that list is the engine-facing keyspace.
                genreFeel:
                    savedGenre && GENRE_FEELS.includes(savedGenre.feel) ? savedGenre.feel : 'Rock',
                lastSmartGenre: savedGenre?.name || 'Rock',
                sectionSeedMap: validateSectionSeedMap(savedState.groove.sectionSeedMap),
                currentMeasure: 0,
            });

            // Array.isArray, not a truthy `.length` check: a persisted payload that
            // is valid JSON but the wrong shape (a partial write, a rollback across a
            // schema change) can hand us a string or an object here, whose truthy
            // `.length` passes the old guard and whose missing `.forEach` then throws.
            // Same reasoning for `savedInst.steps` — and note it gates the `fill(0)`
            // too, so an instrument with an unreadable pattern keeps its default steps
            // rather than being blanked.
            if (Array.isArray(savedState.groove.pattern) && savedState.groove.pattern.length > 0) {
                savedState.groove.pattern.forEach((savedInst: any) => {
                    const inst = groove.instruments.find((i) => i.name === savedInst?.name);
                    if (inst && Array.isArray(savedInst.steps)) {
                        inst.steps.fill(0);
                        savedInst.steps.forEach((v: any, i: number) => {
                            if (i < 128) {
                                inst.steps[i] = v;
                            }
                        });
                    }
                });
            }
        }

        if (savedState.midi) {
            dispatch(ACTIONS.SET_MIDI_CONFIG, {
                enabled: savedState.midi.enabled || false,
                selectedOutputId: savedState.midi.selectedOutputId || null,
                inputEnabled: savedState.midi.inputEnabled || false,
                // Validated against the live enumerated `inputs` list once MIDI access
                // is (re)acquired (syncMIDIInputs) — a stale/no-longer-connected device
                // id falls back to "any input" rather than silently killing play-along.
                selectedInputId: savedState.midi.selectedInputId || null,
                chordsChannel: savedState.midi.chordsChannel || 1,
                bassChannel: savedState.midi.bassChannel || 2,
                soloistChannel: savedState.midi.soloistChannel || 3,
                harmonyChannel: savedState.midi.harmonyChannel || 4,
                drumsChannel: savedState.midi.drumsChannel || 10,
                latency: savedState.midi.latency || 0,
                muteLocal:
                    savedState.midi.muteLocal !== undefined ? savedState.midi.muteLocal : true,
                chordsOctave: savedState.midi.chordsOctave || 0,
                bassOctave: savedState.midi.bassOctave || 0,
                soloistOctave: savedState.midi.soloistOctave || 0,
                // #1259 — `harmonyOctave` was missing here while `persistence.ts` saved
                // it, `Settings.tsx` exposes a control for it and `midi-scheduler.ts`
                // transposes by it: the setting was written on every save and silently
                // dropped on every load. Found by diffing the persisted manifest against
                // this reader, which is exactly what this issue's regression guard does.
                harmonyOctave: savedState.midi.harmonyOctave || 0,
                drumsOctave: savedState.midi.drumsOctave || 0,
                velocitySensitivity:
                    savedState.midi.velocitySensitivity !== undefined
                        ? savedState.midi.velocitySensitivity
                        : 1.0,
            });
        }

        if (shouldResetMixer) {
            saveCurrentState();
        }
    } else {
        dispatch(ACTIONS.RESET_STATE);
    }
}

export interface UrlHydrationResult {
    genreName: string | null;
    genreGrooveOverrides: Pick<GrooveState, 'swing' | 'swingSub' | 'humanize'> | null;
}

export function loadFromUrl(): UrlHydrationResult {
    const { arranger, groove, soloist, bass, chords, harmony } = getState();
    const params = new URLSearchParams(window.location.search);
    let hasParams = false;
    let genreName: string | null = null;
    let genreGrooveOverrides: UrlHydrationResult['genreGrooveOverrides'] = null;

    const sParam = params.get('s');
    if (sParam) {
        (arranger as Mutable<typeof arranger>).sections = decompressSections(sParam); // @direct-mutation
        hasParams = true;
    } else {
        const progParam = params.get('prog');
        if (progParam) {
            let prog = progParam;
            if (prog.length > 1000) {
                prog = prog.substring(0, 1000);
            }
            prog = stripDangerousChars(prog);
            (arranger as Mutable<typeof arranger>).sections = [
                { id: generateId(), label: 'Main', value: prog },
            ]; // @direct-mutation
            hasParams = true;
        }
    }

    if (hasParams) {
        clearChordPresetHighlight();
    }

    const keyParam = params.get('key');
    if (keyParam) {
        const rawKey = normalizeKey(keyParam);
        if (KEY_ORDER.includes(rawKey)) {
            (arranger as Mutable<typeof arranger>).key = rawKey; // @direct-mutation
        }
    }

    const tsParam = params.get('ts');
    if (tsParam) {
        if (TIME_SIGNATURES[tsParam]) {
            (arranger as Mutable<typeof arranger>).timeSignature = tsParam; // @direct-mutation
            // Why (#1029): URL charts do not encode custom grouping. Boot hydration runs
            // first, so retaining the recipient's persisted grouping here could attach a
            // 5/4 partition to a shared 7/4 chart. Match the interactive meter-change path:
            // the URL owns the meter and the configured default owns its grouping.
            (arranger as Mutable<typeof arranger>).grouping = null; // @direct-mutation
        }
    }

    const bpmParam = params.get('bpm');
    if (bpmParam) {
        const bpm = parseFloat(bpmParam);
        if (!Number.isNaN(bpm) && bpm >= 20 && bpm <= 300) {
            dispatch(ACTIONS.SET_BPM, bpm);
        }
    }

    const genreParam = params.get('genre');
    if (genreParam) {
        // #1200 — the share writer emits the FEEL (`groove.genreFeel`), while older
        // and hand-written links carry the genre NAME. Accept either keyspace and land
        // each half canonically; validating a feel against the name list silently
        // dropped Ska-Punk ('Ska') and Bossa ('Bossa Nova') back to the Rock default,
        // and writing a name straight into `genreFeel` misses every feel-keyed table.
        const resolvedGenre = resolveGenre(genreParam);
        if (resolvedGenre) {
            genreName = resolvedGenre.name;
            // #1000 — run the same REDUCER pipeline as the picker while boot is still
            // pre-subscriber. This applies the canonical lane styles + groove feel;
            // main.ts reconciles the async drum/Auto-voice effects once the worker and
            // subscriber are live. The `bnd` block below intentionally runs afterward,
            // so its explicit high-fidelity settings remain the final authority.
            dispatch(ACTIONS.SET_GENRE_FEEL, {
                genreName,
                ...SMART_GENRES[genreName],
            });
        }
    }

    const styleParam = params.get('style');
    if (styleParam) {
        // Same union as the `bnd` reader — a `?style=arp` permalink is legitimate.
        // Apply after the genre pipeline so an explicit permalink style still wins.
        if (isKnownChordStyle(styleParam)) {
            dispatch(ACTIONS.SET_STYLE, { module: 'chords', style: styleParam });
        }
    }

    const intParam = params.get('int');
    if (intParam) {
        const val = parseFloat(intParam);
        if (!Number.isNaN(val)) {
            dispatch(ACTIONS.SET_BAND_INTENSITY, Math.max(0, Math.min(1, val)));
        }
    }

    const compParam = params.get('comp');
    if (compParam) {
        const val = parseFloat(compParam);
        if (!Number.isNaN(val)) {
            dispatch(ACTIONS.SET_COMPLEXITY, Math.max(0, Math.min(1, val)));
        }
    }

    const notationParam = params.get('notation');
    if (notationParam) {
        if (['roman', 'name', 'nns'].includes(notationParam)) {
            (arranger as Mutable<typeof arranger>).notation = notationParam; // @direct-mutation
        }
    }

    const tmrParam = params.get('tmr');
    if (tmrParam) {
        const tmr = parseInt(tmrParam, 10);
        if (!Number.isNaN(tmr)) {
            dispatch(ACTIONS.SET_SESSION_TIMER, clamp(tmr, 0, 60, 0));
        }
    }

    // High-fidelity band settings
    const bndParam = params.get('bnd');
    if (bndParam) {
        const band = decompressBandSettings(bndParam);
        if (band) {
            const hasMixerVersion =
                Number(band.mv || band.mixerVersion || 0) === MIXER_SETTINGS_VERSION;
            if (band.s) {
                // #1264 — bound to a local so TS keeps the `if (band.s)` narrowing in the
                // expressions below rather than needing a `!` that would defeat the very
                // check this type was added to enable.
                const bs = band.s;
                Object.assign(soloist, {
                    enabled: !!bs.e,
                    // #1266 — the shared predicate, not an inline list scan. The persist
                    // reader now asks the identical question; duplicating the guard is
                    // how the two readers drifted apart in the first place.
                    style: isKnownSoloistStyle(bs.s) ? bs.s : soloist.style,
                    preset: normalizeSoloistPreset(bs.p, soloist.preset),
                    octave: clamp(bs.o, 0, 127, 72),
                    volume: hasMixerVersion ? clamp(bs.v, 0, 1, 1.0) : 1.0,
                    reverb: hasMixerVersion
                        ? clamp(bs.r, 0, 1, INSTRUMENT_REVERB_DEFAULTS.soloist)
                        : INSTRUMENT_REVERB_DEFAULTS.soloist,
                    mode: resolveSoloistMode(bs.m || soloist.mode),
                    // #856 — older share URLs have no `am`; default to Auto.
                    autoMode: bs.am === undefined ? true : !!bs.am,
                } satisfies Partial<SoloistState>);
                // why (#1258): sanitize + cap, matching the top-level `?seed=` sibling
                // below. This route previously accepted any string up to the payload's
                // ~100KB ceiling, and that value is then persisted, re-shared, and fed
                // per-section into `deriveSectionSeed` — so an oversized seed was a
                // hashing-cost and data-hygiene problem carried forward indefinitely.
                // (Not XSS: Preact escapes it at render.) Two readers of the same field
                // disagreeing on its bounds is the actual defect.
                // #1266 — one authority (`normalizeSongSeed`), shared with `?seed=`
                // below, the persist reader, and the `SET_SONG_SEED` reducer that bounds
                // the write side. The inline `stripDangerousChars(...).slice(0, 64)`
                // this replaces was #1258's fix for *this* reader disagreeing with
                // `?seed=`; the persist reader and the seed input were the two that
                // stayed out of step.
                const safeSeed = normalizeSongSeed(bs.sd);
                if (safeSeed) {
                    Object.assign(arranger, { seed: safeSeed });
                }
            }
            if (band.b) {
                const bb = band.b; // #1264 — see the `bs` note above
                Object.assign(bass, {
                    enabled: !!bb.e,
                    style: isKnownBassStyle(bb.s) ? bb.s : bass.style, // #1266 — shared predicate
                    octave: clamp(bb.o, 0, 127, 36),
                    volume: hasMixerVersion ? clamp(bb.v, 0, 1, 1.0) : 1.0,
                    reverb: hasMixerVersion
                        ? clamp(bb.r, 0, 1, INSTRUMENT_REVERB_DEFAULTS.bass)
                        : INSTRUMENT_REVERB_DEFAULTS.bass,
                } satisfies Partial<BassState>);
            }
            if (band.c) {
                Object.assign(chords, {
                    enabled: !!band.c.e,
                    // isKnownChordStyle, not the CHORD_STYLES picker list: the genre table
                    // routes `chord: 'arp'` (Acoustic), which the picker doesn't offer, so
                    // validating against the picker alone REJECTED a live style and dropped
                    // a shared Acoustic session's arpeggio (#1257).
                    style: isKnownChordStyle(band.c.s) ? band.c.s : chords.style,
                    octave: clamp(band.c.o, 0, 127, 48),
                    volume: hasMixerVersion ? clamp(band.c.v, 0, 1, 1.0) : 1.0,
                    reverb: hasMixerVersion
                        ? clamp(band.c.r, 0, 1, INSTRUMENT_REVERB_DEFAULTS.chords)
                        : INSTRUMENT_REVERB_DEFAULTS.chords,
                    // why (#1257): the exact same writer/reader keyspace mismatch as
                    // `swingSub` above, found by auditing the rest of this block for it.
                    // `chords.density` is a STRING ('thin' | 'standard' | 'rich'), the
                    // writer emits it verbatim, and `clamp` does `parseFloat('rich')` →
                    // NaN → returns its numeric default, so every share link landed the
                    // number 0.5. The branching consumers in `chords-styles.ts` compare
                    // `density === 'rich'` / `=== 'thin'`, both then permanently false, so
                    // a sender's rich (5+ note) or thin (3-note) voicing collapsed to
                    // standard on the recipient. Only partly masked by `applyConductor`
                    // rewriting density from intensity — that runs via
                    // `updateAutoConductor`, which early-returns unless a ramp is actually
                    // in flight, and a share URL sets `int=` directly.
                    density: isChordDensity(band.c.d) ? band.c.d : 'standard',
                } satisfies Partial<ChordState>);
            }
            if (band.h) {
                const bh = band.h; // #1264 — see the `bs` note above
                Object.assign(harmony, {
                    enabled: !!bh.e,
                    style: isKnownHarmonyStyle(bh.s) ? bh.s : harmony.style, // #1266 — shared predicate
                    octave: clamp(bh.o, 0, 127, 60),
                    volume: hasMixerVersion ? clamp(bh.v, 0, 1, 1.0) : 1.0,
                    reverb: hasMixerVersion
                        ? clamp(bh.r, 0, 1, INSTRUMENT_REVERB_DEFAULTS.harmony)
                        : INSTRUMENT_REVERB_DEFAULTS.harmony,
                    complexity: clamp(bh.c, 0, 1, 0.5),
                } satisfies Partial<HarmonyState>);
            }
            if (band.g) {
                const explicitGroove = {
                    enabled: !!band.g.e,
                    volume: hasMixerVersion ? clamp(band.g.v, 0, 1, 1.0) : 1.0,
                    reverb: hasMixerVersion
                        ? clamp(band.g.r, 0, 1, INSTRUMENT_REVERB_DEFAULTS.groove)
                        : INSTRUMENT_REVERB_DEFAULTS.groove,
                    swing: clamp(band.g.sw, 0, 100, 0),
                    swingSub: normalizeSwingSub(band.g.ss),
                    humanize: clamp(band.g.hu, 0, 100, 20),
                } satisfies Partial<GrooveState>;
                Object.assign(groove, explicitGroove);
                genreGrooveOverrides = {
                    swing: explicitGroove.swing,
                    swingSub: explicitGroove.swingSub,
                    humanize: explicitGroove.humanize,
                };
            }
        }
    }

    // Top-level seed override. Lets a permalink (especially the audition
    // links produced by `npm run audition-link`) pin the soloist seed
    // without having to round-trip through the full base64 `bnd` payload.
    const seedParam = params.get('seed');
    if (seedParam) {
        const safe = normalizeSongSeed(seedParam);
        if (safe) {
            (arranger as Mutable<typeof arranger>).seed = safe; // @direct-mutation
        }
    }

    // Audition permalink: show the AuditionOverlay so a single click satisfies
    // browser autoplay policy and triggers togglePlay on the now-hydrated scene.
    if (params.get('autoplay') === '1') {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'audition', open: true });
    }

    return { genreName, genreGrooveOverrides };
}

function clearChordPresetHighlight() {}
