import { MODULES } from './constants.js';
import { INTERVAL_CATEGORY, IS_BLACK, RingBuffer } from './visualizer-utils.js';

const { min, max, floor, PI, round, ceil } = Math;

/**
 * @param {number} m
 * @param {number} midY
 * @param {number} centerMidi
 * @param {number} yScale
 * @returns {number}
 */
function getYStandalone(m, midY, centerMidi, yScale) {
    return midY - (m - centerMidi) * yScale;
}

/**
 * @param {number} t
 * @param {number} currentTime
 * @param {number} pianoRollWidth
 * @param {number} timeScale
 * @returns {number}
 */
function getXStandalone(t, currentTime, pianoRollWidth, timeScale) {
    return pianoRollWidth + (currentTime - t) * timeScale;
}

/**
 * VisualizerEngine
 * Pure rendering logic decoupled from the DOM.
 * Operates on Canvas or OffscreenCanvas.
 */
export class VisualizerEngine {
    /**
     * @param {any} canvas
     * @param {any} staticCanvas
     */
    constructor(canvas, staticCanvas) {
        this.canvas = canvas;
        /** @type {any} */
        this.ctx = this.canvas.getContext('2d', { alpha: false });

        this.staticCanvas = staticCanvas;
        /** @type {any} */
        this.staticCtx = this.staticCanvas.getContext('2d', { alpha: false });

        /** @type {Record<string, any>} */
        this.tracks = {};
        /** @type {Array<any>} */
        this.chordEvents = [];
        this.windowSize = 4.0;
        this.visualRange = 60;
        this.centerMidi = 60;
        this.pianoRollWidth = 50;
        /** @type {Record<string, number>} */
        this.registers = { chords: 60 };
        /** @type {number|null} */
        this.beatReferenceTime = null;
        /** @type {any} */
        this.themeCache = null;
        this.isFillActive = false;

        this.cNotesBuffer = new Uint8Array(128);
        /** @type {Array<Array<number>>} */
        this.soloistBuffers = [[], [], [], []];
        /** @type {Array<Array<number>>} */
        this.activeChordBuffers = [[], [], [], []];
        /** @type {Array<Array<number>>} */
        this.guideToneBuffers = [[], [], [], []];

        /** @type {number} */
        this.width = 0;
        /** @type {number} */
        this.height = 0;
        /** @type {number} */
        this.dpr = 1;
        /** @type {number} */
        this.yScale = 1;
        /** @type {number} */
        this.midY = 0;
        /** @type {number} */
        this.timeScale = 1;
    }

    /**
     * @param {any} themeCache
     * @returns {void}
     */
    setTheme(themeCache) {
        this.themeCache = themeCache;
        this.intervalColors = Array.from(INTERVAL_CATEGORY).map(
            (catIndex) => this.themeCache.chordColors[catIndex],
        );
        this.categoryColors = this.themeCache.chordColors;

        if (this.width && this.height) {
            this.renderStaticLayer();
        }
    }

    /**
     * @param {number} width
     * @param {number} height
     * @param {number} [dpr=1]
     * @returns {void}
     */
    resize(width, height, dpr = 1) {
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

        this.yScale = this.height / this.visualRange;
        this.midY = this.height / 2;
        this.timeScale = (this.width - this.pianoRollWidth) / this.windowSize;

        this.renderStaticLayer();
    }

    /**
     * @param {number} m
     * @returns {number}
     */
    getY(m) {
        return getYStandalone(m, this.midY, this.centerMidi, this.yScale);
    }

    /**
     * @param {number} t
     * @param {number} currentTime
     * @returns {number}
     */
    getX(t, currentTime) {
        return getXStandalone(t, currentTime, this.pianoRollWidth, this.timeScale);
    }

    renderStaticLayer() {
        if (!this.themeCache || !this.width || !this.height) {
            return;
        }

        const ctx = this.staticCtx;
        const w = this.width;
        const h = this.height;
        const yScale = this.yScale;

        const {
            bgColor,
            keyWhite,
            keyBlack,
            keySeparator,
            labelColor,
            guideLineBlack,
            guideLineWhite,
            separatorColor,
        } = this.themeCache;

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, w, h);

