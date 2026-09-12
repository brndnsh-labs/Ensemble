import { compileScoreForm } from '../../../public/songbook/score-form';
import type {
    ScoreDirection,
    ScoreSection,
    SemanticScore,
} from '../../../public/songbook/score-types';

/** Inclusive, zero-based written bar positions within one section. */
export interface BarRange {
    start: number;
    end: number;
}

export interface GuidedGroup {
    body: BarRange;
    times: number;
    first?: BarRange;
    second?: BarRange;
}

export function groupEnd(group: GuidedGroup): number {
    return group.second?.end ?? group.body.end;
}

function isForm(direction: ScoreDirection) {
    return ['repeat-start', 'repeat-end', 'ending-start', 'ending-end'].includes(direction.kind);
}

function formMarkers(section: ScoreSection) {
    return section.measures.flatMap((bar, index) =>
        (['start', 'end'] as const).flatMap((edge) =>
            (bar[edge] ?? []).filter(isForm).map((direction) => ({ index, edge, direction })),
        ),
    );
}

/** Recognize only the guide's lossless notation shapes, never reinterpret a complex form. */
export function guidedGroups(section: ScoreSection): GuidedGroup[] | null {
    const markers = formMarkers(section);
    const groups: GuidedGroup[] = [];
    let cursor = 0;
    while (cursor < markers.length) {
        const opening = markers[cursor++];
        if (opening.edge !== 'start' || opening.direction.kind !== 'repeat-start') {
            return null;
        }
        const next = markers[cursor++];
        if (!next) {
            return null;
        }
        if (next.edge === 'end' && next.direction.kind === 'repeat-end') {
            groups.push({
                body: { start: opening.index, end: next.index },
                times: next.direction.times,
            });
            continue;
        }
        const repeat = markers[cursor++];
        const second = markers[cursor++];
        const closing = markers[cursor++];
        if (
            next.edge !== 'start' ||
            next.direction.kind !== 'ending-start' ||
            next.direction.passes.join(',') !== '1' ||
            next.index <= opening.index ||
            !repeat ||
            repeat.edge !== 'end' ||
            repeat.direction.kind !== 'repeat-end' ||
            repeat.direction.times !== 2 ||
            repeat.index < next.index ||
            !second ||
            second.edge !== 'start' ||
            second.direction.kind !== 'ending-start' ||
            second.direction.passes.join(',') !== '2' ||
            second.index !== repeat.index + 1 ||
            !closing ||
            closing.edge !== 'end' ||
            closing.direction.kind !== 'ending-end' ||
            closing.index < second.index
        ) {
            return null;
        }
        groups.push({
            body: { start: opening.index, end: next.index - 1 },
            times: 2,
            first: { start: next.index, end: repeat.index },
            second: { start: second.index, end: closing.index },
        });
    }
    return groups;
}

function sameGroup(a: GuidedGroup, b: GuidedGroup) {
    return JSON.stringify(a) === JSON.stringify(b);
}

export function changeGuidedForm(
    score: SemanticScore,
    sectionId: string,
    replacement: GuidedGroup | null,
    previous?: GuidedGroup,
): SemanticScore {
    const candidate = structuredClone(score);
    const section = candidate.sections.find((entry) => entry.id === sectionId);
    if (!section) {
        throw new Error('This section no longer exists. Reopen Repeats and endings.');
    }
    const groups = guidedGroups(section);
    if (!groups) {
        throw new Error(
            'This section has a nested or nonstandard form. Use Advanced to preserve its notation.',
        );
    }
    if (previous && !groups.some((group) => sameGroup(group, previous))) {
        throw new Error('This repeat has changed. Cancel and reopen it before editing.');
    }
    if (replacement) {
        const { body, first, second, times } = replacement;
        for (const [label, range] of [
            ['Repeated bars', body],
            ['First ending', first],
            ['Second ending', second],
        ] as const) {
            if (
                range &&
                (!Number.isInteger(range.start) ||
                    !Number.isInteger(range.end) ||
                    range.start < 0 ||
                    range.end >= section.measures.length ||
                    range.start > range.end)
            ) {
                throw new Error(
                    `${label}: select a start and end in this section, in written order.`,
                );
            }
        }
        if (!Number.isInteger(times) || times < 1 || times > 64) {
            throw new Error('Play times total must be a whole number from 1 to 64.');
        }
        if (
            !!first !== !!second ||
            (first &&
                second &&
                (times !== 2 || first.start !== body.end + 1 || second.start !== first.end + 1))
        ) {
            throw new Error(
                'Endings must follow the repeated body in order, with no gaps or overlaps: body, first ending, second ending. Two endings play twice total.',
            );
        }
        if (
            groups.some(
                (group) =>
                    (!previous || !sameGroup(group, previous)) &&
                    body.start <= groupEnd(group) &&
                    group.body.start <= groupEnd(replacement),
            )
        ) {
            throw new Error(
                'These bars overlap an existing repeat. Edit that group, select other bars, or use Advanced for nesting.',
            );
        }
    }
    if (previous) {
        for (let index = previous.body.start; index <= groupEnd(previous); index++) {
            const bar = section.measures[index];
            for (const edge of ['start', 'end'] as const) {
                const remaining = bar[edge]?.filter((direction) => !isForm(direction));
                if (remaining?.length) {
                    bar[edge] = remaining;
                } else {
                    delete bar[edge];
                }
            }
        }
    }
    if (replacement) {
        const add = (index: number, edge: 'start' | 'end', direction: ScoreDirection) => {
            const bar = section.measures[index];
            bar[edge] = [...(bar[edge] ?? []), direction];
        };
        add(replacement.body.start, 'start', { kind: 'repeat-start' });
        add(replacement.first?.end ?? replacement.body.end, 'end', {
            kind: 'repeat-end',
            times: replacement.times,
        });
        if (replacement.first && replacement.second) {
            add(replacement.first.start, 'start', { kind: 'ending-start', passes: [1] });
            add(replacement.second.start, 'start', { kind: 'ending-start', passes: [2] });
            add(replacement.second.end, 'end', { kind: 'ending-end' });
        }
    }
    compileScoreForm(candidate);
    return candidate;
}

/** The displayed itinerary uses the same global compiler visits as playback, including jumps. */
export function guidedRoute(score: SemanticScore): string {
    const visits = compileScoreForm(score);
    const multiple = score.sections.length > 1;
    return visits
        .map((visit, index) => {
            const previous = visits[index - 1];
            const separator =
                index === 0
                    ? ''
                    : previous.sectionIndex !== visit.sectionIndex ||
                        visit.measureIndex <= previous.measureIndex
                      ? ' → '
                      : '–';
            const label = multiple
                ? `${score.sections[visit.sectionIndex].label} ${visit.measureIndex + 1}`
                : String(visit.measureIndex + 1);
            return separator + label;
        })
        .join('');
}
