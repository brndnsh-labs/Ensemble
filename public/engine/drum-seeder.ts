import { getEffectiveMeterAtStep, getEffectiveTimeSignature } from '../meter.js';
import { getSectionEnergy } from '../song/form-analysis.js';
import type { ArrangerState } from '../state/arranger.js';
import type { EnsembleState } from '../types.js';
import { generateRandomSeed } from '../utils.js';
import { unrollArrangement } from './arranger-utils.js';
import { shouldFireDropMute } from './drop-mechanic.js';
import { generateDeterministicFill } from './fills.js';
import { isBackbeatAdjacentStep } from './grooves/utils.js';
import { createPRNG } from './hash-utils.js';

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
    /** A rehearsed recurrence of an earlier Rock Chorus catch. */
    role?: 'section-return';
}

interface ChorusRange {
    start: number;
    end: number;
    label: string;
    normalizedLabel: string;
    timeSignature: string;
    stepsPerBar: number;
}

/**
 * Normalize occurrence suffixes without collapsing genuinely different Chorus
 * names. `Chorus 1`, `Chorus-2`, and `Chorus III` match; `Chorus A` and
 * `Chorus B` remain distinct. Pre-choruses and other labels never qualify.
 */
function normalizeRepeatedChorusLabel(label: unknown): string | null {
    const normalized = String(label || '')
        .trim()
        .toLowerCase()
        .replace(/[-_–—]+/g, ' ')
        .replace(/\s+/g, ' ');
    if (!/^chorus(?:\s|$)/.test(normalized)) {
        return null;
    }
    return normalized.replace(/\s+(?:\(?\d+\)?|[ivx]+)$/i, '').trim();
}

/**
 * Let one eligible Rock catch become a tiny piece of arrangement memory.
 *
 * The base-form entries are dormant templates for section-practice folding:
 * practice playback repeatedly asks the engine for the same folded chart step,
 * so an absolute-only return would disappear there. The audible lookup keeps
 * these templates silent during the normal Head and activates them only on a
 * later loop or while practice looping. Absolute later-Chorus entries preserve
 * the same section-relative offset for ordinary playback and export.
 */
