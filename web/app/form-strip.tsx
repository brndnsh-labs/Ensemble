import { type RefObject, useEffect, useState } from 'react';
import type { ChartBlock } from '../lib/lead-sheet';

/**
 * Where you are in the whole form, for a chart that scrolls (#1713): a thin strip beside the
 * chart, one segment per section (as tall as its rows), the part on screen outlined, and a
 * marker where the band is. A segment scrolls the chart to its section.
 *
 * Shown by CSS only while the chart scrolls (`.chart-scroll[data-page][data-fits="false"]`,
 * `useChartFit`), so a chart that fits on its page never shows it.
 */
export function FormStrip({
    blocks,
    displayActive,
    scroll,
    onNavigate,
}: {
    blocks: ChartBlock[];
    /** The playing chord's display index; null while stopped. */
    displayActive: number | null;
    scroll: RefObject<HTMLElement | null>;
    /** A jump is the musician taking the view: the chart stops following the band. */
    onNavigate: () => void;
}) {
    const [view, setView] = useState({ top: 0, height: 1 });
    useEffect(() => {
        const box = scroll.current;
        if (!box) {
            return;
        }
        const read = () =>
            setView({
                top: box.scrollTop / box.scrollHeight,
                height: Math.min(1, box.clientHeight / box.scrollHeight),
            });
        read();
        box.addEventListener('scroll', read, { passive: true });
        // The box for the window, the sheet for the chart's own height (a new chart, a new step).
        const observer = new ResizeObserver(read);
        observer.observe(box);
        const sheet = box.querySelector('.sheet');
        if (sheet) {
            observer.observe(sheet);
        }
        return () => {
            box.removeEventListener('scroll', read);
            observer.disconnect();
        };
    }, [scroll]);

    // Four bars to a row on the page, so a section is as tall as its rows.
    const rows = blocks.map((block) => Math.max(1, Math.ceil(block.measures.length / 4)));
    const total = rows.reduce((sum, n) => sum + n, 0);
    const band = bandPosition(blocks, displayActive);

    function jump(index: number) {
        const box = scroll.current;
        const section = box?.querySelectorAll<HTMLElement>('.section')[index];
        if (!box || !section) {
            return;
        }
        onNavigate();
        const top =
            section.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        box.scrollTo({ top: Math.max(0, top - 8), behavior: reduce ? 'instant' : 'smooth' });
    }

    return (
        <nav className="form-strip" aria-label="Form">
            {blocks.map((block, index) => (
                <button
                    type="button"
                    className="form-strip-section"
                    // biome-ignore lint/suspicious/noArrayIndexKey: two sections can share a label; the order is the identity here.
                    key={index}
                    style={{ flexGrow: rows[index] }}
                    aria-label={`Go to section ${block.label || 'A'}`}
                    title={block.label || 'A'}
                    onClick={() => jump(index)}
                >
                    {shortLabel(block.label || 'A')}
                </button>
            ))}
            <span
                className="form-strip-view"
                aria-hidden="true"
                style={{ top: `${view.top * 100}%`, height: `${view.height * 100}%` }}
            />
            {band !== null && (
                <span
                    className="form-strip-band"
                    aria-hidden="true"
                    style={{ top: `${((band.row + 0.5) / total) * 100}%` }}
                />
            )}
        </nav>
    );
}

/** A named section ("Bridge") is its first letter in a strip this narrow; "A2" fits whole. */
function shortLabel(label: string): string {
    return label.length > 3 ? label.slice(0, 1).toUpperCase() : label;
}

/** The row (counted down the whole page) holding the playing chord. */
function bandPosition(blocks: ChartBlock[], displayActive: number | null) {
    if (displayActive === null) {
        return null;
    }
    let row = 0;
    for (const block of blocks) {
        const at = block.measures.findIndex((measure) =>
            measure.chords.some((chord) => chord.globalIndex === displayActive),
        );
        if (at >= 0) {
            return { row: row + Math.floor(at / 4) };
        }
        row += Math.max(1, Math.ceil(block.measures.length / 4));
    }
    return null;
}
