// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * State Integrity Audit:
 * This test ensures that every ACTION defined in public/types.ts
 * is both dispatched (by a component or controller) and handled (by a state slice).
 */

const PUBLIC_DIR = path.resolve(__dirname, '../../public');
const TYPES_FILE = path.resolve(PUBLIC_DIR, 'types.ts');

// Helper to get all files in a directory recursively
function getFiles(dir, files = []) {
    const dirFiles = fs.readdirSync(dir);
    for (const file of dirFiles) {
        const name = path.join(dir, file);
        if (fs.statSync(name).isDirectory()) {
            getFiles(name, files);
        } else if (
            name.endsWith('.js') ||
            name.endsWith('.jsx') ||
            name.endsWith('.ts') ||
            name.endsWith('.tsx')
        ) {
            files.push(name);
        }
    }
    return files;
}

// The v2 music stand is the only UI host (#1358), so it is where most dispatches live.
const V2_DIRS = ['app', 'lib'].map((dir) => path.resolve(__dirname, '../../prototypes/v2', dir));
const allFiles = [PUBLIC_DIR, ...V2_DIRS]
    .flatMap((dir) => getFiles(dir))
    .filter((f) => !/\.(test|spec)\.tsx?$/.test(f));
const fileContents = allFiles.map((f) => ({ path: f, content: fs.readFileSync(f, 'utf8') }));

// "Is this a state slice?" is a CONTENT question, not a directory one: `public/state/`
// also holds non-slice plumbing (`state-effects`, `state-hydration`, `history`,
// `share-codec`) that dispatches like any other consumer. Keying on the
// `deepSignal<` declaration keeps the dispatch/handler split honest as files move in and
// out of that directory. Same discriminator as `scripts/check-mutations.ts`.
const isSlice = (f) => /deepSignal</.test(f.content);
// The effect listener handles actions with `case` arms outside any slice.
const HANDLER_FILES = ['state-effects.ts'];

const isHandlerFile = (f) => isSlice(f) || HANDLER_FILES.some((h) => f.path.endsWith(h));

// Extract ACTIONS keys from public/types.js
const typesContent = fs.readFileSync(TYPES_FILE, 'utf8');
const actionKeysMatch = typesContent.match(/ACTIONS = {([\s\S]*?)} as const/);
const actionKeys = actionKeysMatch[1]
    .split('\n')
    .map((line) => line.trim().split(':')[0])
    .filter((key) => key && !key.startsWith('//') && key.length > 0);

describe('State Integrity Audit', () => {
    it('should verify all ACTIONS are correctly implemented', () => {
        const unusedInDispatch = [];
        const unusedInHandler = [];

        actionKeys.forEach((key) => {
            // Check for an actual `dispatch(ACTIONS.KEY` call site — not just the bare
            // substring `ACTIONS.KEY` anywhere in a non-slice file. The looser substring
            // match let a listener's `case ACTIONS.KEY:` HANDLER arm (state-effects.ts is
            // a listener, not a slice, so it wasn't excluded here) count as a dispatch,
            // which is exactly how `ACTIONS.INIT_AUDIO` read as "dispatched" for years
            // after #1358 deleted its only real caller — nothing but its own handler case
            // ever mentioned it again. `\s*` spans a wrapped multi-line call
            // (`dispatch(\n    ACTIONS.SET_SONG_SEED,` — see runtime.ts). `(?:\?\.)?` covers
            // an optional-chained caller (`dispatch?.(ACTIONS.PROG_VALIDATED)` in
            // chords-engine.ts, where `dispatch` is an optional callback param). A listener
            // file (state-effects.ts) is NOT excluded here: it has genuine
            // `dispatch(ACTIONS.…)` call sites of its own (e.g. `SET_SOLOIST_MODE`, which
            // has no other caller), and this pattern already can't match its `case` arms.
            const dispatchRegex = new RegExp(`dispatch(?:\\?\\.)?\\(\\s*ACTIONS\\.${key}\\b`);
            const isDispatched = fileContents.some((f) => {
                if (isSlice(f) || f.path === TYPES_FILE) {
                    return false;
                }
                return dispatchRegex.test(f.content);
            });

            // Check for case ACTIONS.KEY: (handled in state slices or effects)
            const handlerRegex = new RegExp(`case\\s+ACTIONS\\.${key}\\b`);
            const isHandled = fileContents.some((f) => {
                if (!isHandlerFile(f)) {
                    return false;
                }
                return handlerRegex.test(f.content);
            });

            // Special exceptions for actions this regex genuinely can't detect. Every entry
            // here must point at a real, live consumer this scan structurally cannot see —
            // not a stand-in for "hasn't been checked." #1381 re-audited the whole list:
            // HYDRATE, VIS_RESET and VIS_UPDATE had zero references anywhere outside
            // `types.ts` (the last reader, the old engine's worker/visualizer scheduler,
            // went with it — #1404) and were deleted outright, action and all, rather than
            // kept exempted. TOAST_EXPIRED, FLASH_EXPIRED and SET_AUTO_INTENSITY came off
            // this list too: TOAST_EXPIRED and SET_AUTO_INTENSITY already had a real
            // `dispatch(ACTIONS.…)` call and a real `case ACTIONS.…:` handler and never
            // needed the exemption; FLASH_EXPIRED's handler in `playback.ts` was a bare
            // `case 'FLASH_EXPIRED':` string literal instead of `case ACTIONS.FLASH_EXPIRED:`
            // — fixed to match the rest of the file's style, which is what let it come off
            // too. REL_KEY_TOGGLE and TRANSPOSE were on this list too, but had no reducer arm
            // AND no listener — genuinely inert. Removed in #1166; don't re-add an exception
            // without pointing at the consumer that justifies it.
            const exceptions = [
                // Fires on every dispatch it's mixed into a chord-progression rebuild
                // (`chords-engine.ts`'s `validateProgression`) so the v2 runtime's single
                // generic `subscribe()` listener re-renders — genuinely no reducer `case`
                // anywhere, by design, not an unwired signal.
                'PROG_VALIDATED',
            ];

            if (!isDispatched && !exceptions.includes(key)) {
                unusedInDispatch.push(key);
            }
            if (!isHandled && !exceptions.includes(key)) {
                unusedInHandler.push(key);
            }
        });

        if (unusedInDispatch.length > 0) {
            console.warn('The following ACTIONS are never dispatched:', unusedInDispatch);
        }

        if (unusedInHandler.length > 0) {
            console.warn(
                'The following ACTIONS are never handled in state slices:',
                unusedInHandler,
            );
        }

        // We use warn instead of fail initially to allow for a gradual cleanup,
        // but for this task we want to identify them.
        expect(unusedInDispatch, 'Found unused dispatches').toEqual([]);
        expect(unusedInHandler, 'Found unhandled actions').toEqual([]);
    });
});
