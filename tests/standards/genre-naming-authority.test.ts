import { describe, expect, it } from 'vitest';
import { SMART_BASS_STYLE_MAP } from '../../public/config.js';
import {
    BASS_STYLE_BY_FEEL,
    canonToFeel,
    feelToCanon,
    GENRE_FEELS,
    GENRE_NAMES,
    GROOVE_STRATEGY_BY_FEEL,
    GROOVE_STRATEGY_BY_GENRE,
    isLatinGrooveFamily,
    LATIN_GROOVE_STRATEGY,
    resolveGenre,
    SMART_GENRES,
} from '../../public/data/smart-genres.js';
import { strategies } from '../../public/engine/groove-engine.js';
import * as acoustic from '../../public/engine/grooves/acoustic.js';
import * as blues from '../../public/engine/grooves/blues.js';
import * as country from '../../public/engine/grooves/country.js';
import * as disco from '../../public/engine/grooves/disco.js';
import * as funk from '../../public/engine/grooves/funk.js';
import * as hiphop from '../../public/engine/grooves/hiphop.js';
import * as jazz from '../../public/engine/grooves/jazz.js';
import * as latin from '../../public/engine/grooves/latin.js';
import * as metal from '../../public/engine/grooves/metal.js';
import * as neoSoul from '../../public/engine/grooves/neo-soul.js';
import * as reggae from '../../public/engine/grooves/reggae.js';
import * as rock from '../../public/engine/grooves/rock.js';
import * as skaPunk from '../../public/engine/grooves/ska-punk.js';

/**
 * #1177 — the genre-naming authority bijection guard.
 *
 * Three naming axes coexist BY DESIGN (canon NAME → runtime FEEL → groove
 * STRATEGY key). This file pins the mapping between them so a 14th genre, a
 * renamed feel, or a new groove strategy cannot land half-wired: the class of
 * bug is silent (a `Record` keyed by genre never throws on a missing key — the
 * genre just quietly takes a different genre's default), so a loud guard is the
 * whole defense.
 *
 * NOTE on namespaces, easiest thing to break here: `'latin'` is a groove
 * STRATEGY key (`public/engine/grooves/latin.ts`), NOT a genre. The `Latin`
 * genre/feel was retired in #628 and is pinned out by `genre-canon-guard` /
 * `genre-feel-canon-guard`. Bossa is the single Latin-family genre.
 */
