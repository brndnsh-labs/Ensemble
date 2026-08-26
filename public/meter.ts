import { TIME_SIGNATURES, type TimeSignatureConfig } from './config.js';
import type { StepInfo } from './types.js';
import { getStepInfo } from './utils.js';

interface ArrangerMeterSource {
    readonly timeSignature: string;
    readonly grouping?: readonly number[] | null;
    readonly totalSteps?: number;
    readonly measureMap?: Array<{ start: number; end: number; ts?: string }>;
}

export interface EffectiveMeterAtStep {
    chartStep: number;
    signatures: Record<string, TimeSignatureConfig>;
    stepInfo: StepInfo;
    ts: TimeSignatureConfig;
}

/**
 * Is `grouping` a complete positive-integer partition of `timeSignature`?
 *
 * Custom grouping is authored arranger state, so every consumer must agree on its
 * keyspace rather than merely trusting the UI. This predicate is shared by hydration
 * and the effective-meter resolver below; malformed state falls back to the canonical
 * meter config instead of poisoning beat/group math.
 */
export function isValidTimeSignatureGrouping(
    grouping: unknown,
    timeSignature: string,
): grouping is number[] {
    const beats = TIME_SIGNATURES[timeSignature]?.beats;
    if (
        !Array.isArray(grouping) ||
        typeof beats !== 'number' ||
        grouping.length === 0 ||
        grouping.length > beats
    ) {
        return false;
    }

    let total = 0;
    for (const group of grouping) {
        if (!Number.isInteger(group) || group <= 0) {
            return false;
        }
        total += group;
    }
    return total === beats;
}

const EFFECTIVE_TIME_SIGNATURE_CACHE = new Map<string, TimeSignatureConfig>();
const EFFECTIVE_TIME_SIGNATURES_CACHE = new Map<string, Record<string, TimeSignatureConfig>>();
const METER_GROUP_STARTS_CACHE = new WeakMap<TimeSignatureConfig, ReadonlySet<number>>();

function effectiveMeterKey(timeSignature: string, grouping: readonly number[]): string {
    return `${timeSignature}:${grouping.join('+')}`;
}

/**
 * Resolve the meter the musician actually authored.
 *
 * `TIME_SIGNATURES` remains immutable shared configuration. A valid custom grouping
 * overlays only the selected global meter, and the cached copy prevents per-step object
 * allocation in scheduler/worker hot paths. The copied grouping prevents a later state
 * mutation from changing a cached config in place.
 */
export function getEffectiveTimeSignature(
    timeSignature: string,
    grouping: readonly number[] | null | undefined,
): TimeSignatureConfig {
    const resolvedName = TIME_SIGNATURES[timeSignature] ? timeSignature : '4/4';
    const base = TIME_SIGNATURES[resolvedName];
    if (!isValidTimeSignatureGrouping(grouping, resolvedName)) {
        return base;
    }

    const key = effectiveMeterKey(resolvedName, grouping);
    let effective = EFFECTIVE_TIME_SIGNATURE_CACHE.get(key);
    if (!effective) {
        effective = { ...base, grouping: [...grouping] };
        const canonicalGroupStarts = [...getMeterGroupStarts(base)];
        const pulseTracksCanonicalGrouping =
            base.pulse.length === canonicalGroupStarts.length &&
            base.pulse.every((step, index) => step === canonicalGroupStarts[index]);
        if (pulseTracksCanonicalGrouping) {
            effective.pulse = [...getMeterGroupStarts(effective)];
        }
        EFFECTIVE_TIME_SIGNATURE_CACHE.set(key, effective);
    }
    return effective;
}

/**
 * Return a TIME_SIGNATURES-compatible registry whose selected meter carries the
 * authored grouping. `getStepInfo` needs the registry form because section measure maps
 * resolve their meter by name after receiving the initial config.
 */
export function getEffectiveTimeSignatures(
    timeSignature: string,
    grouping: readonly number[] | null | undefined,
): Record<string, TimeSignatureConfig> {
    const resolvedName = TIME_SIGNATURES[timeSignature] ? timeSignature : '4/4';
    const effective = getEffectiveTimeSignature(resolvedName, grouping);
    if (effective === TIME_SIGNATURES[resolvedName]) {
        return TIME_SIGNATURES;
    }

    const key = effectiveMeterKey(resolvedName, effective.grouping);
    const cached = EFFECTIVE_TIME_SIGNATURES_CACHE.get(key);
    if (cached) {
        return cached;
    }

    const signatures: Record<string, TimeSignatureConfig> = Object.assign(
        Object.create(null),
        TIME_SIGNATURES,
        { [resolvedName]: effective },
    );
    EFFECTIVE_TIME_SIGNATURES_CACHE.set(key, signatures);
    return signatures;
}

/**
 * Return every cumulative group boundary within a measure, in engine steps.
 *
 * A stride based on `grouping[0]` only works for symmetric meters. Keeping the
 * cumulative set beside the effective-meter resolver gives rhythm consumers one
 * allocation-free authority for asymmetric groupings such as 5/4 2+3 and 7/8 3+2+2.
 */
export function getMeterGroupStarts(ts: TimeSignatureConfig): ReadonlySet<number> {
    const cached = METER_GROUP_STARTS_CACHE.get(ts);
    if (cached) {
        return cached;
    }

    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
    const starts = new Set<number>([0]);
    let step = 0;
    const grouping =
        Array.isArray(ts.grouping) && ts.grouping.length > 0 ? ts.grouping : [ts.beats];
    for (const groupBeats of grouping) {
        step += groupBeats * ts.stepsPerBeat;
        if (step > 0 && step < stepsPerMeasure) {
            starts.add(step);
        }
    }
    METER_GROUP_STARTS_CACHE.set(ts, starts);
    return starts;
}

/** Normalize a monotonic transport/export step into the arranger's one-pass maps. */
function normalizeChartStep(step: number, totalSteps: number | null | undefined): number {
    return totalSteps && totalSteps > 0 ? ((step % totalSteps) + totalSteps) % totalSteps : step;
}

/** Reset a repeating rhythmic pattern at a section boundary. */
export function getSectionPhaseStep(
    chartStep: number,
    sectionStart: number,
    cycleSteps: number,
): number {
    if (!Number.isFinite(cycleSteps) || cycleSteps <= 0) {
        return 0;
    }
    return (((chartStep - sectionStart) % cycleSteps) + cycleSteps) % cycleSteps;
}

/**
 * Resolve one step through the arranger's effective global grouping and one-pass
 * measure map. The returned `ts` is the section meter selected by `stepInfo`, not
 * merely the global meter passed in as its fallback.
 */
export function getEffectiveMeterAtStep(
    arranger: ArrangerMeterSource,
    step: number,
): EffectiveMeterAtStep {
    const signatures = getEffectiveTimeSignatures(arranger.timeSignature, arranger.grouping);
    const globalTS = signatures[arranger.timeSignature] || signatures['4/4'];
    const chartStep = normalizeChartStep(step, arranger.totalSteps);
    const stepInfo = getStepInfo(chartStep, globalTS, arranger.measureMap, signatures);
    const ts = (stepInfo.tsConfig as TimeSignatureConfig | undefined) || globalTS;
    return { chartStep, signatures, stepInfo, ts };
}
