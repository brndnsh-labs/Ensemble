/**
 * Intro / Outro instrument-layering config (epic-form-arrangement S5).
 *
 * A produced track typically opens drums-only for 2-4 bars, then layers in the
 * bass, then the chord comp, then the harmony — and inverts the order on the
 * outro. Today all six engines emit from beat 1, so the "Intro" is just "the
 * same band, quieter" (form-arranger.md P1 #4).
 *
 * This module owns the per-engine mute schedule, expressed in bars-from-section-
 * start (intro) and bars-until-section-end (outro). The tick-logic chord-data
 * preamble publishes `coordination.introBarsElapsed` / `outroBarsRemaining` from
 * the current `chord.sectionLabel` (substring match on "intro" / "outro" / "end",
 * lowercased, same way `soloist.ts`'s `isOutro` check derives it); each engine reads
 * its entry/exit from `INTRO_MUTES` / `OUTRO_MUTES` and gates its first
 * note-emission accordingly.
 *
 * Drums are intentionally absent — the drums-only opening is the whole point
 * of the layered intro, and a fading-drums outro would defeat the "land the
 * landing" cadence (S4) on the final bar.
 *
 * Soloist is also intentionally absent — holding it out of the layered intro
 * would compound that gesture awkwardly. If a future story adds a "soloist sits
 * out the first 4 bars" feature, it should live here.
 *
 * Source: docs/audit/form-arranger.md P1 #4;
 *         docs/audit/epic-form-arrangement.md S5.
 */

/**
 * Bars each engine waits before entering on an Intro section.
 *
 * Concretely: when the engine's mute count is N, the engine emits NO notes for
 * bars 0..N-1 of the intro (counted from the section's start) and enters at the
 * downbeat of bar N. So `bass: 2` means "bass enters on bar 3 of the intro
 * (the third measure)." Drums play from bar 1 (the drums-only opening).
 *
 * Chosen values:
 *   - bass: 2 — kick + bass arriving together on bar 3 is the canonical
 *     "now we're a band" entry. Earlier (bar 2) doesn't give the drummer
 *     enough time to establish the groove; later (bar 4) drags the buildup.
 *   - chords: 3 — chord comp on bar 4 lets the rhythm section (drums + bass)
 *     establish on bar 3 before the harmonic layer joins. On a typical 4-bar
 *     intro, this gives the comp one bar of audible "I'm in" inside the intro
 *     before the verse downbeat — a true within-intro stair-step
 *     (drums → +bass → +chords → +harmony) matching the audit-doc sketch
 *     (`form-arranger.md` P1 #4: "bass from bar 2, chords from bar 3-4,
 *     harmony from bar 4-5").
 *   - harmony: 4 — harmonic-overlay (organ pads, horn stabs, string voices)
 *     joins one bar AFTER the comp. On a 4-bar intro, harmony lands on the
 *     verse downbeat — the band feels fully assembled by bar 1 of the verse.
 *     Staggering by 1 bar from chords (not 0 or 2) keeps the texture move
 *     audible without dragging out the buildup.
 */
export const INTRO_MUTES: Readonly<Record<string, number>> = {
    bass: 2,
    chords: 3,
    harmony: 4,
};

/**
 * Bars each engine drops out BEFORE the outro section ends (counted from the
 * section's last bar working backwards).
 *
 * Concretely: when the engine's mute count is N, the engine emits NO notes
 * during the LAST N bars of the outro. So `harmony: 4` means "harmony drops
 * out 4 bars before the outro ends — it's silent through the final 4 bars."
 * Drums play through to the final bar (where S4's resolution cascade fires).
 *
 * Layering order — inverse of the intro:
 *   - harmony: 4 — drops first; harmonic color thins the texture early in the
 *     outro fadeout. Pulled at 4-from-end so a typical 8-bar outro has the
 *     harmony silent for the back half.
 *   - chords: 3 — drops next; the comp pulls one bar AFTER harmony. The
 *     listener hears the harmonic foundation pull away in stages.
 *   - bass: 1 — drops on the very last bar (so it plays through bars 1..N-1
 *     of the outro). The bass holds the foundation until just before the
 *     drums' final crash — S4's cadence still fires the bass tonic on the
 *     FINAL bar via `coordination.isFinalMeasure`, which OVERRIDES this
 *     outro mute (see precedence in tick-logic preamble).
 *
 * Note: drums (and the S4 final-bar cadence on bass/chords) are intentionally
 * outside this map. The cadence ON the final bar is more musically important
 * than the fade-out gesture leading up to it.
 */
export const OUTRO_MUTES: Readonly<Record<string, number>> = {
    bass: 1,
    chords: 3,
    harmony: 4,
};

/**
 * True iff a section label (already-lowercased OK) indicates an Intro section.
 * Substring match — mirrors `soloist.ts`'s `isOutro` (`label.includes('outro')`) and
 * `unrollArrangement` in arranger-utils.ts (`roleLabel = 'Intro'`).
 */
export function isIntroSectionLabel(label: string | undefined | null): boolean {
    if (!label) {
        return false;
    }
    return label.toLowerCase().includes('intro');
}

