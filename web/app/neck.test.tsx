// @vitest-environment happy-dom
/**
 * The neck's geometry and preview layer (#1586), rendered for real (react-dom into happy-dom).
 * Expected positions come from `neck-geometry.ts`'s `dx`/`neckLayout`, computed here from the
 * grip's own frets and strings — never read back off the rendered SVG.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allPositions, build, GUITAR, type Note, UKULELE, type Voicing } from '../lib/voicings';
import { Neck, type NeckProps } from './neck';
import {
    boardTransform,
    boardX,
    dx,
    fretAt,
    fx,
    HOME_W,
    NF,
    neckLayout,
    viewWindow,
} from './neck-geometry';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const G = { name: 'G', pc: 7, letter: 4 };
const SHAPE_6A = GUITAR.shapes[0];
const gmaj7 = build(GUITAR, SHAPE_6A, G, 'maj7') as Voicing;
const g7 = build(GUITAR, SHAPE_6A, G, 'dom7') as Voicing;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function render(props: Partial<NeckProps> = {}) {
    act(() => {
        root.render(
            <Neck
                instrument={GUITAR}
                active={gmaj7}
                next={null}
                preview="off"
                labels="finger"
                home={null}
                id="neck-test"
                {...props}
            />,
        );
    });
}

const dots = () => [...host.querySelectorAll<SVGGElement>('.neck-dot')];
const dotFor = (note: Note) =>
    host.querySelector<SVGGElement>(
        `[data-dot="${note.finger ? `F${note.finger}` : `O${note.string}`}"]`,
    );
/** The dot's translate, in viewBox units. */
function position(dot: SVGGElement): [number, number] {
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(dot.style.transform);
    expect(m).not.toBeNull();
    return [Number(m![1]), Number(m![2])];
}
const labelsShown = () =>
    gmaj7.notes.map((n) => dotFor(n)?.querySelector('.neck-dot-label')?.textContent);

describe('Neck: a Gmaj7 on the 6A shape', () => {
    it('is the grip the test means: strings 6/4/3 at frets 3/4/4', () => {
        expect(gmaj7.notes.map((n) => [n.string, n.fret, n.degree])).toEqual([
            [6, 3, 'R'],
            [4, 4, '7'],
            [3, 4, '3'],
        ]);
    });

    it('draws three dots at the fret and string each note sits on', () => {
        render();
        expect(dots()).toHaveLength(3);
        const { sy } = neckLayout(GUITAR.strings);
        for (const note of gmaj7.notes) {
            const dot = dotFor(note);
            expect(dot).not.toBeNull();
            const [x, y] = position(dot!);
            expect(x).toBeCloseTo(dx(note.fret), 6);
            expect(y).toBeCloseTo(sy(note.string), 6);
        }
        // Frets 3 and 4 are different widths apart: real spacing, not a grid.
        expect(dx(4) - dx(3)).toBeLessThan(dx(3) - dx(2));
    });

    it('makes the root dot bigger', () => {
        render();
        const [rootNote, ...others] = gmaj7.notes;
        expect(dotFor(rootNote)!.querySelector('.neck-body')!.getAttribute('r')).toBe('16');
        for (const n of others) {
            expect(dotFor(n)!.querySelector('.neck-body')!.getAttribute('r')).toBe('14');
        }
    });

    it('labels dots by finger, degree or note name', () => {
        render({ labels: 'finger' });
        expect(labelsShown()).toEqual(gmaj7.notes.map((n) => String(n.finger)));
        render({ labels: 'degree' });
        expect(labelsShown()).toEqual(['R', '7', '3']);
        render({ labels: 'note' });
        expect(labelsShown()).toEqual(['G', 'F♯', 'B']);
    });

    it('fills each dot with its degree colour and inks the 7th dark', () => {
        render();
        const [r, seventh, third] = gmaj7.notes.map((n) => dotFor(n)!);
        expect(r.querySelector('.neck-body')!.classList).toContain('neck-fill-root');
        expect(seventh.querySelector('.neck-body')!.classList).toContain('neck-fill-7');
        expect(third.querySelector('.neck-body')!.classList).toContain('neck-fill-3');
        expect(seventh.querySelector('.neck-dot-label')!.classList).toContain('is-dark');
        expect(third.querySelector('.neck-dot-label')!.classList).not.toContain('is-dark');
    });

    it('names the chord and every note on the board', () => {
        render();
        const label = host.querySelector('[role="img"]')!.getAttribute('aria-label');
        expect(label).toBe(
            gmaj7.notes
                .map(
                    (n, i) =>
                        `${i === 0 ? 'Gmaj7: ' : ''}${GUITAR.strName(n.string)} fret ${n.fret}, finger ${n.finger}, ${['Root', 'Major 7th', 'Major 3rd'][i]}`,
                )
                .join('; ') + '; 5th, 2nd and 1st strings not played',
        );
    });

    it('dims the whole grip for a hold', () => {
        render({ dimmed: true });
        expect(host.querySelector('.neck-active')!.classList).toContain('is-dimmed');
    });
});

