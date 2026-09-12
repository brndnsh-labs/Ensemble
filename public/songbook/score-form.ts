import { validateSemanticScore } from './score-codec.js';
import type { ScoreDirection, ScoreSection, SemanticScore } from './score-types.js';

export interface ScoreFormVisit {
    sectionIndex: number;
    measureIndex: number;
    sectionPass: number;
    /** Musical pass numbers, outermost repeat first (unlike the zero-based indices). */
    repeatPasses: number[];
}

type Node =
    | { kind: 'bar'; index: number }
    | { kind: 'repeat'; times: number; body: Node[]; endings: Ending[] };
interface Ending {
    passes: number[];
    body: Node[];
}
interface Repeat {
    start: number;
    end: number;
    times: number;
    implicit: boolean;
}

const MAX_MEASURES = 16_384;
const MAX_DEPTH = 16;
const FORM_DIRECTIONS = new Set(['repeat-start', 'repeat-end', 'ending-start', 'ending-end']);

/** Build a small syntax tree before expanding anything. Sections are independent forms. */
function sectionForm(section: ScoreSection): Node[] {
    const bars = section.measures;
    const used = new Set<string>();
    const pairs = new Map<number, Repeat>();
    const stack: number[] = [];
    const fail = (index: number, message: string): never => {
        throw new Error(`${section.label}, bar ${index + 1}: ${message}`);
    };
    const key = (i: number, edge: 'start' | 'end', kind: string) => `${i}:${edge}:${kind}`;
    function mark<K extends ScoreDirection['kind']>(
        i: number,
        edge: 'start' | 'end',
        kind: K,
    ): (ScoreDirection & { kind: K }) | undefined {
        return bars[i]?.[edge]?.find((item) => item.kind === kind) as
            | (ScoreDirection & { kind: K })
            | undefined;
    }
    function consume(i: number, edge: 'start' | 'end', kind: string) {
        const id = key(i, edge, kind);
        if (used.has(id)) {
            fail(i, 'Overlapping repeat or ending boundaries.');
        }
        used.add(id);
    }
    const startsEnding = (i: number) =>
        !used.has(key(i, 'start', 'ending-start')) && !!mark(i, 'start', 'ending-start');
    const endsEnding = (i: number, edge: 'start' | 'end') =>
        !used.has(key(i, edge, 'ending-end')) && !!mark(i, edge, 'ending-end');
    for (const [i, bar] of bars.entries()) {
        for (const edge of ['start', 'end'] as const) {
            const seen = new Set<string>();
            for (const direction of bar[edge] ?? []) {
                if (seen.has(direction.kind)) {
                    fail(i, 'Duplicate repeat, ending or navigation marker on one boundary.');
                }
                seen.add(direction.kind);
            }
        }
        if (mark(i, 'start', 'repeat-start')) {
            stack.push(i);
            if (stack.length > MAX_DEPTH) {
                fail(i, 'Repeat nesting exceeds the limit of 16.');
            }
        }
        const close = mark(i, 'end', 'repeat-end');
        if (close) {
            const explicit = stack.pop();
            const start = explicit ?? 0;
            if (pairs.has(start)) {
                fail(i, 'Ambiguous repeat start; add an explicit start repeat.');
            }
            pairs.set(start, {
                start,
                end: i,
                times: close.times,
                implicit: explicit === undefined,
            });
        }
    }
    if (stack.length) {
        fail(stack[0], 'Start repeat needs an end repeat in the same section.');
    }

    function one(
        i: number,
        limit: number,
        depth: number,
        owner?: Repeat,
    ): { node: Node; next: number } {
        const pair = pairs.get(i);
        if (pair && pair !== owner) {
            return repeat(pair, limit, depth + 1);
        }
        return { node: { kind: 'bar', index: i }, next: i + 1 };
    }

    function repeat(pair: Repeat, limit: number, depth: number): { node: Node; next: number } {
        if (depth > MAX_DEPTH || pair.end >= limit) {
            fail(pair.start, 'Repeat nesting is excessive or crosses another ending.');
        }
        if (!pair.implicit) {
            consume(pair.start, 'start', 'repeat-start');
        }
        consume(pair.end, 'end', 'repeat-end');
        const body: Node[] = [];
        const endings: Ending[] = [];
        let cursor = pair.start;
        while (cursor <= pair.end && !startsEnding(cursor)) {
            const item = one(cursor, pair.end + 1, depth, pair);
            body.push(item.node);
            cursor = item.next;
        }
        if (cursor <= pair.end) {
            const first = mark(cursor, 'start', 'ending-start')!;
            consume(cursor, 'start', 'ending-start');
            const endingBody: Node[] = [];
            while (cursor <= pair.end) {
                const item = one(cursor, pair.end + 1, depth, pair);
                endingBody.push(item.node);
                cursor = item.next;
            }
            // Inner endings own their closures first. This repeat-end already closes
            // our first ending; an unclaimed explicit ending-end here is optional.
            if (endsEnding(pair.end, 'end')) {
                consume(pair.end, 'end', 'ending-end');
            }
            endings.push({ passes: first.passes, body: endingBody });
            // A repeat-end closes the first ending. Later written branches are chosen
            // by pass number, never appended unconditionally to the final pass.
            while (
                cursor < limit &&
                new Set(endings.flatMap((ending) => ending.passes)).size < pair.times &&
                startsEnding(cursor)
            ) {
                const firstBar = cursor;
                // A prior branch may already have consumed this shared boundary.
                if (endsEnding(cursor, 'start')) {
                    consume(cursor, 'start', 'ending-end');
                }
                const opening = mark(cursor, 'start', 'ending-start')!;
                consume(cursor, 'start', 'ending-start');
                const branch: Node[] = [];
                let closed = false;
                while (cursor < limit) {
                    if (cursor !== firstBar && endsEnding(cursor, 'start')) {
                        consume(cursor, 'start', 'ending-end');
                        closed = true;
                        break;
                    }
                    // Inside an open ending, a new repeat owns its co-located ending
                    // start. An explicit outer closure makes that repeat independent.
                    const nested = pairs.has(cursor) && pairs.get(cursor) !== pair;
                    if (cursor !== firstBar && !nested && startsEnding(cursor)) {
                        closed = true;
                        break;
                    }
                    const item = one(cursor, limit, depth, pair);
                    branch.push(item.node);
                    cursor = item.next;
                    // Claim only a closure at the end of the completed child, never
                    // one inside it. A crossing marker is left for the final rejection.
                    if (endsEnding(cursor - 1, 'end')) {
                        consume(cursor - 1, 'end', 'ending-end');
                        closed = true;
                        break;
                    }
                }
                if (!closed && cursor !== bars.length) {
                    fail(firstBar, 'End this ending before the enclosing repeat boundary.');
                }
                endings.push({ passes: opening.passes, body: branch });
            }
            const passes = new Set<number>();
            for (const ending of endings) {
                for (const pass of ending.passes) {
                    if (pass > pair.times || passes.has(pass)) {
                        fail(
                            pair.start,
                            'Ending passes must be distinct and within the total repeat passes.',
                        );
                    }
                    passes.add(pass);
                }
            }
            if (passes.size !== pair.times) {
                fail(pair.start, 'Provide an ending for every repeat pass.');
            }
        }
        return { node: { kind: 'repeat', times: pair.times, body, endings }, next: cursor };
    }

    const result: Node[] = [];
    let cursor = 0;
    while (cursor < bars.length) {
        const item = one(cursor, bars.length, 0);
        result.push(item.node);
        cursor = item.next;
    }
    // Ownership is resolved from the inside out, then checked exhaustively before
    // performance expansion. Deferral must never turn stray markers into ignored data.
    for (const [index, bar] of bars.entries()) {
        for (const edge of ['start', 'end'] as const) {
            for (const direction of bar[edge] ?? []) {
                if (
                    FORM_DIRECTIONS.has(direction.kind) &&
                    !used.has(key(index, edge, direction.kind))
                ) {
                    fail(
                        index,
                        'An ending must belong to a complete repeat and cannot cross a nested boundary.',
                    );
                }
            }
        }
    }
    return result;
}

