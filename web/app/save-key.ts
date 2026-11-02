/**
 * Ctrl/⌘+S, the stand's Save (`useStandKeys`, #1984). A popup that keeps the page's keys to itself
 * (`stopPropagation` on Space and the arrows) must let this one through, or the browser's Save
 * Page opens over the menu (#2069).
 */
export function isSaveKey(event: {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
}): boolean {
    return (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 's'
    );
}
