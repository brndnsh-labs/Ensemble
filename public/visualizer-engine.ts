import { MODULES } from './constants.js';
import { VISUALIZER_TRACK_ORDER, VISUALIZER_TRACKS } from './visualizer-events.js';
import { INTERVAL_CATEGORY, RingBuffer } from './visualizer-utils.js';

const { PI, abs, max, min } = Math;
const DEFAULT_TRACK_RANGE = { midiMin: 48, midiMax: 84 };

function getXStandalone(
    t: number,
    currentTime: number,
    labelRailWidth: number,
    timeScale: number,
): number {
    return labelRailWidth + (currentTime - t) * timeScale;
}

function formatTrackLabel(name: string): string {
    return name.charAt(0).toUpperCase() + name.slice(1);
}

interface Lane {
    index: number;
    top: number;
    bottom: number;
    height: number;
    innerTop: number;
    innerBottom: number;
    innerHeight: number;
    mid: number;
}

interface Track {
    color: string;
    resolvedColor: string;
    label: string;
    history: RingBuffer;
    currentNoteLabel: string;
    midiMin: number;
    midiMax: number;
}

/**
 * VisualizerEngine
 * Pure rendering logic decoupled from the DOM.
 * Operates on Canvas or OffscreenCanvas.
 */
export class VisualizerEngine {
    canvas: HTMLCanvasElement | OffscreenCanvas;
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    staticCanvas: HTMLCanvasElement | OffscreenCanvas;
    staticCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    tracks: Record<string, Track>;
    chordEvents: unknown[];
    windowSize: number;
    labelRailWidth: number;
    registers: Record<string, number>;
    beatReferenceTime: number | null;
    themeCache: Record<string, unknown> | null;
    isFillActive: boolean;
    width: number;
    height: number;
    dpr: number;
    timeScale: number;
    trackOrder: string[];
    lanes: Record<string, Lane>;
    categoryColors: string[];
    intervalColors: string[];

    constructor(
        canvas: HTMLCanvasElement | OffscreenCanvas,
        staticCanvas: HTMLCanvasElement | OffscreenCanvas,
    ) {
        this.canvas = canvas;
        this.ctx = this.canvas.getContext('2d', { alpha: false }) as
            | CanvasRenderingContext2D
            | OffscreenCanvasRenderingContext2D;

        this.staticCanvas = staticCanvas;
        this.staticCtx = this.staticCanvas.getContext('2d', { alpha: false }) as
            | CanvasRenderingContext2D
            | OffscreenCanvasRenderingContext2D;

        this.tracks = {};
        this.chordEvents = [];
        this.windowSize = 4.0;
        this.labelRailWidth = 92;
        this.registers = { chords: 60 };
        this.beatReferenceTime = null;
        this.themeCache = null;
        this.isFillActive = false;

        this.width = 0;
        this.height = 0;
        this.dpr = 1;
        this.timeScale = 1;

        this.trackOrder = [...VISUALIZER_TRACK_ORDER];
        this.lanes = {};
        this.categoryColors = [];
        this.intervalColors = [];
    }

    setTheme(themeCache: Record<string, unknown>): void {
        this.themeCache = themeCache;
        this.categoryColors = (themeCache.chordColors as string[]) || [
            '#268bd2',
            '#859900',
            '#cb4b16',
            '#d33682',
        ];
        this.intervalColors = Array.from(INTERVAL_CATEGORY).map(
            (categoryIndex) => this.categoryColors[categoryIndex],
        );

        if (this.width && this.height) {
            this.renderStaticLayer();
        }
    }

    resize(width: number, height: number, dpr = 1): void {
        this.width = width;
        this.height = height;
        this.dpr = dpr;

        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.ctx.resetTransform();
        this.ctx.scale(dpr, dpr);

        this.staticCanvas.width = width * dpr;
        this.staticCanvas.height = height * dpr;
        this.staticCtx.resetTransform();
        this.staticCtx.scale(dpr, dpr);

        this.timeScale = max(1, (this.width - this.labelRailWidth) / this.windowSize);

        this.renderStaticLayer();
    }

    getX(t: number, currentTime: number): number {
        return getXStandalone(t, currentTime, this.labelRailWidth, this.timeScale);
    }

    setRegister(name: string, midi: number): void {
        this.registers[name] = midi;
    }

    setBeatReference(time: number): void {
        this.beatReferenceTime = time;
    }

