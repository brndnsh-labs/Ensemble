import { chordHasPerfectFifth } from '../utils.js';
import { scrambleHash } from './hash-utils.js';

/**
 * BASS PUMP — the fixed-anchor octave pump (disco), as its own gesture.
 *
 * #1291 lifted this out of `getBassNote`. Not neatness: the pump violates the bass engine's
 * core assumption that each note is chosen relative to the previous one, and BOTH #1271 and
 * #1276 were bugs where a generic mechanism misfired on it — `withOctaveJump` manufacturing
 * unisons out of a line whose ordinary vocabulary is already octaves, and
 * `symmetryDirection`'s hash branch being structurally unreachable from the pump path
 * because the pump's two headroom tests are mutually exclusive. Two shipped defects from one
 * root cause: the gesture had nowhere to live, so it was expressed as ~31 scattered
 * `isPumpAnchorStyle` predicates inside a 1594-line function that assumes the opposite model.
 *
 * Everything the gesture decides for itself lives here: which styles are anchored, where the
 * anchor sits, which beat the repeat-pass variation targets, what it draws, and how the
 * drawn outcome resolves. `bass-engine.ts` talks to it through `BassPump` and never re-asks
 * any of those questions.
 *
 * What deliberately does NOT live here: the emission of the pump's notes themselves. The
 * downbeat root, the upbeat octave roll and the gallop 16ths are still `bass-styles.ts`'s
 * disco branch, because those are ordinary style-lane note choices. This module owns the
 * ANCHOR and the repeat-pass VARIATION — the two things the generic engine got wrong.
 */

// #1271 — styles whose register is a FIXED STRUCTURAL ANCHOR, not a drifting hand
// position. The octave pump's musical job is a low root nailed to every downbeat with
// the octave as the lift above it (Chic, "Stayin' Alive", "I Feel Love") — the leap IS
// the gesture, so it must not be mistaken for the player moving up the neck.
//
// `normalizeToRange`'s Neck Drift Prevention (`bass-engine.ts`) resolves the register from
// the PREVIOUS note every step (`prevMidi * 0.6 + safeCenterMidi * 0.4`). That is correct for
// a walking or melodic line and categorically wrong here: it read the pump's own leap as
// a new hand position and followed it. Measured at intensity 0.9 over 512 beat→"and"
// pairs, before the fix — when the gallop's interposed 'e' repeated the root the
// alternation was 90.6%, and when the 'e' jumped the octave it collapsed to 9.5%,
// because the drifted anchor's own +12 then exceeded the slot and folded back DOWN onto
// the downbeat's pitch: a unison emitted from an octave roll that had succeeded. The
// drift fed back through `prevMidi`, so the low root anchored only 47.9% of downbeats —
// the line wandered between two registers and descended (243) more often than it rose
// (209), and `Math.abs(diff) === 12` scored every inverted beat as a perfect pump.
//
// Deliberately NOT generalized to the other `absMax`-fold consumers. Funk's slap-pop
// (`bass-styles.ts`) folds the same way, but there the octave is an occasional
// high-complexity ornament and its fallback is a root repeat, not an inversion — a
// drifting anchor is musically fine for a slap line and hand position genuinely matters
// there. Only add a style here when the octave leap is the line's structural identity.
//
// Single member on purpose. House and hi-NRG are the same idiom and would belong here, but
// building the abstraction out for them before either exists is speculative (#1291).
const PUMP_ANCHOR_STYLES = new Set(['disco']);

/** Pitch class, sign-safe for negative or out-of-range MIDI. */
const pitchClass = (midi: number): number => ((midi % 12) + 12) % 12;

/**
 * The repeat-pass outcome on the pump's target beat.
 *
 * `'none'` — the beat plays the Statement's shape, unvaried.
 * `'drop'` — the whole beat is silent.
 * `'fifth'` — the beat keeps its low root and the lift above it is re-voiced as a 5th.
 */
export type PumpVariation = 'none' | 'drop' | 'fifth';

