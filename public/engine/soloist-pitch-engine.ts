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
    | 'dom' // 7, 9, 11, 13 — full dominant extension vocabulary legal
    | 'alt' // 7alt, 7b9, 7#9, 7b13 — altered scale; route via alteredHookIntervals
    | 'halfdim' // halfdim / m7b5 — locrian; 6 = b5 is a chord tone, not an extension
    | 'dim' // dim, dim7 — symmetric, no traditional upper-structure
    | 'sus' // sus2, sus4 — no 3rd, looser palette
    | 'aug'; // aug, augmaj7 — whole-tone / lydian-aug, no perfect 5

function classifyChordQuality(quality: string | undefined): ChordQualityClass {
    if (!quality) {
        return 'maj';
    }
    // why: lowercase-normalize so capital-M strings ('Major', 'Minor') don't
    // fall through to the 'dom' fallback and silently re-introduce the
    // b5-on-m7 bug Epic 12 S2 fixed. Production qualities are all lowercase
    // today, but a future test fixture or chord-source emitting capital-M
    // would defeat the per-quality table. FOLLOWUPS §F (Epic 12 S2 review).
    const q = quality.toLowerCase();
    if (q === '7alt' || q === '7b9' || q === '7#9' || q === '7b13') {
        return 'alt';
    }
    if (q === 'halfdim') {
        return 'halfdim';
    }
    if (q === 'dim' || q === 'dim7' || q === 'diminished') {
        return 'dim';
    }
    if (q === 'sus2' || q === 'sus4') {
        return 'sus';
    }
    if (q === 'aug' || q === 'augmaj7' || q === 'augmented') {
        return 'aug';
    }
    if (q === 'm6') {
        return 'min6';
    }
    // Minor family: 'minor', 'm', 'm7', 'm9', 'm11', 'm13'. Mirrors the
    // theory-scales.ts isMinorQuality predicate: starts with 'm' but NOT 'maj'.
    if (q.startsWith('m') && !q.startsWith('maj')) {
        return 'min';
    }
    if (q.startsWith('maj') || q === 'major' || q === '6' || q === 'add9') {
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
    dom: pcMask(0, 4, 7, 10),
    alt: pcMask(0, 4, 10), // altered 5 is ambiguous — don't target it
    halfdim: pcMask(0, 3, 6, 10),
    dim: pcMask(0, 3, 6, 9),
    sus: pcMask(0, 5, 7), // no 3rd — resolve to root / 4 / 5
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
    dom: [4, 10], // 3, b7 — the classic dominant tritone
    alt: [4, 10],
    halfdim: [3, 10], // b3, b7
    dim: [3, 9], // b3, bb7
    sus: [5], // no 3rd — the suspended 4 is the characteristic tone
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
