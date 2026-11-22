// The app: home, the library, one chart on its screen (to play, or with the
// pencil down to change one of the player's own), or a take they kept. The address says which
// (`address.ts`), so the browser's back button works and a chart can be
// bookmarked.

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { address, cameBack, go, routeOf, subscribeAddress } from "./address.ts";
import { Browse } from "./Browse.tsx";
import { CreditsView } from "./CreditsView.tsx";
import { findChart, ownCharts, subscribeCharts } from "./charts.ts";
import { count, countView } from "./counts.ts";
import { arrived, screenOf } from "./motion.ts";
import type { Saving } from "./offline.ts";
import { saveInstruments } from "./offline.ts";
import { PlayView } from "./play/PlayView.tsx";
import { Rig } from "./play/rig.ts";
import { TakeView } from "./play/TakeView.tsx";
import { recentlyPlayed, subscribeRecent } from "./recent.ts";
import type { Settings } from "./settings.ts";
import { loadSettings, saveSettings } from "./settings.ts";
import { chartFor, findTake, keptTakes, subscribeTakes } from "./takes.ts";

/**
 * A screen arrived at moves in before its first frame (`motion.ts`): turned in
 * from the side it came from, unless it is the first, and its pieces staged.
 * A search being typed is not arrived at.
 */
function useArrival(route: ReturnType<typeof routeOf>): void {
  const screen = screenOf(route);
  const was = useRef<ReturnType<typeof screenOf>>(undefined);
  useLayoutEffect(() => {
    if (!screen || screen.key === was.current?.key) return;
    const before = was.current;
    was.current = screen;
    const root = document.getElementById("app")?.firstElementChild;
    if (!(root instanceof HTMLElement)) return;
    arrived(root, route, before && (cameBack() || screen.depth < before.depth));
  });
}

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
  /** The id of a copy of a built-in chart just made to edit: its screen says so, once. */
  const [copied, setCopied] = useState<string>();

  const [saving, setSaving] = useState<Saving>();

  // Once the app is open, bring the instruments onto the device for next time.
  useEffect(() => {
    // Counted when this visit brought the last of them in: a report said some were still to
    // fetch, and the last says every one is here. A visit that finds them all here (it reports
    // so twice) counts nothing.
    let wanting = false;
    const report = (now: Saving) => {
      setSaving(now);
      if (now.done < now.total) wanting = true;
      else if (now.finished && wanting) {
        wanting = false;
        count("instruments_saved_offline");
      }
    };
    saveInstruments(PACKS_URL, report, () => rig.idle()).catch(() => {
      // No connection, or no room: whatever was saved stays, and the next visit tries again.
    });
  }, []);

  const change = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };

  const route = routeOf(hash);
  useArrival(route);
  // Each screen come to is counted as a view (`counts.ts`: its fixed path, once a screen).
  // biome-ignore lint/correctness/useExhaustiveDependencies: the address is what a view follows
  useEffect(() => countView(), [hash]);
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
  // Playing a chart and editing it are one screen: going from one to the other redraws nothing.
  if (entry)
    return (
      <PlayView
        key={entry.id}
        mode={route.screen === "edit" ? "edit" : "play"}
        copied={copied === entry.id}
        madeCopy={setCopied}
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
      // A chart or a take that is not there to open: home.
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
