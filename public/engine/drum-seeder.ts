import { TIME_SIGNATURES } from '../config.js';
import type { ArrangerState } from '../state/arranger.js';
import type { EnsembleState } from '../types.js';
import { createPRNG, generateRandomSeed } from '../utils.js';
import { unrollArrangement } from './arranger-utils.js';
import { generateDeterministicFill } from './fills.js';

/**
 * Drum Seeder Module (Phase 1, 2 & 3)
 * Generates an orchestration map, fill map, and accent map for the entire song arrangement.
 */

export interface OrchestrationMapEntry {
    start: number;
    end: number;
    /** Cymbal/Timekeeping voice ('HiHat-Closed', 'HiHat-Open', 'Ride', 'Ride-Bell', 'Tom-Groove'). */
    rideVoice: string;
    /** Snare voicing ('Sidestick', 'Snare', 'None'). */
    snareVoice: string;
    /** Rhythmic density (0-3). */
    motifComplexity: number;
    /** Pre-calculated section energy (0.0 - 1.0). */
    energyLevel: number;
}

export interface FillMapEntry {
    steps: Record<number, { name: string; vel: number }[]>;
    length: number;
    crash: boolean;
}

export interface AccentCatch {
    /** Catch type ('crash-catch', 'snare-stab', 'hat-bark'). */
    type: string;
    velocity: number;
}

/**
 * Generates a song-wide orchestration map for the drummer.
 */
export function generateDrumOrchestration(
    _state: EnsembleState,
    arranger: ArrangerState,
    _style: string,
    intensity: number,
    seedStr?: string,
): OrchestrationMapEntry[] {
    const unrolled = unrollArrangement(arranger, 128);
    const { sectionMap } = unrolled;

    if (!sectionMap || sectionMap.length === 0) {
        return [];
    }

    const prng = createPRNG(seedStr || generateRandomSeed());
    const orchestrationMap: OrchestrationMapEntry[] = [];

    sectionMap.forEach((sectionRange: any) => {
        const label = (sectionRange.label || 'Verse').toLowerCase();
        const sourceLabels: string[] = Array.isArray(sectionRange.sourceLabels)
            ? sectionRange.sourceLabels
            : [sectionRange.label || ''];
        const hasActualIntroLikeLabel = sourceLabels.some((sourceLabel) => {
            const normalized = String(sourceLabel).toLowerCase();
            return (
                normalized.includes('intro') ||
                normalized.includes('break') ||
                normalized.includes('breakdown')
            );
        });
        // why: epic-deferred-followups S1(b) — a "Drop" is the energy PEAK of
        // the form (form-analysis.ts maps drop=1.0 vs chorus=0.9), not a plain
        // chorus. Aliasing `drop`→`Chorus` here erased that. Give Drop its own
        // role so the energy boost reflects the label; ride/snare/motif still
        // mirror Chorus (a drop drum part IS a maxed-out chorus drum part).
        // "breakdown" is intentionally NOT routed to a peak role — it is the
        // energy FLOOR (form-analysis.ts maps breakdown=0.3); it falls through
        // to Verse / the low-energy gates below, which is musically correct.
        const role = label.includes('intro')
            ? 'Intro'
            : label.includes('drop')
              ? 'Drop'
              : label.includes('chorus')
                ? 'Chorus'
                : label.includes('outro') || label.includes('end')
                  ? 'Outro'
                  : label.includes('bridge')
                    ? 'Bridge'
                    : 'Verse';

        // 1. Calculate Section Energy Level
        let energyLevel = intensity;
        if (role === 'Intro') {
            energyLevel -= 0.2;
        }
        if (role === 'Chorus') {
            energyLevel += 0.2;
        }
        // why: a Drop is the energy ceiling of the form (form-analysis.ts:
        // drop=1.0 vs chorus=0.9). +0.3 lifts it above Chorus's +0.2 so the
        // seeder's energy-gated decisions (motif complexity, ride wash) reflect
        // "this is the biggest section." Note `energyLevel` is clamped to 1.0
        // below, so the boost only separates Drop from Chorus in the mid
        // intensity band (~0.5–0.7); above that both saturate at the ceiling.
        if (role === 'Drop') {
            energyLevel += 0.3;
        }
        if (role === 'Outro') {
            energyLevel -= 0.3;
        }
        energyLevel = Math.max(0.1, Math.min(1.0, energyLevel));

        // 2. Select Ride Voice
        // why: Drop shares Chorus's ride logic — a drop drum part is a maxed-out
        // chorus part, so the same energy-gated Ride/Open selection applies.
        let rideVoice = 'HiHat-Closed';
        if (role === 'Chorus' || role === 'Drop') {
            const r = prng();
            // At higher intensities, prefer ride definition over fully open wash.
            if (energyLevel > 0.82) {
                rideVoice = r > 0.15 ? 'Ride' : 'Open';
            } else if (energyLevel > 0.7) {
                rideVoice = r > 0.25 ? 'Ride' : 'HiHat-Closed';
            } else {
                rideVoice = r > 0.7 ? 'Ride' : 'HiHat-Closed';
            }
        } else if (role === 'Bridge') {
            rideVoice = prng() > 0.5 ? 'Tom-Groove' : 'HiHat-Closed';
        } else if (role === 'Verse' && energyLevel > 0.6) {
            rideVoice = prng() > 0.7 ? 'Ride' : 'HiHat-Closed';
        }

        // 3. Select Snare Voice
        let snareVoice = 'Snare';
        const isRockFeel =
            _style === 'Rock' ||
            _style === 'Metal' ||
            // why: genreFeel for the Ska-Punk genre is 'Ska' (smart-genres.ts), not
            // the preset name — the old 'Ska-Punk' key never matched, so Ska-Punk's
            // punchy backbeat could wrongly drop to sidestick at low energy. Epic 2 S1.
            _style === 'Ska' ||
            _style === 'Country';

        if (isRockFeel) {
            // Rock almost ALWAYS uses a full snare for the backbeat.
            // Only use Sidestick in very quiet ACTUAL intros or breakdowns,
            // not just because the macro-form treats the first pass as an intro.
            if (energyLevel <= 0.12 && hasActualIntroLikeLabel) {
                snareVoice = 'Sidestick';
            }
        } else if (_style === 'Disco') {
            // Even at medium energy, Disco needs a clear snare backbeat.
            // Reserve sidestick only for truly low-energy intros.
            if (energyLevel < 0.2 && role === 'Intro') {
                snareVoice = 'Sidestick';
            }
        } else {
            // Standard logic for Jazz/Bossa/Funk/Acoustic
            if (energyLevel < 0.4 && (role === 'Intro' || role === 'Verse')) {
                snareVoice = 'Sidestick';
            } else if (role === 'Intro' && energyLevel < 0.3) {
                snareVoice = 'None';
            }
        }

        // 4. Calculate Motif Complexity
        let motifComplexity = 1; // Standard
        if (energyLevel < 0.3) {
            motifComplexity = 0; // Pocket
        }
        if (energyLevel > 0.7) {
            motifComplexity = 2; // Active
        }
        if (energyLevel > 0.85) {
            motifComplexity = 3; // Busy
        }

        orchestrationMap.push({
            start: sectionRange.start,
            end: sectionRange.end,
            rideVoice,
            snareVoice,
            motifComplexity,
            energyLevel,
        });
    });

    return orchestrationMap;
}