type Jump = Extract<ScoreDirection, { kind: 'jump' }>;
type Marker = Extract<ScoreDirection, { kind: 'segno' | 'coda' | 'fine' }>;
interface Boundary {
    sectionIndex: number;
    measureIndex: number;
    edge: 'start' | 'end';
    /** Written measure boundary, independent of repeat expansion. */
    position: number;
    directions: (Jump | Marker)[];
}
type PerformanceStep =
    | { kind: 'measure'; visit: ScoreFormVisit }
    | { kind: 'boundary'; boundary: Boundary };
interface Tape {
    steps: PerformanceStep[];
    markers: Map<string, number[]>;
}

function failAt(score: SemanticScore, boundary: Boundary, message: string): never {
    throw new Error(
        `${score.sections[boundary.sectionIndex].label}, bar ${boundary.measureIndex + 1}: ${message} The chart is preserved.`,
    );
}

function expansionLimit(): never {
    throw new Error(
        'This chart expands beyond the playback limit of 16,384 measures. Reduce repeats.',
    );
}

function boundaryKey(sectionIndex: number, measureIndex: number, edge: 'start' | 'end') {
    return `${sectionIndex}:${measureIndex}:${edge}`;
}

/** Validate every authored navigation command, including ones a later jump may bypass. */
function navigation(score: SemanticScore, forms: Node[][]) {
    const boundaries = new Map<string, Boundary>();
    const markers = new Map<string, Boundary>();
    const commands: { jump: Jump; boundary: Boundary }[] = [];
    let position = 0;
    score.sections.forEach((section, sectionIndex) => {
        section.measures.forEach((measure, measureIndex) => {
            for (const edge of ['start', 'end'] as const) {
                const directions = (measure[edge] ?? []).filter(
                    (direction): direction is Jump | Marker => !FORM_DIRECTIONS.has(direction.kind),
                );
                if (!directions.length) {
                    continue;
                }
                const boundary: Boundary = {
                    sectionIndex,
                    measureIndex,
                    edge,
                    position: position + (edge === 'end' ? 1 : 0),
                    directions,
                };
                boundaries.set(boundaryKey(sectionIndex, measureIndex, edge), boundary);
                for (const direction of directions) {
                    if (direction.kind === 'jump') {
                        commands.push({ jump: direction, boundary });
                    } else {
                        markers.set(direction.label, boundary);
                    }
                }
            }
            position++;
        });
    });
    function checkCommandOwnership(nodes: Node[], sectionIndex: number, nested: boolean) {
        for (const node of nodes) {
            if (node.kind === 'repeat') {
                checkCommandOwnership(node.body, sectionIndex, true);
                for (const ending of node.endings) {
                    checkCommandOwnership(ending.body, sectionIndex, true);
                }
            } else {
                const boundary = boundaries.get(boundaryKey(sectionIndex, node.index, 'end'));
                if (
                    boundary?.directions.some((direction) => direction.kind === 'jump') &&
                    (nested || score.sections[sectionIndex].repeat > 1)
                ) {
                    failAt(
                        score,
                        boundary,
                        'Jump timing inside a repeated passage is ambiguous. Place the D.C./D.S. command after the complete repeat and its endings in a section that plays once.',
                    );
                }
            }
        }
    }
    forms.forEach((form, sectionIndex) => checkCommandOwnership(form, sectionIndex, false));
    for (const { jump, boundary } of commands) {
        if (jump.destination.kind === 'ending') {
            failAt(
                score,
                boundary,
                'D.C./D.S. al ending is not supported yet: its owning repeat and stopping Fine must be explicit. Use an explicit Fine or coda destination.',
            );
        }
        const start = jump.from === 'start' ? 0 : markers.get(jump.segno!)!.position;
        if (start >= boundary.position) {
            failAt(score, boundary, 'A D.C./D.S. jump must return to an earlier boundary.');
        }
        if (jump.destination.kind === 'coda') {
            const via = markers.get(jump.destination.via)!;
            const target = markers.get(jump.destination.target)!;
            if (target.position <= via.position) {
                failAt(
                    score,
                    boundary,
                    'The coda arrival must follow its departure; a backward coda would create a navigation cycle.',
                );
            }
        }
    }
    return { boundaries, commands };
}