    getTrackOrder(): string[] {
        return VISUALIZER_TRACK_ORDER.filter((name) => this.tracks[name]);
    }

    buildLaneLayout(): void {
        const order = this.getTrackOrder();
        this.trackOrder = order.length > 0 ? order : [...VISUALIZER_TRACK_ORDER];

        const count = max(this.trackOrder.length, 1);
        const laneHeight = this.height / count;
        const lanes: Record<string, Lane> = {};

        this.trackOrder.forEach((name, index) => {
            const top = index * laneHeight;
            const bottom = top + laneHeight;
            const innerTop = top + 8;
            const innerBottom = bottom - 8;
            lanes[name] = {
                index,
                top,
                bottom,
                height: laneHeight,
                innerTop,
                innerBottom,
                innerHeight: max(12, innerBottom - innerTop),
                mid: (innerTop + innerBottom) / 2,
            };
        });

        this.lanes = lanes;
    }

    renderStaticLayer(): void {
        if (!this.themeCache || !this.width || !this.height) {
            return;
        }

        this.buildLaneLayout();

        const ctx = this.staticCtx;
        const w = this.width;
        const h = this.height;
        const graphX = this.labelRailWidth;
        const graphW = w - graphX;

        const bgColor = (this.themeCache.bgColor as string) || '#0f172a';
        const labelRailBg =
            (this.themeCache.labelRailBg as string) ||
            (this.themeCache.keyBlack as string) ||
            '#111827';
        const laneBg = (this.themeCache.laneBg as string) || 'rgba(255, 255, 255, 0.025)';
        const laneAltBg = (this.themeCache.laneAltBg as string) || 'rgba(255, 255, 255, 0.05)';
        const laneGuideColor =
            (this.themeCache.laneGuideColor as string) ||
            (this.themeCache.guideLineWhite as string) ||
            'rgba(255,255,255,0.04)';
        const separatorColor =
            (this.themeCache.separatorColor as string) || 'rgba(148, 163, 184, 0.24)';
        const trackLabelColor =
            (this.themeCache.trackLabelColor as string) ||
            (this.themeCache.labelColor as string) ||
            '#cbd5e1';
        const noteLabelColor =
            (this.themeCache.noteLabelColor as string) ||
            (this.themeCache.labelColor as string) ||
            '#94a3b8';

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = labelRailBg;
        ctx.fillRect(0, 0, graphX, h);

        for (const name of this.trackOrder) {
            const lane = this.lanes[name];
            const track = this.tracks[name];
            const trackColor = track?.resolvedColor || track?.color || '#ffffff';
            const laneFill = lane.index % 2 === 0 ? laneBg : laneAltBg;

            ctx.fillStyle = laneFill;
            ctx.fillRect(graphX, lane.top, graphW, lane.height);

            ctx.globalAlpha = 0.9;
            ctx.fillStyle = trackColor;
            ctx.fillRect(0, lane.top, 5, lane.height);
            ctx.globalAlpha = 1.0;

            ctx.fillStyle = trackLabelColor;
            ctx.font = '600 12px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(track?.label || formatTrackLabel(name), 12, lane.top + 10);

            ctx.fillStyle = noteLabelColor;
            ctx.font = '10px sans-serif';
            ctx.fillText('Timeline', 12, lane.top + 28);

            ctx.strokeStyle = laneGuideColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(graphX, lane.innerTop + lane.innerHeight / 3);
            ctx.lineTo(w, lane.innerTop + lane.innerHeight / 3);
            ctx.moveTo(graphX, lane.innerTop + (lane.innerHeight * 2) / 3);
            ctx.lineTo(w, lane.innerTop + (lane.innerHeight * 2) / 3);
            ctx.stroke();

            ctx.strokeStyle = separatorColor;
            ctx.beginPath();
            ctx.moveTo(0, lane.bottom);
            ctx.lineTo(w, lane.bottom);
            ctx.stroke();
        }

        ctx.strokeStyle = separatorColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(graphX, 0);
        ctx.lineTo(graphX, h);
        ctx.stroke();
    }

