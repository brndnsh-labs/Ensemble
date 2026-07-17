import { describe, expect, it } from 'vitest';
import { SMART_GENRES } from '../../public/data/smart-genres.js';
import { resolveSoloistStyle, STYLE_CONFIG } from '../../public/engine/soloist-config.js';

/**
 * Cross-genre soloist routing guard (#592 — the genre→profile routing audit).
 *
 * Systemic finding consolidated here: the `SMART_GENRES[*].soloist` table was
 * never reconciled against the hand-tuned per-genre soloist profiles, so several
 * genres silently played a DIFFERENT profile than their name implied (Hip Hop on
 * Neo-Soul, Rock on Shred, Acoustic on the generic Minimal). Each was surfaced
 * one-by-one by the Wave-1 critique backfills. This file pins the WHOLE agreed
 * table in one place so no genre can silently re-route again — a single guard
 * the per-genre critique tests no longer have to each re-derive.
 *
 * The value asserted is what a user ACTUALLY hears: `resolveSoloistStyle('smart',
 * genreFeel)` — the production resolution path, keyed by `groove.genreFeel`. Note
 * two genres whose `feel` differs from their genre name (Bossa → 'Bossa Nova',
 * Ska-Punk → 'Ska') resolve via the GENRE_STYLE_MAPPING fallback rather than their
 * SMART_GENRES entry; both still converge to the right profile, and this guard
 * pins that so the convergence can't quietly break.
 */
describe('soloist genre→profile routing guard (#592)', () => {
    // The agreed canonical table: genre name → [genreFeel, profile a user hears].
    // Keep this in lockstep with SMART_GENRES; a mismatch here is the bug.
    const ROUTING: Record<string, { feel: string; profile: string }> = {
        Rock: { feel: 'Rock', profile: 'rock' }, // #592: flipped from 'shred'
        Jazz: { feel: 'Jazz', profile: 'bird' },
        Funk: { feel: 'Funk', profile: 'funk' },
        Disco: { feel: 'Disco', profile: 'disco' },
        'Hip Hop': { feel: 'Hip Hop', profile: 'hiphop' }, // #555: flipped from 'neo' — revived the dedicated hook-lane profile
        Blues: { feel: 'Blues', profile: 'blues' },
        'Neo-Soul': { feel: 'Neo-Soul', profile: 'neo' },
        Reggae: { feel: 'Reggae', profile: 'reggae' }, // #570: activated the tailored skank profile (was 'minimal')
        Acoustic: { feel: 'Acoustic', profile: 'acoustic' }, // #592: flipped from 'minimal'
        Bossa: { feel: 'Bossa Nova', profile: 'bossa' }, // feel≠name → GENRE_STYLE_MAPPING
        Country: { feel: 'Country', profile: 'country' },
        Metal: { feel: 'Metal', profile: 'metal' },
        'Ska-Punk': { feel: 'Ska', profile: 'ska' }, // feel≠name → SMART_GENRES['Ska'] misses → GENRE_STYLE_MAPPING['Ska']='ska'
    };

    it('covers every SMART_GENRES entry (no genre left unguarded)', () => {
        // If a genre is added to SMART_GENRES, it MUST get a row here so its
        // routing is consciously chosen, not left to silently fall through.
        expect(Object.keys(ROUTING).sort()).toEqual(Object.keys(SMART_GENRES).sort());
    });

    it.each(Object.entries(ROUTING))(
        '%s resolves to its agreed soloist profile in smart mode',
        (_genre, { feel, profile }) => {
            // The production path a user hears: smart style + the genre's feel.
            expect(resolveSoloistStyle('smart', feel)).toBe(profile);
            // Undefined style (no explicit UI pick) routes identically.
            expect(resolveSoloistStyle(undefined, feel)).toBe(profile);
        },
    );

    it('every resolved profile is a real STYLE_CONFIG entry (no dead routes)', () => {
        // Guards the dead-profile class of bug directly: a route that resolves to
        // a key STYLE_CONFIG doesn't define would fall back to defaults silently.
        for (const { feel } of Object.values(ROUTING)) {
            const resolved = resolveSoloistStyle('smart', feel);
            expect(Object.hasOwn(STYLE_CONFIG, resolved)).toBe(true);
        }
    });

    it('pins the two #592 flips against their previous (now-rejected) routing', () => {
        // Rock: was 'shred', now 'rock' (idiomatic bluesy default).
        expect(SMART_GENRES.Rock.soloist).toBe('rock');
        expect(resolveSoloistStyle('smart', 'Rock')).not.toBe('shred');
        // Acoustic: was the generic 'minimal', now the hand-tuned 'acoustic'.
        expect(SMART_GENRES.Acoustic.soloist).toBe('acoustic');
        expect(resolveSoloistStyle('smart', 'Acoustic')).not.toBe('minimal');
        // #628: the `shred`/`minimal` phantom profiles are retired. An explicit
        // request for either now gracefully degrades to the genre's own live
        // profile (no dedicated phantom to resolve to).
        expect(resolveSoloistStyle('shred', 'Rock')).toBe('rock');
        expect(resolveSoloistStyle('minimal', 'Acoustic')).toBe('acoustic');
    });
});
