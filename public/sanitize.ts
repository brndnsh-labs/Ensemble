/**
 * sanitize.ts — main-thread string sanitization and display formatting.
 *
 * What belongs here: helpers that make an untrusted or ASCII-authored string
 * safe/pretty for *display* — HTML escaping, dangerous-character stripping,
 * accidental/glyph substitution. They are pure string→string functions with no
 * DOM, Web Audio, or state dependencies, but they exist to serve DOM-adjacent
 * concerns (chart labels, the manual renderer, hydrated share payloads).
 *
 * What does NOT belong here: anything the logic worker needs. Seeded RNG and
 * hashing live in `engine/hash-utils.ts`; share/persistence encoding lives in
 * `state/share-codec.ts`; step/meter timing math and MIDI↔frequency conversion
 * live in `utils.ts`. Keep this module import-free so it stays a leaf.
 */

const REGEX_AMP = /&/g;
const REGEX_LT = /</g;
const REGEX_GT = />/g;
const REGEX_QUOT = /"/g;
const REGEX_APOS = /'/g;
const REGEX_BACKTICK = /`/g;

/**
 * Escapes unsafe HTML characters to prevent XSS.
 */
export function escapeHTML(str: string): string {
    if (str === null || str === undefined) {
        return '';
    }
    if (typeof str !== 'string') {
        return String(str);
    }

    return str
        .replace(REGEX_AMP, '&amp;')
        .replace(REGEX_LT, '&lt;')
        .replace(REGEX_GT, '&gt;')
        .replace(REGEX_QUOT, '&quot;')
        .replace(REGEX_APOS, '&#39;')
        .replace(REGEX_BACKTICK, '&#96;');
}

const REGEX_DANGEROUS = /[<>"=`]/g;

/**
 * Strips dangerous characters from musical input strings to prevent XSS.
 * Allows common musical symbols but removes HTML/Script vectors.
 */
export function stripDangerousChars(str: string): string {
    if (!str) {
        return '';
    }
    if (typeof str !== 'string') {
        return String(str);
    }
    // Remove < > " ` (Keep ' and & for text validity, relying on escaping for those)
    return str.replace(REGEX_DANGEROUS, '');
}

/**
 * The one bound on `arranger.seed`, applied at the **write** side (#1266).
 *
 * why one authority: the seed had three readers on two different bounds. #1258
 * made the share reader's `bnd.s.sd` path match `?seed=` (both
 * `stripDangerousChars(...).slice(0, 64)`), but the persist reader was a third
 * reader and stayed unbounded, and `SongSeedControl` had no `maxLength` — so a
 * >64-char seed was reachable **by typing**, survived locally, and was emitted
 * whole by the share writer, while the recipient's reader truncated it. Sender
 * and recipient then heard different soloist lines off the "same" seed, because
 * the seed string is the PRNG input for the whole session (`createPRNG`) and for
 * every per-section derivation (`deriveSectionSeed`).
 *
 * Bounding at the write side instead of adding a fourth read-side bound is what
 * makes them agree: `SET_SONG_SEED` (and the `SET_PARAM` back door) normalize on
 * the way in, so the slice can only ever hold an already-bounded value and the
 * share writer emits what the readers accept.
 *
 * 64 chars is inherited from #1258, not re-derived: it is far past any seed a
 * human types or the dice roller mints (6 hex chars) while capping the hashing
 * cost that `deriveSectionSeed` pays per section, per bar.
 */
export const SONG_SEED_MAX_LENGTH = 64;

export function normalizeSongSeed(value: unknown): string {
    if (typeof value !== 'string') {
        return '';
    }
    return stripDangerousChars(value).slice(0, SONG_SEED_MAX_LENGTH);
}

const REGEX_SHARP = /#/g;
const REGEX_FLAT1 = /([A-G])b/g;
const REGEX_FLAT2 = /b(?=[0-9IVivm\-/])/g;

/**
 * Replaces ASCII # and b with Unicode ♯ and ♭ for display.
 */
export function formatUnicodeSymbols(str: string): string {
    if (!str) {
        return str;
    }
    return str.replace(REGEX_SHARP, '♯').replace(REGEX_FLAT1, '$1♭').replace(REGEX_FLAT2, '♭');
}
