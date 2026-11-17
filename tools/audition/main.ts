// The audition page: pick a chart, a style and a seed, and hear the band play
// it from the instrument packs. Bare on purpose; the app comes later. It also
// renders a take to a WAV file, and with `?render=name` in the address it does
// that by itself and hands the file to the server (scripts/render-audio.ts).

import type { Band, BandSetup, Mix, Sound } from "@ensemble/audio";
import { assemble, Player, renderBand, toWav } from "@ensemble/audio";
import type { MixStyle, Seat, StylePack, TimedNote } from "@ensemble/engine";
import { render, seconds, timedNotes } from "@ensemble/engine";
import { STYLES, styleById } from "@ensemble/styles";

/** Milliseconds from the page's first request to this script starting: how long the source took to arrive. */
const scriptStartedAfterMs = Math.round(performance.now());

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const chartSelect = $<HTMLSelectElement>("chart");
const styleSelect = $<HTMLSelectElement>("style");
const status = $<HTMLPreElement>("status");
const params = new URLSearchParams(location.search);

const SEAT_NAMES: readonly Seat[] = ["drums", "bass", "chords", "solo"];

const charts: string[] = await (await fetch("/api/library")).json();
const available: string[] = await (await fetch("/api/packs")).json();
for (const file of charts) chartSelect.add(new Option(file.replace(".chart", ""), file));
for (const style of STYLES) styleSelect.add(new Option(style.name, style.id));

/** The mix on the faders: it starts as the style's and is the listener's to move. */
let mix: MixStyle = structuredClone(STYLES[0]!.sound.mix);

function chosenStyle(): StylePack {
  return styleById(styleSelect.value) ?? STYLES[0]!;
}

/**
 * A style without what it has written for meters other than 4/4: the band as it plays a
 * bar nobody wrote, fitted from its 4/4 parts. Asked for with `fit=1`, to hear a written
 * meter beside what it replaced.
 */
function fitted(style: StylePack): StylePack {
  const plain = <T extends { meters?: unknown }>(seat: T): T => {
    const { meters: _, ...rest } = seat;
    return rest as T;
  };
  return {
    ...style,
    drums: plain(style.drums),
    bass: plain(style.bass),
    chords: plain(style.chords),
    solo: plain(style.solo),
  };
}

/** A chart's style is in its file name: start there. */
function followChart(): void {
  const style = STYLES.find((s) => chartSelect.value.startsWith(s.id));
  if (style) styleSelect.value = style.id;
  mix = structuredClone(chosenStyle().sound.mix);
  drawMix();
}

interface Performance {
  readonly sounds: Sound[];
  readonly setup: BandSetup;
  readonly length: number;
  readonly missing: string[];
  /** What the band and its loaded packs depend on: the same key can reuse them. */
  readonly bandKey: string;
}

async function perform(): Promise<Performance> {
  const style = params.has("fit") ? fitted(chosenStyle()) : chosenStyle();
  // `chartAt` names a chart that is not in the library, by its path on this server.
  const text = await (await fetch(params.get("chartAt") ?? `/library/${chartSelect.value}`)).text();
  const soloInstrument = $<HTMLSelectElement>("solo").value;
  const take = render(text, style, {
    mode: "jam",
    seed: Number($<HTMLInputElement>("seed").value),
    passes: Number($<HTMLInputElement>("passes").value),
    ...(soloInstrument ? { solo: true, soloInstrument } : {}),
    // `energy=0.3` holds the band at a level, as the app's level control does.
    ...(params.has("energy") ? { energy: Number(params.get("energy")) } : {}),
  });
  const only = params.get("only")?.split(",");
  // `packs=chords:electric-piano` puts another instrument in a seat: for hearing a pack
  // before any style is written for it.
  const swapped = new Map(
    (params.get("packs") ?? "")
      .split(",")
      .filter(Boolean)
      .map((pair) => pair.split(":") as [string, string]),
  );
  const packOf = (seat: Seat, voice: string | undefined): string =>
    swapped.get(seat) ?? (seat === "solo" ? (voice ?? "") : style.sound.packs[seat]);
  const sounds: Sound[] = [];
  // Each instrument by the name its sounds are sent to, and the seat whose channel it sounds
  // in. A pack two seats play (a guitar comping and the same guitar soloing) is two
  // instruments: the second seat to ask for it names its own `seat:pack`.
  const wanted = new Map<string, Seat>();
  const nameOf = (seat: Seat, pack: string): string =>
    (wanted.get(pack) ?? seat) === seat ? pack : `${seat}:${pack}`;
  // Notes written by hand, to be heard over the take (or alone, with `only=`): a file of
  // timed notes, each with its seat. For studying one sound, not for playing a tune.
  const written = params.get("notes");
  const extra: TimedNote[] = written ? await (await fetch(written)).json() : [];
  // `touch=bass:-12` plays a seat's softer (or harder) recordings at the level written, in
  // place of the style's own touch: for hearing a touch before a style is given it.
  const touched = new Map(
    (params.get("touch") ?? "")
      .split(",")
      .filter(Boolean)
      .map((pair) => pair.split(":"))
      .map(([seat, by]) => [seat!, Number(by)] as const),
  );
  for (const note of [...timedNotes(take.plan, take.events), ...extra]) {
    if (only && !only.includes(note.seat)) continue;
    const pack = nameOf(note.seat, packOf(note.seat, note.voice));
    wanted.set(pack, note.seat);
    const touch =
      touched.get(note.seat) ?? (note.seat === "solo" ? 0 : (style.sound.touch?.[note.seat] ?? 0));
    sounds.push({
      at: note.at,
      length: note.length,
      pack,
      // A drum's voice is its piece; a soloist's names its instrument, which is its pack.
      voice: note.seat === "solo" ? "" : (note.voice ?? ""),
      pitch: note.pitch,
      velocity: note.velocity,
      ...(touch ? { touch: Math.max(1, Math.min(127, note.velocity + touch)) } : {}),
      ...(note.bend === undefined ? {} : { bend: note.bend }),
    });
  }
  sounds.sort((a, b) => a.at - b.at);
  const packs: Record<string, string> = {};
  const missing: string[] = [];
  for (const [name, seat] of wanted) {
    const pack = name.slice(name.indexOf(":") + 1);
    if (available.includes(pack)) packs[name] = seat;
    else missing.push(`${seat}: no pack "${pack}"`);
  }
  const layers = $<HTMLSelectElement>("layers").value;
  const setup: BandSetup = {
    packs,
    packsUrl: "/assets/packs/",
    mix: audioMix(levelled(mix, style, swapped)),
    ...(layers ? { load: { layers: Number(layers) } } : {}),
  };
  return {
    sounds,
    setup,
    length: seconds(take.plan),
    missing,
    bandKey: JSON.stringify([packs, layers, mix.room.seconds, mix.room.predelay]),
  };
}

