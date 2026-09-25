import { readFile } from 'node:fs/promises';
import { appUrl, expect, test } from './fixtures';

const blue = 'Blue pocket Blues · Saved locally';
// Authored in `lib/starters.ts`: 12 one-bar-per-chord measures (`C7 | F7 | ...`)
// in 4/4 at 110 BPM. Hardcoded here rather than read back through the UI so this
// spec is an independent check on the exporter, not a mirror of the same code.
const STARTER_BPM = 110;
const STARTER_BARS = 12;
const STEPS_PER_BAR = 16;

interface ParsedTrack {
    maxTick: number;
    tempo: number | null;
    /** Did the per-event walk consume exactly this chunk's declared bytes? */
    complete: boolean;
}
interface ParsedMidi {
    format: number;
    trackCount: number;
    ppq: number;
    tracks: ParsedTrack[];
}

/**
 * Minimal MThd/MTrk walker — just enough to prove format/track count, the
 * tempo meta event and rendered length, per #1277's acceptance ("parse the
 * header + walk track chunks minimally in the spec; do not add a MIDI-parsing
 * dependency"). Every event `MidiTrack` (public/engine/midi-utils.ts) writes
 * carries an explicit status byte — no running-status compression — so this
 * doesn't need to track "last status" across events.
 *
 * Never assert here: this also runs speculatively while polling a fresh
 * download for completeness (`readSettledMidi`), where a bad parse is an
 * expected, retryable outcome rather than a test failure.
 */
function parseMidi(buf: Buffer): ParsedMidi | null {
    if (buf.length < 14 || buf.toString('latin1', 0, 4) !== 'MThd' || buf.readUInt32BE(4) !== 6) {
        return null;
    }
    let pos = 0;
    const readStr = (n: number) => {
        const s = buf.toString('latin1', pos, pos + n);
        pos += n;
        return s;
    };
    const readU32 = () => {
        const v = buf.readUInt32BE(pos);
        pos += 4;
        return v;
    };
    const readU16 = () => {
        const v = buf.readUInt16BE(pos);
        pos += 2;
        return v;
    };
    const readVarInt = () => {
        let value = 0;
        for (;;) {
            const byte = buf[pos++];
            value = (value << 7) | (byte & 0x7f);
            if (!(byte & 0x80)) {
                return value;
            }
        }
    };

    readStr(4);
    readU32();
    const format = readU16();
    const trackCount = readU16();
    const ppq = readU16();

    const tracks: ParsedTrack[] = [];
    for (let i = 0; i < trackCount; i++) {
        if (pos + 8 > buf.length || readStr(4) !== 'MTrk') {
            return null;
        }
        const length = readU32();
        const end = pos + length;
        if (end > buf.length) {
            return null;
        }
        let tick = 0;
        let maxTick = 0;
        let tempo: number | null = null;
        // A resolution note's humanized end time can land fractionally past this
        // track's own `endOfTrack` marker — `compile()` (public/engine/midi-utils.ts)
        // sorts events by time, so End of Track is not always physically last.
        // Walking every event (not jumping straight to `end`) is what lets this
        // land exactly on `end` in the well-formed case; `complete` records
        // whether it actually did, which is the real completeness signal below —
        // an early break here (insufficient bytes for the next event) means this
        // read caught the download mid-write, not that the export is malformed.
        while (pos < end) {
            const delta = readVarInt();
            if (pos > end) {
                break;
            }
            tick += delta;
            const status = buf[pos++];
            if (pos > end) {
                break;
            }
            if (status === 0xff) {
                const metaType = buf[pos++];
                if (pos > end) {
                    break;
                }
                const metaLen = readVarInt();
                if (pos + metaLen > end) {
                    break;
                }
                if (metaType === 0x51 && metaLen === 3) {
                    tempo = (buf[pos] << 16) | (buf[pos + 1] << 8) | buf[pos + 2];
                }
                pos += metaLen;
            } else if (status === 0xf0 || status === 0xf7) {
                const sysexLen = readVarInt();
                if (pos + sysexLen > end) {
                    break;
                }
                pos += sysexLen;
            } else {
                const type = status & 0xf0;
                const dataLen = type === 0xc0 || type === 0xd0 ? 1 : 2;
                if (pos + dataLen > end) {
                    break;
                }
                pos += dataLen;
            }
            maxTick = Math.max(maxTick, tick);
        }
        tracks.push({ maxTick, tempo, complete: pos === end });
        pos = end;
    }
    if (pos !== buf.length) {
        return null;
    }
    return { format, trackCount, ppq, tracks };
}

