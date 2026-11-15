// The app: the library, or one chart on the play screen. The address says
// which, so the browser's back button works and a chart can be bookmarked.

import { useState, useSyncExternalStore } from "react";
import { LibraryView } from "./LibraryView.tsx";
import { libraryChart } from "./library.ts";
import { PlayView } from "./play/PlayView.tsx";
import { Rig } from "./play/rig.ts";
import type { Settings } from "./settings.ts";
import { loadSettings, saveSettings } from "./settings.ts";

const subscribe = (listener: () => void) => {
  addEventListener("hashchange", listener);
  return () => removeEventListener("hashchange", listener);
};

const rig = new Rig(`${import.meta.env.BASE_URL}packs/`);

export function App() {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  const [settings, setSettings] = useState(loadSettings);
  /** The chart whose play button was tapped in the library: it starts as its screen opens. */
  const [autoplay, setAutoplay] = useState<string>();

  const change = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };

  const id = /^#\/chart\/(.+)$/.exec(hash)?.[1];
  const entry = id === undefined ? undefined : libraryChart(decodeURIComponent(id));
  if (!entry)
    return (
      <LibraryView
        play={(chosen) => {
          // Inside the tap, so the browser lets the band start without another one.
          rig.wake();
          setAutoplay(chosen.id);
          location.hash = `#/chart/${chosen.id}`;
        }}
      />
    );
  return (
    <PlayView
      key={entry.id}
      entry={entry}
      rig={rig}
      settings={settings}
      change={change}
      autoplay={autoplay === entry.id}
      started={() => setAutoplay(undefined)}
    />
  );
}