/**
 * The mix with each seat levelled for the instrument put in it, where that is one the style
 * offers for the seat (`SoundStyle.choices`): as the app plays it.
 */
function levelled(mix: MixStyle, style: StylePack, swapped: ReadonlyMap<string, string>): MixStyle {
  const seats = { ...mix.seats };
  for (const seat of ["drums", "bass", "chords"] as const) {
    const offered = style.sound.choices?.[seat]?.find(
      (choice) => choice.pack === swapped.get(seat),
    );
    if (offered?.level) seats[seat] = { ...seats[seat], level: seats[seat].level + offered.level };
  }
  return { ...mix, seats };
}

function audioMix(style: MixStyle): Mix {
  return { channels: style.seats, room: style.room, master: style.master };
}

// --- Playing ---

let context: AudioContext | undefined;
let band: { key: string; band: Band } | undefined;
let player: Player | undefined;
let length = 0;
let note = "";

async function play(): Promise<void> {
  // The context is made and resumed inside the tap, before anything is awaited:
  // Safari stops treating the tap as permission to make sound after an await.
  context ??= new AudioContext({ latencyHint: "playback" });
  void context.resume();
  player?.stop();
  const performance = await perform();
  if (band?.key !== performance.bandKey) {
    status.textContent = "Loading the instruments.";
    band = { key: performance.bandKey, band: await assemble(context, performance.setup) };
  }
  band.band.mixer.adjust(performance.setup.mix);
  length = performance.length;
  note = performance.missing.length ? `\nMissing: ${performance.missing.join("; ")}` : "";
  player = new Player(context, band.band.sampler, performance.sounds);
  player.start();
  $<HTMLButtonElement>("stop").disabled = false;
}

function stop(): void {
  player?.stop();
  $<HTMLButtonElement>("stop").disabled = true;
}

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

setInterval(() => {
  if (!player || !band) return;
  const position = player.position;
  const { onTime, late, dropped, worst } = player.count;
  const trouble = late + dropped > 0;
  status.className = trouble ? "bad" : "";
  status.textContent =
    `${position === undefined ? "stopped" : `${clock(Math.max(0, position))} of ${clock(length)}`}` +
    `\nNotes on time ${onTime}, late ${late}, dropped ${dropped}` +
    (late ? `, worst ${(worst * 1000).toFixed(1)} ms late` : "") +
    `\nInstruments in memory: ${(band.band.decodedBytes / 1e6).toFixed(0)} MB` +
    note;
  if (position !== undefined && position > length + 3) stop();
}, 250);

// --- Rendering to a file ---

async function renderWav(): Promise<{ wav: Uint8Array<ArrayBuffer>; performance: Performance }> {
  const performance = await perform();
  const stopAt = params.get("stop");
  const buffer = await renderBand(
    performance.setup,
    performance.sounds,
    stopAt === null ? {} : { stopAt: Number(stopAt) },
  );
  return { wav: toWav(buffer), performance };
}