describe('Neck: the strings a grip leaves silent (#1811)', () => {
    const marks = () =>
        [...host.querySelectorAll<SVGGElement>('.neck-mute')].map((g) => g.dataset.mute);
    /** A mark's translate, in viewBox units. */
    const markAt = (s: number): [number, number] => {
        const t = host.querySelector<SVGGElement>(`[data-mute="${s}"]`)!.style.transform;
        const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(t)!;
        return [Number(m[1]), Number(m[2])];
    };
    const b5 = allPositions(UKULELE, { name: 'B', pc: 11, letter: 6 }, 'five').find(
        (v) => v.notes.map((n) => `${n.string}/${n.fret}`).join() === '2/2,1/2',
    )!;

    it('marks a guitar shell’s three silent strings with a ×, beside the nut', () => {
        render();
        const { sy } = neckLayout(GUITAR.strings);
        expect(marks()).toEqual(['5', '2', '1']);
        for (const s of [5, 2, 1]) {
            // Where an open string's dot sits, on the string's own line.
            expect(markAt(s)).toEqual([dx(0), sy(s)]);
        }
        // Inked, not a note: no degree colour.
        expect(host.querySelector('.neck-mute')!.getAttribute('class')).toBe('neck-mute');
    });

    it('marks the ukulele B5 x x 2 2 on the G and C strings, and says so', () => {
        expect(b5.notes.map((n) => n.string)).toEqual([2, 1]);
        render({ instrument: UKULELE, active: b5 });
        expect(marks()).toEqual(['4', '3']);
        expect(host.querySelector('[role="img"]')!.getAttribute('aria-label')).toMatch(
            /; G and C strings not played$/,
        );
    });

    it('marks nothing on a grip that sounds every string', () => {
        const d7 = allPositions(UKULELE, { name: 'D', pc: 2, letter: 1 }, 'dom7')[0];
        expect(d7.notes).toHaveLength(4);
        render({ instrument: UKULELE, active: d7 });
        expect(marks()).toEqual([]);
        expect(host.querySelector('[role="img"]')!.getAttribute('aria-label')).not.toContain(
            'not played',
        );
    });

    it('shows the × in every label mode', () => {
        for (const labels of ['finger', 'note', 'degree'] as const) {
            render({ labels });
            expect(marks(), labels).toEqual(['5', '2', '1']);
        }
    });

    it('dims with the grip under a hold, and is never pulsed by the strike', () => {
        render({ dimmed: true, strike: true });
        const mark = host.querySelector('.neck-mute')!;
        expect(mark.closest('.neck-active')!.classList).toContain('is-dimmed');
        expect(mark.closest('.neck-core')).toBeNull();
    });

    it('marks only the grip that sounds, never the next one', () => {
        const c7 = build(GUITAR, GUITAR.shapes[2], { name: 'C', pc: 0, letter: 0 }, 'dom7')!;
        render({ next: c7, preview: 'strong', fingers: true });
        expect(host.querySelector('.neck-ghost .neck-mute')).toBeNull();
        expect(marks()).toEqual(['5', '2', '1']);
    });

    it('zoomed up the neck, sits in the first fret in view, which holds no note', () => {
        render({ zoom: 'window' });
        const [lo] = viewWindow(null, gmaj7, null);
        expect(lo).toBeGreaterThan(0);
        expect(gmaj7.notes.every((n) => n.fret > lo)).toBe(true);
        const { sy } = neckLayout(GUITAR.strings);
        expect(markAt(2)).toEqual([dx(lo), sy(2)]);
        expect(host.querySelector('.neck-mute')!.getAttribute('class')).toContain('is-on-board');
        // With the nut in view, beside it as on the whole board.
        render({ zoom: 'window', home: [1, 6] });
        expect(markAt(2)).toEqual([dx(0), sy(2)]);
    });
});

