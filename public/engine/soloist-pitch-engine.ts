// Chord-target-tones helper for the soloist's voice-leading layer.
//
// Epic #10/#866: this file once held the legacy `selectPitchAndDevices` weighted
// pitch/device picker (~1700 lines) that drove the retired `getSoloistNote`
// engine. With that engine deleted, the live phrase-first engine consumes only
// `chordTargetTones` from here (guide/pillar tones derived from chord QUALITY, so
// they survive rootless comp voicings). The picker and its device/profile tables
// were removed; the surviving classify/quality machinery is what `chordTargetTones`
// needs.

type ChordQualityClass =
    | 'maj' // major triad, maj7/maj9/maj11/maj13/maj7#11, 6, add9
    | 'min' // m7/m9/m11/m13 and plain minor triad — m7's 6 is b5 (avoid)
    | 'min6' // m6 chord — dorian context, 6 = M6 is the chord tone itself
    | 'minadd' // madd9 — a minor TRIAD plus colour; "add" means no 7th to target
    | 'minmaj' // mMaj7 — melodic minor; the MAJOR 7th is the guide tone, never the b7
    | 'dom' // 7, 9, 11, 13 — full dominant extension vocabulary legal
    | 'alt' // 7alt, 7b9, 7#9, 7b13, 7b5 — altered scale; route via alteredHookIntervals
    | 'halfdim' // halfdim / m7b5 — locrian; 6 = b5 is a chord tone, not an extension
    | 'dim' // dim, dim7 — symmetric, no traditional upper-structure
    | 'sus' // sus4 — no 3rd, looser palette
    | 'sus2' // sus2 — same, but the characteristic tone is the 2nd, not the 4th
    | 'domsus' // 7sus4, 9sus4, 13sus4 — dominant function, the 4th in place of the 3rd
    | 'power' // 5 — root and 5th only
    | 'majb5' // maj7b5 — lydian; the 3rd and maj7 are the guides, the 5 is FLAT
    | 'aug'; // aug, augmaj7 — whole-tone / lydian-aug, no perfect 5

export function classifyChordQuality(quality: string | undefined): ChordQualityClass {
    if (!quality) {
        return 'maj';
    }
    // why: lowercase-normalize so capital-M strings ('Major', 'Minor') don't
    // fall through to the 'dom' fallback and silently re-introduce the
    // b5-on-m7 bug Epic 12 S2 fixed. Production qualities are all lowercase
    // today, but a future test fixture or chord-source emitting capital-M
    // would defeat the per-quality table. FOLLOWUPS §F (Epic 12 S2 review).
    const q = quality.toLowerCase();
    // '7b5' belongs here too: the 'dom' pillars carry the NATURAL 5 the chart flattened.
    if (q === '7alt' || q === '7b9' || q === '7#9' || q === '7b13' || q === '7b5') {
        return 'alt';
    }
    if (q === 'halfdim') {
        return 'halfdim';
    }
    if (q === 'dim' || q === 'dim7' || q === 'diminished') {
        return 'dim';
    }
    if (q === 'sus2') {
        return 'sus2';
    }
    if (q === 'sus4') {
        return 'sus';
    }
    // why (#1328): a suspended DOMINANT fell through to 'dom', whose guide tones are the
    // major 3rd + b7 — so the soloist landed on, the bass walked to, and the comp's echo
    // built a support voice from, the one tone the suspension replaces, a semitone under
    // the comper's 4th.
    // '11' belongs here too (#1326): a dominant 11th features the 4th and omits the 3rd —
    // its rooted stack is [0,5,7,10,14,17], no 3rd anywhere — so the 'dom' guides would aim
    // the soloist, the walking bass and the comp's echo voice at a major 3rd the chord
    // deliberately leaves out, a semitone under the 11th the comper is sounding.
    if (q === '7sus4' || q === '9sus4' || q === '13sus4' || q === '11') {
        return 'domsus';
    }
    // A power chord has no 3rd or 7th to target; it used to fall through to 'dom'.
    if (q === '5') {
        return 'power';
    }
    if (q === 'aug' || q === 'augmaj7' || q === 'augmented') {
        return 'aug';
    }
    // why (#1329): 'maj7b5' starts with 'maj', and the 'maj' pillars are (1, 3, 5) — the
    // NATURAL 5 this chord flattens. Its own class keeps the b5 out of the target set
    // without inventing one (the b5 is a colour the comper states, not a landing tone).
    if (q === 'maj7b5') {
        return 'majb5';
    }
    if (q === 'm6') {
        return 'min6';
    }
    // why (#1321): 'mmaj7' passes the minor-family test below (starts with 'm', not 'maj'),
    // which would hand it the minor pillars — and those include the b7 the chord exists to
    // replace. A soloist targeting Bb over a CmMaj7 is the same defect as the comper
    // voicing it as a Cm7, one lane over.
    if (q === 'mmaj7') {
        return 'minmaj';
    }
    // why (#1322): same trap for 'madd9'. The minor class's pillars and guides carry the
    // b7, and `chordTargetTones` feeds three lanes — the soloist's strong-beat landing,
    // the walking bass's targets, and the comp's Q&A echo support voice, which BUILDS a
    // note from them. "add9" is written to say "no 7th", so a b7 from any of those is the
    // comper's Cm(add9) -> Cm7 defect one lane over. Mirrors 'add9' -> 'maj' below.
    if (q === 'madd9') {
        return 'minadd';
    }
    // Minor family: 'minor', 'm', 'm7', 'm9', 'm11', 'm13'. Mirrors the
    // theory-scales.ts isMinorQuality predicate: starts with 'm' but NOT 'maj'.
    if (q.startsWith('m') && !q.startsWith('maj')) {
        return 'min';
    }
    if (
        q.startsWith('maj') ||
        q === 'major' ||
        q === '6' ||
        q === '6/9' ||
        q === 'add9' ||
        q === 'add2'
    ) {
        return 'maj';
    }
    // Numeric dominant: '7', '9', '11', '13', '7#11'. Default for unrecognized
    // numeric-suffix qualities (treat like a dominant extension chord).
    return 'dom';
}

