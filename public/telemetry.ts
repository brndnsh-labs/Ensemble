const UMAMI_HOST = 'https://umami.brndn.zip';
const ENSEMBLE_HOST = 'ensemble.brndn.zip';
const WEBSITE_ID = '3b7ffbc5-a7bd-4dcd-9587-8eef4053c0ad';
const MAX_QUEUED_EVENTS = 32;
const STYLE_GALLERY_SLUGS: ReadonlySet<string> = new Set([
    'jazz-blues-bb',
    'autumn-jazz',
    'bossa-nova-morning',
    'neo-soul-sunset',
    'funk-soul-vamp',
    'lo-fi-study-loop',
    'stadium-rock',
    'ska-punk-skank',
    'power-metal-core',
    'country-two-step',
    'campfire-folk',
    'flamenco-fusion',
]);

type TelemetryData = Record<string, string | number | boolean>;

interface TelemetryEventData {
    play_started: undefined;
    genre_changed: { genre: string };
    instrument_toggled: {
        instrument: 'drums' | 'bass' | 'chords' | 'harmony' | 'soloist';
    };
    preset_loaded:
        | { source: 'built-in'; name: string; mode: 'replace' | 'append' }
        | { source: 'user'; mode: 'replace' | 'append' };
    style_gallery_link: { slug: string };
    share_copied: { audition: boolean };
    share_sent: { audition: boolean };
    share_opened: { audition: boolean };
    export_midi: undefined;
    export_wav: { stems: boolean };
    manual_opened: undefined;
    visualizer_opened: undefined;
    session_class: { device: 'mobile' | 'tablet' | 'desktop' };
}

type TelemetryEventName = keyof TelemetryEventData;

interface QueuedEvent {
    name: TelemetryEventName;
    data?: TelemetryData;
}

interface UmamiPayload extends Record<string, unknown> {
    name?: string;
    url?: string;
    referrer?: string;
    data?: TelemetryData;
}

interface UmamiClient {
    track: (buildPayload: (defaults: UmamiPayload) => UmamiPayload) => undefined | Promise<unknown>;
}

let initialized = false;
let enabled = false;
const queue: QueuedEvent[] = [];

function getUmamiClient(): UmamiClient | undefined {
    return (window as Window & { umami?: UmamiClient }).umami;
}

function sendPageview(client: UmamiClient): void {
    try {
        const request = client.track((defaults) => ({
            ...defaults,
            // Populate Umami's overview without sending shared arrangement data
            // from the query string, hash, or referrer.
            url: location.pathname,
            referrer: '',
        }));
        if (request) {
            void request.catch(() => {});
        }
    } catch {
        // Analytics is optional. A blocked/broken tracker must never affect the app.
    }
}

function send(client: UmamiClient, event: QueuedEvent): void {
    try {
        const request = client.track((defaults) => ({
            ...defaults,
            name: event.name,
            // Shared arrangements live in the query string. Never let those
            // contents (or the hash/referrer) cross the telemetry boundary.
            url: location.pathname,
            referrer: '',
            ...(event.data ? { data: event.data } : {}),
        }));
        if (request) {
            void request.catch(() => {});
        }
    } catch {
        // Analytics is optional. A blocked/broken tracker must never affect the app.
    }
}

function classifyDevice(): 'mobile' | 'tablet' | 'desktop' {
    if (window.innerWidth < 640) {
        return 'mobile';
    }
    if (window.innerWidth < 1024) {
        return 'tablet';
    }
    return 'desktop';
}

export function isStyleGallerySlug(slug: string | null): slug is string {
    return slug !== null && STYLE_GALLERY_SLUGS.has(slug);
}

function isSharedSession(params: URLSearchParams): boolean {
    // Curated manual links also carry arrangement data. Keep that known funnel
    // distinct from person-to-person shares instead of double-counting both.
    if (isStyleGallerySlug(params.get('gallery'))) {
        return false;
    }
    return params.has('s') || params.has('prog') || params.has('bnd');
}

/** Install the external tracker only in a real production visit. */
export function initializeTelemetry(): void {
    if (initialized || typeof window === 'undefined') {
        return;
    }
    initialized = true;

    // `build:e2e` also uses Vite's production mode, so the canonical hostname
    // check is the second half of the no-dev/no-test contract.
    if (import.meta.env.MODE !== 'production' || location.hostname !== ENSEMBLE_HOST) {
        return;
    }

    enabled = true;
    const script = document.createElement('script');
    script.id = 'umami-telemetry';
    script.src = `${UMAMI_HOST}/telemetry.js`;
    script.async = true;
    script.referrerPolicy = 'strict-origin';
    script.dataset.websiteId = WEBSITE_ID;
    script.dataset.domains = ENSEMBLE_HOST;
    script.dataset.autoTrack = 'false';
    script.dataset.autoPageview = 'false';
    script.dataset.doNotTrack = 'true';

    script.addEventListener('load', () => {
        const client = getUmamiClient();
        if (!client) {
            enabled = false;
            queue.length = 0;
            return;
        }

        sendPageview(client);
        const pending = queue.splice(0);
        for (const event of pending) {
            send(client, event);
        }
    });
    script.addEventListener('error', () => {
        enabled = false;
        queue.length = 0;
    });
    document.head.append(script);

    track('session_class', { device: classifyDevice() });
    const params = new URLSearchParams(location.search);
    if (isSharedSession(params)) {
        track('share_opened', { audition: params.get('autoplay') === '1' });
    }
}

/** Record one aggregate, allow-listed event. Calls are no-ops outside production. */
export function track<Name extends TelemetryEventName>(
    name: Name,
    ...args: TelemetryEventData[Name] extends undefined ? [] : [data: TelemetryEventData[Name]]
): void {
    if (!enabled) {
        return;
    }

    const event: QueuedEvent = {
        name,
        ...(args[0] ? { data: args[0] as TelemetryData } : {}),
    };
    const client = getUmamiClient();
    if (client) {
        send(client, event);
        return;
    }

    if (queue.length < MAX_QUEUED_EVENTS) {
        queue.push(event);
    }
}

/** Count every playback entry point once, after its reducer confirms a start. */
export function trackPlaybackTransition(action: string, isPlaying: boolean): void {
    if (action === 'TOGGLE_PLAY' && isPlaying) {
        track('play_started');
    }
}