describe('Neck: previewing the next chord (#1592)', () => {
    const c7 = build(GUITAR, GUITAR.shapes[2], { name: 'C', pc: 0, letter: 0 }, 'dom7')!;
    const ghosts = () => [...host.querySelectorAll<SVGCircleElement>('.neck-ghost-dot')];

    it('soft: the current grip only, nothing ahead', () => {
        render({ next: c7, preview: 'soft', fingers: true });
        expect(dots()).toHaveLength(3);
        expect(host.querySelector('.neck-ghost')).toBeNull();
        expect(host.querySelector('.neck-rootpath')).toBeNull();
        expect(host.querySelector('.neck-preview')).toBeNull();
        expect(host.querySelector('.is-hold, .is-lift')).toBeNull();
    });

    it('strong: the next grip as ghost dots where it sits, and one root path', () => {
        render({ next: c7, preview: 'strong' });
        const { sy } = neckLayout(GUITAR.strings);
        expect(ghosts()).toHaveLength(c7.notes.length);
        for (const note of c7.notes) {
            const ghost = host.querySelector(`[data-ghost="${note.string}-${note.fret}"]`)!;
            expect(Number(ghost.getAttribute('cx'))).toBeCloseTo(dx(note.fret), 6);
            expect(Number(ghost.getAttribute('cy'))).toBeCloseTo(sy(note.string), 6);
            expect(ghost.getAttribute('r')).toBe(note.role === 'R' ? '16' : '14');
        }
        const rootGhost = c7.notes.find((n) => n.role === 'R')!;
        expect(
            host.querySelector(`[data-ghost="${rootGhost.string}-${rootGhost.fret}"]`)!.classList,
        ).toContain('neck-fill-root');
        expect(host.querySelectorAll('.neck-rootpath')).toHaveLength(1);
        // The path is not labelled: the interval name is cut until it can be right.
        expect(host.querySelector('.neck-rootlabel')).toBeNull();
        // Where, not how: no finger arrows, targets or hold/lift styling without the fingers.
        expect(host.querySelector('.neck-preview')).toBeNull();
        expect(host.querySelector('.neck-arrow, .neck-target')).toBeNull();
        expect(host.querySelector('.is-hold, .is-lift')).toBeNull();
    });

    it('strong with the fingers: Gmaj7 → G7 adds an arrow for the 7th and rings the holds', () => {
        render({ next: g7, preview: 'strong', fingers: true });
        // Same root on the same spot: nothing to draw.
        expect(host.querySelector('.neck-rootpath')).toBeNull();
        expect(ghosts()).toHaveLength(g7.notes.length);

        const seventh = gmaj7.notes.find((n) => n.degree === '7')!;
        const flat7 = g7.notes.find((n) => n.degree === 'b7')!;
        expect(flat7.finger).toBe(seventh.finger);
        expect(flat7.fret).toBe(seventh.fret - 1);

        expect(host.querySelectorAll('.neck-arrow')).toHaveLength(1);
        const targets = [...host.querySelectorAll('.neck-target')];
        expect(targets).toHaveLength(1);
        expect(targets[0].getAttribute('transform')).toBe(
            `translate(${dx(flat7.fret)},${neckLayout(6).sy(flat7.string)})`,
        );
        expect(targets[0].textContent).toBe(String(seventh.finger));

        for (const n of gmaj7.notes) {
            const held = n !== seventh;
            expect(dotFor(n)!.classList.contains('is-hold')).toBe(held);
        }
    });

    it('shows nothing ahead when the preview is off, fingers or not', () => {
        render({ next: g7, preview: 'off', fingers: true });
        expect(host.querySelector('.neck-ghost')).toBeNull();
        expect(host.querySelector('.neck-preview')).toBeNull();
        expect(host.querySelector('.is-hold')).toBeNull();
    });

    it('keeps the landing pulse', () => {
        render({ next: g7, preview: 'soft', strike: true });
        expect(host.querySelector('.neck-active')!.classList).toContain('is-strike');
    });
});

