// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { SMART_SCALE_STYLE_MAP } from '../../public/config.js';
import { GENRE_FEELS } from '../../public/data/smart-genres.js';
import { STICKY_GENRES } from '../../public/engine/accompaniment.js';
import { SUBTRACTION_PILOT_GENRES } from '../../public/engine/arrangement-layering.js';
import { RING_THROUGH_GENRES, SUSTAINED_COMP_GENRES } from '../../public/engine/comping-emit.js';
import { GENRE_INTENSITY_FLOORS, HALL_GENRES } from '../../public/engine/conductor.js';
import { GENRE_POCKET } from '../../public/engine/coordination-engine.js';
import {
    DROP_FRIENDLY_GENRES,
    PITCHED_ONLY_DROP_GENRES,
} from '../../public/engine/drop-mechanic.js';
import { HAT_SPINE_GENRES } from '../../public/engine/groove-engine.js';
import { HARMONY_GENRE_PROFILES } from '../../public/engine/harmony-styles.js';
import { GENRE_STYLE_MAPPING } from '../../public/engine/soloist-config.js';
import { BASS_SPACE_FEELS } from '../../public/engine/voicing-policy.js';

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
/*
 * #1177 NOTE — coverage moved, read this before counting on it.
 *
 * `strategies` (groove-engine) and `SMART_BASS_STYLE_MAP` (config) are derived
 * from the genre table, so testing their completeness here would only reassert
 * their construction. They are intentionally absent from the tables below.
 *
 * The hand-maintained surface that DOES still need guarding moved to
 * `GROOVE_STRATEGY_BY_GENRE` in `data/smart-genres.ts`, pinned by
 * `genre-naming-authority.test.ts`. The real guards remaining HERE are
 * `SMART_SCALE_STYLE_MAP`, `GENRE_STYLE_MAPPING`, `GENRE_POCKET` and the
 * genre-subset tables — those are all still hand-written.
 */