async function download(): Promise<void> {
  status.textContent = "Rendering.";
  const { wav } = await renderWav();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
  link.download = `${chartSelect.value.replace(".chart", "")}-${styleSelect.value}-seed${$<HTMLInputElement>("seed").value}.wav`;
  link.click();
  status.textContent = "Rendered.";
}

// --- The mix faders ---

function drawMix(): void {
  const table = $<HTMLTableElement>("mix");
  table.replaceChildren();
  const row = (
    label: string,
    cells: [name: string, value: number, min: number, max: number, set: (v: number) => void][],
  ) => {
    const tr = table.insertRow();
    tr.insertCell().textContent = label;
    for (const [name, value, min, max, set] of cells) {
      const cell = tr.insertCell();
      const slider = document.createElement("input");
      const shown = document.createElement("output");
      Object.assign(slider, { type: "range", min, max, step: 0.5, value });
      shown.textContent = ` ${name} ${value}`;
      slider.oninput = () => {
        set(Number(slider.value));
        shown.textContent = ` ${name} ${slider.value}`;
        band?.band.mixer.adjust(audioMix(mix));
        showPreset();
      };
      cell.append(slider, shown);
    }
  };
  for (const seat of SEAT_NAMES) {
    const settings = mix.seats[seat];
    const change = (patch: Partial<typeof settings>) => {
      mix = { ...mix, seats: { ...mix.seats, [seat]: { ...mix.seats[seat], ...patch } } };
    };
    row(seat, [
      ["level", settings.level, -24, 12, (level) => change({ level })],
      ["reverb", settings.reverb ?? -40, -40, 0, (reverb) => change({ reverb })],
    ]);
  }
  row("room", [
    ["level", mix.room.level, -24, 12, (level) => (mix = { ...mix, room: { ...mix.room, level } })],
  ]);
  row("master", [["level", mix.master, -24, 12, (master) => (mix = { ...mix, master })]]);
  showPreset();
}

/** The mix as it would be written in a style pack, to copy out. */
function showPreset(): void {
  $<HTMLPreElement>("preset").textContent = JSON.stringify(mix);
}

chartSelect.onchange = followChart;
styleSelect.onchange = () => {
  mix = structuredClone(chosenStyle().sound.mix);
  drawMix();
};
$<HTMLButtonElement>("play").onclick = () => void play();
$<HTMLButtonElement>("stop").onclick = stop;
$<HTMLButtonElement>("wav").onclick = () => void download();

// --- Rendering by itself, for scripts/render-audio.ts ---

for (const [id, key] of [
  ["chart", "chart"],
  ["style", "style"],
  ["seed", "seed"],
  ["passes", "passes"],
  ["solo", "solo"],
  ["layers", "layers"],
] as const) {
  const value = params.get(key);
  if (value !== null) $<HTMLSelectElement | HTMLInputElement>(id).value = value;
}
if (!params.has("style")) followChart();
else {
  // A style asked for by name brings its own mix, as one chosen on the page does.
  mix = structuredClone(chosenStyle().sound.mix);
  drawMix();
}
if (params.has("mix")) {
  mix = JSON.parse(params.get("mix")!) as MixStyle;
  drawMix();
}
status.textContent = `Ready. Packs: ${available.join(", ") || "none"}.`;

// --- Playing live by itself, to count late and dropped notes over a whole take ---

const liveName = params.get("live");
if (liveName) {
  try {
    await play();
    const started = Date.now();
    await new Promise<void>((done) => {
      const watch = setInterval(() => {
        if (player?.position === undefined) {
          clearInterval(watch);
          done();
        }
      }, 500);
    });
    const facts = {
      ...player?.count,
      seconds: length,
      wallSeconds: (Date.now() - started) / 1000,
      contextState: context?.state,
      decodedMB: (band?.band.decodedBytes ?? 0) / 1e6,
    };
    await fetch(`/save/${liveName}.json`, { method: "POST", body: JSON.stringify(facts) });
  } catch (error) {
    await fetch(`/save/${liveName}.json`, {
      method: "POST",
      body: JSON.stringify({ error: String(error) }),
    });
  }
}

const renderName = params.get("render");
if (renderName) {
  try {
    const began = Date.now();
    const { wav, performance } = await renderWav();
    const facts = {
      scriptStartedAfterMs,
      pageLoadedAfterMs: Math.round(began - window.performance.timeOrigin),
      renderMs: Date.now() - began,
      seconds: performance.length,
      sounds: performance.sounds.length,
      packs: performance.setup.packs,
      missing: performance.missing,
    };
    await fetch(`/save/${renderName}.json`, { method: "POST", body: JSON.stringify(facts) });
    await fetch(`/save/${renderName}.wav`, { method: "POST", body: wav });
  } catch (error) {
    await fetch(`/save/${renderName}.json`, {
      method: "POST",
      body: JSON.stringify({ error: String(error) }),
    });
  }
}