describe('Neck: a barre (#1594)', () => {
    const C = { name: 'C', pc: 0, letter: 0 };
    const at = (id: string, fret: number) =>
        allPositions(GUITAR, C, 'maj').find((v) => v.shape.id === id && v.rootFret === fret)!;
    // C/E 9-8-8 on the top three strings: index across the 8s, middle on the 9.
    const firstInversion = at('T321-1', 8);
    // C/G 12-13-12: index across all three, middle on the 13.
    const secondInversion = at('T321-2', 13);
    const { sy } = neckLayout(GUITAR.strings);
    const pillOf = (el: Element) =>
        ['x', 'y', 'width', 'height'].map((a) => Number(el.getAttribute(a)));

    it('is the grip the test means: index barre on the 8s, middle on the 9', () => {
        expect(firstInversion.notes.map((n) => [n.string, n.fret, n.finger])).toEqual([
            [3, 9, 2],
            [2, 8, 1],
            [1, 8, 1],
        ]);
    });

    it('draws one pill behind the barred dots, and every dot still has its own key', () => {
        render({ active: firstInversion });
        const pills = [...host.querySelectorAll('.neck-barre')];
        expect(pills).toHaveLength(1);
        expect(pills[0].getAttribute('data-barre')).toBe('1');
        expect(pillOf(pills[0])).toEqual([dx(8) - 19, sy(1) - 19, 38, sy(2) - sy(1) + 38]);
        // Behind the dots: the pill comes first in the grip's group.
        expect(host.querySelector('.neck-active')!.firstElementChild).toBe(pills[0]);
        const keys = dots().map((d) => d.getAttribute('data-dot'));
        expect(new Set(keys).size).toBe(3);
        // The lead (the barre's lowest-pitched string) keeps the finger's key, so it slides.
        expect(keys.sort()).toEqual(['F1', 'F1:1', 'F2']);
    });

    it('writes the barre finger once, on the lead dot', () => {
        render({ active: firstInversion, labels: 'finger' });
        const label = (key: string) =>
            host.querySelector(`[data-dot="${key}"] .neck-dot-label`)!.textContent;
        expect([label('F1'), label('F1:1'), label('F2')]).toEqual(['1', '', '2']);
        render({ active: firstInversion, labels: 'degree' });
        expect(label('F1:1')).toBe('R');
        expect(host.querySelector('[role="img"]')!.getAttribute('aria-label')).toContain(
            '2nd string fret 8, finger 1 barre',
        );
    });

    it('draws no pill for a grip without one', () => {
        render();
        expect(host.querySelector('.neck-barre')).toBeNull();
    });

    it('previews the next barre as a ghost pill and, with the fingers, one pill target', () => {
        render({ active: firstInversion, next: secondInversion, preview: 'strong' });
        const ghost = host.querySelectorAll('.neck-ghost-barre');
        expect(ghost).toHaveLength(1);
        expect(pillOf(ghost[0])).toEqual([dx(12) - 17, sy(1) - 17, 34, sy(3) - sy(1) + 34]);
        expect(host.querySelector('.neck-target')).toBeNull();

        render({ active: firstInversion, next: secondInversion, preview: 'strong', fingers: true });
        const targets = [...host.querySelectorAll('.neck-target')];
        // The index (laying the new barre) and the middle (to the 13).
        expect(targets).toHaveLength(2);
        const barreTarget = host.querySelector('.neck-target.is-barre')!;
        expect(pillOf(barreTarget.querySelector('rect')!)).toEqual([
            dx(12) - 13,
            sy(1) - 13,
            26,
            sy(3) - sy(1) + 26,
        ]);
        expect(barreTarget.textContent).toBe('1');
    });

    it('rings a barre that stays down, pill and dots together', () => {
        const next: Voicing = {
            ...firstInversion,
            notes: firstInversion.notes.map((n) =>
                n.string === 3 ? { ...n, fret: 10, finger: 3 } : { ...n },
            ),
        };
        render({ active: firstInversion, next, preview: 'strong', fingers: true });
        expect(host.querySelector('.neck-barre')!.classList).toContain('is-hold');
        expect(host.querySelector('[data-dot="F1"]')!.classList).toContain('is-hold');
        expect(host.querySelector('[data-dot="F1:1"]')!.classList).toContain('is-hold');
        expect(host.querySelector('[data-dot="F2"]')!.classList).toContain('is-lift');
    });
});

