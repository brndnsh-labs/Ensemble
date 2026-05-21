import type { SoloistState } from '../state/instruments.js';
import type { SkeletonNode, StepInfo } from '../types.js';
import { makeSeededStream } from './hash-utils.js';
import { STYLE_CONFIG } from './soloist-config.js';
import { isSoloistMonophonicMode } from './soloist-mode-policy.js';

type ResponseTransform = 'exact' | 'delay' | 'echo' | 'compress';
type ResponseMode = 'paraphrase' | 'development' | 'free';
type ResponseSource = 'section' | 'form' | 'recent' | 'seed' | 'free';

function pickResponseTransform(
    responseConfig: any,
    responseMode: ResponseMode,
    responseSource: ResponseSource = 'recent',
    random: () => number = Math.random,
): ResponseTransform {
    const options: Array<[ResponseTransform, number]> =
        responseMode === 'development'
            ? [
                  ['exact', 0.65],
                  ['delay', 0.7 + (responseConfig?.delayBias || 0)],
                  ['echo', 0.8 + (responseConfig?.echoBias || 0)],
                  ['compress', 0.9 + (responseConfig?.compressionBias || 0)],
              ]
            : [
                  ['exact', 1.5 + (responseConfig?.rhythmReuse || 0)],
                  ['delay', 0.45 + (responseConfig?.delayBias || 0)],
                  ['echo', 0.35 + (responseConfig?.echoBias || 0)],
                  ['compress', 0.25 + (responseConfig?.compressionBias || 0)],
              ];
    const spaceBias = Math.max(0, Math.min(0.75, responseConfig?.spaceBias || 0));
    const recallSpaceScale =
        responseSource === 'section' ? 1 : responseSource === 'form' ? 0.78 : 0;
    if (recallSpaceScale > 0 && spaceBias > 0) {
        options[0][1] *= Math.max(0.35, 1 - spaceBias * 0.5 * recallSpaceScale);
        options[1][1] += spaceBias * 0.35 * recallSpaceScale;
        options[2][1] += spaceBias * 0.45 * recallSpaceScale;
        options[3][1] += spaceBias * 0.18 * recallSpaceScale;
    }
    const totalWeight = options.reduce((sum, [, weight]) => sum + weight, 0);
    // why: response-transform roulette draws from the injected seeded stream
    // (Epic 12 S1) so a Restatement/response phrase picks the same transform
    // when its (step, section, loop) recurs — loops stay coherent.
    let roll = random() * totalWeight;
    for (const [name, weight] of options) {
        roll -= weight;
        if (roll <= 0) {
            return name;
        }
    }
    return 'exact';
}

function getStepStrength(stepTarget: number, stepsPerMeasure: number, stepsPerBeat: number) {
    const measureStep = ((stepTarget % stepsPerMeasure) + stepsPerMeasure) % stepsPerMeasure;
    const beatInMeasure = Math.floor(measureStep / stepsPerBeat);
    const isBeatStart = measureStep % stepsPerBeat === 0;
    const isDownbeat = measureStep === 0;
    const isBackbeat = (beatInMeasure === 1 || beatInMeasure === 3) && isBeatStart;
    return {
        isStrongBeat: isBeatStart || isDownbeat || isBackbeat,
        isDownbeat,
        isBackbeat,
    };
}

