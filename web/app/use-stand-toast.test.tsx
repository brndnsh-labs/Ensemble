// @vitest-environment happy-dom
/**
 * The stand toast's rules (#1460), each one a review-found line in `use-stand-toast.ts`. Timers
 * are fake; every `setMessage` and clock tick runs inside `act`.
 */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from './test/render-hook';
import { useStandToast } from './use-stand-toast';

type Options = Parameters<typeof useStandToast>[0];
const idle: Options = {
    busy: false,
    soundProgress: '',
    standSyncFailureKey: null,
    pendingAutoplayHint: null,
    updateHint: null,
};

let mounted: { unmount: () => void } | null = null;
function mount(initial: Partial<Options> = {}) {
    const tones: string[] = [];
    const view = renderHook(
        (options: Options) => {
            const toast = useStandToast(options);
            tones.push(toast.toastTone);
            return toast;
        },
        { ...idle, ...initial },
    );
    mounted = view;
    return {
        ...view,
        tones,
        with: (next: Partial<Options>) => view.rerender({ ...idle, ...next }),
    };
}
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    mounted?.unmount();
    mounted = null;
    vi.useRealTimers();
});

describe('useStandToast: the message', () => {
    it('a warning is never replaced by an info (Re-review P3)', () => {
        const { result } = mount();
        act(() => result.current.setMessage('Unsaved changes', { tone: 'warning' }));
        act(() => result.current.setMessage('Saved'));
        expect(result.current.toastText).toBe('Unsaved changes');
        expect(result.current.toastTone).toBe('warning');
    });

    it('the guard reads a ref, so a setMessage captured before the warning cannot replace it (Re-review P3)', () => {
        const { result } = mount();
        // An async caller closed over this before any warning existed.
        const stale = result.current.setMessage;
        act(() => result.current.setMessage('Unsaved changes', { tone: 'warning' }));
        act(() => stale('Saved'));
        expect(result.current.toastText).toBe('Unsaved changes');
        expect(result.current.toastTone).toBe('warning');
    });

    it('a warning is replaced by a newer warning (Re-review P3)', () => {
        const { result } = mount();
        act(() => result.current.setMessage('First', { tone: 'warning' }));
        act(() => result.current.setMessage('Second', { tone: 'warning' }));
        expect(result.current.toastText).toBe('Second');
    });

    it('an info is replaced by anything, and a call counts one token each (#1460)', () => {
        const { result } = mount();
        act(() => result.current.setMessage('One'));
        act(() => result.current.setMessage('Two'));
        expect(result.current.toastText).toBe('Two');
        expect(result.current.messageToken).toBe(2);
    });

    it('dismissMessage clears a warning and its tone, so an info shows again (Re-review P3)', () => {
        const { result } = mount();
        act(() => result.current.setMessage('Unsaved changes', { tone: 'warning' }));
        act(() => result.current.dismissMessage());
        expect(result.current.toastText).toBeNull();
        act(() => result.current.setMessage('Saved'));
        expect(result.current.toastText).toBe('Saved');
        expect(result.current.toastTone).toBe('info');
    });

    it('the message, autoplay hint and update hint read together (#1460)', () => {
        const { result } = mount({ pendingAutoplayHint: 'tap anywhere to play', updateHint: 'U' });
        act(() => result.current.setMessage('Saved'));
        expect(result.current.toastText).toBe('Saved · tap anywhere to play · U');
    });
});

describe('useStandToast: the busy line', () => {
    it('"Updating…" waits out a 300ms debounce before it shows (Review P3)', () => {
        const { result, with: set } = mount();
        set({ busy: true });
        tick(299);
        expect(result.current.toastTone).toBe('info');
        expect(result.current.toastText).toBeNull();
        tick(1);
        expect(result.current.toastTone).toBe('busy');
        expect(result.current.toastText).toBe('Updating…');
    });

    it('a sound progress line shows at once, in place of "Updating…" (Review P3)', () => {
        const { result, with: set } = mount();
        set({ busy: true, soundProgress: 'Downloading 40%' });
        expect(result.current.toastTone).toBe('busy');
        expect(result.current.toastText).toBe('Downloading 40%');
    });

    it('busy outranks a message while it shows (#1460)', () => {
        const { result, with: set } = mount();
        act(() => result.current.setMessage('Saved'));
        set({ busy: true, soundProgress: 'Downloading' });
        expect(result.current.toastText).toBe('Downloading');
        set({});
        expect(result.current.toastText).toBe('Saved');
    });

    it('an action that finishes inside the debounce never flashes busy (Review P3)', () => {
        const { with: set, tones } = mount();
        set({ busy: true });
        tick(100);
        set({ busy: false });
        tick(1000);
        expect(tones).not.toContain('busy');
    });

    it('busy ending never renders one more busy frame (Re-review P3)', () => {
        const { with: set, tones } = mount();
        set({ busy: true });
        tick(300);
        expect(tones.at(-1)).toBe('busy');
        const before = tones.length;
        set({ busy: false });
        expect(tones.slice(before)).not.toContain('busy');
    });
});

