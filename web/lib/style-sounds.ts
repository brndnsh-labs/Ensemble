/**
 * The style's own sounds, fetched in the background when the band plays (#1997, DECISION
 * 2026-11-01, Brandon: "install sounds on first launch, or at least prompt"). This reverses
 * #1405's "Follow feel never downloads by itself": a lane on Follow feel still plays only what
 * this device has installed, but Play (and a style change) now installs what the style wants.
 *
 * The band starts on the built-in sounds as before; the packs download behind it, and once they
 * are ready the runtime moves the Follow-feel lanes over at a barline without stopping
 * (`runtime.ts`'s `switchToArrivedSounds`). Nothing here touches a lane pinned to a sound, so a
 * chart saved with Built-in chosen by hand keeps it.
 *
 * - **Save-Data** (`navigator.connection.saveData`): nothing downloads by itself; the stand offers
 *   one tap instead, with the size.
 * - **The device preference** (`autoSoundsPreference`, the Players tab's switch) turns it off
 *   altogether: no download and no offer. Install all stays the explicit gesture.
 * - **No Cache Storage** (blocked storage, #1982): skipped quietly; the built-in sounds play.
 * - **A failure** is quiet, and the next Play or style change tries again; only a download the
 *   musician asked for (the offer's button) says why it failed.
 *
 * The policy lives here, apart from the runtime, with the runtime's three facts handed in, so it
 * can be tested without a band.
 */
import { SOUND_PACKS } from '@core/data/sound-packs';
import { autoSoundsPreference } from './session';
import { DOWNLOAD_FAILED } from './sounds';

/** What the stand shows about the style's sounds. */
export type StyleSoundsStatus =
    | { kind: 'idle' }
    | { kind: 'fetching' }
    /** Save-Data is on (or a download the musician asked for failed): one tap gets them. */
    | { kind: 'offer'; mb: number; error?: string };

export interface StyleSoundsHost {
    /** The packs the style wants on its Follow-feel lanes that this device has not installed. */
    wanted(): string[];
    /** Download, verify and decode one pack (`prepareSound`); throws on failure. */
    prepare(id: string): Promise<void>;
    /** Some packs arrived: move the Follow-feel lanes onto them (at a barline while playing). */
    arrived(): Promise<void>;
}

/** The browser's Save-Data hint (Chromium's Network Information API; absent elsewhere). */
function saveData(): boolean {
    try {
        const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
            .connection;
        return connection?.saveData === true;
    } catch {
        return false;
    }
}

/** Can this browser keep a pack? Blocked storage either hides Cache Storage or refuses it. */
async function cacheAvailable(): Promise<boolean> {
    try {
        if (typeof caches === 'undefined') {
            return false;
        }
        await caches.keys();
        return true;
    } catch {
        return false;
    }
}

const sizeOf = (ids: readonly string[]) =>
    ids.reduce((mb, id) => mb + (SOUND_PACKS.find((pack) => pack.id === id)?.approxSizeMB ?? 0), 0);

export function createStyleSounds(host: StyleSoundsHost) {
    let status: StyleSoundsStatus = { kind: 'idle' };
    const listeners = new Set<() => void>();
    let running: Promise<void> | null = null;
    /** A request that came in while one was running: run once more after it. */
    let again: { asked: boolean } | null = null;
    /** "Not now" on the offer: no offer again until the page reloads. */
    let declined = false;

    function publish(next: StyleSoundsStatus): void {
        status = next;
        for (const listener of listeners) {
            listener();
        }
    }

    async function run(asked: boolean): Promise<void> {
        if (!asked && !autoSoundsPreference()) {
            publish({ kind: 'idle' });
            return;
        }
        if (!(await cacheAvailable())) {
            // Storage is blocked: there is nowhere to keep a pack, so play on built-in quietly.
            publish({ kind: 'idle' });
            return;
        }
        const wanted = host.wanted();
        if (wanted.length === 0) {
            publish({ kind: 'idle' });
            return;
        }
        if (!asked && saveData()) {
            publish(declined ? { kind: 'idle' } : { kind: 'offer', mb: sizeOf(wanted) });
            return;
        }
        publish({ kind: 'fetching' });
        let ready = 0;
        let failure: unknown = null;
        for (const id of wanted) {
            // A style changed meanwhile: a pack the band no longer wants is not fetched.
            if (!host.wanted().includes(id)) {
                continue;
            }
            try {
                await host.prepare(id);
                ready++;
            } catch (error) {
                // One pack that fails is one lane that stays on built-in; the rest still land.
                failure ??= error;
            }
        }
        if (ready > 0) {
            try {
                await host.arrived();
            } catch {
                // The lanes stay as they were; the next Play resolves them again.
            }
        }
        if (failure && asked) {
            const left = host.wanted();
            publish(
                left.length
                    ? {
                          kind: 'offer',
                          mb: sizeOf(left),
                          error:
                              failure instanceof Error && failure.message
                                  ? failure.message
                                  : DOWNLOAD_FAILED,
                      }
                    : { kind: 'idle' },
            );
            return;
        }
        // A quiet failure: the next Play or style change asks again.
        publish({ kind: 'idle' });
    }

    /**
     * Fetch the playing style's sounds now, in the background. `asked`: the musician pressed the
     * offer's button, so Save-Data and the preference step aside and a failure is said.
     */
    function request(asked = false): Promise<void> {
        if (asked) {
            declined = false;
        }
        if (running) {
            again = { asked: asked || (again?.asked ?? false) };
            return running;
        }
        running = (async () => {
            try {
                await run(asked);
                while (again) {
                    const next = again;
                    again = null;
                    await run(next.asked);
                }
            } finally {
                running = null;
            }
        })();
        return running;
    }

    return {
        request,
        /** "Not now": the offer goes away until the page reloads (or the musician asks). */
        decline(): void {
            declined = true;
            if (status.kind === 'offer') {
                publish({ kind: 'idle' });
            }
        },
        status: (): StyleSoundsStatus => status,
        subscribe(listener: () => void): () => void {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}
