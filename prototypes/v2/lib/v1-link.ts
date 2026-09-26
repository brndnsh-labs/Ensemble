/**
 * v1-link.ts — opening an OLD v1 `?s=` share link on the v2 music stand (#1279).
 *
 * After the hard cut (`docs/design/ensemble-v2-rollout.md` decisions 3 and 4) v1 is gone
 * from `/`, and every share link it ever wrote — `/?s=<sections>&key=…&ts=…&bpm=…` — lands
 * here instead. This module is what that link meets: it decodes the payload with v1's OWN
 * codec, converts it through the v1 import's converter, and hands back a validated document
 * for the shell to open as an unsaved shared draft.
 *
 * **Best effort, deliberately** (DECISION 2026-09-15, "don't over-engineer the cutover"):
 * the chords, key, meter and tempo are the promise. Everything else the link carries is
 * taken where the converter already reads an equivalent field and skipped where it does not:
 *
 * - `genre`, `style` and `comp` ride along, because `sessionBand`/`sessionPerformance` read
 *   exactly those fields off a v1 session record and this module hands `v1ImportContext` one
 *   built from the query string. They cost a line each.
 * - `bnd` (the compressed per-lane band payload) is NOT read. It would need a second
 *   key-space translation — v1's minified `s`/`b`/`c`/`h`/`g` lanes into the session shape
 *   `sessionBand` expects — for settings a listener can re-pick in the Feel sheet. What lands
 *   instead is what v1 ITSELF would load from a session that names only a genre and a chord
 *   style: v1's own hardcoded per-lane defaults, routed by the genre. See `linkSession` for
 *   the short list of fields that genuinely come from the songbook's baseline document.
 * - `int` (band intensity) and `tmr` (session timer) have nowhere to land: `ChartPerformance`
 *   has no field for either. `STATE_OWNERSHIP_MANIFEST` classifies them `runtime-derived` and
 *   `preferences` respectively — neither is document-owned, so a chart cannot carry them.
 * - `seed` is accepted by the URL and deliberately ignored: with no `randomizeSeed` in the
 *   record, `sessionPerformance` lands `randomizeSeed: true`, and `state-effects.ts` re-rolls
 *   the song seed on every playback start. Carrying it would be a line that does nothing.
 *
 * A link is NOT an import. Nothing here touches the import ledger, the session mark, the
 * `v1-session` document or any other storage: the result is a document the caller opens and
 * the musician keeps (or doesn't). Its id is therefore freshly random, never `v1-session`
 * or a content-derived `v1-preset-<digest>` id — those belong to `import-v1.ts`, and a
 * collision between a link and an import would be a data bug.
 *
 * Untrusted by construction: the query string is whatever a sender typed. Every field is
 * bounded the way v1's own `loadFromUrl` bounds it, the v1 codec owns the payload ceilings,
 * and the canonical `validateChartDocument` (inside `convertV1`, and again here if the
 * notation is re-stamped) is the last gate. Nothing throws to the caller, and a failure
 * carries no reason string: the only sentence this app says about a broken old link is its
 * own, never one derived from the sender's bytes.
 */

import { resolveGenre, SMART_GENRES } from '../../../public/data/smart-genres.js';
import { stripDangerousChars } from '../../../public/sanitize.js';
import { validateChartDocument } from '../../../public/songbook/codec.js';
import type { ChartContent, ChartDocument } from '../../../public/songbook/types.js';
import { tryDecompressSections } from '../../../public/state/share-codec.js';
import { convertV1, NOTATIONS, type V1Source, v1ImportContext } from './import-v1';

/**
 * Every query parameter v1's `loadFromUrl` reads, whether or not this module maps it.
 * Consumed as a set the moment a link is handled — success or failure — so a reload lands
 * on the songbook instead of re-opening the draft or re-showing the failure.
 */
const V1_SHARE_PARAMS = [
    's',
    'prog',
    'key',
    'ts',
    'bpm',
    'genre',
    'style',
    'int',
    'comp',
    'notation',
    'tmr',
    'bnd',
    'seed',
    'autoplay',
] as const;

/** The two parameters that actually carry a chart; everything else only describes one. */
const V1_CHART_PARAMS = ['s', 'prog'] as const;

/** A v1 link carries no song title; nothing in the payload can name this chart. */
const SHARED_TITLE = 'Shared song';

/** v1's own bound on a plain-text `?prog=` progression. */
const MAX_PROG_LENGTH = 1000;