describe('Neck: the home-window handle', () => {
    const handle = () => host.querySelector<SVGGElement>('[role="slider"]')!;
    const press = (key: string) =>
        act(() => {
            handle().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        });

    it('reports its window and steps it with the arrow keys', () => {
        const onHome = vi.fn();
        render({ home: [2, 7], onHome });
        expect(handle().getAttribute('aria-valuenow')).toBe('2');
        expect(handle().getAttribute('aria-valuemin')).toBe('1');
        expect(handle().getAttribute('aria-valuemax')).toBe('10');
        expect(handle().getAttribute('aria-valuetext')).toBe('frets 2 to 7');
        press('ArrowRight');
        expect(onHome).toHaveBeenLastCalledWith(3);
        press('ArrowDown');
        expect(onHome).toHaveBeenLastCalledWith(1);
    });

    it('clamps at the ends of the neck', () => {
        const onHome = vi.fn();
        render({ home: [10, 15], onHome });
        press('ArrowRight');
        press('ArrowUp');
        expect(onHome).not.toHaveBeenCalled();
        render({ home: [1, 6], onHome });
        press('ArrowLeft');
        expect(onHome).not.toHaveBeenCalled();
    });

    it('draws no handle without a home window', () => {
        render({ home: null });
        expect(host.querySelector('[role="slider"]')).toBeNull();
        expect(host.querySelector('.neck-shade')).toBeNull();
    });
});

describe('Neck: ukulele', () => {
    it('draws four strings with their letters', () => {
        render({ instrument: UKULELE, active: null });
        expect(host.querySelectorAll('.neck-string')).toHaveLength(4);
        expect([...host.querySelectorAll('.neck-string-letter')].map((t) => t.textContent)).toEqual(
            ['A', 'E', 'C', 'G'],
        );
        expect(host.querySelector('svg')!.getAttribute('viewBox')).toBe(
            `0 0 1000 ${neckLayout(4).height}`,
        );
    });
});