describe('genreFeel routing canon (#1130)', () => {
    // Every table keyed by groove.genreFeel. A missing feel here does NOT crash —
    // it silently routes to a genre-specific fallback, which is the bug.
    const FEEL_KEYED: Record<string, Record<string, unknown>> = {
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
    const PURE_FEEL_KEYED: Record<string, Record<string, unknown>> = {
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
    //
    // #1208 extends the subset guard from that single table to every sibling
    // genre-subset collection in the engine. Each entry below is normalized to
    // its list of MEMBERS (a Set's values, an array's elements, a Record's keys)
    // because the bug class is identical whichever container is used: a member
    // that isn't a real feel silently disables the behavior for that genre.
    //
    // These are all VALIDITY-ONLY, never exhaustive — deliberately so. "Which
    // feels reserve bass space / ring a comp through / get the hall reverb / get
    // an intensity floor" are curated musical-idiom subsets, and every one of
    // them has a documented default for the feels it omits. Adding any of them
    // to FEEL_KEYED above would assert "all 13 genres must opt in", which is a
    // false failure — the omissions are the design.
    //
    // Verified feel-keyed at the call sites (not assumed):
    //   BASS_SPACE_FEELS        isBassSpaceFeel(feel) ← chords-styles/harmonies/
    //                           comping-emit, all reading `groove.genreFeel`
    //   HAT_SPINE_GENRES        .has(groove.genreFeel)
    //   STICKY_GENRES           .includes(genre) where genre = groove.genreFeel
    //                           (chords.style override remaps only to feels)
    //   SUSTAINED/RING_THROUGH  .has(genre), threaded from that same variable
    //   HALL_GENRES             .has(groove.genreFeel)
    //   GENRE_INTENSITY_FLOORS  [groove.genreFeel]
    //   SUBTRACTION_PILOT       .has(genreFeel)
    //   HARMONY_GENRE_PROFILES  resolveHarmonyProfile(groove.genreFeel)
    const FEEL_SUBSETS: Record<string, readonly string[]> = {
        DROP_FRIENDLY_GENRES: [...DROP_FRIENDLY_GENRES],
        PITCHED_ONLY_DROP_GENRES: [...PITCHED_ONLY_DROP_GENRES],
        BASS_SPACE_FEELS: [...BASS_SPACE_FEELS],
        HAT_SPINE_GENRES: [...HAT_SPINE_GENRES],
        STICKY_GENRES: [...STICKY_GENRES],
        SUSTAINED_COMP_GENRES: [...SUSTAINED_COMP_GENRES],
        RING_THROUGH_GENRES: [...RING_THROUGH_GENRES],
        HALL_GENRES: [...HALL_GENRES],
        SUBTRACTION_PILOT_GENRES: [...SUBTRACTION_PILOT_GENRES],
        // Record-shaped subsets: the KEYS are the membership. A bogus key here
        // is dead exactly like a bogus Set member — the genre silently takes the
        // fallback (DEFAULT_HARMONY_PROFILE / the no-floor macro-arc path).
        // HARMONY_GENRE_PROFILES happens to be full today; its exhaustiveness is
        // pinned separately in harmony-genre-routing.test.ts, not here, because
        // the table is a fallback-backed subset by construction.
        GENRE_INTENSITY_FLOORS: Object.keys(GENRE_INTENSITY_FLOORS),
        HARMONY_GENRE_PROFILES: Object.keys(HARMONY_GENRE_PROFILES),
    };

    it.each(Object.entries(FEEL_SUBSETS))(
        '%s carries only real canonical feels (no unmatchable member)',
        (name, members) => {
            const unmatchable = members.filter((feel) => !GENRE_FEELS.includes(feel));
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
    //   OUT — Funk: the strongest omission case, but a funk break keeps the
    //         drummer going. Adding it here would give funk a rock-shaped hole
    //         with a crash in it. It got its own variant instead (#1202) — see
    //         PITCHED_ONLY_DROP_GENRES below. Funk DOES fire a cut bar; it is
    //         out of *this* set, not out of the mechanic.
    //   OUT — Neo-Soul (pocket continuity), Jazz/Blues/Bossa/Acoustic/Country
    //         (a hard mid-form cut reads as a mistake, not a build).
    // #1202 — the funk-break set gets its own membership pin, for the same reason its
    // sibling has one: the idiom argument is the whole content of the set, so a change
    // to it should be a reviewed edit rather than a one-word diff.
    //
    // This pin is load-bearing in a way the sibling's is not. The set-driven sweeps in
    // drop-breakdown-mechanic.test.ts drive `genreFeel` FROM this set, so they are
    // tautological with respect to its members: typo 'Funk' to 'Funky' and the direct
    // sweep still passes (it asks whether its own member fires), while the complement
    // sweep also passes (real 'Funk' lands in the complement and correctly does not
    // fire). What actually catches that typo today is the pair of tests that hardcode
    // `genreFeel: 'Funk'` — verified by mutation. This pin makes the guard explicit
    // instead of incidental, and FEEL_SUBSETS above independently rejects any member
    // that is not a real canonical feel.
    it('PITCHED_ONLY_DROP_GENRES membership is exactly the funk-break idiom set', () => {
        expect([...PITCHED_ONLY_DROP_GENRES].sort()).toEqual(['Funk']);
    });

    it('DROP_FRIENDLY_GENRES membership is exactly the curated idiom set', () => {
        expect([...DROP_FRIENDLY_GENRES].sort()).toEqual([
            'Disco',
            'Hip Hop',
            'Metal',
            'Rock',
            'Ska',
        ]);
    });

    /*
     * #1216 — the remaining eight subset tables get the same membership pin the
     * two above already have.
     *
     * The FEEL_SUBSETS sweep further up is VALIDITY-only: it proves every member
     * *can* match a real `genreFeel`, never that it *belongs*. Adding 'Reggae' to
     * RING_THROUGH_GENRES or deleting 'Funk' from HAT_SPINE_GENRES sails through
     * it untouched — the key is valid, so the guard is satisfied, and every other
     * consumer of these sets (the genre critique tests) has a distribution wide
     * enough to miss a one-genre membership swing. These pins are what make an
     * idiom edit a deliberate, reviewed act.
     *
     * The bar each pin has to clear is NOT "these are the N currently in the
     * set" — that pins today's accident. It's "why is each of the 13 canonical
     * feels in or out," and the comment above each assert is the actual content;
     * the literal is just its enforcement. A future editor who disagrees should
     * be able to argue with the comment.
     *
     * Canonical 13 feels, for counting the OUT side against:
     *   Acoustic · Blues · Bossa Nova · Country · Disco · Funk · Hip Hop ·
     *   Jazz · Metal · Neo-Soul · Reggae · Rock · Ska
     *
     * Same shape rule as the two pins above: these are hand-curated config
     * lists, not generative output, so a rigid equality assert is correct here
     * (the repo's "statistical ranges, never rigid snapshots" rule governs
     * ENGINE OUTPUT, not config membership).
     */

    // "Which feels reserve low-register space" — i.e. whose comper drops the
    // root from 7th/min7/maj7 voicings when the bass lane is live, leaving the
    // bottom of the chord to the bassist (`shouldUseRootlessVoicing` →
    // `getIntervals`, chords-styles.ts, which is on the every-genre chord path).
    //   IN  — Jazz/Blues/Bossa Nova: rootless shell/upper-structure voicings are
    //         the literal textbook definition of comping in these idioms.
    //   IN  — Funk/Neo-Soul: the chord is a two/three-note upper-structure stab
    //         over a bass line that owns the root outright.
    //   IN  — Hip Hop (#554): sampled-soul Rhodes stabs, rootless with jazzy
    //         extensions, over a synth-bass root.
    //   IN  — Reggae (#1216, new): the riddim is bass-led — the bass line is the
    //         genre's melodic subject, not its floor — and both reggae comping
    //         lanes sit deliberately above it: the keyboard/guitar skank on the
    //         backbeat (the chords channel) and the organ bubble (the harmony
    //         channel). A comper doubling roots down there is exactly the mud
    //         this set exists to prevent. This was an omission, not a decision:
    //         the set had never been pinned.
    //         Blast radius, since this is an audible change and not just a
    //         bookkeeping one: `shouldUseRootlessVoicing` fires on minor,
    //         dominant and maj7 qualities only, so plain MAJOR skanks are
    //         untouched. Minor ones become rootless and pick up a b7 —
    //         getRootlessVoicing returns [b3, 5, b7] (or [b3, b7, 9] when rich),
    //         i.e. an Am skank now voices as Am7. That is idiomatic (roots
    //         reggae comps minor chords as m7 far more often than as a bare
    //         triad) and it is the same treatment the six genres above already
    //         get, but it IS a harmonic change, not only a register one.
    //   OUT — Rock/Metal: the voicing IS the root — a power chord is root+5th,
    //         and rootless would delete the gesture rather than thin it.
    //   OUT — Country/Acoustic: strummed open-position guitar shapes sound the
    //         root by physical necessity; a rootless acoustic strum isn't a
    //         voicing choice, it's a different instrument.
    //   OUT — Disco: reviewed, not inherited. The famous disco octave-doubling is
    //         the BASSLINE, not the comp, and the Philly/Chic guitar-and-strings
    //         comp is often a rootless upper structure — so the easy argument
    //         cuts the other way. Kept out because the stab is a rhythmic
    //         landmark punching against an already-busy octave-jumping bass: it
    //         wants a stated root to land on, not a color-only shell.
    //   OUT — Ska: the closest call, since the ska upstroke and the reggae skank
    //         are near-identical guitar gestures. The split is the BASS's role,
    //         which is what this set is actually about: ska-punk's bass drives
    //         root-eighths as an engine under the horns, so nothing is asking
    //         the comper to vacate the bottom, whereas reggae's bass is the
    //         melodic lead the skank is deliberately staying out of the way of.
    it('BASS_SPACE_FEELS membership is exactly the rootless-voicing idiom set', () => {
        expect([...BASS_SPACE_FEELS].sort()).toEqual([
            'Blues',
            'Bossa Nova',
            'Funk',
            'Hip Hop',
            'Jazz',
            'Neo-Soul',
            'Reggae',
        ]);
    });

    // "Which feels keep the hat as the time-spine through the final-bar swell"
    // (groove-engine.ts, Epic 12 S6 B6): the Epic 2 S4 cadence gesture suppresses
    // the closed hat universally so the crash rings out; these genres are exempt
    // because the hat is structural, and cutting it reads as the band dropping
    // out at the moment it should land hardest.
    //   IN  — Disco (8ths over four-on-the-floor), Funk (16th ghosting),
    //         Rock (driving 8ths), Metal (8th-note rides): constant tickers.
    //   IN  — Ska: the offbeat-only skank is the SOLE timekeeper at low
    //         intensity, so its absence is more conspicuous than a ticker's.
    //   IN  — Hip Hop: boom-bap 8ths at motif 0, 16ths at motif >= 1 — every
    //         motif ticks.
    //   IN  — Neo-Soul: 8ths low / 16ths above ~0.58, and cadences arrive at
    //         section climax where it WILL be ticking 16ths. Flagged borderline
    //         at the time; the cadence-intensity correlation tips it in.
    //   OUT — Jazz: genuinely sparse on the SUPPRESSED lane — its closed hat is
    //         a HiHatPedal chirp on 2 and 4; its actual time lives on the
    //         ride/Open lane, which the cadence gesture silences separately.
    //   OUT — Bossa Nova/Country/Blues/Acoustic/Reggae: careful here, because
    //         the obvious rationale ("sparse-hat genres") is FALSE for all five —
    //         each ticks a continuous hat in its own strategy file (Acoustic an
    //         unconditional 16th shaker pulse, Blues shuffled 8ths, Country and
    //         Bossa plain 8ths, Reggae 8ths at every intensity). The real rule is
    //         not hat DENSITY but whether the closed hat is what the listener is
    //         counting time on AT THE MOMENT THE CRASH LANDS: in these five the
    //         cadence hands time to the swell/ride, so cutting the hat reads as
    //         the intended "let it breathe" rather than as a drop-out.
    //         Two cross-references, so nobody re-derives this from the wrong
    //         axis: grooves/utils.ts's compound-meter 'sparse'/'shimmer' split is
    //         a DIFFERENT axis (density budget, not cadence spine) and disagrees
    //         with this set on purpose — it files Rock/Metal/Reggae together as
    //         'sparse' while this set has Rock/Metal IN and Reggae OUT. And
    //         reggae.ts calls its hat "metronomic," which is a fair argument for
    //         moving it IN; it is left OUT here because that is an audible
    //         final-bar change wanting a listen, not because reggae's hat is thin.
    //         Genuinely open, not settled — but not a Reggae-specific anomaly
    //         either, since Bossa/Country/Blues/Acoustic tick just as steadily.
    it('HAT_SPINE_GENRES membership is exactly the foundational-hat set', () => {
        expect([...HAT_SPINE_GENRES].sort()).toEqual([
            'Disco',
            'Funk',
            'Hip Hop',
            'Metal',
            'Neo-Soul',
            'Rock',
            'Ska',
        ]);
    });

    // "Which feels HOLD a comping cell across bars instead of re-rolling it each
    // bar" (accompaniment.ts `updateRhythmicIntent`, 4-8 bar retention).
    //   IN  — Funk: the original sticky case — a funk comp is one cell locked in
    //         and ridden, and re-rolling per bar is what made it sound restless.
    //   IN  — Jazz/Blues: their cell banks are ALREADY phrase-stable without the
    //         flag — both hash on `phraseHash = phraseIndex >> 2`, which returns
    //         the same cell for all four bars whether or not retention is on. So
    //         membership is not what holds their cell; what it holds is the
    //         per-bar re-roll of `currentVibe`/intent on top of it, so the comper
    //         commits to one dynamic shape for the phrase instead of re-deciding
    //         sparse-vs-active every bar.
    //   IN  — Bossa Nova, and note the direction is the OPPOSITE of the others:
    //         Bossa hashes on the raw `phraseIndex` (per bar, not >>2), and its
    //         membership exists so the STICKY block can pin `maxGrooveLength = 2`
    //         and advance `bossaRotationIndex`. That makes the cell CHANGE every
    //         two bars — partido-alto's bar-A/bar-B call-and-response. Dropping
    //         Bossa from this set would restore the default {4,8}-bar retention,
    //         which structurally erases that alternation. It is in the set to be
    //         held SHORTER, not longer.
    //   IN  — Ska: one-chord-per-bar upstroke skank drawn from the shared cell
    //         bank (Ska has no early-return lane, so it does reach the cell
    //         machinery); a bar-to-bar re-roll reads as losing the riddim.
    //   IN  — Reggae: kept for symmetry with Ska, but flagged honestly as close
    //         to inert — the reggae chords lane early-returns and derives its
    //         skank straight from `stepInfo.isBackbeat`, never reading
    //         `compingState.currentCell` (generateCompingPattern's own Reggae
    //         branch says so: "This pattern is not currently consumed"). What
    //         membership still freezes for it is vibe/intent. If the organ
    //         bubble on the harmony channel ever draws from the cell bank, this
    //         becomes load-bearing.
    //   IN  — Neo-Soul: the Dilla pocket is a looped figure, deliberately
    //         hypnotic across bars.
    //   OUT — Rock/Metal/Country/Acoustic/Disco: re-attack-every-cycle idioms.
    //         Note what "non-sticky" does and does not mean here: these genres
    //         still run the picker every bar (the else-branch just zeroes
    //         `grooveRetentionCount`), so they are not pattern-less — their
    //         phrase-level stability comes from `generateCompingPattern`'s own
    //         `pickPhrase(k)` draw, which already holds across a 4-bar phrase.
    //         What they lack is the extra 4-8 bar HOLD on one drawn cell, and
    //         that is correct for them: a strummer, a boom-chick, a power-chord
    //         downstroke and a four-on-the-floor stab are pulse-locked shapes
    //         that re-attack every cycle by definition, so freezing one cell
    //         across a phrase would buy nothing the pulse doesn't already give.
    //   OUT — Hip Hop: the reviewed-borderline one (a sampled loop is by nature
    //         sticky). Kept out because its stabs are placed against the beat
    //         per bar rather than retained as a comp figure; revisit with a
    //         listen if hip-hop comping ever reads as restless.
    it('STICKY_GENRES membership is exactly the cell-retention set', () => {
        expect([...STICKY_GENRES].sort()).toEqual([
            'Blues',
            'Bossa Nova',
            'Funk',
            'Jazz',
            'Neo-Soul',
            'Reggae',
            'Ska',
        ]);
    });

    // "Which feels SUSTAIN their comp (a held/strummed chord that rings) rather
    // than stab it" — the gate on comping-emit.ts's per-hit economy (#715).
    //   IN  — Jazz/Blues/Bossa Nova/Acoustic: the comp is a voicing that is meant
    //         to ring and breathe, so a leaner answering fragment on the offbeat
    //         hits is an economy a real player would make.
    //   OUT — Funk/Reggae/Neo-Soul: percussive-identity lanes where the rhythmic
    //         RESTATEMENT is the genre (clav chucks, skank). Excluded twice over
    //         — each early-returns in getAccompanimentNotes on its FEEL before
    //         the economy is reachable — so membership only documents intent.
    //   OUT — Country/Metal: excluded the same way, but keyed on their default
    //         CHORD STYLE ('strum-country' / 'power-metal'), not on their feel.
    //         Switch a country chart off the strum style and it reaches the
    //         shared lane immediately, where this set is the only thing keeping
    //         it out — so the membership is load-bearing for them, not decorative.
    //   OUT — Ska: reaches the shared smart lane (there is NO ska early-return
    //         lane) and is excluded by this set alone. The upstroke is a stab —
    //         a leaner answering fragment has nothing to answer.
    //   OUT — Hip Hop: reaches the shared smart lane but is left out on purpose;
    //         its stabs are sampled-chop gestures, not sustained voicings.
    //   OUT — Neo-Soul specifically (reviewed #1216 and KEPT out, not a gap):
    //         held Rhodes pads exist in the idiom, but Dilla-style syncopated
    //         chop-comping is the more identity-defining half, and the per-hit
    //         economy is built around answering a sustained statement.
    //   OUT — Rock/Disco: deferred, not decided. Disco is stabs; Rock is a
    //         standing follow-up once the mechanism has been auditioned on
    //         Jazz/Blues. Moving either is a listen, not a one-word diff.
    it('SUSTAINED_COMP_GENRES membership is exactly the sustained-comp set', () => {
        expect([...SUSTAINED_COMP_GENRES].sort()).toEqual([
            'Acoustic',
            'Blues',
            'Bossa Nova',
            'Jazz',
        ]);
    });

    // "Which feels may RING a comp hit through the next answer (tie instead of
    // re-attack)" — #766. Deliberately a strict subset of SUSTAINED_COMP_GENRES:
    // you cannot ring through what you never sustained, so every non-member of
    // that set is a non-member here for the same reason, and the only real
    // decision this pin records is the one genre that differs.
    //   IN  — Jazz/Blues/Acoustic: sustain-through is idiomatic comping.
    //   OUT — Bossa Nova, the load-bearing exclusion: its identity is a steady
    //         partido-alto ostinato of syncopated attacks, and tying through an
    //         interior attack blurs that pulse. Mirrors Bossa's exclusion from
    //         PHRASE_END_THIN_GENRES (2026-05-23 Epic 12 S4: Bossa's "breath
    //         comes from the cells themselves, not a separate gate").
    //   OUT — the other nine, inherited from SUSTAINED_COMP_GENRES above.
    it('RING_THROUGH_GENRES membership is exactly SUSTAINED_COMP minus Bossa Nova', () => {
        expect([...RING_THROUGH_GENRES].sort()).toEqual(['Acoustic', 'Blues', 'Jazz']);
        // The subset relationship is itself the design, so assert it rather than
        // leaving it to the two literals to agree by luck.
        for (const feel of RING_THROUGH_GENRES) {
            expect(
                SUSTAINED_COMP_GENRES.has(feel),
                `${feel} rings through but never sustains`,
            ).toBe(true);
        }
    });

    // "Which feels get the lush hall reverb preset" (conductor.ts); everything
    // else gets the tight room.
    //   IN  — Jazz/Blues/Bossa Nova/Neo-Soul/Acoustic: slow, open, harmonically
    //         rich styles where a long tail is part of the sound and there is
    //         enough space between events for it to decay.
    //   OUT — Rock/Metal/Funk/Disco/Hip Hop/Ska: punchy and percussive; a long
    //         tail smears the very articulation that carries the groove.
    //   OUT — Country: dry-forward Nashville production; the room is the point.
    //   OUT — Reggae: the genre absolutely is drenched — but in dub DELAY (a
    //         rhythmic, tempo-locked echo), which is a different effect from a
    //         long hall tail and would not be produced by this preset. Correctly
    //         out; a dub send would be its own feature, not this membership.
    it('HALL_GENRES membership is exactly the long-tail set', () => {
        expect([...HALL_GENRES].sort()).toEqual([
            'Acoustic',
            'Blues',
            'Bossa Nova',
            'Jazz',
            'Neo-Soul',
        ]);
    });

    // "Which feels refuse to let the auto-conductor's macro-arc drop them below
    // an energy floor, and how low" (conductor.ts). The VALUES are pinned too,
    // not just the keys — "Funk has a floor" and "Funk's floor is 0.45" are
    // different claims, and only the second one keeps the snare above its gate.
    //   IN  — Funk 0.45: the pocket must crack; snare gate sits at 0.3, so 0.45
    //         leaves headroom for a verse breakdown without going rim-shot.
    //   IN  — Disco 0.45: high-energy by definition; the four-on-the-floor kick
    //         has to keep punching.
    //   IN  — Neo-Soul 0.40: snare gate is INTENSITY_BANDS.LOW = 0.35, so 0.40
    //         holds the Dilla-pocket snare just above the rim-shot threshold.
    //   IN  — Ska 0.40: the upbeat-crack (offbeat hat + snare on 2 and 4) is
    //         genre identity; one notch under Disco because the snare-on-the-and
    //         is less load-bearing than a four-on-the-floor kick.
    //   IN  — Reggae 0.40 (#1216, new): the one-drop skank is identity-defining
    //         in exactly the way ska's upbeat is, and for the same mechanical
    //         reason — the pulse lives in an OFFBEAT chop whose audibility is
    //         velocity-dependent, so parking near the arc's 0.1 floor makes the
    //         riddim read as absence rather than restraint. Matched to Ska.
    //   IN  — Rock/Metal 0.35: the pre-S8 hard-coded `macroFloor` value, kept.
    //   IN  — Jazz/Bossa Nova 0.30: these DO legitimately play quietly — brush
    //         ride and sidestick comping ARE the identity down there — so the
    //         floor exists only to avoid bottoming out at dead-air 0.1. This is
    //         also why Reggae is 0.40 and not 0.30: a brush or a cross-stick
    //         stays legible at any dynamic, an offbeat crack does not.
    //   OUT — Acoustic/Blues/Country/Hip Hop: no floor, deliberately. These keep
    //         the prior no-floor behavior so the macro-arc can still take them
    //         all the way down to 0.1 for an ambient or lyrical passage — a
    //         hushed verse is expressive range for them, not a lost identity.
    it('GENRE_INTENSITY_FLOORS membership and values are exactly the floored set', () => {
        expect(GENRE_INTENSITY_FLOORS).toEqual({
            'Bossa Nova': 0.3,
            Disco: 0.45,
            Funk: 0.45,
            Jazz: 0.3,
            Metal: 0.35,
            'Neo-Soul': 0.4,
            Reggae: 0.4,
            Rock: 0.35,
            Ska: 0.4,
        });
    });

    // "Which feels opt into arrangement-by-subtraction" (#1008,
    // arrangement-layering.ts) — the seeded per-section lane rests.
    //
    // Unlike its seven siblings this is NOT a claim about all 13 genres. It is a
    // deliberately tight ROLLOUT SCOPE: three genres for the first ship, every
    // other feel gets an empty lane set and the feature is inert. So the pin
    // here locks the pilot boundary — the thing that should not drift by
    // accident — rather than asserting the other ten are musically unsuited.
    //   IN  — Rock: the dropped-out verse into a full-band chorus is the most
    //         legible instance of the gesture, and the easiest to sanity-check.
    //   IN  — Jazz: leaving lanes out IS the arranging tradition (piano lays
    //         out behind a solo; bass and drums carry it).
    //   IN  — Neo-Soul: texture-first genre where a resting lane reads as an
    //         intentional production choice rather than as an absence.
    //   OUT — the other ten: pending the pilot, not judged unsuitable. Widening
    //         this set is a rollout decision with a listen attached, which is
    //         precisely why it should not widen as a silent one-word diff.
    it('SUBTRACTION_PILOT_GENRES membership is exactly the #1008 pilot scope', () => {
        expect([...SUBTRACTION_PILOT_GENRES].sort()).toEqual(['Jazz', 'Neo-Soul', 'Rock']);
    });

    // Every pin above is a claim about the 13-feel canon, so it silently weakens
    // if the canon itself grows (a 14th genre would arrive un-argued in every
    // OUT list at once, with all eight pins still green). Tie them together.
    it('the membership pins above are written against the full 13-feel canon', () => {
        expect(
            GENRE_FEELS.length,
            'a 14th feel was added — every OUT list above needs a new argument, ' +
                'not just a bumped number',
        ).toBe(13);
    });

    // Belt-and-suspenders across the hand-maintained tables and subset sets: the
    // exact retired phantom/alias keys must never reappear. Matches the phantom
    // list in genre-canon-guard (#544) plus the genre-name aliases removed in
    // #1130. The derived SMART_BASS_STYLE_MAP and groove `strategies` belong to
    // genre-naming-authority.test.ts instead: its stronger contract pins their
    // derivation, full keyspace, intended bass styles, and groove modules.
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
        for (const [name, members] of Object.entries(FEEL_SUBSETS)) {
            for (const phantom of PHANTOMS) {
                expect(members.includes(phantom), `${name} must not contain '${phantom}'`).toBe(
                    false,
                );
            }
        }
    });
});