function seedRockSectionReturns(
    accentMap: Record<number, AccentCatch>,
    arranger: ArrangerState,
    soloistSeed: { notes: any[]; loopLengthSteps?: number },
): void {
    const totalSteps = arranger.totalSteps || 0;
    if (totalSteps <= 0 || !Array.isArray(arranger.sectionMap)) {
        return;
    }

    const chorusRanges: ChorusRange[] = arranger.sectionMap
        .map((section: any) => {
            const start = Number(section?.start);
            const meter = getEffectiveMeterAtStep(arranger, start);
            return {
                start,
                end: Number(section?.end),
                label: String(section?.label || ''),
                normalizedLabel: normalizeRepeatedChorusLabel(section?.label) || '',
                timeSignature: meter.stepInfo.tsName || arranger.timeSignature || '4/4',
                stepsPerBar: meter.ts.beats * meter.ts.stepsPerBeat,
            };
        })
        .filter(
            (section) =>
                section.normalizedLabel.length > 0 &&
                Number.isFinite(section.start) &&
                Number.isFinite(section.end) &&
                section.start >= 0 &&
                section.end > section.start &&
                section.end <= totalSteps,
        )
        .sort((a, b) => a.start - b.start);

    const occurrenceCounts = new Map<string, number>();
    for (const section of chorusRanges) {
        occurrenceCounts.set(
            section.normalizedLabel,
            (occurrenceCounts.get(section.normalizedLabel) || 0) + 1,
        );
    }
    const repeatedChoruses = chorusRanges.filter(
        (section) => (occurrenceCounts.get(section.normalizedLabel) || 0) >= 2,
    );
    if (repeatedChoruses.length === 0) {
        return;
    }

    // The source must be a real, audible catch in the FIRST repeated Chorus
    // after the protected Head. An ineligible catch is skipped within that
    // Chorus, but an empty source Chorus never falls through to a later one.
    const sourceSection = repeatedChoruses[0];
    const matchingSections = repeatedChoruses.filter(
        (section) => section.normalizedLabel === sourceSection.normalizedLabel,
    );
    // The gesture's eligibility/backbeat rules are intentionally a 4/4 Rock
    // critique. A global 4/4 chart can still contain local odd-meter Choruses;
    // decline the memory whenever either the source or any target uses a meter
    // this feature has not musically specified.
    if (
        sourceSection.timeSignature !== '4/4' ||
        matchingSections.some((section) => section.timeSignature !== '4/4')
    ) {
        return;
    }
    const sourceCycle = 1;
    const sourceSectionStart = sourceCycle * totalSteps + sourceSection.start;
    const sourceSectionEnd = sourceCycle * totalSteps + sourceSection.end;
    const stepsPerBar = sourceSection.stepsPerBar;
    const nextSection = arranger.sectionMap
        .map((section: any) => ({
            start: Number(section?.start),
            label: String(section?.label || ''),
        }))
        .filter((section) => Number.isFinite(section.start) && section.start >= sourceSection.end)
        .sort((a, b) => a.start - b.start)
        .at(0);
    const sourceDropMuted = (step: number): boolean => {
        const stepInForm = step - sourceCycle * totalSteps;
        const remainingSteps = sourceSection.end - stepInForm;
        if (!nextSection || remainingSteps > stepsPerBar) {
            return false;
        }
        return shouldFireDropMute(
            'Rock',
            0,
            nextSection.label,
            getSectionEnergy(nextSection.label) - getSectionEnergy(sourceSection.label),
            stepInForm / totalSteps,
        );
    };
    const sourceEntry = Object.entries(accentMap)
        .map(([step, accent]) => ({ step: Number(step), accent }))
        .filter(
            ({ step, accent }) =>
                Number.isFinite(step) &&
                step >= sourceSectionStart &&
                step < sourceSectionEnd &&
                accent.type === 'snare-stab' &&
                accent.role !== 'section-return' &&
                (step - sourceSectionStart) % stepsPerBar !== 0 &&
                !isBackbeatAdjacentStep((step - sourceSectionStart) % stepsPerBar, stepsPerBar) &&
                !sourceDropMuted(step),
        )
        .sort((a, b) => a.step - b.step)
        .at(0);
    if (!sourceEntry) {
        return;
    }

    const sectionOffset = sourceEntry.step - sourceSectionStart;
    const maxNoteStep = soloistSeed.notes.reduce(
        (max, note) => Math.max(max, Number.isFinite(note?.step) ? note.step + 1 : 0),
        0,
    );
    const horizon = Math.max(soloistSeed.loopLengthSteps || 0, maxNoteStep);
    const finalMeasureStart =
        arranger.measureMap
            ?.map((measure) => Number(measure.start))
            .filter((start) => Number.isFinite(start) && start >= 0 && start < totalSteps)
            .sort((a, b) => a - b)
            .at(-1) ?? totalSteps - stepsPerBar;
    const addReturn = (targetStep: number, section: ChorusRange): void => {
        if (sectionOffset >= section.end - section.start || targetStep >= horizon) {
            return;
        }
        const targetInForm = ((targetStep % totalSteps) + totalSteps) % totalSteps;
        // The form's last measure belongs to the established cadence gesture;
        // never layer the remembered catch into that protected cell.
        if (targetInForm >= finalMeasureStart) {
            return;
        }
        accentMap[targetStep] = {
            type: 'snare-stab',
            velocity: sourceEntry.accent.velocity,
            role: 'section-return',
        };
    };

    // Dormant base-form templates keep the relative hit visible after practice
    // folding. The lookup suppresses them during ordinary loop 0 playback.
    for (const section of matchingSections) {
        addReturn(section.start + sectionOffset, section);
    }

    const lastCycle = Math.floor(Math.max(0, horizon - 1) / totalSteps);
    for (let cycle = sourceCycle; cycle <= lastCycle; cycle++) {
        for (const section of matchingSections) {
            const sectionStart = cycle * totalSteps + section.start;
            if (sectionStart <= sourceSectionStart) {
                continue;
            }
            addReturn(sectionStart + sectionOffset, section);
        }
    }
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
    soloistSeed?: { notes?: { step: number; velocity: number }[]; loopLengthSteps?: number },
): Record<number, FillMapEntry> {
    const unrolled = unrollArrangement(arranger, 128);
    const { sectionMap } = unrolled;

    if (!sectionMap || sectionMap.length === 0) {
        return {};
    }

    const prng = createPRNG(seedStr || generateRandomSeed());
    const fillMap: Record<number, FillMapEntry> = {};
    const isVirtualMacroForm = unrolled.totalSteps !== unrolled.originalSteps;

    // Orchestration is needed to check energy levels for the "Crash Contract"
    const orchestrationMap = generateDrumOrchestration(state, arranger, genre, intensity, seedStr);

    // Soloist-aware fill restraint: count the soloist seed's note onsets that fall
    // in a given fill bar, folded into the seed's own loop frame (note steps recur
    // every loopLengthSteps — cf. soloist-pitch-engine's `note.step % loopLengthSteps`).
    // why (drum audit 2026-05-29; threshold calibrated by measuring generateSessionSeed):
    // the Head melody averages ~3.8–4.6 onsets/bar (blues 4.4, jazz 4.6), so the
    // *median* bar is already 3–4 notes. SOLOIST_BUSY_ONSETS must sit ABOVE that to
    // mean "the solo is genuinely running a line through this turnaround" — 6 onsets
    // is the busy top ~16–25% of bars (a sub-8th run), which leaves the realized
    // minor-seam fill rate ~22–25%: the defer NUANCES fills, it must not collapse
    // them. (A threshold of 3 fired on 82–97% of bars and nearly muted verse fills.)
    // All seed velocities are ≥0.55, so every note is an audible onset — no ghost
    // tier to filter out here.
    const SOLOIST_BUSY_ONSETS = 6;
    const soloLoopLen =
        soloistSeed?.loopLengthSteps && soloistSeed.loopLengthSteps > 0
            ? soloistSeed.loopLengthSteps
            : 0;
    const soloNotes = soloistSeed?.notes ?? [];
    const foldToSoloLoop = (s: number) =>
        soloLoopLen ? ((s % soloLoopLen) + soloLoopLen) % soloLoopLen : s;
    const countSoloistOnsetsInBar = (barStart: number, barLength: number): number => {
        if (soloNotes.length === 0) {
            return 0;
        }
        const start = foldToSoloLoop(barStart);
        const end = start + barLength;
        let onsets = 0;
        for (const note of soloNotes) {
            const s = foldToSoloLoop(note.step);
            if (s >= start && s < end) {
                onsets++;
            }
        }
        return onsets;
    };

    sectionMap.forEach((sectionRange: any, index: number) => {
        const sectionTs = getEffectiveTimeSignature(
            sectionRange.timeSignature || arranger.timeSignature,
            (sectionRange.timeSignature || arranger.timeSignature) === arranger.timeSignature
                ? arranger.grouping
                : null,
        );
        const stepsPerMeasure = sectionTs.beats * sectionTs.stepsPerBeat;
        // Keep every meter segment of the generated virtual Outro quiet. Mixed
        // meters split one role into several ranges, so "last range only" leaks
        // fills into the preceding Outro meter segment.
        if (isVirtualMacroForm && String(sectionRange.label || '').toLowerCase() === 'outro') {
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

        // 1. Identify the fill start step (start of the last measure of the section).
        const measuresInSection = (sectionRange.end - sectionRange.start) / stepsPerMeasure;
        if (measuresInSection < 1) {
            return; // Too short for a proper fill
        }
        const fillStartStep = sectionRange.end - stepsPerMeasure;

        // 2. Decide if we need a fill.
        // why (drum audit 2026-05-29): a house drummer fills INTO important
        // arrivals but lays out on ordinary verse→verse seams. The base rate is
        // deliberately restrained (~0.30 at mid intensity, was ~0.53); the
        // structural branches floor it back up so chorus/drop/loop-return/
        // role-change arrivals still read big.
        const baseFillProb = 0.15 + intensity * 0.25;
        let fillProb = baseFillProb;
        if (isStructuralChorus && intensity > 0.35) {
            fillProb = 1;
        } else if (isLoopReturn && intensity > 0.45) {
            fillProb = Math.max(fillProb, 0.9);
        } else if (energyDelta > 0.1) {
            fillProb = Math.max(fillProb, 0.72);
        } else if (isRoleChange && intensity > 0.55) {
            fillProb = Math.max(fillProb, 0.68);
        }

        // why (drum audit 2026-05-29): defer to an active solo. On an ordinary
        // (non-structural) seam, if the soloist is carrying a busy melodic phrase
        // through this turnaround bar, lay out — the section-boundary cymbal
        // (conductor.ts harmonic anticipation) still marks the change. Structural
        // arrivals fill regardless: the band's moment trumps. This is the fill-lane
        // complement to the snare-stab accent discipline — the drummer both catches
        // the soloist's peaks AND gets out of the way of their phrases.
        const isStructural = fillProb > baseFillProb;
        if (
            !isStructural &&
            countSoloistOnsetsInBar(fillStartStep, stepsPerMeasure) >= SOLOIST_BUSY_ONSETS
        ) {
            return;
        }

        if (prng() > fillProb) {
            return;
        }

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
    soloistSeed: { notes: any[]; loopLengthSteps?: number },
    genre: string,
    intensity: number,
    seedStr?: string,
): Record<number, AccentCatch> {
    if (!soloistSeed?.notes || soloistSeed.notes.length === 0) {
        return {};
    }

    const prng = createPRNG(seedStr || generateRandomSeed());
    const accentMap: Record<number, AccentCatch> = {};

    let lastCatchStep = -100;

    soloistSeed.notes.forEach((note) => {
        const { stepInfo, ts } = getEffectiveMeterAtStep(arranger, note.step);
        const stepsPerBeat = ts.stepsPerBeat;
        const catchCooldown = stepsPerBeat * 4; // Max 1 catch every 4 beats (1 bar in 4/4)
        // --- POCKET DISCIPLINE ---
        // Skip accents during the first iteration (The Head) to keep the initial groove metronomic.
        if (note.step < (arranger.totalSteps || 0)) {
            return;
        }

        // 1. Filter for valid accents
        // - Peak velocity (> 0.85)
        // - OR Highly syncopated (not on a main beat start)
        const isOffbeat = !stepInfo.isBeatStart;
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
            } else if (genre === 'Rock') {
                // Rock only: on-grid peaks can carry a crash, while a syncopated
                // peak gets the tighter snare answer. Treating every strong peak
                // as a crash made snare-stab unreachable for the production Rock
                // seeder (#994) and over-washed offbeat figures.
                type = isStrongAccent && !isOffbeat ? 'crash-catch' : 'snare-stab';
            } else {
                // Preserve the established crash vocabulary for Ska / Metal /
                // other high-energy feels; #994 is deliberately a Rock pilot.
                type = isStrongAccent ? 'crash-catch' : 'snare-stab';
            }

            accentMap[note.step] = {
                type,
                velocity: Math.min(1.2, note.velocity + 0.2),
            };
            lastCatchStep = note.step;
        }
    });

    if (genre === 'Rock') {
        seedRockSectionReturns(accentMap, arranger, soloistSeed);
    }

    return accentMap;
}
