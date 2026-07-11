import { TIME_SIGNATURES } from '../config.js';
import type { ArrangerState } from '../state/arranger.js';
import type { Chord, EnsembleState } from '../types.js';
import { getFrequency, getMidi } from '../utils.js';
import { scrambleHash } from './hash-utils.js';
import type { ChordAtStep } from './worker-utils.js';

/**
 * LATE-PASS REHARMONIZATION (#1011) — in-place turnaround substitutions at high
 * loopCount, Jazz/Blues only.
 *
 * why: the changes are played verbatim forever — loop 5 of a jazz form gets a
 * developed melody and evolved drums but identical chords. The band should get
 * hip as the session settles in: once the listener has learned the real changes
 * (loops 0–1 are always verbatim, the same contract as the soloist's strict
 * Head), the turnaround occasionally substitutes — published through the chord
 * preamble so every engine sees, and outlines, the same substituted chord.
 *
 * EPHEMERAL BY CONSTRUCTION: this module never mutates `arranger.stepMap` (or
 * any state) — `withLateReharm` returns a NEW ChordAtStep wrapper around a NEW
 * Chord object. The chart, share URLs, and persisted sessions are untouched;
 * the substitution exists only in the played tick. The UI chart keeps showing
 * the written changes — the sub is a sound, not an edit.
 *
 * VOCABULARY (two in-place shapes — chord boundaries and harmonic rhythm are
 * never touched; bar-splitting insertion was explicitly scoped out):
 *   - TRITONE SUB (Jazz + Blues): a functioning V7 (plain '7' quality resolving
 *     down a perfect fifth) becomes the dominant a tritone away (V7 → bII7),
 *     resolving down a half step instead. Voice-led surgically: the guide tones
 *     (3rd and b7) stay put and swap roles; root/5th/9th move by the tritone.
 *   - DOMINANTIZATION (Jazz only): a minor 7th resolving down a perfect fifth
 *     gets its b3 raised to the major 3rd in place — vi7 → VI7 (and by the same
 *     root-motion rule ii7 → II7, the Basie turnaround juice). Same root, same
 *     register, one semitone of surgery.
 *
 * Both shapes are deliberately GUIDE-TONE-COMPATIBLE with the written chord, so
 * the soloist's seed-baked line (authored against the raw changes) stays
 * consonant-in-color over the sub: a tritone sub preserves the V7's 3/7; a
 * dominantized VI7 turns the old b3 into the classic dominant #9. That is WHY
 * these two are the safe in-place subs — no soloist gating needed, including
 * the depth-0 theme-return loops.
 *
 * DETERMINISM: all draws are scrambleHash keyed on (loopCount, sectionStart) —
 * no Math.random, no mutable module state. The same session plays the same
 * substitutions; the live worker, a re-render, and tests all agree.
 */

/** The idiom home for turnaround substitution. Other genres never substitute. */
const REHARM_GENRES = new Set(['Jazz', 'Blues']);

/**
 * why: loops 0–1 always play the written changes — the listener must learn the
 * real turnaround before the band starts recomposing it (mirrors the soloist's
 * strict-Head loop-0 contract).
 */
const REHARM_MIN_LOOP = 2;

/**
 * why: the sub should feel like the band getting ideas, not a new arrangement —
 * and how many ideas is a GENRE trait (review P2, #1011):
 *   - Jazz: a warmed-up rhythm section recomposes freely — ~1/3 of turnarounds
 *     when subs unlock at loop 2, ramping to a 0.65 cap (roughly one pass in
 *     three still plays verbatim at full heat).
 *   - Blues: the turnaround IS the song's signature — subs stay an occasional
 *     wink (0.2 → 0.4 cap, half Jazz's rate and half its ramp speed) so a
 *     blues at loop 10 still sounds like a blues, not a bebop head.
 */
const REHARM_RAMP: Record<string, { base: number; perLoop: number; cap: number }> = {
    Jazz: { base: 0.35, perLoop: 0.1, cap: 0.65 },
    Blues: { base: 0.2, perLoop: 0.05, cap: 0.4 },
};

/**
 * Flat-side spelling for substitute-chord display names: tritone subs live on
 * the flat side of the circle (Db7, Ab7…). Display-only — the UI chart never
 * renders an ephemeral sub; these feed MIDI markers and debugging.
 */
const FLAT_NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

type SubKind = 'tritone' | 'dominantize';

function pc(midi: number): number {
    return ((midi % 12) + 12) % 12;
}

/**
 * Root pitch-class of the chord that FOLLOWS stepMap[i] — the resolution target
 * for root-motion classification. Wraps to the form top: a turnaround's V7
 * resolves to the first chord of the next pass, which is exactly the resolution
 * the tritone sub re-approaches by half step.
 */
