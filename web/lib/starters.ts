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

/**
 * Boots the runtime and reads the guest songbook HOME alongside it (#1441) — not the whole
 * library, which the home page never needs and which costs seconds at a large size. The two run
 * together: neither depends on the other, and first paint waits on both.
 *
 * Used to seed 3 sample songs into an empty guest songbook; #1439 retired that seeding in favor
 * of the read-only standards catalog (`lib/standards.ts`), which is never written to storage and
 * so is identical for every guest and account. A device that already saved one of the old
 * `starter-*` documents keeps it — that's the musician's own song now, not special-cased by id.
 */
let boot: Promise<HomeSlice> | undefined;
export function start(): Promise<HomeSlice> {
    if (!boot) {
        boot = Promise.all([runtime.initialize(), readGuestHome()]).then(([, home]) => home);
    }
    return boot;
}
