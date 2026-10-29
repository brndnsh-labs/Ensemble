// @vitest-environment happy-dom
/**
 * The delete toast's Undo offer (#1758): its lifetime, the carry-forward onto a kept revision
 * (#1707), the Undo that waits for the shell, and the focus after it. Charts here are opaque
 * stand-ins: the hook compares them by identity and reads only `revision` and `updatedAt`.
 */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartDocument } from '../lib/runtime';
import { renderHook } from './test/render-hook';
import { DELETE_UNDO_MS, type DeleteUndo, useDeleteUndo } from './use-delete-undo';

const doc = (revision: number): ChartDocument =>
    ({ id: 'song', revision, updatedAt: `t${revision}` }) as unknown as ChartDocument;

type Options = Parameters<typeof useDeleteUndo>[0];
type Offer = Parameters<ReturnType<typeof useDeleteUndo>['offerUndo']>[0];

const offer = (before: ChartDocument): Offer => ({
    text: 'Bar 5 deleted',
    before,
    drafts: new Map(),
    measureId: 'm4',
    sectionId: 'a',
    reopen: null,
});

let mounted: { unmount: () => void } | null = null;
/** The hook over `current`: the chart on the stand now, which `offerUndo` snapshots as `after`. */
function mount(current: ChartDocument | null, extra: Partial<Options> = {}) {
    // The hook reads only keptAs's boolean: the shell's real comparer (id + data minus
    // revision/updatedAt) is not exercised here.
    const keptAs = vi.fn<Options['keptAs']>(() => false);
    const undoDelete = vi.fn();
    const base = (chart: ChartDocument | null): Options => ({
        current: chart,
        busy: false,
        draftsEmpty: true,
        currentNow: { current: chart },
        keptAs,
        undoDelete,
        ...extra,
    });
    const view = renderHook((options: Options) => useDeleteUndo(options), base(current));
    mounted = view;
    return {
        ...view,
        keptAs,
        undoDelete,
        /** Rerender with another chart on the stand (and the overrides). */
        show: (chart: ChartDocument | null, more: Partial<Options> = {}) =>
            view.rerender({ ...base(chart), ...more }),
    };
}
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    mounted?.unmount();
    mounted = null;
    document.body.replaceChildren();
    vi.useRealTimers();
});

describe('useDeleteUndo: the offer', () => {
    it('offerUndo makes undoLive true, good for the chart as it now stands (#1758)', () => {
        const after = doc(1);
        const { result } = mount(after);
        expect(result.current.undoLive).toBe(false);
        act(() => result.current.offerUndo(offer(doc(0))));
        expect(result.current.undoLive).toBe(true);
        expect(result.current.deleteUndo?.after).toBe(after);
        expect(result.current.deleteUndo?.token).toBe(1);
        expect(result.current.deleteUndoNow.current).toBe(result.current.deleteUndo);
    });

    it('with no chart on the stand there is nothing to offer (#1758)', () => {
        const { result } = mount(null);
        act(() => result.current.offerUndo(offer(doc(0))));
        expect(result.current.deleteUndo).toBeNull();
    });

    it('each delete counts a new token (#1758)', () => {
        const { result } = mount(doc(1));
        act(() => result.current.offerUndo(offer(doc(0))));
        act(() => result.current.offerUndo(offer(doc(0))));
        expect(result.current.deleteUndo?.token).toBe(2);
    });

    it('retireUndo takes the offer down (#1758)', () => {
        const { result } = mount(doc(1));
        act(() => result.current.offerUndo(offer(doc(0))));
        act(() => result.current.retireUndo());
        expect(result.current.deleteUndo).toBeNull();
        expect(result.current.undoLive).toBe(false);
    });
});

describe('useDeleteUndo: what retires it', () => {
    it('an edit retires the offer: the chart is no longer `after` (#1758)', () => {
        const { result, show } = mount(doc(1));
        act(() => result.current.offerUndo(offer(doc(0))));
        show(doc(2));
        expect(result.current.undoLive).toBe(false);
        expect(result.current.deleteUndo).toBeNull();
    });

    it('a bar typed in (a pending draft) retires the offer (#1758)', () => {
        const after = doc(1);
        const { result, show } = mount(after);
        act(() => result.current.offerUndo(offer(doc(0))));
        show(after, { draftsEmpty: false });
        expect(result.current.undoLive).toBe(false);
        expect(result.current.deleteUndo).toBeNull();
    });

    it('another song on the stand retires the offer (#1758)', () => {
        const { result, show } = mount(doc(1));
        act(() => result.current.offerUndo(offer(doc(0))));
        show({ ...doc(1), id: 'other' } as ChartDocument);
        expect(result.current.deleteUndo).toBeNull();
    });

    it('no chart on the stand retires the offer (#1758)', () => {
        const { result, show } = mount(doc(1));
        act(() => result.current.offerUndo(offer(doc(0))));
        show(null);
        expect(result.current.deleteUndo).toBeNull();
    });

    it('the offer holds while the chart is untouched (#1758)', () => {
        const after = doc(1);
        const { result, show } = mount(after);
        act(() => result.current.offerUndo(offer(doc(0))));
        show(after);
        expect(result.current.undoLive).toBe(true);
    });

    it('a few seconds untouched retire it, to the millisecond (#1758)', () => {
        const { result } = mount(doc(1));
        act(() => result.current.offerUndo(offer(doc(0))));
        tick(DELETE_UNDO_MS - 1);
        expect(result.current.undoLive).toBe(true);
        tick(1);
        expect(result.current.deleteUndo).toBeNull();
    });

    it('the clock pauses while the toast is held and restarts on release (#1758)', () => {
        const { result } = mount(doc(1));
        act(() => result.current.offerUndo(offer(doc(0))));
        act(() => result.current.setUndoHeld(true));
        tick(60_000);
        expect(result.current.undoLive).toBe(true);
        act(() => result.current.setUndoHeld(false));
        tick(DELETE_UNDO_MS - 1);
        expect(result.current.undoLive).toBe(true);
        tick(1);
        expect(result.current.deleteUndo).toBeNull();
    });

    it('a new offer clears a hold left from the last one (#1758)', () => {
        const { result } = mount(doc(1));
        act(() => result.current.offerUndo(offer(doc(0))));
        act(() => result.current.setUndoHeld(true));
        act(() => result.current.offerUndo(offer(doc(0))));
        tick(DELETE_UNDO_MS - 1);
        expect(result.current.undoLive).toBe(true);
        tick(1);
        expect(result.current.deleteUndo).toBeNull();
    });
});

