import { validateSemanticScore } from './score-codec.js';
import type { ScoreDirection, ScoreSection } from './score-types.js';

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
const SUPPORTED = new Set(['repeat-start', 'repeat-end', 'ending-start', 'ending-end']);

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
                if (!SUPPORTED.has(direction.kind)) {
                    fail(
                        i,
                        'D.C./D.S., coda and Fine playback are not available yet. The chart is preserved.',
                    );
                }
                if (seen.has(direction.kind)) {
                    fail(i, 'Duplicate repeat or ending marker.');
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
                if (!used.has(key(index, edge, direction.kind))) {
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

/** Validate authored form, then unfold a bounded itinerary. Never changes the score. */
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
    const visits: ScoreFormVisit[] = [];
    function perform(
        nodes: Node[],
        sectionIndex: number,
        sectionPass: number,
        repeatPasses: number[],
    ) {
        for (const node of nodes) {
            if (node.kind === 'bar') {
                if (visits.length >= MAX_MEASURES) {
                    throw new Error(
                        'This chart expands beyond the playback limit of 16,384 measures. Reduce repeats.',
                    );
                }
                visits.push({
                    sectionIndex,
                    measureIndex: node.index,
                    sectionPass,
                    repeatPasses: [...repeatPasses],
                });
            } else {
                for (let pass = 1; pass <= node.times; pass++) {
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
        for (let pass = 0; pass < score.sections[sectionIndex].repeat; pass++) {
            perform(form, sectionIndex, pass, []);
        }
    });
    return visits;
}
