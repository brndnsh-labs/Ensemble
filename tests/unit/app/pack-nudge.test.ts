// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasAnyPackInstalled } from '../../../public/engine/instrument-registry.js';
import { maybeShowPackInstallNudge, PACK_NUDGE_SEEN_KEY } from '../../../public/pack-nudge.js';
import { dispatch } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';
import { showToast } from '../../../public/ui.js';

vi.mock('../../../public/state.js', () => ({ dispatch: vi.fn() }));
vi.mock('../../../public/ui.js', () => ({ showToast: vi.fn() }));
vi.mock('../../../public/engine/instrument-registry.js', () => ({
    hasAnyPackInstalled: vi.fn(),
}));

// Map-backed localStorage so the node-env test exercises the real flag logic.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k) : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
});

describe('pack-install nudge (#684)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        store.clear();
        hasAnyPackInstalled.mockReturnValue(false);
    });

    it('shows a dismissible toast once when no packs are installed', () => {
        maybeShowPackInstallNudge();

        expect(showToast).toHaveBeenCalledTimes(1);
        const opts = showToast.mock.calls[0][0];
        expect(opts.message).toMatch(/real instruments/i);
        expect(opts.actions.map((a) => a.label)).toEqual(['Open Packs', 'Dismiss']);
    });

    it('persists the seen flag up-front so it can only fire once', () => {
        maybeShowPackInstallNudge();
        expect(localStorage.getItem(PACK_NUDGE_SEEN_KEY)).toBe('1');

        // A second call (e.g. another load) is suppressed by the flag.
        maybeShowPackInstallNudge();
        expect(showToast).toHaveBeenCalledTimes(1);
    });

    it('does not fire when the user already has a pack installed', () => {
        hasAnyPackInstalled.mockReturnValue(true);

        maybeShowPackInstallNudge();

        expect(showToast).not.toHaveBeenCalled();
        // Never installs/owns the flag when it didn't show — keeps the gate honest.
        expect(localStorage.getItem(PACK_NUDGE_SEEN_KEY)).toBeNull();
    });

    it('does not fire when the nudge was already seen', () => {
        localStorage.setItem(PACK_NUDGE_SEEN_KEY, '1');

        maybeShowPackInstallNudge();

        expect(showToast).not.toHaveBeenCalled();
    });

    it('Open Packs deep-links to Settings → Packs', () => {
        maybeShowPackInstallNudge();
        const opts = showToast.mock.calls[0][0];
        const openPacks = opts.actions.find((a) => a.label === 'Open Packs');

        openPacks.onClick();

        expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_SETTINGS_TAB, 'packs');
        expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_MODAL_OPEN, {
            modal: 'settings',
            open: true,
        });
    });
});
