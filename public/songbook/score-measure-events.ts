import { validateSemanticScore } from './score-codec.js';
import { resolveScoreContext } from './score-context.js';
import type { ScoreEvent } from './score-types.js';

type EffectiveContext = ReturnType<typeof resolveScoreContext>;
interface ResolvedMeasure {
    sectionIndex: number;
    measureIndex: number;
    ordinal: number;
    context: EffectiveContext;
    events: ScoreEvent[];
}

// A short written reference can copy a dense source many times. Apply the playback
// event ceiling before copying, independently of the codec's authored-size limits.
const MAX_RESOLVED_EVENTS = 65_536;

function cloneEvent(event: ScoreEvent): ScoreEvent {
    return {
        ...event,
        duration: [...event.duration],
        ...(event.kind === 'chord' && event.alternates
            ? { alternates: [...event.alternates] }
            : {}),
    };
}

function differingContext(source: EffectiveContext, target: EffectiveContext): string[] {
    const fields: string[] = [];
    if (source.key !== target.key) {
        fields.push('key');
    }
    if (source.isMinor !== target.isMinor) {
        fields.push('major/minor mode');
    }
    if (source.meter !== target.meter) {
        fields.push('meter');
    }
    if (
        source.grouping?.length !== target.grouping?.length ||
        source.grouping?.some((count, index) => count !== target.grouping?.[index])
    ) {
        fields.push('beat grouping');
    }
    return fields;
}

/**
 * Resolve written measure identities into detached events, never performed-order
 * look-behind. This does not expand navigation, alter notation, or promise that the
 * engine supports an event: N.C., holds, alternates and fermatas remain intact.
 */
export function resolveScoreMeasureEvents(candidate: unknown): ScoreEvent[][][] {
    const checked = validateSemanticScore(candidate);
    if (checked.kind !== 'ok') {
        const detail =
            checked.kind === 'invalid'
                ? checked.issues.map((issue) => `${issue.path}: ${issue.message}`).join(' ')
                : 'Invalid semantic chart.';
        throw new Error(`${detail} The chart source has not been changed.`);
    }
    const score = checked.value;
    const resolved = new Map<string, ResolvedMeasure>();
    let eventCount = 0;
    let pair: { source: ResolvedMeasure; destination: ResolvedMeasure } | undefined;

    return score.sections.map((section, sectionIndex) => {
        let context = resolveScoreContext(score, section);
        return section.measures.map((measure, measureIndex) => {
            const where = `${section.label}, bar ${measureIndex + 1}`;
            const fail: (message: string) => never = (message) => {
                throw new Error(`${where}: ${message} The chart is preserved.`);
            };
            context = resolveScoreContext(context, measure);
            const { content } = measure;
            let events: ScoreEvent[];
            let source: ResolvedMeasure | undefined;
            if (content.kind === 'events') {
                events = content.events;
            } else {
                source = resolved.get(content.measureId);
                if (!source) {
                    fail('A measure repeat needs an earlier written source.');
                }
                const differences = differingContext(source.context, context);
                if (differences.length) {
                    fail(
                        `The repeat source has different ${differences.join(', ')}. ` +
                            'Write out the music in this bar to use a changed context.',
                    );
                }
                if (content.display === 'two-bar-end') {
                    if (!pair || pair.destination.sectionIndex !== sectionIndex) {
                        fail('Keep both bars of a two-bar repeat in the same section.');
                    }
                    if (
                        source.sectionIndex !== pair.source.sectionIndex ||
                        source.measureIndex !== pair.source.measureIndex + 1 ||
                        source.ordinal >= pair.destination.ordinal
                    ) {
                        fail(
                            'A two-bar repeat must reference two consecutive bars in the same ' +
                                'source section, both before the repeat begins.',
                        );
                    }
                }
                events = source.events;
            }
            eventCount += events.length;
            if (eventCount > MAX_RESOLVED_EVENTS) {
                fail('Measure repeats expand beyond 65,536 events. Shorten the chart.');
            }
            const detached = events.map(cloneEvent);
            const entry: ResolvedMeasure = {
                sectionIndex,
                measureIndex,
                ordinal: resolved.size,
                context,
                events: detached,
            };
            resolved.set(measure.id, entry);
            pair =
                content.kind === 'repeat' && content.display === 'two-bar-start'
                    ? { source: source!, destination: entry }
                    : undefined;
            return detached;
        });
    });
}
