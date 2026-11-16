// The app: the home screen, one chart on the play screen, one of the player's
// own in the editor, or a take they kept. The address says which, so the
// browser's back button works and a chart can be bookmarked.

import { useEffect, useState, useSyncExternalStore } from "react";
import { CreditsView } from "./CreditsView.tsx";
import { findChart, ownCharts, subscribeCharts } from "./charts.ts";
import { EditView } from "./edit/EditView.tsx";
import type { Finding } from "./LibraryView.tsx";
import { LibraryView } from "./LibraryView.tsx";
import type { Saving } from "./offline.ts";
import { saveInstruments } from "./offline.ts";
import { PlayView } from "./play/PlayView.tsx";
import { Rig } from "./play/rig.ts";
import { TakeView } from "./play/TakeView.tsx";
import { recentlyPlayed, subscribeRecent } from "./recent.ts";
import type { Settings } from "./settings.ts";
import { loadSettings, saveSettings } from "./settings.ts";
import { chartFor, findTake, keptTakes, subscribeTakes } from "./takes.ts";

const subscribe = (listener: () => void) => {
  addEventListener("hashchange", listener);
  return () => removeEventListener("hashchange", listener);
};

const PACKS_URL = `${import.meta.env.BASE_URL}packs/`;
const rig = new Rig(PACKS_URL);

export function App() {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  const own = useSyncExternalStore(subscribeCharts, ownCharts);
  const takes = useSyncExternalStore(subscribeTakes, keptTakes);
  const recent = useSyncExternalStore(subscribeRecent, recentlyPlayed);
  const [settings, setSettings] = useState(loadSettings);
  /** What is being looked for among the built-in charts: kept here so it is still set on coming back from one. */
  const [finding, find] = useState<Finding>({ query: "", style: "" });
  /** The address of the chart or take whose play button was tapped in the library: it starts as its screen opens. */
  const [autoplay, setAutoplay] = useState<string>();

  const [saving, setSaving] = useState<Saving>();

  // Once the app is open, bring the instruments onto the device for next time.
  useEffect(() => {
    saveInstruments(PACKS_URL, setSaving, () => rig.idle()).catch(() => {
      // No connection, or no room: whatever was saved stays, and the next visit tries again.
    });
  }, []);

  const change = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };

  const [, screen, id] = /^#\/(chart|edit|take)\/(.+)$/.exec(hash) ?? [];
  const found = id === undefined ? undefined : decodeURIComponent(id);
  if (hash === "#/credits") return <CreditsView packsUrl={PACKS_URL} />;
  const take = screen === "take" && found !== undefined ? findTake(found) : undefined;
  if (take)
    return (
      <TakeView
        key={take.id}
        take={take}
        chart={chartFor(take)}
        rig={rig}
        reading={settings.reading}
        read={(reading) => change({ ...settings, reading })}
        autoplay={autoplay === hash}
        started={() => setAutoplay(undefined)}
      />
    );
  const entry = found === undefined || screen === "take" ? undefined : findChart(found);
  // A built-in is not edited in place: its play screen offers a copy.
  if (screen === "edit" && entry?.own)
    return (
      <EditView
        key={entry.id}
        entry={entry}
        reading={settings.reading}
        style={settings.charts[entry.id]?.style}
      />
    );
  if (!entry || screen === "edit")
    return (
      <LibraryView
        own={own}
        takes={takes}
        recent={recent}
        finding={finding}
        find={find}
        saving={saving}
        play={(address) => {
          // Inside the tap, so the browser lets the band start without another one.
          rig.wake();
          setAutoplay(address);
          location.hash = address;
        }}
      />
    );
  return (
    <PlayView
      key={entry.id}
      entry={entry}
      takes={takes.filter((kept) => chartFor(kept)?.id === entry.id)}
      rig={rig}
      settings={settings}
      change={change}
      autoplay={autoplay === hash}
      started={() => setAutoplay(undefined)}
    />
  );
}
