import type { ScoreDirection, ScoreMeasure } from '../../../public/songbook/score-types';

/** Raw editor values. Parse only when the parent commits the whole chart. */
export interface FormDraft {
    repeatStart: boolean;
    repeatTimes: string;
    endingPasses: string;
    endingEnd: boolean;
}

type FormKind = 'repeat-start' | 'repeat-end' | 'ending-start' | 'ending-end';
type Boundary = 'start' | 'end';

interface Marker {
    boundary: Boundary;
    direction: ScoreDirection;
}

function isFormKind(kind: ScoreDirection['kind']): kind is FormKind {
    return (
        kind === 'repeat-start' ||
        kind === 'repeat-end' ||
        kind === 'ending-start' ||
        kind === 'ending-end'
    );
}

function markersFor(measure: ScoreMeasure): Map<FormKind, Marker> {
    const markers = new Map<FormKind, Marker>();
    for (const boundary of ['start', 'end'] as const) {
        for (const direction of measure[boundary] ?? []) {
            if (!isFormKind(direction.kind)) {
                continue;
            }
            if (markers.has(direction.kind)) {
                throw new Error(
                    `This bar has more than one ${direction.kind} marker. These controls cannot change it without losing notation.`,
                );
            }
            if (
                (direction.kind === 'repeat-end' && boundary !== 'end') ||
                ((direction.kind === 'repeat-start' || direction.kind === 'ending-start') &&
                    boundary !== 'start')
            ) {
                throw new Error(
                    `This bar has a ${direction.kind} marker at an unsupported boundary. Its notation has been preserved.`,
                );
            }
            markers.set(direction.kind, { boundary, direction });
        }
    }
    return markers;
}

function parsePass(raw: string, label: string): number {
    const text = raw.trim();
    const value = Number(text);
    if (!/^\d+$/.test(text) || !Number.isInteger(value) || value < 1 || value > 64) {
        throw new Error(`${label} must be a whole number from 1 to 64.`);
    }
    return value;
}

function parseEndingPasses(raw: string): number[] {
    const passes = raw.split(',').map((part) => parsePass(part, 'Each ending pass'));
    if (new Set(passes).size !== passes.length) {
        throw new Error('Ending passes must be distinct; enter each pass only once.');
    }
    return passes;
}

/** Refuse ambiguous marker arrays rather than making their first item authoritative. */
export function readMeasureForm(measure: ScoreMeasure): FormDraft {
    const markers = markersFor(measure);
    const repeat = markers.get('repeat-end')?.direction;
    const ending = markers.get('ending-start')?.direction;
    const repeatTimes = repeat?.kind === 'repeat-end' ? String(repeat.times) : '';
    const endingPasses = ending?.kind === 'ending-start' ? ending.passes.join(', ') : '';
    if (repeat?.kind === 'repeat-end') {
        parsePass(repeatTimes, 'Total repeat passes');
    }
    if (ending?.kind === 'ending-start') {
        if (!ending.passes.length) {
            throw new Error(
                'An ending must name at least one pass. Its notation has been preserved.',
            );
        }
        parseEndingPasses(endingPasses);
    }
    return {
        repeatStart: markers.has('repeat-start'),
        repeatTimes,
        endingPasses,
        endingEnd: markers.has('ending-end'),
    };
}

function replaceMarker(
    measure: ScoreMeasure,
    markers: Map<FormKind, Marker>,
    kind: FormKind,
    replacement: ScoreDirection | null,
    defaultBoundary: Boundary,
) {
    const existing = markers.get(kind);
    const boundary = existing?.boundary ?? defaultBoundary;
    const directions = measure[boundary];
    if (existing && directions) {
        const index = directions.findIndex((direction) => direction.kind === kind);
        if (replacement) {
            directions[index] = replacement;
        } else {
            directions.splice(index, 1);
            if (!directions.length) {
                delete measure[boundary];
            }
        }
    } else if (replacement) {
        measure[boundary] = [...(directions ?? []), replacement];
    }
}

/**
 * Edits only represented markers on a detached measure. Full form pairing/reachability belongs
 * to the chart compiler, so a musician can mark both ends before committing the pending bars.
 */
export function applyMeasureForm(measure: ScoreMeasure, draft: FormDraft): ScoreMeasure {
    // A new draft must not silently "repair" duplicates or unrepresentable source notation.
    readMeasureForm(measure);
    const repeatTimes = draft.repeatTimes.trim()
        ? parsePass(draft.repeatTimes, 'Total repeat passes')
        : null;
    const endingPasses = draft.endingPasses.trim() ? parseEndingPasses(draft.endingPasses) : null;
    const markers = markersFor(measure);
    const candidate = structuredClone(measure);
    replaceMarker(
        candidate,
        markers,
        'repeat-start',
        draft.repeatStart ? { kind: 'repeat-start' } : null,
        'start',
    );
    replaceMarker(
        candidate,
        markers,
        'repeat-end',
        repeatTimes === null ? null : { kind: 'repeat-end', times: repeatTimes },
        'end',
    );
    replaceMarker(
        candidate,
        markers,
        'ending-start',
        endingPasses === null ? null : { kind: 'ending-start', passes: endingPasses },
        'start',
    );
    // A pre-existing start-boundary ending-end closes the preceding bar. Keep that placement
    // when checked; a newly added marker closes this bar at its end.
    replaceMarker(
        candidate,
        markers,
        'ending-end',
        draft.endingEnd ? { kind: 'ending-end' } : null,
        'end',
    );
    return candidate;
}