describe('neck geometry: the zoomed view window (#1593)', () => {
    const grip = (...frets: number[]) => ({ notes: frets.map((fret) => ({ fret })) });

    it('shows a locked home window ±1 fret', () => {
        expect(viewWindow([5, 10], null, null)).toEqual([4, 11]);
        expect(viewWindow([5, 10], grip(5, 7, 7), grip(6, 8))).toEqual([4, 11]);
    });

    it('takes in the nut when the window starts at fret 1 or 2', () => {
        expect(viewWindow([1, 6], null, null)).toEqual([0, 8]);
        expect(viewWindow([2, 7], null, null)).toEqual([0, 8]);
        expect(viewWindow([3, 8], null, null)).toEqual([2, 9]);
    });

    it('clamps to the top of the neck and keeps its width there', () => {
        expect(viewWindow([10, 15], null, null)).toEqual([8, NF]);
    });

    it('unlocked: the union of both grips ±1, never narrower than HOME_W + 2 frets', () => {
        // A two-fret grip pads to the right rather than zooming in further.
        expect(viewWindow(null, grip(7, 8), null)).toEqual([6, 6 + HOME_W + 1]);
        // Two grips far apart: all of both.
        expect(viewWindow(null, grip(3, 5), grip(10, 12))).toEqual([2, 13]);
        // High up the neck the span grows left instead.
        expect(viewWindow(null, grip(14, 15), null)).toEqual([NF - HOME_W - 1, NF]);
        // Open strings and an empty board bring in the nut.
        expect(viewWindow(null, grip(0, 2, 3), null)).toEqual([0, HOME_W + 2]);
        expect(viewWindow(null, null, null)).toEqual([0, HOME_W + 2]);
    });

    it('keeps a note outside a locked window in view', () => {
        expect(viewWindow([5, 10], grip(0, 5, 7), null)).toEqual([0, 11]);
    });

    it('maps the window onto the whole 1000-wide viewBox', () => {
        const [lo, hi] = [4, 11];
        const t = boardTransform([lo, hi]);
        const left = fx(lo - 1) * t.scale + t.tx;
        const right = fx(hi) * t.scale + t.tx;
        expect(left).toBeGreaterThanOrEqual(0);
        expect(left).toBeLessThan(10);
        expect(right).toBeLessThanOrEqual(1000);
        expect(right).toBeGreaterThan(990);
        // About eight frets on a phone: roughly twice the size of the whole neck.
        expect(t.scale).toBeGreaterThan(1.8);
        expect(t.scale).toBeLessThan(2.6);
        // From the nut, x = 0 stays put.
        const open = boardTransform([0, 8]);
        expect(open.tx).toBeCloseTo(0, 9);
        expect(open.scale).toBeGreaterThan(1);
    });

    it("inverts for the handle drag: a dot's zoomed x maps back to its fret", () => {
        const t = boardTransform([4, 11]);
        for (let f = 4; f <= 11; f++) {
            expect(fretAt(boardX(t, dx(f) * t.scale + t.tx))).toBe(f);
        }
    });
});

