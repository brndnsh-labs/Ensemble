// @vitest-environment happy-dom
/**
 * Browser history for the shell's views (#1700), driven through the real `window.history` and
 * `popstate` events. `back`/`forward`/`go` are stubbed (happy-dom does not traverse a stack), so
 * the "pop that arrives" is dispatched by hand, as the browser would.
 */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavEntry, NavView } from '../lib/navigation';
import { renderHook } from './test/render-hook';
import { useHistoryNavigation } from './use-history-navigation';

type Options = Parameters<typeof useHistoryNavigation>[0];

const HOME: NavView = { kind: 'home' };
const ALL: NavView = { kind: 'all', collection: null };
const STANDARDS: NavView = { kind: 'standards', entry: null };
const SONG: NavView = { kind: 'song', ref: { kind: 'song', id: 's1' } };
const entry = (view: NavView, depth: number): NavEntry => ({ ensemble: 1, depth, view });

let mounted: { unmount: () => void } | null = null;
function mount(initial: Partial<Options> = {}) {
    const applyNav = vi.fn<Options['applyNav']>();
    const working = { current: false };
    const base = (more: Partial<Options>): Options => ({
        ready: true,
        navView: HOME,
        busy: false,
        working,
        applyNav,
        ...more,
    });
    const view = renderHook((options: Options) => useHistoryNavigation(options), base(initial));
    mounted = view;
    return {
        ...view,
        applyNav,
        working,
        set: (more: Partial<Options>) => view.rerender(base(more)),
    };
}
/** The browser's popstate, landing on `state`. */
const pop = (state: unknown) =>
    act(() => {
        window.dispatchEvent(new PopStateEvent('popstate', { state }));
    });