        const topMidi = this.centerMidi + this.visualRange / 2;
        const bottomMidi = this.centerMidi - this.visualRange / 2;
        const startMidi = floor(bottomMidi);
        const endMidi = ceil(topMidi);

        ctx.lineWidth = 1;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        for (let m = startMidi; m <= endMidi; m++) {
            const y = this.getY(m);
            const noteInOctave = m % 12;
            const isBlack = IS_BLACK[noteInOctave];

            ctx.fillStyle = isBlack ? keyBlack : keyWhite;
            ctx.fillRect(0, y - yScale / 2, this.pianoRollWidth, yScale);

            if (noteInOctave === 0) {
                ctx.fillStyle = labelColor;
                const octave = m / 12 - 1;
                ctx.fillText(`C${octave}`, this.pianoRollWidth - 4, y);
            }
        }

        ctx.strokeStyle = keySeparator;
        ctx.beginPath();
        for (let m = startMidi; m <= endMidi; m++) {
            const y = this.getY(m);
            ctx.moveTo(0, y + yScale / 2);
            ctx.lineTo(this.pianoRollWidth, y + yScale / 2);
        }
        ctx.stroke();

        ctx.strokeStyle = guideLineWhite;
        ctx.beginPath();
        for (let m = startMidi; m <= endMidi; m++) {
            const noteInOctave = m % 12;
            if (!IS_BLACK[noteInOctave]) {
                const y = this.getY(m);
                ctx.moveTo(this.pianoRollWidth, y);
                ctx.lineTo(w, y);
            }
        }
        ctx.stroke();

        ctx.strokeStyle = guideLineBlack;
        ctx.beginPath();
        for (let m = startMidi; m <= endMidi; m++) {
            const noteInOctave = m % 12;
            if (IS_BLACK[noteInOctave]) {
                const y = this.getY(m);
                ctx.moveTo(this.pianoRollWidth, y);
                ctx.lineTo(w, y);
            }
        }
        ctx.stroke();