export type V1LinkOutcome =
    /** No v1 share payload in this URL — an ordinary v2 address, untouched. */
    { kind: 'none' } | { kind: 'ok'; document: ChartDocument } | { kind: 'failed' };

/**
 * Does this query string carry a v1 chart at all?
 *
 * The cheap predicate behind three decisions: `openV1ShareLink`'s own early exit, the shell's
 * choice of entry point, and — the reason it is exported — `accountsFlagRequest`'s refusal to
 * let a share link flip a feature flag. That guard used to key on a non-empty hash, which is
 * where a v2 share payload lives; a v1 share link is a QUERY-string link with no hash at all,
 * so it needs this to be recognised as the share link it is.
 */
export function hasV1SharePayload(search: string): boolean {
    const params = new URLSearchParams(search);
    // Present-but-empty is indistinguishable from absent, and is not a chart either way.
    return V1_CHART_PARAMS.some((name) => !!params.get(name));
}

/**
 * The query string with every v1 share parameter removed.
 *
 * Returns the leading `?` with the survivors, or an empty string when nothing is left —
 * either way it is what a `history.replaceState` path should carry next to the pathname.
 * Anything else in the query string survives, though re-serialised: `URLSearchParams`
 * round-tripping normalises spacing (`a b` → `a+b`) and gives a valueless `?debug` an `=`,
 * so the result is *equivalent* for any `URLSearchParams` reader rather than byte-identical.
 *
 * Deliberately NOT the whole job the shell needs: a consumed share link must also drop the
 * account flag (`stripAccountsParam` in `lib/account/feature.ts`, which owns that name), so
 * the same link cannot flip it on a reload of the tidied URL.
 */
export function stripV1ShareParams(search: string): string {
    const params = new URLSearchParams(search);
    for (const name of V1_SHARE_PARAMS) {
        params.delete(name);
    }
    const rest = params.toString();
    return rest ? `?${rest}` : '';
}

/**
 * A v1 share link's chart, or the fact that it could not be opened.
 *
 * `base` is a document already in this songbook. It supplies far less than its name suggests —
 * see `linkSession` — but it is what the two fields v1 never persisted come from.
 */
export function openV1ShareLink(
    search: string,
    base: Pick<ChartContent, 'performance' | 'band'>,
    now = new Date().toISOString(),
): V1LinkOutcome {
    // The cheap exit, and the common one: an ordinary v2 URL costs one parse and two reads,
    // and never reaches the codec, the converter or the baseline document.
    if (!hasV1SharePayload(search)) {
        return { kind: 'none' };
    }
    const params = new URLSearchParams(search);
    try {
        // `s` wins over `prog`, exactly as v1's own `loadFromUrl` resolves the pair.
        const sections = linkSections(params.get('s'), params.get('prog'));
        if (!sections) {
            return { kind: 'failed' };
        }
        // The link's own key/meter/tempo/band, expressed as the v1 SESSION record
        // `v1ImportContext` already knows how to read. The chart itself then converts as a
        // saved PROGRESSION against that context — see `linkSections` for why that side of
        // the converter is the right one for codec-decoded sections.
        const context = v1ImportContext(
            {
                sources: [{ ...LINK_SOURCE, kind: 'session', record: linkSession(params) }],
                problems: [],
            },
            base,
        );
        const source: V1Source = {
            ...LINK_SOURCE,
            kind: 'preset',
            id: documentId(),
            record: { isMinor: sections[0]?.isMinor === true },
            sections,
        };
        const conversion = convertV1(source, context, now);
        if (conversion.kind === 'failed') {
            return { kind: 'failed' };
        }
        return { kind: 'ok', document: withNotation(conversion.document, params.get('notation')) };
    } catch {
        // `convertV1` already catches its own conversion, but the whole path runs on
        // attacker-controlled input and the caller is a React effect: a throw from anywhere
        // in here is a failed link, never a blank app.
        return { kind: 'failed' };
    }
}

/**
 * The fields both halves of the conversion share. `digest` is the import ledger's identity
 * and `title` is the songbook's — neither is recorded for a link, so the digest is empty and
 * the title is the one this app gives an unnamed shared chart.
 */
const LINK_SOURCE = { digest: '', id: '', title: SHARED_TITLE, record: {} } as const;

/** Fresh every time: a shared draft is not a library entry until "Keep a copy" says so. */
function documentId(): string {
    return crypto.randomUUID();
}