    addTrack(name: string, color: string, resolvedColor?: string, label?: string): void {
        const meta = VISUALIZER_TRACKS[name as keyof typeof VISUALIZER_TRACKS];
        const capacity = name === 'drums' ? 240 : name === 'chords' ? 180 : 140;
        this.tracks[name] = {
            color,
            resolvedColor: resolvedColor || color,
            label: label || formatTrackLabel(name),
            history: new RingBuffer(capacity),
            currentNoteLabel: '',
            midiMin: meta?.midiMin ?? DEFAULT_TRACK_RANGE.midiMin,
            midiMax: meta?.midiMax ?? DEFAULT_TRACK_RANGE.midiMax,
        };
        if (!this.registers[name]) {
            this.registers[name] = 60;
        }
        if (this.width && this.height && this.themeCache) {
            this.renderStaticLayer();
        }
    }

    pushNote(name: string, event: unknown): void {
        if (!this.tracks[name]) {
            return;
        }
        this.tracks[name].history.push(event);
        const ev = event as { noteName?: string; octave?: number };
        if (ev.noteName && typeof ev.octave === 'number') {
            this.tracks[name].currentNoteLabel = `${ev.noteName}${ev.octave}`;
        }
    }

    pushChord(event: unknown): void {
        this.chordEvents.push(event);
        while (this.chordEvents.length > 40) {
            this.chordEvents.shift();
        }
    }

    truncateNotes(name: string, time: number): void {
        if (!this.tracks[name]) {
            return;
        }
        for (const ev of this.tracks[name].history) {
            const e = ev as { time: number; duration?: number };
            const noteEnd = e.time + (e.duration || 0.25);
            if (e.time < time && noteEnd > time) {
                e.duration = time - e.time;
            }
        }
    }

    getTrackMidiRange(name: string): { midiMin: number; midiMax: number } {
        const track = this.tracks[name];
        return {
            midiMin: track?.midiMin ?? DEFAULT_TRACK_RANGE.midiMin,
            midiMax: track?.midiMax ?? DEFAULT_TRACK_RANGE.midiMax,
        };
    }

    getLane(name: string): Lane | null {
        return this.lanes[name] || null;
    }

    getLaneY(name: string, midi: number): number {
        const lane = this.getLane(name);
        if (!lane) {
            return 0;
        }
        const { midiMin, midiMax } = this.getTrackMidiRange(name);
        const span = max(1, midiMax - midiMin);
        const clampedMidi = max(midiMin, min(midiMax, midi));
        const ratio = (clampedMidi - midiMin) / span;
        return lane.innerBottom - ratio * lane.innerHeight;
    }

    getTrackThickness(name: string): number {
        const lane = this.getLane(name);
        if (!lane) {
            return 4;
        }
        if (name === 'drums') {
            return max(5, min(9, lane.innerHeight * 0.14));
        }
        return max(3, min(7, lane.innerHeight * 0.08));
    }

    getEventColor(name: string, event: unknown): string {
        const track = this.tracks[name];
        const baseColor = track?.resolvedColor || track?.color || '#ffffff';
        const chordColors = this.categoryColors || ['#268bd2', '#859900', '#cb4b16', '#d33682'];
        const ev = event as { noteType?: string };

        if (name === MODULES.SOLOIST) {
            if (ev.noteType === 'target') {
                return chordColors[0] || baseColor;
            }
            if (ev.noteType === 'arp') {
                return chordColors[2] || baseColor;
            }
            if (ev.noteType === 'altered') {
                return chordColors[3] || baseColor;
            }
        }

        return baseColor;
    }

    getEventLabel(event: unknown): string {
        const ev = event as { noteName?: string; octave?: number };
        if (ev.noteName && typeof ev.octave === 'number') {
            return `${ev.noteName}${ev.octave}`;
        }
        return '';
    }

    forEachHistoryEvent(history: RingBuffer, visit: (event: unknown) => boolean | undefined): void {
        const buffer = history.buffer;
        const capacity = history.capacity;
        const count = history.count;
        const start = history.start;
        const headLength = min(count, capacity - start);

        for (let i = 0; i < headLength; i++) {
            if (visit(buffer[start + i]) === false) {
                return;
            }
        }

        if (headLength >= count) {
            return;
        }

        const tailLength = count - headLength;
        for (let i = 0; i < tailLength; i++) {
            if (visit(buffer[i]) === false) {
                return;
            }
        }
    }