        ctx.strokeStyle = separatorColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.pianoRollWidth, 0);
        ctx.lineTo(this.pianoRollWidth, h);
        ctx.stroke();
    }

    /**
     * @param {string} name
     * @param {string} color
     * @param {string} [resolvedColor]
     * @returns {void}
     */
    addTrack(name, color, resolvedColor) {
        this.tracks[name] = {
            color,
            resolvedColor: resolvedColor || color,
            history: new RingBuffer(100),
            currentNoteLabel: '',
        };
        if (!this.registers[name]) {
            this.registers[name] = 60;
        }
    }

    /**
     * @param {string} name
     * @param {number} midi
     * @returns {void}
     */
    setRegister(name, midi) {
        this.registers[name] = midi;
    }

    /**
     * @param {number} time
     * @returns {void}
     */
    setBeatReference(time) {
        this.beatReferenceTime = time;
    }

    /**
     * @param {string} name
     * @param {any} event
     * @returns {void}
     */
    pushNote(name, event) {
        if (!this.tracks[name]) {
            return;
        }
        this.tracks[name].history.push(event);
        if (event.noteName && event.octave) {
            this.tracks[name].currentNoteLabel = `${event.noteName}${event.octave}`;
        }
    }

    /**
     * @param {any} event
     * @returns {void}
     */
    pushChord(event) {
        this.chordEvents.push(event);
        while (this.chordEvents.length > 40) {
            this.chordEvents.shift();
        }
    }

    /**
     * @param {string} name
     * @param {number} time
     * @returns {void}
     */
    truncateNotes(name, time) {
        if (!this.tracks[name]) {
            return;
        }
        for (const ev of this.tracks[name].history) {
            const noteEnd = ev.time + (ev.duration || 0.25);
            if (ev.time < time && noteEnd > time) {
                ev.duration = time - ev.time;
            }
        }
    }

    /**
     * @param {number} currentTime
     * @param {number} bpm
     * @param {any} tsConfig
     * @returns {void}
     */
    render(currentTime, bpm, tsConfig) {
        if (!this.themeCache || !this.width || !this.height) {
            return;
        }

        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const graphW = w - this.pianoRollWidth;
        const minTime = currentTime - this.windowSize;
        const yScale = this.yScale;

        const frameXBase = this.pianoRollWidth + currentTime * this.timeScale;
        const frameXScale = this.timeScale;
        const frameYBase = this.midY + this.centerMidi * this.yScale;
        const frameYScale = this.yScale;

        const { chordColors } = this.themeCache;

        ctx.drawImage(this.staticCanvas, 0, 0, w, h);

        const topMidi = this.centerMidi + this.visualRange / 2;
        const bottomMidi = this.centerMidi - this.visualRange / 2;
        const startMidi = floor(bottomMidi);
        const endMidi = ceil(topMidi);

        const minOct = floor(startMidi / 12);
        const maxOct = ceil(endMidi / 12);

        this.cNotesBuffer.fill(0);

        for (let i = 0; i < 4; i++) {
            this.activeChordBuffers[i].length = 0;
        }

        for (const ev of this.chordEvents) {
            if (ev.time > currentTime) {
                break;
            }
            if (ev.time <= currentTime && ev.time + (ev.duration || 2.0) >= currentTime) {
                if (ev.notes) {
                    const rootPC = ev.rootMidi % 12;
                    for (const m of ev.notes) {
                        if (m < startMidi || m > endMidi) {
                            continue;
                        }

                        const interval = ((m % 12) - rootPC + 12) % 12;
                        const y = frameYBase - m * frameYScale;
                        const colorIdx = INTERVAL_CATEGORY[interval];

                        this.activeChordBuffers[colorIdx].push(y);

                        if (m % 12 === 0) {
                            this.cNotesBuffer[m] = 1;
                        }
                    }
                }
            }
        }

        for (let i = 0; i < 4; i++) {
            const buffer = this.activeChordBuffers[i];
            if (buffer.length === 0) {
                continue;
            }

            ctx.fillStyle = this.categoryColors[i];
            ctx.beginPath();
            for (let j = 0; j < buffer.length; j++) {
                ctx.rect(0, buffer[j] - yScale / 2, this.pianoRollWidth, yScale);
            }
            ctx.fill();
        }

        for (const name in this.tracks) {
            const track = this.tracks[name];
            const color = track.resolvedColor || track.color;
            ctx.fillStyle = color;

            const buffer = track.history.buffer;
            const capacity = track.history.capacity;
            const count = track.history.count;
            const start = track.history.start;
            const headLength = min(count, capacity - start);

            let stop = false;
            for (let i = 0; i < headLength; i++) {
                const ev = buffer[start + i];
                if (ev.time > currentTime) {
                    stop = true;
                    break;
                }

                if (ev.time <= currentTime && ev.time + (ev.duration || 0.25) >= currentTime) {
                    if (ev.midi >= startMidi && ev.midi <= endMidi) {
                        const y = this.getY(ev.midi);
                        ctx.fillRect(0, y - yScale / 2, this.pianoRollWidth, yScale);

                        if (ev.midi % 12 === 0) {
                            this.cNotesBuffer[ev.midi] = 1;
                        }
                    }
                }
            }

            if (!stop && headLength < count) {
                const tailLength = count - headLength;
                for (let i = 0; i < tailLength; i++) {
                    const ev = buffer[i];
                    if (ev.time > currentTime) {
                        break;
                    }

                    if (ev.time <= currentTime && ev.time + (ev.duration || 0.25) >= currentTime) {
                        if (ev.midi >= startMidi && ev.midi <= endMidi) {
                            const y = this.getY(ev.midi);
                            ctx.fillRect(0, y - yScale / 2, this.pianoRollWidth, yScale);

                            if (ev.midi % 12 === 0) {
                                this.cNotesBuffer[ev.midi] = 1;
                            }
                        }
                    }
                }
            }
        }

        ctx.fillStyle = '#fff';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        const startC = ceil(startMidi / 12) * 12;
        for (let m = startC; m <= endMidi; m += 12) {
            if (this.cNotesBuffer[m]) {
                const y = this.getY(m);
                const octave = m / 12 - 1;
                ctx.fillText(`C${octave}`, this.pianoRollWidth - 4, y);
            }
        }

        if (bpm && this.beatReferenceTime !== null) {
            const ts =
                typeof tsConfig === 'object' && tsConfig !== null
                    ? tsConfig
                    : { beats: tsConfig || 4, grouping: [tsConfig || 4], stepsPerBeat: 4 };
            const beatsPerMeasure = ts.beats;

            const beatLen = 60 / bpm;
            const startBeat = floor((minTime - this.beatReferenceTime) / beatLen);

            ctx.lineWidth = 1;

            ctx.strokeStyle = this.themeCache.gridColorMeasure;
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
                if (x < this.pianoRollWidth) {
                    continue;
                }

                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
            }
            ctx.stroke();

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
                if (x < this.pianoRollWidth) {
                    continue;
                }

                let isGroupStart = false;
                if (ts.grouping && ts.grouping.length > 1) {
                    let accumulated = 0;
                    for (const g of ts.grouping) {
                        if (beatInMeasure === accumulated) {
                            isGroupStart = true;
                            break;
                        }
                        accumulated += g;
                    }
                }

                if (isGroupStart) {
                    ctx.strokeStyle = this.themeCache.gridColorMeasure;
                    ctx.globalAlpha = 0.4;
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, h);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.globalAlpha = 1.0;
                } else {
                    ctx.strokeStyle = this.themeCache.gridColorBeat;
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, h);
                }
            }
            ctx.stroke();
        }

        if (this.isFillActive) {
            const yMin = this.getY(52);
            const yMax = this.getY(36);
            const fillGradient = ctx.createLinearGradient(
                this.pianoRollWidth,
                yMin,
                this.pianoRollWidth,
                yMax,
            );
            fillGradient.addColorStop(0, 'rgba(211, 54, 130, 0)');
            fillGradient.addColorStop(0.5, 'rgba(211, 54, 130, 0.15)');
            fillGradient.addColorStop(1, 'rgba(211, 54, 130, 0)');
            ctx.fillStyle = fillGradient;
            ctx.fillRect(this.pianoRollWidth, yMin, graphW, yMax - yMin);
        }

        ctx.globalAlpha = 0.1;

        for (let i = 0; i < 4; i++) {
            this.guideToneBuffers[i].length = 0;
        }

        for (const ev of this.chordEvents) {
            const chordEnd = ev.time + (ev.duration || 2.0);
            if (chordEnd < minTime) {
                continue;
            }
            if (ev.time > currentTime) {
                break;
            }

            if (!ev.intervals) {
                continue;
            }

            const start = max(minTime, ev.time);
            const end = min(currentTime, chordEnd);

            const xStart = frameXBase - start * frameXScale;
            const xEnd = frameXBase - end * frameXScale;
            const x = xEnd;
            const cw = xStart - xEnd;
            const rootPC = ev.rootMidi % 12;

            for (const interval of ev.intervals) {
                const pc = (((rootPC + interval) % 12) + 12) % 12;
                const colorIdx = INTERVAL_CATEGORY[((interval % 12) + 12) % 12];
                const buffer = this.guideToneBuffers[colorIdx];

                for (let oct = minOct; oct <= maxOct; oct++) {
                    const m = pc + oct * 12;
                    const y = round(frameYBase - m * frameYScale);
                    if (y >= -10 && y <= h + 10) {
                        buffer.push(x, y - yScale / 2, cw, yScale);
                    }
                }
            }
        }

        for (let i = 0; i < 4; i++) {
            const buffer = this.guideToneBuffers[i];
            if (buffer.length === 0) {
                continue;
            }

            ctx.fillStyle = this.categoryColors[i];
            ctx.beginPath();
            for (let j = 0; j < buffer.length; j += 4) {
                ctx.rect(buffer[j], buffer[j + 1], buffer[j + 2], buffer[j + 3]);
            }
            ctx.fill();
        }

        ctx.globalAlpha = 0.5;

        for (let i = 0; i < 4; i++) {
            this.guideToneBuffers[i].length = 0;
        }

        for (const ev of this.chordEvents) {
            const chordEnd = ev.time + (ev.duration || 2.0);
            if (chordEnd < minTime) {
                continue;
            }
            if (ev.time > currentTime) {
                break;
            }

            if (!ev.notes) {
                continue;
            }

            const start = max(minTime, ev.time);
            const end = min(currentTime, chordEnd);

            const xStart = frameXBase - start * frameXScale;
            const xEnd = frameXBase - end * frameXScale;
            const x = xEnd;
            const cw = xStart - xEnd;
            const rootPC = ev.rootMidi % 12;

            for (const midi of ev.notes) {
                const y = round(frameYBase - midi * frameYScale);
                const interval = ((midi % 12) - rootPC + 12) % 12;
                const colorIdx = INTERVAL_CATEGORY[interval];

                if (y >= -10 && y <= h + 10) {
                    this.guideToneBuffers[colorIdx].push(x, y - yScale / 2 + 2, cw, yScale - 4);
                }
            }
        }

        for (let i = 0; i < 4; i++) {
            const buffer = this.guideToneBuffers[i];
            if (buffer.length === 0) {
                continue;
            }

            ctx.fillStyle = this.categoryColors[i];
            ctx.beginPath();
            for (let j = 0; j < buffer.length; j += 4) {
                ctx.rect(buffer[j], buffer[j + 1], buffer[j + 2], buffer[j + 3]);
            }
            ctx.fill();
        }

        ctx.globalAlpha = 1.0;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // --- Render Info Labels (Track Note Names) ---
        ctx.font = 'bold 1.2rem sans-serif';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        let labelX = this.pianoRollWidth + 10;

        for (const name in this.tracks) {
            const track = this.tracks[name];
            const color = track.resolvedColor || track.color;
            let activeX = -10,
                activeY = -10,
                isActive = false,
                activeColor = null;

            if (track.currentNoteLabel) {
                ctx.fillStyle = color;
                ctx.shadowBlur = 2;
                ctx.shadowColor = '#000';
                ctx.fillText(track.currentNoteLabel, labelX, 10);
                ctx.shadowBlur = 0;
                labelX += ctx.measureText(track.currentNoteLabel).width + 20;
            }

            if (name === 'drums') {
                ctx.fillStyle = track.resolvedColor || track.color;
                ctx.beginPath();

                const buffer = track.history.buffer;
                const capacity = track.history.capacity;
                const count = track.history.count;
                const start = track.history.start;
                const headLength = min(count, capacity - start);
                let stop = false;

                for (let i = 0; i < headLength; i++) {
                    const ev = buffer[start + i];
                    if (ev.time > currentTime) {
                        stop = true;
                        break;
                    }

                    const noteEnd = ev.time + (ev.duration || 0.1);
                    if (noteEnd < minTime) {
                        continue;
                    }

                    const x = frameXBase - ev.time * frameXScale;
                    const y = round(frameYBase - ev.midi * frameYScale);
                    const intensity = ev.velocity || 1.0;

                    ctx.moveTo(x, y - 6 * intensity);
                    ctx.lineTo(x + 4 * intensity, y);
                    ctx.lineTo(x, y + 6 * intensity);
                    ctx.lineTo(x - 4 * intensity, y);
                }

                if (!stop && headLength < count) {
                    const tailLength = count - headLength;
                    for (let i = 0; i < tailLength; i++) {
                        const ev = buffer[i];
                        if (ev.time > currentTime) {
                            break;
                        }

                        const noteEnd = ev.time + (ev.duration || 0.1);
                        if (noteEnd < minTime) {
                            continue;
                        }

                        const x = frameXBase - ev.time * frameXScale;
                        const y = round(frameYBase - ev.midi * frameYScale);
                        const intensity = ev.velocity || 1.0;

                        ctx.moveTo(x, y - 6 * intensity);
                        ctx.lineTo(x + 4 * intensity, y);
                        ctx.lineTo(x, y + 6 * intensity);
                        ctx.lineTo(x - 4 * intensity, y);
                    }
                }

                ctx.fill();
                continue;
            }

            const colorStandard = track.resolvedColor || track.color;

            if (name === MODULES.SOLOIST) {
                const baseWidth = 4;
                for (let b = 0; b < 4; b++) {
                    this.soloistBuffers[b].length = 0;
                }

                const buffer = track.history.buffer;
                const capacity = track.history.capacity;
                const count = track.history.count;
                const start = track.history.start;
                const headLength = min(count, capacity - start);
                let stop = false;

                for (let i = 0; i < headLength; i++) {
                    const ev = buffer[start + i];
                    if (ev.time > currentTime) {
                        stop = true;
                        break;
                    }

                    const noteEnd = ev.time + (ev.duration || 0.25);
                    if (noteEnd < minTime) {
                        continue;
                    }

                    const startT = max(minTime, ev.time);
                    const endT = min(currentTime, noteEnd);
                    const x1 = frameXBase - startT * frameXScale;
                    const x2 = frameXBase - endT * frameXScale;
                    const y = round(frameYBase - ev.midi * frameYScale);

                    if (y >= -10 && y <= h + 10) {
                        let typeCode = 0;
                        if (ev.noteType === 'arp') {
                            typeCode = 1;
                        } else if (ev.noteType === 'target') {
                            typeCode = 2;
                        } else if (ev.noteType === 'altered') {
                            typeCode = 3;
                        }

                        this.soloistBuffers[typeCode].push(x1, y, x2);

                        if (ev.time <= currentTime && noteEnd >= currentTime) {
                            activeX = x2;
                            activeY = y;
                            isActive = true;

                            if (ev.noteType === 'arp') {
                                activeColor = chordColors[2];
                            } else if (ev.noteType === 'target') {
                                activeColor = chordColors[0];
                            } else if (ev.noteType === 'altered') {
                                activeColor = chordColors[3];
                            } else {
                                activeColor = colorStandard;
                            }
                        }
                    }
                }

                if (!stop && headLength < count) {
                    const tailLength = count - headLength;
                    for (let i = 0; i < tailLength; i++) {
                        const ev = buffer[i];
                        if (ev.time > currentTime) {
                            break;
                        }

                        const noteEnd = ev.time + (ev.duration || 0.25);
                        if (noteEnd < minTime) {
                            continue;
                        }

                        const startT = max(minTime, ev.time);
                        const endT = min(currentTime, noteEnd);
                        const x1 = frameXBase - startT * frameXScale;
                        const x2 = frameXBase - endT * frameXScale;
                        const y = round(frameYBase - ev.midi * frameYScale);

                        if (y >= -10 && y <= h + 10) {
                            let typeCode = 0;
                            if (ev.noteType === 'arp') {
                                typeCode = 1;
                            } else if (ev.noteType === 'target') {
                                typeCode = 2;
                            } else if (ev.noteType === 'altered') {
                                typeCode = 3;
                            }

                            this.soloistBuffers[typeCode].push(x1, y, x2);

                            if (ev.time <= currentTime && noteEnd >= currentTime) {
                                activeX = x2;
                                activeY = y;
                                isActive = true;

                                if (ev.noteType === 'arp') {
                                    activeColor = chordColors[2];
                                } else if (ev.noteType === 'target') {
                                    activeColor = chordColors[0];
                                } else if (ev.noteType === 'altered') {
                                    activeColor = chordColors[3];
                                } else {
                                    activeColor = colorStandard;
                                }
                            }
                        }
                    }
                }

                ctx.strokeStyle = this.themeCache.outlineColor;
                ctx.lineWidth = baseWidth + 2;
                ctx.beginPath();
                let hasOutline = false;
                for (let b = 0; b < 4; b++) {
                    const buf = this.soloistBuffers[b];
                    if (buf.length > 0) {
                        hasOutline = true;
                        for (let j = 0; j < buf.length; j += 3) {
                            ctx.moveTo(buf[j], buf[j + 1]);
                            ctx.lineTo(buf[j + 2], buf[j + 1]);
                        }
                    }
                }
                if (hasOutline) {
                    ctx.stroke();
                }

                ctx.lineWidth = baseWidth;
                if (this.soloistBuffers[0].length > 0) {
                    ctx.strokeStyle = colorStandard;
                    ctx.beginPath();
                    const buf = this.soloistBuffers[0];
                    for (let j = 0; j < buf.length; j += 3) {
                        ctx.moveTo(buf[j], buf[j + 1]);
                        ctx.lineTo(buf[j + 2], buf[j + 1]);
                    }
                    ctx.stroke();
                }

                if (this.soloistBuffers[2].length > 0) {
                    ctx.strokeStyle = chordColors[0];
                    ctx.beginPath();
                    const buf = this.soloistBuffers[2];
                    for (let j = 0; j < buf.length; j += 3) {
                        ctx.moveTo(buf[j], buf[j + 1]);
                        ctx.lineTo(buf[j + 2], buf[j + 1]);
                    }
                    ctx.stroke();
                }

                if (this.soloistBuffers[1].length > 0) {
                    ctx.strokeStyle = chordColors[2];
                    ctx.beginPath();
                    const buf = this.soloistBuffers[1];
                    for (let j = 0; j < buf.length; j += 3) {
                        ctx.moveTo(buf[j], buf[j + 1]);
                        ctx.lineTo(buf[j + 2], buf[j + 1]);
                    }
                    ctx.stroke();
                }

                if (this.soloistBuffers[3].length > 0) {
                    ctx.strokeStyle = chordColors[3];
                    ctx.beginPath();
                    const buf = this.soloistBuffers[3];
                    for (let j = 0; j < buf.length; j += 3) {
                        ctx.moveTo(buf[j], buf[j + 1]);
                        ctx.lineTo(buf[j + 2], buf[j + 1]);
                    }
                    ctx.stroke();
                }
            } else {
                const baseWidth = 5;
                let hasNotes = false;
                ctx.beginPath();

                const buffer = track.history.buffer;
                const capacity = track.history.capacity;
                const count = track.history.count;
                const start = track.history.start;
                const headLength = min(count, capacity - start);
                let stop = false;

                for (let i = 0; i < headLength; i++) {
                    const ev = buffer[start + i];
                    if (ev.time > currentTime) {
                        stop = true;
                        break;
                    }

                    const noteEnd = ev.time + (ev.duration || 0.25);
                    if (noteEnd < minTime) {
                        continue;
                    }

                    const startT = max(minTime, ev.time);
                    const endT = min(currentTime, noteEnd);
                    const x1 = frameXBase - startT * frameXScale;
                    const x2 = frameXBase - endT * frameXScale;
                    const y = round(frameYBase - ev.midi * frameYScale);

                    if (y >= -10 && y <= h + 10) {
                        ctx.moveTo(x1, y);
                        ctx.lineTo(x2, y);
                        hasNotes = true;
                        if (ev.time <= currentTime && noteEnd >= currentTime) {
                            activeX = x2;
                            activeY = y;
                            isActive = true;
                            activeColor = colorStandard;
                        }
                    }
                }

                if (!stop && headLength < count) {
                    const tailLength = count - headLength;
                    for (let i = 0; i < tailLength; i++) {
                        const ev = buffer[i];
                        if (ev.time > currentTime) {
                            break;
                        }

                        const noteEnd = ev.time + (ev.duration || 0.25);
                        if (noteEnd < minTime) {
                            continue;
                        }

                        const startT = max(minTime, ev.time);
                        const endT = min(currentTime, noteEnd);
                        const x1 = frameXBase - startT * frameXScale;
                        const x2 = frameXBase - endT * frameXScale;
                        const y = round(frameYBase - ev.midi * frameYScale);

                        if (y >= -10 && y <= h + 10) {
                            ctx.moveTo(x1, y);
                            ctx.lineTo(x2, y);
                            hasNotes = true;
                            if (ev.time <= currentTime && noteEnd >= currentTime) {
                                activeX = x2;
                                activeY = y;
                                isActive = true;
                                activeColor = colorStandard;
                            }
                        }
                    }
                }

                if (hasNotes) {
                    ctx.strokeStyle = this.themeCache.outlineColor;
                    ctx.lineWidth = baseWidth + 2;
                    ctx.stroke();

                    ctx.strokeStyle = colorStandard;
                    ctx.lineWidth = baseWidth;
                    ctx.stroke();
                }
            }

            if (isActive) {
                ctx.fillStyle = activeColor || '#fff';
                ctx.strokeStyle = this.themeCache.outlineColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(activeX, activeY, 6, 0, PI * 2);
                ctx.fill();
                ctx.stroke();
            }
        }

        ctx.strokeStyle = this.themeCache.playheadColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.pianoRollWidth, 0);
        ctx.lineTo(this.pianoRollWidth, h);
        ctx.stroke();
    }

    clear() {
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
