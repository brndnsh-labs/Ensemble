import { KEY_ORDER, TIME_SIGNATURES } from '../config.js';
import { escapeHTML, stripDangerousChars } from '../sanitize.js';
import type { InstrumentVoice, Section, SectionInstrumentKey, SwingSub } from '../types.js';
import { isSwingSub } from '../types.js';
import { normalizeKey } from '../utils.js';
import { generateId } from './share-codec.js';

/**
 * v1's readers' validation rules, kept for the v2 stand's v1 import (#1274,
 * `prototypes/v2/lib/import-v1.ts`), the one reader of v1's saved data left. v1's own
 * readers (`hydrateState`, `loadFromUrl`) and writer (`saveCurrentState`) went with its
 * load/save layer (#1424); nothing has called them since the v1 shell was deleted (#1358).
 *
 * The import must accept exactly what v1 itself accepted — a real profile can hold the
 * numeric `swingSub` a pre-#1257 share link persisted, or a section id that names a
 * prototype member — so these rules stay v1's own rather than being re-derived there.
 */

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
export const clamp = (val: any, min: number, max: number, defaultVal: number): number => {
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
export const hydrateAutoSound = (saved: unknown, voice: InstrumentVoice): boolean =>
    typeof saved === 'boolean' ? saved : voice === 'synth';

/**
 * Normalizes an untrusted value into the swing-subdivision keyspace. (#1264 moved the
 * keyspace itself to `types.ts` as `SwingSub` / `isSwingSub`; this function stays here
 * because its FALLBACK — '8th' — is v1's reading policy, not a property of the type.)
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
 * v1 then saved the poisoned value into its session, so a real v1 profile can still hold
 * the number 8 here; the import lands it on the default instead.
 */
export function normalizeSwingSub(value: unknown): SwingSub {
    return isSwingSub(value) ? value : '8th';
}

/**
 * Sanitize a free-text persisted display string (#1266): a type check, a length cap and
 * the dangerous-character strip. A sanitizer, not an allowlist, because v1 put arbitrary
 * user text in these fields (a saved progression's name, a section label).
 */
export function sanitizeDisplayString(value: unknown, fallback: string, maxLen = 100): string {
    if (typeof value !== 'string') {
        return fallback;
    }
    const safe = stripDangerousChars(value).slice(0, maxLen);
    return safe || fallback;
}

/**
 * Is `id` usable as a section id (#1266)? Rejects the `Object.prototype` member names:
 * a section id keys per-section lookups (`sectionSeedMap`), and an id of `'constructor'`
 * returns an inherited function from any prototype-bearing map. Safe to reject outright
 * rather than repair: every legitimate id is minted by `generateId()`.
 * `Object.getOwnPropertyNames(Object.prototype)` so the set can't drift.
 */
const PROTOTYPE_MEMBER_NAMES: ReadonlySet<string> = new Set(
    Object.getOwnPropertyNames(Object.prototype),
);

function isSafeSectionId(id: unknown): id is string {
    return typeof id === 'string' && !!id && !PROTOTYPE_MEMBER_NAMES.has(id);
}

/**
 * Validates and sanitizes sections array from untrusted source.
 */
export function validateSections(sections: any[]): any[] {
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
            // why (#1258): type-checked, not truthiness-checked — an object-valued id
            // stringifies to "[object Object]" and collides across every section carrying
            // one. #1266 adds the prototype-member rejection (`isSafeSectionId`).
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
