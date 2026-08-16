import type { TimeSignatureConfig } from '../config.js';
import type { Chord, EnsembleState, SoloistQaHang, StepInfo } from '../types.js';
import { getFrequency, getMidi } from '../utils.js';
import type { CompingState } from './comping-state.js';
import {
    getBandPocket,
    type SharedCatch,
    type SoloistQaResponseOwner,
} from './coordination-engine.js';
import { scrambleHash } from './hash-utils.js';
import { chordTargetTones } from './soloist-pitch-engine.js';
import {
    buildResolvingAlteredVoicing,
    getMidiVoicing,
    nearestOtherChordTone,
    recenterVoicing,
    selectSupportiveVoicing,
    shouldPreferGroundedPracticeVoicing,
    shouldReserveBassSpace,
} from './voicing-policy.js';

/**
 * COMPING-EMIT (#1040) — the standard comp lane's hit decision + per-hit
 * emission, extracted verbatim from `getAccompanimentNotes` (accompaniment.ts).
 *
 * `getAccompanimentNotes` remains the entry point: it owns the cadence /
 * intro-outro / subtraction mutes, sustain-CC generation, the anticipation
 * stabs, and the percussive-identity genre lanes (strum-country, power-metal,
 * Neo-Soul, Reggae, Funk), all of which early-return before this seam. What
 * lands here is everything AFTER the lanes: the deterministic cell read, the
 * coordination overlays (yield-to-bass/soloist, harmony interlocking, pulse
 * floor, force-the-One, phrase-end breath), the #766 ring-suppress consume,
 * and the emission block itself (#715 statement/answer economy, #766 ring
 * decision, #707 chord-boundary clamp, the near-block strike stagger).
 *
 * Threading contract (the point of the extraction): `compingState` (the shared
 * comp-memory singleton) and the coordination context arrive as EXPLICIT
 * arguments rather than closures over entry-point locals. The two seeded
 * helpers that must stay bit-identical with the entry point's draw stream —
 * `compDraw` (the per-step loop-stable PRNG) and `rotateVoicingFreqs` (the
 * Imperfect-Symmetry rotation, seeded per (sectionId, occurrence, phrase)) —
 * are threaded as functions so their seed derivations live in ONE place.
 */

export interface CCEvent {
    type: string;
    controller: number;
    value: number;
    timingOffset: number;
}

export interface AccompanimentCoordination {
    soloistBusy?: boolean;
    soloistActive?: boolean;
    soloistMidi?: number;
    // writer: tick-logic soloist producer (digested from the session seed by
    // getQaHangAt — the comper never reads the raw seed)
    // why (#1157): the soloist's question is hanging (or resolving) right now —
    // the comper may CATCH it: one lean echo of the hang tone in the carved
    // breath, and a top-voice re-landing with the soloist's answer.
    soloistQaHang?: SoloistQaHang | null;
    // writer: tick-logic after the Q&A digest. Exactly one Rock responder may
    // own the live window; null means the ordinary comp cell is unchanged.
    soloistQaResponseOwner?: SoloistQaResponseOwner | null;
    // writer: runDrumTick after final snare evaluation. Narrow Rock/Funk pilot
    // plus Rock's section-return marker only — consumers must not treat this as
    // a generic gesture bus.
    sharedCatch?: SharedCatch | null;
    bassHit?: boolean;
    bassMidi?: number;
    kickHit?: boolean;
    snareHit?: boolean;
    // writer: tick-logic chord-preamble (readable by any producer)
    // why: chord anticipation gate reads the upcoming section root so the comper
    // can pre-voice the new chord on the "and-of-4" of the last measure.
    upcomingSectionFirstChord?: any;
    // why: needed to compute the anticipation step offset from the section boundary.
    sectionEnd?: number;
    // why: epic-form-arrangement S3 — published by runDrumTick's chord-data
    // preamble (via getSectionContext). When ≥ 2, the accompaniment rotates one voicing
    // inversion per phrase, seeded by (sectionId, occurrence, barIndex), so
    // Verse 2 sounds audibly different from Verse 1 without changing the chord
    // function. Default 1 matches createCoordinationContext / getSectionContext
    // no-sectionMap fallback so engines can safely gate on `> 1` without an
    // undefined check.
    sectionOccurrence?: number;
    // why: epic-form-arrangement S4 — published by runDrumTick's chord-data
    // preamble. When true, the accompaniment plays a single
    // root-position cadence voicing on beat 1 of the final bar and yields
    // silence on subsequent sub-beats so the chord rings out. Overrides
    // Imperfect Symmetry (the resolution gesture is more important than a
    // repeat-pass inversion rotation).
    isFinalMeasure?: boolean;
    // why: epic-form-arrangement S5 — Intro/Outro instrument layering. Number
    // of bars elapsed since the start of the current Intro section, or `-1`
    // if not in an Intro. The comper rests when `< INTRO_MUTES.chords` so
    // the drum-and-bass duo establishes before the harmonic layer enters.
    introBarsElapsed?: number;
    // why: story #1008 arrangement-by-subtraction — lane keys the seeded
    // instrumentation plan wants to REST this tick ('chords' rests the comp).
    // Optional so partial-mock tests reading `?.includes('chords')` see undefined
    // → full band, and the array guard in the gate treats it as no-op.
    subtractionMutedLanes?: string[];
    // why: epic-form-arrangement S5. Bars REMAINING in the current Outro
    // section (including the current bar), or `-1` if not in an Outro. The
    // comper rests when `<= OUTRO_MUTES.chords` so the outro fades out before
    // the final cadence.
    outroBarsRemaining?: number;
    // why: epic-coordination-consistency S2.a — phrase-end breath gate. When
    // `soloistResting === true` and `soloistNotesInPhrase >= 3`, Jazz/Blues/Funk
    // comping deterministically thins on non-downbeat hits so the chord channel
    // breathes with the soloist's phrase landing. Published by tick-logic.ts
    // (soloist producer block) — both fields are written together every tick.
    soloistResting?: boolean;
    soloistNotesInPhrase?: number;
}

// why (owner audition): the comp must GROOVE ON ITS OWN — imply its pulse without
// borrowing it from the drums. These genres have genuinely sparse cells that float
// when soloed (Jazz [14] / [6,14]), so every bar is guaranteed at least one
// strong-beat (beat 1 or 3) anchor (see the pulse-floor in the overlay). Excluded
// by design:
//   • offbeat-IDIOM genres whose identity is the dodged downbeat (Disco/Ska
//     upstrokes, Hip-Hop behind-the-beat stabs);
//   • the percussive lanes (Funk/Reggae/Neo-Soul) which early-return before the
//     overlay with their own deterministic placement;
//   • Bossa Nova — its partido-alto answering bar deliberately drops the One (a
//     dense 4-hit [2,6,10,14] cell that grooves on its own; with bass, the bass
//     thumb keeps the One). Forcing a downbeat would flatten the 2-bar contour,
//     and unlike Jazz's lone [14] it never sounds pulse-less. The pre-existing
//     ~80% force-One below still applies to it exactly as on main.
const PULSE_ANCHOR_GENRES = new Set(['Jazz', 'Blues', 'Rock', 'Country', 'Acoustic']);

// B2 (#707) — headroom (in steps) the comp leaves before the next chord's onset
// when clamping a voicing to its chord length. ~a 16th-note of silence so the
// voice has released before the change, eliminating the chord-to-chord overlap.
const CHORD_END_RELEASE_MARGIN_STEPS = 0.25;

