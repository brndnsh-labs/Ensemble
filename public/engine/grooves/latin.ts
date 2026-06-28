import { scrambleHash } from '../hash-utils.js';
import {
    applyStandardBase,
    binaryTier,
    compoundHatAllowed,
    compoundKickAllowed,
    DEFAULT_CONFIG,
    type DrumStepBase,
    type GrooveContext,
    makeMotifSelector,
    roll,
    rollSeed,
    scaleVelocity,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    isLatin: true,
};

/**
 * Maps intensity to motif complexity for Latin / Bossa.
 * 0: Pure Bossa Nova, 1: Mid-intensity Latin, 2: Samba, 3: Partido Alto
 */
export const getMotif = makeMotifSelector([
    binaryTier(0.6, 0.7),
    {
        picks: [[0.3, 0], [0.6, 1], [0.85, 2], 3],
    },
]);

export function applyOverrides(context: GrooveContext, state: DrumStepBase): DrumStepBase {
    const result = applyStandardBase(context, state);
    if (result.muted) {
        return result.base;
    }
    const { base } = result;

    const {
        step,
        drumComplexity,
        sectionSeed,
        isTurnaround,
        isDownbeat,
        isPulseStart,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        isAOfBeat,
        isCompound,
        motifCeiling,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity } = base;

    const activeMotif = Math.min(
        getMotif(sectionSeed, drumComplexity, context.motifIntensity ?? intensity),
        motifCeiling ?? Number.POSITIVE_INFINITY,
    );

    // --- Lay-back: Bossa is relaxed ---
    instTimeOffset += 0.005 + intensity * 0.005;

    // --- 1. KICK PATTERNS (Surdo Feel) ---
    if (context.inst.name === 'Kick') {
        shouldPlay = false;
        // Foundation: 1 and 3 in 4/4 (Surdo heart), generalizing to non-backbeat pulses
        if (isBeatStart && !isBackbeat) {
            shouldPlay = true;
            const accent = !isDownbeat ? 1.15 : 1.0;
            velocity = scaleVelocity(1.1 * accent, intensity, 0.1);
            if (!isDownbeat) {
                instTimeOffset += 0.005;
            }
        }
        // why: epic-1-compound-meter S16b F1 — the `!isBackbeat` foundation
        // above excludes the second-pulse position in default 6/8. Compound
        // Latin needs the surdo heartbeat on both dotted-quarter pulses to
        // anchor the bar.
        if (isCompound && isPulseStart && !shouldPlay) {
            shouldPlay = true;
            velocity = scaleVelocity(1.1, intensity, 0.1);
        }

        // Samba variation: Add 16th note pushes
        if (activeMotif >= 2 && !shouldPlay) {
            if (isAOfBeat && !isBackbeat) {
                if (roll(0.6, intensity, rollSeed(context, 1))) {
                    shouldPlay = true;
                    velocity = scaleVelocity(0.7, intensity, 0.1);
                }
            }
        }

        if (shouldPlay && !compoundKickAllowed(context)) {
            shouldPlay = false;
        }
    }
    // --- 2. CLAVE (Sidestick) ---
    else if (context.inst.name === 'Snare') {
        shouldPlay = false;
        soundName = 'Sidestick';

        // 2-Bar Clave Logic
        const barIndex = Math.floor(step / context.stepsPerBar);
        const isBar1 = barIndex % 2 === 0;
        const stepInBar = step % context.stepsPerBar;

        if (isCompound) {
            // why: epic-3-followup S10 — the latin feel has NO clave/bell
            // spine in compound meters (all the son-clave / Samba / Partido-Alto
            // motif branches below are `!isCompound`-gated, correctly, because they
            // are 4/4-idiomatic), so the timeline lane would otherwise be silent.
            // Author the standard 7-stroke Bembé bell — the canonical 12/8
            // Afro-Cuban gankoguí/agogô timeline — onto the Snare lane so Bossa in
            // 6/8 or 12/8 grooves on its own (this IS the compound-Latin timeline
            // now; #628 retired the never-surfaced 'Afro-Cuban 6/8' drum preset).
            // The bell rides the
            // agogô voice (the synth dispatches by soundName, so a bell name on the
            // Snare inst routes to playAgogoPercNew). This supersedes the motif
            // sub-branches in compound — the bell IS the structural timeline, not an
            // ornament, so it fires regardless of motif.
            //
            // Standard pattern (maximally-even E(7,12)) strokes on eighth-pulse
            // indices 0,2,4,5,7,9,11 → inter-onset intervals 2-2-1-2-2-2-1 (box
            // notation 101011010101). step = 2 × eighth-pulse-index. In 6/8 the
            // 12-pulse line spans TWO bars (bar-1 = 4 strokes, bar-2 = 3); in 12/8 it
            // fits one bar. NOTE: the bell deliberately lands on only two of the four
            // felt dotted-quarter beats — beat 1 (pulse 0) and beat 4 (pulse 9) — and
            // syncopates the middle; that off-the-pulse tension is what makes it
            // interlock with the surdo rather than doubling it.
            soundName = 'AgogoHigh';
            const stepsPerBeat = context.tsConfig?.stepsPerBeat ?? 2;
            const meterBeats = (context.tsConfig?.grouping ?? []).reduce((a, b) => a + b, 0);
            // 12/8 = four dotted-quarter pulses (12 eighth-pulses per bar). 6/8 = two
            // pulses → 6 eighth-pulses per bar.
            const is128 = meterBeats === 12 && stepsPerBeat === 2;

            // why: the bell's two principal strokes (beats 1 and 4) are accented ~1.0;
            // the syncopated in-between strokes are softer (~0.7) so the bell breathes
            // with the surdo rather than flat-lining. Principal strokes: 12/8 → steps
            // 0 and 18; 6/8 → bar-1 step 0 (beat 1) and bar-2 step 6 (beat 4 of the
            // 2-bar timeline, eighth-pulse 9).
            let isStroke = false;
            let isFeltPulse = false;
            if (is128) {
                // Full one-bar timeline: steps 0,4,8,10,14,18,22.
                const strokes = new Set([0, 4, 8, 10, 14, 18, 22]);
                isStroke = strokes.has(stepInBar);
                isFeltPulse = stepInBar === 0 || stepInBar === 18;
            } else {
                // 6/8: the 12-pulse timeline spans two bars (phrase via barIndex % 2).
                if (isBar1) {
                    // eighth-pulses 0,2,4,5 → steps 0,4,8,10.
                    isStroke =
                        stepInBar === 0 || stepInBar === 4 || stepInBar === 8 || stepInBar === 10;
                    // principal stroke in bar-1: step 0 (beat 1).
                    isFeltPulse = stepInBar === 0;
                } else {
                    // eighth-pulses 7,9,11 → relative 1,3,5 → steps 2,6,10.
                    isStroke = stepInBar === 2 || stepInBar === 6 || stepInBar === 10;
                    // principal stroke in bar-2: step 6 (beat 4, eighth-pulse 9).
                    isFeltPulse = stepInBar === 6;
                }
            }

            if (isStroke) {
                shouldPlay = true;
                // why: accent the felt pulses ~1.0, soften in-between strokes to ~0.7
                // so the bell breathes with the surdo rather than flat-lining.
                velocity = scaleVelocity(isFeltPulse ? 1.0 : 0.7, intensity, 0.1);
            }

            if (isTurnaround && intensity > 0.8 && isPulseStart && isBackbeat) {
                // why: keep the turnaround Snare crack idiom alive in compound too —
                // a full-body snare on the section turnaround, same as the simple-meter
                // path below, reading as a fill cue rather than a bell stroke.
                shouldPlay = true;
                velocity = 1.1;
                soundName = 'Snare';
            }

            return { shouldPlay, velocity, soundName, instTimeOffset };
        }

        if (activeMotif === 0 || activeMotif === 1) {
            // Authentic 3-2 Son Clave (Cuban origin, foundational for bossa sidestick)
            // 3-side (bar 1): beat 1, "& of 2", beat 4 → 16th steps 0, 6, 12
            // 2-side (bar 2): beat 2, beat 3        → 16th steps 4, 8
            // why: these step indices (0, 6, 12 / 4, 8) are 4/4 16th-note positions.
            // In 6/8 (stepsPerBar=12) step 12 is the start of the NEXT measure and
            // never fires; the spacing also doesn't match a 6/8 son clave (3+3+2 in
            // eighths). Gate compound out entirely — the compound-meter timeline
            // is the Bembé bell authored in the `isCompound` branch above.
            const ts = context.tsConfig;
            const stepsPerBeat = ts?.stepsPerBeat ?? 4;
            const meterBeats = (ts?.grouping ?? []).reduce((a, b) => a + b, 0);
            const is44 = meterBeats === 4 && stepsPerBeat === 4;
            if (!isCompound && is44) {
                if (isBar1) {
                    if (stepInBar === 0 || stepInBar === 6 || stepInBar === 12) {
                        shouldPlay = true;
                    }
                } else {
                    if (stepInBar === 4 || stepInBar === 8) {
                        shouldPlay = true;
                    }
                }
            } else if (!isCompound) {
                // why: epic-2 S10 — in non-4/4 simple meters (3/4, 5/4, 7/4, 7/8) the
                // 4/4 clave literals above strand 4/4 positions and DROP THE BAR'S TAIL
                // (5/4 leaves beats 4-5 silent, 7/4 beats 4-7) — and the clave is the
                // structural timeline, not an ornament. Derive it from the meter's
                // grouping so it spans the whole bar: the grouping pulse (isPulseStart)
                // anchors both clave sides; the busier 3-side (bar 1) adds the pickup —
                // the last eighth before the next pulse (stepInGroup === groupSteps - 2,
                // the same syncopation slot S9/S12 use) — for the clave's signature
                // off-beat feel; the 2-side (bar 2) stays on the pulses. "Do our best,
                // groove" — there is no canonical son clave for 5/4/7/4/7/8.
                const groupBeats = ts?.grouping?.[context.groupIndex] ?? 4;
                const groupSteps = groupBeats * stepsPerBeat;
                const isPickup = context.stepInGroup === groupSteps - 2;
                // why: single-group meters (3/4 [3], 2/4 [2]) have only ONE grouping
                // pulse per bar (mStep 0), so isPulseStart alone would collapse the
                // 2-side to a lone downbeat. Use the beat as the pulse unit there so the
                // clave spans the bar (3/4 → clicks on each beat). Multi-group odd meters
                // (5/4, 7/4, 7/8) use the grouping pulse as designed.
                const isSingleGroup = (ts?.grouping?.length ?? 1) <= 1;
                const feltPulse = isSingleGroup ? isBeatStart : isPulseStart;
                if (feltPulse) {
                    shouldPlay = true;
                } else if (isBar1 && isPickup) {
                    shouldPlay = true;
                }
            }

            // High-complexity embellishments: occasional offbeat ghost between clave hits
            if (!shouldPlay && drumComplexity > 0.7 && intensity > 0.6) {
                if (isOffbeat && roll(0.3, 1.0, rollSeed(context, 2))) {
                    shouldPlay = true;
                    velocity = 0.5;
                }
            }
        } else if (activeMotif === 2 && !isCompound) {
            // Samba (Busy cross-stick) — 4/4-idiomatic.
            // why: epic-1-compound-meter S16b — `isBeatStart || isOffbeat` fires
            // every step in 6/8 → 12 cross-stick hits/bar at 70% probability.
            // Samba is a 4/4 Brazilian pattern; 6/8 Latin defaults to the
            // Afro-Cuban Bembé bell timeline authored in the `isCompound` branch
            // above. Gate Samba motif to simple meters; compound latin falls back
            // to motif 0/1 (clave-driven, which is correctly compound-gated).
            if (isBeatStart || isOffbeat) {
                if (roll(0.7, intensity, rollSeed(context, 3))) {
                    shouldPlay = true;
                }
            }
            // why: at full-crack samba intensity the on-beat-2/4 pulse gets a full Snare body
            // (caixa/snare with crisp top), matching what a real samba batería does at high
            // energy.  Clave slots (non-backbeat positions) stay on Sidestick.
            if (isBackbeat && intensity > 0.8) {
                shouldPlay = true;
                soundName = 'Snare';
            }
        } else if (!isCompound) {
            // Partido Alto — 4/4-idiomatic 2-bar cross-stick.
            // why: epic-1-compound-meter S16c — the bar-1/bar-2 offbeat clave maps
            // to 4/4 only. In 6/8 it produced a 7-hits-vs-1-hit bar split (bar-1's
            // offbeats {1,3,5,7,9,11}+pulse vs bar-2's lone downbeat). Gate to simple
            // meters, consistent with the Samba decision above; compound latin's
            // snare/clave comes from the Bembé bell timeline above. Gating the
            // final `else` here also closes the S16b fall-through where Samba
            // (motif 2) in compound dropped into this Partido Alto block.
            if (isBar1) {
                if ((isOffbeat && !isBackbeat) || (isPulseStart && isBackbeat)) {
                    shouldPlay = true;
                }
            } else {
                if ((isPulseStart && !isBackbeat) || (isOffbeat && isBackbeat)) {
                    shouldPlay = true;
                }
            }
            // why: Partido Alto at full intensity also deserves a Snare crack on the backbeat
            // so the groove reads as a high-energy Afro-Brazilian idiom, not a gentle bossa rim.
            if (isBackbeat && intensity > 0.8) {
                shouldPlay = true;
                soundName = 'Snare';
            }
        }

        if (isTurnaround && intensity > 0.8) {
            if (isPulseStart && isBackbeat) {
                shouldPlay = true;
                velocity = 1.1;
                soundName = 'Snare';
            }
        }

        if (shouldPlay && soundName === 'Sidestick') {
            // why: deterministic ±0.05 humanize on the sidestick velocity. Replaces
            // bare Math.random() (FOLLOWUPS §F) so looped playback + seeded critique
            // tests stay coherent. Seeded per step via the golden-ratio scramble
            // (GrooveContext.playback doesn't expose currentLoopCount, so the jitter
            // is loop-stable — fine for a sub-perceptual velocity nudge).
            const velSeed = (step * 0x9e3779b1) | 0;
            velocity = scaleVelocity(0.9, intensity, 0.1) + (scrambleHash(velSeed) - 0.5) * 0.1;
        }
    }
    // --- 3. HI-HAT (Steady 8ths) ---
    else if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        shouldPlay = false;
        if (isBeatStart || isOffbeat) {
            shouldPlay = true;
            soundName = 'HiHat';
            velocity = isBeatStart ? 0.8 : 0.6;
        }

        if (shouldPlay && !compoundHatAllowed(context, { soundName })) {
            shouldPlay = false;
        }
    }
    // --- 4. PERCUSSION (Ganza/Shaker) ---
    else if (context.inst.name === 'Shaker' || context.inst.name === 'Perc') {
        shouldPlay = true;
        if (isBeatStart) {
            velocity = scaleVelocity(0.95, intensity, 0.1);
        } else if (isOffbeat) {
            velocity = scaleVelocity(0.75, intensity, 0.1);
        } else {
            velocity = scaleVelocity(0.45, intensity, 0.1);
        }

        if (context.inst.name === 'Perc') {
            shouldPlay = activeMotif >= 2 && roll(0.4, intensity, rollSeed(context, 4));
            soundName = 'AgogoHigh';
        }
    }

    // why: low-intensity Snare softens to a rim sidestick — but ONLY in simple
    // meters. The compound bell (epic-3-followup S10) returns early above before
    // reaching here, so this is belt-and-suspenders: the `!isCompound` guard keeps
    // the Afro-Cuban bell on its agogô voice even if the early return is ever
    // restructured (the bell IS the timeline; remapping it to Sidestick would gut it).
    if (shouldPlay && !isCompound && context.inst.name === 'Snare' && intensity < 0.4) {
        soundName = 'Sidestick';
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
