// The app: home, the library, one chart on the play screen, one of the
// player's own in the editor, or a take they kept. The address says which
// (`address.ts`), so the browser's back button works and a chart can be
// bookmarked.

import { useEffect, useState, useSyncExternalStore } from "react";
import { address, go, routeOf, subscribeAddress } from "./address.ts";
import { Browse } from "./Browse.tsx";
import { CreditsView } from "./CreditsView.tsx";
import { findChart, ownCharts, subscribeCharts } from "./charts.ts";
import { EditView } from "./edit/EditView.tsx";
import type { Saving } from "./offline.ts";
import { saveInstruments } from "./offline.ts";
import { PlayView } from "./play/PlayView.tsx";
import { Rig } from "./play/rig.ts";
import { TakeView } from "./play/TakeView.tsx";
import { recentlyPlayed, subscribeRecent } from "./recent.ts";
import type { Settings } from "./settings.ts";
import { loadSettings, saveSettings } from "./settings.ts";
import { chartFor, findTake, keptTakes, subscribeTakes } from "./takes.ts";

const PACKS_URL = `${import.meta.env.BASE_URL}packs/`;
const rig = new Rig(PACKS_URL);

export function App() {
  const hash = useSyncExternalStore(subscribeAddress, address);
  const own = useSyncExternalStore(subscribeCharts, ownCharts);
  const takes = useSyncExternalStore(subscribeTakes, keptTakes);
  const recent = useSyncExternalStore(subscribeRecent, recentlyPlayed);
  const [settings, setSettings] = useState(loadSettings);
  /** The address of the chart or take whose play button was tapped on home or in the library: it starts as its screen opens. */
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

  const route = routeOf(hash);
  if (route.screen === "credits") return <CreditsView packsUrl={PACKS_URL} />;
  if (route.screen === "take") {
    const take = findTake(route.id);
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
  }
  const entry =
    route.screen === "chart" || route.screen === "edit" ? findChart(route.id) : undefined;
  // A built-in is not edited in place: its play screen offers a copy.
  if (route.screen === "edit" && entry?.own)
    return (
      <EditView
        key={entry.id}
        entry={entry}
        reading={settings.reading}
        style={settings.charts[entry.id]?.style}
      />
    );
  if (route.screen === "chart" && entry)
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
  return (
    <Browse
      // A chart, a take or an editor that is not there to open: home.
      route={
        route.screen === "home" || route.screen === "library"
          ? route
          : { screen: "home", takes: false }
      }
      play={(to) => {
        // Inside the tap, so the browser lets the band start without another one.
        rig.wake();
        setAutoplay(to);
        go(to);
      }}
      own={own}
      takes={takes}
      recent={recent}
      choices={settings.charts}
      saving={saving}
    />
  );
}
