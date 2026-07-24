// @ts-nocheck
/**
 * @vitest-environment happy-dom
 *
 * Regression guard for the mobile "tap Library/Edit → menu closes, nothing loads" bug.
 * On WebKit/iOS a <button> tap does NOT move focus to the button, so the popover's focused
 * menu item blurs with `relatedTarget === null` mid-tap. If handleFocusExit dismisses on that
 * null-blur, it closes the panel before the item's click commits and the action is swallowed.
 * These tests pin: null-blur must NOT dismiss; genuine outside dismissal (pointerdown, Escape)
 * must still work — so the fix isn't over-reaching.
 */
import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ToolbarPopover } from '../../../public/components/ToolbarPopover.jsx';

function mount() {
    render(
        <ToolbarPopover
            panelId="test-panel"
            triggerAriaLabel="More"
            panelLabel="More options"
            triggerContent="⋯"
        >
            <button type="button" data-testid="menu-item">
                Library
            </button>
        </ToolbarPopover>,
        document.getElementById('app'),
    );
}

const trigger = () => document.querySelector('.workspace-toolbar-trigger') as HTMLButtonElement;
const panel = () => document.querySelector('.workspace-toolbar-panel') as HTMLElement;
const isOpen = () => panel()?.classList.contains('is-open') ?? false;

// preact batches setState; let the re-render flush before asserting on the DOM.
const flush = () => new Promise((r) => setTimeout(r, 20));

async function open() {
    trigger().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
}

describe('ToolbarPopover — WebKit tap-dismiss guard', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="app"></div>';
    });

    afterEach(() => {
        render(null, document.getElementById('app'));
    });

    it('opens on trigger click', async () => {
        mount();
        expect(isOpen()).toBe(false);
        await open();
        expect(isOpen()).toBe(true);
    });

    it('stays open when focus leaves to nothing (relatedTarget === null) — the iOS tap case', async () => {
        mount();
        await open();
        expect(isOpen()).toBe(true);

        // Simulate WebKit's blur-to-null during a menu-item tap.
        const blur = new FocusEvent('blur', { relatedTarget: null });
        panel().dispatchEvent(blur);
        await flush();

        expect(isOpen()).toBe(true); // must NOT dismiss — the tapped action still needs to fire
    });

    it('stays open when focus moves to a node inside the panel', async () => {
        mount();
        await open();
        const item = document.querySelector('[data-testid="menu-item"]');
        const blur = new FocusEvent('blur', { relatedTarget: item });
        panel().dispatchEvent(blur);
        await flush();
        expect(isOpen()).toBe(true);
    });

    it('still dismisses on a genuine outside pointerdown (fix is not over-reaching)', async () => {
        mount();
        await open();
        expect(isOpen()).toBe(true);

        const outside = document.createElement('button');
        document.body.appendChild(outside);
        const down = new PointerEvent('pointerdown', { bubbles: true });
        Object.defineProperty(down, 'target', { value: outside });
        window.dispatchEvent(down);
        await flush();

        expect(isOpen()).toBe(false); // outside dismissal path is intact
    });
});
