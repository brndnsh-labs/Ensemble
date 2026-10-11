// @vitest-environment happy-dom
/**
 * The neck view's stopped step-through (#1595) and strum (#1596), rendered for real (react-dom
 * into happy-dom) over a real band chart. Expected grips and pitches come from the voicer and
 * `gripMidis`, never read back off the rendered board.
 */
import { compileTimeline } from '@band/index';
import type { ScoreEvent, SemanticScore } from '@engine/songbook/score-types';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type BandChart, bandChart } from '../lib/band-chart';
import { defaultNeckPreferences } from '../lib/session';
import { GUITAR, gripMidis, type VoicedBandChord, voiceBandChart } from '../lib/voicings';
import { NeckView } from './neck-view';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const chord = (symbol: string): ScoreEvent => ({ kind: 'chord', symbol, duration: [4, 1] });
function chart(bars: ScoreEvent[]): BandChart {
    const score: SemanticScore = {
        notation: 'name',
        key: 'C',
        isMinor: false,
        meter: '4/4',
        grouping: null,
        sections: [
            {
                id: 'a',
                label: 'A',
                repeat: 1,
                measures: bars.map((event, i) => ({
                    id: `m${i}`,
                    content: { kind: 'events', events: [event] },
                })),
            },
        ],
    };
    return bandChart(score, compileTimeline(score));
}
const prefs = defaultNeckPreferences();
const voice = (band: BandChart): Map<number, VoicedBandChord> =>
    new Map(voiceBandChart(band, prefs).map((v) => [v.globalIndex, v] as const));

const study = chart([chord('Dm7'), chord('G7'), chord('Cmaj7'), chord('Cmaj7')]);
const studyGrips = voice(study);

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

interface Props {
    band?: BandChart;
    voiced?: Map<number, VoicedBandChord>;
    active?: number | null;
    playing?: boolean;
    onStrum?: (midis: number[]) => void;
}
function render({
    band = study,
    voiced = studyGrips,
    active = null,
    playing = false,
    onStrum,
}: Props = {}) {
    act(() => {
        root.render(
            <NeckView
                band={band}
                voiced={voiced}
                active={active}
                nextSoon={false}
                playing={playing}
                onStrum={onStrum}
                prefs={prefs}
                onPrefs={() => {}}
            />,
        );
    });
}

const $ = (selector: string) => host.querySelector<HTMLElement>(selector);
const text = (testId: string) => $(`[data-testid="${testId}"]`)?.textContent ?? null;
const press = (label: string) =>
    act(() => {
        $(`button[aria-label="${label}"]`)!.click();
    });
const arrow = (target: Element, key: string) =>
    act(() => {
        target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
const ghosts = () => host.querySelectorAll('.neck-ghost-dot').length;

describe('NeckView: stepping through the chart stopped (#1595)', () => {
    it('starts on the first grip, then steps to each change with its strong preview', () => {
        render();
        expect(text('neck-current')).toBe('Dm7');
        expect(text('neck-position')).toBe('1 / 3');
        expect($('.neck-headline')!.textContent).toMatch(/^Starts on Dm7/);
        expect(ghosts()).toBe(0);

        press('Next chord');
        expect(text('neck-current')).toBe('G7');
        expect(text('neck-position')).toBe('2 / 3');
        // The playing form: the change ahead, with the ghost grip of the third chord.
        expect($('.neck-headline')!.textContent).toMatch(/^Next: Cmaj7 · root up a 4th/);
        expect(ghosts()).toBe(studyGrips.get(2)!.notes.length);
        expect($('.neck-rootpath')).not.toBeNull();

        press('Next chord');
        expect(text('neck-current')).toBe('Cmaj7');
        expect(text('neck-position')).toBe('3 / 3');
        // The two Cmaj7 bars are one grip: the next change is back to the top.
        press('Next chord');
        expect(text('neck-current')).toBe('Dm7');
        expect(text('neck-position')).toBe('1 / 3');
    });

    it('steps back from the top to the last chord', () => {
        render();
        press('Previous chord');
        expect(text('neck-current')).toBe('Cmaj7');
        expect(text('neck-position')).toBe('3 / 3');
        expect($('.neck-headline')!.textContent).toMatch(/^Next: Dm7/);
    });

    it('takes ← / → on the neck, but not from a settings field', () => {
        render();
        const view = $('section.neck-view')!;
        arrow(view, 'ArrowRight');
        expect(text('neck-current')).toBe('G7');
        arrow(view, 'ArrowLeft');
        arrow(view, 'ArrowLeft');
        expect(text('neck-current')).toBe('Cmaj7');
        arrow($('select[aria-label="Labels"]')!, 'ArrowRight');
        arrow($('[role="slider"]')!, 'ArrowRight');
        expect(text('neck-current')).toBe('Cmaj7');
    });

    it('hides while the band plays and forgets the cursor; stopped again, it starts over', () => {
        render();
        press('Next chord');
        expect(text('neck-current')).toBe('G7');
        // Play: the count-in has no slot yet, and the cursor is already gone.
        render({ playing: true });
        expect($('.neck-step')).toBeNull();
        expect(text('neck-current')).toBe('Dm7');
        render({ playing: true, active: 2 });
        expect(text('neck-current')).toBe('Cmaj7');
        render();
        expect(text('neck-current')).toBe('Dm7');
        expect($('.neck-headline')!.textContent).toMatch(/^Starts on Dm7/);
        expect(text('neck-position')).toBe('1 / 3');
    });

    it('starts over on another chart, and offers no steps for a one-chord chart', () => {
        render();
        press('Next chord');
        const other = chart([chord('F'), chord('Bb'), chord('C7')]);
        render({ band: other, voiced: voice(other) });
        expect(text('neck-current')).toBe('F');
        expect(text('neck-position')).toBe('1 / 3');
        const vamp = chart([chord('G7'), chord('G7')]);
        render({ band: vamp, voiced: voice(vamp) });
        expect($('.neck-step')).toBeNull();
    });
});

describe('NeckView: the board strums the sounding grip (#1596)', () => {
    const tap = () =>
        act(() => {
            $('.neck-wood')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

    it("stopped, a tap strums the shown grip's pitches, lowest string first", () => {
        const onStrum = vi.fn();
        render({ onStrum });
        tap();
        expect(onStrum).toHaveBeenLastCalledWith(gripMidis(GUITAR, studyGrips.get(0)!));
        press('Next chord');
        tap();
        expect(onStrum).toHaveBeenLastCalledWith(gripMidis(GUITAR, studyGrips.get(1)!));
        expect(onStrum).toHaveBeenCalledTimes(2);
    });

    it('never strums while the band plays: the board is a picture again', () => {
        const onStrum = vi.fn();
        render({ onStrum, playing: true, active: 1 });
        expect($('.neck-strum')).toBeNull();
        tap();
        expect(onStrum).not.toHaveBeenCalled();
    });
});
