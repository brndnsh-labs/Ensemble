import { validateSemanticScore } from './score-codec.js';
import type { ScoreDirection, ScoreSection, SemanticScore } from './score-types.js';

export interface ScoreFormVisit {
    sectionIndex: number;
    measureIndex: number;
    sectionPass: number;
    /** Musical pass numbers, outermost repeat first (unlike the zero-based indices). */
    repeatPasses: number[];
    /** Which chorus of the performance, from 0. Always 0 when the chart counts no choruses. */
    chorus: number;
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

/** A section labelled as an intro: the band's, before the lead comes in (`leadRole`). */
export const isIntroLabel = (label: string) => /^intro/i.test(label.trim());
/** A section labelled as an outro: written ending material. */
export const isOutroLabel = (label: string) => /^outro/i.test(label.trim());

/**
 * The sections a counted chart plays once (#1483, DECISION 2026-10-08): an intro in the first
 * chorus only, an outro in the last only, as a band plays them. By section label and by place:
 * the intro is the sections so labelled that open the chart, the outro those that close it. One
 * between two verses is an interlude, part of the form, and plays every chorus. Null when the
 * chart has neither, or nothing else. An uncounted chart loops as written and never asks.
 */
function onceSections(score: SemanticScore): { intro: Set<number>; outro: Set<number> } | null {
    const labels = score.sections.map(({ label }) => label);
    const opening = labels.findIndex((label) => !isIntroLabel(label));
    let closing = labels.length - 1;
    while (closing >= 0 && isOutroLabel(labels[closing])) {
        closing--;
    }
    // `opening > closing`: nothing lies between the intro and the outro.
    if (opening > closing || (opening === 0 && closing === labels.length - 1)) {
        return null;
    }
    const range = (from: number, to: number) =>
        new Set(Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i));
    return { intro: range(0, opening), outro: range(closing + 1, labels.length) };
}

type Jump = Extract<ScoreDirection, { kind: 'jump' }>;
type Marker = Extract<ScoreDirection, { kind: 'segno' | 'coda' | 'fine' }>;
type LastChorus = Extract<ScoreDirection, { kind: 'last-chorus' }>;
interface Boundary {
    sectionIndex: number;
    measureIndex: number;
    edge: 'start' | 'end';
    /** Written measure boundary, independent of repeat expansion. */
    position: number;
    directions: (Jump | Marker)[];
}
type PerformanceStep =
    | { kind: 'measure'; visit: Omit<ScoreFormVisit, 'chorus'> }
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

/**
 * `choruses`: fewer choruses would help, because the whole counted performance is over the limit.
 * Otherwise the message is the one uncounted charts always had.
 */
function expansionLimit(choruses = false): never {
    throw new Error(
        `This chart expands beyond the playback limit of 16,384 measures. Reduce repeats${choruses ? ' or choruses' : ''}.`,
    );
}

