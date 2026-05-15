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

const allFiles = getFiles(PUBLIC_DIR);
const fileContents = allFiles.map((f) => ({ path: f, content: fs.readFileSync(f, 'utf8') }));

// Extract ACTIONS keys from public/types.js
const typesContent = fs.readFileSync(TYPES_FILE, 'utf8');
const actionKeysMatch = typesContent.match(/ACTIONS = {([\s\S]*?)} as const;/);
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
                if (f.path.includes('public/state/') || f.path === TYPES_FILE) {
                    return false;
                }
                return dispatchRegex.test(f.content);
            });

            // Check for case ACTIONS.KEY: (handled in state slices or effects)
            const handlerRegex = new RegExp(`case\\s+ACTIONS\\.${key}\\b`);
            const isHandled = fileContents.some((f) => {
                const isHandlerFile =
                    f.path.includes('public/state/') ||
                    f.path.includes('public/state-effects.js') ||
                    f.path.includes('public/state-hydration.js');
                if (!isHandlerFile) {
                    return false;
                }
                return handlerRegex.test(f.content);
            });

            // Special exceptions for actions that might be dynamically generated or used in ways this regex misses
            const exceptions = ['HYDRATE', 'TOAST_EXPIRED', 'FLASH_EXPIRED', 'SET_AUTO_INTENSITY'];

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
