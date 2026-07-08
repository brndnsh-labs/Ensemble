// @vitest-environment happy-dom
//
// #1048 — pwa.ts now delegates SW lifecycle tracking to workbox-window's
// `Workbox` class instead of hand-rolling it (the hand-rolled version had the
// #1046 overlapping-update race: a shared, mutable `newWorker` variable a
// second update could clobber before the first worker's `statechange` fired).
// Workbox owns that race internally now, so this test's job shifts to what's
// actually still our code: that `waiting` is wired to the update-available
// flag, `controlling` is wired to a reload that only fires once even if the
// event fires twice, and `skipWaiting()` delegates to
// `wb.messageSkipWaiting()` (which targets whatever's currently waiting on
// the live registration, not a captured reference that can go stale).
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockWorkboxInstance {
    listeners: Record<string, Array<(event?: unknown) => void>>;
    register: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    messageSkipWaiting: ReturnType<typeof vi.fn>;
    emit(type: string, event?: unknown): void;
}

const { dispatchMock, instances } = vi.hoisted(() => ({
    dispatchMock: vi.fn(),
    instances: [] as MockWorkboxInstance[],
}));

vi.mock('../../public/state.js', () => ({ dispatch: dispatchMock }));

// Defined inside the factory (not hoisted-then-referenced) since vi.mock
// factories run before top-level class declarations would initialize.
vi.mock('workbox-window', () => {
    class MockWorkbox {
        listeners: Record<string, Array<(event?: unknown) => void>> = {};
        register = vi.fn(() => Promise.resolve(undefined));
        update = vi.fn();
        messageSkipWaiting = vi.fn();

        constructor(
            public scriptURL: string,
            public options: unknown,
        ) {
            instances.push(this);
        }

        addEventListener(type: string, cb: (event?: unknown) => void) {
            if (!this.listeners[type]) {
                this.listeners[type] = [];
            }
            this.listeners[type].push(cb);
        }

        emit(type: string, event?: unknown) {
            for (const cb of this.listeners[type] ?? []) {
                cb(event);
            }
        }
    }
    return { Workbox: MockWorkbox };
});

import { initPWA, skipWaiting } from '../../public/pwa.js';
import { ACTIONS } from '../../public/types.js';

describe('initPWA — workbox-window wiring', () => {
    beforeEach(() => {
        dispatchMock.mockClear();
        instances.length = 0;
        Object.defineProperty(window, 'location', {
            writable: true,
            configurable: true,
            value: { hostname: 'ensembletest.brndn.zip', reload: vi.fn() },
        });
        // happy-dom reports navigator.webdriver === true by default, which
        // would otherwise short-circuit initPWA's SW-registration gate.
        Object.defineProperty(navigator, 'webdriver', {
            configurable: true,
            value: false,
        });
        // happy-dom doesn't implement the Service Worker API at all; initPWA
        // only feature-detects with `'serviceWorker' in navigator` (the
        // Workbox instance itself is mocked above), so a stub object suffices.
        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: {},
        });
    });

    it('flags an update when Workbox reports a waiting worker', () => {
        initPWA();

        expect(instances).toHaveLength(1);
        instances[0].emit('waiting');

        expect(dispatchMock).toHaveBeenCalledWith(ACTIONS.SET_UPDATE_AVAILABLE, true);
    });

    it('reloads exactly once even if `controlling` fires more than once', () => {
        initPWA();
        const wb = instances[0];

        wb.emit('controlling');
        wb.emit('controlling');

        expect(window.location.reload).toHaveBeenCalledTimes(1);
    });

    it('skipWaiting() delegates to the live Workbox instance, not a captured worker reference', () => {
        initPWA();
        const wb = instances[0];

        skipWaiting();

        expect(wb.messageSkipWaiting).toHaveBeenCalledTimes(1);
    });
});
