// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */
import { render } from 'preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SectionHeaderStrip } from '../../../public/components/editor/SectionHeaderStrip.jsx';

vi.mock('../../../public/arranger-controller.js', () => ({
    setSectionIntensity: vi.fn(),
    setSectionInstrumentEnabled: vi.fn(),
}));

vi.mock('../../../public/ui-bridge.js', () => ({
    useEnsembleState: (selector: any) =>
        selector({
            playback: { bandIntensity: 0.5 },
            groove: { enabled: true },
            bass: { enabled: true },
            chords: { enabled: true },
            harmony: { enabled: false },
            soloist: { enabled: true },
        }),
}));

describe('SectionHeaderStrip', () => {
    let setSectionIntensity: any;
    let setSectionInstrumentEnabled: any;

    beforeEach(async () => {
        const controller = await import('../../../public/arranger-controller.js');
        setSectionIntensity = controller.setSectionIntensity;
        setSectionInstrumentEnabled = controller.setSectionInstrumentEnabled;
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="app"></div>';
    });

    function mount(section: any) {
        render(<SectionHeaderStrip section={section} />, document.getElementById('app'));
    }

    it('renders dimmed/dashed intensity slider when no override is set (follow-global)', () => {
        mount({ id: 's1', label: 'Verse', value: 'C' });
        const strip = document.querySelector('.section-strip');
        expect(strip.classList.contains('section-strip--intensity-follow')).toBe(true);
        const slider = strip.querySelector('input[type="range"]');
        expect(slider.value).toBe('0.5'); // follows globalIntensity
        expect(strip.textContent).toContain('—'); // dimmed indicator
    });

    it('shows explicit override percentage when targetIntensity is set', () => {
        mount({ id: 's1', label: 'Verse', value: 'C', targetIntensity: 0.8 });
        const strip = document.querySelector('.section-strip');
        expect(strip.classList.contains('section-strip--intensity-follow')).toBe(false);
        expect(strip.textContent).toContain('80%');
    });

    it('slider input dispatches setSectionIntensity with parsed float', () => {
        mount({ id: 's1', label: 'Verse', value: 'C' });
        const slider = document.querySelector('input[type="range"]');
        slider.value = '0.35';
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        expect(setSectionIntensity).toHaveBeenCalledWith('s1', expect.closeTo(0.35, 5));
    });

    it('double-clicking the slider clears the override (passes undefined)', () => {
        mount({ id: 's1', label: 'Verse', value: 'C', targetIntensity: 0.6 });
        const slider = document.querySelector('input[type="range"]');
        slider.dispatchEvent(new Event('dblclick', { bubbles: true }));
        expect(setSectionIntensity).toHaveBeenCalledWith('s1', undefined);
    });

    it('renders five instrument dots (D B C H S)', () => {
        mount({ id: 's1', label: 'Verse', value: 'C' });
        const dots = document.querySelectorAll('.section-strip__lane');
        expect(dots).toHaveLength(5);
        expect(Array.from(dots).map((d) => d.textContent.trim())).toEqual([
            'D',
            'B',
            'C',
            'H',
            'S',
        ]);
    });

    it('lane in follow state shows global-enabled context: harmony off → muted class', () => {
        mount({ id: 's1', label: 'Verse', value: 'C' });
        const lanes = document.querySelectorAll('.section-strip__lane');
        const harmonyDot = lanes[3]; // H lane
        expect(harmonyDot.classList.contains('section-strip__lane--follow')).toBe(true);
        expect(harmonyDot.classList.contains('section-strip__lane--muted')).toBe(true);
    });

    it('clicking a follow lane cycles to forced-on (true)', () => {
        mount({ id: 's1', label: 'Verse', value: 'C' });
        const bassDot = document.querySelectorAll('.section-strip__lane')[1]; // B
        bassDot.click();
        expect(setSectionInstrumentEnabled).toHaveBeenCalledWith('s1', 'bass', true);
    });

    it('clicking a forced-on lane cycles to forced-off (false)', () => {
        mount({ id: 's1', label: 'Verse', value: 'C', instruments: { bass: true } });
        const bassDot = document.querySelectorAll('.section-strip__lane')[1];
        expect(bassDot.classList.contains('section-strip__lane--on')).toBe(true);
        bassDot.click();
        expect(setSectionInstrumentEnabled).toHaveBeenCalledWith('s1', 'bass', false);
    });

    it('clicking a forced-off lane cycles back to follow (undefined)', () => {
        mount({ id: 's1', label: 'Verse', value: 'C', instruments: { bass: false } });
        const bassDot = document.querySelectorAll('.section-strip__lane')[1];
        expect(bassDot.classList.contains('section-strip__lane--off')).toBe(true);
        bassDot.click();
        expect(setSectionInstrumentEnabled).toHaveBeenCalledWith('s1', 'bass', undefined);
    });
});