let push: ReturnType<typeof vi.spyOn>;
let replace: ReturnType<typeof vi.spyOn>;
let go: ReturnType<typeof vi.spyOn>;
let back: ReturnType<typeof vi.spyOn>;
let forward: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    window.history.replaceState(null, '');
    push = vi.spyOn(window.history, 'pushState');
    replace = vi.spyOn(window.history, 'replaceState');
    go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
    back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    forward = vi.spyOn(window.history, 'forward').mockImplementation(() => {});
});
afterEach(() => {
    mounted?.unmount();
    mounted = null;
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe('useHistoryNavigation: writing each view change (#1700)', () => {
    it('claims the page entry in place on the first run, on the songbook (#1700)', () => {
        const { result } = mount();
        expect(replace).toHaveBeenCalledWith(entry(HOME, 0), '');
        expect(push).not.toHaveBeenCalled();
        expect(result.current.entry.current).toEqual(entry(HOME, 0));
    });

    it('a reload on a song claims the entry at depth 1, not a push (#1700)', () => {
        const { result } = mount({ navView: SONG });
        expect(replace).toHaveBeenCalledWith(entry(SONG, 1), '');
        expect(push).not.toHaveBeenCalled();
        expect(result.current.entry.current?.depth).toBe(1);
    });

    it('writes nothing before the songbook has loaded (#1700)', () => {
        const { result, set } = mount({ ready: false });
        set({ ready: false, navView: ALL });
        expect(replace).not.toHaveBeenCalled();
        expect(push).not.toHaveBeenCalled();
        expect(result.current.entry.current).toBeNull();
    });

    it('a deeper view pushes (#1700)', () => {
        const { result, set } = mount();
        set({ navView: ALL });
        expect(push).toHaveBeenCalledWith(entry(ALL, 1), '');
        expect(result.current.entry.current).toEqual(entry(ALL, 1));
    });

    it('a view on the same level replaces (#1700)', () => {
        const { result, set } = mount();
        set({ navView: ALL });
        push.mockClear();
        replace.mockClear();
        set({ navView: STANDARDS });
        expect(push).not.toHaveBeenCalled();
        expect(replace).toHaveBeenCalledWith(entry(STANDARDS, 1), '');
        expect(result.current.entry.current).toEqual(entry(STANDARDS, 1));
    });

    it('a song replacing a song stays level and replaces (#1700)', () => {
        const next: NavView = { kind: 'song', ref: { kind: 'song', id: 's2' } };
        const { set } = mount({ navView: SONG });
        replace.mockClear();
        set({ navView: next });
        expect(push).not.toHaveBeenCalled();
        expect(replace).toHaveBeenCalledWith(entry(next, 1), '');
    });

    it('the same view again writes nothing (#1700)', () => {
        const { set } = mount();
        set({ navView: ALL });
        push.mockClear();
        replace.mockClear();
        set({ navView: { kind: 'all', collection: null } });
        expect(push).not.toHaveBeenCalled();
        expect(replace).not.toHaveBeenCalled();
    });

    it('a shallower view goes back so Forward still reopens what was left (#1700)', () => {
        const { set } = mount();
        set({ navView: ALL });
        set({ navView: HOME });
        expect(go).toHaveBeenCalledWith(-1);
        expect(push).toHaveBeenCalledTimes(1);
    });

    it('a view change resets the draft-leave warning (#1700)', () => {
        const { result, set } = mount();
        result.current.leaveDraftWarned.current = true;
        set({ navView: ALL });
        expect(result.current.leaveDraftWarned.current).toBe(false);
    });
});

describe("useHistoryNavigation: the shell's own history.go (#1700)", () => {
    it('its popstate is not read as Back: it rewrites the entry and applies nothing', () => {
        const { applyNav, set } = mount();
        set({ navView: ALL });
        set({ navView: HOME });
        replace.mockClear();
        pop(entry(HOME, 0));
        expect(applyNav).not.toHaveBeenCalled();
        expect(replace).toHaveBeenCalledWith(entry(HOME, 0), '');
    });

    it('a view change that lands while the pop is in flight waits for it (#1700)', () => {
        const { applyNav, set } = mount();
        set({ navView: ALL });
        set({ navView: HOME });
        push.mockClear();
        replace.mockClear();
        go.mockClear();
        // The pop to the songbook has not arrived; the musician is already opening a song.
        set({ navView: SONG });
        expect(push).not.toHaveBeenCalled();
        expect(replace).not.toHaveBeenCalled();
        // history.state is the songbook entry once the pop lands, and the step is written then.
        window.history.replaceState(entry(HOME, 0), '');
        push.mockClear();
        replace.mockClear();
        pop(entry(HOME, 0));
        expect(applyNav).not.toHaveBeenCalled();
        expect(push).toHaveBeenCalledWith(entry(SONG, 1), '');
    });
});

describe('useHistoryNavigation: two pops in flight (#1700)', () => {
    it('the deferred sync is written only after the LAST silent pop lands', () => {
        const { result, applyNav, set } = mount();
        set({ navView: ALL });
        set({ navView: HOME }); // history.go(-1): silent pop 1 in flight
        result.current.undoPop(entry(ALL, 1), entry(HOME, 0)); // pop 2 in flight
        set({ navView: ALL }); // lands mid-flight: deferred, nothing written
        expect(push).toHaveBeenCalledTimes(1);
        pop(entry(HOME, 0)); // pop 1 lands, one still in flight
        expect(push).toHaveBeenCalledTimes(1);
        pop(entry(HOME, 0)); // the last lands
        expect(push).toHaveBeenCalledTimes(2);
        expect(push).toHaveBeenLastCalledWith(entry(ALL, 1), '');
        expect(applyNav).not.toHaveBeenCalled();
    });
});

describe('useHistoryNavigation: Back and Forward (#1700)', () => {
    it('popstate hands applyNav the entry and the one it leaves (#1700)', () => {
        const { result, applyNav, set } = mount();
        set({ navView: ALL });
        const from = result.current.entry.current;
        pop(entry(HOME, 0));
        expect(applyNav).toHaveBeenCalledTimes(1);
        expect(applyNav).toHaveBeenCalledWith(entry(HOME, 0), from);
    });

    it('a popstate with a state Ensemble did not write is ignored (fragment navigation, #1700)', () => {
        const { applyNav } = mount();
        pop(null);
        pop({ somebody: 'else' });
        expect(applyNav).not.toHaveBeenCalled();
    });

    it('hears nothing before the songbook has loaded (#1700)', () => {
        const { applyNav } = mount({ ready: false });
        pop(entry(HOME, 0));
        expect(applyNav).not.toHaveBeenCalled();
    });

    it('stops listening when unmounted (#1700)', () => {
        const { applyNav, unmount } = mount();
        unmount();
        mounted = null;
        pop(entry(HOME, 0));
        expect(applyNav).not.toHaveBeenCalled();
    });

    it('a Back that arrives while busy waits, then is applied once, when busy clears (#1700)', () => {
        const { result, applyNav, working, set } = mount({ navView: ALL });
        set({ navView: ALL, busy: true });
        working.current = true;
        const from = result.current.entry.current;
        pop(entry(HOME, 0));
        expect(applyNav).not.toHaveBeenCalled();
        working.current = false;
        set({ navView: ALL, busy: false });
        expect(applyNav).toHaveBeenCalledTimes(1);
        expect(applyNav).toHaveBeenCalledWith(entry(HOME, 0), from);
        set({ navView: ALL, busy: true });
        set({ navView: ALL, busy: false });
        expect(applyNav).toHaveBeenCalledTimes(1);
    });

    it('while still busy, a waiting Back is not applied early (#1700)', () => {
        const { applyNav, working, set } = mount({ navView: ALL });
        working.current = true;
        pop(entry(HOME, 0));
        set({ navView: ALL, busy: true });
        expect(applyNav).not.toHaveBeenCalled();
    });

    it('a second Back while busy replaces the first: only the latest is applied (#1700)', () => {
        const { applyNav, working, set } = mount({ navView: ALL });
        set({ navView: ALL, busy: true });
        working.current = true;
        pop(entry(STANDARDS, 1));
        pop(entry(HOME, 0));
        set({ navView: ALL, busy: false });
        expect(applyNav).toHaveBeenCalledTimes(1);
        expect(applyNav.mock.calls[0]?.[0]).toEqual(entry(HOME, 0));
    });
});

describe('useHistoryNavigation: Back closes what is open first (#1700, #1755)', () => {
    it('an open dialog is closed, the page stays, and history steps back onto it', () => {
        document.body.insertAdjacentHTML('beforeend', '<dialog open id="d"></dialog>');
        const { result, applyNav, set } = mount();
        set({ navView: ALL });
        const from = result.current.entry.current;
        pop(entry(HOME, 0));
        expect(document.querySelectorAll('dialog[open]')).toHaveLength(0);
        expect(applyNav).not.toHaveBeenCalled();
        // The popstate went to a shallower entry, so the step back onto the page is a Forward.
        expect(forward).toHaveBeenCalledTimes(1);
        expect(result.current.entry.current).toBe(from);
    });

    it('a dialog that cancels the close event stays open (#1700)', () => {
        document.body.insertAdjacentHTML('beforeend', '<dialog open id="d"></dialog>');
        document.getElementById('d')?.addEventListener('cancel', (e) => e.preventDefault());
        const { applyNav, set } = mount();
        set({ navView: ALL });
        pop(entry(HOME, 0));
        expect(document.querySelectorAll('dialog[open]')).toHaveLength(1);
        expect(applyNav).not.toHaveBeenCalled();
    });

    it('an open anchored menu hears Escape and the page stays (#1755)', () => {
        document.body.insertAdjacentHTML('beforeend', '<div class="menu"></div>');
        const escapes: string[] = [];
        const onKey = (e: KeyboardEvent) => escapes.push(e.key);
        document.addEventListener('keydown', onKey);
        try {
            const { applyNav, set } = mount();
            set({ navView: ALL });
            pop(entry(HOME, 0));
            expect(escapes).toEqual(['Escape']);
            expect(applyNav).not.toHaveBeenCalled();
            expect(forward).toHaveBeenCalledTimes(1);
        } finally {
            document.removeEventListener('keydown', onKey);
        }
    });
});

describe('useHistoryNavigation: undoPop (#1700)', () => {
    it('steps Forward onto `from` when the popstate went shallower, and Back when deeper', () => {
        const { result } = mount({ navView: ALL });
        result.current.undoPop(entry(HOME, 0), entry(ALL, 1));
        expect(forward).toHaveBeenCalledTimes(1);
        expect(back).not.toHaveBeenCalled();
        result.current.undoPop(entry(SONG, 2), entry(ALL, 1));
        expect(back).toHaveBeenCalledTimes(1);
    });

    it('re-points the entry at `from` and swallows the pop that follows (#1700)', () => {
        const { result, applyNav } = mount({ navView: ALL });
        const from = entry(ALL, 1);
        result.current.undoPop(entry(HOME, 0), from);
        expect(result.current.entry.current).toBe(from);
        replace.mockClear();
        pop(from);
        expect(applyNav).not.toHaveBeenCalled();
        expect(replace).toHaveBeenCalledWith(from, '');
        // Swallowed once: the next pop is the musician's.
        pop(entry(HOME, 0));
        expect(applyNav).toHaveBeenCalledTimes(1);
    });

    it('with no `from` there is nowhere to step back to (#1700)', () => {
        const { result } = mount({ navView: ALL });
        result.current.undoPop(entry(HOME, 0), null);
        expect(back).not.toHaveBeenCalled();
        expect(forward).not.toHaveBeenCalled();
    });
});
