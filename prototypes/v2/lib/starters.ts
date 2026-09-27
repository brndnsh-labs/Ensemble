import * as repository from './repository';
import type { ChartDocument } from './runtime';
import * as runtime from './runtime';

/**
 * Boots the runtime and returns the library. Used to seed 3 sample songs into an empty guest
 * songbook (`starter-blues`/`starter-jazz`/`starter-bossa`); #1439 retired that seeding in favor
 * of the read-only standards catalog (`lib/standards.ts`), which is never written to storage and
 * so is identical for every guest and account. A device that already saved one of the old
 * `starter-*` documents keeps it — that's the musician's own song now, not special-cased by id
 * anywhere (no more Quick Jam filter). This function just boots the runtime and hands back
 * whatever is already on this device.
 */
let boot: Promise<ChartDocument[]> | undefined;
export function start(): Promise<ChartDocument[]> {
    if (!boot) {
        boot = (async () => {
            await runtime.initialize();
            return repository.list();
        })();
    }
    return boot;
}
