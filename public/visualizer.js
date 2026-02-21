const IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];

const INTERVAL_CATEGORY = [
    'root', // 0
    'seventh', // 1
    'seventh', // 2
    'third', // 3
    'third', // 4
    'seventh', // 5
    'seventh', // 6
    'fifth', // 7
    'seventh', // 8
    'seventh', // 9
    'seventh', // 10
    'seventh', // 11
];

// Optimization: Map interval indices (0-11) to color categories (0-3)
// 0=root, 1=third, 2=fifth, 3=seventh
const INTERVAL_COLOR_INDEX = [0, 3, 3, 1, 1, 3, 3, 2, 3, 3, 3, 3];

class RingBuffer {
    constructor(capacity) {
        this.buffer = new Array(capacity);
        this.capacity = capacity;
        this.start = 0;
        this.count = 0;
    }

    get length() {
        return this.count;
    }

    push(item) {
        if (this.count < this.capacity) {
            this.buffer[(this.start + this.count) % this.capacity] = item;
            this.count++;
        } else {
            this.buffer[this.start] = item;
            this.start = (this.start + 1) % this.capacity;
        }
    }

    at(index) {
        if (index < 0 || index >= this.count) {
            return undefined;
        }
        return this.buffer[(this.start + index) % this.capacity];
    }

    clear() {
        this.start = 0;
        this.count = 0;
    }

    *[Symbol.iterator]() {
        for (let i = 0; i < this.count; i++) {
            yield this.at(i);
        }
    }

    /**
     * Optimized iteration that avoids modulo operations per element.
     * @param {function(item, index): boolean|void} callback - Return false to break loop
     */
    forEach(callback) {
        const buffer = this.buffer;
        const capacity = this.capacity;
        const count = this.count;
        const start = this.start;

        // Loop 1: start to end of buffer (or count if no wrap)
        const headLength = Math.min(count, capacity - start);
        for (let i = 0; i < headLength; i++) {
            if (callback(buffer[start + i], i) === false) {
                return;
            }
        }

        // Loop 2: wrapped part
        if (headLength < count) {
            const tailLength = count - headLength;
            for (let i = 0; i < tailLength; i++) {
                if (callback(buffer[i], headLength + i) === false) {
                    return;
                }
            }
        }
    }
}

