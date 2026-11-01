import { type HomeSlice, homeRequest } from './home';
import * as repository from './repository';
import * as runtime from './runtime';
import { lastOpenedSong, openedAtMap } from './session';

/**
 * The guest songbook home as this device's own storage describes it (#1441): the Continue song,
 * the recently opened ones by id and the count — never the whole songbook. Module-level, reading
 * only `localStorage` and the guest store, so the shell can re-read it from an effect.
 */
export function readGuestHome(): Promise<HomeSlice> {
    return repository.home(homeRequest(openedAtMap(), lastOpenedSong()));
}

/** What boot hands the shell: the home, and whether the songbook could be read at all. */
export interface Boot {
    home: HomeSlice;
    /** True when the songbook read failed (storage blocked): the home is empty and nothing saves. */
    savingOff: boolean;
}

/** A songbook with nothing in it, for a browser whose storage cannot be read (#1982). */
const EMPTY_HOME: HomeSlice = { count: 0, gone: 0, continued: null, rows: [], unreadable: 0 };

/**
 * Boots the runtime and reads the guest songbook HOME alongside it (#1441) — not the whole
 * library, which the home page never needs and which costs seconds at a large size. The two run
 * together: neither depends on the other, and first paint waits on both.
 *
 * Storage that cannot be read (blocked cookies/site data, a private window that refuses
 * IndexedDB) must not keep the band from playing: the standards catalog needs no storage, so the
 * songbook read failing boots an empty songbook with `savingOff` instead of a rejection (#1982).
 * A runtime failure is a real boot failure and rejects; and a rejection is never remembered, so a
 * later `start()` tries again rather than answering every caller with the first failure.
 *
 * Used to seed 3 sample songs into an empty guest songbook; #1439 retired that seeding in favor
 * of the read-only standards catalog (`lib/standards.ts`), which is never written to storage and
 * so is identical for every guest and account. A device that already saved one of the old
 * `starter-*` documents keeps it — that's the musician's own song now, not special-cased by id.
 */
let boot: Promise<Boot> | undefined;
export function start(): Promise<Boot> {
    if (!boot) {
        const booting = Promise.all([
            runtime.initialize(),
            readGuestHome().then(
                (home): Boot => ({ home, savingOff: false }),
                (): Boot => ({ home: EMPTY_HOME, savingOff: true }),
            ),
        ]).then(([, result]) => result);
        boot = booting;
        booting.catch(() => {
            if (boot === booting) {
                boot = undefined;
            }
        });
    }
    return boot;
}