function nextRootPc(stepMap: ArrangerState['stepMap'], i: number): number | null {
    const next = stepMap[i + 1]?.chord ?? stepMap[0]?.chord;
    return next && Number.isFinite(next.rootMidi) ? pc(next.rootMidi) : null;
}

/**
 * Does this chord qualify for a substitution, and which shape?
 * Root motion down a perfect fifth (7 semitones) marks a FUNCTIONING resolution
 * — a static color chord never substitutes. Slash chords (explicit bassMidi)
 * are skipped: recomposing over a written bass note contradicts the chart's
 * explicit instruction. Altered dominants ('7b9', '7alt', …) are skipped too —
 * they already carry their color; strict quality === '7' only.
 */
function classifySub(chord: Chord, nextPc: number | null, genreFeel: string): SubKind | null {
    if (!chord || !Number.isFinite(chord.rootMidi) || nextPc === null) {
        return null;
    }
    if (chord.bassMidi !== null && chord.bassMidi !== undefined) {
        return null;
    }
    const motionDownFifth = (pc(chord.rootMidi) - nextPc + 12) % 12 === 7;
    if (!motionDownFifth) {
        return null;
    }
    if (chord.is7th && chord.quality === '7') {
        return 'tritone';
    }
    if (genreFeel === 'Jazz' && chord.is7th && chord.quality === 'minor') {
        return 'dominantize';
    }
    return null;
}

/** Minimal same-shape display block for an ephemeral sub (never chart-rendered). */
function subDisplay(rootName: string): Chord['display'] {
    const part = { root: rootName, suffix: '7' };
    return { name: { ...part }, nns: { ...part }, roman: { ...part } } as Chord['display'];
}

/**
 * V7 → bII7, voice-led surgically per voiced note:
 *   - guide tones (3rd, b7 — intervals 4 and 10 from the old root) STAY PUT and
 *     swap roles (G7's B/F become Db7's 7th/3rd) — the classic common-tone sub;
 *   - everything else (root, 5th, 9th, …) moves by the tritone in parallel, so
 *     the voicing's internal spacing survives and the register never jumps.
 * The interval multiset is unchanged (a dominant is a dominant a tritone away),
 * so `intervals` is copied verbatim against the new root.
 */
function buildTritoneSub(chord: Chord): Chord {
    const rootPitchClass = pc(chord.rootMidi);
    // Keep the new root in the same octave band as the old one (both tritone
    // directions are equidistant; pick the one that stays centered).
    const shift = rootPitchClass >= 6 ? -6 : 6;
    const subRootMidi = chord.rootMidi + shift;
    const subRootName = FLAT_NOTE_NAMES[pc(subRootMidi)];

    const freqs = chord.freqs.map((f) => {
        const midi = getMidi(f);
        if (midi === null) {
            return f;
        }
        const rel = (pc(midi) - rootPitchClass + 12) % 12;
        // Guide tones hold; the rest travel with the root.
        return rel === 4 || rel === 10 ? f : getFrequency(midi + shift);
    });

    return {
        ...chord,
        rootMidi: subRootMidi,
        bassMidi: null,
        freqs,
        intervals: chord.intervals.slice(),
        quality: '7',
        is7th: true,
        isMinor: false,
        absName: `${subRootName}7`,
        nnsName: `${subRootName}7`,
        romanName: `${subRootName}7`,
        display: subDisplay(subRootName),
    };
}

/**
 * m7 → dominant 7 in place: raise every voiced b3 (interval 3 from the root) a
 * semitone to the major 3rd. Root, register, 7th, and any 9/11 colors stay —
 * one semitone of surgery turns vi7 into VI7 (V/ii). Any melody note still
 * sitting on the old b3 becomes the dominant #9 — the idiomatic color, which is
 * why this sub is safe under a seed-baked soloist line.
 */
function buildDominantizedSub(chord: Chord): Chord {
    const rootPitchClass = pc(chord.rootMidi);
    const subRootName = FLAT_NOTE_NAMES[rootPitchClass];

    const freqs = chord.freqs.map((f) => {
        const midi = getMidi(f);
        if (midi === null) {
            return f;
        }
        const rel = (pc(midi) - rootPitchClass + 12) % 12;
        return rel === 3 ? getFrequency(midi + 1) : f;
    });
    const intervals = chord.intervals.map((iv) => (((iv % 12) + 12) % 12 === 3 ? iv + 1 : iv));

    return {
        ...chord,
        // classifySub already rejects slash chords, so this is always null on
        // the source too — explicit for parity with buildTritoneSub.
        bassMidi: null,
        freqs,
        intervals,
        quality: '7',
        is7th: true,
        isMinor: false,
        absName: `${subRootName}7`,
        nnsName: `${subRootName}7`,
        romanName: `${subRootName}7`,
        display: subDisplay(subRootName),
    };
}