// why: all altered-dominant qualities share one comping idiom — guide tones (3, b7)
// plus 1–2 altered colors. The resolving-voicing path (buildResolvingAlteredVoicing)
// and the high-intensity shell-reduction path both apply equally to 7alt, 7b9, 7#9,
// 7b13, and 7#11. Gating on '7alt' alone (the original code) left charts that spell
// G7b9 or G7#9 falling through to the generic inversion path with no awareness of
// their resolution-critical altered tones. Source: chords.md P1 #7.
const ALTERED_DOMINANT_QUALITIES = new Set(['7alt', '7b9', '7#9', '7b13', '7#11']);

// why: genres whose comp SUSTAINS (a held/strummed chord that wants to ring and
// breathe), as opposed to the percussive-identity lanes (Funk clav chucks,
// Reggae/Ska skank, Hip-Hop stabs) whose rhythmic restatement IS the genre. Only
// the sustained set gets the per-hit economy below. How the percussive lanes are
// excluded differs, and #1216 corrected this comment because the distinction
// matters: Funk/Reggae/Neo-Soul early-return in getAccompanimentNotes on their
// FEEL, so they never reach the economy at all; Country/Metal early-return too,
// but keyed on their default CHORD STYLE ('strum-country'/'power-metal') — move a
// country chart off that style and it lands in the shared lane, where this set is
// the only thing keeping it out. Ska and Hip-Hop have NO early-return lane
// (contrary to what this comment claimed before) and reach the shared smart lane,
// so for them this set is the sole exclusion. Rock/Disco deliberately excluded
// for now (Disco/Ska are stabs; Rock is a follow-up once the mechanism is
// auditioned on Jazz/Blues).
// Exported for tests/standards/genre-feel-canon-guard.test.ts (#1208) only.
export const SUSTAINED_COMP_GENRES = new Set(['Jazz', 'Blues', 'Bossa Nova', 'Acoustic']);

// why (#766): genres whose comp may RING a hit through the next answer (sustain
// instead of re-attack). A subset of SUSTAINED_COMP_GENRES: Bossa Nova is
// deliberately EXCLUDED — its identity is a steady partido-alto ostinato of
// syncopated attacks, and tying through an interior attack blurs that pulse. This
// mirrors Bossa's exclusion from PHRASE_END_THIN_GENRES (the 2026-05-23 Epic 12 S4
// decision: Bossa's "breath comes from the cells themselves, not a separate gate").
// Jazz/Blues/Acoustic are idiomatic sustain-through comps.
// Exported for tests/standards/genre-feel-canon-guard.test.ts (#1208) only.
export const RING_THROUGH_GENRES = new Set(['Jazz', 'Blues', 'Acoustic']);

/**
 * Per-hit comp economy (#715). A real comper doesn't re-strike the full voicing
 * identically on every hit: the structural/downbeat hit makes the "statement"
 * (full chosen voicing); offbeat hits on the SAME chord answer it with a leaner,
 * MOVING fragment so the bar breathes instead of hammering the same 3-4 notes.
 *
 * Reshapes only what is EMITTED — voice-leading continuity still tracks the full
 * voicing (compingState.lastVoicingMidis) upstream, so the next bar's
 * recenter/rotate cascade is unaffected. Seeded by the per-step `draw` (compDraw)
 * so the variation LOCKS IN loop-to-loop rather than being random jitter.
 *
 * Sustained-comp genres only (see {@link SUSTAINED_COMP_GENRES}); mutates the
 * statement memory on compingState as a side effect.
 */
function applyPerHitEconomy(
    voicingMidis: number[],
    chord: { rootMidi: number; quality: string; intervals?: number[] },
    isStructural: boolean,
    draw: (n: number) => number,
    // #1040: the singleton arrives threaded from emitCompNotes (the same object
    // accompaniment.ts re-exports) instead of via a module import — one explicit path.
    compingState: CompingState,
): number[] {
    const chordKey = `${chord.rootMidi}:${chord.quality}`;
    const isFreshHarmony = chordKey !== compingState.statementChordKey;

    // Statement: the strong-beat / group-start hit, or the first hit on a new
    // chord. Emit the full chosen voicing and remember it as the bar's reference.
    if (isStructural || isFreshHarmony) {
        compingState.statementChordKey = chordKey;
        compingState.statementVoicingMidis = [...voicingMidis];
        return voicingMidis;
    }

    // Answer: an offbeat repeat of the same chord. Reduce to the harmonic
    // essence (guide tones, 2 voices) so it sits UNDER the statement instead of
    // matching it.
    const statement =
        compingState.statementVoicingMidis.length > 0
            ? compingState.statementVoicingMidis
            : voicingMidis;
    let answer = selectSupportiveVoicing(statement, chord, 2);
    if (answer.length < 2) {
        // Triad / already-sparse voicing: keep the top two so the answer still
        // thins relative to the statement.
        const sorted = [...new Set(voicingMidis)].sort((a, b) => a - b);
        answer = sorted.slice(-2);
    }

    // dim / half-dim: the ♭5 is the tone that NAMES the chord (iiø vs ii-7), but
    // selectSupportiveVoicing buckets it as color, so a 2-note reduction can drop
    // it (review #3). Force the diminished core (♭3 + ♭5) from the statement, and
    // skip the inner-voice move (it would just push one of those two off again —
    // passing diminished chords want stability over variety).
    let forcedDiminishedCore = false;
    if (chord.quality === 'dim' || chord.quality === 'halfdim') {
        const core = [3, 6] // ♭3, ♭5
            .map((ic) => {
                const pc = (((chord.rootMidi + ic) % 12) + 12) % 12;
                return statement.find((m) => ((m % 12) + 12) % 12 === pc);
            })
            .filter((m): m is number => m !== undefined);
        if (core.length === 2) {
            answer = [...core].sort((a, b) => a - b);
            forcedDiminishedCore = true;
        }
    }

    // Inner-voice motion: ~55% of answers nudge the top voice to a neighboring
    // guide tone so consecutive answers move instead of stamping an identical
    // shape — the "living" part. The destination rules in nearestOtherChordTone
    // keep this from octave-doubling or collapsing to a rooty fragment.
    if (!forcedDiminishedCore && answer.length > 1 && draw(361) < 0.55) {
        const top = answer[answer.length - 1];
        const rest = answer.slice(0, -1);
        const forbidPCs = new Set(rest.map((m) => ((m % 12) + 12) % 12));
        const moved = nearestOtherChordTone(top, chord, forbidPCs);
        if (moved !== top && !answer.includes(moved)) {
            answer = [...rest, moved].sort((a, b) => a - b);
        }
    }

    return answer;
}

/**
 * Reduce a shared ensemble catch to a compact shell while leaving the full
 * genre-owned voicing in comping memory. Prefer guide/support tones that do not
 * double the active soloist pitch class; a one-note shell is valid when that is
 * the only clean option.
 */
export function selectSharedCatchVoicing(
    voicingMidis: number[],
    chord: Chord,
    soloistMidi: number,
): number[] {
    const unique = [...new Set(voicingMidis)].sort((a, b) => a - b);
    if (unique.length === 0) {
        return [];
    }

    const soloistPc = soloistMidi > 0 ? ((soloistMidi % 12) + 12) % 12 : null;
    const nonDoubling =
        soloistPc === null
            ? unique
            : unique.filter((midi) => ((midi % 12) + 12) % 12 !== soloistPc);
    const pool = nonDoubling.length > 0 ? nonDoubling : unique;
    const targetVoices = Math.min(2, pool.length);
    const supportive = selectSupportiveVoicing(pool, chord, targetVoices);
    const selected = supportive.length >= targetVoices ? supportive : pool.slice(-targetVoices);
    return [...new Set(selected)].sort((a, b) => a - b).slice(-2);
}

/**
 * Per-tick context for the standard comp lane. Everything the moved code read
 * from `getAccompanimentNotes` scope, threaded explicitly (#1040).
 */
