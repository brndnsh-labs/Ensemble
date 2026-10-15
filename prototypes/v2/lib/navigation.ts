// Browser history entries for the shell's views (#1700). Pure, so the rules are testable
// without a page; `app/ensemble.tsx` owns the listeners.

/** Where the musician is, as one history entry records it. */
export type NavView =
    | { kind: 'home' }
    | { kind: 'all'; collection: string | null }
    | { kind: 'standards'; entry: string | null }
    | { kind: 'song'; ref: SongRef };

export type SongRef =
    | { kind: 'song'; id: string }
    | { kind: 'standard'; id: string }
    | { kind: 'draft' };

/** The object Ensemble writes to `history.state`. `depth` counts the views beneath it. */
export interface NavEntry {
    ensemble: 1;
    depth: number;
    view: NavView;
}

export function isNavEntry(value: unknown): value is NavEntry {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const entry = value as Partial<NavEntry>;
    return (
        entry.ensemble === 1 &&
        typeof entry.depth === 'number' &&
        Number.isInteger(entry.depth) &&
        entry.depth >= 0 &&
        typeof entry.view === 'object' &&
        entry.view !== null &&
        ['home', 'all', 'standards', 'song'].includes((entry.view as NavView).kind)
    );
}

/** One string per distinct view: two entries with the same key are the same place. */
export function navKey(view: NavView): string {
    switch (view.kind) {
        case 'home':
            return 'home';
        case 'all':
            return `all:${view.collection ?? ''}`;
        case 'standards':
            return `standards:${view.entry ?? ''}`;
        case 'song':
            return view.ref.kind === 'draft'
                ? 'song:draft'
                : `song:${view.ref.kind}:${view.ref.id}`;
    }
}

/**
 * How deep a view sits: the songbook is the floor, its pages one up, and a song one above
 * wherever it was opened from — so Back from a song lands where the musician opened it.
 */
export function depthFor(view: NavView, from: NavEntry | null): number {
    if (view.kind === 'home') {
        return 0;
    }
    if (view.kind !== 'song') {
        return 1;
    }
    if (from && from.view.kind === 'song') {
        // A song replacing a song (Save a copy, Keep a copy, a recovered draft) stays level.
        return from.depth;
    }
    return (from?.depth ?? 0) + 1;
}

/** What the history should do to reach `view` from the entry on top now. */
export type NavStep =
    | { kind: 'none' }
    | { kind: 'replace'; entry: NavEntry }
    | { kind: 'push'; entry: NavEntry }
    | { kind: 'back'; delta: number; entry: NavEntry };

export function stepTo(view: NavView, top: unknown): NavStep {
    if (!isNavEntry(top)) {
        // Not ours — first load, or a fragment navigation (`location.hash = …`) pushed an
        // entry Ensemble didn't write. Claim it in place; never go back past it.
        return {
            kind: 'replace',
            entry: { ensemble: 1, depth: view.kind === 'home' ? 0 : 1, view },
        };
    }
    if (navKey(top.view) === navKey(view)) {
        return { kind: 'none' };
    }
    const depth = depthFor(view, top);
    const entry: NavEntry = { ensemble: 1, depth, view };
    if (depth > top.depth) {
        return { kind: 'push', entry };
    }
    if (depth < top.depth) {
        return { kind: 'back', delta: depth - top.depth, entry };
    }
    return { kind: 'replace', entry };
}
