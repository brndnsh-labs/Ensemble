import { type RefObject, useLayoutEffect } from 'react';

/**
 * The stand as a page (#1712): a 32–36 bar chart reads on one screen, the way iReal Pro shows it.
 *
 * The chart is sized in fixed STEPS (`style.css`, `[data-fit="0"]` … `[data-fit="8"]`, largest
 * first), never scaled continuously, so the page doesn't wobble and each size is a known one.
 * Reading, the largest step is taken whose whole written chart fits the chart's box with no chord
 * pushed onto a second line or past its bar. A chart that fits at no step — a long form, a phone
 * on its side — scrolls instead, at the largest step from {@link COMFORT} down whose chords sit
 * on one line: shrinking past legibility to avoid a scroll is the wrong trade. Editing never fits
 * to the page (the editor needs the room): it takes that same scrolling size.
 *
 * Measured, not computed: the steps are tried on the real DOM inside a layout effect, before
 * paint, so whatever the chart holds — endings, notes, a long chord — is what decides. The
 * result lands on the scroll box as `data-fit` (the step), `data-fits` (whether it fit) and,
 * reading, `data-page` (the margin layout). Written straight to the DOM, not through React
 * state: a try is a write and a read in one synchronous pass, and nothing else renders from it.
 *
 * The step is chosen again when the box changes size or the chart changes, never on play/stop:
 * the "Tap a chord" line under the chart hides while playing, so its room is held back always
 * ({@link BOTTOM_RESERVE}) rather than measured, and the height the hidden controls give the
 * chart while playing is not used, so the chart holds still across play/pause.
 */
const FIT_STEPS = 9;
/** The largest step a chart that scrolls is shown at. */
const COMFORT = 3;
/** Room kept under the last section for the line beneath the chart (`.chart-bottom`). */
const BOTTOM_RESERVE = 58;

export type ChartFitMode = 'page' | 'edit' | null;

export function useChartFit(
    scroll: RefObject<HTMLElement | null>,
    mode: ChartFitMode,
    content: unknown,
): void {
    useLayoutEffect(() => {
        const box = scroll.current;
        if (!box || !mode || content === undefined) {
            return;
        }
        const fit = () => chooseStep(box, mode);
        fit();
        let width = box.clientWidth;
        let height = box.clientHeight;
        const observer = new ResizeObserver(() => {
            const heightOnly = box.clientWidth === width && box.clientHeight !== height;
            const changed = box.clientWidth !== width || box.clientHeight !== height;
            width = box.clientWidth;
            height = box.clientHeight;
            // Playing hides the stand's controls (`.performance-focus`), which gives the chart
            // more height; taking a bigger step there would jump the chart on every play/stop.
            // The step stays the one chosen with the controls showing.
            if (changed && !(heightOnly && box.closest('.performance-focus'))) {
                fit();
            }
        });
        observer.observe(box);
        let alive = true;
        // A font that arrives late changes every width measured above.
        void document.fonts?.ready.then(() => alive && fit());
        return () => {
            alive = false;
            observer.disconnect();
            delete box.dataset.fit;
            delete box.dataset.fits;
            delete box.dataset.page;
        };
    }, [scroll, mode, content]);
}

function chooseStep(box: HTMLElement, mode: 'page' | 'edit') {
    const sheet = box.querySelector<HTMLElement>('.sheet');
    if (!sheet) {
        return;
    }
    const scrollTop = box.scrollTop;
    const apply = (step: number) => {
        box.dataset.fit = String(step);
    };
    if (mode === 'page') {
        box.dataset.page = '';
        box.dataset.fits = 'true';
        for (let step = 0; step < FIT_STEPS; step++) {
            apply(step);
            if (oneLine(sheet) && fitsHeight(box, sheet)) {
                return;
            }
        }
    } else {
        delete box.dataset.page;
    }
    box.dataset.fits = 'false';
    for (let step = COMFORT; step < FIT_STEPS; step++) {
        apply(step);
        if (oneLine(sheet)) {
            box.scrollTop = scrollTop;
            return;
        }
    }
    box.scrollTop = scrollTop;
}

/** The chart's sections, plus the room held for the line beneath, inside the box's content. */
function fitsHeight(box: HTMLElement, sheet: HTMLElement): boolean {
    const sections = sheet.querySelectorAll<HTMLElement>('.section');
    const last = sections[sections.length - 1];
    if (!last) {
        return true;
    }
    const style = getComputedStyle(box);
    const room = box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const needed =
        last.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top + BOTTOM_RESERVE;
    return needed <= room;
}

/** Every bar's chords on one line, none wider than its bar. */
function oneLine(sheet: HTMLElement): boolean {
    for (const bar of sheet.querySelectorAll<HTMLElement>('.bar')) {
        if (bar.scrollWidth > bar.clientWidth + 1) {
            return false;
        }
        const chords = bar.querySelectorAll<HTMLElement>('.chord');
        const top = chords[0]?.offsetTop ?? 0;
        for (const chord of chords) {
            // Centred in the bar, a chord with a raised quality can sit a pixel off its
            // neighbour; a second line is a whole chord lower.
            if (Math.abs(chord.offsetTop - top) > chord.offsetHeight / 2) {
                return false;
            }
        }
    }
    return true;
}
