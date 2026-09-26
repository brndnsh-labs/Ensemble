/**
 * Privacy-preserving Umami analytics for the v2 stand (#1389). Moved here from
 * `public/telemetry.ts` (#1358 retired that caller): telemetry is UI-host code, not engine
 * library, so it lives beside the app that actually calls it rather than in `public/`.
 *
 * Privacy contract (unchanged from v1):
 * - An allow-listed, typed event vocabulary. No free-form payloads, and never a chart title,
 *   chord content, account id or email.
 * - Every payload's `url` is `location.pathname` and `referrer` is always `''` — v2 carries a
 *   shared chart in the `#chart=` fragment, so the pathname-only rule keeps it (and the query
 *   string, and any real referrer) out of every request.
 * - `data-do-not-track="true"`, `autoTrack`/`autoPageview` off, `referrerPolicy: strict-origin`.
 * - Installed only on the canonical host, in a build made for production. Never on ensembletest,
 *   local dev, the Playwright export, or a render-bridge build.
 * - The tracker is optional: a blocked or failed script never affects the app. Bounded queue
 *   before it loads (or if it never does).
 * - Never precached by the offline service worker (`scripts/offline.mjs`'s asset list is
 *   same-origin only) — an offline visit simply sends nothing.
 */
const UMAMI_HOST = 'https://umami.brndn.zip';
const ENSEMBLE_HOST = 'ensemble.brndn.zip';
const WEBSITE_ID = '3b7ffbc5-a7bd-4dcd-9587-8eef4053c0ad';
const MAX_QUEUED_EVENTS = 32;

type TelemetryData = Record<string, string | number | boolean>;

interface TelemetryEventData {
    session_class: { device: 'mobile' | 'tablet' | 'desktop' };
    play_started: undefined;
    genre_changed: { genre: string };
    part_toggled: { part: 'drums' | 'bass' | 'chords' | 'harmony' | 'soloist' };
    chart_opened: { source: 'songbook' | 'import' };
    chart_created: undefined;
    chart_imported: { format: 'ireal' | 'v1' | 'file' };
    share_created: undefined;
    share_opened: { legacy: boolean };
    account_signed_in: undefined;
    account_registered: undefined;
    sync_conflict_shown: undefined;
    midi_exported: undefined;
    wav_exported: { stems: boolean };
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

/**
 * The one test-only escape hatch (#1389 Acceptance), read by nothing but this module. It is set
 * by Playwright's `page.addInitScript` — which runs before ANY page script, including this one —
 * never by a URL, hash or query string, so no real visitor can set it from a link the way a
 * `?debug=1`-style switch could be used to enable/disable or redirect tracking. Checked in
 * `initializeTelemetry` only; nothing downstream trusts it.
 */
interface TelemetryTestWindow extends Window {
    __ENSEMBLE_TELEMETRY_TEST_OVERRIDE__?: boolean;
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
            // Populate Umami's overview without sending shared arrangement data from the
            // hash (v2 carries a chart in `#chart=`) or an unrelated referrer.
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

/** Install the external tracker only in a real production visit on the canonical host. */
export function initializeTelemetry(): void {
    if (initialized || typeof window === 'undefined') {
        return;
    }
    initialized = true;

    const testOverride =
        (window as TelemetryTestWindow).__ENSEMBLE_TELEMETRY_TEST_OVERRIDE__ === true;
    // The build-time flag is the always-DEFINED `NEXT_PUBLIC_TELEMETRY` (mirrors
    // `NEXT_PUBLIC_RENDER_BRIDGE`, `next.config.mjs`) — an unset `NEXT_PUBLIC_*` would stay a
    // runtime lookup instead of a value Next inlines. The same `ensemble-web` image is released
    // to prod AND ensembletest (one build, two hosts), so the hostname check is what keeps the
    // test host silent; the build flag alone only rules out dev, the Playwright export and a
    // render-bridge build, which never set it.
    if (
        !testOverride &&
        (process.env.NEXT_PUBLIC_TELEMETRY !== '1' || location.hostname !== ENSEMBLE_HOST)
    ) {
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
}

/** Record one aggregate, allow-listed event. Calls are no-ops outside a production visit. */
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