function jumpInRepeat(score: SemanticScore, boundary: Boundary): never {
    failAt(
        score,
        boundary,
        'Jump timing inside a repeated passage is ambiguous. Place the D.C./D.S. command after the complete repeat and its endings in a section that plays once.',
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
    const lastChoruses: { direction: LastChorus; boundary: Boundary }[] = [];
    let position = 0;
    score.sections.forEach((section, sectionIndex) => {
        section.measures.forEach((measure, measureIndex) => {
            for (const edge of ['start', 'end'] as const) {
                const at = {
                    sectionIndex,
                    measureIndex,
                    edge,
                    position: position + (edge === 'end' ? 1 : 0),
                };
                for (const direction of measure[edge] ?? []) {
                    if (direction.kind === 'last-chorus') {
                        lastChoruses.push({ direction, boundary: { ...at, directions: [] } });
                    }
                }
                // A last-chorus coda is not a tape marker: it names markers that already are.
                const directions = (measure[edge] ?? []).filter(
                    (direction): direction is Jump | Marker =>
                        !FORM_DIRECTIONS.has(direction.kind) && direction.kind !== 'last-chorus',
                );
                if (!directions.length) {
                    continue;
                }
                const boundary: Boundary = { ...at, directions };
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
                    boundary?.directions.some(
                        // An al-ending jump is held to the exact rule instead: see compileScoreForm.
                        (direction) =>
                            direction.kind === 'jump' && direction.destination.kind !== 'ending',
                    ) &&
                    (nested || score.sections[sectionIndex].repeat > 1)
                ) {
                    jumpInRepeat(score, boundary);
                }
            }
        }
    }
    forms.forEach((form, sectionIndex) => checkCommandOwnership(form, sectionIndex, false));
    for (const { jump, boundary } of commands) {
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
    return {
        boundaries,
        commands,
        markers,
        lastChorus: lastChorusCoda(score, markers, commands, lastChoruses),
    };
}

type RouteVisit = Omit<ScoreFormVisit, 'chorus'>;

function firstBar(node: Node): number {
    return node.kind === 'bar' ? node.index : firstBar(node.body[0] ?? node.endings[0].body[0]);
}

function lastBar(node: Node): number {
    if (node.kind === 'bar') {
        return node.index;
    }
    const tail = node.endings.at(-1)?.body ?? node.body;
    return lastBar(tail[tail.length - 1]);
}

/**
 * "D.C./D.S. al Nth ending" (#1473), after iReal Pro's own definition
 * (https://www.irealpro.com/learn/repeats-endings-and-jumps/): "D.C. al 2nd ending returns to
 * the top, skips the first ending, and takes the second. It also needs a Fine to mark where to
 * stop." After the return, the one repeat with an ending N is played once, straight into ending
 * N, and the performance goes on to the Fine. Returns the performed route from the return point
 * to that Fine, so every chorus that takes the jump plays the same bars.
 *
 * Refused rather than guessed: no repeat with ending N after the return point, or more than one;
 * any other repeat (an enclosing one, a nested one, a later one, a repeated section) before the
 * Fine, since whether it replays after the jump is undocumented; a Fine before ending N; another
 * jump on the way; and no Fine before the route comes back round to the command itself.
 */
function endingRoute(
    score: SemanticScore,
    forms: Node[][],
    boundaries: Map<string, Boundary>,
    command: { jump: Jump; boundary: Boundary },
    pass: number,
    landing: Boundary | undefined,
): RouteVisit[] {
    const refuse = (message: string): never => failAt(score, command.boundary, message);
    const returnPoint = landing?.position ?? 0;
    const offsets: number[] = [];
    score.sections.reduce((offset, section, sectionIndex) => {
        offsets[sectionIndex] = offset;
        return offset + section.measures.length;
    }, 0);

    const targets: Node[] = [];
    function collect(nodes: Node[], sectionIndex: number) {
        for (const node of nodes) {
            if (node.kind !== 'repeat') {
                continue;
            }
            if (
                offsets[sectionIndex] + firstBar(node) >= returnPoint &&
                node.endings.some((ending) => ending.passes.includes(pass))
            ) {
                targets.push(node);
            }
            collect(node.body, sectionIndex);
            for (const ending of node.endings) {
                collect(ending.body, sectionIndex);
            }
        }
    }
    forms.forEach(collect);
    if (!targets.length) {
        refuse(
            `D.C./D.S. al ending ${pass} needs a repeat with an ending ${pass} after its return point.`,
        );
    }
    if (targets.length > 1) {
        refuse(
            `More than one repeat after the D.C./D.S. return point has an ending ${pass}; which one the jump takes is ambiguous.`,
        );
    }
    const [target] = targets;
    const otherRepeat = (): never =>
        refuse(
            `Another repeat lies in the passage replayed after the D.C./D.S. al ending ${pass}; whether it repeats again is not documented.`,
        );

    const route: RouteVisit[] = [];
    let inEnding = false;
    /** True when the boundary holds the Fine that ends the route. */
    function cross(boundary: Boundary | undefined): boolean {
        for (const direction of boundary?.directions ?? []) {
            if (direction === command.jump) {
                refuse(
                    `D.C./D.S. al ending ${pass} needs a Fine after ending ${pass}, before the jump.`,
                );
            }
            if (direction.kind === 'jump') {
                refuse(
                    'A second jump is reached before the active Fine or coda; the navigation destination is ambiguous.',
                );
            }
        }
        if (!boundary?.directions.some((direction) => direction.kind === 'fine')) {
            return false;
        }
        if (!inEnding) {
            refuse(
                `The Fine comes before ending ${pass} in the passage replayed after the D.C./D.S.; the jump would stop before its ending.`,
            );
        }
        return true;
    }
    function play(sectionIndex: number, nodes: Node[], repeatPasses: number[]): boolean {
        for (const node of nodes) {
            if (node.kind === 'repeat') {
                otherRepeat();
            } else {
                const at = (edge: 'start' | 'end') =>
                    boundaries.get(boundaryKey(sectionIndex, node.index, edge));
                if (cross(at('start'))) {
                    return true;
                }
                route.push({
                    sectionIndex,
                    measureIndex: node.index,
                    sectionPass: 0,
                    repeatPasses: [...repeatPasses],
                });
                if (cross(at('end'))) {
                    return true;
                }
            }
        }
        return false;
    }

    // A D.S. sign on an end boundary is crossed as the route sets off, as on the tape.
    if (landing?.edge === 'end' && cross(landing)) {
        return route;
    }
    for (const [sectionIndex, form] of forms.entries()) {
        for (const node of form) {
            const first = offsets[sectionIndex] + firstBar(node);
            if (offsets[sectionIndex] + lastBar(node) < returnPoint) {
                continue;
            }
            if (first < returnPoint || score.sections[sectionIndex].repeat > 1) {
                otherRepeat();
            }
            if (node === target && node.kind === 'repeat') {
                if (play(sectionIndex, node.body, [pass])) {
                    return route;
                }
                inEnding = true;
                const ending = node.endings.find((entry) => entry.passes.includes(pass))!;
                if (play(sectionIndex, ending.body, [pass])) {
                    return route;
                }
            } else if (play(sectionIndex, [node], [])) {
                return route;
            }
        }
    }
    // Unreachable while the command follows its return point: the route meets it first.
    return refuse(
        `D.C./D.S. al ending ${pass} needs a Fine after ending ${pass}, before the jump.`,
    );
}

/**
 * Check a last-chorus coda (#1472) whether or not the chart counts its choruses, and return its
 * destination with the boundary it departs from.
 */
function lastChorusCoda(
    score: SemanticScore,
    markers: Map<string, Boundary>,
    commands: { jump: Jump; boundary: Boundary }[],
    found: { direction: LastChorus; boundary: Boundary }[],
) {
    const [lastChorus, extra] = found;
    if (extra) {
        failAt(
            score,
            extra.boundary,
            'A chart takes one last-chorus coda; which departure ends the performance is ambiguous.',
        );
    }
    if (!lastChorus) {
        return undefined;
    }
    if (commands.length) {
        // Conservative until a real chart needs both: with a D.C./D.S. in the chorus, the
        // departure is passed before and after the jump, and "the last time" could be either.
        failAt(
            score,
            lastChorus.boundary,
            'A last-chorus coda cannot share a chart with a D.C./D.S. jump yet; which pass through its departure is the last time is ambiguous.',
        );
    }
    const destination = lastChorus.direction.destination;
    // A tag (#1487) writes no departure sign: every chorus ends where its coda begins, and the
    // last one plays on into it. That barline is its departure.
    const departure = markers.get(destination.via ?? destination.target)!;
    if (
        departure.sectionIndex !== lastChorus.boundary.sectionIndex ||
        departure.measureIndex !== lastChorus.boundary.measureIndex ||
        departure.edge !== lastChorus.boundary.edge
    ) {
        failAt(
            score,
            lastChorus.boundary,
            destination.via === undefined
                ? 'Place a last-chorus coda with no departure sign on the same bar boundary as its coda sign.'
                : 'Place the last-chorus coda on the same bar boundary as its departure coda sign.',
        );
    }
    if (destination.via === undefined && departure.position === 0) {
        // Every chorus but the last would play nothing at all.
        failAt(
            score,
            departure,
            'A last-chorus coda with no departure sign needs at least one bar of form before it.',
        );
    }
    // Unlike a D.S. al Coda, the arrival may share the departure's barline: the coda written
    // straight after the form is an outro the last chorus plays on into. The performed-route
    // check in compileScoreForm still refuses a hop that would land behind its departure.
    if (markers.get(destination.target)!.position < departure.position) {
        failAt(
            score,
            departure,
            'The coda arrival must follow its departure; a backward coda would create a navigation cycle.',
        );
    }
    return { destination, departure };
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
    const { boundaries, commands, markers, lastChorus } = navigation(score, forms);
    const play = performanceTape(score, forms, boundaries, 'play');
    const endingRoutes = new Map<Jump, RouteVisit[]>();
    for (const { jump, boundary } of commands) {
        if (jump.destination.kind !== 'ending') {
            continue;
        }
        // An al-ending jump may sit in a final ending, as iReal charts write it: the last ending
        // runs to the section's end, so "D.C. al 2nd ending" lands inside the 2nd ending it names
        // (Cherokee). Only a jump the form reaches more than once has ambiguous timing.
        if (
            play.steps.filter((step) => step.kind === 'boundary' && step.boundary === boundary)
                .length > 1
        ) {
            jumpInRepeat(score, boundary);
        }
        const landing = jump.from === 'start' ? undefined : markers.get(jump.segno!)!;
        endingRoutes.set(
            jump,
            endingRoute(
                score,
                forms,
                boundaries,
                { jump, boundary },
                jump.destination.pass,
                landing,
            ),
        );
    }
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
    if (lastChorus) {
        // The departure must be passed once a chorus, or "the last time" through it is ambiguous.
        // The play tape holds every written bar, so both markers are on it.
        const { via, target: coda } = lastChorus.destination;
        const departures = play.markers.get(via ?? coda)!;
        // Passed once is not enough: a departure in a first ending is passed on pass 1 only,
        // and the written route then goes back behind it for the next pass (#1476 review).
        const firstBar = score.sections.map((_, index) =>
            score.sections
                .slice(0, index)
                .reduce((count, section) => count + section.measures.length, 0),
        );
        const goesBack = play.steps
            .slice(departures[0] + 1)
            .some(
                (step) =>
                    step.kind === 'measure' &&
                    firstBar[step.visit.sectionIndex] + step.visit.measureIndex <
                        lastChorus.departure.position,
            );
        // A tag's sign opens its coda, so a coda that repeats passes it again without going
        // back behind it: the first time through is still the only way in.
        if ((via !== undefined && departures.length > 1) || goesBack) {
            failAt(
                score,
                lastChorus.departure,
                'The last-chorus coda departs inside a repeated passage; which pass is the last time is ambiguous. Place its coda sign after the complete repeat in a section that plays once.',
            );
        }
        // A tag's departure is its arrival, so it has no hop to check.
        if (via !== undefined && play.markers.get(coda)![0] <= departures[0]) {
            failAt(
                score,
                lastChorus.departure,
                'The coda arrival must follow its departure in the performed repeat route; this navigation would jump backward.',
            );
        }
    }
    const visits: ScoreFormVisit[] = [];
    const choruses = score.choruses ?? 1;
    let once = score.choruses === undefined ? null : onceSections(score);
    if (!unroll() && once) {
        // Leaving them out emptied a chorus (the form between them is itself cut short by a
        // last-chorus coda): the chart is played as written instead.
        once = null;
        visits.length = 0;
        unroll();
    }
    return visits;

    /** Every chorus in turn. False when one of them played no bar at all. */
    function unroll(): boolean {
        let full = true;
        for (let chorus = 0; chorus < choruses; chorus++) {
            const before = visits.length;
            // Only the final chorus of a COUNTED performance takes a last-chorus coda. An
            // uncounted one loops its single chorus forever, so it never reaches a last time.
            performChorus(chorus, score.choruses !== undefined && chorus === choruses - 1);
            full &&= visits.length > before;
        }
        return full;
    }

    /** One pass of the form. A D.C./D.S. is taken afresh in every chorus. */
    function performChorus(chorus: number, final: boolean): void {
        const used = new Set<Jump>();
        let tape = play;
        let cursor = 0;
        let active: { jump: Jump; boundary: Boundary } | undefined;

        function perform(visit: RouteVisit) {
            // Only the bars are left out: the barlines' signs and jumps are still read, so the
            // rest of the chorus goes where it is written to go.
            if (
                once &&
                ((chorus > 0 && once.intro.has(visit.sectionIndex)) ||
                    (!final && once.outro.has(visit.sectionIndex)))
            ) {
                return;
            }
            if (visits.length >= MAX_MEASURES) {
                expansionLimit(score.choruses !== undefined);
            }
            visits.push({ ...visit, repeatPasses: [...visit.repeatPasses], chorus });
        }
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
                perform(step.visit);
                continue;
            }
            const { boundary } = step;
            const codaAt = (label: string) =>
                boundary.directions.some(
                    (direction) => direction.kind === 'coda' && direction.label === label,
                );
            if (lastChorus && !final && codaAt(lastChorus.destination.target)) {
                // Written outro material: only the last chorus plays from here on.
                return;
            }
            // A tag (#1487) has no `via`: the last chorus plays straight on into its coda.
            const via = final ? lastChorus?.destination.via : undefined;
            if (via !== undefined && codaAt(via)) {
                // lastChorusCoda() refuses any jump beside it, so this is still the play tape.
                cursor = tape.markers.get(lastChorus!.destination.target)![0];
                continue;
            }
            const destination = active?.jump.destination;
            if (
                destination?.kind === 'fine' &&
                boundary.directions.some(
                    (direction) =>
                        direction.kind === 'fine' && direction.label === destination.label,
                )
            ) {
                return;
            }
            if (destination?.kind === 'coda' && codaAt(destination.via)) {
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
            const route = endingRoutes.get(jump);
            if (route) {
                // The al-ending route was checked whole before the first chorus, Fine included.
                route.forEach(perform);
                return;
            }
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
    }
}