describe('useDeleteUndo: the first-change keep (#1707)', () => {
    it('is carried onto the kept revision, with `before` rewritten to it (#1758 review)', () => {
        const before = doc(0);
        const after = doc(1);
        const kept = doc(2);
        const { result, show, keptAs } = mount(after);
        act(() => result.current.offerUndo(offer(before)));
        keptAs.mockReturnValue(true);
        show(kept);
        expect(keptAs).toHaveBeenCalledWith(after, kept);
        expect(result.current.undoLive).toBe(true);
        const carried = result.current.deleteUndo as DeleteUndo;
        expect(carried.after).toBe(kept);
        expect(carried.before.revision).toBe(2);
        expect(carried.before.updatedAt).toBe('t2');
        expect(carried.token).toBe(1);
    });

    it('does not restart the clock: the seconds count from the delete (#1758 review)', () => {
        const { result, show, keptAs } = mount(doc(1));
        act(() => result.current.offerUndo(offer(doc(0))));
        tick(4000);
        keptAs.mockReturnValue(true);
        show(doc(2));
        expect(result.current.undoLive).toBe(true);
        tick(DELETE_UNDO_MS - 4000);
        expect(result.current.deleteUndo).toBeNull();
    });

    it('a chart that is not the keep still retires it (#1758)', () => {
        const { result, show } = mount(doc(1));
        act(() => result.current.offerUndo(offer(doc(0))));
        show(doc(2));
        expect(result.current.deleteUndo).toBeNull();
    });

    it('a bar pending on the kept revision retires it all the same (#1758)', () => {
        const { result, show, keptAs } = mount(doc(1));
        act(() => result.current.offerUndo(offer(doc(0))));
        keptAs.mockReturnValue(true);
        show(doc(2), { draftsEmpty: false });
        expect(result.current.deleteUndo).toBeNull();
    });
});

describe('useDeleteUndo: an Undo that waits its turn', () => {
    it('runs once the shell comes free, exactly once (#1758)', () => {
        const { result, show, undoDelete } = mount(doc(1), { busy: true });
        result.current.undoAfterWork.current = true;
        expect(undoDelete).not.toHaveBeenCalled();
        show(doc(1), { busy: false });
        expect(undoDelete).toHaveBeenCalledTimes(1);
        expect(result.current.undoAfterWork.current).toBe(false);
        show(doc(1), { busy: true });
        show(doc(1), { busy: false });
        expect(undoDelete).toHaveBeenCalledTimes(1);
    });

    it('does not run while the shell is still busy (#1758)', () => {
        const { result, show, undoDelete } = mount(doc(1), { busy: true });
        result.current.undoAfterWork.current = true;
        show(doc(1), { busy: true });
        expect(undoDelete).not.toHaveBeenCalled();
        expect(result.current.undoAfterWork.current).toBe(true);
    });

    it('nothing waiting means nothing runs when the shell comes free (#1758)', () => {
        const { show, undoDelete } = mount(doc(1), { busy: true });
        show(doc(1), { busy: false });
        expect(undoDelete).not.toHaveBeenCalled();
    });

    it('runs through the latest `undoDelete` closure (#1758)', () => {
        const stale = vi.fn();
        const latest = vi.fn();
        const { result, show } = mount(doc(1), { busy: true, undoDelete: stale });
        result.current.undoAfterWork.current = true;
        show(doc(1), { busy: true, undoDelete: latest });
        show(doc(1), { busy: false, undoDelete: latest });
        expect(stale).not.toHaveBeenCalled();
        expect(latest).toHaveBeenCalledTimes(1);
    });
});

describe('useDeleteUndo: focus after an Undo (#1758 review)', () => {
    function place(html: string) {
        document.body.insertAdjacentHTML('beforeend', html);
    }

    it("focuses the restored section's letter, then forgets the target", () => {
        place('<button class="section-letter" data-section-id="a">A</button>');
        const { result, show } = mount(doc(1));
        result.current.undoFocus.current = { sectionId: 'a' };
        show(doc(2));
        expect(document.activeElement?.classList.contains('section-letter')).toBe(true);
        expect(result.current.undoFocus.current).toBeNull();
    });

    it("focuses the restored bar's number where its field does not open", () => {
        place('<div data-measure-id="m4"><button class="bar-number">5</button></div>');
        const { result, show } = mount(doc(1));
        result.current.undoFocus.current = { measureId: 'm4' };
        show(doc(2));
        expect(document.activeElement?.classList.contains('bar-number')).toBe(true);
        expect(result.current.undoFocus.current).toBeNull();
    });

    it('waits for the restored chart: no target means no focus move', () => {
        place('<button class="section-letter" data-section-id="a">A</button>');
        const { show } = mount(doc(1));
        show(doc(2));
        expect(document.activeElement).toBe(document.body);
    });
});
