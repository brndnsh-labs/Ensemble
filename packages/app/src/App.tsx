// The app: the library, one chart on the play screen, or one of the player's
// own in the editor. The address says which, so the browser's back button
// works and a chart can be bookmarked.

import { useEffect, useState, useSyncExternalStore } from "react";
import { CreditsView } from "./CreditsView.tsx";
import { findChart, ownCharts, subscribeCharts } from "./charts.ts";
import { EditView } from "./edit/EditView.tsx";
import { LibraryView } from "./LibraryView.tsx";
import type { Saving } from "./offline.ts";
import { saveInstruments } from "./offline.ts";
import { PlayView } from "./play/PlayView.tsx";
import { Rig } from "./play/rig.ts";
import type { Settings } from "./settings.ts";
import { loadSettings, saveSettings } from "./settings.ts";

const subscribe = (listener: () => void) => {
  addEventListener("hashchange", listener);
  return () => removeEventListener("hashchange", listener);
};

const PACKS_URL = `${import.meta.env.BASE_URL}packs/`;
const rig = new Rig(PACKS_URL);

export function App() {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  const own = useSyncExternalStore(subscribeCharts, ownCharts);
  const [settings, setSettings] = useState(loadSettings);
  /** The chart whose play button was tapped in the library: it starts as its screen opens. */
  const [autoplay, setAutoplay] = useState<string>();

  const [saving, setSaving] = useState<Saving>();

  // Once the app is open, bring the instruments onto the device for next time.
  useEffect(() => {
    saveInstruments(PACKS_URL, setSaving).catch(() => {
      // No connection, or no room: whatever was saved stays, and the next visit tries again.
    });
  }, []);

  const change = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };

  const [, screen, id] = /^#\/(chart|edit)\/(.+)$/.exec(hash) ?? [];
  const entry = id === undefined ? undefined : findChart(decodeURIComponent(id));
  if (hash === "#/credits") return <CreditsView packsUrl={PACKS_URL} />;
  // A built-in is not edited in place: its play screen offers a copy.
  if (screen === "edit" && entry?.own)
    return <EditView key={entry.id} entry={entry} reading={settings.reading} />;
  if (!entry || screen === "edit")
    return (
      <LibraryView
        own={own}
        saving={saving}
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