interface CompEmitArgs {
    state: EnsembleState;
    chord: Chord;
    step: number;
    stepInChord: number;
    measureStep: number;
    stepInfo: StepInfo;
    coordination: AccompanimentCoordination;
    /** The shared comp-memory singleton (comping-state.ts) — threaded, never re-created. */
    compingState: CompingState;
    ts: TimeSignatureConfig;
    spm: number;
    genre: string;
    chordIndex: number;
    ccEvents: CCEvent[];
    isBeatStart: boolean;
    intBeat: number;
    /** Loop-stable per-step draw — seed derivation stays in getAccompanimentNotes. */
    compDraw: (n: number) => number;
    /** Imperfect-Symmetry rotation (epic-form-arrangement S3) — seed stays with the entry point. */
    rotateVoicingFreqs: (freqs: number[]) => number[];
}

export function emitCompNotes(args: CompEmitArgs): any[] {
    const {
        state,
        chord,
        step,
        stepInChord,
        measureStep,
        stepInfo,
        coordination,
        compingState,
        ts,
        spm,
        genre,
        chordIndex,
        ccEvents,
        isBeatStart,
        intBeat,
        compDraw,
        rotateVoicingFreqs,
    } = args;
    const { playback, arranger, chords, bass, soloist, harmony } = state;
    const intensity = playback.bandIntensity;
    const notes: any[] = [];
    // Pre-#1040 these were entry-point locals in getAccompanimentNotes; the
    // multi-way coordination overlay below is their only consumer, so the
    // derivation moved here with it (same expressions, same coordination object).
    const bassHit = coordination.bassHit || false;
    const soloistActive = coordination.soloistActive || false;

    // --- STANDARD Pattern Logic ---
    let isHit = compingState.currentCell[measureStep % spm] === 1;

    // why: the comp overlay below modulates the (deterministic, phrase-stable)
    // cell with coordination + anchoring decisions. It used raw Math.random,
    // which re-randomized the comp every bar AND every loop — the "unpredictable
    // / off-time" feel, worst in 6/8 where there are only two pulses to lock to.
    // The seed + compDraw are hoisted to the top of this function (shared with
    // the genre lanes); the gates below use offsets 1-10, distinct discriminators
    // so independent decisions don't share a draw.

    // --- NEW: Multi-way Coordination ---
    if (isHit && chords.style === 'smart') {
        // why (#973): on a coincident bass/chord attack, the smart
        // comp yields 40% of the time to partially declutter the low-register
        // attack while retaining the harmonic pulse. That stays below the
        // active-soloist yield below (at least 50%), because a bass hit alone
        // should not hollow out the comp as much as an active lead voice. 0.4
        // is a by-ear balance, not a stronger taste oracle; compDraw(1) keeps
        // the decision deterministic and loop-stable.
        if (bassHit && compDraw(1) < 0.4) {
            isHit = false; // Yield the step entirely
        }

        // 2. Yield to Soloist: If soloist is active, increase the skip probability
        if (soloistActive) {
            const skipProb = 0.5 + intensity * 0.3;
            if (compDraw(2) < skipProb) {
                isHit = false;
            }
        }
    }

    // --- NEW: Conversational Comping ---
    // If the drummer is comping, the piano should sometimes join or answer
    if (
        !isHit &&
        chords.style === 'smart' &&
        (genre === 'Jazz' || genre === 'Bossa Nova' || genre === 'Blues')
    ) {
        if ((coordination.snareHit || coordination.kickHit) && compDraw(3) < 0.4) {
            isHit = true;
        }
    }

    // --- NEW: Harmony Interlocking ---
    // If backgrounds are busy, the main accompanist should find gaps.
    if (isHit && harmony.enabled && harmony.rhythmicMask > 0 && chords.style === 'smart') {
        // Assume rhythmic mask maps up to 16 steps, gracefully wrap for different meters
        const stepInMask = (stepInfo?.mStep ?? measureStep) % 16;
        const hasHarmonyHit = (harmony.rhythmicMask >> stepInMask) & 1;
        if (hasHarmonyHit && compDraw(4) < 0.4 + playback.bandIntensity * 0.3) {
            // Background stab present, suppress piano hit to let it pop
            isHit = false;
        }
    }

    // --- Self-supporting pulse floor (owner audition) ---
    // why: the comp must GROOVE ON ITS OWN, not float because a syncopated cell
    // (Jazz [6,14] / [14]) left no strong beat and the "Force One" backfill below
    // is only an ~80% coin-flip — so ~1 bar in 5 floats with a lone offbeat and,
    // soloed, reads as "the timing is wrong." Guarantee a felt pulse: if the WHOLE
    // bar's cell lands no strong beat (a group-start step: beat 1 or 3 in 4/4),
    // anchor the One deterministically. This only catches the truly pulse-less bar
    // — when the cell already lands beat 3, the One can still be dropped by the
    // coin-flip below (reverse-Charleston stays intact). Pulse genres only (see
    // PULSE_ANCHOR_GENRES — Bossa/Disco/Ska/Hip-Hop excluded by design); the
    // percussive lanes early-return before this overlay.
    //
    // note: `groupStride` matches the engine's own isGroupStart definition
    // (grouping[0]*stepsPerBeat); exact for symmetric meters (4/4, 3/4, 6/8,
    // 12/8). In asymmetric meters (5/4, 7/8) it can scan a non-group-start step
    // and UNDER-fire (skip the floor) — benign: it never forces the One onto a
    // non-pulse position, it just occasionally misses the guarantee.
    if (measureStep === 0 && !isHit && PULSE_ANCHOR_GENRES.has(genre)) {
        const groupStride = Math.max(1, (ts.grouping?.[0] || 1) * ts.stepsPerBeat);
        let barHasStrongAnchor = false;
        for (let s = 0; s < spm; s += groupStride) {
            if (compingState.currentCell[s] === 1) {
                barHasStrongAnchor = true;
                break;
            }
        }
        if (!barHasStrongAnchor) {
            isHit = true; // never leave a soloed bar pulse-less
        }
    }

    // Force hit on "One" if empty — the downbeat is the chord-change landmark.
    // why: anchor it near-deterministically in compound (0.97) so the 6/8 waltz
    // spine is reliably present and the band locks; simple meters keep ~80%.
    // why (#554): Hip Hop is EXEMPT. Its whole idiom is sparse behind-the-beat
    // stabs that dodge the One — backfilling the downbeat here would overwrite
    // the genre's deterministic off-pulse cell and re-create the generic pulse
    // this story removed. (Mirrors how Neo-Soul/Reggae/Funk return early via
    // their own lanes before reaching this overlay; Hip Hop stays in the
    // standard path because its subtractive coordination yields are desirable.)
    if (
        genre !== 'Hip Hop' &&
        measureStep === 0 &&
        !isHit &&
        compDraw(5) < (ts.isCompound ? 0.97 : 0.8)
    ) {
        isHit = true;
    }
    // why: group starts are the felt pulses. In compound (6/8 {0,6}, 12/8
    // {0,6,12,18}) these are the dotted-quarter pulses — anchor them reliably
    // (0.95) so the waltz locks onto a stable pulse rather than a coin-flip;
    // the cell's identity then expresses through the ornament steps. Simple
    // meters keep the lighter intensity-scaled add.
    // why (#554): Hip Hop is EXEMPT here too — group starts (the felt pulses,
    // incl. the One) are exactly what the sparse stab idiom avoids; anchoring
    // them would reintroduce the downbeat/pulse the cell deliberately skips.
    if (genre !== 'Hip Hop' && stepInfo?.isGroupStart && !isHit) {
        const groupAddProb = ts.isCompound ? 0.95 : 0.4 + intensity * 0.4;
        if (compDraw(6) < groupAddProb) {
            isHit = true;
        }
    }

    if (genre === 'Jazz' || genre === 'Bossa Nova' || genre === 'Blues') {
        // Conversational Displacement for Jazz/Blues
        // why: migrated from soloist.session.phrasing.busySteps (session-state
        // direct read) to coordination.soloistBusy (coordination-context field)
        // so the predicate is consistent with the rest of the comp engine and
        // doesn't bypass the coordination layer. (S5 micro-cleanup.)
        // note: soloistBusy is a superset of the old busySteps>0 test — it also
        // fires on short sub-step soloist notes (durationSteps < 1.0), so this
        // slightly widens the displacement trigger. Musically intended.
        if (
            isHit &&
            coordination?.soloistBusy === true &&
            playback.complexity > 0.6 &&
            compDraw(7) < 0.3
        ) {
            isHit = false;
        }
    }

    // --- Phrase-End Breath (epic-coordination-consistency S2.a) ---
    // why: chords.md P2 #16 — when the soloist completes a phrase of ≥3 notes
    // and goes into a rest, the comper should "breathe" with the soloist (a
    // brief half-bar silence before the next chord change). Real jazz/blues/funk
    // compers do this without thinking — they hear the phrase land and pull back
    // so the listener registers the resolution. Without it, the chord channel
    // keeps chattering through the soloist's exhale and the conversation feels
    // one-sided.
    //
    // Genre gate: Jazz / Blues / Funk only. These are the call-and-response
    // idioms where a comping rest on phrase-end is canonical. Reggae just shipped
    // an organ-bubble (S1.b) on the harmony channel that intentionally fills the
    // offbeats; thinning the chord-channel skank would compound silence with
    // bubble-driven activity and lose the riddim. Bossa already has its own
    // partido-alto idiom (S5.c upcoming) — leave it for that story to design.
    //
    // Definition of "phrase-end": coordination.soloistResting === true AND
    // soloistNotesInPhrase >= 3. The 3-note floor avoids treating a one-off
    // pickup or single stab as a "phrase ending" — three is the minimum that
    // reads as a phrase to a listener (statement + response, or short motif).
    // We don't latch on a single tick — every tick that meets the predicate
    // contributes to the breath, so the silence extends as long as the soloist
    // keeps resting (the natural "exhale" duration).
    //
    // Final-stage multiplier (feedback_weight_tuning_multiplier_placement):
    // applied AFTER the "Force hit on One" and "Group start" boosts above so
    // those biases can't sneak the comp back into a phrase-end silence on a
    // non-downbeat. We preserve `measureStep === 0` (the downbeat IS the
    // chord-change landmark — silencing it would lose the new chord) and use
    // a deterministic gate from (barIndex, intBeat) so loop comparisons stay
    // coherent. ~65% thin rate on eligible non-downbeat hits is a "noticeable
    // breath" without going completely silent.
    // why: Bossa Nova evaluated 2026-05-23 (Epic 12 S4, FOLLOWUPS §D) and
    // INTENTIONALLY excluded. The partido-alto bank (Epic 9 S5.c) already
    // encodes soloist-busy thinning via the sparse cell [0, 10, 14] plus the
    // `sparse`-vibe drop. Stacking a post-phrase 65% thin on top compounds
    // with those sparse paths and produces holes that contradict Bossa's
    // continuous-comp identity. The genre's tradition is a steady partido-alto
    // ostinato; "breath" comes from the cells themselves, not from a separate
    // phrase-end gate. If a future listening session wants a post-phrase
    // Bossa rest, it should narrow the cell selection (e.g. force `compFloor`
    // for one beat) rather than re-add Bossa here.
    const PHRASE_END_THIN_GENRES = new Set(['Jazz', 'Blues', 'Funk']);
    if (
        isHit &&
        measureStep !== 0 &&
        PHRASE_END_THIN_GENRES.has(genre) &&
        coordination?.soloistResting === true &&
        (coordination?.soloistNotesInPhrase ?? 0) >= 3
    ) {
        // why: deterministic gate keyed off (barIndex, intBeat) so the breath
        // is loop-coherent and critique tests measure a stable distribution
        // rather than seed-of-the-day jitter. Threshold 0.65 (65% thin):
        // values 0,1,2,3,4 of (h % 10) hit (50%); add 0.15 more by including
        // h % 20 < 13 (65%). Tuned to produce a clearly audible thinning —
        // the audit-doc sketch is "brief half-bar silence" so ~2/3 thin on
        // each eligible step compounds into substantial silence across a
        // multi-tick phrase-end window.
        const barIndex = Math.floor(step / spm);
        const phraseEndHash = (barIndex * 7 + intBeat * 11 + (measureStep % spm)) | 0;
        if (phraseEndHash % 20 < 13) {
            isHit = false;
        }
    }

    // Pad Style Override
    if (chords.style === 'pad') {
        isHit = stepInChord === 0;
    }

    // Arpeggiator style ('arp'): one pluck per beat (the voicing + ring are set
    // in the matching block below). A first-class chord style — Acoustic routes
    // here via smart-genres `chord: 'arp'`. Replaces the old genre+intensity
    // hardcode that left this unreached in production.
    if (chords.style === 'arp') {
        isHit = isBeatStart;
    }

    // #766 restate-vs-ring — a prior statement decided to sustain THROUGH this hit
    // (see the ring block near the emission site): suppress the re-attack so the
    // held voicing keeps ringing instead of re-striking. The marker is consumed on
    // its target step either way, so a stale ring whose chord changed just clears.
    if (compingState.ringSuppressStep === step) {
        if (
            isHit &&
            RING_THROUGH_GENRES.has(genre) &&
            compingState.ringSuppressChordKey === `${chord.rootMidi}:${chord.quality}`
        ) {
            isHit = false; // the statement is still sounding — no gap
        }
        compingState.ringSuppressStep = -1;
        compingState.ringSuppressChordKey = null;
    }

    // --- #994: Rock comper joins the drummer's seeded snare catch ---
    // This force happens after ordinary density/yield/breath decisions so the
    // shared hit is one deliberate exception, not another probability layered
    // onto the comp cell. Final cadence, intro/outro, subtraction and drop
    // precedence already returned before this standard emitter is reached.
    const sharedCatch = genre === 'Rock' ? coordination.sharedCatch : null;
    const sharedCatchActive =
        sharedCatch?.type === 'snare-stab' && chords.style !== 'pad' && chords.style !== 'arp';
    if (sharedCatchActive) {
        isHit = true; // insert into silence or re-voice the one existing attack
    }

    // --- #1157: the comper CATCHES the soloist's question ---
    // #1009 carves a real breath after every question cadence — the design's
    // "implied other voice" gap. When a window is live (soloistQaHang, digested
    // from the seed by the soloist producer), the comper may answer it: ONE lean
    // echo of the hang tone placed a beat into the ring, and a top-voice
    // re-landing during the answer bar (the voicing block below does both). The
    // echo is a forced attack, deliberately overriding the phrase-end breath
    // above — the comper pulls back with the soloist, then places one nod into
    // the silence. Ring genres only: the echo must sustain into the resolution
    // to read as an answer rather than a stray stab. Participation is a
    // deterministic per-question-occurrence draw that warms with the session
    // (mirroring loopLift's entrance ramp): the band talks more once it has
    // settled in. Stateless by design — a pure function of (seed, step,
    // loopCount), no carryover — so live playback and MIDI export render the
    // same gesture from the same inputs. (One shared caveat, common to every
    // loop-keyed feature: `currentLoopCount` reaches the live worker via the
    // LOOP_BOUNDARY delta while buffers fill a lookahead ahead, so a question
    // whose echo sits right at an arrangement-lap boundary can draw against an
    // adjacent loop tier live vs export. Boundary windows only.)
    const qaHang = coordination.soloistQaHang;
    let qaEcho = false;
    let rockQaHandoffEcho = false;
    let qaResolution = false;
    // Style gate: 'smart' AND 'jazz' both land in this standard emit lane —
    // Smart Genres sets style 'jazz' (not 'smart') for Jazz/Blues (see the
    // Style Override in accompaniment.ts), so gating on 'smart' alone would
    // leave the gesture dead on the production genre-picker path (review P0).
    // 'arp'/'pad' stay excluded: they own their own isHit contracts above and
    // a forced attack would break the pluck-per-beat / single-strike idioms.
    // (Acoustic therefore only gets the catch under manually-picked Smart
    // Comping — its genre default is 'arp'.) Bossa also carries style 'jazz'
    // but keeps genre 'Bossa Nova' through the override, so the RING gate
    // still excludes it.
    const qaStyleLive = chords.style === 'smart' || chords.style === 'jazz';
    if (
        qaHang &&
        genre === 'Rock' &&
        coordination.soloistQaResponseOwner === 'chords' &&
        qaStyleLive &&
        step === qaHang.echoStep
    ) {
        // #997: the owner assignment already made the participation decision.
        // Reuse the established Q&A delay and lean voicing below, but emit one
        // short answer rather than the Jazz/Blues ring-and-resolution pair.
        qaEcho = true;
        rockQaHandoffEcho = true;
        isHit = true;
    } else if (qaHang && RING_THROUGH_GENRES.has(genre) && qaStyleLive) {
        const qaLoop = Math.min(Math.max(playback.currentLoopCount ?? 0, 0), 3);
        // ~25% of questions answered on loop 0 → ~55% by loop 3+.
        const answerRate = 0.25 + 0.1 * qaLoop;
        // Keyed on the hang's absolute step XOR the seed's salt: every
        // occurrence of every question draws independently and reproducibly
        // WITHIN a session, but a fresh session seed reshuffles which
        // questions get answered — without the salt the draw is chart-frozen
        // (the same questions answered or permanently ignored on every
        // pass through a chart, the dead-ceiling trap; review P1).
        if (scrambleHash((qaHang.hangStartStep * 13 + 41) ^ qaHang.drawSalt) < answerRate) {
            if (step === qaHang.echoStep) {
                qaEcho = true;
                isHit = true; // insert if the cell was silent, re-voice if not
            } else if (
                isHit &&
                step >= qaHang.resolutionBarStart &&
                step < qaHang.resolutionBarEnd
            ) {
                qaResolution = true;
            }
        }
    }

    if (isHit) {
        const isDownbeat = stepInfo ? stepInfo.isBeatStart : measureStep % ts.stepsPerBeat === 0;
        const isStructural = stepInfo
            ? stepInfo.isGroupStart
            : measureStep % (ts.grouping[0] * ts.stepsPerBeat) === 0;
        const intensity = playback.bandIntensity;
        const reserveBassSpace = shouldReserveBassSpace(state);
        const bassMidi = coordination.bassMidi || getMidi(bass.lastFreq || 0) || 0;
        const previousVoicingMidis = compingState.lastVoicingMidis;
        const nextChord =
            chordIndex >= 0 && arranger.progression
                ? arranger.progression[chordIndex + 1] || null
                : null;
        const groundingRequired = shouldPreferGroundedPracticeVoicing(state, chord.quality, genre);
        const shouldPreferGuideToneReduction =
            chords.style === 'smart' &&
            reserveBassSpace &&
            !groundingRequired &&
            chord.is7th &&
            (genre === 'Jazz' || genre === 'Blues' || genre === 'Bossa Nova');

        // --- Holistic Pocket Implementation ---
        // #1005: the comp leans by the single per-genre band pocket (getBandPocket),
        // so chords + bass + harmony + soloist all lock to the same pocket relative
        // to the drums instead of each carrying its own feel constant. Pre-#1005 this
        // was a comp-specific fixed +4 ms; folding it into the shared per-genre
        // palette is the point of #1005 (see docs/design/timing-model.md, tier 2).
        // The intensity-tightening pushes (#713) stay layered on top — that's the
        // comp's own character the owner heard and liked.
        // #1064: the current section's label keys the energy modulation of the lean.
        let timingOffset = getBandPocket(genre, chord?.sectionLabel ?? null);

        if (chords.style === 'smart') {
            // #713: the smart-path pushes were flat (±25/10/20ms) and ignored
            // intensity, so the comp wandered the SAME amount at full energy as at
            // a ballad — it never "locked in" as the band drove. Scale them by the
            // SAME intensity elasticity the pocket uses (1.1 - elasticity): ~0.7×
            // at low intensity (loose, expressive) down to ~0.1× at intensity 1
            // (tight, locked to the grid). B3.
            const elasticity = 0.4 + intensity * 0.6; // 0.4 (ballad) → 1.0 (full energy)
            const pushScale = 1.1 - elasticity; // 0.7 (loose) → 0.1 (tight)
            const pushProb = 0.15 + intensity * 0.2;
            if (!isDownbeat && compDraw(8) < pushProb) {
                timingOffset -= 0.025 * pushScale;
            }
            if (compDraw(9) < playback.intent.anticipation) {
                timingOffset -= 0.01 * pushScale;
            }
            if (compDraw(10) < playback.intent.layBack) {
                timingOffset += 0.02 * pushScale;
            }
        }

        const intentHits = compingState.currentCell.reduce((sum, value) => sum + value, 0);
        let durationSteps = ts.stepsPerBeat * 2; // Default 2 beats
        if (genre === 'Funk') {
            // Precise Funk durations for testing compatibility
            durationSteps = intensity > 0.7 ? 0.35 : intensity > 0.4 ? 0.4 : 0.8;
        } else if (genre === 'Disco' || genre === 'Ska') {
            durationSteps = ts.stepsPerBeat * 0.25;
        } else if (genre === 'Jazz') {
            durationSteps = isStructural ? ts.stepsPerBeat * 0.9 : ts.stepsPerBeat * 0.75;
        } else if (genre === 'Blues') {
            durationSteps =
                intentHits >= Math.max(4, ts.beats)
                    ? ts.stepsPerBeat * 0.85
                    : intentHits >= 3
                      ? ts.stepsPerBeat * 1
                      : ts.stepsPerBeat * 1.25;
        } else if (genre === 'Acoustic') {
            durationSteps = ts.stepsPerBeat * 2.5;
        } else if (genre === 'Rock') {
            durationSteps =
                intentHits >= Math.max(4, ts.beats)
                    ? ts.stepsPerBeat * 0.85
                    : intentHits >= 3
                      ? ts.stepsPerBeat * 1
                      : ts.stepsPerBeat * 1.25;
        } else if (genre === 'Bossa Nova') {
            durationSteps = ts.stepsPerBeat * 1.5;
        }

        if (chords.style === 'pad') {
            durationSteps = chord.beats * ts.stepsPerBeat;
        }

        durationSteps = Math.max(1, Math.round(durationSteps));

        // Expanded dynamic range: 0.5 + intensity * 0.9 (Range: 0.5 to 1.4)
        const intensityFactor = 0.5 + intensity * 0.9;
        let velocity = (isStructural ? 0.6 : isDownbeat ? 0.5 : 0.35) * intensityFactor;

        // Tighten up durations at high intensity/tempo
        if (intensity > 0.7) {
            durationSteps *= 0.8;
        }
        if (genre === 'Ska' || chords.style === 'ska-upstroke') {
            durationSteps = Math.min(durationSteps, 1.0); // Ensure Ska upstrokes stay tight
        }

        let voicing = [...chord.freqs];
        const complexity = playback.complexity;
        const shouldUseResolvingAlteredVoicing =
            genre === 'Jazz' &&
            ALTERED_DOMINANT_QUALITIES.has(chord.quality) &&
            chords.style !== 'pad';

        // --- NEW: Harmonic Tension Scaling ---
        // At high complexity, favor 9ths, 11ths, and 13ths (extensions)
        if (
            complexity > 0.5 &&
            chord.intervals &&
            chord.intervals.length > 3 &&
            !shouldUseResolvingAlteredVoicing
        ) {
            // If we have extensions beyond the triad/7th, prioritize them in the voicing
            const extensions = chord.intervals.filter(
                (i: number) => i !== 0 && i !== 3 && i !== 4 && i !== 7 && i !== 10 && i !== 11,
            );
            if (extensions.length > 0 && compDraw(39) < (complexity - 0.4) * 1.5) {
                // Shift voicing to include more color tones (deterministic, loop-stable)
                voicing = voicing.map((f, idx) => {
                    if (idx > 1 && compDraw(260 + idx) < 0.5) {
                        const ext = extensions[Math.floor(compDraw(280 + idx) * extensions.length)];
                        return getFrequency(
                            chord.rootMidi + ext + (compDraw(300 + idx) < 0.5 ? 12 : 0),
                        );
                    }
                    return f;
                });
            }
        }

        if (shouldUseResolvingAlteredVoicing) {
            const minMidi = reserveBassSpace && bassMidi ? bassMidi + 13 : 52;
            const resolvedMidis = buildResolvingAlteredVoicing(
                chord,
                previousVoicingMidis,
                nextChord,
                minMidi,
                84,
                intensity,
                complexity,
            );
            if (resolvedMidis.length > 0) {
                voicing = resolvedMidis.map((midi) => getFrequency(midi));
            }
        }

        // --- Arpeggiation / Fingerpicking ('arp' chord style) ---
        // One pluck per beat (isHit forced to isBeatStart above), each ringing
        // to the chord boundary for a sustain-pedal bloom.
        if (chords.style === 'arp') {
            // 4 hits per measure (1 per beat) — the fingerpick critique gate.
            // Voicing indices per beat; wraps via `% voicing.length`, so on a bare
            // triad `3` folds back to the root (index 0) and on a 4+-note colored
            // voicing it reaches the top extension.
            const pattern = [0, 2, 1, 3];
            const pickIdx = pattern[intBeat % pattern.length];
            const noteIdx = pickIdx % voicing.length;
            voicing = [voicing[noteIdx]];

            // If it's the "One", add the root for foundation
            if (measureStep === 0) {
                voicing.push(chord.freqs[0]);
            }
            // Sustain-pedal feel: ring each pluck out toward the chord span so the
            // notes accumulate into the full voicing within the chord (the Piano
            // voice handles 64 overlapping voices cleanly). The B2 ceiling below
            // (#707) trims this to the chord end minus a release margin — that's
            // the "pedal lift" at the harmony change, so the ring stays inside one
            // chord and successive chords never blur.
            durationSteps = chord.beats * ts.stepsPerBeat;
        }

        // --- Frequency Slotting & Soloist Pocket ---
        const lastSolFreq = soloist.audio.lastFreq || 0;
        const soloistMidi = soloist.enabled ? getMidi(lastSolFreq) : 0;
        const useClarity = (soloistMidi || 0) > 72;
        if (chords.style === 'smart') {
            // Jazz Shell Lesson: If things are hot and harmony is complex, stick to shells (3 & 7)
            // why: all altered-dominant qualities (7alt, 7b9, 7#9, 7b13, 7#11) plus halfdim/dim
            // are equally tense — they all want guide-tone-only shells at high intensity to avoid
            // muddying the altered colors. Sourced from ALTERED_DOMINANT_QUALITIES set.
            const isComplex =
                ALTERED_DOMINANT_QUALITIES.has(chord.quality) ||
                chord.quality === 'halfdim' ||
                chord.quality === 'dim';

            // LOW INTENSITY: Gentle Shells (2 notes)
            if (groundingRequired && voicing.length > 4) {
                const groundedMidis = selectSupportiveVoicing(getMidiVoicing(voicing), chord, 4);
                if (groundedMidis.length >= 3) {
                    voicing = groundedMidis.map((midi) => getFrequency(midi));
                }
            }
            if (!groundingRequired && intensity < 0.4 && genre !== 'Acoustic') {
                if (voicing.length > 2) {
                    if (shouldPreferGuideToneReduction) {
                        const shellMidis = selectSupportiveVoicing(
                            getMidiVoicing(voicing),
                            chord,
                            2,
                        );
                        if (shellMidis.length >= 2) {
                            voicing = shellMidis.map((midi) => getFrequency(midi));
                        } else {
                            voicing = voicing.slice(0, 2);
                        }
                    } else {
                        voicing = voicing.slice(0, 2);
                    }
                }
            }
            // HIGH INTENSITY & COMPLEX: Shells to avoid mud
            else if (!groundingRequired && genre === 'Jazz' && intensity > 0.6 && isComplex) {
                // Find 3rd and 7th
                const third = chord.intervals.find((i: number) => i === 3 || i === 4);
                const seventh = chord.intervals.find(
                    (i: number) => i === 10 || i === 11 || i === 9 || i === 6,
                ); // 6 for dim
                if (third !== undefined && seventh !== undefined) {
                    voicing = [
                        getFrequency(chord.rootMidi + third),
                        getFrequency(chord.rootMidi + seventh),
                    ];
                }
            }
            // DEFAULT JAZZ: Favor compact guide-tone / color voicings above the bass lane.
            else if (!groundingRequired && genre === 'Jazz' && reserveBassSpace) {
                const shouldLeanToShells =
                    !isStructural && (useClarity || intensity > 0.58 || voicing.length > 4);
                const targetJazzVoices = shouldLeanToShells ? 2 : 3;
                const jazzMidis = selectSupportiveVoicing(
                    getMidiVoicing(voicing),
                    chord,
                    targetJazzVoices,
                );
                if (jazzMidis.length >= targetJazzVoices) {
                    voicing = jazzMidis.map((midi) => getFrequency(midi));
                }
            }

            // Soloist Pocket: Reduce density or drop velocity when soloist is high
            else if (!groundingRequired && useClarity && compDraw(35) < 0.7) {
                if (voicing.length > 3) {
                    voicing = voicing.slice(0, 3);
                }
            }

            if (!groundingRequired && !isStructural && voicing.length > 3 && compDraw(36) < 0.5) {
                voicing = voicing.slice(0, 3);
            }

            // HIGH INTENSITY: Add Octave sparkle
            if (intensity > 0.75 && voicing.length > 0 && compDraw(37) < 0.6) {
                // Double the highest note up an octave
                const sorted = [...voicing].sort((a, b) => (getMidi(a) || 0) - (getMidi(b) || 0));
                const topMidi = getMidi(sorted[sorted.length - 1]);
                if (topMidi && topMidi < 84) {
                    // Don't go too high
                    voicing.push(getFrequency(topMidi + 12));
                }
            }

            // Frequency Slotting: Avoid masking the bass
            if (reserveBassSpace && voicing.length > 0) {
                // Ensure sorted for predictable slotting
                voicing.sort((a, b) => (getMidi(a) || 0) - (getMidi(b) || 0));

                const lowestMidi = getMidi(voicing[0]) || 0;

                // --- Dynamic Slotting ---
                // If the bass is high, we MUST shift up.
                if (lowestMidi <= bassMidi + 12) {
                    voicing = voicing.map((f) => {
                        const m = getMidi(f);
                        if (m && m <= bassMidi + 12) {
                            return getFrequency(m + 12);
                        }
                        return f;
                    });
                    voicing.sort((a, b) => (getMidi(a) || 0) - (getMidi(b) || 0));
                }

                // If soloist is high, drop the highest note to leave air
                const solMidi = coordination.soloistMidi || 0;
                if (solMidi > 72 && voicing.length > 2) {
                    voicing.pop(); // Drop the top
                }

                if (voicing.length > 3) {
                    if (shouldPreferGuideToneReduction) {
                        const compactMidis = selectSupportiveVoicing(
                            getMidiVoicing(voicing),
                            chord,
                            3,
                        );
                        if (compactMidis.length >= 3) {
                            voicing = compactMidis.map((midi) => getFrequency(midi));
                        } else {
                            voicing.shift();
                        }
                    } else {
                        voicing.shift(); // Drop the lowest note (often the root) to leave space for bass
                    }
                    if ((chord.is7th || chord.quality.includes('9')) && voicing.length > 3) {
                        const rootPC = chord.rootMidi % 12;
                        const fifthPC = (rootPC + 7) % 12;
                        voicing = voicing.filter((f: number) => (getMidi(f) || 0) % 12 !== fifthPC);
                    }
                }
            }
        }

        // why (#733): no maj7-only "open voicing" splay. The old gesture raised
        // the middle voice an octave on maj7 ONLY, so the tonic of a ii-V-I
        // suddenly spread to ~15 st while the surrounding m7b5/dominant shells
        // stayed ~7-9 st — a per-chord hand-width discontinuity no pianist plays
        // (confirmed by ear on Stella, m7). The maj7 now voices with the same
        // compactness as its neighbors; a deliberate, section-CONSISTENT open
        // color can return later, but not as a tonic-only surprise.

        if (genre === 'Jazz' && previousVoicingMidis.length > 0) {
            const minMidi = reserveBassSpace && bassMidi ? bassMidi + 13 : 52;
            const alignedMidis = recenterVoicing(
                getMidiVoicing(voicing),
                previousVoicingMidis,
                minMidi,
                84,
            );
            if (alignedMidis.length > 0) {
                voicing = alignedMidis.map((midi) => getFrequency(midi));
            }
        }

        // why: Imperfect-Symmetry rotation BEFORE caching to
        // compingState.lastVoicingMidis, so the recenterVoicing cascade picks
        // up the rotated voicing on subsequent bars (the "pianist commits to
        // the inversion for the rest of the phrase" gesture). See bass S2's
        // prevMidi-bias cascade for the same musical framing.
        voicing = rotateVoicingFreqs(voicing);

        const finalVoicingMidis = getMidiVoicing(voicing);
        if (finalVoicingMidis.length > 0) {
            compingState.lastVoicingMidis = [...finalVoicingMidis];
        }

        if (sharedCatchActive && sharedCatch) {
            const catchMidis = selectSharedCatchVoicing(
                finalVoicingMidis,
                chord,
                coordination.soloistMidi || 0,
            );
            if (catchMidis.length > 0) {
                voicing = catchMidis.map((midi) => getFrequency(midi));
            }
            // One sixteenth-ish stab: enough body to read with the snare, short
            // enough not to become a second comp phrase under the lead.
            durationSteps = Math.min(durationSteps, Math.max(0.5, ts.stepsPerBeat * 0.25));
            const catchVelocity =
                0.38 * intensityFactor * Math.min(1.2, Math.max(0.6, sharedCatch.velocity));
            velocity = Math.min(0.72, Math.max(0.28, catchVelocity));
        }

        // #715 — per-hit comp economy: keep the full voicing for voice-leading
        // memory (set above), but EMIT a statement on structural hits and a
        // leaner, moving answer on offbeat repeats of the same chord, so the bar
        // breathes instead of re-striking the same notes. Sustained-comp genres
        // only; the percussive-identity lanes early-return well before here.
        // `!qaEcho` (#1157): the echo replaces the voicing wholesale below —
        // running the economy first would pollute the statement memory with a
        // statement that never sounds, and the ring decision could suppress a
        // future real hit on behalf of a 2-voice interjection.
        if (SUSTAINED_COMP_GENRES.has(genre) && finalVoicingMidis.length > 0 && !qaEcho) {
            // Capture the statement key BEFORE the economy updates it, so we can
            // tell whether THIS hit is the statement (the ring is decided on
            // statements only — see below).
            const priorStatementKey = compingState.statementChordKey;
            const emitMidis = applyPerHitEconomy(
                finalVoicingMidis,
                chord,
                isStructural,
                compDraw,
                compingState,
            );
            if (emitMidis.length > 0) {
                voicing = emitMidis.map((midi) => getFrequency(midi));
            }

            // #766 restate-vs-ring — the most spacious human breath: instead of
            // re-attacking the next offbeat answer, sometimes let THIS statement
            // ring THROUGH it. We can't lengthen a note already emitted on a prior
            // per-step call, so the decision is made HERE, on the statement: extend
            // this voicing's duration to cover the next answer hit and mark that
            // step so its call suppresses the re-attack (the chord is still sounding,
            // so no gap). Ring is the EXCEPTION (~1 in 4 statements) — a limp comp
            // is worse than a busy one (#715/#766 note). The #707 clamp below caps
            // the extension, so a ring can never overrun the chord boundary.
            const ringChordKey = `${chord.rootMidi}:${chord.quality}`;
            const emittedStatement = isStructural || ringChordKey !== priorStatementKey;
            // Intensity gate: ring is a breath WITHIN an active comp — when the band
            // is driving, letting a chord sustain instead of re-striking reads as
            // relaxed confidence. At low intensity the comp is already spacious
            // (sparse plucks), so dropping a hit there just thins it toward limp —
            // the exact failure #766 warns against. Only ring at moderate+ intensity.
            if (
                RING_THROUGH_GENRES.has(genre) &&
                emittedStatement &&
                intensity >= 0.4 &&
                compDraw(377) < 0.25
            ) {
                const spb = ts.stepsPerBeat;
                const groupStride = (ts.grouping?.[0] || ts.beats) * spb;
                const isArp = chords.style === 'arp';
                // Steps left in THIS chord — never scan into the next chord (whose
                // downbeat must not be suppressed).
                const stepsToEnd = chord.beats * spb - stepInChord;
                const mNow = ((measureStep % spm) + spm) % spm;
                // Find the next hit to ring through (suppressOff) and the one after
                // it (releaseOff), so the statement releases as the next REAL hit
                // lands rather than ringing the whole chord out.
                let suppressOff = -1;
                let releaseOff = -1;
                for (let d = 1; d < stepsToEnd; d++) {
                    const ms = (mNow + d) % spm;
                    const hitAhead = isArp ? ms % spb === 0 : compingState.currentCell[ms] === 1;
                    if (!hitAhead) {
                        continue;
                    }
                    if (suppressOff < 0) {
                        // Preserve the pulse: in the block-comp genres never ring
                        // through a strong-beat (group-start) hit — only an offbeat
                        // answer. Arp is pluck-per-beat, so a held pluck through the
                        // next beat IS the idiom there; allow it.
                        if (!isArp && ms % groupStride === 0) {
                            break;
                        }
                        suppressOff = d;
                    } else {
                        releaseOff = d;
                        break;
                    }
                }
                if (suppressOff > 0) {
                    // Ring to the next real hit (or the chord end if it's the last),
                    // plus a hair of overlap so there's no micro-gap before the
                    // re-attack. #707 clamps this to the chord boundary next.
                    const ringSteps = (releaseOff > 0 ? releaseOff : stepsToEnd) + 0.5;
                    durationSteps = Math.max(durationSteps, ringSteps);
                    compingState.ringSuppressStep = step + suppressOff;
                    compingState.ringSuppressChordKey = ringChordKey;
                }
            }
        }

        // --- #1157: Q&A response voicing (see the catch block above) ---
        if (qaEcho && qaHang) {
            // ECHO — catch the hang. A lean two-voice fragment: the question's
            // own tension PC on top, folded near the comp's current ceiling so
            // it sits UNDER the soloist's sounding hang, with one guide tone
            // below for harmonic footing. The tension against the chord is the
            // point — the comper agrees the question is open — but the voicing
            // must not turn agreement into mud: the support sits 3-11 semitones
            // under the top (nearest a 5th — the classic shell distance), never
            // a semitone/minor-9th rub (wrong outside dom♭9 contexts), never a
            // unison/octave double. No support in range → a single-tone echo.
            const refTop = finalVoicingMidis.length > 0 ? Math.max(...finalVoicingMidis) : 76;
            const pcAtOrBelow = refTop - (((refTop % 12) - qaHang.pc + 12) % 12);
            let echoTop = refTop - pcAtOrBelow <= 6 ? pcAtOrBelow : pcAtOrBelow + 12;
            while (echoTop > 84) {
                echoTop -= 12;
            }
            while (echoTop < 60) {
                echoTop += 12;
            }
            // Don't land in exact unison with the soloist's held hang — a
            // sustained piano/lead unison phases; an octave below reads as the
            // catch. (soloistMidi is the last emitted lead note — during the
            // hang, that IS the question tone.)
            const heldSoloMidi = coordination.soloistMidi || 0;
            if (heldSoloMidi > 0 && echoTop === heldSoloMidi && echoTop - 12 >= 52) {
                echoTop -= 12;
            }
            const { guides, pillars } = chordTargetTones(chord.rootMidi, chord.quality);
            let support = -1;
            let bestSpread = Number.POSITIVE_INFINITY;
            for (const pc of [...guides, ...pillars]) {
                const cand = echoTop - (((((echoTop % 12) - pc) % 12) + 12) % 12);
                const dist = echoTop - cand;
                if (dist < 3 || dist > 11 || cand < 52) {
                    continue;
                }
                const spread = Math.abs(dist - 7);
                if (spread < bestSpread) {
                    bestSpread = spread;
                    support = cand;
                }
            }
            voicing =
                support > 0
                    ? [getFrequency(support), getFrequency(echoTop)]
                    : [getFrequency(echoTop)];
            // Lean interjection: the offbeat tier regardless of where the echo
            // landed metrically — a nod under the band, not a new statement.
            velocity = Math.min(velocity, 0.35 * intensityFactor);
            // Ring TOWARD the soloist's answer. In practice the #707 clamp
            // below usually releases the echo at the chord boundary just
            // before the answer lands (no pedal across the change — correct);
            // the connection the listener hears is the sustained decay into
            // the re-entry, not a literal overlap.
            durationSteps = rockQaHandoffEcho
                ? Math.min(durationSteps, Math.max(0.5, ts.stepsPerBeat * 0.25))
                : Math.max(durationSteps, qaHang.answerEntryStep - step + 0.5);
        } else if (qaResolution && qaHang) {
            // RESOLUTION — re-land WITH the soloist: if this hit's emitted top
            // voice is a non-pillar, snap it down onto the nearest pillar PC so
            // the comp agrees with the answer instead of re-tensioning over it.
            // Bar-wide (any hit in the answer cadence's bar) and pitch-only —
            // hit count, rhythm, and the #715 economy stay untouched.
            const resMidis = getMidiVoicing(voicing);
            if (resMidis.length > 0) {
                resMidis.sort((a, b) => a - b);
                const top = resMidis[resMidis.length - 1];
                const { pillars } = chordTargetTones(chord.rootMidi, chord.quality);
                if (!pillars.includes(((top % 12) + 12) % 12)) {
                    // Scan down for the nearest pillar that doesn't collide
                    // with an already-voiced tone (within 2 semitones — that
                    // covers both the literal double and the m2 rub the echo
                    // block forbids, e.g. snapping onto the F♯ of a ♯11
                    // voicing). If every pillar below is taken, DROP the
                    // tension top instead — the remaining voicing is all
                    // chord tones, the most pianistic "agree" available.
                    let snapped = -1;
                    for (let down = 1; down <= 11; down++) {
                        const cand = top - down;
                        if (!pillars.includes(((cand % 12) + 12) % 12)) {
                            continue;
                        }
                        if (resMidis.some((m) => m !== top && Math.abs(m - cand) <= 2)) {
                            continue;
                        }
                        snapped = cand;
                        break;
                    }
                    if (snapped > 0) {
                        resMidis[resMidis.length - 1] = snapped;
                        voicing = resMidis.map((m) => getFrequency(m));
                    } else if (resMidis.length > 1) {
                        resMidis.pop();
                        voicing = resMidis.map((m) => getFrequency(m));
                    }
                }
            }
        }

        // B2 (#707) — structural ceiling: a comp voicing must not ring past the
        // chord it belongs to, or successive chords pile into each other (the
        // "previous measure is still playing" overlap, audible as the organ
        // ringing into the IV7). Clamp the note length to the steps remaining in
        // THIS chord, minus a small release margin so the voice has faded before
        // the next chord's onset. A ceiling only — it trims an over-long default
        // (the flat 2-beat default; Acoustic's 2.5-beat ring) but never lengthens
        // the per-genre durations chosen above, so their feel is preserved.
        // Scope: this covers the smart/default comp lane. The genre early-return
        // lanes (Funk chucks, ghost stabs) already emit short step-durations that
        // can't overrun a chord, and B1's synth release backstops any residual.
        const stepsToChordEnd = chord.beats * ts.stepsPerBeat - stepInChord;
        durationSteps = Math.max(
            0.5,
            Math.min(durationSteps, stepsToChordEnd - CHORD_END_RELEASE_MARGIN_STEPS),
        );

        voicing.forEach((f: number, i: number) => {
            const humanShift = compDraw(320 + i) * 0.006 - 0.003;
            const humanVol = 0.95 + compDraw(340 + i) * 0.1;

            // Attack character: a confident pianist STRIKES a block chord — every
            // voice lands essentially together — whereas a guitarist rolls the
            // strings. The old ascending strum (up to 25ms/voice at low intensity)
            // rolled the keys too, which reads as hesitation instead of a chart-
            // following accompanist. Chords are keyboards today, so the comp emits
            // a near-block strike (a hair of spread for naturalism, tightest on the
            // statement/downbeat). The strum lives in ONE place now — the
            // scheduler's strum-rank, gated on a guitar voice via
            // isStrummedChordVoice — so a future guitar chords pack rolls without
            // this layer double-strumming it. (Owner audition.)
            const baseStrum = isStructural ? 0.0006 : 0.0012;
            const stagger = i * baseStrum + humanShift;
            const noteCC = i === 0 ? ccEvents : [];

            notes.push({
                midi: getMidi(f),
                velocity: Math.min(1.0, velocity * humanVol),
                durationSteps,
                bendStartInterval: 0,
                ccEvents: noteCC,
                timingOffset: timingOffset + stagger,
                instrument: 'Piano',
                muted: false,
                dry: genre === 'Reggae' || genre === 'Funk' || genre === 'Disco',
            });
        });
    }

    if (notes.length === 0 && ccEvents.length > 0) {
        notes.push({
            midi: 0,
            velocity: 0,
            durationSteps: 0,
            bendStartInterval: 0,
            ccEvents: ccEvents,
            timingOffset: 0,
            instrument: 'Piano',
            muted: true,
        });
    }

    return notes;
}
