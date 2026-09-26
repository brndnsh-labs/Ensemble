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

/**
 * Actions left with no dispatcher when v1's load/save layer went (#1424): v1's readers
 * dispatched these, and `state-effects.ts`'s save denylist named the `UPDATE_*` family. #1381
 * deletes each (with its reducer arms) or records why it stays, and then empties this list —
 * it is a hand-off, not an exemption, so don't add to it.
 */
const UNDISPATCHED_SINCE_1424 = [
    'RESET_STATE',
    'SET_MIDI_CONFIG',
    'SET_SESSION_TIMER',
    'SET_MODAL_OPEN',
    'UPDATE_SB',
    'UPDATE_HB',
    'UPDATE_GB',
    'UPDATE_CONDUCTOR_DECISION',
];
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
            // Check for ACTIONS.KEY usage (dispatched/referenced outside slices)
            const dispatchRegex = new RegExp(`\\bACTIONS\\.${key}\\b`);
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

            // Special exceptions for actions that might be dynamically generated or used in ways this regex misses.
            // Notification-only signals (no reducer case): HYDRATE, TOAST_EXPIRED, FLASH_EXPIRED,
            // VIS_RESET, VIS_UPDATE, PROG_VALIDATED, DRUM_PRESET_LOADED — observed by listeners
            // (state-effects, worker-client) rather than handled in slices.
            // REL_KEY_TOGGLE and TRANSPOSE were on this list too, but had no reducer arm AND no
            // listener — genuinely inert. Removed in #1166; don't re-add an exception without
            // pointing at the consumer that justifies it.
            const exceptions = [
                'HYDRATE',
                'TOAST_EXPIRED',
                'FLASH_EXPIRED',
                'SET_AUTO_INTENSITY',
                'VIS_RESET',
                'VIS_UPDATE',
                'PROG_VALIDATED',
            ];

            if (
                !isDispatched &&
                !exceptions.includes(key) &&
                !UNDISPATCHED_SINCE_1424.includes(key)
            ) {
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