describe('Neck: zoomed onto the hand (#1593)', () => {
    const zoomGroup = () => host.querySelector<SVGGElement>('.neck-zoom')!;
    function scaleOf(): number {
        const m = /scale\(([\d.]+)\)/.exec(zoomGroup().style.transform);
        return m ? Number(m[1]) : 1;
    }

    it('draws the whole neck unzoomed by default', () => {
        render({ home: [5, 10] });
        expect(zoomGroup().style.transform).toBe('');
        expect(host.querySelector('svg')!.getAttribute('viewBox')).toBe(
            `0 0 1000 ${neckLayout(6).height}`,
        );
    });

    it('zooms onto the home window and grows the svg by the same factor', () => {
        render({ active: null, home: [5, 10], zoom: 'window' });
        const t = boardTransform([4, 11]);
        expect(scaleOf()).toBeCloseTo(t.scale, 6);
        expect(zoomGroup().style.transform).toContain(`translate(${t.tx}px, 0px)`);
        expect(host.querySelector('svg')!.getAttribute('viewBox')).toBe(
            `0 0 1000 ${Math.round(neckLayout(6).height * t.scale)}`,
        );
        // The board, its dots and the handle all ride the zoom.
        expect(zoomGroup().querySelector('[role="img"]')).not.toBeNull();
        expect(zoomGroup().querySelector('[role="slider"]')).not.toBeNull();
    });

    it('follows the window when it moves', () => {
        render({ active: null, home: [5, 10], zoom: 'window' });
        const before = zoomGroup().style.transform;
        render({ active: null, home: [8, 13], zoom: 'window' });
        expect(zoomGroup().style.transform).not.toBe(before);
        expect(scaleOf()).toBeCloseTo(boardTransform([7, 14]).scale, 6);
    });

    it('drags the handle through the zoom, holding the view still until release', () => {
        const svgProto = Object.getPrototypeOf(
            document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
        );
        // Screen px = viewBox units, so a pointer x is a viewBox x.
        const ctm = vi.spyOn(svgProto, 'getScreenCTM').mockReturnValue(new DOMMatrix());
        try {
            const onHome = vi.fn();
            render({ active: null, home: [5, 10], zoom: 'window', onHome });
            const t = boardTransform([4, 11]);
            const at = (fret: number) => dx(fret) * t.scale + t.tx;
            const handle = host.querySelector<SVGGElement>('[role="slider"]')!;
            const svg = host.querySelector('svg')!;
            const fire = (el: Element, type: string, x: number) =>
                act(() => {
                    el.dispatchEvent(
                        new PointerEvent(type, { clientX: x, clientY: 10, bubbles: true }),
                    );
                });
            fire(handle, 'pointerdown', at(6));
            // One fret right in the zoomed board is one fret right on the neck — not ~2.
            fire(svg, 'pointermove', at(7));
            expect(onHome).toHaveBeenLastCalledWith(6);
            // The parent moves the window; mid-drag the view holds still.
            const before = zoomGroup().style.transform;
            render({ active: null, home: [6, 11], zoom: 'window', onHome });
            expect(zoomGroup().style.transform).toBe(before);
            fire(svg, 'pointermove', at(9));
            expect(onHome).toHaveBeenLastCalledWith(8);
            render({ active: null, home: [8, 13], zoom: 'window', onHome });
            fire(svg, 'pointerup', at(9));
            expect(scaleOf()).toBeCloseTo(boardTransform([7, 14]).scale, 6);
        } finally {
            ctm.mockRestore();
        }
    });
});

describe('Neck: the board strums its grip (#1596)', () => {
    const board = () => host.querySelector<SVGGElement>('.neck-strum');
    const click = (el: Element) =>
        act(() => {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
    const key = (el: Element, k: string) =>
        act(() => {
            el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
        });

    it('is a picture of the grip without onStrum, a button with it', () => {
        render();
        expect(board()).toBeNull();
        expect(host.querySelector('[role="img"]')).not.toBeNull();
        render({ onStrum: vi.fn() });
        expect(host.querySelector('[role="img"]')).toBeNull();
        expect(board()!.getAttribute('role')).toBe('button');
        expect(board()!.getAttribute('tabindex')).toBe('0');
        expect(board()!.getAttribute('aria-label')).toMatch(/^Hear Gmaj7: 6th string fret 3/);
    });

    it('strums on a tap anywhere on the board, and on Enter or Space', () => {
        const onStrum = vi.fn();
        render({ onStrum, home: [2, 7] });
        click(host.querySelector('.neck-wood')!);
        click(host.querySelector('.neck-dot')!);
        expect(onStrum).toHaveBeenCalledTimes(2);
        key(board()!, 'Enter');
        key(board()!, ' ');
        key(board()!, 'ArrowRight');
        expect(onStrum).toHaveBeenCalledTimes(4);
    });

    it("never strums from the hand's handle, or the click a handle drag leaves on the svg", () => {
        const onStrum = vi.fn();
        render({ onStrum, home: [2, 7] });
        const handle = host.querySelector('[role="slider"]')!;
        click(handle);
        key(handle, 'Enter');
        // A drag captures the pointer on the svg: its click lands there, above the board.
        click(host.querySelector('svg')!);
        expect(onStrum).not.toHaveBeenCalled();
    });
});
