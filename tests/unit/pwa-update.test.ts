// @vitest-environment happy-dom
//
// #1046 — the section-practice deploy tonight surfaced a real race in the
// update-toast logic: rapid successive service-worker updates (a run of quick
// TEST redeploys during a by-ear/UI audition loop) can leave a genuinely
// `installed` worker's transition unflagged. See public/pwa.ts for the full
// writeup.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatchMock } = vi.hoisted(() => ({ dispatchMock: vi.fn() }));
vi.mock('../../public/state.js', () => ({ dispatch: dispatchMock }));

import { initPWA } from '../../public/pwa.js';
import { ACTIONS } from '../../public/types.js';

function makeWorker(state: string) {
    const listeners: Array<() => void> = [];
    return {
        state,
        postMessage: vi.fn(),
        addEventListener: (type: string, cb: () => void) => {
            if (type === 'statechange') {
                listeners.push(cb);
            }
        },
        fireStateChange() {
            for (const cb of listeners) {
                cb();
            }
        },
    };
}

describe('initPWA — overlapping service-worker updates', () => {
    beforeEach(() => {
        dispatchMock.mockClear();
        Object.defineProperty(window, 'location', {
            writable: true,
            configurable: true,
            value: { hostname: 'ensembletest.brndn.zip' },
        });
        // happy-dom reports navigator.webdriver === true by default, which
        // would otherwise short-circuit initPWA's SW-registration gate.
        Object.defineProperty(navigator, 'webdriver', {
            configurable: true,
            value: false,
        });
    });

    it('flags an update for the worker that actually reached installed, even when a second update starts installing before the first settles', async () => {
        let updatefoundHandler: (() => void) | undefined;
        const reg = {
            installing: null as ReturnType<typeof makeWorker> | null,
            waiting: null,
            update: vi.fn(),
            addEventListener: (type: string, cb: () => void) => {
                if (type === 'updatefound') {
                    updatefoundHandler = cb;
                }
            },
        };
        const swContainer = {
            controller: {},
            register: vi.fn(() => Promise.resolve(reg)),
            addEventListener: vi.fn(),
        };
        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: swContainer,
        });

        initPWA();
        // Flush the register().then(...) microtask.
        await Promise.resolve();
        await Promise.resolve();

        const workerB = makeWorker('installing');
        reg.installing = workerB;
        updatefoundHandler?.();

        // A second, newer update starts installing before B's statechange fires
        // — the rapid-redeploy scenario (a run of quick TEST deploys).
        const workerC = makeWorker('installing');
        reg.installing = workerC;
        updatefoundHandler?.();

        // B actually finishes installing. The stale-shared-variable bug would
        // read `newWorker.state` here — which by now points at C, still
        // `installing` — and silently miss this real transition.
        workerB.state = 'installed';
        workerB.fireStateChange();

        expect(dispatchMock).toHaveBeenCalledWith(ACTIONS.SET_UPDATE_AVAILABLE, true);
    });

    it('flags an update immediately if the worker already reached installed before the listener attached', async () => {
        let updatefoundHandler: (() => void) | undefined;
        const reg = {
            installing: null as ReturnType<typeof makeWorker> | null,
            waiting: null,
            update: vi.fn(),
            addEventListener: (type: string, cb: () => void) => {
                if (type === 'updatefound') {
                    updatefoundHandler = cb;
                }
            },
        };
        const swContainer = {
            controller: {},
            register: vi.fn(() => Promise.resolve(reg)),
            addEventListener: vi.fn(),
        };
        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: swContainer,
        });

        initPWA();
        await Promise.resolve();
        await Promise.resolve();

        // Already `installed` by the time updatefound is observed (a fast,
        // fully-cached install) — the MDN-documented missed-transition race.
        const worker = makeWorker('installed');
        reg.installing = worker;
        updatefoundHandler?.();

        expect(dispatchMock).toHaveBeenCalledWith(ACTIONS.SET_UPDATE_AVAILABLE, true);
    });
});
