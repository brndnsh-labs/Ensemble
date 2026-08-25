/**
 * @vitest-environment happy-dom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

type Payload = Record<string, unknown>;

afterEach(() => {
    document.head.querySelector('#umami-telemetry')?.remove();
    delete (window as Window & { umami?: unknown }).umami;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
});

async function initializeAt(mode: string, url: string, width = 1280) {
    vi.stubEnv('MODE', mode);
    vi.stubGlobal('location', new URL(url));
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    let appendedScript: HTMLScriptElement | undefined;
    const append = vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
        appendedScript = nodes.find(
            (node): node is HTMLScriptElement => node instanceof HTMLScriptElement,
        );
    });

    const telemetry = await import('../../public/telemetry.js');
    telemetry.initializeTelemetry();
    return { telemetry, appendedScript, append };
}

describe('telemetry', () => {
    it('does not install the tracker in a test build', async () => {
        const { append } = await initializeAt('test', 'https://ensemble.brndn.zip/');

        expect(append).not.toHaveBeenCalled();
    });

    it('does not install the tracker on the local E2E host', async () => {
        const { append } = await initializeAt('production', 'http://127.0.0.1:4173/');

        expect(append).not.toHaveBeenCalled();
    });

    it('sends one safe manual pageview before the queued custom events', async () => {
        const { telemetry, appendedScript: script } = await initializeAt(
            'production',
            'https://ensemble.brndn.zip/session?bnd=private-chart-data&autoplay=1#secret',
            500,
        );

        expect(script?.src).toBe('https://umami.brndn.zip/telemetry.js');
        expect(script?.dataset.websiteId).toBe('3b7ffbc5-a7bd-4dcd-9587-8eef4053c0ad');
        expect(script?.dataset.domains).toBe('ensemble.brndn.zip');
        expect(script?.dataset.autoTrack).toBe('false');
        expect(script?.dataset.autoPageview).toBe('false');
        expect(script?.dataset.doNotTrack).toBe('true');

        telemetry.track('genre_changed', { genre: 'Jazz' });

        const payloads: Payload[] = [];
        const client = {
            track: vi.fn((buildPayload: (defaults: Payload) => Payload) => {
                payloads.push(
                    buildPayload({
                        url: '/session?bnd=private-chart-data',
                        referrer: 'https://teacher.example/song?student=name',
                    }),
                );
            }),
        };
        (window as Window & { umami?: typeof client }).umami = client;
        script?.dispatchEvent(new Event('load'));
        telemetry.trackPlaybackTransition('TOGGLE_PLAY', true);
        telemetry.trackPlaybackTransition('TOGGLE_PLAY', false);
        telemetry.trackPlaybackTransition('SET_BPM', true);

        expect(payloads).toEqual([
            expect.objectContaining({
                url: '/session',
                referrer: '',
            }),
            expect.objectContaining({
                name: 'session_class',
                url: '/session',
                referrer: '',
                data: { device: 'mobile' },
            }),
            expect.objectContaining({
                name: 'share_opened',
                url: '/session',
                referrer: '',
                data: { audition: true },
            }),
            expect.objectContaining({
                name: 'genre_changed',
                url: '/session',
                referrer: '',
                data: { genre: 'Jazz' },
            }),
            expect.objectContaining({
                name: 'play_started',
                url: '/session',
                referrer: '',
            }),
        ]);
        expect(payloads[0]).not.toHaveProperty('name');
        expect(JSON.stringify(payloads)).not.toContain('private-chart-data');
        expect(JSON.stringify(payloads)).not.toContain('student=name');
    });

    it('keeps allow-listed Style Gallery landings out of share-open counts', async () => {
        const { appendedScript: script } = await initializeAt(
            'production',
            'https://ensemble.brndn.zip/?prog=I-IV-V&gallery=jazz-blues-bb',
        );
        const names: Array<string | undefined> = [];
        const client = {
            track: (buildPayload: (defaults: Payload) => Payload) => {
                names.push(buildPayload({}).name as string | undefined);
            },
        };
        (window as Window & { umami?: typeof client }).umami = client;
        script?.dispatchEvent(new Event('load'));

        expect(names).toEqual([undefined, 'session_class']);
    });

    it('drops queued and future events when the tracker fails to load', async () => {
        const { telemetry, appendedScript: script } = await initializeAt(
            'production',
            'https://ensemble.brndn.zip/?s=private-chart-data',
        );
        script?.dispatchEvent(new Event('error'));

        const track = vi.fn();
        (window as Window & { umami?: { track: typeof track } }).umami = { track };
        expect(() => telemetry.track('play_started')).not.toThrow();
        expect(track).not.toHaveBeenCalled();
    });
});
