/**
 * The rhythm a known standard's guide-tone head is sung in (#2111, #2122): the shape a style's
 * `LeadBook.head.guide` takes, and the shared figures every book without its own plays.
 *
 * A guide-tone head (`players/lead/guide-tones.ts`) is the changes' 3rds and 7ths, voice-led.
 * The figures only give it a rhythm: every chord change, the first note and the last are the
 * line's guide tones, and the notes between walk to the next one (`voiceGuideTones` in
 * `idiom.ts`). Cells are sixteen steps on the straight grid: `x` an attack, `-` held, `.`
 * silent. The style's feel (`feel/feel.ts`) swings them or not; the figures never do.
 */
export interface GuideRhythm {
    /**
     * One-bar figures, two to four notes, sparser than an invented head's: the guide tones
     * carry the tune. Each strikes on (or an eighth before) beat 3, where a two-chord bar's
     * second chord arrives.
     */
    cells: readonly string[];
    /** The bar after a figure, moving on: a half note at most, so the arrival is the long note. */
    turns: readonly string[];
    /** A phrase's one long arrival, three beats or more, struck once. */
    endings: readonly string[];
    /** The whole note a section ends on. */
    close: string;
}

/**
 * The guide-tone head's figures for a book with none of its own (#2122): a plain straight-eighth
 * pop melody rhythm, two to four notes a bar, a push or an attack into the mid-bar change, and
 * one long arrival a phrase. why: the alternative was one guide tone held a chord apiece, the
 * whole-note head Brandon heard as "a bit sparse for the soloist" in Rock (#2024's listen) and
 * rejected for jazz in #2111. These are the shapes a pop or rock singer phrases a tune in; a
 * style whose idiom is another rhythm (funk's sixteenths, reggae's off-beats) writes its own.
 */
export const DEFAULT_GUIDE: GuideRhythm = {
    cells: [
        // Quarter, quarter, half: the plainest statement, walking into beat 3.
        'x---x---x-------',
        // Quarter, two eighths, half: the eighths step into the half on 3.
        'x---x-x-x-------',
        // 3 + 3 + 2: the pop "push" rhythm. The note on the and of 2 is an eighth ahead of 3,
        // so a change there is sung early (`onsetsFor`'s anticipation), as a singer pushes it.
        'x-----x-----x---',
        // A late entry on the and of 1, then 2 and 3: the phrase leans in.
        '..x-x---x-------',
        // Eighth, quarter, eighth, half: the and of 2 pushes into 3.
        'x-x---x-x-------',
        // Half, dotted quarter, and an eighth pushed over the barline: the next chord's guide
        // tone an eighth early, tied into its downbeat (`guideOnsets`).
        'x-------x-----x-',
    ],
    // Two halves; two eighths into a quarter and a half; and four driving eighths into the half
    // on 3, the phrase's busiest bar. why: none strikes on beat 4 — a bridge hands back to the
    // last A on a turn, and a note struck in its last beat leaves the phrase end an eighth's
    // breath (`takeBreath`), not the beat a singer takes.
    turns: ['x-------x-------', 'x-x-x---x-------', 'x-x-x-x-x-------'],
    // The arrival, struck once on the one: a dotted half that breathes a beat, or the whole
    // note less an eighth. why: a straight-eighth tune lands its arrival on the beat; the
    // swing singer's late landing (jazz's `..x---`) is jazz's, not the default's.
    endings: ['x-----------....', 'x-------------..'],
    close: 'x-------------..',
};
