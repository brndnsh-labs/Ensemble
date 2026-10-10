// @vitest-environment happy-dom
/**
 * The neck's geometry and preview layer (#1586), rendered for real (react-dom into happy-dom).
 * Expected positions come from `neck-geometry.ts`'s `dx`/`neckLayout`, computed here from the
 * grip's own frets and strings — never read back off the rendered SVG.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { build, GUITAR, type Note, UKULELE, type Voicing } from '../lib/shells';
import { Neck, type NeckProps } from './neck';
import { dx, neckLayout } from './neck-geometry';

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
                .join('; '),
        );
    });

    it('dims the whole grip for a hold', () => {
        render({ dimmed: true });
        expect(host.querySelector('.neck-active')!.classList).toContain('is-dimmed');
    });
});

describe('Neck: previewing the next chord', () => {
    it('Gmaj7 → G7: no root path, an arrow for the 7th, rings for the holds', () => {
        render({ next: g7, preview: 'strong' });
        // Same root on the same spot: nothing to draw.
        expect(host.querySelector('.neck-rootpath')).toBeNull();

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

    it('draws one root path, labelled with the interval, when the root moves', () => {
        const c7 = build(GUITAR, GUITAR.shapes[2], { name: 'C', pc: 0, letter: 0 }, 'dom7')!;
        render({ next: c7, preview: 'soft' });
        const paths = host.querySelectorAll('.neck-rootpath');
        expect(paths).toHaveLength(1);
        expect(paths[0].textContent).toBe('up a 4th');
        expect(host.querySelector('svg')!.classList).toContain('is-soft');
    });

    it('shows nothing ahead when the preview is off', () => {
        render({ next: g7, preview: 'off' });
        expect(host.querySelector('.neck-preview')).toBeNull();
        expect(host.querySelector('.is-hold')).toBeNull();
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
