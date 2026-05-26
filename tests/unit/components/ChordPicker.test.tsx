// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */
import { render } from 'preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildChordText, ChordPicker } from '../../../public/components/editor/ChordPicker.jsx';

describe('buildChordText', () => {
    const MAJ = { id: 'maj', label: 'maj', isMinor: false, suffix: '', nameSuffix: '', title: '' };
    const MIN = { id: 'min', label: 'min', isMinor: true, suffix: '', nameSuffix: 'm', title: '' };
    const DOM7 = {
        id: '7',
        label: '7',
        isMinor: false,
        suffix: '7',
        nameSuffix: '7',
        title: '',
    };
    const M7 = { id: 'm7', label: 'm7', isMinor: true, suffix: '7', nameSuffix: 'm7', title: '' };
    const MAJ7 = {
        id: 'maj7',
        label: 'maj7',
        isMinor: false,
        suffix: 'maj7',
        nameSuffix: 'maj7',
        title: '',
    };

    describe('roman notation', () => {
        it('emits uppercase numeral for major', () => {
            expect(buildChordText(1, '', MAJ, 'roman', 'C', false)).toBe('I');
            expect(buildChordText(4, '', MAJ, 'roman', 'C', false)).toBe('IV');
            expect(buildChordText(5, '', DOM7, 'roman', 'C', false)).toBe('V7');
        });

        it('emits lowercase numeral for minor variants', () => {
            expect(buildChordText(2, '', MIN, 'roman', 'C', false)).toBe('ii');
            expect(buildChordText(6, '', M7, 'roman', 'C', false)).toBe('vi7');
        });

        it('prepends flat/sharp accidentals', () => {
            expect(buildChordText(3, 'b', MAJ, 'roman', 'C', false)).toBe('bIII');
            expect(buildChordText(4, '#', DOM7, 'roman', 'C', false)).toBe('#IV7');
        });
    });

    describe('nns notation', () => {
        it('uses digit + dash for minor', () => {
            expect(buildChordText(2, '', MIN, 'nns', 'C', false)).toBe('2-');
            expect(buildChordText(6, '', M7, 'nns', 'C', false)).toBe('6-7');
        });

        it('keeps digit untouched for major', () => {
            expect(buildChordText(1, '', MAJ, 'nns', 'C', false)).toBe('1');
            expect(buildChordText(5, '', DOM7, 'nns', 'C', false)).toBe('57');
        });
    });

    describe('name notation', () => {
        it('resolves degree to letter via the key tonic (C major)', () => {
            expect(buildChordText(1, '', MAJ, 'name', 'C', false)).toBe('C');
            expect(buildChordText(2, '', MIN, 'name', 'C', false)).toBe('Dm');
            expect(buildChordText(5, '', DOM7, 'name', 'C', false)).toBe('G7');
            expect(buildChordText(6, '', M7, 'name', 'C', false)).toBe('Am7');
        });

        it('resolves correctly in a minor key (uses natural-minor degree offsets)', () => {
            // A minor: i=A, iiø=B°, III=C, iv=D, v=E, VI=F, VII=G
            expect(buildChordText(1, '', MIN, 'name', 'A', true)).toBe('Am');
            expect(buildChordText(3, '', MAJ, 'name', 'A', true)).toBe('C');
            expect(buildChordText(6, '', MAJ, 'name', 'A', true)).toBe('F');
        });

        it('handles flat accidentals via the key wheel', () => {
            // C major: bIII semitone = 3 → Eb
            expect(buildChordText(3, 'b', MAJ7, 'name', 'C', false)).toBe('Ebmaj7');
        });

        it('wraps pitch class modulo 12 (sharp on VII goes to next root)', () => {
            // C major, #VII = semitone 12 = 0 = C
            expect(buildChordText(7, '#', MAJ, 'name', 'C', false)).toBe('C');
        });
    });
});

describe('ChordPicker (component)', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="app"></div>';
    });

    function mount(overrides: Partial<any> = {}) {
        const props = {
            initialDegree: 5,
            initialAccidental: '' as const,
            initialQualityId: 'maj',
            notation: 'roman' as const,
            keyName: 'C',
            keyIsMinor: false,
            anchorRect: null,
            onSelect: vi.fn(),
            onClose: vi.fn(),
            ...overrides,
        };
        render(<ChordPicker {...props} />, document.getElementById('app'));
        return props;
    }

    it('renders root buttons and highlights the initial root', () => {
        mount();
        const active = document.querySelectorAll('.chord-picker__root.is-active');
        expect(active).toHaveLength(1);
        expect(active[0].textContent).toBe('V');
    });

    it('renders quality buttons and highlights the initial quality', () => {
        mount({ initialQualityId: 'm7' });
        const active = document.querySelectorAll('.chord-picker__quality.is-active');
        expect(active).toHaveLength(1);
        expect(active[0].textContent).toBe('m7');
    });

    it('clicking a different root emits new chord text with current quality', () => {
        const props = mount({ initialDegree: 1, initialQualityId: '7' });
        const roots = document.querySelectorAll('.chord-picker__root');
        // 'IV' is the 6th button: I, ♭II, II, ♭III, III, IV, ♯IV, V, ...
        const iv = Array.from(roots).find((b) => b.textContent === 'IV');
        iv.click();
        expect(props.onSelect).toHaveBeenCalledWith('IV7');
    });

    it('clicking a quality emits new chord text with current root', () => {
        const props = mount({ initialDegree: 6, initialAccidental: '', initialQualityId: 'maj' });
        const qualities = document.querySelectorAll('.chord-picker__quality');
        const m7 = Array.from(qualities).find((b) => b.textContent === 'm7');
        m7.click();
        expect(props.onSelect).toHaveBeenCalledWith('vi7');
    });

    it('Escape key fires onClose', async () => {
        const props = mount();
        // useEffect attaches the listener after the commit phase; flush.
        await new Promise((r) => setTimeout(r, 50));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise((r) => setTimeout(r, 10));
        expect(props.onClose).toHaveBeenCalled();
    });
});
