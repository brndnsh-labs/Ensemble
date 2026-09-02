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
        scriptURL: string;
        options: unknown;

        constructor(scriptURL: string, options: unknown) {
            this.scriptURL = scriptURL;
            this.options = options;
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

import {
    initPWA,
    skipWaiting,
    syncInstallButtonVisibility,
    triggerInstall,
} from '../../public/pwa.js';
import { ACTIONS } from '../../public/types.js';

interface MockBeforeInstallPromptEvent extends Event {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function createInstallPromptEvent(outcome: 'accepted' | 'dismissed'): MockBeforeInstallPromptEvent {
    const event = new Event('beforeinstallprompt') as MockBeforeInstallPromptEvent;
    const choice = { outcome, platform: 'web' };
    event.prompt = vi.fn(() => Promise.resolve(choice));
    event.userChoice = Promise.resolve(choice);
    return event;
}

describe('initPWA — workbox-window wiring', () => {
    beforeEach(() => {
        dispatchMock.mockClear();
        instances.length = 0;
        document.body.innerHTML = '<button id="installAppBtn" style="display: none"></button>';
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

    it.each([
        ['accepted', true],
        ['dismissed', false],
    ] as const)(
        'consumes an %s install prompt, hides the button, and rejects reuse',
        async (outcome, expectedResult) => {
            initPWA();
            const installButton = document.getElementById('installAppBtn');
            const promptEvent = createInstallPromptEvent(outcome);

            window.dispatchEvent(promptEvent);
            expect(installButton?.style.display).toBe('flex');

            await expect(triggerInstall()).resolves.toBe(expectedResult);
            expect(promptEvent.prompt).toHaveBeenCalledTimes(1);
            expect(installButton?.style.display).toBe('none');

            await expect(triggerInstall()).resolves.toBe(false);
            expect(promptEvent.prompt).toHaveBeenCalledTimes(1);
        },
    );

    it('rejects a second call while the first prompt choice is still pending', async () => {
        initPWA();
        let resolveChoice:
            | ((choice: { outcome: 'accepted'; platform: string }) => void)
            | undefined;
        const promptEvent = createInstallPromptEvent('accepted');
        promptEvent.prompt = vi.fn(
            () =>
                new Promise((resolve) => {
                    resolveChoice = resolve;
                }),
        );

        window.dispatchEvent(promptEvent);
        const firstInstall = triggerInstall();

        await expect(triggerInstall()).resolves.toBe(false);
        expect(promptEvent.prompt).toHaveBeenCalledTimes(1);

        resolveChoice?.({ outcome: 'accepted', platform: 'web' });
        await expect(firstInstall).resolves.toBe(true);
    });

    it('shows a prompt captured before the install button mounts', () => {
        initPWA();
        document.body.innerHTML = '';
        window.dispatchEvent(createInstallPromptEvent('accepted'));

        document.body.innerHTML = '<button id="installAppBtn" style="display: none"></button>';
        syncInstallButtonVisibility();

        expect(document.getElementById('installAppBtn')?.style.display).toBe('flex');
    });

    it('re-enables installation when a later beforeinstallprompt event arrives', async () => {
        initPWA();
        const installButton = document.getElementById('installAppBtn');
        const dismissedPrompt = createInstallPromptEvent('dismissed');
        const laterPrompt = createInstallPromptEvent('accepted');

        window.dispatchEvent(dismissedPrompt);
        await expect(triggerInstall()).resolves.toBe(false);
        expect(installButton?.style.display).toBe('none');

        window.dispatchEvent(laterPrompt);
        expect(installButton?.style.display).toBe('flex');
        await expect(triggerInstall()).resolves.toBe(true);
        expect(laterPrompt.prompt).toHaveBeenCalledTimes(1);
        expect(installButton?.style.display).toBe('none');
    });
});