/**
 * Reads a just-downloaded `.mid`, retrying until (a) `parseMidi` reports every
 * track's walk landed exactly on its declared end AND (b) two consecutive
 * reads, a beat apart, come back byte-identical. Observed empirically on this
 * suite (#1277), on the `webkit-phone` project specifically: a read shortly
 * after `download.saveAs()` resolves can occasionally see a self-consistent
 * (every chunk length checks out) but STALE snapshot of the file — content
 * that decodes cleanly but to the wrong thing — with the true, correct bytes
 * landing moments later at the same path. (a) alone catches a mid-write
 * truncation; it does not catch a torn/stale-but-shaped-right read, which is
 * why this also requires (b): a truly settled file reads identically twice in
 * a row, a still-settling one does not. Every occurrence of this traced back
 * to a file that, read again afterward, matched every other run's content.
 */
async function readSettledMidi(path: string): Promise<{ bytes: Buffer; parsed: ParsedMidi }> {
    let previous: Buffer | null = null;
    for (let attempt = 0; attempt < 20; attempt++) {
        const bytes = await readFile(path);
        const parsed = parseMidi(bytes);
        const structurallyComplete = parsed?.tracks.every((t) => t.complete) ?? false;
        if (structurallyComplete && parsed && previous?.equals(bytes)) {
            return { bytes, parsed };
        }
        previous = bytes;
        await new Promise((resolve) => setTimeout(resolve, 75));
    }
    throw new Error(`Downloaded .mid at ${path} never settled into a stable, fully-parseable file`);
}

test('Export MIDI downloads a valid multi-track file matching the chart', async ({
    page,
}, testInfo) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: blue }).click();
    await expect(page.getByRole('heading', { name: 'Blue pocket' })).toBeVisible();

    await page.getByRole('button', { name: 'Song actions' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export MIDI' }).click();
    const downloadEvent = await download;
    // Filename derived from the song title, same as `exportSong` (#1277) — the
    // shared exporter appends the extension itself.
    expect(downloadEvent.suggestedFilename()).toBe('Blue pocket.mid');
    // `saveAs` (rather than `path()` + a bare `readFile`) explicitly waits for a
    // complete copy of the download before resolving — this file is ~40KB of
    // binary track data, unlike this suite's other (much smaller, JSON) download
    // assertions. `readSettledMidi` retries the read itself on top of that; see
    // its doc comment for the specific race this suite hits.
    const dest = testInfo.outputPath('export.mid');
    await downloadEvent.saveAs(dest);
    const { parsed } = await readSettledMidi(dest);
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    expect(parsed.format).toBe(1);
    // The conductor track + drums/bass/comp: the band engine's `.mid` sink writes a lead track
    // only when the lead played, and the starter's soloist is off (band/sinks/midi.ts).
    expect(parsed.trackCount).toBe(4);
    expect(parsed.tracks).toHaveLength(4);

    const expectedMspb = Math.round(60_000_000 / STARTER_BPM);
    expect(parsed.tracks[0].tempo).toBe(expectedMspb);

    // The band renders the song once through with its ending (`BandHost.render`), so a little
    // over one loop of this chart.
    const secondsPerStep = 60 / STARTER_BPM / 4;
    const oneLoopSeconds = STARTER_BARS * STEPS_PER_BAR * secondsPerStep;
    const maxTick = Math.max(...parsed.tracks.map((t) => t.maxTick));
    const durationSeconds = (maxTick / parsed.ppq) * (60 / STARTER_BPM);
    expect(durationSeconds).toBeGreaterThan(oneLoopSeconds * 0.95);
    expect(durationSeconds).toBeLessThan(oneLoopSeconds * 1.5);
});

test('Export MIDI during playback does not stop or glitch the band', async ({ page }) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: blue }).click();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();

    // Starting playback enters performance-focus mode (`app/ensemble.tsx`'s
    // `focused`), which hides the header chrome including "Song actions"
    // (`.performance-focus .menu-btn` in app/style.css) — deliberate decluttering
    // for the music stand, not a bug. Exit it via the same toggle a musician
    // would use before opening the menu mid-song.
    await page.getByRole('button', { name: 'Show controls' }).click();
    await page.getByRole('button', { name: 'Song actions' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export MIDI' }).click();
    await download;
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    // Still playing: the export renders the band's own event stream offline and never touches
    // the live host, so the transport must not have stopped or needed a restart.
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});