/**
 * True iff a section label indicates an Outro section. Matches "outro" or "end"
 * (the same vocabulary `soloist.ts`'s `isOutro` check accepts).
 */
export function isOutroSectionLabel(label: string | undefined | null): boolean {
    if (!label) {
        return false;
    }
    const l = label.toLowerCase();
    return l.includes('outro') || l.includes('end');
}

/**
 * Arrangement-by-subtraction (story #1008).
 *
 * The whole macro-arc otherwise projects onto one scalar (`bandIntensity`) — a
 * big chorus is "the same band, louder." Real arrangements evolve by TEXTURE:
 * the most audible arrangement gesture is an instrument *not playing*. This
 * module publishes a seeded (deterministic) per-`(section, occurrence, genre)`
 * set of lanes that should rest, reusing the exact `INTRO_MUTES` precedence path
 * (each engine's intro/outro mute gate honors the returned lane set) so the
 * subtraction composes cleanly with intro/outro layering and the S4 final-bar
 * cadence rather than forking a parallel muting system.
 *
 * Determinism: this is a pure lookup of `(sectionLabel, occurrence, genre)` — no
 * `Math.random`. The same section/occurrence yields the same lane set on every
 * loop, so critique tests and looped playback stay coherent.
 */

/**
 * Pilot genres for arrangement-by-subtraction. Gated tight (Rock, Neo-Soul,
 * Jazz) for the first ship — every other genre gets an empty lane set (feature
 * inert, full band as before). Keys are the runtime `groove.genreFeel` form
 * (the drum-strategy key: 'Neo-Soul' is 'Neo-Soul'; 'Jazz'/'Rock' are literal),
 * NOT a UI label — see smart-genres.ts `feel`.
 */
export const SUBTRACTION_PILOT_GENRES: ReadonlySet<string> = new Set(['Rock', 'Neo-Soul', 'Jazz']);

/**
 * Lanes the subtraction plan can silence. These are exactly the lane keys that
 * already own an `INTRO_MUTES` gate (bass, chords, harmony) — the subtraction
 * plan feeds the SAME gate, so it can only rest lanes that already have a
 * proven mute path. Drums and the soloist are intentionally NOT subtractable
 * here: the starter table never mutes them (the section's rhythmic + melodic
 * bones must sound), and neither has an intro/outro mute gate to reuse.
 */
export type SubtractionLane = 'bass' | 'chords' | 'harmony';

/**
 * Seeded instrumentation plan: which lanes rest for this `(section, occurrence)`.
 *
 * Starter subtraction table (story #1008, approved by Brandon /unblock) — the
 * `chords` lane is the comp (accompaniment.ts); `harmony` is the pad layer
 * (harmonies.ts). "Comp tacet" / "pads only, no comp" both mute the comp lane:
 *
 *   - Verse, 2nd pass  → comp tacet          → mute [chords]
 *       (bass + drums + lead + pads still play — the repeat verse pulls the
 *        rhythm-guitar/piano comp so the second pass feels stripped, not just
 *        quieter)
 *   - Bridge, any pass → harmony pads only   → mute [chords]
 *       (no comp; the sustained pad + rhythm section carry the bridge — the
 *        classic "bridge floats on pads" texture)
 *   - Chorus, final pass → tutti             → mute []  (everyone in — the
 *        climax is deliberately the FULL band; kept explicit so a future table
 *        that thins earlier choruses can never accidentally thin the last one)
 *   - Every other (section, occurrence)      → mute []  (full band, unchanged)
 *
 * `occurrence` / `totalOccurrences` come from `getSectionContext` (arranger-utils),
 * which already wraps `step` into the loop frame (#923) before matching the
 * sectionMap — so callers pass the section context values directly.
 */
export function getSubtractionMutes(
    sectionLabel: string | undefined | null,
    occurrence: number,
    totalOccurrences: number,
    genreFeel: string | undefined | null,
): SubtractionLane[] {
    // why: pilot-gated — non-pilot genres get the full band (feature inert).
    if (!genreFeel || !SUBTRACTION_PILOT_GENRES.has(genreFeel)) {
        return [];
    }
    const label = (sectionLabel || '').toLowerCase();

    // why: Verse 2nd pass drops the comp — the return of the verse reads as a
    // texture change (stripped) rather than a louder repeat. 1st pass and any
    // 3rd+ pass stay full band (the table only specifies the 2nd).
    if (label.includes('verse') && occurrence === 2) {
        return ['chords'];
    }

    // why: the bridge floats on sustained pads over the rhythm section — comp
    // out, harmony/pads in. Any pass (bridges typically occur once).
    if (label.includes('bridge')) {
        return ['chords'];
    }

    // why: final chorus is tutti — explicit no-subtraction so the climax is the
    // full band. (Falls through to the same empty set as the default, but named
    // for intent and future-proofing.)
    if (label.includes('chorus') && occurrence === totalOccurrences) {
        return [];
    }

    // why: every other (section, occurrence) is unchanged / full band.
    return [];
}