/** A bounded repeat tape retains exact boundaries, rather than attaching markers to visits. */
function performanceTape(
    score: SemanticScore,
    forms: Node[][],
    boundaries: Map<string, Boundary>,
    policy: 'play' | 'skip',
): Tape {
    const steps: PerformanceStep[] = [];
    const markers = new Map<string, number[]>();
    let measures = 0;
    function emitBoundary(sectionIndex: number, measureIndex: number, edge: 'start' | 'end') {
        const boundary = boundaries.get(boundaryKey(sectionIndex, measureIndex, edge));
        if (!boundary) {
            return;
        }
        for (const direction of boundary.directions) {
            if (direction.kind !== 'jump') {
                const positions = markers.get(direction.label) ?? [];
                positions.push(steps.length);
                markers.set(direction.label, positions);
            }
        }
        steps.push({ kind: 'boundary', boundary });
    }
    function perform(
        nodes: Node[],
        sectionIndex: number,
        sectionPass: number,
        repeatPasses: number[],
    ) {
        for (const node of nodes) {
            if (node.kind === 'bar') {
                if (measures++ >= MAX_MEASURES) {
                    expansionLimit();
                }
                emitBoundary(sectionIndex, node.index, 'start');
                steps.push({
                    kind: 'measure',
                    visit: {
                        sectionIndex,
                        measureIndex: node.index,
                        sectionPass,
                        repeatPasses: [...repeatPasses],
                    },
                });
                emitBoundary(sectionIndex, node.index, 'end');
            } else {
                // Native score policy: skipping repeats takes their final pass/ending,
                // recursively. Importers must not guess this policy from ambiguous text.
                for (let pass = policy === 'skip' ? node.times : 1; pass <= node.times; pass++) {
                    const path = [...repeatPasses, pass];
                    perform(node.body, sectionIndex, sectionPass, path);
                    const ending = node.endings.find((entry) => entry.passes.includes(pass));
                    if (ending) {
                        perform(ending.body, sectionIndex, sectionPass, path);
                    }
                }
            }
        }
    }
    forms.forEach((form, sectionIndex) => {
        const times = score.sections[sectionIndex].repeat;
        for (let pass = policy === 'skip' ? times - 1 : 0; pass < times; pass++) {
            perform(form, sectionIndex, pass, []);
        }
    });
    return { steps, markers };
}

