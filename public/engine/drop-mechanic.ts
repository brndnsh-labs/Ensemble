/**
 * Drop / Breakdown structural mechanic (epic-deferred-followups S1(b)).
 *
 * A "Drop" section is not just a loud chorus and a "Breakdown" is not just a
 * quiet verse — they are STRUCTURAL EVENTS. The idiomatic gesture: in the last
 * bar before the drop the whole band CUTS, a crash marks the empty bar, then
 * every engine SLAMS back together on the next downbeat. The energy map in
 * `form-analysis.ts` already encodes `drop: 1.0` / `breakdown: 0.3`, but until
 * this module nothing branched on the labels for behavior (`drum-seeder.ts`
 * even aliased `drop` straight to `Chorus`, erasing the semantics).
 *
 * This module owns:
 *   - the genre gate (a drop cut is idiomatic for EDM/hip-hop/rock/metal and
 *     alien to jazz/bossa/acoustic — applying it everywhere would be wrong),
 *   - the energy-delta threshold that promotes a "the band lifts hard" section
 *     change into a full drop even when the next label is not literally "drop".
 *
 * The tick-logic chord-data preamble computes `coordination.dropMuteActive` /
 * `dropCrashPending` from these helpers + the section-boundary lookahead fields
 * (S1(a)), and gates the bass/chords/harmony/soloist producers on the mute.
 *
 * Source: docs/audit/FOLLOWUPS.md §A (drop/breakdown — DECIDED 2026-05-20);
 *         docs/audit/epic-deferred-followups.md S1.
 */

/**
 * Genres for which the drop/breakdown cut is musically idiomatic.
 *
 * why: a 1-bar full-band cut + crash + slam-back is the signature gesture of
 * EDM, hip-hop, modern rock and metal — the genres built around tension/release
 * section architecture. In jazz, bossa, blues or acoustic styles a hard cut
 * mid-form reads as a mistake, not a build. The codebase has no literal "EDM"
 * genre; Disco is its closest four-on-the-floor relative and is included.
 * Ska-Punk's stop-time breakdowns make it a natural fit too.
 *
 * Match is case-insensitive substring on `groove.genreFeel`.
 */
const DROP_FRIENDLY_GENRES: readonly string[] = [
    'rock',
    'metal',
    'shred',
    'hip-hop',
    'hiphop',
    'disco',
    // why: genreFeel for the Ska-Punk genre is 'Ska' (smart-genres.ts). The
    // needle must be 'ska' — with 'ska-punk', `'ska'.includes('ska-punk')` is
    // false (haystack shorter than needle), so Ska-Punk got no stop-time drops
    // despite the doc above. No other feel contains 'ska'. Epic 2 S1.
    'ska',
];

/**
 * Energy-delta threshold (from `form-analysis.ts`'s 0..1 energy map) above which
 * an approaching section change is promoted to a full drop, even if the next
 * label is not literally "drop"/"breakdown".
 *
 * why +0.3: the energy map steps are ~0.1-0.2 apart (verse 0.5 → pre-chorus 0.6
 * → chorus 0.9). The gate uses a STRICT `>` (see `shouldFireDropMute`), so only
 * a delta GREATER than +0.3 promotes to a drop — a genuine structural lift such
 * as verse 0.5 → drop 1.0 (+0.5), breakdown 0.3 → chorus 0.9 (+0.6) or verse
 * 0.5 → chorus 0.9 (+0.4). The canonical pre-chorus→chorus lift is +0.3 EXACTLY
 * and is deliberately excluded: a pre-chorus already IS the build into the
 * chorus, so cutting the whole band before every chorus entry would make the
 * gesture ambient instead of a signpost. A drop cut must stay a rare structural
 * event — only the hard, multi-step lifts qualify.
 */
const DROP_ENERGY_DELTA_THRESHOLD = 0.3;

/**
 * Fraction of the unrolled form a playback must have passed before an
 * energy-delta-INFERRED cut (a verse→chorus lift with no literal "drop" label)
 * is allowed to fire. Literal Drop/Breakdown labels are NOT gated by this.
 *
 * why 0.6: a full-band cut before a chorus is a "you know what's coming — here
 * comes the big one" gesture. It earns its impact from contrast and from being
 * rare. Firing it on the first chorus is premature — the listener has not yet
 * heard a chorus, so there is no established norm to play against, and the
 * payoff is spent before it is set up. Reserving the inferred cut for the back
 * 40% of the form turns it into a genuine late-song device (final chorus,
 * post-bridge climax) instead of an every-chorus habit. Confirmed by listen-test
 * 2026-05-20 — 0.6 chosen over 0.5 to make the gesture land later and harder.
 *
 * Authored Drop/Breakdown sections are explicit intent and fire at any position.
 */
const DROP_INFERRED_MIN_FORM_PROGRESS = 0.6;