/**
 * Everything the pump reads, assembled once per `getBassNote` call.
 *
 * Deliberately a single flat record rather than a long argument list: the gesture genuinely
 * depends on meter, loop-relative position, section identity, live intensity and the sounding
 * chord all at once, and threading those as parameters would trade one big function for a
 * wide parameter surface — which is the thing #1291 was explicitly told not to do.
 *
 * Every field is plain data. The pump never sees `state`, the chord object, the coordination
 * context or the note-emitting helpers, so it cannot acquire a dependency on the engine and
 * there is no import edge back into `bass-engine.ts` (runtime or type) to reason about.
 */
export interface BassPumpContext {
    // --- Identity ---
    /** The resolved bass style key (post-`smart` resolution). */
    style: string;
    /** Bass comfort-range floor (28). The anchor window is `[comfortMin, comfortMin + 11]`. */
    comfortMin: number;

    // --- Meter ---
    beatsPerBar: number;
    stepsPerBeat: number;
    /** Bars per phrase — owned by `bass-engine.ts`'s `PHRASE_BARS`, passed so the two
     *  Imperfect-Symmetry paths cannot drift to different phrase lengths. */
    barsPerPhrase: number;

    // --- Loop-relative position ---
    /** Step within the current measure. */
    stepInMeasure: number;
    /** Bar index within the current 4-bar phrase (0..barsPerPhrase-1). */
    barInPhrase: number;
    /** Phrase index within the loop — the per-phrase menu draw's seed component. */
    phraseIndex: number;
    /** Steps elapsed in the current chord; 0 on its entry beat. */
    stepInChord: number;
    /** `step` wrapped into the arrangement loop, comparable with `sectionStartStep`. */
    wrappedStep: number;
    /** The current section's first step, loop-relative, or null when unknown. */
    sectionStartStep: number | null;

    // --- Section identity and repeat count ---
    /** djb2 hash of the section id — keeps Verse-2 and Chorus-2 on different patterns. */
    sectionIdHash: number;
    /** 1 = the Statement (gesture is a no-op); 2+ = a repeat pass. */
    sectionOccurrence: number;

    // --- Live musical guards ---
    intensity: number;
    isSoloistBusy: boolean;

    // --- Chord, as plain data (never the chord object) ---
    /** Chord quality string, for the natural-fifth test. */
    chordQuality: string | undefined;
    /** The chord's ROOT pitch (MIDI). */
    chordRootMidi: number;
    /** The chord's SLASH BASS pitch (MIDI) when the chart names one (`C/E`), else `null`.
     *  This — not `chordRootMidi` — is what `bass-engine.ts` hands to `anchorFor`, so the
     *  pump needs both to tell a root-position chord from a slash chord. See `canFifth`. */
    chordBassMidi: number | null;
}

/** The pump's whole surface to `bass-engine.ts`. */
export interface BassPump {
    /** True when this style's register is a fixed structural anchor rather than a drifting
     *  hand position — i.e. when the generic register/displacement machinery must stand
     *  down. Read by `withOctaveJump`, which has nothing to add to a line that already
     *  leaps the octave twice per beat. */
    readonly isAnchorStyle: boolean;
    /** The chord's low root for an anchor style, or `null` for the caller to normalize the
     *  root its ordinary way. */
    anchorFor(midi: number): number | null;
    /** The repeat-pass outcome for the step this context describes. */
    variation(): PumpVariation;
    /** Apply the repeat-pass outcome to one note of the target beat. Identity outside the
     *  `fifth` outcome — `drop` silences its whole beat upstream, so nothing that reaches
     *  here needs re-voicing. */
    revoice(note: number, baseRoot: number): number;
}

