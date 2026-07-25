// @ts-nocheck
/**
 * @vitest-environment happy-dom
 *
 * #1181 — the four orphaned-affordance verdicts, gated.
 *
 * Two FINISHes (Visual Flash overlay, per-section minor override) and two KILLs
 * (Haptic, groove.followPlayback). The KILLs are asserted as *absences* on purpose:
 * each field was persisted and hydrated, so a well-meaning "restore the missing
 * field" change would silently resurrect a control nothing consumes.
 */
import { render } from 'preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlashOverlay } from '../../../public/components/FlashOverlay.jsx';
import { SectionCard } from '../../../public/components/SectionCard.jsx';
import { dispatch, getState } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

const { onSectionUpdate } = await vi.hoisted(async () => ({ onSectionUpdate: vi.fn() }));

vi.mock('../../../public/controllers/arranger-controller.js', () => ({
    onSectionUpdate,
    onSectionDelete: vi.fn(),
    onSectionDuplicate: vi.fn(),
}));

const settle = () => new Promise((r) => setTimeout(r, 30));

describe('#1181 Visual Flash — FINISH (the overlay element was never rendered)', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="app"></div>';
        dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'visualFlash', value: true });
        dispatch(ACTIONS.FLASH_EXPIRED);
    });

    it('renders #flashOverlay when the setting is on', async () => {
        render(<FlashOverlay />, document.getElementById('app'));
        await settle();

        // The id is load-bearing: layout.css styles `#flashOverlay` (fixed, inset 0,
        // white, pointer-events none, opacity transition). A renamed id silently
        // un-styles the feature back into invisibility, which is how it died before.
        expect(document.getElementById('flashOverlay')).not.toBeNull();
    });

    it('drives opacity from playback.flashIntensity', async () => {
        render(<FlashOverlay />, document.getElementById('app'));
        await settle();

        expect(document.getElementById('flashOverlay').style.opacity).toBe('0');

        dispatch(ACTIONS.TRIGGER_FLASH, 0.4);
        await settle();
        expect(Number(document.getElementById('flashOverlay').style.opacity)).toBeCloseTo(0.4, 5);

        // FLASH_EXPIRED is what state-effects schedules 50ms after each trigger.
        dispatch(ACTIONS.FLASH_EXPIRED);
        await settle();
        expect(Number(document.getElementById('flashOverlay').style.opacity)).toBe(0);
    });

    it('renders nothing when the setting is off, even mid-flash', async () => {
        dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'visualFlash', value: false });
        dispatch(ACTIONS.TRIGGER_FLASH, 0.4);

        render(<FlashOverlay />, document.getElementById('app'));
        await settle();

        // The render gate is the single chokepoint for the user's setting — a trigger
        // that forgets to check the flag must not be able to leak a flash onscreen.
        expect(document.getElementById('flashOverlay')).toBeNull();
    });

    it('is hidden from assistive tech (it is decorative)', async () => {
        render(<FlashOverlay />, document.getElementById('app'));
        await settle();

        expect(document.getElementById('flashOverlay').getAttribute('aria-hidden')).toBe('true');
    });
});

describe('#1181 per-section minor — FINISH (engine honored it, nothing could set it)', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="app"></div>';
        onSectionUpdate.mockClear();
    });

    /**
     * Renders the card and opens the kebab actions menu, which is where the per-section
     * settings live — the Quality control is inside `{isMenuOpen && ...}`, so querying
     * without opening it finds nothing.
     */
    const renderCard = async (section) => {
        render(
            <SectionCard section={section} index={0} totalSections={1} />,
            document.getElementById('app'),
        );
        await settle();

        const kebab = document.querySelector('.section-kebab-btn');
        expect(kebab).not.toBeNull();
        kebab.click();
        await settle();

        return document.querySelector('select[aria-label="Section Quality"]');
    };

    it('exposes a tri-state Quality control', async () => {
        const select = await renderCard({ id: 's1', label: 'A', value: 'I' });

        expect(select).not.toBeNull();
        expect([...select.options].map((o) => o.value)).toEqual(['', 'major', 'minor']);
    });

    it('reflects an inherited (undefined) override as Auto', async () => {
        const select = await renderCard({ id: 's1', label: 'A', value: 'I' });
        expect(select.value).toBe('');
    });

    it.each([
        [true, 'minor'],
        [false, 'major'],
    ])('reflects an explicit isMinor=%s as %s', async (isMinor, expected) => {
        const select = await renderCard({ id: 's1', label: 'A', value: 'I', isMinor });
        expect(select.value).toBe(expected);
    });

    it.each([
        ['minor', true],
        ['major', false],
    ])('dispatches isMinor=%s as the boolean %s', async (raw, expected) => {
        const select = await renderCard({ id: 's1', label: 'A', value: 'I' });

        select.value = raw;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await settle();

        expect(onSectionUpdate).toHaveBeenCalledWith('s1', 'isMinor', expected);
    });

    // The inherit case is why this is a select rather than a checkbox: a two-state
    // control cannot express "follow the chart", and mapping Auto to `false` would
    // silently pin every existing section to major.
    it('dispatches undefined — not false — when set back to Auto', async () => {
        const select = await renderCard({ id: 's1', label: 'A', value: 'I', isMinor: true });

        select.value = '';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await settle();

        expect(onSectionUpdate).toHaveBeenCalledWith('s1', 'isMinor', undefined);
    });
});

describe('#1181 KILLs — the removed fields stay removed', () => {
    // Asserted as absences because both fields were persisted AND hydrated. A future
    // "this field is missing from the reducer" fix would resurrect a toggle wired to
    // nothing (haptic never reached navigator.vibrate) or an unreachable false branch
    // (followPlayback had no dispatcher since the chart-first migration).
    it('has no playback.haptic', () => {
        expect('haptic' in getState().playback).toBe(false);
    });

    it('has no groove.followPlayback', () => {
        expect('followPlayback' in getState().groove).toBe(false);
    });

    it('still pins the current measure — the behavior followPlayback used to gate', () => {
        // The reader in Visualizer is now unconditional, so the capability that
        // mattered survives the field's removal.
        expect(getState().groove).toHaveProperty('currentMeasure');
    });
});