/**
 * True iff the genre is one for which the drop/breakdown cut should fire.
 * `genreFeel` is the canonical genre string on `groove.genreFeel`.
 */
function isDropFriendlyGenre(genreFeel: string | undefined | null): boolean {
    if (!genreFeel) {
        return false;
    }
    const g = genreFeel.toLowerCase();
    return DROP_FRIENDLY_GENRES.some((name) => g.includes(name));
}

/**
 * True iff a section label names a Drop or Breakdown section. Substring match,
 * case-insensitive — mirrors `isIntroSectionLabel` / `isOutroSectionLabel` in
 * `arrangement-layering.ts`.
 */
function isDropSectionLabel(label: string | undefined | null): boolean {
    if (!label) {
        return false;
    }
    const l = label.toLowerCase();
    return l.includes('drop') || l.includes('breakdown');
}

/**
 * Decides whether the 1-bar pre-drop mute should fire.
 *
 * The mute fires in the LAST bar before a section boundary when EITHER:
 *   - the upcoming section is literally labelled a Drop/Breakdown (authored
 *     intent — fires at ANY position in the form), OR
 *   - the energy delta into the upcoming section crosses
 *     `DROP_ENERGY_DELTA_THRESHOLD` AND the playback has passed
 *     `DROP_INFERRED_MIN_FORM_PROGRESS` of the form. The inferred cut is a
 *     back-half gesture only — see that constant's doc for the reasoning.
 *
 * Musical reasoning for "last bar before the change" (rather than "first bar of
 * the drop"): the cut has to happen BEFORE the drop so the drop's downbeat is
 * the slam-back. Once you are inside the drop section there is nothing left to
 * anticipate. `upcomingSection*` is the correct signal here — not the current
 * section's own label — and it is only populated in the section's final bar.
 *
 * SCOPING NOTE — the spec (epic-deferred-followups.md S1) phrases the trigger as
 * "current label is drop/breakdown OR next energy delta crosses +0.3". We key
 * exclusively on `upcomingSection*` instead: the cut is a PRE-drop gesture, so
 * the section that hosts it is the one BEFORE the drop, which sees the drop as
 * its `upcomingSection`. The normal case is fully covered. The one case this
 * deliberately does NOT cover is a chart that OPENS on a Drop (no preceding
 * section to host the cut) — there is no bar to anticipate from, so the drop
 * simply plays at full energy from bar 1. That is an accepted, documented
 * limitation, not an oversight.
 *
 * BREAKDOWN — `isDropSectionLabel` matches "breakdown" too, so an approaching
 * Breakdown fires the identical 1-bar cut + crash + downbeat re-entry. A
 * breakdown is the energy floor, so this reads as a "pull-back" rather than a
 * "slam-back", but the gesture itself — a bar of silence then the section
 * resumes — is musically coherent either direction, and reusing one code path
 * keeps the mechanic simple. Distinguishing a softer breakdown gesture is a
 * deliberate non-goal for S1 (decided 2026-05-20).
 *
 * @param genreFeel              `groove.genreFeel`
 * @param barsUntilSectionChange `coordination.barsUntilSectionChange` (0 = last bar)
 * @param upcomingSectionLabel   `coordination.upcomingSectionLabel`
 * @param upcomingEnergyDelta    `coordination.upcomingSectionEnergyDelta`
 * @param formProgress           position in the unrolled form, 0..1
 *                               (`stepInForm / totalFormSteps`)
 */
export function shouldFireDropMute(
    genreFeel: string | undefined | null,
    barsUntilSectionChange: number,
    upcomingSectionLabel: string | undefined | null,
    upcomingEnergyDelta: number,
    formProgress: number,
): boolean {
    if (!isDropFriendlyGenre(genreFeel)) {
        return false;
    }
    // Only the last bar before the boundary is the cut bar.
    if (barsUntilSectionChange !== 0) {
        return false;
    }
    // Path 1 — literal Drop/Breakdown label: authored intent, fires anywhere.
    if (isDropSectionLabel(upcomingSectionLabel)) {
        return true;
    }
    // Path 2 — energy-delta inference: a back-half gesture only. An inferred
    // cut before an early chorus spends the payoff before it is set up; gate it
    // on form position so it lands as a late-song climax device.
    if (formProgress < DROP_INFERRED_MIN_FORM_PROGRESS) {
        return false;
    }
    // Strict-greater with a float-noise margin: the canonical pre-chorus→chorus
    // lift is +0.3 EXACTLY and must NOT fire. The energy map stores tenths, so
    // `0.9 - 0.6` evaluates to 0.30000000000000004 — a bare `> 0.3` would let it
    // through. The 1e-6 margin discards that noise; real qualifying deltas
    // (+0.4 and up) clear it by a wide gap.
    return upcomingEnergyDelta - DROP_ENERGY_DELTA_THRESHOLD > 1e-6;
}
