'use client';

import { type KeyboardEvent, type PointerEvent, useRef } from 'react';
import {
    DEGREES,
    type Degree,
    fingerMap,
    type HomeWindow,
    type InstrumentDef,
    type Note,
    rootMove,
    spellDegree,
    type Voicing,
} from '../lib/shells';
import { BOARD_TOP, dx, END, fretAt, fx, HOME_W, NF, NUT, neckLayout } from './neck-geometry';
import './neck.css';

// The practice view's fretboard (#1586): a dumb renderer, voicing in and SVG out. Ported from the
// handoff prototype's `createNeck`; everything it knows about grips, fingers and motion comes
// from `lib/shells`. Colour means degree, always; fingers get numbers and motion, never colour.

export type NeckPreview = 'off' | 'soft' | 'strong';
export type NeckLabels = 'finger' | 'degree' | 'note';

export interface NeckProps {
    instrument: InstrumentDef;
    /** The grip to show. */
    active: Voicing | null;
    /** The next grip, for the preview layer. */
    next: Voicing | null;
    /** Preview layer strength. */
    preview: NeckPreview;
    /** What's inside the dots. */
    labels: NeckLabels;
    /** Shaded window + draggable handle; null = no band. */
    home: HomeWindow | null;
    /** Handle moved: the new start fret (the window is `[start, start + HOME_W − 1]`). */
    onHome?: (start: number) => void;
    /** A hold or N.C.: show the last grip at reduced opacity. */
    dimmed?: boolean;
    /** Pulse the dots once (a chord just landed). */
    strike?: boolean;
    /** Unique per instance, for SVG marker ids. */
    id: string;
}

/** Fret dots, keyed by instrument id (both ukes share `uke`). The guitar's 12 is a double. */
const INLAYS: Record<string, { single: number[]; double: number[] }> = {
    guitar: { single: [3, 5, 7, 9, 15], double: [12] },
    uke: { single: [5, 7, 10, 12, 15], double: [] },
};

/** Degree → the class that fills a dot with its `--d-*` token. */
const DEGREE_FILL: Record<Degree, string> = {
    R: 'neck-fill-root',
    '3': 'neck-fill-3',
    b3: 'neck-fill-b3',
    '7': 'neck-fill-7',
    b7: 'neck-fill-b7',
    bb7: 'neck-fill-6',
    '6': 'neck-fill-6',
    '13': 'neck-fill-6',
    '5': 'neck-fill-5',
    b5: 'neck-fill-5',
    '9': 'neck-fill-9',
};

/** The highest start fret the handle can reach: the window ends on the last fret. */
const MAX_START = NF - HOME_W + 1;
const clampStart = (start: number): number => Math.max(1, Math.min(MAX_START, start));

/** A dot's identity across chords: its finger, so a dot slides to where that finger goes. */
const dotKey = (n: Note): string => (n.finger ? `F${n.finger}` : `O${n.string}`);

function labelFor(n: Note, root: Voicing['root'], mode: NeckLabels): string {
    if (mode === 'finger') {
        return n.fret === 0 ? '0' : String(n.finger ?? '');
    }
    return mode === 'note' ? spellDegree(root, n.degree) : DEGREES[n.degree].label;
}

/**
 * One id per voicing object, so the strike keyframe re-runs on every new chord (a repeated chord
 * is a new voicing too) without React state: the dot's core remounts under a new key.
 */
const strikeIds = new WeakMap<Voicing, number>();
let nextStrikeId = 0;
function strikeId(v: Voicing): number {
    let id = strikeIds.get(v);
    if (id === undefined) {
        id = ++nextStrikeId;
        strikeIds.set(v, id);
    }
    return id;
}

/** A quadratic arrow from a to b, trimmed off both dots and bowed sideways by `bend`. */
function curve(
    a: { x: number; y: number },
    b: { x: number; y: number },
    trimStart: number,
    trimEnd: number,
    bend: number,
    lift = 0,
) {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const sx = a.x + ux * trimStart;
    const sy = a.y + uy * trimStart;
    const ex = b.x - ux * trimEnd;
    const ey = b.y - uy * trimEnd;
    const cx = (sx + ex) / 2 - uy * bend;
    const cy = (sy + ey) / 2 + ux * bend + lift;
    return { d: `M${sx} ${sy} Q${cx} ${cy} ${ex} ${ey}`, sx, sy, cx, cy, ex, ey };
}

