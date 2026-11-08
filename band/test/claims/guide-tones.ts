/**
 * The guide-tone head's standard take (#2122): a known standard's head, sung as its changes'
 * guide tones in a tune's rhythm (`voiceGuideTones`), plays on the standards shelf in every
 * genre. Each style's claims file adds it in one call, `guideTonesTake()`, with any range a
 * style's own figures move (`band/styles/<id>.ts`'s `head.guide`) given by name.
 *
 * The ranges were set on the shared figures (`DEFAULT_GUIDE`), measured across every style
 * that plays them: the values each comment gives are that spread. Jazz's own take keeps the
 * #2111 claims it was first measured with (`claims/jazz.ts`).
 */
import type { Claim, MetricName, TakeSpec } from '../critique/harness.js';

const STANDARD = [
    // A rhythm, not a chord apiece (#2122): 2.66–2.82 on the shared figures; the held head it
    // replaced read 0.90.
    ['leadNotesPerBar', 2, 4, 'two to four notes a bar, not one held note a chord'],
    // One long arrival a phrase (#2111): 0.18–0.21; the held head 0.58.
    ['leadLongNoteBars', 0, 0.25, 'a long note a phrase, not every other bar'],
    // 0.061–0.075, counted a bar less a beat (the breath).
    ['leadWholeNoteShare', 0.03, 0.12, 'whole notes only where a phrase arrives'],
    // The guide tones carry the changes: 0.932–0.967 (a triad's 7th isn't counted).
    ['leadChangeGuideTones', 0.9, 1, 'each change lands on its 3rd or 7th'],
    // A held or strong-beat note is the harmony (`walkPool`): 0 everywhere.
    ['leadHeldNonChordShare', 0, 0.03, 'the held notes are the harmony'],
    // 0.80–0.87: the misses are a walk's passing tone on 2 or 4 (beats 1 and 3 are chord tones).
    ['leadChordToneOnBeats', 0.75, 1, 'the beats sit on the chords'],
    ['leadPhraseEndsOnChordTone', 0.8, 1, 'phrases resolve (0.88–0.96)'],
    // A common tone is tied or turned, never stuttered (#2111): 0 everywhere.
    ['leadRepeatAcrossBarline', 0, 0.05, 'no stuttered common tones across a barline'],
    // Nor one over a chord: 0 everywhere (a turn handing on struck its guide tone twice, #2122;
    // the hand-back is proved on Autumn Leaves in `guide-tones.test.ts`).
    ['leadSameChordRestrike', 0, 0.01, 'no tone struck twice over one chord'],
    // `SEAM`, so 5 by construction.
    ['leadContrastSeamLeap', 0, 5, 'into and out of the bridge by a 4th at most'],
    // The walk between guide tones steps: 1.85–2.03 over every style's own figures, steps
    // 0.73–0.82, no leap over a 5th.
    ['leadMeanInterval', 0, 2.3, 'stepwise between guide tones'],
    ['leadStepShare', 0.6, 1, 'mostly half and whole steps'],
    ['leadLeapShare', 0, 0.01, 'no leaps wider than a fifth'],
    // 0.008–0.045 on the styles' figures (hip hop's sparse hook the most).
    ['leadMoveOverThird', 0, 0.05, 'voice-led: no 4th or tritone inside a phrase'],
    ['leadChromaticApproach', 0, 0.05, 'a tune steps into its chords, not chromatically'],
    // The walk prices a trill (`TRILL` in `idiom.ts`): 0.014–0.046 on the styles' figures, where
    // without it eight of them read 0.051–0.069 (hip hop the most), so 0.05 fails it.
    ['leadOscillation', 0, 0.05, 'no trilling back and forth'],
    // The air is inside the figures (0.041–0.118: the high end is a style that lays the lead
    // out of a section); the held head read 0.20–0.27.
    ['leadRestShare', 0, 0.15, 'the head fills the form'],
    ['leadLongBreath', 0, 0.02, 'the line never drops out for two bars'],
    // It breathes a beat at every phrase end (#2024): 3.75. A turn struck in its last beat
    // leaves a bridge's hand-back an eighth's breath, and the run 7.63, so 6 fails it.
    ['leadLongestRun', 0, 6, 'a breath at least every four bars'],
    // The rhythm is the chorus's (`guidePlan`): 0.906–1. A later A that differs is a bar whose
    // chords differ (a change struck where the first A had none).
    ['leadHeadRhythmRecurs', 0.85, 1, 'the A comes back in the same rhythm'],
    // The engine's contrast (`headForm`, #2140): the pop chart's chorus against its verse, not
    // its outro against its intro. 0.04–0.18.
    ['leadHeadContrastDiffers', 0, 0.3, 'the contrast is another rhythm'],
    // From where the A ended, a 4th's aim: 4.0 in every style (Rhythm Changes' bridge 3, the
    // minor funk's 5). A sax or nylon book's line sits high (+4, +5), and read 0.5 until the
    // bridge could climb into the headroom over the A (`BRIDGE_TOP`, #2123).
    ['leadBridgeLift', 2, 7, 'the bridge lifts from where the A ended'],
    // The whole contrast, not its seam (#2123), and any contrast, not only a bridge (#2140):
    // 0.72 (ska-punk) to 2.12 (rock) over the rest of the head. That is a mean over the
    // fixtures' contrasts, and it passes only because the bridges and the pop chorus sit over
    // their A: the bossa's B itself still sits under its A at the high book homes (69, 71, 73),
    // 1.1 to 2.4 under where it was 5.0 to 6.2 before #2140 climbed it back. Its first phrase
    // is held there by #2123's falling seam; every contrast over its A on every take is #2161.
    // With the B walking down from that seam, ska-punk read -0.21, blues -0.17 and country
    // -0.08, so 0 fails it (a thin guard: `guide-tones.test.ts` holds the climb itself). 7 is
    // the lift's own ceiling, a 5th.
    ['leadContrastRegister', 0, 7, 'and the contrast sits over the A, not just its first note'],
    // 82 against 74 planned (`GUIDE_VELOCITY`), plus the lift's push: 9.7–10.7.
    ['leadBridgeLouder', 3, 20, 'and louder'],
    ['compLeadUnison', 0, 0.1, 'the comp voices under the line, rarely on its note'],
] as const satisfies readonly Claim[];

type GuideClaim = (typeof STANDARD)[number][0];

/**
 * The guide-tones take: the standard claims, with `ranges` replacing a claim's range (and,
 * given, its reason) by name, and `extra` claims after them — the shared library's or the
 * style's own metrics (`M`, checked against the style's `metrics` by `defineClaims`).
 */
export function guideTonesTake<M extends string = never>(
    ranges: Partial<Record<GuideClaim, readonly [min: number, max: number, why?: string]>> = {},
    extra: Claim<MetricName | M>[] = [],
): { take: TakeSpec; claims: Claim<MetricName | NoInfer<M>>[] } {
    return {
        take: { lead: 'guide-tones' },
        claims: [
            ...STANDARD.map(([metric, min, max, why]): Claim => {
                const r = ranges[metric];
                return r ? [metric, r[0], r[1], r[2] ?? why] : [metric, min, max, why];
            }),
            ...extra,
        ],
    };
}