/** Validate authored form, then unfold a bounded global itinerary. Never changes the score. */
export function compileScoreForm(candidate: unknown): ScoreFormVisit[] {
    const checked = validateSemanticScore(candidate);
    if (checked.kind !== 'ok') {
        const issue = checked.kind === 'invalid' ? checked.issues[0] : null;
        throw new Error(
            `The chart is invalid${issue ? ` (${issue.path}: ${issue.message})` : ''}; its source has not been changed.`,
        );
    }
    const score = checked.value;
    const forms = score.sections.map(sectionForm);
    const { boundaries, commands } = navigation(score, forms);
    const play = performanceTape(score, forms, boundaries, 'play');
    const skip = commands.some(({ jump }) => jump.repeats === 'skip')
        ? performanceTape(score, forms, boundaries, 'skip')
        : play;
    for (const { jump, boundary } of commands) {
        const selected = jump.repeats === 'skip' ? skip : play;
        const start = jump.from === 'start' ? 0 : selected.markers.get(jump.segno!)?.[0];
        const destination = jump.destination;
        const label =
            destination.kind === 'fine'
                ? destination.label
                : destination.kind === 'coda'
                  ? destination.via
                  : undefined;
        if (
            start === undefined ||
            (label !== undefined &&
                !selected.markers.get(label)?.some((index) => index >= start)) ||
            (destination.kind === 'coda' && !selected.markers.has(destination.target))
        ) {
            failAt(
                score,
                boundary,
                'The navigation destination is unreachable under the selected repeat policy.',
            );
        }
        if (destination.kind === 'coda') {
            const departure = selected.markers
                .get(destination.via)!
                .find((index) => index >= start)!;
            const arrival = selected.markers.get(destination.target)![0];
            if (arrival <= departure) {
                failAt(
                    score,
                    boundary,
                    'The coda arrival must follow its departure in the performed repeat route; this navigation would jump backward.',
                );
            }
        }
    }
    const used = new Set<Jump>();
    const visits: ScoreFormVisit[] = [];
    let tape = play;
    let cursor = 0;
    let active: { jump: Jump; boundary: Boundary } | undefined;

    function target(label: string, boundary: Boundary): number {
        const index = tape.markers.get(label)?.[0];
        if (index === undefined) {
            failAt(
                score,
                boundary,
                'The navigation destination is unreachable under the selected repeat policy.',
            );
        }
        return index;
    }
    while (cursor < tape.steps.length) {
        const step = tape.steps[cursor++];
        if (step.kind === 'measure') {
            if (visits.length >= MAX_MEASURES) {
                expansionLimit();
            }
            visits.push({ ...step.visit, repeatPasses: [...step.visit.repeatPasses] });
            continue;
        }
        const { boundary } = step;
        const destination = active?.jump.destination;
        if (
            destination?.kind === 'fine' &&
            boundary.directions.some(
                (direction) => direction.kind === 'fine' && direction.label === destination.label,
            )
        ) {
            return visits;
        }
        if (
            destination?.kind === 'coda' &&
            boundary.directions.some(
                (direction) => direction.kind === 'coda' && direction.label === destination.via,
            )
        ) {
            const arrival = target(destination.target, active!.boundary);
            if (arrival < cursor) {
                failAt(
                    score,
                    active!.boundary,
                    'The coda arrival must follow its departure in the performed repeat route; this navigation would jump backward.',
                );
            }
            cursor = arrival;
            active = undefined;
            continue;
        }
        const jump = boundary.directions.find(
            (direction): direction is Jump => direction.kind === 'jump',
        );
        if (!jump || used.has(jump)) {
            continue;
        }
        if (active && active.jump.destination.kind !== 'end') {
            failAt(
                score,
                boundary,
                'A second jump is reached before the active Fine or coda; the navigation destination is ambiguous.',
            );
        }
        used.add(jump);
        active = { jump, boundary };
        tape = jump.repeats === 'skip' ? skip : play;
        cursor = jump.from === 'start' ? 0 : target(jump.segno!, boundary);
    }
    if (active && active.jump.destination.kind !== 'end') {
        failAt(
            score,
            active.boundary,
            'The requested Fine or coda departure is unreachable after the jump.',
        );
    }
    return visits;
}