    forEachVisibleTrackEvent(
        name: string,
        currentTime: number,
        minTime: number,
        visit: (event: unknown, noteEnd: number) => void,
    ): void {
        const track = this.tracks[name];
        if (!track) {
            return;
        }

        this.forEachHistoryEvent(track.history, (event) => {
            if (!event) {
                return true;
            }
            const ev = event as { time: number; duration?: number };
            if (ev.time > currentTime) {
                return false;
            }

            const defaultDuration = name === 'drums' ? 0.1 : 0.25;
            const noteEnd = ev.time + (ev.duration || defaultDuration);
            if (noteEnd < minTime) {
                return true;
            }

            visit(event, noteEnd);
            return true;
        });
    }

    forEachVisibleChordEvent(
        currentTime: number,
        minTime: number,
        visit: (event: unknown, chordEnd: number) => void,
    ): void {
        for (const event of this.chordEvents) {
            const ev = event as { time: number; duration?: number };
            const chordEnd = ev.time + (ev.duration || 2.0);
            if (chordEnd < minTime) {
                continue;
            }
            if (ev.time > currentTime) {
                break;
            }
            visit(event, chordEnd);
        }
    }

    getChordOverlayEntries(
        laneName: string,
        event: unknown,
    ): Array<{ midi: number; colorIdx: number }> {
        const { midiMin, midiMax } = this.getTrackMidiRange(laneName);
        const ev = event as {
            rootMidi: number;
            notes?: number[];
            chordNotes?: number[];
            intervals?: number[];
        };
        const rootPc = ((ev.rootMidi % 12) + 12) % 12;
        const notes: number[] = Array.isArray(ev.notes)
            ? ev.notes
            : Array.isArray(ev.chordNotes)
              ? ev.chordNotes
              : [];

        if (laneName === 'chords' && notes.length > 0) {
            return notes
                .filter((midi) => midi >= midiMin && midi <= midiMax)
                .map((midi) => ({
                    midi,
                    colorIdx: INTERVAL_CATEGORY[((midi % 12) - rootPc + 12) % 12],
                }));
        }

        const intervalSource: number[] =
            Array.isArray(ev.intervals) && ev.intervals.length > 0
                ? ev.intervals
                : notes.map((midi) => ((midi % 12) - rootPc + 12) % 12);
        const uniqueIntervals = [
            ...new Set(intervalSource.map((interval) => ((interval % 12) + 12) % 12)),
        ];
        const overlayEntries: Array<{ midi: number; colorIdx: number }> = [];
        const seenMidis = new Set<number>();
        const minOctave = Math.floor(midiMin / 12) - 1;
        const maxOctave = Math.ceil(midiMax / 12) + 1;

        for (const interval of uniqueIntervals) {
            const pc = (rootPc + interval) % 12;
            const colorIdx = INTERVAL_CATEGORY[interval];
            for (let octave = minOctave; octave <= maxOctave; octave++) {
                const midi = pc + octave * 12;
                if (midi < midiMin || midi > midiMax || seenMidis.has(midi)) {
                    continue;
                }
                seenMidis.add(midi);
                overlayEntries.push({ midi, colorIdx });
            }
        }

        return overlayEntries.sort((a, b) => a.midi - b.midi);
    }

    drawVerticalGrid(currentTime: number, bpm: number, tsConfig: unknown): void {
        if (!bpm || this.beatReferenceTime === null) {
            return;
        }

        const ctx = this.ctx;
        const h = this.height;
        const minTime = currentTime - this.windowSize;
        const tsRaw = tsConfig as
            | { beats: number; grouping?: number[]; stepsPerBeat: number }
            | number
            | null;
        const ts =
            typeof tsRaw === 'object' && tsRaw !== null
                ? tsRaw
                : {
                      beats: (tsRaw as number) || 4,
                      grouping: [(tsRaw as number) || 4],
                      stepsPerBeat: 4,
                  };
        const beatsPerMeasure = ts.beats;
        const beatLen = 60 / bpm;
        const startBeat = Math.floor((minTime - this.beatReferenceTime) / beatLen);

        ctx.lineWidth = 1;

        ctx.strokeStyle =
            (this.themeCache?.gridColorMeasure as string) || 'rgba(56, 189, 248, 0.35)';
        ctx.beginPath();
        for (let i = startBeat; ; i++) {
            const t = this.beatReferenceTime + i * beatLen;
            if (t > currentTime + 0.1) {
                break;
            }

            if (i % beatsPerMeasure !== 0) {
                continue;
            }

            const x = this.getX(t, currentTime);
            if (x < this.labelRailWidth) {
                continue;
            }

            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }
        ctx.stroke();

        ctx.strokeStyle = (this.themeCache?.gridColorBeat as string) || 'rgba(255, 255, 255, 0.08)';
        ctx.beginPath();
        for (let i = startBeat; ; i++) {
            const t = this.beatReferenceTime + i * beatLen;
            if (t > currentTime + 0.1) {
                break;
            }

            const beatInMeasure = ((i % beatsPerMeasure) + beatsPerMeasure) % beatsPerMeasure;
            if (beatInMeasure === 0) {
                continue;
            }

            const x = this.getX(t, currentTime);
            if (x < this.labelRailWidth) {
                continue;
            }

            let isGroupStart = false;
            if (ts.grouping && ts.grouping.length > 1) {
                let accumulated = 0;
                for (const group of ts.grouping) {
                    if (beatInMeasure === accumulated) {
                        isGroupStart = true;
                        break;
                    }
                    accumulated += group;
                }
            }

            ctx.globalAlpha = isGroupStart ? 0.7 : 1.0;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.globalAlpha = 1.0;
        }
        ctx.stroke();
    }