/**
 * Generates a song-wide fill map for the drummer.
 */
export function generateDrumFills(
    state: EnsembleState,
    arranger: ArrangerState,
    genre: string,
    intensity: number,
    seedStr?: string,
): Record<number, FillMapEntry> {
    const unrolled = unrollArrangement(arranger, 128);
    const { sectionMap } = unrolled;

    if (!sectionMap || sectionMap.length === 0) {
        return {};
    }

    const prng = createPRNG(seedStr || generateRandomSeed());
    const fillMap: Record<number, FillMapEntry> = {};
    const isVirtualMacroForm = unrolled.totalSteps !== unrolled.originalSteps;

    const tsConfig = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerMeasure = tsConfig.beats * tsConfig.stepsPerBeat;

    // Orchestration is needed to check energy levels for the "Crash Contract"
    const orchestrationMap = generateDrumOrchestration(state, arranger, genre, intensity, seedStr);

    sectionMap.forEach((sectionRange: any, index: number) => {
        // Keep the generated "Outro" quiet at the end of virtual macro form.
        if (isVirtualMacroForm && index === sectionMap.length - 1) {
            return;
        }

        const nextIndex = index === sectionMap.length - 1 ? 0 : index + 1;
        const nextSection = sectionMap[nextIndex];
        const currentOrch = orchestrationMap[index];
        const nextOrch = orchestrationMap[nextIndex];

        if (!currentOrch || !nextOrch || !nextSection) {
            return;
        }

        const nextArrangerSection = arranger.sections?.find(
            (section: any) => section.id === nextSection.id,
        );
        if (nextArrangerSection?.seamless) {
            return;
        }

        const currentLabel = String(sectionRange.label || '').toLowerCase();
        const nextLabel = String(nextSection.label || '').toLowerCase();
        const energyDelta = nextOrch.energyLevel - currentOrch.energyLevel;
        const isStructuralChorus = nextLabel.includes('chorus') || nextLabel.includes('drop');
        const isLoopReturn = !isVirtualMacroForm && nextIndex === 0;
        const isRoleChange = currentLabel !== nextLabel;

        // 1. Decide if we need a fill
        // Keep general fill density moderate, but make important returns read more clearly.
        let fillProb = 0.35 + intensity * 0.35;
        if (isStructuralChorus && intensity > 0.35) {
            fillProb = 1;
        } else if (isLoopReturn && intensity > 0.45) {
            fillProb = Math.max(fillProb, 0.9);
        } else if (energyDelta > 0.1) {
            fillProb = Math.max(fillProb, 0.72);
        } else if (isRoleChange && intensity > 0.55) {
            fillProb = Math.max(fillProb, 0.68);
        }
        if (prng() > fillProb) {
            return;
        }

        // 2. Identify fill start step (Start of the last measure of the current section)
        const measuresInSection = (sectionRange.end - sectionRange.start) / stepsPerMeasure;
        if (measuresInSection < 1) {
            return; // Too short for a proper fill
        }

        const fillStartStep = sectionRange.end - stepsPerMeasure;

        // 3. Generate the fill
        // Fills are generated for the last measure of the section.
        // We use the energy level of the CURRENT section for the fill's intensity.
        const fillSteps = generateDeterministicFill(
            genre,
            currentOrch.energyLevel,
            stepsPerMeasure,
            prng,
        );

        // 4. Determine "Crash Contract"
        // Only crash if energy is rising or it's a major structural return (e.g. into Chorus)
        const energyRising = energyDelta > 0;
        const pendingCrash = energyRising || (isStructuralChorus && nextOrch.energyLevel > 0.4);

        fillMap[fillStartStep] = {
            steps: fillSteps,
            length: stepsPerMeasure,
            crash: pendingCrash,
        };
    });

    return fillMap;
}