function buildResponsePlanFromSignature(
    startStep: number,
    activeSteps: number,
    stepsPerMeasure: number,
    stepsPerBeat: number,
    intensity: number,
    signature: any,
    responseConfig: any,
    responseMode: ResponseMode,
    responseSource: ResponseSource,
    random: () => number = Math.random,
): any[] {
    if (!signature?.notes?.length) {
        return [];
    }

    const transform = pickResponseTransform(responseConfig, responseMode, responseSource, random);
    const delaySteps = Math.max(1, Math.floor(stepsPerBeat / 2));
    const maxResponseNotes = Math.max(2, Math.round(responseConfig?.maxResponseNotes || 8));
    const spaceBias = Math.max(0, Math.min(0.75, responseConfig?.spaceBias || 0));
    const sourceNotes = signature.notes.slice(0, maxResponseNotes);
    const responseNotes = sourceNotes
        .map((sourceNote: any, index: number) => {
            const isStructural =
                index === 0 ||
                index === sourceNotes.length - 1 ||
                sourceNote.isAnchor ||
                sourceNote.isStrongBeat ||
                Boolean(sourceNote.tripletPlacement);
            const skipProb =
                !isStructural && spaceBias > 0
                    ? responseSource === 'section'
                        ? spaceBias
                        : responseSource === 'form'
                          ? spaceBias * 0.78
                          : spaceBias * 0.6
                    : 0;
            if (skipProb > 0 && random() < skipProb) {
                return null;
            }

            let stepOffset = Math.max(0, Math.round(sourceNote.stepOffset || 0));
            if (transform === 'delay') {
                stepOffset += delaySteps;
            } else if (transform === 'echo') {
                stepOffset += index === 0 ? stepsPerBeat : delaySteps;
            } else if (transform === 'compress' && index > 0) {
                const compressionScale = responseMode === 'development' ? 0.78 : 0.9;
                stepOffset = Math.max(1, Math.round(stepOffset * compressionScale));
            }

            if (stepOffset >= activeSteps) {
                return null;
            }

            const keepTriplet =
                sourceNote.tripletPlacement && random() < (responseConfig?.tripletCarry || 0);
            return {
                stepOffset,
                sourceNote,
                keepTriplet,
            };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.stepOffset - b.stepOffset);
    if (responseNotes.length === 0) {
        return [];
    }

    const deduped = new Map<number, any>();
    responseNotes.forEach((responseNote: any, index: number) => {
        const stepTarget = startStep + responseNote.stepOffset;
        const durationSteps =
            transform === 'compress' && index > 0
                ? Math.max(1, Math.round((responseNote.sourceNote.durationSteps || 1) * 0.85))
                : Math.max(1, Math.round(responseNote.sourceNote.durationSteps || 1));
        const strength = getStepStrength(stepTarget, stepsPerMeasure, stepsPerBeat);
        const velocityBase =
            (responseNote.sourceNote.velocity || 0.72) * (strength.isStrongBeat ? 1.06 : 0.96);
        const existing = deduped.get(stepTarget);
        const nextNode = {
            stepTarget,
            velocity: Math.min(1.25, Math.max(0.45, velocityBase + intensity * 0.08)),
            isStrongBeat: strength.isStrongBeat,
            durationSteps,
            isSustained: durationSteps > 1,
            vibrato: durationSteps >= stepsPerBeat,
            tripletPlacement: responseNote.keepTriplet
                ? responseNote.sourceNote.tripletPlacement || null
                : null,
            timingOffset: responseNote.keepTriplet ? responseNote.sourceNote.timingOffset || 0 : 0,
            responsePitchClass: responseNote.sourceNote.pitchClass,
            responseDirection: responseNote.sourceNote.direction || 0,
            responseEntryTarget: index === 0,
            responseCadenceTarget: index === responseNotes.length - 1,
            responseSource,
        };
        if (!existing || nextNode.responseCadenceTarget || nextNode.isStrongBeat) {
            deduped.set(stepTarget, nextNode);
        }
    });

    return [...deduped.values()].sort((a, b) => a.stepTarget - b.stepTarget);
}

/**
 * SRDC Restatement motif-echo (Epic 11 S4).
 *
 * Builds the Restatement phrase's rhythm plan as a near-verbatim echo of the
 * preceding Statement's signature: same attack grid (`stepOffset`), same
 * duration shape, same velocity contour. This is deliberately NOT the
 * call/response paraphrase path — a Restatement confirms an idea, it does not
 * answer it, so there is no delay/echo/compress transform and no probabilistic
 * note-dropping. The build is fully deterministic (no `Math.random()`): the
 * same Statement always echoes the same way, keeping looped playback and the
 * critique suite coherent.
 *
 * "Looser landings" live on the *pitch* side (soloist-pitch-engine.ts relaxes
 * the chord-tone multiplier for Restatement); here we faithfully reproduce the
 * rhythm and hand the picker each source note's contour direction +
 * pitch-class so the melodic shape is echoed too.
 */
function buildRestatementEchoPlan(
    startStep: number,
    activeSteps: number,
    stepsPerMeasure: number,
    stepsPerBeat: number,
    intensity: number,
    signature: any,
): any[] {
    if ((signature?.notes?.length ?? 0) === 0) {
        return [];
    }
    const echoNotes = signature.notes
        .map((sourceNote: any, index: number) => {
            const stepOffset = Math.max(0, Math.round(sourceNote.stepOffset || 0));
            if (stepOffset >= activeSteps) {
                return null;
            }
            const stepTarget = startStep + stepOffset;
            const durationSteps = Math.max(1, Math.round(sourceNote.durationSteps || 1));
            const strength = getStepStrength(stepTarget, stepsPerMeasure, stepsPerBeat);
            // why: echo the Statement's velocity contour verbatim, only nudged
            //   by the live band intensity (±8% — same coefficient the
            //   call/response builder uses) so the Restatement still breathes
            //   with the section's energy. The 0.45-1.25 clamp matches the
            //   response-plan builder so a loud Statement note doesn't peg.
            const velocity = Math.min(
                1.25,
                Math.max(0.45, (sourceNote.velocity || 0.72) + intensity * 0.08),
            );
            return {
                stepTarget,
                velocity,
                isStrongBeat: strength.isStrongBeat,
                durationSteps,
                isSustained: durationSteps > 1,
                vibrato: durationSteps >= stepsPerBeat,
                tripletPlacement: sourceNote.tripletPlacement || null,
                timingOffset: Number.isFinite(sourceNote.timingOffset)
                    ? sourceNote.timingOffset
                    : 0,
                // Hand the picker the Statement's contour so the melodic shape
                // is echoed, not just the rhythm. The pitch engine's
                // `isRestatementEcho` branch (soloist-pitch-engine.ts) reads
                // `responsePitchClass` / `responseDirection` off the rhythm
                // node and applies them as a final-stage contour multiplier:
                // interval direction is weighted heavier than exact pitch
                // class, so the echo is a soft directional bias ("looser
                // landings"), not a hard recall lock.
                responsePitchClass: sourceNote.pitchClass,
                responseDirection: sourceNote.direction || 0,
                // `responseCadenceTarget` is consumed by the de-dup pass below
                // (the cadence note survives a same-step collision). The pitch
                // engine's `isRestatementEcho` branch deliberately does NOT
                // read entry/cadence targets — a Restatement re-traces the
                // whole contour, it has no special entry/cadence pitch lock.
                responseCadenceTarget: index === signature.notes.length - 1,
                // `responseSource: 'recent'` is the discriminator the pitch
                // engine keys `isRestatementEcho` on — distinct from the
                // call/response sources ('section'/'form'/'free').
                responseSource: 'recent',
            };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.stepTarget - b.stepTarget);

    // Dedupe collisions on the same step (a Statement signature can carry two
    // notes at one offset after octave folding); keep the cadence/strong-beat
    // note so the echo's landings survive.
    const deduped = new Map<number, any>();
    for (const node of echoNotes) {
        const existing = deduped.get(node.stepTarget);
        if (!existing || node.responseCadenceTarget || node.isStrongBeat) {
            deduped.set(node.stepTarget, node);
        }
    }
    return [...deduped.values()].sort((a, b) => a.stepTarget - b.stepTarget);
}

export function generateRhythmPlan(
    startStep: number,
    activeSteps: number,
    style: string,
    intensity: number,
    stepsPerMeasure: number,
    stepsPerBeat: number,
    coordination: any,
    sessionSteps: number,
    soloistState: SoloistState,
    _stepInfo: StepInfo | null = null,
    // why: epic-form-arrangement S6 — Chorus Evolution rhythm-side.
    // The pitch engine already reads `playback.currentLoopCount` per-tick
    // (soloist-pitch-engine.ts:235, 861-877) to escalate device frequency
    // and SRDC phasing per loop. The rhythm engine had zero loop awareness:
    // every chorus emitted the same attack-grid, so the "Loop 0 Head / Loop
    // 1 Themed Improv / Loop 2+ Exploratory" arc in CLAUDE.md was only
    // pitch-deep. This parameter closes the rhythm-side: density grows
    // (+15%/loop) and an attack-jitter (±5%/loop) breaks the metronomic
    // grid so successive choruses *feel* different, not just sound different.
    // Defaults to 0 so existing call sites (unit tests, isolated engines)
    // see "Loop 0 Head" behavior — i.e. no loop bias — until they opt in.
    loopCount: number = 0,
    // why: injectable PRNG (Epic 12 S1). Production omits this and gets a
    // `makeSeededStream` keyed on `(startStep, sessionSteps, loopCount)` —
    // the rhythm plan is then deterministic by construction (a phrase replays
    // identically when its start step + session position recur). The
    // loop-count-isolation critique test (`soloist-chorus-evolution-rhythm`)
    // injects its OWN stream so it can hold the RNG sequence fixed across
    // Loop 0 / Loop 2 and attribute the divergence to the loop-count branches
    // alone (the test seam formerly held open by the bare `Math.random()` at
    // the attack-jitter site — see project memory feedback_determinism_test_pattern).
    random?: () => number,
): any[] {
    // Default seeded stream: keyed on the phrase's stable identity. startStep
    // distinguishes every phrase; sessionSteps separates successive phrases
    // that share a startStep modulo the loop; loopCount keeps each chorus
    // distinct. mulberry32 avalanche means adjacent seeds never sawtooth.
    const rng: () => number =
        random ?? makeSeededStream((startStep * 2749 + sessionSteps * 31 + loopCount * 5471) | 0);
    const plan: any[] = [];
    const _config = (STYLE_CONFIG as any)[style] || STYLE_CONFIG.scalar;
    const responseConfig = _config.motivicResponse || null;
    const hasDynamicHeadSeed = Boolean(soloistState.session.seed?.notes?.length);
    const isLineStyle = ['jazz', 'bird', 'bossa'].includes(style);
    const isMonophonicMode = isSoloistMonophonicMode(soloistState.mode);
    const minPhraseNotes = Math.max(0, _config.minNotesPerPhrase || 0);
    const responseSignature = soloistState.session.currentPhrase.context?.responseSignature;
    const responseMode = (soloistState.session.currentPhrase.context?.responseMode ||
        'free') as ResponseMode;
    const responseSource = (soloistState.session.currentPhrase.context?.responseSource ||
        'free') as ResponseSource;

    let notesInPhrase = 0;

    // --- SRDC Restatement motif-echo (Epic 11 S4) ---
    // Checked BEFORE call/response mirroring: a Restatement that has captured
    // its Statement's signature always echoes it, regardless of genre or
    // call/response role. This is a structural SRDC behavior — the player
    // confirming the idea — not a motivic-response feature, so it is not
    // gated on `responseConfig.enabled` / `MOTIVIC_RESPONSE_STYLES`.
    const restatementEcho = soloistState.session.currentPhrase.context?.restatementEcho;
    if (
        soloistState.session.currentPhrase.context?.srdcState === 'restatement' &&
        (restatementEcho?.notes?.length ?? 0) >= 3
    ) {
        const echoPlan = buildRestatementEchoPlan(
            startStep,
            activeSteps,
            stepsPerMeasure,
            stepsPerBeat,
            intensity,
            restatementEcho,
        );
        if (echoPlan.length >= 3) {
            return echoPlan;
        }
        // Fall through to the normal generation path if the echo collapsed
        // (e.g. every offset landed past activeSteps) — better a fresh phrase
        // than a 1-note stub.
    }

    // --- Call & Response: Rhythmic Mirroring ---
    if (
        hasDynamicHeadSeed &&
        responseConfig?.enabled &&
        soloistState.session.currentPhrase.context?.role === 'response' &&
        (responseSignature?.notes?.length ?? 0) > 0
    ) {
        plan.push(
            ...buildResponsePlanFromSignature(
                startStep,
                activeSteps,
                stepsPerMeasure,
                stepsPerBeat,
                intensity,
                responseSignature,
                responseConfig,
                responseMode,
                responseSource,
                rng,
            ),
        );
    } else if (
        ['blues', 'jazz', 'rock', 'scalar'].includes(style) &&
        soloistState.session.currentPhrase.context?.role === 'response' &&
        (soloistState.session.currentPhrase.context?.skeleton?.length ?? 0) > 0 &&
        // why: 80% follow-through is a high-level "answer-mirrors-call" gate. The
        // remaining 20% falls through to the main attack-prob path so the response
        // sometimes breathes its own rhythm — a soloist who replies *identically*
        // every call gets robotic. Draws from the injected seeded stream
        // (Epic 12 S1): deterministic per phrase, but the response/main split
        // still varies phrase-to-phrase because each phrase reseeds on its own
        // (startStep, sessionSteps, loop) — both branches stay reachable.
        rng() < 0.8
    ) {
        const skeleton = soloistState.session.currentPhrase.context.skeleton as Array<
            number | SkeletonNode
        >;
        // why: epic-soloist-idiom S5 — paraphrase = mirror shape AND mark breaths.
        // (1) Preserve source durationSteps so the call's long-long-short-short
        //     contour survives. Pre-fix every entry hardcoded `durationSteps: 1`,
        //     so a sustained-then-comping call always came back as a flat sixteenth
        //     string — see `soloist.md` P0 #3 ("the answer comes back as a uniform
        //     string of 16th-note staccato attacks at the call's positions").
        // (2) Tag mid-phrase phrase-end markers when a sustained attack lands on a
        //     strong beat after some lead-in notes. Previously the response-skeleton
        //     branch only got `isPhraseEnd: true` on its final node (via the trailing
        //     plan[last].isPhraseEnd block below). For longer responses (16+ steps,
        //     6+ attacks), the role-aware landing bias in soloist-pitch-engine.ts
        //     (rhythmNode?.isPhraseEnd === true branch) was only exercised once at
        //     the very end — `soloist.md` P1 #9 calls this out for the monophonic
        //     case; here we close the gap on the skeleton-mirror path too.
        let respNotesInPhrase = 0;
        for (let i = 0; i < skeleton.length; i++) {
            const entry = skeleton[i];
            const rawOffset = typeof entry === 'number' ? entry : entry.stepOffset;
            const relStep = Math.max(0, Math.round(rawOffset || 0));
            // why: legacy entries (or any persisted state pre-S5) might lack
            // duration/velocity. Default `durationSteps: 1` matches the old
            // behavior so back-compat is exact for those entries; velocity
            // defaults to `0.72` matching the response-signature-builder's
            // default (line 138 above) so the two paraphrase paths agree.
            const srcDurationSteps =
                typeof entry === 'number' ? 1 : Math.max(1, Math.round(entry.durationSteps || 1));
            const srcVelocity = typeof entry === 'number' ? 0.72 : entry.velocity || 0.72;

            const stepTarget = startStep + relStep;
            if (stepTarget >= startStep + activeSteps) {
                continue;
            }
            // Clamp duration so a long sustain at the tail doesn't overrun
            // the active phrase (the picker would crop later anyway, but
            // keeping the plan in-bounds avoids confusing downstream consumers).
            const maxDuration = Math.max(1, startStep + activeSteps - stepTarget);
            const durationSteps = Math.min(srcDurationSteps, maxDuration);
            const isSustained = durationSteps > 1;

            const measureStep =
                ((stepTarget % stepsPerMeasure) + stepsPerMeasure) % stepsPerMeasure;
            const stepInBeat = ((measureStep % stepsPerBeat) + stepsPerBeat) % stepsPerBeat;
            const beatInMeasure = Math.floor(measureStep / stepsPerBeat);
            const isBeatStart = stepInBeat === 0;
            const isDownbeat = measureStep === 0;
            const isBackbeat = (beatInMeasure === 1 || beatInMeasure === 3) && isBeatStart;
            // why: derive strong-beat from the response's own meter position only.
            // Inheriting the call's `srcIsStrongBeat` would leak meter context onto
            // response steps that land in positionally weak slots (e.g. a syncopated
            // off-beat skeleton offset), inflating their duration via the line-style
            // strong-beat duration rule at line ~774 below. The pitch picker also
            // reads this flag for landing bias; mixing two meanings into one signal
            // (positional strong vs sourced strong) bleeds across consumers.
            const isStrongBeat = isBeatStart || isDownbeat || isBackbeat;

            // why: response velocity = call velocity rebalanced for the response
            // accent grid. The call's contour (loud-soft-loud-soft) is preserved
            // multiplicatively, but a downbeat in the response still pulls up
            // and an offbeat still pulls down — a paraphrase, not a verbatim copy.
            // Accents kept modest (1.10 / 1.05) so a loud call note mirrored onto
            // a response downbeat doesn't saturate the 1.25 clamp — at 1.20/1.10
            // a `srcVelocity` near the call ceiling would peg every time, flattening
            // exactly the contour peaks the paraphrase is meant to preserve.
            let stepVelocity = srcVelocity * (0.85 + intensity * 0.3);
            if (isDownbeat) {
                stepVelocity *= 1.1;
            } else if (isBackbeat) {
                stepVelocity *= 1.05;
            }

            const remainingSteps = (coordination.sectionEnd || 0) - stepTarget;
            const isFinalMeasure = remainingSteps <= stepsPerMeasure && remainingSteps > 0;
            const isLastInSkeleton = i === skeleton.length - 1;
            // Mid-phrase phrase-end: a sustained landing on a strong beat after
            // ≥4 attacks — the same shape the monophonic main-path uses for its
            // breath-mark, minus the breath-rest (responses don't take breaths
            // inside the skeleton; they paraphrase end-to-end). The pitch picker
            // reads `isPhraseEnd` to bias Response landings toward root/3rd/5th
            // (see soloist-pitch-engine.ts:716 and :1110).
            const isMidPhraseEnd =
                !isLastInSkeleton &&
                isSustained &&
                respNotesInPhrase >= 4 &&
                (isDownbeat || isBeatStart || isFinalMeasure);

            plan.push({
                stepTarget,
                velocity: Math.min(1.25, stepVelocity),
                isStrongBeat,
                durationSteps,
                isSustained,
                vibrato: isSustained,
                isPhraseEnd: isMidPhraseEnd || undefined,
            });
            respNotesInPhrase++;
        }
    } else {
        let sustainStepsRemaining = 0;
        let silenceSteps = stepsPerBeat;
        let phraseCooldownSteps = 0;

        for (let step = startStep; step < startStep + activeSteps; step++) {
            if (sustainStepsRemaining > 0) {
                sustainStepsRemaining--;
                continue;
            }
            if (phraseCooldownSteps > 0) {
                phraseCooldownSteps--;
                silenceSteps++;
                continue;
            }

            // Evaluate everything as if we are on 'step'
            const measureStep = ((step % stepsPerMeasure) + stepsPerMeasure) % stepsPerMeasure;
            const stepInBeat = ((measureStep % stepsPerBeat) + stepsPerBeat) % stepsPerBeat;
            const isOffbeatEighth = stepInBeat === stepsPerBeat / 2;
            const isSixteenthSubdivision = stepInBeat % 2 !== 0;

            // Use stepInfo if available for high-precision meter logic
            const currentStepInfo = _stepInfo && _stepInfo.mStep === measureStep ? _stepInfo : null;

            const isBeatStart = currentStepInfo ? currentStepInfo.isBeatStart : stepInBeat === 0;
            const isDownbeat = currentStepInfo ? currentStepInfo.isMeasureStart : measureStep === 0;
            const isBackbeat = currentStepInfo ? currentStepInfo.isBackbeat : false;
            const isStrongBeat = isBeatStart || isDownbeat || isBackbeat;

            const remainingSteps = coordination.sectionEnd - step;
            const isFinalMeasure = remainingSteps <= stepsPerMeasure && remainingSteps > 0;

            const isSectionDownbeat =
                step === coordination.sectionStart &&
                soloistState.session.phrasing.transitionState === 'lead_in';

            // Meter-Aware Emphasis
            const emphasisIdx = Math.floor((measureStep / stepsPerMeasure) * 16) % 16;
            let baseAttackProb = 0.1;

            if (isDownbeat) {
                baseAttackProb = 0.8;
            } else if (isBackbeat) {
                baseAttackProb = 0.6;
            } else if (isBeatStart) {
                baseAttackProb = 0.4;
            } else if (currentStepInfo?.isPulse) {
                baseAttackProb = 0.5;
            }

            // --- Emphasis Mutation: Prevent Stagnant Rhythms ---
            if (['rock', 'scalar', 'blues'].includes(style)) {
                // Gently shift emphasis based on session progress to prevent 100% predictability
                const mutation = Math.sin((sessionSteps || 0) / 128) * 0.15;
                if (emphasisIdx % 4 !== 0) {
                    // Boost off-beats occasionally
                    baseAttackProb += Math.max(0, mutation);
                } else {
                    // Slightly nudge downbeats
                    baseAttackProb -= Math.max(0, mutation * 0.5);
                }
            }

            const warmUpScale = Math.min(1.0, 0.5 + ((sessionSteps || 0) / 64) * 0.5);

            // --- Genre-Anchored Intensity Scaling ---
            // Use the config's rhythmicDensity as the 'medium' point (0.5 intensity).
            // Scale between 50% and 150% of the baseline density based on intensity.
            const rhythmicDensity = _config.rhythmicDensity || 0.5;
            const densityScale = 0.5 + intensity * 1.0; // 0.5 to 1.5 multiplier
            // why: epic-form-arrangement S6 — +15% density per loop. Pitch engine
            // already escalates devices +20%/loop (soloist-pitch-engine.ts:1004);
            // rhythm side now mirrors. Loop 0 unchanged; Loop 2 → density ×1.30;
            // Loop 3 → ×1.45. Capped at loopCount=4 (×1.60) so unbounded loop
            // counts don't drive attackProb into permanent saturation — the
            // pitch engine clamps device boost at loopCount=3 in liveLoopLift
            // (soloist-pitch-engine.ts:395); we follow the same ceiling spirit.
            // why placement: epic-coordination-consistency S5.a — multiplier applied
            // as final-stage post-multiplier on `attackProb` below (just before the
            // attack-jitter), NOT on `densityScale` here. Reason: four downstream
            // additive boosts (`+= 0.4` Dynamic-Head seed, `+= 0.2` downbeat,
            // `+= 0.2` kick, `+= 0.2` snare) bypass any multiplier sitting on
            // densityScale — a 0.5 → 0.65 bump on the base gets washed when the
            // additive boosts stack the prob to 0.9+. Canonical pattern is
            // weight-tuning-multiplier-placement (project memory). Loop 0 still
            // unchanged because the multiplier site below is gated `loopForRhythm > 0`.
            const loopForRhythm = Math.min(4, Math.max(0, loopCount));
            const intensityScale = rhythmicDensity * densityScale * 2.0; // Normalized to ~1.0 at medium

            let attackProb = baseAttackProb * intensityScale * warmUpScale;

            if (isLineStyle) {
                attackProb *= 1.05 + intensity * 0.1;
                if (isBeatStart || isOffbeatEighth) {
                    attackProb *= 1.2;
                } else if (isSixteenthSubdivision) {
                    attackProb *= intensity > 0.72 ? 1.0 : 0.72;
                }
            }

            // --- Rock Profile Bursts (EVH / Beck) ---
            if ((style === 'rock' || style === 'scalar') && intensity > 0.65) {
                const profile = soloistState.session.currentPhrase.context?.profile;
                if (profile === 'evh' || profile === 'beck') {
                    if (stepInBeat % 2 !== 0) {
                        attackProb *= 1.6; // Boost 16ths for shreddy/unpredictable feel
                    }
                }
            }

            // Apply persistent rhythmic entropy if set
            if (soloistState.session.rhythm.entropy !== undefined) {
                // rhythmicEntropy ranges roughly from -1.0 to 1.0.
                // Using multiplicative scaling to keep bounds somewhat reasonable.
                attackProb *= 1.0 + soloistState.session.rhythm.entropy * 0.5;
            }

            // Syncopation Arc: gently favor syncopation as the session progresses
            // Driven by sessionSteps over multiple choruses (e.g., 256 steps = 16 measures)
            const driftFactor = Math.sin(((sessionSteps || 0) / 512) * Math.PI); // Half-cycle every 16 measures
            if (driftFactor > 0.0) {
                const isSixteenthNote = stepInBeat % 2 !== 0; // Offbeat
                if (isSixteenthNote) {
                    attackProb *= 1.0 + driftFactor * 1.0; // Boost offbeats during drift
                } else {
                    attackProb *= 1.0 - driftFactor * 0.15; // Slightly suppress downbeats
                }
            }

            // Phrase Contextual Scaling (Fatigue)
            if (notesInPhrase > 8) {
                attackProb *= 0.8;
            }
            if (isMonophonicMode) {
                if (silenceSteps >= stepsPerBeat) {
                    attackProb *= isBeatStart || isDownbeat ? 1.12 : 0.84;
                }
                if (!isStrongBeat && notesInPhrase >= 4) {
                    attackProb *= 0.72;
                }
                if (!isDownbeat && notesInPhrase >= 6) {
                    attackProb *= 0.52;
                }
                if (notesInPhrase >= 3 && isOffbeatEighth) {
                    attackProb *= isLineStyle ? 0.88 : 0.78;
                }
                if (notesInPhrase >= 2 && isSixteenthSubdivision) {
                    attackProb *= isLineStyle ? 0.72 : 0.58;
                }
            }

            // Rhythmic Simplification at Low Intensity:
            if (intensity < 0.4) {
                if (isSixteenthSubdivision) {
                    attackProb *= intensity * 1.5; // Drastic penalty for 16ths
                } else if (isOffbeatEighth) {
                    attackProb *= 0.4 + intensity; // Moderate penalty for offbeat 8ths
                }
            }

            // --- Dynamic Head: Rhythmic Seeding ---
            const sessionSeed = soloistState.session.seed;
            if (sessionSeed && sessionSeed.notes.length > 0) {
                const { notes, loopLengthSteps } = sessionSeed;
                const stepInLoop = step % loopLengthSteps;
                const hasSeedNote = notes.some((n: any) => n.step === stepInLoop);
                if (hasSeedNote) {
                    attackProb += 0.4; // Strong boost for seed points
                }
            }

            if (isFinalMeasure && soloistState.session.phrasing.transitionState === 'lead_in') {
                attackProb *= 1.5;
            }

            // PRE-HEAT: Boost density during count-in (negative steps)
            if (step < 0 && soloistState.session.phrasing.transitionState === 'lead_in') {
                attackProb *= 1.8;
            }

            // Boost downbeats to ensure resolution
            if (isDownbeat) {
                attackProb += 0.2;
            }

            // Since we are projecting into the future, coordination stepCoordination might not match perfectly,
            // but we'll use stepCoord for the *current* real step if we want, or ignore it for future steps.
            // Actually, coordination.stepCoordination is only for the current real step.
            // We'll leave it out of the future projection, or use a pseudo-kick map if needed.
            // Let's keep it simple and just use the step coordinate if it's the exact current step:
            if (step === startStep) {
                const stepCoord = coordination.stepCoordination || {};
                if (stepCoord.kickHit) {
                    attackProb += 0.2;
                }
                if (stepCoord.snareHit) {
                    attackProb += 0.2;
                }
            }

            // Turnaround Flourishes (Structural Signaling)
            const stepCoord = coordination.stepCoordination || {};
            if (stepCoord.isMeasureEnd) {
                attackProb *= 1.3; // Boost density at measure ends
            }

            // --- Jazz Specifics ---
            if (isLineStyle) {
                const profile = soloistState.session.currentPhrase.context?.profile;
                // Double-time bursts for Bird/Coltrane
                if ((profile === 'bird' || profile === 'coltrane') && intensity > 0.7) {
                    if (isSixteenthSubdivision) {
                        attackProb *= 1.5; // Favor 16ths
                    }
                }
            }

            if (coordination.bypassRhythm) {
                attackProb = 1.0;
            }
            if (isSectionDownbeat) {
                attackProb = 1.0;
            }

            // why: epic-coordination-consistency S5.a — +15%/loop density bump
            // applied here as a final-stage multiplier on `attackProb` AFTER all
            // additive boosts (seed +0.4, downbeat/kick/snare/measureEnd +0.2)
            // and the bypass overrides, mirroring the pitch-engine final-stage
            // weight-multiplier pattern (project memory:
            // feedback_weight_tuning_multiplier_placement). Placing it on
            // `densityScale` (where it originally lived in epic-form-arrangement
            // S6) gets washed out in production when additive boosts stack
            // `attackProb` to 1.0+ before the multiplier — the existing critique
            // fixture doesn't exercise those active-coordination boosts (no
            // kickHit/snareHit/seed in its synthetic stepCoordination), so the
            // realized fixture delta is unchanged at +25%; the production
            // delta is expected to track closer to audit-doc target +30% once
            // a fixture extension exercises active coordination (filed for
            // FOLLOWUPS §F). Gated `attackProb < 1.0` so the bypassRhythm /
            // isSectionDownbeat forced-attack landmarks stay at exactly 1.0 —
            // the multiplier can't saturate further beyond a guaranteed hit.
            if (loopForRhythm > 0 && attackProb < 1.0) {
                attackProb *= 1 + loopForRhythm * 0.15;
            }

            // why: epic-form-arrangement S6 — attack-jitter grows +5%/loop.
            // Final-stage multiplier (after bypassRhythm/isSectionDownbeat
            // overrides so cadence/downbeat anchors stay at 1.0; the jitter
            // can only nudge those *down* below 1.0, never produce a missed
            // forced attack). Draws from the injected `rng` stream (Epic 12
            // S1): deterministic per phrase by construction. The loop-count-
            // isolation test injects its OWN stream (re-seeded identically per
            // call) so Loop 0 and Loop 2 see the same RNG sequence and the
            // divergence is attributable to the loop-count branches alone —
            // the test seam this comment formerly described is preserved via
            // the `random` parameter, not a bare `Math.random()`. Skipped at
            // loopCount=0 so Loop 0 (The Head) stays exactly as before.
            if (loopForRhythm > 0 && attackProb < 1.0) {
                const attackJitter = loopForRhythm * 0.05;
                attackProb *= 1 + (rng() - 0.5) * 2 * attackJitter;
            }

            if (rng() <= attackProb) {
                if (isMonophonicMode && silenceSteps >= stepsPerBeat) {
                    notesInPhrase = 0;
                }
                notesInPhrase++;
                silenceSteps = 0;
                const isBebopStyle =
                    style === 'bird' ||
                    soloistState.session.currentPhrase.context?.profile === 'bird' ||
                    soloistState.session.currentPhrase.context?.profile === 'coltrane';

                let stepVelocity = 0.6 + intensity * 0.4;
                if (isDownbeat) {
                    stepVelocity *= 1.25;
                } else if (isBackbeat) {
                    stepVelocity *= 1.15;
                } else if (isBeatStart || stepInBeat === stepsPerBeat / 2) {
                    stepVelocity *= 1.05;
                }

                // Jazz Ghosting
                if ((style === 'jazz' || style === 'bird') && !isBeatStart && rng() < 0.4) {
                    stepVelocity *= 0.6; // Soft ghost note
                }

                // --- STRATEGIC SUSTAIN LOGIC ---
                let isSustained = false;
                const baseSustainProb = _config.sustainProb || 0;
                let finalSustainProb = baseSustainProb;

                // 1. Resolution Hold: Boost sustain if we land on a strong beat after a period of density
                if (!isBebopStyle && notesInPhrase >= 6 && (isDownbeat || isBeatStart)) {
                    finalSustainProb += 0.3 * intensity;
                }

                // 2. Structural Bridge: Sustain leading into or across section boundaries
                if (isFinalMeasure && stepInBeat >= stepsPerBeat / 2) {
                    finalSustainProb += 0.4;
                }

                // 3. Dynamic Contrast: Sparse sections favor holding notes
                if (
                    soloistState.session.rhythm.entropy !== undefined &&
                    soloistState.session.rhythm.entropy < -0.3
                ) {
                    finalSustainProb += 0.2;
                }

                // 4. Greats Profiles: Gilmour-specific lyrical sustain
                if (soloistState.session.currentPhrase.context?.profile === 'gilmour') {
                    finalSustainProb += 0.2;
                }

                if (isBebopStyle) {
                    finalSustainProb *= 0.55;
                }

                if (rng() < finalSustainProb) {
                    isSustained = true;
                    // Held for a logical amount of time (4 steps = 1 beat, 8 steps = 2 beats)
                    const maxSustain = _config.maxSustainSteps || 8;
                    const sustainLength = isBebopStyle
                        ? 2 + Math.floor(rng() * 3)
                        : Math.floor(3 + rng() * maxSustain);
                    sustainStepsRemaining = sustainLength;
                }

                const shouldCreatePhraseBreath =
                    isMonophonicMode &&
                    isSustained &&
                    notesInPhrase >= 4 &&
                    (isDownbeat || isBeatStart || isFinalMeasure);

                plan.push({
                    stepTarget: step,
                    velocity: Math.min(1.25, stepVelocity),
                    isStrongBeat: isBeatStart || isDownbeat || isBackbeat,
                    durationSteps: isSustained ? sustainStepsRemaining + 1 : 1,
                    isSustained,
                    vibrato: isSustained,
                });
                if (shouldCreatePhraseBreath) {
                    // The note we just pushed is the last attack before a rest
                    // the pitch picker uses isPhraseEnd to bias the landing
                    // tone by role (Response → root/5th; Call → suspended).
                    plan[plan.length - 1].isPhraseEnd = true;
                    phraseCooldownSteps = Math.max(
                        phraseCooldownSteps,
                        Math.max(1, stepsPerBeat / 2),
                    );
                    notesInPhrase = 0;
                }
            } else {
                silenceSteps++;
            }
        }
    }

    // --- Rhythmic Mirroring Fallback ---
    // (If mirroring logic didn't push anything, ensuring we have a valid plan object)
    if (plan.length === 0 && coordination.bypassRhythm) {
        plan.push({
            stepTarget: startStep,
            velocity: 0.8,
            isStrongBeat: true,
            durationSteps: activeSteps,
            isSustained: false,
            vibrato: false,
        });
    }

    if (style === 'blues' && plan.length < minPhraseNotes && activeSteps > 0) {
        const occupiedSteps = new Set(plan.map((node) => node.stepTarget));
        const candidateSteps: any[] = [];
        const minimumSpacing = Math.max(2, Math.floor(stepsPerBeat / 2));

        for (let step = startStep; step < startStep + activeSteps; step++) {
            if (occupiedSteps.has(step)) {
                continue;
            }

            const measureStep = ((step % stepsPerMeasure) + stepsPerMeasure) % stepsPerMeasure;
            const stepInBeat = ((measureStep % stepsPerBeat) + stepsPerBeat) % stepsPerBeat;
            const isBeatStart = stepInBeat === 0;
            const isOffbeatEighth = stepInBeat === stepsPerBeat / 2;

            if (!isBeatStart && !isOffbeatEighth) {
                continue;
            }

            const tooCloseToExistingAttack = plan.some(
                (node) => Math.abs(node.stepTarget - step) < minimumSpacing,
            );
            if (tooCloseToExistingAttack) {
                continue;
            }

            const beatInMeasure = Math.floor(measureStep / stepsPerBeat);
            const isDownbeat = measureStep === 0;
            const isBackbeat = (beatInMeasure === 1 || beatInMeasure === 3) && isBeatStart;
            const isStrongBeat = isBeatStart || isDownbeat || isBackbeat;

            candidateSteps.push({
                stepTarget: step,
                velocity: Math.min(1.1, (0.58 + intensity * 0.34) * (isStrongBeat ? 1.08 : 0.94)),
                isStrongBeat,
                durationSteps: isStrongBeat ? Math.max(2, Math.floor(stepsPerBeat * 0.75)) : 1,
                isSustained: false,
                vibrato: false,
                priority: isStrongBeat ? 0 : 1,
            });
        }

        candidateSteps.sort((a, b) => a.priority - b.priority || a.stepTarget - b.stepTarget);

        for (const candidate of candidateSteps) {
            if (plan.length >= minPhraseNotes) {
                break;
            }

            const clashesWithInsertedAttack = plan.some(
                (node) => Math.abs(node.stepTarget - candidate.stepTarget) < minimumSpacing,
            );
            if (clashesWithInsertedAttack) {
                continue;
            }

            plan.push(candidate);
        }

        plan.sort((a, b) => a.stepTarget - b.stepTarget);
    }

    plan.sort((a, b) => a.stepTarget - b.stepTarget);

    // The final node of every plan-build is a phrase end: the next plan-build
    // call picks a new role, so this attack is musically the last note of the
    // current role's phrase. Idempotent with the breath-mark above when they
    // land on the same node.
    if (plan.length > 0) {
        plan[plan.length - 1].isPhraseEnd = true;
    }

    // Default flags for mirroring or other paths
    plan.forEach((node) => {
        if (node.isSustained === undefined) {
            node.isSustained = false;
        }
        if (node.vibrato === undefined) {
            node.vibrato = false;
        }
    });

    // Calculate durations based on gaps
    for (let i = 0; i < plan.length; i++) {
        const current = plan[i];
        const next = i < plan.length - 1 ? plan[i + 1] : null;
        // The last note can ring out until the end of the active phrase
        const gap = next
            ? next.stepTarget - current.stepTarget
            : Math.max(1, startStep + activeSteps - current.stepTarget);

        let baseDuration = gap;
        if (current.isSustained) {
            baseDuration = current.durationSteps;
        } else if (['funk', 'disco', 'ska'].includes(style)) {
            baseDuration = 1;
        } else if (isLineStyle) {
            baseDuration = Math.min(gap, current.isStrongBeat ? 4 : 2);
        } else if (['blues', 'neo'].includes(style)) {
            baseDuration = gap;
        } else {
            baseDuration = Math.min(gap, 4);
        }
        if (isMonophonicMode) {
            if (current.isStrongBeat) {
                baseDuration = Math.min(
                    gap,
                    Math.max(baseDuration, current.isSustained ? stepsPerBeat + 1 : 3),
                );
            } else if (!current.isSustained) {
                baseDuration = Math.min(baseDuration, 2);
            }
        }

        // Scale final duration slightly by overall band intensity
        current.durationSteps = Math.max(1, Math.round(baseDuration * (0.8 + intensity * 0.4)));
        if (style === 'blues' && current.isSustained && current.isStrongBeat) {
            // Let blues anchors ring a touch longer so the line feels sung instead of clipped.
            current.durationSteps += 1;
        }
        // Ensure duration doesn't exceed gap (unless it's the last note and we allow ringing, though even then we cap it)
        if (next && current.durationSteps > gap) {
            current.durationSteps = gap;
        }
    }

    return plan;
}