    drawChordLaneBackdrop(currentTime: number, minTime: number): void {
        const ctx = this.ctx;
        const overlayConfigs = [
            {
                laneName: 'chords',
                alpha: 0.16,
                toneHeight: 4,
                showMarkers: true,
                showLabels: true,
            },
            {
                laneName: MODULES.SOLOIST,
                alpha: 0.08,
                toneHeight: 3,
                showMarkers: false,
                showLabels: false,
            },
        ];

        for (const config of overlayConfigs) {
            const lane = this.getLane(config.laneName);
            const track = this.tracks[config.laneName];
            if (!lane || !track) {
                continue;
            }

            const trackColor = track.resolvedColor || track.color || '#268bd2';
            const markerColor =
                (this.themeCache?.chordMarkerColor as string) ||
                (this.themeCache?.separatorColor as string) ||
                trackColor;
            const labelColor =
                (this.themeCache?.trackLabelColor as string) ||
                (this.themeCache?.labelColor as string) ||
                trackColor;

            this.forEachVisibleChordEvent(currentTime, minTime, (event, chordEnd) => {
                const ev = event as { time: number; label?: string };
                const start = max(minTime, ev.time);
                const end = min(currentTime, chordEnd);
                const xStart = this.getX(start, currentTime);
                const xEnd = this.getX(end, currentTime);
                const left = min(xStart, xEnd);
                const width = max(2, abs(xStart - xEnd));
                const overlayEntries = this.getChordOverlayEntries(config.laneName, event);

                if (overlayEntries.length > 0) {
                    ctx.globalAlpha = config.alpha;
                    for (const entry of overlayEntries) {
                        const y = this.getLaneY(config.laneName, entry.midi);
                        ctx.fillStyle = this.categoryColors[entry.colorIdx] || trackColor;
                        ctx.beginPath();
                        ctx.rect(left, y - config.toneHeight / 2, width, config.toneHeight);
                        ctx.fill();
                    }
                    ctx.globalAlpha = 1.0;
                }

                if (config.showMarkers) {
                    ctx.strokeStyle = markerColor;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(left, lane.top);
                    ctx.lineTo(left, lane.bottom);
                    ctx.stroke();
                }

                if (config.showLabels && ev.label && width > 28) {
                    ctx.fillStyle = labelColor;
                    ctx.font = '11px sans-serif';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    ctx.fillText(ev.label, left + 4, lane.top + 6);
                }
            });
        }
    }

    drawFillOverlay(): void {
        if (!this.isFillActive) {
            return;
        }

        const lane = this.getLane('drums');
        if (!lane) {
            return;
        }

        const ctx = this.ctx;
        const fillGradient = ctx.createLinearGradient(
            this.labelRailWidth,
            lane.top,
            this.labelRailWidth,
            lane.bottom,
        );
        fillGradient.addColorStop(
            0,
            (this.themeCache?.fillGradientTop as string) || 'rgba(211, 54, 130, 0)',
        );
        fillGradient.addColorStop(
            0.5,
            (this.themeCache?.fillGradientMid as string) || 'rgba(211, 54, 130, 0.16)',
        );
        fillGradient.addColorStop(
            1,
            (this.themeCache?.fillGradientBottom as string) || 'rgba(211, 54, 130, 0)',
        );
        ctx.fillStyle = fillGradient;
        ctx.fillRect(this.labelRailWidth, lane.top, this.width - this.labelRailWidth, lane.height);
    }