export function createBassPump(ctx: BassPumpContext): BassPump {
    const isAnchorStyle = PUMP_ANCHOR_STYLES.has(ctx.style);
    const intBeat = Math.floor(ctx.stepInMeasure / ctx.stepsPerBeat);
    const isRepeatPass = ctx.sectionOccurrence >= 2;

    // #1271 — the fixed pump anchor. Depends only on the chord root's pitch class and
    // the style's own comfort floor, so it is stable for the whole chord and cannot be
    // dragged by the previous note.
    //
    // The window is `[comfortMin, comfortMax - 12]` = [28, 39], which is EXACTLY twelve
    // semitones — so each pitch class has exactly one representative in it and the anchor
    // is a pure function of the chord root. Two consequences, both load-bearing:
    //
    // 1. It does not read `safeCenterMidi`, so it does not read `bandIntensity`. An
    //    earlier draft used `[absMin, absMax - 12]` (23 semitones) and picked the
    //    candidate nearest the center — which made the "fixed" anchor a STEP FUNCTION of
    //    live intensity, since `safeCenterMidi = 36 + floor(intensity * 7)` moves a
    //    semitone every 1/7. For any pitch class with two candidates in that wider window
    //    the anchor flipped a whole octave at the boundary, and the default-on
    //    auto-conductor ramps `bandIntensity` roughly per step. Measured on an A root
    //    ramping 0.50 → 0.65: the beat landed at anchor 33 and its own "and" two steps
    //    later at 45 + 12 = 57 — a 24-semitone leap — with the reverse crossing giving
    //    45 → 45, a unison. Those are #1271's own defect signature, re-created mid-bar and
    //    louder, and neither is a `delta < 0` inversion so the obvious assertion could not
    //    see them. Intensity belongs on `octaveProb` and velocity for a pump: a bassist
    //    digs in, they don't move up the neck.
    // 2. The pair occupies [28, 39] + [40, 51] = exactly the documented bass comfort
    //    range, so the octave partner is never parked in the chords/harmony slot (52-84).
    //    The wider window put E/F/Gb/G/Ab/A upbeats at 52-57 permanently — the octave
    //    stops reading as a bass lift and starts doubling the comper. This also settles
    //    the ceiling question the fold depends on: `anchor + 12 <= 51 < absMax`.
    //
    // Sanity check against the records this figure comes from: an A chart anchors 33/45
    // (A1→A2), which is "Good Times" / "Le Freak" exactly.
    //
    // Because the window is exactly an octave there is no nearest-candidate choice left
    // to make, and therefore no tie to break — the earlier draft's lean-to-the-lower-octave
    // rule is subsumed by the window itself.
    const anchorFor = (midi: number): number | null => {
        if (!isAnchorStyle) {
            return null;
        }
        if (!Number.isFinite(midi)) {
            return ctx.comfortMin;
        }
        const pc = pitchClass(midi);
        return ctx.comfortMin + pitchClass(pc - ctx.comfortMin);
    };

    // why: the pump gets its OWN target beat, seeded on (sectionIdHash, sectionOccurrence)
    // and deliberately NOT on `phraseIndex` — the opposite of the generic
    // `isSymmetryTargetBeat` in `bass-engine.ts`.
    //
    // A beat-long rest is real disco vocabulary, but on every record where it works the hole
    // is part of the RIFF: it recurs at the same phrase-relative position bar after bar, so
    // the ear learns it and hears the next downbeat land into an expected shape. One hole per
    // 4 bars at a *different* spot each time is scatter, and against a texture whose identity
    // is relentless eighth-note motion it reads as the bassist losing the thread rather than
    // as phrasing. Dropping `phraseIndex` makes every phrase of Verse 2 vary the same beat;
    // Verse 3 picks a different one, so PLACEMENT is what distinguishes the repeats and the
    // per-phrase menu draw (which keeps `phraseIndex`) is what keeps the occurrence alive.
    //
    // why: the target beat is NEVER a bar's One. Variation lives off the One — in
    // four-on-the-floor that beat is where kick, bass and comp lock, so it is the beat the
    // whole arrangement is measured against and the wrong place to re-voice OR remove the
    // bass. Same argument `withOctaveJump` makes about the adjacent gesture (it excludes
    // pump styles outright because a pump already leaps the octave twice per beat, so
    // displacing its anchor removes an accent rather than adding one), applied to PLACEMENT
    // instead of to style.
    //
    // Stated once here rather than as a veto downstream. The target is stable for a whole
    // occurrence, so a downstream "not on a One" veto and a selection that can land on one
    // collide catastrophically: every draw of the vetoed gesture in that occurrence degrades
    // to the other gesture and the entire repeat pass loses it. Selecting only from the
    // non-One beats keeps both outcomes legal at every beat this can produce.
    const isTargetBeat = (): boolean => {
        const BEATS_PER_BAR = ctx.beatsPerBar;
        // A one-beat bar has no non-One beat, so the gesture simply doesn't fire there.
        if (BEATS_PER_BAR < 2) {
            return false;
        }
        const OFFBEATS_PER_BAR = BEATS_PER_BAR - 1; // beats 2..N of each bar
        const CANDIDATES = ctx.barsPerPhrase * OFFBEATS_PER_BAR;
        const targetSeed = scrambleHash(
            (ctx.sectionIdHash ^ (ctx.sectionOccurrence * 0x9e3779b1)) | 0,
        );
        // No `Math.min` ceiling guard: `scrambleHash` is mulberry32 and returns [0, 1), so
        // `pick` is in [0, CANDIDATES). Same reason the menu draw below carries none.
        const pick = Math.floor(targetSeed * CANDIDATES);
        const bar = Math.floor(pick / OFFBEATS_PER_BAR);
        const beatInBar = (pick % OFFBEATS_PER_BAR) + 1; // 1..N-1, never 0
        const targetBeatInPhrase = bar * BEATS_PER_BAR + beatInBar;
        return ctx.barInPhrase * BEATS_PER_BAR + intBeat === targetBeatInPhrase;
    };

    // #1276 — the pump's repeat-pass variation, as a weighted draw over a VOCABULARY of
    // gestures rather than a register shift. #1271 made the shift move the whole PAIR
    // (anchor and its octave), which kept the pump intact, but a pair displacement can only
    // ever express one thing — and for one pitch class it cannot express anything at all:
    //
    // - The direction was ALWAYS forced. `canGoUp` needs anchor ≤ 33 and `canGoDown` needs
    //   anchor ≥ 35: mutually exclusive, so `symmetryDirection`'s hash-seeded branch was
    //   structurally unreachable from here and every repeat of a section shifted the same
    //   way. V5 moved exactly like V2; the only per-repeat variation disco got was *which*
    //   beat moved.
    // - Bb (anchor 34) fails BOTH tests: 34 + 24 = 58 > absMax and 34 - 12 = 22 < absMin.
    //   A pair displacement needs a 36-semitone window inside a 34-semitone slot, so 34 was
    //   provably the one anchor that could never vary — and since the anchor no longer
    //   moves with intensity, it failed at every intensity, forever. Bb is a core
    //   disco/horn key, not an exotic corner.
    //
    // Both dissolve once the variation stops being ONLY a register shift and gains outcomes
    // that need no headroom.
    //
    // #1291 retired the pair displacement (`octave`) outright, for the reason #1276 opened
    // with rather than a new one: it was the only outcome whose CHARACTER was decided by KEY
    // instead of by intent. The anchor is a pure function of pitch class, and headroom then
    // forced the direction — anchors 35-39 could only thump DOWN to MIDI 23-27, anchors
    // 28-33 could only leap UP to 52-57 — so one drawn gesture read as a sub-basement thump
    // in one key and as a leap into the comper's register in another, with no key able to
    // produce both. #1276 cut its share to 20%, which lowered the volume of that defect
    // without removing the property. Gone, the gesture is ONE axis and the pump never leaves
    // the [28, 51] comfort range: on the target beat the lift is either voiced as a fifth or
    // the beat is silent.
    //
    // The vocabulary is two gestures:
    //
    //   drop   — the target beat is silent: the downbeat, the "and", and any gallop 16ths
    //            between them. A bassist leaving a beat empty is core disco/funk
    //            vocabulary — it is what makes the next downbeat land — and it needs no
    //            headroom, so it reads identically on Bb and on C. It is a hole, not a
    //            dropout: disco's kick is 4-on-the-floor on both drum paths, so the kit
    //            still marks the spot — see the KNOWN LIMIT note at the `drop`
    //            short-circuit in `getBassNote` for the one meter where that is only
    //            approximately true.
    //   fifth  — the beat keeps its low root and the lift above it becomes the 5th instead
    //            of the octave. `baseRoot` is in [28, 39] because the anchor window above is
    //            exactly an octave, so `baseRoot + 7` is in [35, 46] — inside the comfort
    //            range for every pitch class. No headroom test, no fold, no clamp. It is the
    //            one gesture here that reads the CHORD rather than just the root, and it has
    //            two conditions, not one — see `canFifth`.
    //
    // Invariants this establishes, worth stating rather than rediscovering:
    //
    // - Neither gesture depends on headroom, so both are available in every key on an
    //   ordinary root-position perfect-fifth chord — V2/V3/V4/V5 differ in KIND, not merely
    //   in which beat is affected, on all twelve roots equally. `'none'` is reachable only
    //   through the CHART, never through the key: a chord the `fifth` may not sound over
    //   (altered fifth, or a slash bass), plus — for a drawn `drop` — an arrival.
    // - The draw is over a CONSTANT vocabulary, so a gesture's share never changes with
    //   local availability or with the chord root.
    // - No variation of any kind ever touches a bar's One — that is structural, owned by
    //   `isTargetBeat`'s candidate set rather than by a per-gesture veto. `drop`
    //   additionally never silences a section entrance or a chord entry, and `fifth` never
    //   sounds over a chord whose fifth is altered or whose bass is not the root.
    const variation = (): PumpVariation => {
        // The same gates the generic Imperfect Symmetry wrapper applies. Both callers in
        // `bass-engine.ts` — that wrapper and the drop short-circuit in `getBassNote` — ask
        // this one function rather than re-listing the conditions, so they can never
        // disagree about whether the gesture is live.
        if (!isAnchorStyle || !isRepeatPass || ctx.isSoloistBusy || ctx.intensity < 0.25) {
            return 'none';
        }
        if (!isTargetBeat()) {
            return 'none';
        }

        // --- Availability, evaluated at BEAT level ---
        // A drop silences the whole beat, so its legality is a property of the beat, not of
        // whichever sub-step is being generated. Deciding it per-step would let a beat sound
        // its downbeat and then silence its own "and" — a half-gesture nobody plays.
        //
        // Narrow claim, deliberately: that is an argument about ONE direction, not a general
        // prohibition on half-beat holes. The mirror gesture — keep the "and", silence the
        // downbeat under it — is core disco vocabulary and a legitimate thing to build. It
        // is simply not this gesture, and it would need its own legality terms rather than a
        // per-step reading of these two: a chord entry cannot be answered by an upbeat
        // alone, so `beatOwnsChordEntry` would have to become a stricter test, not a looser
        // one. `subBeatStep` backs the current step up to the beat's first step for each
        // test below.
        const subBeatStep = ctx.stepInMeasure % ctx.stepsPerBeat;

        // "Never silence a bar's One" is NOT a term here. It is guaranteed one level up by
        // `isTargetBeat`, which selects only from the non-One beats — see the argument
        // there. A second veto at this level would be unreachable (and therefore untestable)
        // machinery enforcing a rule the selection already makes structural; worse, before
        // that selection change it was actively harmful, because the target beat is stable
        // for a whole occurrence and any occurrence whose target landed on a One lost every
        // drop it drew. The two terms below survive because they depend on the CHART, not on
        // beat position: a chord entry or a section start can land mid-bar, on a beat the
        // selection is free to pick.
        //
        // why: a section entrance, kept as its own term even though it usually implies a
        // downbeat — a section can begin mid-bar, and a bass that fails to come in on its
        // own entrance reads as a dropout at the loudest possible moment.
        const beatStartWrapped = ctx.wrappedStep - subBeatStep;
        const beatOwnsSectionStart =
            typeof ctx.sectionStartStep === 'number' &&
            ctx.sectionStartStep >= beatStartWrapped &&
            ctx.sectionStartStep < beatStartWrapped + ctx.stepsPerBeat;
        // why: a chord entry. Nothing above the drop gate in `getBassNote` emits for a pump
        // style, so a drop on the first beat of a new chord means NOBODY in the bass lane
        // states the new root — the harmony changes underneath a hole.
        const beatOwnsChordEntry = ctx.stepInChord - subBeatStep <= 0;
        // Deliberately ONE-SIDED: there is no symmetric "beat before a change" window,
        // because a hole on the LAST beat before a chord change or a section boundary is
        // musically good — it's the breath into the new harmony. Only the arrival is
        // protected.
        const canDrop = !beatOwnsSectionStart && !beatOwnsChordEntry;
        // why: a natural 5 over a chord whose fifth is ♭5/♯5 grinds a semitone against the
        // comper on an accented upbeat. See `chordHasPerfectFifth` for why the answer is
        // "pick the other gesture" rather than "play the altered fifth down there instead".
        //
        // why: ...AND the sounding bass has to BE the chord root. A separate condition, not
        // a restatement of the first. `chordHasPerfectFifth` describes intervals above the
        // chord ROOT, but the pump anchors to the SLASH BASS — `bass-engine.ts` hands
        // `bassMidi ?? rootMidi` to `anchorFor` — so under a slash chord `baseRoot + 7` is a
        // fifth above the PEDAL and not the chord's fifth at all. On the commonest shape, a
        // chord over its own third, it is always the chord's MAJOR SEVENTH:
        //
        //     C/E → B      F/A → E      G/B → F#
        //
        // i.e. a natural 7th at MIDI 35-46 on an accented disco upbeat, a semitone under the
        // root the comper is stating. `chordHasPerfectFifth('maj')` is true, so nothing else
        // stops it. (C/G gives a 9th and Am/C a ♭7 — tolerable, but they ride on the same
        // arithmetic, so the test is "is the pedal the root", not a per-interval allowlist.)
        //
        // Deliberately NOT repaired by voicing the chord's TRUE fifth above the pedal
        // instead. That needs folding the real fifth into `(baseRoot, baseRoot + 12]`, a
        // rule for the unison C/G would produce, and an answer for what a dim7's tritone
        // lift should do down here — a design, not a guard. Until then the beat plays the
        // Statement's shape, which is always correct.
        const bassIsChordRoot =
            ctx.chordBassMidi === null ||
            pitchClass(ctx.chordBassMidi) === pitchClass(ctx.chordRootMidi);
        const canFifth = bassIsChordRoot && chordHasPerfectFifth(ctx.chordQuality);

        // why: 0.7 fifth / 0.3 drop — NOT a 50/50 split, because the two gestures are not
        // equals. `fifth` is the mildest and most idiomatic (the pulse and the low root both
        // survive; only the lift is re-voiced), so it carries the gesture most of the time.
        // `drop` is a statement and wants to stay an event. A uniform split is the "50/50
        // for funk" anti-pattern in two-item clothing.
        //
        // #1291 — `drop` HOLDS the 0.3 it had when `octave` still existed, and `fifth` takes
        // the entire retired 0.2. Deliberate, not incidental. Musically, 0.3 is the hole
        // density that was auditioned and approved, and the hole is the one outcome here a
        // listener registers as an EVENT — inheriting the retired weight would have taken it
        // to 0.5 and changed what the repeat pass sounds like, which removing a third gesture
        // does not authorize. Structurally, `fifth` is the near substitute for the octave
        // (the beat still sounds, still off its own low root; only the lift's interval
        // changed) and `drop` is the far one, so if a retired band has to land somewhere it
        // belongs on the nearer gesture.
        //
        // Drawn over the CONSTANT vocabulary — never over a menu re-sized by local
        // availability. Re-dividing the seed range when an outcome is unavailable would
        // silently hand its band to whichever gesture inherited the range, which is how Bb
        // ended up with ~50% more holes than every other key. `scrambleHash` is mulberry32
        // and returns [0, 1), so the two bands below are exhaustive with no dead corner
        // guard needed.
        const menuSeed = scrambleHash(
            (ctx.sectionIdHash ^
                (ctx.sectionOccurrence * 0x7feb352d) ^
                (ctx.phraseIndex * 0x846ca68b)) |
                0,
        );
        const drawn: Exclude<PumpVariation, 'none'> = menuSeed < 0.7 ? 'fifth' : 'drop';

        // --- Resolution ---
        // why: several separate reasons ("altered fifth", "slash bass", "chord entry or
        // section start") produce the same shape of problem — this outcome isn't available
        // here — so they get one resolution rather than an ad-hoc per-reason fallback.
        // #1276's three-rung ladder ordered its fallbacks by musical NEARNESS to the drawn
        // gesture; with a two-item menu there is exactly one alternative, so the ordering
        // rule has nothing left to decide and the machinery collapses to the two lines
        // below.
        //
        // why: those two lines are NOT symmetric, and the asymmetry is the whole rule. An
        // unavailable `drop` falls to `fifth` — both are variations, and the beat should
        // still vary. An unavailable `fifth` falls to `none`, NEVER to `drop`.
        //
        // Never manufacture a hole out of a re-voicing that couldn't happen. `canDrop` is a
        // property of one BEAT (an arrival), so routing `drop` → `fifth` costs at most that
        // beat. `canFifth` is a property of the CHORD, so it holds for as long as that chord
        // sounds: routing `fifth` → `drop` would take the hole density from its auditioned
        // 0.3 to a flat 1.0 for an entire slash-chord or altered-fifth passage — every
        // target beat in it a hole, which is a worse defect than the mis-voiced fifth the
        // guard above exists to prevent. On those chords the pump plays the Statement's
        // shape instead: less variation, not more silence.
        if (drawn === 'drop') {
            return canDrop ? 'drop' : canFifth ? 'fifth' : 'none';
        }
        return canFifth ? 'fifth' : 'none';
    };

    const revoice = (note: number, baseRoot: number): number => {
        if (variation() !== 'fifth') {
            // 'drop' is handled by the short-circuit near the top of `getBassNote` — by the
            // time a note reaches `result()` its beat has already been silenced, so there is
            // nothing here to re-voice. 'none' is the ordinary no-op.
            return note;
        }
        // why: only notes an OCTAVE ABOVE THE ANCHOR become the 5th. The low root is the
        // floor of the groove — moving it would change the gesture's anchor, not its
        // voicing — so notes already at `baseRoot` are left alone. The interval shrinks from
        // an octave to a fifth for one beat, which reads as the bassist voicing the lift
        // differently, not as a register jolt.
        //
        // That is USUALLY the beat's "and" alone, but not always, and the extra case is
        // wanted rather than tolerated: at high complexity the gallop puts 16ths on the 'e'
        // and the 'a', and `bass-styles.ts` gives those `baseRoot + 12` about 30% of the
        // time. They are re-voiced too, so the whole beat's lift is one consistent 5th
        // rather than a 5th on the "and" against octaves either side of it.
        //
        // `baseRoot` is in [28, 39], so `baseRoot + 7` is in [35, 46] — no headroom test, no
        // fold, no clamp, and never outside the comfort range in any key.
        //
        // Safe to emit a natural 5 unconditionally here: `variation()` only returns 'fifth'
        // when `chordHasPerfectFifth` passed, and it routes every altered-fifth chord to the
        // other gesture.
        return note === baseRoot + 12 ? baseRoot + 7 : note;
    };

    return { isAnchorStyle, anchorFor, variation, revoice };
}