describe('genre-naming authority (#1177)', () => {
    it('canon → feel → canon round-trips for all 13 genres', () => {
        expect(GENRE_NAMES).toHaveLength(13);
        for (const name of GENRE_NAMES) {
            const feel = canonToFeel(name);
            expect(feel, `${name} has no feel`).toBeTruthy();
            expect(feelToCanon(feel), `${name} → ${feel} → ? did not round-trip`).toBe(name);
        }
    });

    it('feel → canon → feel round-trips for all 13 feels (the mapping is a bijection)', () => {
        expect(new Set(GENRE_FEELS).size, 'two genres share a feel').toBe(GENRE_NAMES.length);
        for (const feel of GENRE_FEELS) {
            const name = feelToCanon(feel);
            expect(name, `${feel} has no canon genre`).toBeTruthy();
            expect(canonToFeel(name), `${feel} → ${name} → ? did not round-trip`).toBe(feel);
        }
    });

    it('rejects anything outside both keyspaces (no phantom passes through)', () => {
        // The retired phantoms, plus a drum-preset name that is NOT a genre.
        for (const phantom of ['Latin', 'Shred', 'Afrobeat', 'Soul', 'Minimal', '', undefined]) {
            expect(canonToFeel(phantom), `canonToFeel accepted '${phantom}'`).toBeNull();
            expect(feelToCanon(phantom), `feelToCanon accepted '${phantom}'`).toBeNull();
            expect(resolveGenre(phantom), `resolveGenre accepted '${phantom}'`).toBeNull();
        }
        // Cross-keyspace probes: a feel is not a name and vice versa.
        expect(canonToFeel('Bossa Nova')).toBeNull();
        expect(canonToFeel('Ska')).toBeNull();
        expect(feelToCanon('Bossa')).toBeNull();
        expect(feelToCanon('Ska-Punk')).toBeNull();
    });

    it('every canonical genre has a groove strategy, and every strategy resolves to a module', () => {
        // Exhaustive both ways: a 14th genre without a strategy key fails
        // typecheck at Record<CanonGenre, …>, and fails loudly here too.
        expect(Object.keys(GROOVE_STRATEGY_BY_GENRE).sort()).toEqual([...GENRE_NAMES].sort());
        for (const name of GENRE_NAMES) {
            const feel = canonToFeel(name) as string;
            const key = GROOVE_STRATEGY_BY_GENRE[name as keyof typeof GROOVE_STRATEGY_BY_GENRE];
            expect(GROOVE_STRATEGY_BY_FEEL[feel], `${feel} lost its strategy key`).toBe(key);
            // The live dispatch table must carry a real module for that feel.
            expect(strategies[feel], `groove strategies has no module for '${feel}'`).toBeTruthy();
            expect(typeof strategies[feel].applyOverrides).toBe('function');
            expect(typeof strategies[feel].getMotif).toBe('function');
            expect(strategies[feel].config).toBeTruthy();
        }
    });

    it('the groove strategy table is exactly the feel keyspace (no dead or missing keys)', () => {
        expect(Object.keys(strategies).sort()).toEqual([...GENRE_FEELS].sort());
    });

    it('Bossa is the sole Latin-family genre, in either keyspace', () => {
        const latinGenres = GENRE_NAMES.filter(
            (name) =>
                GROOVE_STRATEGY_BY_GENRE[name as keyof typeof GROOVE_STRATEGY_BY_GENRE] ===
                LATIN_GROOVE_STRATEGY,
        );
        expect(latinGenres).toEqual(['Bossa']);

        // The one canonical predicate: true from the feel, from the canon name,
        // or from either half alone (a partially-synced groove slice still routes).
        expect(isLatinGrooveFamily('Bossa Nova', 'Bossa')).toBe(true);
        expect(isLatinGrooveFamily('Bossa Nova', undefined)).toBe(true);
        expect(isLatinGrooveFamily(undefined, 'Bossa')).toBe(true);
        // And false everywhere else — including the retired 'Latin' genre spelling
        // and the strategy key itself, which is not a genre.
        expect(isLatinGrooveFamily('Latin', 'Latin')).toBe(false);
        expect(isLatinGrooveFamily('latin', 'latin')).toBe(false);
        expect(isLatinGrooveFamily('Bossa', 'Bossa Nova')).toBe(false); // keyspaces swapped
        for (const feel of GENRE_FEELS.filter((f) => f !== 'Bossa Nova')) {
            expect(isLatinGrooveFamily(feel, feelToCanon(feel)), `${feel} read as Latin`).toBe(
                false,
            );
        }
    });

    it('SMART_BASS_STYLE_MAP is derived from the genre table (one source, not two)', () => {
        expect(SMART_BASS_STYLE_MAP).toBe(BASS_STYLE_BY_FEEL);
        for (const name of GENRE_NAMES) {
            const feel = canonToFeel(name) as string;
            expect(SMART_BASS_STYLE_MAP[feel], `${name} lost its bass style`).toBe(
                SMART_GENRES[name].bass,
            );
        }
        // No key that isn't a feel — a name-shaped key would be dead at runtime.
        expect(Object.keys(SMART_BASS_STYLE_MAP).sort()).toEqual([...GENRE_FEELS].sort());
    });

    // ---------------------------------------------------------------------
    // The two literals below are the POINT of this file, not decoration.
    //
    // #1177 collapsed two hand-maintained tables (`SMART_BASS_STYLE_MAP` in
    // config.ts, `strategies` in groove-engine.ts) into derivations of
    // `GENRE_OVERRIDES`. That kills a real dead-key bug class — but a derived
    // table can only ever be asserted against its own source, which is a
    // tautology. Deriving therefore DELETED the repo's only second statement of
    // thirteen musical facts: which bass idiom each genre plays, and which kit.
    //
    // These literals restore that. They are the same device, for the same
    // reason, as the DROP_FRIENDLY_GENRES membership pin in
    // genre-feel-canon-guard.test.ts: an idiom assignment is a MUSICAL JUDGMENT,
    // and this literal is the only thing that makes changing one a deliberate,
    // reviewed act rather than a one-word edit that stays green.
    //
    // If you are here because you changed a genre's bass or kit ON PURPOSE:
    // update the literal in the same commit, and hear it before you ship.
    // ---------------------------------------------------------------------

    it('each genre plays its intended bass idiom (musical pin, not a derivation)', () => {
        // feel → bass style. Transcribed verbatim from the pre-#1177
        // SMART_BASS_STYLE_MAP literal that this refactor deleted.
        const INTENDED_BASS: Record<string, string> = {
            Rock: 'rock',
            Jazz: 'quarter', // walking quarters
            Funk: 'funk',
            Disco: 'disco',
            'Hip Hop': 'hiphop',
            Blues: 'blues',
            'Neo-Soul': 'neo',
            Reggae: 'dub', // One Drop: beat 1 left to the bass
            Acoustic: 'acoustic',
            'Bossa Nova': 'bossa',
            Country: 'country',
            Metal: 'metal',
            Ska: 'walking-ska',
        };
        expect(Object.keys(INTENDED_BASS).sort()).toEqual([...GENRE_FEELS].sort());
        for (const [feel, style] of Object.entries(INTENDED_BASS)) {
            expect(SMART_BASS_STYLE_MAP[feel], `${feel} bass idiom changed`).toBe(style);
        }
    });

    it('each genre plays its intended kit (musical pin, not a derivation)', () => {
        // canon name → groove strategy key. `GROOVE_STRATEGY_BY_GENRE` is the one
        // hand-written table left in the authority; everything else derives from it.
        const INTENDED_KIT: Record<string, string> = {
            Rock: 'rock',
            Jazz: 'jazz',
            Funk: 'funk',
            Disco: 'disco',
            'Hip Hop': 'hiphop',
            Blues: 'blues',
            'Neo-Soul': 'neo-soul',
            Reggae: 'reggae',
            Acoustic: 'acoustic',
            Bossa: 'latin', // the ONLY genre on the latin strategy
            Country: 'country',
            Metal: 'metal',
            'Ska-Punk': 'ska-punk',
        };
        expect(Object.keys(INTENDED_KIT).sort()).toEqual([...GENRE_NAMES].sort());
        for (const [name, key] of Object.entries(INTENDED_KIT)) {
            expect(
                GROOVE_STRATEGY_BY_GENRE[name as keyof typeof GROOVE_STRATEGY_BY_GENRE],
                `${name} kit changed`,
            ).toBe(key);
        }
    });

    it('each genre resolves to its intended kit MODULE, not just the right key string', () => {
        // The key strings above are new in #1177, so pinning them alone would only
        // guard a table this refactor introduced. The durable musical fact is which
        // groove MODULE a genre actually dispatches to — that predates the refactor
        // and is what the deleted `strategies` literal in groove-engine.ts stated.
        // Identity-compare against the real modules so a rewired key is caught even
        // if both sides of the derivation move together.
        const INTENDED_MODULE: Array<[string, unknown]> = [
            ['Rock', rock],
            ['Jazz', jazz],
            ['Funk', funk],
            ['Disco', disco],
            ['Hip Hop', hiphop],
            ['Blues', blues],
            ['Neo-Soul', neoSoul],
            ['Reggae', reggae],
            ['Acoustic', acoustic],
            ['Bossa Nova', latin],
            ['Country', country],
            ['Metal', metal],
            ['Ska', skaPunk],
        ];
        expect(INTENDED_MODULE.map(([feel]) => feel).sort()).toEqual([...GENRE_FEELS].sort());
        for (const [feel, mod] of INTENDED_MODULE) {
            const m = mod as { getMotif: unknown; applyOverrides: unknown };
            expect(strategies[feel].getMotif, `${feel} dispatches to the wrong kit`).toBe(
                m.getMotif,
            );
            expect(strategies[feel].applyOverrides, `${feel} dispatches to the wrong kit`).toBe(
                m.applyOverrides,
            );
        }
    });
});