export function Neck({
    instrument,
    active,
    next,
    preview,
    labels,
    home,
    onHome,
    dimmed = false,
    strike = false,
    id,
}: NeckProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    // The one piece of interaction memory: where a handle drag started.
    const drag = useRef<{ start: number; fret: number; last: number } | null>(null);

    const n = instrument.strings;
    const { spacing, sy, boardBottom, height } = neckLayout(n);
    const boardHeight = boardBottom - BOARD_TOP;
    const midY = (sy(1) + sy(n)) / 2;
    const inlays = INLAYS[instrument.id] ?? INLAYS.guitar;
    const isUke = instrument.id === 'uke';

    const svgX = (e: PointerEvent): number => {
        const svg = svgRef.current;
        const m = svg?.getScreenCTM();
        if (!svg || !m) {
            return 0;
        }
        return new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()).x;
    };

    const onHandleDown = (e: PointerEvent<SVGGElement>) => {
        if (!home) {
            return;
        }
        e.preventDefault();
        drag.current = { start: home[0], fret: fretAt(svgX(e)), last: home[0] };
        try {
            svgRef.current?.setPointerCapture(e.pointerId);
        } catch {
            // A synthetic or already-released pointer: the drag still works while over the svg.
        }
    };
    const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
        const d = drag.current;
        if (!d) {
            return;
        }
        const start = clampStart(d.start + fretAt(svgX(e)) - d.fret);
        if (start !== d.last) {
            d.last = start;
            onHome?.(start);
        }
    };
    const endDrag = () => {
        drag.current = null;
    };
    const onHandleKey = (e: KeyboardEvent<SVGGElement>) => {
        if (!home) {
            return;
        }
        const step =
            e.key === 'ArrowRight' || e.key === 'ArrowUp'
                ? 1
                : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
                  ? -1
                  : 0;
        if (!step) {
            return;
        }
        e.preventDefault();
        const start = clampStart(home[0] + step);
        // The handle is the same element across renders, so focus stays on it after the move.
        if (start !== home[0]) {
            onHome?.(start);
        }
    };

    // Root motion: a bold path from this root to the next one, labelled with the interval.
    const showPreview = active !== null && next !== null && preview !== 'off';
    const motion = showPreview ? rootMove(instrument, active, next) : null;
    const rootPair =
        motion?.from &&
        motion.to &&
        !(motion.from.string === motion.to.string && motion.from.fret === motion.to.fret)
            ? { from: motion.from, to: motion.to, text: motion.text }
            : null;

    // Finger preview: what each finger does on the way to the next grip.
    const holds = new Set<string>();
    const lifts = new Set<string>();
    const moves: Array<{ finger: number; from: Note | undefined; to: Note }> = [];
    if (showPreview) {
        const A = fingerMap(active.notes);
        const B = fingerMap(next.notes);
        for (let f = 1; f <= 4; f++) {
            const a = A[f];
            const b = B[f];
            if (a && b && a.string === b.string && a.fret === b.fret) {
                holds.add(`F${f}`);
            } else if (a && !b) {
                lifts.add(`F${f}`);
            } else if (b) {
                moves.push({ finger: f, from: a, to: b });
            }
        }
    }

    const point = (note: Note) => ({ x: dx(note.fret), y: sy(note.string) });

    const boardLabel = active
        ? `${active.symbol}: ${active.notes
              .map(
                  (x) =>
                      `${instrument.strName(x.string)} fret ${x.fret}${x.finger ? `, finger ${x.finger}` : ''}, ${DEGREES[x.degree].name}`,
              )
              .join('; ')}`
        : 'Fretboard showing the current chord';

    let outline: { x: number; y: number; width: number; height: number } | null = null;
    if (active && active.notes.length > 0) {
        const xs = active.notes.map((x) => dx(x.fret));
        const ss = active.notes.map((x) => x.string);
        const x1 = Math.min(...xs) - 22;
        const y1 = sy(Math.min(...ss)) - 20;
        outline = {
            x: x1,
            y: y1,
            width: Math.max(...xs) + 22 - x1,
            height: sy(Math.max(...ss)) + 20 - y1,
        };
    }

    let band: { x1: number; x2: number } | null = null;
    if (home) {
        band = {
            x1: fx(home[0] - 1) + (home[0] === 1 ? 0 : 1.5),
            x2: fx(home[1]) - 1.5,
        };
    }

    const dots = active ? [...active.notes].sort((a, b) => dotKey(a).localeCompare(dotKey(b))) : [];
    const strength = preview === 'strong' ? 'is-strong' : 'is-soft';

    return (
        <svg
            ref={svgRef}
            className={`neck ${strength}`}
            viewBox={`0 0 1000 ${height}`}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
        >
            <defs>
                <marker
                    id={`${id}-head`}
                    viewBox="0 0 10 10"
                    refX={7}
                    refY={5}
                    markerWidth={7}
                    markerHeight={7}
                    orient="auto-start-reverse"
                >
                    <path d="M0 0 L10 5 L0 10 Z" className="neck-move-fill" />
                </marker>
                <marker
                    id={`${id}-roothead`}
                    viewBox="0 0 10 10"
                    refX={6}
                    refY={5}
                    markerWidth={5}
                    markerHeight={5}
                    orient="auto-start-reverse"
                >
                    <path d="M0 0 L10 5 L0 10 Z" className="neck-fill-root" />
                </marker>
            </defs>
            <g role="img" aria-label={boardLabel}>
                <g className="neck-board">
                    <rect
                        className="neck-wood"
                        x={NUT}
                        y={BOARD_TOP}
                        width={END - NUT}
                        height={boardHeight}
                        rx={3}
                    />
                    <rect
                        className="neck-wood-edge"
                        x={NUT}
                        y={boardBottom - 4}
                        width={END - NUT}
                        height={4}
                    />
                    {inlays.single.map((f) => (
                        <circle key={f} className="neck-inlay" cx={dx(f)} cy={midY} r={6} />
                    ))}
                    {inlays.double.flatMap((f) =>
                        [midY - spacing, midY + spacing].map((y) => (
                            <circle
                                key={`${f}-${y}`}
                                className="neck-inlay"
                                cx={dx(f)}
                                cy={y}
                                r={6}
                            />
                        )),
                    )}
                    {Array.from({ length: NF }, (_, i) => i + 1).map((f) => (
                        <rect
                            key={f}
                            className="neck-fret"
                            x={fx(f) - 1.5}
                            y={BOARD_TOP}
                            width={3}
                            height={boardHeight}
                        />
                    ))}
                    <rect
                        className="neck-fret"
                        x={NUT - 5}
                        y={BOARD_TOP - 2}
                        width={7}
                        height={boardHeight + 4}
                        rx={1.5}
                    />
                    {Array.from({ length: n }, (_, i) => i + 1).map((s) => (
                        <g key={s}>
                            <line
                                className="neck-string"
                                x1={NUT - 44}
                                x2={END}
                                y1={sy(s)}
                                y2={sy(s)}
                                strokeWidth={
                                    isUke ? 1.1 + [0.2, 0.5, 0.9, 0.35][s - 1] : 0.8 + s * 0.32
                                }
                            />
                            <text className="neck-text neck-string-letter" x={6} y={sy(s) + 4}>
                                {instrument.letters[s - 1]}
                            </text>
                        </g>
                    ))}
                    {Array.from({ length: NF + 1 }, (_, f) => f).map((f) => (
                        <text
                            key={f}
                            className="neck-text neck-fret-number"
                            x={dx(f)}
                            y={boardBottom + 22}
                        >
                            {f}
                        </text>
                    ))}
                </g>
                {band && (
                    <g className="neck-band">
                        <rect
                            className="neck-shade"
                            x={NUT}
                            y={BOARD_TOP}
                            width={Math.max(0, band.x1 - NUT)}
                            height={boardHeight}
                        />
                        <rect
                            className="neck-shade"
                            x={band.x2}
                            y={BOARD_TOP}
                            width={Math.max(0, END - band.x2)}
                            height={boardHeight}
                        />
                        <rect
                            className="neck-window"
                            x={band.x1}
                            y={BOARD_TOP}
                            width={band.x2 - band.x1}
                            height={boardHeight}
                        />
                    </g>
                )}
                {outline && <rect className="neck-outline" rx={18} {...outline} />}
                {rootPair && (
                    <RootPath
                        from={point(rootPair.from)}
                        to={point(rootPair.to)}
                        sameString={rootPair.from.string === rootPair.to.string}
                        text={rootPair.text}
                        marker={`url(#${id}-roothead)`}
                    />
                )}
                {showPreview && (
                    <g className="neck-preview">
                        {moves.map(({ finger, from, to }) => {
                            const b = point(to);
                            const isRootPath =
                                rootPair !== null && from === rootPair.from && to === rootPair.to;
                            const arrow =
                                from && !isRootPath
                                    ? curve(
                                          point(from),
                                          b,
                                          16,
                                          15,
                                          from.string === to.string ? -26 : 16,
                                          from.string === to.string ? -6 : 0,
                                      )
                                    : null;
                            return (
                                <g key={finger}>
                                    {arrow && (
                                        <path
                                            className="neck-arrow"
                                            d={arrow.d}
                                            pathLength={120}
                                            markerEnd={`url(#${id}-head)`}
                                        />
                                    )}
                                    <g
                                        className="neck-target"
                                        transform={`translate(${b.x},${b.y})`}
                                    >
                                        <circle r={12} />
                                        <text y={4.5}>{finger}</text>
                                    </g>
                                </g>
                            );
                        })}
                    </g>
                )}
                {active && (
                    <g
                        className={`neck-active${dimmed ? ' is-dimmed' : ''}${strike ? ' is-strike' : ''}`}
                    >
                        {dots.map((x) => {
                            const key = dotKey(x);
                            const root = x.role === 'R';
                            const label = labelFor(x, active.root, labels);
                            const state = holds.has(key)
                                ? ' is-hold'
                                : lifts.has(key)
                                  ? ' is-lift'
                                  : '';
                            return (
                                <g
                                    key={key}
                                    className={`neck-dot${state}`}
                                    data-dot={key}
                                    style={{
                                        transform: `translate(${dx(x.fret)}px, ${sy(x.string)}px)`,
                                    }}
                                >
                                    <circle className="neck-ring" r={19} />
                                    <g
                                        key={strike ? strikeId(active) : 'core'}
                                        className="neck-core"
                                    >
                                        <circle
                                            className={`neck-body ${DEGREE_FILL[x.degree]}${root ? ' is-root' : ''}`}
                                            r={root ? 16 : 14}
                                        />
                                        <text
                                            className={`neck-dot-label${x.degree === '7' ? ' is-dark' : ''}${label.length > 2 ? ' is-small' : ''}`}
                                            y={4.5}
                                        >
                                            {label}
                                        </text>
                                    </g>
                                </g>
                            );
                        })}
                    </g>
                )}
            </g>
            {home && band && (
                <g
                    className="neck-handle"
                    tabIndex={0}
                    role="slider"
                    aria-label="Hand position"
                    aria-valuemin={1}
                    aria-valuemax={MAX_START}
                    aria-valuenow={home[0]}
                    aria-valuetext={`frets ${home[0]} to ${home[1]}`}
                    onPointerDown={onHandleDown}
                    onKeyDown={onHandleKey}
                >
                    <rect x={band.x1} y={4} width={band.x2 - band.x1} height={20} rx={10} />
                    <text x={(band.x1 + band.x2) / 2} y={18}>
                        {`‹ Home · frets ${home[0]}–${home[1]} ›`}
                    </text>
                </g>
            )}
        </svg>
    );
}

function RootPath({
    from,
    to,
    sameString,
    text,
    marker,
}: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    sameString: boolean;
    text: string;
    marker: string;
}) {
    // Same string: bow well clear of the dots between. Straight across one fret: no bow at all.
    const vertical = Math.abs(to.x - from.x) < 4;
    const bend = sameString ? 30 : vertical ? 0 : -14;
    const c = curve(from, to, 18, 19, bend);
    // The pill sits at the curve's midpoint, beside a vertical path and above any other.
    const lx = 0.25 * c.sx + 0.5 * c.cx + 0.25 * c.ex;
    const ly = 0.25 * c.sy + 0.5 * c.cy + 0.25 * c.ey;
    const w = text.length * 6.6 + 16;
    const tx = vertical ? lx + w / 2 + 14 : lx;
    const ty = vertical ? ly : ly - 16;
    return (
        <g className="neck-rootpath">
            <path className="neck-rootpath-line" d={c.d} markerEnd={marker} />
            <rect
                className="neck-fill-root"
                x={tx - w / 2}
                y={ty - 10}
                width={w}
                height={20}
                rx={10}
            />
            <text className="neck-rootpath-label" x={tx} y={ty + 4}>
                {text}
            </text>
        </g>
    );
}