/**
 * Generates a song-wide accent map for catching soloist peaks.
 */
export function generateSoloistAccents(
    _state: EnsembleState,
    arranger: ArrangerState,
    soloistSeed: { notes: any[] },
    genre: string,
    intensity: number,
    seedStr?: string,
): Record<number, AccentCatch> {
    if (!soloistSeed?.notes || soloistSeed.notes.length === 0) {
        return {};
    }

    const prng = createPRNG(seedStr || generateRandomSeed());
    const accentMap: Record<number, AccentCatch> = {};

    const tsConfig = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBeat = tsConfig.stepsPerBeat;

    let lastCatchStep = -100;
    const catchCooldown = stepsPerBeat * 4; // Max 1 catch every 4 beats (1 bar in 4/4)

    soloistSeed.notes.forEach((note) => {
        // --- POCKET DISCIPLINE ---
        // Skip accents during the first iteration (The Head) to keep the initial groove metronomic.
        if (note.step < (arranger.totalSteps || 0)) {
            return;
        }

        // 1. Filter for valid accents
        // - Peak velocity (> 0.85)
        // - OR Highly syncopated (not on a main beat start)
        const isOffbeat = note.step % stepsPerBeat !== 0;
        const isStrongAccent = note.velocity > 0.85;

        if (isStrongAccent || (isOffbeat && note.velocity > 0.75 && intensity > 0.6)) {
            // Apply cooldown to prevent clutter
            if (note.step - lastCatchStep < catchCooldown) {
                return;
            }

            // Probability check based on overall intensity
            if (prng() > 0.3 + intensity * 0.4) {
                return;
            }

            // 2. Select catch type based on genre
            let type = 'snare-stab';
            if (genre === 'Jazz' || genre === 'Blues') {
                type = 'snare-stab'; // Jazz catching is usually snare+kick, no crash
            } else if (genre === 'Funk' || genre === 'Disco' || genre === 'Bossa Nova') {
                type = prng() > 0.5 ? 'hat-bark' : 'snare-stab';
            } else {
                // Rock / Ska / Metal: Use Crash for high-velocity peaks
                type = isStrongAccent ? 'crash-catch' : 'snare-stab';
            }

            accentMap[note.step] = {
                type,
                velocity: Math.min(1.2, note.velocity + 0.2),
            };
            lastCatchStep = note.step;
        }
    });

    return accentMap;
}
