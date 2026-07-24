// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { SMART_BASS_STYLE_MAP, SMART_SCALE_STYLE_MAP } from '../../public/config.js';
import { GENRE_FEELS } from '../../public/data/smart-genres.js';
import { GENRE_POCKET } from '../../public/engine/coordination-engine.js';
import { DROP_FRIENDLY_GENRES } from '../../public/engine/drop-mechanic.js';
import { strategies } from '../../public/engine/groove-engine.js';
import { GENRE_STYLE_MAPPING } from '../../public/engine/soloist-config.js';

// #1130 — genreFeel-routing completeness guard, the feel-keyspace companion to
// genre-canon-guard (#544, which guards the genre-NAME keyspace via GENRE_NAMES).
//
// Genre routing lives in two keyspaces. The UI picker shows genre NAMES
// (GENRE_NAMES); at runtime `groove.genreFeel` carries the mapped FEEL. For most
// genres name === feel, but two diverge: the "Bossa" genre has feel 'Bossa Nova'
// and "Ska-Punk" has feel 'Ska' (the alias lives in exactly one place —
// GENRE_OVERRIDES[name].feel in smart-genres.ts). The tables below are indexed by
// groove.genreFeel, so their keys must be FEELS, never genre names.
//
// The bug class this guards (shipped twice for Ska-Punk — see the comments in
// groove-engine.ts / fills.ts / harmonies.ts / conductor.ts): a table carries a
// genre-NAME-shaped key (e.g. 'Ska-Punk', 'Bossa', 'Rock/Metal') that never
// matches a real genreFeel and silently falls through to a genre-specific default
// (rock bass, rock scale, DEFAULT_CONFIG groove, 'scalar' soloist). GENRE_NAMES
// is loudly gated; this extends the same discipline to the feel keyspace.
describe('genreFeel routing canon (#1130)', () => {
    // Every table keyed by groove.genreFeel. A missing feel here does NOT crash —
    // it silently routes to a genre-specific fallback, which is the bug.
    const FEEL_KEYED: Record<string, Record<string, unknown>> = {
        'groove strategies': strategies,
        SMART_BASS_STYLE_MAP,
        SMART_SCALE_STYLE_MAP,
        'soloist GENRE_STYLE_MAPPING': GENRE_STYLE_MAPPING,
        GENRE_POCKET,
    };

    it.each(Object.entries(FEEL_KEYED))(
        '%s maps every canonical genreFeel (no silent fallback)',
        (name, table) => {
            const missing = GENRE_FEELS.filter((feel) => !Object.hasOwn(table, feel));
            expect(missing, `${name} is missing feel key(s): ${missing.join(', ')}`).toEqual([]);
        },
    );

    // Pure feel-keyed tables use a single-key lookup (no secondary preset key), so
    // any key that isn't a feel is dead weight that never matches at runtime.
    // SMART_BASS_STYLE_MAP is excluded: its resolver also accepts a drum-preset
    // name as a secondary key, so preset-name keys are legitimate there.
    const PURE_FEEL_KEYED: Record<string, Record<string, unknown>> = {
        'groove strategies': strategies,
        SMART_SCALE_STYLE_MAP,
        'soloist GENRE_STYLE_MAPPING': GENRE_STYLE_MAPPING,
        GENRE_POCKET,
    };

    it.each(Object.entries(PURE_FEEL_KEYED))(
        '%s carries no non-feel (dead) keys',
        (name, table) => {
            const dead = Object.keys(table).filter((key) => !GENRE_FEELS.includes(key));
            expect(dead, `${name} has dead non-feel key(s): ${dead.join(', ')}`).toEqual([]);
        },
    );

    // SUBSET tables are the same bug class with a different shape. A subset set
    // ("which feels get this behavior") is not required to cover every feel, but
    // every member it DOES carry must be a real feel — a member that can never
    // match `groove.genreFeel` silently disables the behavior for that genre
    // with no error, exactly like a missing key above.
    //
    // #1169 is the shipped instance: `DROP_FRIENDLY_GENRES` case-insensitively
    // substring-matched against needles 'hip-hop'/'hiphop', neither of which is
    // contained in the real feel 'Hip Hop' — so the drop/breakdown cut was dead
    // for hip-hop, the genre it is most idiomatic for. Now exact-match + pinned.
    const FEEL_SUBSETS: Record<string, ReadonlySet<string>> = {
        DROP_FRIENDLY_GENRES,
    };

    it.each(Object.entries(FEEL_SUBSETS))(
        '%s carries only real canonical feels (no unmatchable member)',
        (name, set) => {
            const unmatchable = [...set].filter((feel) => !GENRE_FEELS.includes(feel));
            expect(
                unmatchable,
                `${name} has member(s) that can never match a genreFeel: ${unmatchable.join(', ')}`,
            ).toEqual([]);
        },
    );

    // Membership itself is pinned as a hard-coded literal, NOT derived from the
    // set under test. why: "which genres does a 1-bar full-band cut belong to"
    // is a MUSICAL IDIOM JUDGMENT, and every other guard in this file (and the
    // set-driven sweeps in drop-breakdown-mechanic.test.ts) reshapes its own
    // corpus when membership changes — deleting 'Metal' or adding 'Bossa Nova'
    // leaves all of them green. This literal is the only thing that makes an
    // idiom edit a deliberate, reviewed act instead of a silent one.
    //
    // This is a hand-curated config list, not generative output, so a rigid
    // equality assert is the right shape here (the repo's "statistical ranges,
    // never rigid snapshots" rule governs ENGINE OUTPUT, not config membership).
    //
    // The idiom argument, so a future editor can disagree on the merits:
    //   IN  — Rock/Metal: the pre-chorus stop and the metal breakdown are
    //         stop-time by definition, band out → crash → slam on the downbeat.
    //   IN  — Hip Hop: the beat-cut before the hook is a defining production
    //         gesture; total silence is MORE authentic here than anywhere else.
    //   IN  — Disco: stands in for EDM's build→drop (the repo has no EDM feel).
    //   IN  — Ska: ska-punk unison stop-hits.
    //   OUT — Reggae: a dub drop-out KEEPS drum and bass — that's the whole
    //         gesture. This mechanic cuts the kit too, so Reggae here would
    //         produce the opposite of dub.
    //   OUT — Funk: the strongest omission case (the James Brown break IS this
    //         gesture), but a funk break keeps the drummer going and re-enters
    //         on a stab. Adding it as-is gives funk a rock-shaped hole with a
    //         crash in it — it wants its own variant, not this set.
    //   OUT — Neo-Soul (pocket continuity), Jazz/Blues/Bossa/Acoustic/Country
    //         (a hard mid-form cut reads as a mistake, not a build).
    it('DROP_FRIENDLY_GENRES membership is exactly the curated idiom set', () => {
        expect([...DROP_FRIENDLY_GENRES].sort()).toEqual([
            'Disco',
            'Hip Hop',
            'Metal',
            'Rock',
            'Ska',
        ]);
    });

    // Belt-and-suspenders across every table (including the bass map): the exact
    // retired phantom/alias keys must never reappear. Matches the phantom list in
    // genre-canon-guard (#544) plus the genre-name aliases removed in #1130.
    it('no routing table resurrects a retired phantom / alias key', () => {
        const PHANTOMS = [
            'Ska-Punk',
            'Bossa',
            'Rock/Metal',
            'Minimal',
            'Shred',
            'Latin',
            'Afrobeat',
            'Soul',
        ];
        for (const [name, table] of Object.entries(FEEL_KEYED)) {
            for (const phantom of PHANTOMS) {
                expect(Object.hasOwn(table, phantom), `${name} must not key on '${phantom}'`).toBe(
                    false,
                );
            }
        }
        for (const [name, set] of Object.entries(FEEL_SUBSETS)) {
            for (const phantom of PHANTOMS) {
                expect(set.has(phantom), `${name} must not contain '${phantom}'`).toBe(false);
            }
        }
    });
});
