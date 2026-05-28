import {
    applyStandardBase,
    compoundHatAllowed,
    compoundKickAllowed,
    DEFAULT_CONFIG,
    type DrumStepBase,
    type GrooveContext,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.05,
};

export function getMotif(_sectionSeed: number, drumComplexity: number, intensity: number): number {
    if (drumComplexity <= 0.2 || intensity < 0.3) {
        return 0; // Ultralight
    }
    if (intensity < 0.7) {
        return 1; // Sparse
    }
    return 2; // Slightly more active
}

export function applyOverrides(context: GrooveContext, state: DrumStepBase): DrumStepBase {
    const result = applyStandardBase(context, state);
    if (result.muted) {
        return result.base;
    }
    const { base } = result;

    const {
        isDownbeat,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        isPulseStart,
        isCompound,
        groupIndex,
        beatIndex,
        drumComplexity,
        sectionSeed,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity } = base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // why: epic-2 S6 — the kick's mid-bar accent is "the bar's second strong beat".
    // In 4/4 that's beat 3 (beatIndex 2). In compound (6/8/12/8, stepsPerBeat=2)
    // beatIndex 2 is mStep 4 — a weak position inside the first group, NOT a
    // dotted-quarter pulse. Keying on beatIndex===2 left the secondary pulse silent
    // (compoundKickAllowed can filter but can't add a hit), collapsing the meter to a
    // single downbeat. Read it meter-relative as the *single* mid-bar pulse so minimal
    // keeps its sparse "1 and 3" identity in every meter: the pulse at the middle
    // group — 6/8 [3,3] → group 1 (mStep 6); 12/8 [3,3,3,3] → group 2 (mStep 12),
    // i.e. 2/bar, NOT four-on-the-pulse.
    const midGroup = Math.floor((context.tsConfig?.grouping?.length ?? 2) / 2);
    const isSecondStrongBeat = isCompound
        ? isPulseStart && groupIndex === midGroup
        : isBeatStart && beatIndex === 2;

    if (context.inst.name === 'Kick') {
        shouldPlay = false;
        if (isDownbeat) {
            shouldPlay = true;
        } else if (activeMotif === 1 && isSecondStrongBeat) {
            shouldPlay = true; // Beat 3 in 4/4; second pulse in compound
        } else if (activeMotif === 2) {
            if (isSecondStrongBeat) {
                shouldPlay = true;
            } else if (isOffbeat && beatIndex === 1) {
                shouldPlay = true; // Syncopation on the "and" of 2
            }
        }
        // why: epic-2 S6 — density safety-net over the predicates above.
        // isSecondStrongBeat already anchors both 6/8 pulses, but the motif-2
        // "and of 2" syncopation (isOffbeat && beatIndex===1) lands mid-group in
        // compound; compoundKickAllowed trims it so compound stays at the idiomatic
        // 2/bar (4/bar at intensity > 0.7 via the and-of-pulse slot). Simple meters
        // pass through unconditionally, so no if(isCompound) wrapper is needed.
        if (shouldPlay && !compoundKickAllowed(context)) {
            shouldPlay = false;
        }
    } else if (context.inst.name === 'Snare') {
        shouldPlay = false;
        // Metronomic backbeat
        if (isBackbeat) {
            shouldPlay = true;
            velocity = 0.8;
            if (intensity < 0.8) {
                soundName = 'Sidestick';
            } else {
                soundName = 'Snare';
            }
        }
    } else if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        shouldPlay = false;
        if (isDownbeat) {
            shouldPlay = true;
            velocity = 0.7;
        } else if (activeMotif === 1 && isBeatStart) {
            shouldPlay = true;
            velocity = 0.6;
        } else if (activeMotif === 2 && (isBeatStart || isOffbeat)) {
            // why: isOffbeat is non-optional on GrooveContext (utils.ts:28); the
            // old safeIsOffbeat fallback that keyed on loopStep%(stepsPerBar/8)===2
            // was dead code — context.isOffbeat is always populated by getStepInfo.
            shouldPlay = true;
            velocity = 0.4;
        }
        // why: epic-2 S6 — minimal's hat is a secondary voice (not a shimmer
        // time-keeper), so 'sparse' profile is correct. In 6/8 the predicates
        // above fire on every isBeatStart (every step), producing 12 hits/bar.
        // compoundHatAllowed trims to 2/bar at low intensity, 4/bar at mid,
        // 10/bar at high. 'Open' structural accents pass through unconditionally.
        if (shouldPlay && !compoundHatAllowed(context, { profile: 'sparse', soundName })) {
            shouldPlay = false;
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
