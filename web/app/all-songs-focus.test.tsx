// @vitest-environment happy-dom
/**
 * The All songs page's focus move after THIS TAB's own row delete (#1440 review P5, #1927),
 * rendered for real. The harness owns `deletedRowId` the way the shell does: set by the delete,
 * cleared when the page reports the move.
 */
import { writtenSettings } from '@core/songbook/codec';
import { parseChordBar } from '@core/songbook/score-text';
import { act, useCallback, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ChartDocument, validateDocument } from '../lib/documents';
import { bandForGenre } from '../lib/standards';
import { AllSongs } from './all-songs';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function song(id: string, title: string): ChartDocument {
    const events = parseChordBar('C', '4/4');
    if (events.kind !== 'ok') {
        throw new Error('fixture bar did not read');
    }
    const stamp = '2026-01-01T00:00:00.000Z';
    return validateDocument({
        schemaVersion: 2,
        id,
        title,
        createdAt: stamp,
        updatedAt: stamp,
        revision: 0,
        chart: {
            score: {
                key: 'C',
                isMinor: false,
                notation: 'name',
                meter: '4/4',
                grouping: null,
                sections: [
                    {
                        id: 'a',
                        label: 'A',
                        repeat: 1,
                        measures: [
                            { id: 'measure-1', content: { kind: 'events', events: events.value } },
                        ],
                    },
                ],
            },
            ...writtenSettings({
                performance: { bpm: 100, seed: '', randomizeSeed: false },
                band: bandForGenre('Rock'),
            }),
        },
    });
}

const ALPHA = song('alpha', 'Alpha');
const BRAVO = song('bravo', 'Bravo');
const CHARLIE = song('charlie', 'Charlie');

interface Control {
    /** What this tab's delete does: names the id and drops its row in one render. */
    remove: (id: string, library: ChartDocument[]) => void;
    /** What a sync does: the row goes, nothing names it. */
    syncRemove: (library: ChartDocument[]) => void;
    /** The harness's own `deletedRowId`. */
    deleted: () => string | null;
}

let host: HTMLDivElement;
let root: Root;
let control: Control;

function Harness({ initial }: { initial: ChartDocument[] }) {
    const [library, setLibrary] = useState(initial);
    const [deletedRowId, setDeletedRowId] = useState<string | null>(null);
    const removalHandled = useCallback(() => setDeletedRowId(null), []);
    control = {
        remove: (id, next) => {
            setDeletedRowId(id);
            setLibrary(next);
        },
        syncRemove: (next) => setLibrary(next),
        deleted: () => deletedRowId,
    };
    return (
        <AllSongs
            songs={library}
            failure={null}
            unreadable={0}
            accountLibrary={false}
            starred={new Set()}
            collections={[]}
            onNewCollection={vi.fn()}
            onRenameCollection={vi.fn()}
            onDeleteCollection={vi.fn()}
            removedCollectionId={null}
            onCollectionRemovalHandled={vi.fn()}
            openedAt={new Map()}
            remoteCandidates={[]}
            busy={false}
            initialSort="title"
            onSortChange={vi.fn()}
            onBack={vi.fn()}
            onOpenSong={vi.fn()}
            onToggleStar={vi.fn()}
            onOpenRowMenu={vi.fn()}
            lastRemovedId={deletedRowId}
            onRemovalHandled={removalHandled}
        />
    );
}

function focusedTitle(): string | null {
    const active = document.activeElement;
    return active instanceof HTMLElement && active.classList.contains('song-link')
        ? (active.textContent ?? '')
        : null;
}

beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root.render(<Harness initial={[ALPHA, BRAVO, CHARLIE]} />));
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe('AllSongs focus after a row delete', () => {
    it('moves focus to the next row and clears the marker', () => {
        act(() => control.remove('bravo', [ALPHA, CHARLIE]));
        expect(focusedTitle()).toContain('Charlie');
        expect(control.deleted()).toBeNull();
    });

    it('moves focus again when the same id comes back and is deleted a second time', () => {
        act(() => control.remove('bravo', [ALPHA, CHARLIE]));
        expect(focusedTitle()).toContain('Charlie');
        // A purged song the account still holds returns on the next download.
        act(() => control.syncRemove([ALPHA, BRAVO, CHARLIE]));
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        act(() => control.remove('bravo', [ALPHA, CHARLIE]));
        expect(focusedTitle()).toContain('Charlie');
    });

    it('leaves focus alone when a row goes without this tab naming it', () => {
        const before = document.activeElement;
        act(() => control.syncRemove([ALPHA, CHARLIE]));
        expect(document.activeElement).toBe(before);
        expect(focusedTitle()).toBeNull();
    });
});
