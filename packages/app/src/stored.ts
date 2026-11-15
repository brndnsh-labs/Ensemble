// A list the player keeps in the browser: their charts, their takes. Each item
// is small, so a whole list lives under one key in `localStorage` and is read
// and written at once. A browser that refuses to keep it (private browsing, a
// full disk) still works: the list then lasts as long as the visit.

export interface StoredList<Item extends { readonly id: string }> {
  /** Every item, as stored. */
  readonly items: () => readonly Item[];
  /** Replace the whole list. */
  readonly write: (items: readonly Item[]) => void;
  /** For `useSyncExternalStore`: told after every change, this tab's or another's. */
  readonly subscribe: (listener: () => void) => () => void;
  /** False when the browser would not keep the last change. */
  readonly kept: () => boolean;
  /** A new id: `prefix` and a random number in base 36, not one already in the list. */
  readonly newId: (prefix: string) => string;
}

/**
 * Ask the browser not to clear the site's storage when it runs short of room.
 * Asked each time something new is kept, not only the first: the browser
 * remembers its answer, and a player who deleted everything is starting again.
 * The answer changes nothing here.
 */
export function askToKeep(): void {
  void navigator.storage?.persist?.().catch(() => {});
}

/**
 * The list under `key`. Anything stored there that `isItem` does not accept
 * is left out, not thrown on, and written back as it was found: it may be
 * what a newer build of the app keeps, opened here by an older one. `changed` is called with the list as it first
 * loads and after every change, before anyone listening is told, so what the
 * screens are shown can be made again from it.
 */
export function storedList<Item extends { readonly id: string }>(
  key: string,
  isItem: (item: unknown) => item is Item,
  changed: (items: readonly Item[]) => void,
): StoredList<Item> {
  /** What is stored there and is not an item. */
  let others: unknown[] = [];
  const load = (): Item[] => {
    try {
      const list: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (!Array.isArray(list)) return [];
      others = list.filter((item) => !isItem(item));
      return list.filter(isItem);
    } catch {
      return [];
    }
  };
  let items = load();
  let kept = true;
  const listeners = new Set<() => void>();
  const tell = () => {
    changed(items);
    for (const listener of listeners) listener();
  };
  changed(items);

  // Another tab of the app changed them.
  addEventListener("storage", (event) => {
    if (event.key !== key) return;
    items = load();
    tell();
  });

  return {
    items: () => items,
    write(next) {
      items = [...next];
      try {
        localStorage.setItem(key, JSON.stringify([...items, ...others]));
        kept = true;
      } catch {
        kept = false;
      }
      tell();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    kept: () => kept,
    newId(prefix) {
      // Not `crypto.randomUUID`: that is missing where the app is served over plain HTTP on a home network.
      let id: string;
      do id = `${prefix}${crypto.getRandomValues(new Uint32Array(1))[0]!.toString(36)}`;
      while (items.some((item) => item.id === id));
      return id;
    },
  };
}
