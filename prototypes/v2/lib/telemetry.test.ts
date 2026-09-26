// @vitest-environment happy-dom
/**
 * The v2 Umami gate (#1389). Explicit `describe`/`expect`/`it`/`vi` imports, not the root
 * config's `globals: true` — the v2 build typechecks this file (`tsc --noEmit` over
 * `prototypes/v2`), which has no ambient Vitest globals.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type Payload = Record<string, unknown>;

afterEach(() => {
    document.head.querySelector('#umami-telemetry')?.remove();
    delete (window as Window & { umami?: unknown }).umami;
    delete (window as Window & { __ENSEMBLE_TELEMETRY_TEST_OVERRIDE__?: boolean })
        .__ENSEMBLE_TELEMETRY_TEST_OVERRIDE__;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
});

async function initializeAt(options: {
    telemetryFlag?: string;
    url: string;
    width?: number;
    testOverride?: boolean;
}) {
    vi.stubEnv('NEXT_PUBLIC_TELEMETRY', options.telemetryFlag);
    vi.stubGlobal('location', new URL(options.url));
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: options.width ?? 1280,
    });
    if (options.testOverride) {
        (
            window as Window & { __ENSEMBLE_TELEMETRY_TEST_OVERRIDE__?: boolean }
        ).__ENSEMBLE_TELEMETRY_TEST_OVERRIDE__ = true;
    }
    let appendedScript: HTMLScriptElement | undefined;
    const append = vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
        appendedScript = nodes.find(
            (node): node is HTMLScriptElement => node instanceof HTMLScriptElement,
        );
    });

    const telemetry = await import('./telemetry');
    telemetry.initializeTelemetry();
    return { telemetry, appendedScript, append };
}

describe('initializeTelemetry gate', () => {
    it('does not install the tracker when the build flag is off, even on the canonical host', async () => {
        const { append } = await initializeAt({
            telemetryFlag: undefined,
            url: 'https://ensemble.brndn.zip/',
        });
        expect(append).not.toHaveBeenCalled();
    });

    it('does not install the tracker on ensembletest, even with the build flag on', async () => {
        // The SAME `ensemble-web` image ships to prod and ensembletest — the build flag can't
        // tell them apart, only the hostname can.
        const { append } = await initializeAt({
            telemetryFlag: '1',
            url: 'https://ensembletest.brndn.zip/',
        });
        expect(append).not.toHaveBeenCalled();
    });

    it('does not install the tracker on local/dev hosts', async () => {
        const { append } = await initializeAt({
            telemetryFlag: '1',
            url: 'http://127.0.0.1:4173/',
        });
        expect(append).not.toHaveBeenCalled();
    });

    it('installs the tracker with the correct, privacy-safe script attributes on the real build+host', async () => {
        const { appendedScript: script } = await initializeAt({
            telemetryFlag: '1',
            url: 'https://ensemble.brndn.zip/session#chart=private-arrangement-data',
        });
        expect(script?.src).toBe('https://umami.brndn.zip/telemetry.js');
        expect(script?.id).toBe('umami-telemetry');
        expect(script?.async).toBe(true);
        expect(script?.referrerPolicy).toBe('strict-origin');
        expect(script?.dataset.websiteId).toBe('3b7ffbc5-a7bd-4dcd-9587-8eef4053c0ad');
        expect(script?.dataset.domains).toBe('ensemble.brndn.zip');
        expect(script?.dataset.autoTrack).toBe('false');
        expect(script?.dataset.autoPageview).toBe('false');
        expect(script?.dataset.doNotTrack).toBe('true');
    });

    it('the test override bypasses both the build flag and the hostname check', async () => {
        // Playwright's `page.addInitScript` sets this before any page script runs — never
        // reachable from a URL/hash/query string the way a debug switch would be.
        const { appendedScript: script } = await initializeAt({
            telemetryFlag: undefined,
            url: 'http://127.0.0.1:4173/',
            testOverride: true,
        });
        expect(script?.src).toBe('https://umami.brndn.zip/telemetry.js');
    });
});

describe('payload shape', () => {
    it('sends a pathname-only, empty-referrer pageview, then flushes queued events the same way', async () => {
        const { telemetry, appendedScript: script } = await initializeAt({
            telemetryFlag: '1',
            url: 'https://ensemble.brndn.zip/session#chart=private-arrangement-data',
            width: 500,
        });

        telemetry.track('genre_changed', { genre: 'Jazz' });

        const payloads: Payload[] = [];
        const client = {
            track: vi.fn((buildPayload: (defaults: Payload) => Payload) => {
                payloads.push(
                    buildPayload({
                        url: '/session#chart=private-arrangement-data',
                        referrer: 'https://teacher.example/song?student=name',
                    }),
                );
            }),
        };
        (window as Window & { umami?: typeof client }).umami = client;
        script?.dispatchEvent(new Event('load'));
        telemetry.track('play_started');

        expect(payloads).toEqual([
            expect.objectContaining({ url: '/session', referrer: '' }),
            expect.objectContaining({
                name: 'session_class',
                url: '/session',
                referrer: '',
                data: { device: 'mobile' },
            }),
            expect.objectContaining({
                name: 'genre_changed',
                url: '/session',
                referrer: '',
                data: { genre: 'Jazz' },
            }),
            expect.objectContaining({ name: 'play_started', url: '/session', referrer: '' }),
        ]);
        expect(payloads[0]).not.toHaveProperty('name');
        expect(JSON.stringify(payloads)).not.toContain('private-arrangement-data');
        expect(JSON.stringify(payloads)).not.toContain('student=name');
    });

    it('sends an event straight through once the client is already installed', async () => {
        const { telemetry, appendedScript: script } = await initializeAt({
            telemetryFlag: '1',
            url: 'https://ensemble.brndn.zip/',
        });
        const payloads: Payload[] = [];
        const client = {
            track: vi.fn((buildPayload: (defaults: Payload) => Payload) => {
                payloads.push(buildPayload({}));
            }),
        };
        (window as Window & { umami?: typeof client }).umami = client;
        script?.dispatchEvent(new Event('load'));
        payloads.length = 0;

        telemetry.track('chart_opened', { source: 'songbook' });
        expect(payloads).toEqual([
            expect.objectContaining({ name: 'chart_opened', data: { source: 'songbook' } }),
        ]);
    });

    it('drops queued and future events when the tracker fails to load', async () => {
        const { telemetry, appendedScript: script } = await initializeAt({
            telemetryFlag: '1',
            url: 'https://ensemble.brndn.zip/',
        });
        script?.dispatchEvent(new Event('error'));

        const track = vi.fn();
        (window as Window & { umami?: { track: typeof track } }).umami = { track };
        expect(() => telemetry.track('play_started')).not.toThrow();
        expect(track).not.toHaveBeenCalled();
    });

    it('bounds the pre-load queue rather than growing it without limit', async () => {
        const { telemetry, appendedScript: script } = await initializeAt({
            telemetryFlag: '1',
            url: 'https://ensemble.brndn.zip/',
        });
        for (let i = 0; i < 64; i++) {
            telemetry.track('chart_created');
        }
        const payloads: Payload[] = [];
        const client = {
            track: vi.fn((buildPayload: (defaults: Payload) => Payload) => {
                payloads.push(buildPayload({}));
            }),
        };
        (window as Window & { umami?: typeof client }).umami = client;
        script?.dispatchEvent(new Event('load'));

        // The pageview plus at most MAX_QUEUED_EVENTS (32) queued `chart_created` events —
        // never all 64 that were attempted before load.
        expect(payloads.length).toBeLessThan(64);
        expect(payloads.filter((p) => p.name === 'chart_created').length).toBeLessThanOrEqual(32);
    });
});