/**
 * The link's sections, in the shape `convertV1` takes for a saved progression.
 *
 * Handing the decoded sections to the PRESET side of the converter rather than the session
 * side is deliberate: the session side re-runs `validateSections`, which escapes each label a
 * second time, and `escapeHTML` is not idempotent — a label with an `&` in it would arrive
 * visibly more mangled here than it does in v1 itself. The preset side runs
 * `codecSafeSections` alone, which is exactly the "already v1-validated" pass these need.
 */
function linkSections(
    compressed: string | null,
    progression: string | null,
): Array<Record<string, unknown>> | null {
    if (compressed) {
        // v1's codec, unchanged and decode-only. It owns the payload's size ceiling (100KB),
        // the 500-section cap, the per-label escape and the section ids.
        const sections = tryDecompressSections(compressed);
        return sections?.length ? (sections as unknown as Array<Record<string, unknown>>) : null;
    }
    if (!progression) {
        return null;
    }
    // `?prog=` — v1's plain-text one-section link, which hand-written links and the
    // `npm run audition-link` permalinks use. Same bound and strip `loadFromUrl` applies.
    const value = stripDangerousChars(progression.slice(0, MAX_PROG_LENGTH));
    return value.trim() ? [{ label: 'Main', value }] : null;
}

/**
 * The link's session-shaped record: the same field names `saveCurrentState()` writes, so
 * `sessionBand`/`sessionPerformance` read them with no translation. Every value stays the
 * raw string — `clamp`, `resolveGenre` and `isKnownChordStyle` are the validators, and each
 * already takes an untrusted value.
 *
 * **What this does NOT leave to the songbook's baseline document.** Because a record is always
 * returned, `v1ImportContext` always takes its session branch, so `sessionBand` and
 * `sessionPerformance` overwrite nearly everything with v1's own defaults rather than with
 * `base`'s values. From `base` there survive exactly: `performance.bpm` (and only as the
 * fallback for an unreadable `?bpm=`), `chords.instrument` and `soloist.tradeMode` — the two
 * fields v1 never persisted at all. That is the right result for a link, since it is what v1
 * itself would have loaded from these bytes, but it is not "the songbook's band".
 *
 * `mixerVersion` is deliberately absent: a share link carries no mixer version, so the
 * converter's own stale-mixer rule resets volumes and reverbs to defaults, which is the
 * right baseline for a chart arriving from another device.
 */
function linkSession(params: URLSearchParams): Record<string, unknown> {
    const genre = resolveGenre(params.get('genre'));
    return {
        key: params.get('key') ?? undefined,
        timeSignature: params.get('ts') ?? undefined,
        bpm: params.get('bpm') ?? undefined,
        complexity: params.get('comp') ?? undefined,
        chords: { style: params.get('style') ?? undefined },
        // The share writer emits the FEEL; older and hand-written links carry the genre
        // NAME. `resolveGenre` (via `sessionBand`) accepts either keyspace, which is the
        // same tolerance `loadFromUrl` grew in #1200.
        //
        // The genre brings its feel with it. v1 applied a linked genre through the genre
        // picker's own pipeline (`SET_GENRE_FEEL` with `SMART_GENRES`), which set the swing;
        // a session record carries no swing of its own, so without these a `genre=Jazz` link
        // opened with `sessionBand`'s swing fallback of 0 and played straight eighths.
        groove: {
            genreFeel: params.get('genre') ?? undefined,
            ...(genre
                ? { swing: SMART_GENRES[genre.name].swing, swingSub: SMART_GENRES[genre.name].sub }
                : {}),
        },
    };
}

/**
 * Re-stamp the chord spelling the link asked for.
 *
 * The preset conversion path has no notation of its own — a v1 saved progression never
 * carried one — but `?notation=` is the difference between a chart that reads `C7 | F7` and
 * one that reads `I7 | IV7`, so it is worth the second pass. The canonical validator is
 * still the gate: a rejected re-stamp keeps the document the converter already blessed.
 */
function withNotation(document: ChartDocument, notation: string | null): ChartDocument {
    if (
        !notation ||
        !NOTATIONS.includes(notation) ||
        document.chart.arrangement.notation === notation
    ) {
        return document;
    }
    const checked = validateChartDocument({
        ...document,
        chart: {
            ...document.chart,
            arrangement: { ...document.chart.arrangement, notation },
        },
    });
    return checked.kind === 'ok' ? checked.value : document;
}