describe('useStandToast: the auto-dismiss clock', () => {
    it('an info message clears itself after 4s (Review P2 #3)', () => {
        const { result } = mount();
        act(() => result.current.setMessage('Saved'));
        tick(3999);
        expect(result.current.toastText).toBe('Saved');
        tick(1);
        expect(result.current.toastText).toBeNull();
    });

    it('a warning never auto-dismisses (Review P2 #3)', () => {
        const { result } = mount();
        act(() => result.current.setMessage('Unsaved changes', { tone: 'warning' }));
        tick(60_000);
        expect(result.current.toastText).toBe('Unsaved changes');
    });

    it('the same sentence set again re-arms the clock (messageToken, #1460)', () => {
        const { result } = mount();
        act(() => result.current.setMessage('Saved'));
        tick(3000);
        act(() => result.current.setMessage('Saved'));
        tick(3000);
        expect(result.current.toastText).toBe('Saved');
        tick(1000);
        expect(result.current.toastText).toBeNull();
    });

    it('the clock pauses while the toast is held and resumes, afresh, on release (Review P2 #1/#5)', () => {
        const { result } = mount();
        act(() => result.current.setMessage('Saved'));
        tick(2000);
        act(() => result.current.setToastHeld(true));
        tick(60_000);
        expect(result.current.toastText).toBe('Saved');
        act(() => result.current.setToastHeld(false));
        tick(3999);
        expect(result.current.toastText).toBe('Saved');
        tick(1);
        expect(result.current.toastText).toBeNull();
    });

    it('time masked under the busy line does not count against the message (Review P2 #3)', () => {
        const { result, with: set } = mount();
        act(() => result.current.setMessage('Saved'));
        set({ busy: true, soundProgress: 'Downloading' });
        tick(60_000);
        set({});
        expect(result.current.toastText).toBe('Saved');
        tick(4000);
        expect(result.current.toastText).toBeNull();
    });

    it('toastHeld resets when the toast empties, so a stuck hold cannot freeze the next one (Re-review P3)', () => {
        const { result } = mount();
        act(() => result.current.setMessage('Unsaved changes', { tone: 'warning' }));
        act(() => result.current.setToastHeld(true));
        // WebKit fires no focusout when the focused close button goes: the toast just empties.
        act(() => result.current.dismissMessage());
        act(() => result.current.setMessage('Saved'));
        tick(4000);
        expect(result.current.toastText).toBeNull();
    });
});

describe('useStandToast: the sync-failure notice', () => {
    it('shows a failure until it is dismissed, and stays dismissed while the fact holds (#1460)', () => {
        const { result, with: set } = mount({ standSyncFailureKey: 'A' });
        expect(result.current.standSyncFailureVisible).toBe(true);
        act(() => result.current.dismissSyncFailure());
        expect(result.current.standSyncFailureVisible).toBe(false);
        set({ standSyncFailureKey: 'A' });
        expect(result.current.standSyncFailureVisible).toBe(false);
    });

    it('no failure is not visible (#1460)', () => {
        const { result } = mount();
        expect(result.current.standSyncFailureVisible).toBe(false);
    });

    it('a dismissal clears when the fact moves A to B to A, never passing through null (Review P3)', () => {
        const { result, with: set } = mount({ standSyncFailureKey: 'A' });
        act(() => result.current.dismissSyncFailure());
        set({ standSyncFailureKey: 'B' });
        expect(result.current.standSyncFailureVisible).toBe(true);
        set({ standSyncFailureKey: 'A' });
        expect(result.current.standSyncFailureVisible).toBe(true);
    });

    it('dismissing B does not silence A when it comes back (Review P3)', () => {
        const { result, with: set } = mount({ standSyncFailureKey: 'A' });
        set({ standSyncFailureKey: 'B' });
        act(() => result.current.dismissSyncFailure());
        expect(result.current.standSyncFailureVisible).toBe(false);
        set({ standSyncFailureKey: 'A' });
        expect(result.current.standSyncFailureVisible).toBe(true);
    });

    it('a dismissal clears when the failure goes away entirely (Review P3)', () => {
        const { result, with: set } = mount({ standSyncFailureKey: 'A' });
        act(() => result.current.dismissSyncFailure());
        set({ standSyncFailureKey: null });
        set({ standSyncFailureKey: 'A' });
        expect(result.current.standSyncFailureVisible).toBe(true);
    });
});