export class UnifiedVisualizer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.warn(
                `[Visualizer] Container #${containerId} not found. Deferring initialization.`,
            );
        }

        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false }); // Optimization: no transparency

        // Static layer optimization
        this.staticCanvas = document.createElement('canvas');
        this.staticCtx = this.staticCanvas.getContext('2d', { alpha: false });

        if (this.container) {
            this.container.appendChild(this.canvas);
        }

        this.tracks = {}; // { name: { color, history: [] } }
        this.chordEvents = []; // { time, notes: [], duration, rootMidi, intervals }
        this.windowSize = 4.0; // Seconds to show
        this.visualRange = 60; // Semitones visual height (5 octaves) for absolute pitch
        this.centerMidi = 60; // Middle C is center
        this.pianoRollWidth = 50;
        this.registers = { chords: 60 };
        this.beatReferenceTime = null;
        this.themeCache = null; // Lazy init
        this.isFillActive = false;

        // Initial theme cache population
        if (typeof document !== 'undefined' && document.documentElement) {
            this.updateThemeCache();
        }

        // Optimization: Track which C-notes are covered by highlights to redraw labels
        this.cNotesBuffer = new Uint8Array(128);

        // Optimization: Shared buffer for calculated geometry
        this.geometryBuffer = [];
        this.soloistBuffers = [[], [], [], []];

        // Optimization: Batched rendering buffers
        // 4 categories: Root, Third, Fifth, Seventh
        this.activeChordBuffers = [[], [], [], []]; // Stores Y coordinates
        this.guideToneBuffers = [[], [], [], []]; // Stores [x, y, w, h] flat layout

        if (this.container) {
            this.initDOM();
        }

        // Observe theme changes
        this.themeObserver = new MutationObserver((mutations) => {
            if (
                mutations.some((m) => m.type === 'attributes' && m.attributeName === 'data-theme')
            ) {
                this.updateThemeCache();
            }
        });
        this.themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        });

        this.themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        this.themeListener = () => this.updateThemeCache();
        this.themeMediaQuery.addEventListener('change', this.themeListener);

        // Robust resizing with ResizeObserver
        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                this.resize(entry.contentRect);
            }
        });

        if (this.container) {
            this.resizeObserver.observe(this.container);
        }
    }

    updateThemeCache() {
        if (!document.documentElement) {
            return;
        }

        const style = getComputedStyle(document.documentElement);
        const isDark =
            document.documentElement.getAttribute('data-theme') === 'dark' ||
            (document.documentElement.getAttribute('data-theme') === 'auto' &&
                window.matchMedia('(prefers-color-scheme: dark)').matches);

        this.themeCache = {
            bgColor: isDark ? '#0f172a' : '#f8fafc',
            keyWhite: isDark ? '#cbd5e1' : '#ffffff',
            keyBlack: isDark ? '#1e293b' : '#1e293b',
            keySeparator: isDark ? '#334155' : '#e2e8f0',
            gridColorMeasure: isDark ? 'rgba(56, 189, 248, 0.4)' : 'rgba(2, 132, 199, 0.3)',
            gridColorBeat: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
            playheadColor: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)',
            outlineColor: isDark ? '#000' : '#fff',
            labelColor: isDark ? '#64748b' : '#94a3b8',
            guideLineBlack: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
            guideLineWhite: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)',
            separatorColor: isDark ? '#334155' : '#cbd5e1',
            chordColors: {
                root: style.getPropertyValue('--blue').trim() || '#268bd2',
                third: style.getPropertyValue('--green').trim() || '#859900',
                fifth: style.getPropertyValue('--orange').trim() || '#cb4b16',
                seventh: style.getPropertyValue('--magenta').trim() || '#d33682',
            },
        };

        // Optimization: Pre-calculate interval color lookup
        this.intervalColors = INTERVAL_CATEGORY.map((cat) => this.themeCache.chordColors[cat]);
        this.categoryColors = [
            this.themeCache.chordColors.root,
            this.themeCache.chordColors.third,
            this.themeCache.chordColors.fifth,
            this.themeCache.chordColors.seventh,
        ];

        // Update track colors
        for (const name in this.tracks) {
            this.resolveTrackColor(name, style);
        }

        // Force redraw of static layer if initialized
        if (this.width && this.height) {
            this.renderStaticLayer();
        }
    }

    resolveTrackColor(name, style = null) {
        if (!this.tracks[name]) {
            return;
        }
        const track = this.tracks[name];
        if (track.color.startsWith('var(')) {
            if (!style) {
                style = getComputedStyle(document.documentElement);
            }
            const varName = track.color.slice(4, -1);
            track.resolvedColor = style.getPropertyValue(varName).trim() || '#3b82f6';
        } else {
            track.resolvedColor = track.color;
        }
    }

    initDOM() {
        this.container.style.position = 'relative';
        this.canvas.style.display = 'block';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';

        // Info Overlay Layer (stays HTML for sharp text)
        this.infoLayer = document.createElement('div');
        this.infoLayer.style.cssText = `
            position: absolute; top: 10px; left: ${this.pianoRollWidth + 10}px; right: 10px;
            display: flex; justify-content: space-between;
            pointer-events: none; z-index: var(--z-controls);
        `;
        this.container.appendChild(this.infoLayer);
    }

    resize(contentRect) {
        const dpr = window.devicePixelRatio || 1;
        // Use provided rect or fallback to getBoundingClientRect
        const rect = contentRect ||
            this.container?.getBoundingClientRect() || { width: 0, height: 0 };

        // Ensure we have non-zero dimensions to avoid canvas errors
        if (rect.width === 0 || rect.height === 0) {
            return;
        }

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.width = rect.width;
        this.height = rect.height;
        this.ctx.scale(dpr, dpr);

        // Optimization: Cache geometry calculations to avoid per-frame re-calculation
        this.yScale = this.height / this.visualRange;
        this.midY = this.height / 2;
        this.timeScale = (this.width - this.pianoRollWidth) / this.windowSize;

        // Resize static layer
        this.staticCanvas.width = this.canvas.width;
        this.staticCanvas.height = this.canvas.height;
        this.staticCtx.scale(dpr, dpr);

        this.renderStaticLayer();
    }

    // Optimization: Stable method for Y calculation to avoid closure allocation
    getY(m) {
        return this.midY - (m - this.centerMidi) * this.yScale;
    }

    // Optimization: Stable method for X calculation to avoid closure allocation
    getX(t, currentTime) {
        return this.pianoRollWidth + (currentTime - t) * this.timeScale;
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

        // Background
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, w, h);

        const topMidi = this.centerMidi + this.visualRange / 2;
        const bottomMidi = this.centerMidi - this.visualRange / 2;
        const startMidi = Math.floor(bottomMidi);
        const endMidi = Math.ceil(topMidi);

        ctx.lineWidth = 1;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        // Pass 1: Keys & Labels
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

        // Pass 2: Separators
        ctx.strokeStyle = keySeparator;
        ctx.beginPath();
        for (let m = startMidi; m <= endMidi; m++) {
            const y = this.getY(m);
            ctx.moveTo(0, y + yScale / 2);
            ctx.lineTo(this.pianoRollWidth, y + yScale / 2);
        }
        ctx.stroke();

        // Pass 3: Guide Lines
        // White
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

        // Black
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

        // Vertical Separator
        ctx.strokeStyle = separatorColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.pianoRollWidth, 0);
        ctx.lineTo(this.pianoRollWidth, h);
        ctx.stroke();
    }

    addTrack(name, color) {
        const label = document.createElement('div');
        label.style.color = color;
        label.style.fontWeight = 'bold';
        label.style.fontSize = '1.2rem';
        label.style.textShadow = `0 0 2px #000`;
        label.textContent = '';
        this.infoLayer.appendChild(label);

        this.tracks[name] = {
            color,
            history: new RingBuffer(100),
            label,
        };
        this.resolveTrackColor(name);
        if (!this.registers[name]) {
            this.registers[name] = 60;
        }
    }

    setRegister(name, midi) {
        this.registers[name] = midi;
    }

    setBeatReference(time) {
        this.beatReferenceTime = time;
    }

    pushNote(name, event) {
        if (!this.tracks[name]) {
            return;
        }
        this.tracks[name].history.push(event);
        if (event.noteName && event.octave) {
            this.tracks[name].label.textContent = `${event.noteName}${event.octave}`;
        }
    }

    pushChord(event) {
        // Optimization: Avoid allocation by using event object directly.
        // The caller is responsible for passing an owned object.
        this.chordEvents.push(event);

        while (this.chordEvents.length > 40) {
            this.chordEvents.shift();
        }
    }

    /**
     * Truncates any active notes on a track to end at the specified time.
     * Used for enforcing monophony in the visualizer.
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

    render(currentTime, bpm, beatsPerMeasure = 4) {
        if (!this.container) {
            return;
        }

        if (!this.themeCache) {
            this.updateThemeCache();
        }

        if (!this.width || !this.height) {
            this.resize();
        }

        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const graphW = w - this.pianoRollWidth;
        const minTime = currentTime - this.windowSize;
        const yScale = this.yScale;

        // Use cached theme-aware colors
        const { gridColorMeasure, gridColorBeat, playheadColor, outlineColor, chordColors } =
            this.themeCache;

        // 0. Static Background
        // Optimization: Draw pre-rendered static layer
        ctx.drawImage(this.staticCanvas, 0, 0, w, h);

        // --- Piano Roll Layer (Active Overlays) ---
        const topMidi = this.centerMidi + this.visualRange / 2;
        const bottomMidi = this.centerMidi - this.visualRange / 2;
        const startMidi = Math.floor(bottomMidi);
        const endMidi = Math.ceil(topMidi);

        // Optimization: Pre-calculate visible octave range for the frame
        const minOct = Math.floor(startMidi / 12);
        const maxOct = Math.ceil(endMidi / 12);

        // Optimization: Direct draw (no intermediate array) + Batch Label Redraw
        this.cNotesBuffer.fill(0);

        // Active Chords (Direct Draw)
        // Optimization: Batch rendering by color

        // Reset buffers
        for (let i = 0; i < 4; i++) {
            this.activeChordBuffers[i].length = 0;
        }

        for (const ev of this.chordEvents) {
            if (ev.time > currentTime) {
                break; // Optimization: Early exit
            }
            if (ev.time <= currentTime && ev.time + (ev.duration || 2.0) >= currentTime) {
                if (ev.notes) {
                    const rootPC = ev.rootMidi % 12;
                    for (const m of ev.notes) {
                        if (m < startMidi || m > endMidi) {
                            continue;
                        }

                        const interval = ((m % 12) - rootPC + 12) % 12;
                        const y = this.getY(m);
                        const colorIdx = INTERVAL_COLOR_INDEX[interval];

                        this.activeChordBuffers[colorIdx].push(y);

                        if (m % 12 === 0) {
                            this.cNotesBuffer[m] = 1;
                        }
                    }
                }
            }
        }

        // Render Batches
        for (let i = 0; i < 4; i++) {
            const buffer = this.activeChordBuffers[i];
            if (buffer.length === 0) {
                continue;
            }

            ctx.fillStyle = this.categoryColors[i];
            for (let j = 0; j < buffer.length; j++) {
                ctx.fillRect(0, buffer[j] - yScale / 2, this.pianoRollWidth, yScale);
            }
        }

        // Active Tracks (Direct Draw)
        for (const name in this.tracks) {
            const track = this.tracks[name];
            const color = track.resolvedColor || track.color;
            ctx.fillStyle = color; // Batch style change per track

            // Optimization: Inline RingBuffer iteration to avoid closure allocation
            const buffer = track.history.buffer;
            const capacity = track.history.capacity;
            const count = track.history.count;
            const start = track.history.start;
            const headLength = Math.min(count, capacity - start);

            // Loop 1: Start to end/wrap
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

            // Loop 2: Wrapped part
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

        // Batch Label Redraw (for covered C-notes)
        ctx.fillStyle = '#fff';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        // Only iterate relevant range in steps of 12
        const startC = Math.ceil(startMidi / 12) * 12;
        for (let m = startC; m <= endMidi; m += 12) {
            if (this.cNotesBuffer[m]) {
                const y = this.getY(m);
                const octave = m / 12 - 1;
                ctx.fillText(`C${octave}`, this.pianoRollWidth - 4, y);
            }
        }

        // 1. Rhythmic Grid
        if (bpm && this.beatReferenceTime !== null) {
            const beatLen = 60 / bpm;
            const startBeat = Math.floor((minTime - this.beatReferenceTime) / beatLen);

            ctx.lineWidth = 1;

            // Batch Measure Lines
            ctx.strokeStyle = gridColorMeasure;
            ctx.beginPath();
            for (let i = startBeat; ; i++) {
                const t = this.beatReferenceTime + i * beatLen;
                if (t > currentTime + 0.1) {
                    break;
                }

                // Optimization: Draw only if it's a measure line
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

            // Batch Beat Lines
            ctx.strokeStyle = gridColorBeat;
            ctx.beginPath();
            for (let i = startBeat; ; i++) {
                const t = this.beatReferenceTime + i * beatLen;
                if (t > currentTime + 0.1) {
                    break;
                }

                // Optimization: Draw only if it's NOT a measure line
                if (i % beatsPerMeasure === 0) {
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
        }

        // --- Fill Highlight ---
        if (this.isFillActive) {
            const yMin = this.getY(52); // Top of drum range
            const yMax = this.getY(36); // Bottom of drum range
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

        // 2. Chords - Pass 1: Background Guide Tones (Batched alpha change)
        // Optimization: Batch rendering by color to reduce context state changes
        ctx.globalAlpha = 0.1;

        // Reset buffers
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

            const start = Math.max(minTime, ev.time);
            const end = Math.min(currentTime, chordEnd);

            const xStart = this.getX(start, currentTime);
            const xEnd = this.getX(end, currentTime);
            const x = xEnd;
            const cw = xStart - xEnd;
            const rootPC = ev.rootMidi % 12;

            for (const interval of ev.intervals) {
                const pc = (rootPC + interval) % 12;
                const colorIdx = INTERVAL_COLOR_INDEX[interval];
                const buffer = this.guideToneBuffers[colorIdx];

                // Render in visible octaves (using hoisted range)
                for (let oct = minOct; oct <= maxOct; oct++) {
                    const m = pc + oct * 12;
                    const y = Math.round(this.getY(m));
                    if (y >= -10 && y <= h + 10) {
                        // Push flat layout: x, y, w, h
                        buffer.push(x, y - yScale / 2, cw, yScale);
                    }
                }
            }
        }

        // Render Batches
        for (let i = 0; i < 4; i++) {
            const buffer = this.guideToneBuffers[i];
            if (buffer.length === 0) {
                continue;
            }

            ctx.fillStyle = this.categoryColors[i];
            for (let j = 0; j < buffer.length; j += 4) {
                ctx.fillRect(buffer[j], buffer[j + 1], buffer[j + 2], buffer[j + 3]);
            }
        }

        // 2. Chords - Pass 2: Active Notes (Batched alpha change)
        // Optimization: Batch rendering by color
        ctx.globalAlpha = 0.5;

        // Reuse guideToneBuffers
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

            const start = Math.max(minTime, ev.time);
            const end = Math.min(currentTime, chordEnd);

            const xStart = this.getX(start, currentTime);
            const xEnd = this.getX(end, currentTime);
            const x = xEnd;
            const cw = xStart - xEnd;
            const rootPC = ev.rootMidi % 12;

            for (const midi of ev.notes) {
                const y = Math.round(this.getY(midi));
                const interval = ((midi % 12) - rootPC + 12) % 12;
                const colorIdx = INTERVAL_COLOR_INDEX[interval];

                if (y >= -10 && y <= h + 10) {
                    this.guideToneBuffers[colorIdx].push(x, y - yScale / 2 + 2, cw, yScale - 4);
                }
            }
        }

        // Render Batches
        for (let i = 0; i < 4; i++) {
            const buffer = this.guideToneBuffers[i];
            if (buffer.length === 0) {
                continue;
            }

            ctx.fillStyle = this.categoryColors[i];
            for (let j = 0; j < buffer.length; j += 4) {
                ctx.fillRect(buffer[j], buffer[j + 1], buffer[j + 2], buffer[j + 3]);
            }
        }

        ctx.globalAlpha = 1.0;

        // 3. Melodic Tracks
        for (const name in this.tracks) {
            const track = this.tracks[name];
            let activeX = -10,
                activeY = -10,
                isActive = false,
                activeColor = null;

            // SPECIAL HANDLING: Drums (Batched)
            if (name === 'drums') {
                ctx.fillStyle = track.resolvedColor || track.color;
                ctx.beginPath();

                // Optimization: Inline RingBuffer iteration
                const buffer = track.history.buffer;
                const capacity = track.history.capacity;
                const count = track.history.count;
                const start = track.history.start;
                const headLength = Math.min(count, capacity - start);
                let stop = false;

                // Loop 1
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

                    const x = this.getX(ev.time, currentTime);
                    const y = Math.round(this.getY(ev.midi));
                    const intensity = ev.velocity || 1.0;

                    ctx.moveTo(x, y - 6 * intensity);
                    ctx.lineTo(x + 4 * intensity, y);
                    ctx.lineTo(x, y + 6 * intensity);
                    ctx.lineTo(x - 4 * intensity, y);
                }

                // Loop 2
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

                        const x = this.getX(ev.time, currentTime);
                        const y = Math.round(this.getY(ev.midi));
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

            // Standard Melodic Tracks (Bass, Soloist, Harmony)
            const baseWidth = name === 'soloist' ? 4 : 5;
            const color = track.resolvedColor || track.color;
            const geom = this.geometryBuffer;
            geom.length = 0;
            if (name === 'soloist') {
                for (let b = 0; b < 4; b++) {
                    this.soloistBuffers[b].length = 0;
                }
            }

            // Pass 0: Compute Geometry
            // Optimization: Calculate coordinates once per frame per track via inline RingBuffer iteration
            const buffer = track.history.buffer;
            const capacity = track.history.capacity;
            const count = track.history.count;
            const start = track.history.start;
            const headLength = Math.min(count, capacity - start);
            let stop = false;

            // Loop 1
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

                const startT = Math.max(minTime, ev.time);
                const endT = Math.min(currentTime, noteEnd);
                const x1 = this.getX(startT, currentTime);
                const x2 = this.getX(endT, currentTime);
                const y = Math.round(this.getY(ev.midi));

                if (y >= -10 && y <= h + 10) {
                    if (name === 'soloist') {
                        let typeCode = 0; // default
                        if (ev.noteType === 'arp') {
                            typeCode = 1;
                        } else if (ev.noteType === 'target') {
                            typeCode = 2;
                        } else if (ev.noteType === 'altered') {
                            typeCode = 3;
                        }

                        this.soloistBuffers[typeCode].push(x1, y, x2);
                    } else {
                        geom.push(x1, y, x2);
                    }

                    if (ev.time <= currentTime && noteEnd >= currentTime) {
                        activeX = x2;
                        activeY = y;
                        isActive = true;

                        if (name === 'soloist') {
                            if (ev.noteType === 'arp') {
                                activeColor = chordColors.fifth;
                            } else if (ev.noteType === 'target') {
                                activeColor = chordColors.root;
                            } else if (ev.noteType === 'altered') {
                                activeColor = chordColors.seventh;
                            } else {
                                activeColor = color;
                            }
                        } else {
                            activeColor = color;
                        }
                    }
                }
            }

            // Loop 2
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

                    const startT = Math.max(minTime, ev.time);
                    const endT = Math.min(currentTime, noteEnd);
                    const x1 = this.getX(startT, currentTime);
                    const x2 = this.getX(endT, currentTime);
                    const y = Math.round(this.getY(ev.midi));

                    if (y >= -10 && y <= h + 10) {
                        if (name === 'soloist') {
                            let typeCode = 0; // default
                            if (ev.noteType === 'arp') {
                                typeCode = 1;
                            } else if (ev.noteType === 'target') {
                                typeCode = 2;
                            } else if (ev.noteType === 'altered') {
                                typeCode = 3;
                            }

                            this.soloistBuffers[typeCode].push(x1, y, x2);
                        } else {
                            geom.push(x1, y, x2);
                        }

                        if (ev.time <= currentTime && noteEnd >= currentTime) {
                            activeX = x2;
                            activeY = y;
                            isActive = true;

                            if (name === 'soloist') {
                                if (ev.noteType === 'arp') {
                                    activeColor = chordColors.fifth;
                                } else if (ev.noteType === 'target') {
                                    activeColor = chordColors.root;
                                } else if (ev.noteType === 'altered') {
                                    activeColor = chordColors.seventh;
                                } else {
                                    activeColor = color;
                                }
                            } else {
                                activeColor = color;
                            }
                        }
                    }
                }
            }

            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // First pass: Glow/outline for distinctness
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = baseWidth + 2;
            ctx.beginPath();
            let hasOutline = false;

            if (name === 'soloist') {
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
            } else {
                if (geom.length > 0) {
                    hasOutline = true;
                    for (let j = 0; j < geom.length; j += 3) {
                        ctx.moveTo(geom[j], geom[j + 1]);
                        ctx.lineTo(geom[j + 2], geom[j + 1]);
                    }
                }
            }
            if (hasOutline) {
                ctx.stroke();
            }

            // Second pass: Colored line (Batched)
            ctx.lineWidth = baseWidth;
            if (name === 'soloist') {
                // Batch 1: Default (0)
                if (this.soloistBuffers[0].length > 0) {
                    ctx.strokeStyle = color;
                    ctx.beginPath();
                    const buf = this.soloistBuffers[0];
                    for (let j = 0; j < buf.length; j += 3) {
                        ctx.moveTo(buf[j], buf[j + 1]);
                        ctx.lineTo(buf[j + 2], buf[j + 1]);
                    }
                    ctx.stroke();
                }

                // Batch 2: Root (Target - 2)
                if (this.soloistBuffers[2].length > 0) {
                    ctx.strokeStyle = chordColors.root;
                    ctx.beginPath();
                    const buf = this.soloistBuffers[2];
                    for (let j = 0; j < buf.length; j += 3) {
                        ctx.moveTo(buf[j], buf[j + 1]);
                        ctx.lineTo(buf[j + 2], buf[j + 1]);
                    }
                    ctx.stroke();
                }

                // Batch 3: Fifth (Arp - 1)
                if (this.soloistBuffers[1].length > 0) {
                    ctx.strokeStyle = chordColors.fifth;
                    ctx.beginPath();
                    const buf = this.soloistBuffers[1];
                    for (let j = 0; j < buf.length; j += 3) {
                        ctx.moveTo(buf[j], buf[j + 1]);
                        ctx.lineTo(buf[j + 2], buf[j + 1]);
                    }
                    ctx.stroke();
                }

                // Batch 4: Seventh (Altered - 3)
                if (this.soloistBuffers[3].length > 0) {
                    ctx.strokeStyle = chordColors.seventh;
                    ctx.beginPath();
                    const buf = this.soloistBuffers[3];
                    for (let j = 0; j < buf.length; j += 3) {
                        ctx.moveTo(buf[j], buf[j + 1]);
                        ctx.lineTo(buf[j + 2], buf[j + 1]);
                    }
                    ctx.stroke();
                }
            } else {
                // Simple batch for non-soloist tracks
                if (geom.length > 0) {
                    ctx.strokeStyle = color;
                    ctx.beginPath();
                    for (let j = 0; j < geom.length; j += 3) {
                        ctx.moveTo(geom[j], geom[j + 1]);
                        ctx.lineTo(geom[j + 2], geom[j + 1]);
                    }
                    ctx.stroke();
                }
            }

            if (isActive) {
                ctx.fillStyle = activeColor || '#fff';
                ctx.strokeStyle = outlineColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(activeX, activeY, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
        }

        // 4. Playhead
        ctx.strokeStyle = playheadColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Playhead is now at the piano roll edge (Time = Current)
        ctx.moveTo(this.pianoRollWidth, 0);
        ctx.lineTo(this.pianoRollWidth, h);
        ctx.stroke();
    }

    clear() {
        for (const name in this.tracks) {
            this.tracks[name].history.clear();
            this.tracks[name].label.textContent = '';
        }
        this.chordEvents = [];
        if (this.width && this.height) {
            this.ctx.clearRect(0, 0, this.width, this.height);
        }
    }

    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (this.themeObserver) {
            this.themeObserver.disconnect();
            this.themeObserver = null;
        }
        if (this.themeMediaQuery && this.themeListener) {
            this.themeMediaQuery.removeEventListener('change', this.themeListener);
            this.themeMediaQuery = null;
            this.themeListener = null;
        }
        if (this.canvas?.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        if (this.infoLayer?.parentNode) {
            this.infoLayer.parentNode.removeChild(this.infoLayer);
        }
        this.staticCanvas = null;
        this.staticCtx = null;
    }
}