    drawTrackNotes(currentTime: number, minTime: number): void {
        const ctx = this.ctx;
        const outlineColor = (this.themeCache?.outlineColor as string) || '#ffffff';
        const noteLabelColor =
            (this.themeCache?.noteLabelColor as string) ||
            (this.themeCache?.labelColor as string) ||
            '#94a3b8';

        for (const name of this.trackOrder) {
            const track = this.tracks[name];
            const lane = this.getLane(name);
            if (!track || !lane) {
                continue;
            }

            let activeX = 0;
            let activeY = 0;
            let activeColor = track.resolvedColor || track.color || '#ffffff';
            let activeLabel = '';
            let hasActive = false;

            if (name === 'drums') {
                ctx.fillStyle = track.resolvedColor || track.color || '#ffffff';
                ctx.beginPath();
                this.forEachVisibleTrackEvent(name, currentTime, minTime, (event, noteEnd) => {
                    const ev = event as { time: number; midi: number; velocity?: number };
                    const x = this.getX(ev.time, currentTime);
                    const y = this.getLaneY(name, ev.midi);
                    const size = 2 + (ev.velocity || 1.0) * 2.5;
                    ctx.moveTo(x, y - size);
                    ctx.lineTo(x + size, y);
                    ctx.lineTo(x, y + size);
                    ctx.lineTo(x - size, y);
                    if (ev.time <= currentTime && noteEnd >= currentTime) {
                        hasActive = true;
                        activeX = x;
                        activeY = y;
                    }
                });
                ctx.fill();
            } else {
                this.forEachVisibleTrackEvent(name, currentTime, minTime, (event, noteEnd) => {
                    const ev = event as { time: number; midi: number };
                    const start = max(minTime, ev.time);
                    const end = min(currentTime, noteEnd);
                    const xStart = this.getX(start, currentTime);
                    const xEnd = this.getX(end, currentTime);
                    const left = min(xStart, xEnd);
                    const width = max(2, abs(xStart - xEnd));
                    const y = this.getLaneY(name, ev.midi);
                    const thickness = this.getTrackThickness(name);
                    const eventColor = this.getEventColor(name, event);

                    ctx.fillStyle = outlineColor;
                    ctx.fillRect(left, y - thickness / 2 - 0.5, width, thickness + 1);
                    ctx.fillStyle = eventColor;
                    ctx.fillRect(left, y - thickness / 2, width, thickness);

                    if (ev.time <= currentTime && noteEnd >= currentTime) {
                        hasActive = true;
                        activeX = xEnd;
                        activeY = y;
                        activeColor = eventColor;
                        activeLabel = this.getEventLabel(event);
                    }
                });
            }

            if (hasActive) {
                ctx.fillStyle = activeColor;
                ctx.beginPath();
                ctx.arc(activeX, activeY, 5, 0, PI * 2);
                ctx.fill();
                ctx.strokeStyle = outlineColor;
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            if (activeLabel) {
                ctx.fillStyle = noteLabelColor;
                ctx.font = '11px sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(activeLabel, 12, lane.top + 44);
            }
        }
    }

    render(currentTime: number, bpm: number, tsConfig: unknown): void {
        if (!this.themeCache || !this.width || !this.height) {
            return;
        }

        if (!this.trackOrder.length || !this.lanes[this.trackOrder[0]]) {
            this.buildLaneLayout();
        }

        const ctx = this.ctx;
        const h = this.height;
        const minTime = currentTime - this.windowSize;

        ctx.drawImage(this.staticCanvas as CanvasImageSource, 0, 0, this.width, this.height);

        this.drawVerticalGrid(currentTime, bpm, tsConfig);
        this.drawChordLaneBackdrop(currentTime, minTime);
        this.drawFillOverlay();
        this.drawTrackNotes(currentTime, minTime);

        ctx.strokeStyle = (this.themeCache?.playheadColor as string) || 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.labelRailWidth, 0);
        ctx.lineTo(this.labelRailWidth, h);
        ctx.stroke();
    }

    clear(): void {
        for (const name in this.tracks) {
            this.tracks[name].history.clear();
            this.tracks[name].currentNoteLabel = '';
        }
        this.chordEvents = [];
        if (this.width && this.height) {
            this.ctx.clearRect(0, 0, this.width, this.height);
        }
    }
}
