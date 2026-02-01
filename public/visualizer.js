const IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];

const INTERVAL_CATEGORY = [
    "root",    // 0
    "seventh", // 1
    "seventh", // 2
    "third",   // 3
    "third",   // 4
    "seventh", // 5
    "seventh", // 6
    "fifth",   // 7
    "seventh", // 8
    "seventh", // 9
    "seventh", // 10
    "seventh"  // 11
];

export class UnifiedVisualizer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false }); // Optimization: no transparency
        this.container.appendChild(this.canvas);
        
        this.tracks = {}; // { name: { color, history: [] } }
        this.chordEvents = []; // { time, notes: [], duration, rootMidi, intervals }
        this.windowSize = 4.0; // Seconds to show
        this.visualRange = 60; // Semitones visual height (5 octaves) for absolute pitch
        this.centerMidi = 60; // Middle C is center
        this.pianoRollWidth = 50;
        this.registers = { chords: 60 };
        this.beatReferenceTime = null;
        this.themeCache = {};
        this.isFillActive = false;
        
        // Optimization: Pre-allocated array to avoid per-frame GC and Map overhead
        this.activeNoteColors = new Array(128).fill(null);

        // Optimization: Pre-allocated batches to avoid per-frame GC
        this.soloistBatches = {
            default: [],
            root: [],
            fifth: [],
            seventh: []
        };

        this.initDOM();
        this.updateThemeCache();

        // Observe theme changes
        this.themeObserver = new MutationObserver((mutations) => {
             if (mutations.some(m => m.type === 'attributes' && m.attributeName === 'data-theme')) {
                 this.updateThemeCache();
             }
        });
        this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

        this.themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        this.themeListener = () => this.updateThemeCache();
        this.themeMediaQuery.addEventListener('change', this.themeListener);
        
        // Robust resizing with ResizeObserver
        this.resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                this.resize(entry.contentRect);
            }
        });
        this.resizeObserver.observe(this.container);
    }

    updateThemeCache() {
        const style = getComputedStyle(document.documentElement);
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
                      (document.documentElement.getAttribute('data-theme') === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

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
                seventh: style.getPropertyValue('--magenta').trim() || '#d33682'
            }
        };

        // Update track colors
        for (const name in this.tracks) {
            this.resolveTrackColor(name, style);
        }
    }

    resolveTrackColor(name, style = null) {
        if (!this.tracks[name]) return;
        const track = this.tracks[name];
        if (track.color.startsWith('var(')) {
             if (!style) style = getComputedStyle(document.documentElement);
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
        const rect = contentRect || this.container.getBoundingClientRect();
        
        // Ensure we have non-zero dimensions to avoid canvas errors
        if (rect.width === 0 || rect.height === 0) return;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.width = rect.width;
        this.height = rect.height;
        this.ctx.scale(dpr, dpr);
    }

    addTrack(name, color) {
        const label = document.createElement('div');
        label.style.color = color;
        label.style.fontWeight = "bold";
        label.style.fontSize = "1.2rem";
        label.style.textShadow = `0 0 2px #000`;
        label.textContent = "";
        this.infoLayer.appendChild(label);

        this.tracks[name] = {
            color,
            history: [],
            label
        };
        this.resolveTrackColor(name);
        if (!this.registers[name]) this.registers[name] = 60;
    }

    setRegister(name, midi) {
        this.registers[name] = midi;
    }

    setBeatReference(time) {
        this.beatReferenceTime = time;
    }

    pushNote(name, event) {
        if (!this.tracks[name]) return;
        this.tracks[name].history.push(event);
        if (event.noteName && event.octave) {
            this.tracks[name].label.textContent = `${event.noteName}${event.octave}`;
        }
        // Optimization: Use shift instead of slice to avoid array allocation
        while (this.tracks[name].history.length > 100) {
            this.tracks[name].history.shift();
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
        if (!this.tracks[name]) return;
        for (const ev of this.tracks[name].history) {
            const noteEnd = ev.time + (ev.duration || 0.25);
            if (ev.time < time && noteEnd > time) {
                ev.duration = time - ev.time;
            }
        }
    }

    render(currentTime, bpm, beatsPerMeasure = 4) {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const graphW = w - this.pianoRollWidth;
        const minTime = currentTime - this.windowSize;
        const yScale = h / this.visualRange;

        // Use cached theme-aware colors
        const {
            bgColor, keyWhite, keyBlack, keySeparator,
            gridColorMeasure, gridColorBeat, playheadColor,
            outlineColor, labelColor, guideLineBlack, guideLineWhite,
            separatorColor, chordColors
        } = this.themeCache;

        // Pre-calculate math constants for this frame
        const midY = h / 2;
        const timeScale = graphW / this.windowSize;

        // Inline helpers to avoid closure allocation if possible, or just use optimized variables
        const getY = (m) => midY - (m - this.centerMidi) * yScale;
        const getX = (t) => this.pianoRollWidth + (currentTime - t) * timeScale;

        // 0. Background
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, w, h);

        // --- Collect Active Notes for Piano Roll Highlight ---
        this.activeNoteColors.fill(null);

        // Active Chords
        for (const ev of this.chordEvents) {
            if (ev.time <= currentTime && ev.time + (ev.duration || 2.0) >= currentTime) {
                if (ev.notes) {
                    const rootPC = ev.rootMidi % 12;
                    for (const m of ev.notes) {
                         const interval = (m % 12 - rootPC + 12) % 12;
                         const cat = INTERVAL_CATEGORY[interval];
                         this.activeNoteColors[m] = chordColors[cat];
                    }
                }
            }
        }

        // Active Tracks
        for (const name in this.tracks) {
            const track = this.tracks[name];
            let color = track.resolvedColor || track.color;
            for (const ev of track.history) {
                 if (ev.time <= currentTime && ev.time + (ev.duration || 0.25) >= currentTime) {
                     this.activeNoteColors[ev.midi] = color;
                 }
            }
        }

        // --- Piano Roll Layer ---
        const topMidi = this.centerMidi + (this.visualRange / 2);
        const bottomMidi = this.centerMidi - (this.visualRange / 2);
        const startMidi = Math.floor(bottomMidi);
        const endMidi = Math.ceil(topMidi);

        ctx.lineWidth = 1;

        // Draw Keys (Batched for performance)
        // Pass 1: Backgrounds & Labels (Fills)
        // Optimization: Set font properties once per frame
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        for (let m = startMidi; m <= endMidi; m++) {
            const y = getY(m);
            const noteInOctave = m % 12;
            const isBlack = IS_BLACK[noteInOctave];
            
            if (this.activeNoteColors[m]) {
                ctx.fillStyle = this.activeNoteColors[m];
            } else {
                ctx.fillStyle = isBlack ? keyBlack : keyWhite;
            }
            ctx.fillRect(0, y - yScale/2, this.pianoRollWidth, yScale);

            if (noteInOctave === 0) {
                ctx.fillStyle = labelColor;
                if (this.activeNoteColors[m]) ctx.fillStyle = '#fff';
                const octave = (m / 12) - 1;
                ctx.fillText(`C${octave}`, this.pianoRollWidth - 4, y);
            }
        }

        // Pass 2: Separators (Batch Stroke)
        ctx.strokeStyle = keySeparator;
        ctx.beginPath();
        for (let m = startMidi; m <= endMidi; m++) {
            const y = getY(m);
            ctx.moveTo(0, y + yScale/2);
            ctx.lineTo(this.pianoRollWidth, y + yScale/2);
        }
        ctx.stroke();

        // Pass 3: Guide Lines (Batch Strokes by Color)
        // White Keys Guide Lines
        ctx.strokeStyle = guideLineWhite;
        ctx.beginPath();
        for (let m = startMidi; m <= endMidi; m++) {
            const noteInOctave = m % 12;
            if (!IS_BLACK[noteInOctave]) {
                const y = getY(m);
                ctx.moveTo(this.pianoRollWidth, y);
                ctx.lineTo(w, y);
            }
        }
        ctx.stroke();

        // Black Keys Guide Lines
        ctx.strokeStyle = guideLineBlack;
        ctx.beginPath();
        for (let m = startMidi; m <= endMidi; m++) {
            const noteInOctave = m % 12;
            if (IS_BLACK[noteInOctave]) {
                const y = getY(m);
                ctx.moveTo(this.pianoRollWidth, y);
                ctx.lineTo(w, y);
            }
        }
        ctx.stroke();

        // Separator line between keys and graph
        ctx.strokeStyle = separatorColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.pianoRollWidth, 0);
        ctx.lineTo(this.pianoRollWidth, h);
        ctx.stroke();

        // 1. Rhythmic Grid
        if (bpm && this.beatReferenceTime !== null) {
            const beatLen = 60 / bpm;
            const startBeat = Math.floor((minTime - this.beatReferenceTime) / beatLen);
            
            ctx.lineWidth = 1;
            for (let i = startBeat; ; i++) {
                const t = this.beatReferenceTime + i * beatLen;
                if (t > currentTime + 0.1) break;
                
                const x = getX(t);
                if (x < this.pianoRollWidth) continue; 
                
                const isMeasure = i % beatsPerMeasure === 0;
                ctx.strokeStyle = isMeasure ? gridColorMeasure : gridColorBeat;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
                ctx.stroke();
            }
        }

        // --- Fill Highlight ---
        if (this.isFillActive) {
            const yMin = getY(52); // Top of drum range
            const yMax = getY(36); // Bottom of drum range
            const fillGradient = ctx.createLinearGradient(this.pianoRollWidth, yMin, this.pianoRollWidth, yMax);
            fillGradient.addColorStop(0, 'rgba(211, 54, 130, 0)');
            fillGradient.addColorStop(0.5, 'rgba(211, 54, 130, 0.15)');
            fillGradient.addColorStop(1, 'rgba(211, 54, 130, 0)');
            ctx.fillStyle = fillGradient;
            ctx.fillRect(this.pianoRollWidth, yMin, graphW, yMax - yMin);
        }

        // 2. Chords
        for (const ev of this.chordEvents) {
            const chordEnd = ev.time + (ev.duration || 2.0);
            if (chordEnd < minTime) continue;
            if (ev.time > currentTime) break;

            const start = Math.max(minTime, ev.time);
            const end = Math.min(currentTime, chordEnd);
            
            // Reversed: start (earlier) is further Right. end (later) is further Left.
            const xStart = getX(start);
            const xEnd = getX(end);
            
            const x = xEnd; 
            const cw = xStart - xEnd;
            const rootPC = ev.rootMidi % 12;

            // Render background guide tones
            if (ev.intervals) {
                ctx.globalAlpha = 0.1; // Optimization: Set alpha once
                for (const interval of ev.intervals) {
                    const pc = (rootPC + interval) % 12;
                    const cat = INTERVAL_CATEGORY[interval];
                    ctx.fillStyle = chordColors[cat];
                    
                    // Render in visible octaves
                    const minOct = Math.floor(startMidi / 12);
                    const maxOct = Math.ceil(endMidi / 12);

                    for (let oct = minOct; oct <= maxOct; oct++) {
                        const m = pc + oct * 12;
                        const y = Math.round(getY(m));
                        if (y >= -10 && y <= h + 10) {
                            ctx.fillRect(x, y - yScale/2, cw, yScale);
                        }
                    }
                }
                ctx.globalAlpha = 1.0;
            }

            // Render specifically played notes (highlighted)
            if (ev.notes) {
                for (const midi of ev.notes) {
                    const y = Math.round(getY(midi));
                    const interval = (midi % 12 - rootPC + 12) % 12;
                    const cat = INTERVAL_CATEGORY[interval];
                    ctx.fillStyle = chordColors[cat];
                    ctx.globalAlpha = 0.5;
                    if (y >= -10 && y <= h + 10) {
                        ctx.fillRect(x, y - yScale/2 + 2, cw, yScale - 4);
                    }
                    ctx.globalAlpha = 1.0;
                }
            }
        }

        // 3. Melodic Tracks
        for (const name in this.tracks) {
            const track = this.tracks[name];
            let activeX = -10, activeY = -10, isActive = false, activeColor = null;

            // SPECIAL HANDLING: Drums (Batched)
            if (name === 'drums') {
                ctx.fillStyle = track.resolvedColor || track.color;
                ctx.beginPath();
                for (const ev of track.history) {
                    const noteEnd = ev.time + (ev.duration || 0.1);
                    if (noteEnd < minTime) continue;
                    if (ev.time > currentTime) break;

                    const x = getX(ev.time);
                    const y = Math.round(getY(ev.midi));
                    const intensity = ev.velocity || 1.0;
                    
                    // Render drum hits as diamonds or vertical diamonds
                    ctx.moveTo(x, y - 6 * intensity);
                    ctx.lineTo(x + 4 * intensity, y);
                    ctx.lineTo(x, y + 6 * intensity);
                    ctx.lineTo(x - 4 * intensity, y);
                }
                ctx.fill();
                continue;
            }

            // Standard Melodic Tracks (Bass, Soloist, Harmony)
            const baseWidth = name === 'soloist' ? 4 : 5;
            let color = track.resolvedColor || track.color;

            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            // First pass: Glow/outline for distinctness (Batched)
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = baseWidth + 2;
            ctx.beginPath();
            for (const ev of track.history) {
                const noteEnd = ev.time + (ev.duration || 0.25);
                if (noteEnd < minTime) continue;
                if (ev.time > currentTime) break;

                const startT = Math.max(minTime, ev.time);
                const endT = Math.min(currentTime, noteEnd);
                const x1 = getX(startT);
                const x2 = getX(endT);
                const y = Math.round(getY(ev.midi));

                if (y >= -10 && y <= h + 10) {
                    ctx.moveTo(x1, y);
                    ctx.lineTo(x2, y);
                }
            }
            ctx.stroke();

            // Second pass: Colored line (Batched)
            ctx.lineWidth = baseWidth;
            if (name === 'soloist') {
                // For soloist, we need to batch by color category
                // Optimization: Reuse arrays and flatten data
                const batches = this.soloistBatches;
                batches.default.length = 0;
                batches.root.length = 0;
                batches.fifth.length = 0;
                batches.seventh.length = 0;

                for (const ev of track.history) {
                    const noteEnd = ev.time + (ev.duration || 0.25);
                    if (noteEnd < minTime) continue;
                    if (ev.time > currentTime) break;

                    const startT = Math.max(minTime, ev.time);
                    const endT = Math.min(currentTime, noteEnd);
                    const x1 = getX(startT);
                    const x2 = getX(endT);
                    const y = Math.round(getY(ev.midi));

                    if (y >= -10 && y <= h + 10) {
                        if (ev.noteType === 'arp') {
                            batches.fifth.push(x1, y, x2);
                        } else if (ev.noteType === 'target') {
                            batches.root.push(x1, y, x2);
                        } else if (ev.noteType === 'altered') {
                            batches.seventh.push(x1, y, x2);
                        } else {
                            batches.default.push(x1, y, x2);
                        }

                        if (ev.time <= currentTime && noteEnd >= currentTime) {
                            activeX = x2; activeY = y; isActive = true;
                            if (ev.noteType === 'arp') activeColor = chordColors.fifth;
                            else if (ev.noteType === 'target') activeColor = chordColors.root;
                            else if (ev.noteType === 'altered') activeColor = chordColors.seventh;
                            else activeColor = color;
                        }
                    }
                }

                // Render batches
                if (batches.default.length) {
                    ctx.strokeStyle = color;
                    ctx.beginPath();
                    for (let i = 0; i < batches.default.length; i += 3) {
                        ctx.moveTo(batches.default[i], batches.default[i+1]);
                        ctx.lineTo(batches.default[i+2], batches.default[i+1]);
                    }
                    ctx.stroke();
                }
                if (batches.root.length) {
                    ctx.strokeStyle = chordColors.root;
                    ctx.beginPath();
                    for (let i = 0; i < batches.root.length; i += 3) {
                        ctx.moveTo(batches.root[i], batches.root[i+1]);
                        ctx.lineTo(batches.root[i+2], batches.root[i+1]);
                    }
                    ctx.stroke();
                }
                if (batches.fifth.length) {
                    ctx.strokeStyle = chordColors.fifth;
                    ctx.beginPath();
                    for (let i = 0; i < batches.fifth.length; i += 3) {
                        ctx.moveTo(batches.fifth[i], batches.fifth[i+1]);
                        ctx.lineTo(batches.fifth[i+2], batches.fifth[i+1]);
                    }
                    ctx.stroke();
                }
                if (batches.seventh.length) {
                    ctx.strokeStyle = chordColors.seventh;
                    ctx.beginPath();
                    for (let i = 0; i < batches.seventh.length; i += 3) {
                        ctx.moveTo(batches.seventh[i], batches.seventh[i+1]);
                        ctx.lineTo(batches.seventh[i+2], batches.seventh[i+1]);
                    }
                    ctx.stroke();
                }

            } else {
                // Simple batch for non-soloist tracks
                ctx.strokeStyle = color;
                ctx.beginPath();
                for (const ev of track.history) {
                    const noteEnd = ev.time + (ev.duration || 0.25);
                    if (noteEnd < minTime) continue;
                    if (ev.time > currentTime) break;

                    const startT = Math.max(minTime, ev.time);
                    const endT = Math.min(currentTime, noteEnd);
                    const x1 = getX(startT);
                    const x2 = getX(endT);
                    const y = Math.round(getY(ev.midi));

                    if (y >= -10 && y <= h + 10) {
                        ctx.moveTo(x1, y);
                        ctx.lineTo(x2, y);
                        
                        if (ev.time <= currentTime && noteEnd >= currentTime) {
                            activeX = x2; activeY = y; isActive = true;
                            activeColor = color;
                        }
                    }
                }
                ctx.stroke();
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
            this.tracks[name].history = [];
            this.tracks[name].label.textContent = "";
        }
        this.chordEvents = [];
        this.ctx.clearRect(0, 0, this.width, this.height);
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
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        if (this.infoLayer && this.infoLayer.parentNode) {
            this.infoLayer.parentNode.removeChild(this.infoLayer);
        }
    }
}