// Functional chord-tone "pillars" per quality class, as a 12-bit pitch-class mask
// relative to the chord ROOT. Blues comps ROOTLESS when a bass is present
// (voicing-policy.ts → BASS_SPACE_FEELS), so a voicing-derived chord mask omits the
// root and can include tensions (9/13). Voice-leading targets must be *structural*
// tones, so we derive them from the chord quality: 1/3/5, plus ♭7 on dominants and
// minors, the 6 on m6, ♭5 on dim/halfdim. Pillars only — no upper extensions.
const pcMask = (...pcs: number[]): number => pcs.reduce((m, p) => m | (1 << p), 0);
const FUNCTIONAL_PILLARS_BY_QUALITY: Record<ChordQualityClass, number> = {
    maj: pcMask(0, 4, 7),
    min: pcMask(0, 3, 7, 10),
    min6: pcMask(0, 3, 7, 9),
    minadd: pcMask(0, 3, 7),
    minmaj: pcMask(0, 3, 7, 11),
    dom: pcMask(0, 4, 7, 10),
    alt: pcMask(0, 4, 10), // altered 5 is ambiguous — don't target it
    halfdim: pcMask(0, 3, 6, 10),
    dim: pcMask(0, 3, 6, 9),
    sus: pcMask(0, 5, 7), // no 3rd — resolve to root / 4 / 5
    sus2: pcMask(0, 2, 7), // no 3rd — root / 2 / 5
    domsus: pcMask(0, 5, 7, 10), // suspended dominant: the 4th stands where the 3rd would
    power: pcMask(0, 7),
    majb5: pcMask(0, 4, 6),
    aug: pcMask(0, 4, 8),
};

// Guide tones — the 3rd and 7th, the notes that DEFINE a chord's quality and
// function (major vs minor, dominant tension). Voice-leading targets these on
// strong beats: landing on a guide tone is what makes a line "outline the
// changes" rather than wander over them. Intervals above the root, per quality
// class. A plain triad ('maj', 'sus', 'aug') has no functional 7th to target, so
// only its characteristic tone is listed; the dominant/minor tritone pair (3 + b7)
// is the workhorse for "through the changes" motion. Derived from chord QUALITY,
// not the (often rootless) comp voicing — same rationale as the pillars above.
const GUIDE_INTERVALS_BY_QUALITY: Record<ChordQualityClass, number[]> = {
    maj: [4], // major 3rd (maj7's 7 is left to a later idiom slice)
    min: [3, 10], // b3, b7
    min6: [3, 9], // b3, 6
    minadd: [3], // b3 only — an added-tone chord has no 7th to guide toward
    minmaj: [3, 11], // b3, maj7 — the chord's whole identity is that 7th
    dom: [4, 10], // 3, b7 — the classic dominant tritone
    alt: [4, 10],
    halfdim: [3, 10], // b3, b7
    dim: [3, 9], // b3, bb7
    sus: [5], // no 3rd — the suspended 4 is the characteristic tone
    sus2: [2],
    domsus: [5, 10], // 4, b7 — the suspension and the dominant 7th, never the 3rd
    power: [7],
    majb5: [4, 11], // 3, maj7 — the pair that names it; never the natural 5
    aug: [4], // major 3rd
};

/**
 * The harmonic targets of a chord as absolute pitch classes (0–11), derived from
 * its QUALITY (robust to rootless comp voicings): `guides` are the 3rd/7th to aim
 * strong beats at; `pillars` are the full functional chord-tone set (1/3/5/(b7…))
 * to fall back to when no guide tone sits within reach. Consumed by the phrase-first
 * voice-leading layer.
 */
export function chordTargetTones(
    rootMidi: number,
    quality: string | undefined,
): { guides: number[]; pillars: number[] } {
    const root = ((Math.round(rootMidi) % 12) + 12) % 12;
    const cls = classifyChordQuality(quality);
    const guides = GUIDE_INTERVALS_BY_QUALITY[cls].map((i) => (root + i) % 12);
    const mask = FUNCTIONAL_PILLARS_BY_QUALITY[cls];
    const pillars: number[] = [];
    for (let i = 0; i < 12; i++) {
        if (mask & (1 << i)) {
            pillars.push((root + i) % 12);
        }
    }
    return { guides, pillars };
}
