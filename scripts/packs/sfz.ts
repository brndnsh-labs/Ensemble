// A reader for the SFZ mapping files the sample libraries ship. A mapping is
// the library's own word on which file is which note, layer and alternate, so
// the recipes pick recordings from it rather than from filenames.
//
// What it understands: the headers <control>, <global>, <master>, <group> and
// <region> and how their opcodes are inherited; #include (paths from the
// program's own folder, as SFZ players resolve them); #define, which applies to
// everything after it, included files too; default_path; and sample paths with
// spaces or backslashes. Other headers (<curve>, <effect>) are read past.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface SfzRegion {
  /** The sample's file, resolved to an absolute path. A generated sound ("*silence") keeps its name. */
  readonly sample: string;
  /** Every opcode in force for the region: global, then master, then group, then its own. */
  readonly opcodes: Readonly<Record<string, string>>;
  /** The <control> opcodes in force when the region was read: default controller values live here. */
  readonly control: Readonly<Record<string, string>>;
}

export function readSfz(file: string): SfzRegion[] {
  const root = dirname(resolve(file));
  const defines = new Map<string, string>();
  const text = preprocess(resolve(file), root, defines, 0);
  return parse(text, root);
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\r\n]*/g, "");
}

/** Expands a `$NAME`, taking the longest defined name the word starts with. */
function expand(text: string, defines: Map<string, string>): string {
  if (defines.size === 0) return text;
  return text.replace(/\$\w+/g, (word) => {
    for (let end = word.length; end > 1; end--) {
      const value = defines.get(word.slice(0, end));
      if (value !== undefined) return value + word.slice(end);
    }
    return word;
  });
}

function preprocess(file: string, root: string, defines: Map<string, string>, depth: number) {
  if (depth > 32) throw new Error(`${file}: #include nested too deep`);
  const text = stripComments(readFileSync(file, "utf8"));
  const directive = /#include\s+"([^"]+)"|#define\s+(\$\w+)[ \t]+([^\r\n]*)/g;
  let out = "";
  let from = 0;
  for (let m = directive.exec(text); m; m = directive.exec(text)) {
    out += expand(text.slice(from, m.index), defines);
    from = m.index + m[0].length;
    if (m[1] !== undefined) {
      const path = join(root, expand(m[1], defines).replaceAll("\\", "/"));
      out += `\n${preprocess(path, root, defines, depth + 1)}\n`;
    } else {
      defines.set(m[2]!, expand(m[3]!.trim(), defines));
    }
  }
  return out + expand(text.slice(from), defines);
}

type Scope = Record<string, string>;

function parse(text: string, root: string): SfzRegion[] {
  const regions: SfzRegion[] = [];
  let control: Scope = {};
  let global: Scope = {};
  let master: Scope = {};
  let group: Scope = {};
  let region: Scope | undefined;
  let other: Scope = {};
  let current: Scope = other;

  const close = () => {
    if (!region) return;
    const opcodes = { ...global, ...master, ...group, ...region };
    const sample = opcodes.sample;
    if (sample !== undefined) {
      const name = sample.replaceAll("\\", "/");
      const path = name.startsWith("*")
        ? name
        : resolve(root, (control.default_path ?? "").replaceAll("\\", "/"), name);
      regions.push({ sample: path, opcodes, control: { ...control } });
    }
    region = undefined;
  };

  // A token is a header, or an opcode name and its value. A value runs to the
  // end of its line or to the next opcode or header, so a path may hold spaces.
  const token = /<(\w+)>|(?<=^|[\s>])([A-Za-z_]\w*)=/gm;
  const found: { index: number; end: number; header?: string; opcode?: string }[] = [];
  for (let m = token.exec(text); m; m = token.exec(text)) {
    const entry: { index: number; end: number; header?: string; opcode?: string } = {
      index: m.index,
      end: m.index + m[0].length,
    };
    if (m[1] !== undefined) entry.header = m[1];
    if (m[2] !== undefined) entry.opcode = m[2];
    found.push(entry);
  }
  for (let i = 0; i < found.length; i++) {
    const t = found[i]!;
    if (t.header !== undefined) {
      close();
      switch (t.header) {
        case "control":
          control = { ...control };
          current = control;
          break;
        case "global":
          global = {};
          master = {};
          group = {};
          current = global;
          break;
        case "master":
          master = {};
          group = {};
          current = master;
          break;
        case "group":
          group = {};
          current = group;
          break;
        case "region":
          region = {};
          current = region;
          break;
        default:
          other = {};
          current = other;
      }
      continue;
    }
    const next = found[i + 1]?.index ?? text.length;
    const raw = text.slice(t.end, next);
    const line = raw.split(/\r?\n/, 1)[0] ?? "";
    current[t.opcode!] = line.trim();
  }
  close();
  return regions;
}