/**
 * The pure per-chord decision: is THIS stepMap entry the substituted chord of
 * its section's turnaround on THIS loop, and if so, the substituted Chord.
 *
 * At most ONE chord per turnaround per loop substitutes — a seeded draw picks
 * among the eligible candidates (so a ii–V never dominantizes AND tritone-subs
 * in the same pass; one idea at a time reads as intent, two reads as chaos).
 */
function getTurnaroundSub(
    chordData: ChordAtStep,
    arranger: ArrangerState,
    genreFeel: string,
    loopCount: number,
): Chord | null {
    const { sectionStart, sectionEnd, chordIndex } = chordData;
    const stepMap = arranger.stepMap;
    if (!stepMap?.length || sectionEnd <= sectionStart) {
        return null;
    }

    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
    // Mirror the preamble's isTurnaround gate: short sections have no turnaround
    // to recompose (an 8-bar minimum, final 2 bars are the window).
    if (sectionEnd - sectionStart < stepsPerMeasure * 8) {
        return null;
    }
    const windowStart = sectionEnd - stepsPerMeasure * 2;

    // The current chord must itself sit in the window before we bother scanning.
    const currentEntry = stepMap[chordIndex];
    if (!currentEntry || currentEntry.start < windowStart || currentEntry.start >= sectionEnd) {
        return null;
    }

    // Collect every eligible chord in this section's turnaround window.
    const eligible: Array<{ index: number; kind: SubKind }> = [];
    for (let i = 0; i < stepMap.length; i++) {
        const entry = stepMap[i];
        if (entry.start >= sectionEnd) {
            break; // stepMap is start-sorted
        }
        if (entry.start < windowStart) {
            continue;
        }
        const kind = classifySub(entry.chord, nextRootPc(stepMap, i), genreFeel);
        if (kind) {
            eligible.push({ index: i, kind });
        }
    }
    if (eligible.length === 0) {
        return null;
    }

    // Seeded per (loopCount, sectionStart): whether this pass substitutes at all…
    const ramp = REHARM_RAMP[genreFeel] ?? REHARM_RAMP.Jazz;
    const prob = Math.min(ramp.cap, ramp.base + ramp.perLoop * (loopCount - REHARM_MIN_LOOP));
    if (scrambleHash(loopCount * 131 + sectionStart * 7 + 5) >= prob) {
        return null;
    }
    // …and which eligible chord carries the idea.
    const pickDraw = scrambleHash(loopCount * 131 + sectionStart * 7 + 23);
    const pick = eligible[Math.min(eligible.length - 1, Math.floor(pickDraw * eligible.length))];
    if (pick.index !== chordIndex) {
        return null;
    }

    const chord = currentEntry.chord;
    return pick.kind === 'tritone' ? buildTritoneSub(chord) : buildDominantizedSub(chord);
}

/**
 * The single wrapper every worker-side chord fetch routes through (drums-tick
 * preamble, tick-logic lookaheads, MIDI-export markers). Returns the original
 * ChordAtStep untouched — same object identity — unless this exact chord
 * substitutes on this loop, in which case a NEW ChordAtStep wrapping a NEW
 * Chord is returned (the stepMap entry is never mutated).
 *
 * Hard gates, in order:
 *   - genre: Jazz/Blues only;
 *   - loop: the written changes play verbatim until loop 2 (REHARM_MIN_LOOP);
 *   - practice section-loop active (#1016): the practice persona is drilling
 *     the truth, not the band's ideas — never substitute under a drill;
 *   - song ending pending: the resolution cadence lands on the REAL changes
 *     (the same precedence rule isFinalMeasure enforces for variation theatre).
 *
 * `playback.currentLoopCount` is the unified loop field every engine reads
 * (soloist development depth, drum motif lift) — reharm keys off the same
 * signal so the band's whole evolution moves together. NOTE: the offline MIDI
 * export pins that field at 0, so exports render loop-0 (verbatim changes) —
 * the same existing characteristic as every other loop-keyed evolution.
 */
export function withLateReharm(
    chordData: ChordAtStep | null,
    arranger: ArrangerState,
    state: EnsembleState,
): ChordAtStep | null {
    if (!chordData?.chord) {
        return chordData;
    }
    const { groove, playback } = state;
    const genreFeel = groove?.genreFeel;
    if (!genreFeel || !REHARM_GENRES.has(genreFeel)) {
        return chordData;
    }
    const loopCount = playback?.currentLoopCount ?? 0;
    if (loopCount < REHARM_MIN_LOOP) {
        return chordData;
    }
    if ((playback?.loopEndStep ?? -1) > 0) {
        return chordData;
    }
    if (playback?.songMode && playback?.isEndingPending) {
        return chordData;
    }
    const sub = getTurnaroundSub(chordData, arranger, genreFeel, loopCount);
    return sub ? { ...chordData, chord: sub } : chordData;
}