const STEPS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** A MIDI note from an SFZ key value: a number, or a name where C4 is 60 ("c#4", "eb2"). */
export function sfzNote(value: string): number {
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  const m = /^([a-g])(#|b)?(-?\d+)$/i.exec(value.trim());
  if (!m) throw new Error(`not a note: ${value}`);
  const step = STEPS[m[1]!.toLowerCase()]!;
  const accidental = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + step + accidental;
}

function num(opcodes: Readonly<Record<string, string>>, name: string, fallback: number): number {
  const v = opcodes[name];
  return v === undefined ? fallback : Number(v);
}

/** The keys a region answers, and the pitch its recording is at, as the mapping says. */
export function keys(r: SfzRegion): { lo: number; hi: number; center: number } {
  const o = r.opcodes;
  const key = o.key !== undefined ? sfzNote(o.key) : undefined;
  const lo = o.lokey !== undefined ? sfzNote(o.lokey) : (key ?? 0);
  const hi = o.hikey !== undefined ? sfzNote(o.hikey) : (key ?? 127);
  const center =
    o.pitch_keycenter !== undefined ? sfzNote(o.pitch_keycenter) : key !== undefined ? key : 60;
  return { lo, hi, center };
}

export function velocities(r: SfzRegion): { lo: number; hi: number } {
  return { lo: num(r.opcodes, "lovel", 1), hi: num(r.opcodes, "hivel", 127) };
}

/** Where the region sits among the alternates: its `seq_position`, or its `lorand`. */
export function alternate(r: SfzRegion): number {
  return num(r.opcodes, "seq_position", 1) + num(r.opcodes, "lorand", 0);
}

/** The value a controller has before anything moves it: its `set_cc`, else 0. */
export function controllerDefault(r: SfzRegion, cc: number): number {
  const c = r.control;
  if (c[`set_cc${cc}`] !== undefined) return Number(c[`set_cc${cc}`]);
  if (c[`set_hdcc${cc}`] !== undefined) return Number(c[`set_hdcc${cc}`]) * 127;
  return 0;
}

/**
 * True when the region would sound with every controller at its default: its
 * `locc`/`hicc` ranges hold, and its keyswitch (`sw_last`) is the default one.
 */
export function soundsByDefault(r: SfzRegion): boolean {
  for (const [name, value] of Object.entries(r.opcodes)) {
    const m = /^(lo|hi)(?:hd)?cc(\d+)$/.exec(name);
    if (!m) continue;
    const v = controllerDefault(r, Number(m[2]));
    const bound = name.includes("hdcc") ? Number(value) * 127 : Number(value);
    if (m[1] === "lo" ? v < bound : v > bound) return false;
  }
  const sw = r.opcodes.sw_last;
  if (sw !== undefined) {
    const fallback = r.opcodes.sw_default;
    if (fallback === undefined || sfzNote(fallback) !== sfzNote(sw)) return false;
  }
  return true;
}

/** The region's level in dB from `volume` and each `amplitude_oncc` at its controller's default. */
export function regionGainDb(r: SfzRegion): number {
  let gain = 10 ** (num(r.opcodes, "volume", 0) / 20) * (num(r.opcodes, "amplitude", 100) / 100);
  for (const [name, value] of Object.entries(r.opcodes)) {
    const m = /^amplitude_oncc(\d+)$/.exec(name);
    if (m) gain *= (Number(value) / 100) * (controllerDefault(r, Number(m[1])) / 127);
  }
  return 20 * Math.log10(gain);
}
