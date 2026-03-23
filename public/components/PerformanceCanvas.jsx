import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { stopSoloist, triggerSoloNote } from '../performance-controller.js';
import { dispatch, getState } from '../state.js';
import { ACTIONS } from '../types.js';
import { midiToNote } from '../utils.js';

/**
 * PerformanceCanvas - A vertical-first, 4-pillar ribbon interface for mobile.
 * Includes intelligent melodic guidance and sticky-zone sustain logic.
 */
/** @param {any} props */
export function PerformanceCanvas({
    noteGroups,
    onNoteChange,
    bpm,
    currentNoteName,
    currentChordName,
    nextChordName,
}) {
    /** @type {import('preact/hooks').MutableRef<HTMLCanvasElement|null>} */
    const canvasRef = useRef(null);
    /** @type {import('preact/hooks').MutableRef<HTMLDivElement|null>} */
    const containerRef = useRef(null);
    const [activePointers, setActivePointers] = useState(/** @type {Map<any, any>} */ (new Map())); // id -> { lane, zone, midi }
    const audioInitializedRef = useRef(false);

    const render = () => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }
        const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        // Resolve CSS variables & Palettes
        const canvasStyle = getComputedStyle(canvas);
        const soloistColor = canvasStyle.getPropertyValue('--soloist-color').trim() || '#268bd2';

        // Harmonic Palette
        const PALETTE = {
            safe: canvasStyle.getPropertyValue('--yellow').trim() || '#b58900',
            tense: canvasStyle.getPropertyValue('--cyan').trim() || '#2aa198',
            chromatic: canvasStyle.getPropertyValue('--base01').trim() || '#586e75',
            bridge: canvasStyle.getPropertyValue('--magenta').trim() || '#d33682',
        };

        const COLOR_RGB_MAP = {
            safe: canvasStyle.getPropertyValue('--yellow-rgb').trim() || '181, 137, 0',
            tense: canvasStyle.getPropertyValue('--cyan-rgb').trim() || '42, 161, 152',
            bridge: canvasStyle.getPropertyValue('--magenta-rgb').trim() || '211, 54, 130',
        };

        const laneWidth = width / 4;
        const zoneHeight = height / 5;

        // 1. Identify Sympathetic Notes (Octaves of what's playing)
        const activeNames = new Set();
        activePointers.forEach((p) => {
            const info = midiToNote(p.midi);
            if (info) {
                activeNames.add(info.name);
            }
        });

        // 2. Identify Bridge Notes (Common between current and next)
        const currentSet = new Set(noteGroups[0].concat(noteGroups[1]));
        const nextSet = new Set(noteGroups[2].concat(noteGroups[3]));
        const bridgeMidis = new Set([...currentSet].filter((x) => nextSet.has(x)));

        // 3. Draw Pillars
        for (let l = 0; l < 4; l++) {
            const x = l * laneWidth;
            const isOuter = l === 0 || l === 3;
            const group = noteGroups[l] || [];
            const degrees = isOuter ? ['1', '3', '5', '7', '9'] : ['2', '4', '6', '8', '10'];

            // Pillar Background
            ctx.fillStyle = isOuter ? 'rgba(15, 23, 42, 0.4)' : 'rgba(15, 23, 42, 0.6)';
            ctx.fillRect(x, 0, laneWidth, height);

            // Dividers
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, 0, laneWidth, height);

            for (let z = 0; z < 5; z++) {
                const y = (4 - z) * zoneHeight;
                const midi = group[z];
                const noteInfo = typeof midi === 'number' ? midiToNote(midi) : null;
                const noteName = noteInfo ? noteInfo.name : '';
                const noteFullName = noteInfo ? `${noteInfo.name}${noteInfo.octave}` : '';
                const degree = degrees[z];

                // Determine Functional Color
                let type = isOuter ? 'safe' : 'tense';
                if (bridgeMidis.has(midi)) {
                    type = 'bridge';
                }
                const baseColor = /** @type {any} */ (PALETTE)[type];
                const rgbColor = /** @type {any} */ (COLOR_RGB_MAP)[type];

                // Zone background tint
                ctx.fillStyle = `rgba(${rgbColor}, 0.06)`;
                ctx.fillRect(x + 2, y + 2, laneWidth - 4, zoneHeight - 4);

                // Check Activity
                let isActive = false;
                activePointers.forEach((p) => {
                    if (p.lane === l && p.zone === z) {
                        isActive = true;
                    }
                });

                const isSympathetic = !isActive && activeNames.has(noteName);

                if (isActive) {
                    const centerX = x + laneWidth / 2;
                    const centerY = y + zoneHeight / 2;

                    // Organic Radial Glow
                    const glow = ctx.createRadialGradient(
                        centerX,
                        centerY,
                        0,
                        centerX,
                        centerY,
                        laneWidth * 0.8,
                    );
                    glow.addColorStop(0, baseColor);
                    glow.addColorStop(1, 'rgba(255,255,255,0)');

                    ctx.fillStyle = glow;
                    ctx.globalAlpha = 0.7;

                    // Rounded "Pill" Shape
                    const paddingH = laneWidth * 0.15;
                    const paddingV = zoneHeight * 0.15;
                    ctx.beginPath();
                    ctx.roundRect(
                        x + paddingH,
                        y + paddingV,
                        laneWidth - paddingH * 2,
                        zoneHeight - paddingV * 2,
                        20,
                    );
                    ctx.fill();

                    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                    ctx.globalAlpha = 1.0;

                    ctx.shadowBlur = 30;
                    ctx.shadowColor = baseColor;
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 24px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(noteFullName, centerX, centerY + 8);

                    ctx.font = 'bold 10px sans-serif';
                    ctx.fillText(degree, centerX, centerY - 18);
                    ctx.shadowBlur = 0;
                } else if (isSympathetic) {
                    // Note Sympathy Highlight (Rounded & Dashed)
                    ctx.strokeStyle = baseColor;
                    ctx.lineWidth = 2;
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    ctx.roundRect(x + 8, y + 8, laneWidth - 16, zoneHeight - 16, 8);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    ctx.fillStyle = baseColor;
                    ctx.font = 'bold 16px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(noteFullName, x + laneWidth / 2, y + zoneHeight / 2 + 6);
                } else {
                    // Standard Inactive
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                    ctx.font = '14px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(noteFullName, x + laneWidth / 2, y + zoneHeight / 2 + 5);

                    // Subtle functional dot
                    ctx.fillStyle = baseColor;
                    ctx.beginPath();
                    ctx.arc(x + laneWidth / 2, y + zoneHeight / 2 - 15, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // 4. Wing Headers
        const drawHeader = (
            /** @type {any} */ name,
            /** @type {any} */ x,
            /** @type {any} */ color,
        ) => {
            const textWidth = ctx.measureText(name).width + 30;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.beginPath();
            ctx.roundRect(x - textWidth / 2, 10, textWidth, 28, 14);
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = color;
            ctx.fillText(name, x, 28);
        };

        drawHeader(currentChordName, width * 0.25, soloistColor);
        drawHeader(nextChordName, width * 0.75, '#94a3b8');

        // 5. Center Status
        if (currentNoteName) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = soloistColor;
            ctx.fillStyle = '#fff';
            ctx.font = '900 64px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(currentNoteName, width / 2, height / 2);
            ctx.shadowBlur = 0;
        }

        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${bpm} BPM`, width / 2, height - 15);
    };

    useLayoutEffect(() => {
        const handleResize = () => {
            if (!canvasRef.current || !containerRef.current) {
                return;
            }
            const dpr = window.devicePixelRatio || 1;
            const rect = containerRef.current.getBoundingClientRect();
            canvasRef.current.width = rect.width * dpr;
            canvasRef.current.height = rect.height * dpr;
        };
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        /** @type {number} */
        let frameId;
        const loop = () => {
            render();
            frameId = requestAnimationFrame(loop);
        };
        frameId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frameId);
    }, [activePointers, noteGroups, bpm, currentNoteName, currentChordName, nextChordName]);

    const handleTouch = (/** @type {TouchEvent|MouseEvent|any} */ e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!audioInitializedRef.current) {
            dispatch(ACTIONS.INIT_AUDIO);
            const { playback } = getState();
            playback.audio?.resume();
            audioInitializedRef.current = true;
        }

        if (!canvasRef.current) {
            return;
        }
        if (!canvasRef.current) {
            return;
        }
        const rect = canvasRef.current.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const laneWidth = width / 4;
        const zoneHeight = height / 5;

        const nextPointers = new Map();

        for (let i = 0; i < e.touches.length; i++) {
            const touch = e.touches[i];
            const tx = touch.clientX - rect.left;
            const ty = touch.clientY - rect.top;

            const lane = Math.min(3, Math.max(0, Math.floor(tx / laneWidth)));
            const zone = Math.min(4, Math.max(0, 4 - Math.floor(ty / zoneHeight)));

            // Check if we already have a pointer for this touch
            const prev = activePointers.get(touch.identifier);

            // STICKY LOGIC:
            // If the finger is still in the same physical zone, keep the pitch the same
            // even if the underlying noteGroups has changed (chord transition).
            if (prev && prev.lane === lane && prev.zone === zone) {
                nextPointers.set(touch.identifier, prev);
            } else {
                // We entered a new zone or it's a new touch
                const midi = noteGroups[lane]?.[zone];
                if (typeof midi === 'number' && Number.isFinite(midi)) {
                    nextPointers.set(touch.identifier, { lane, zone, midi });
                }
            }
        }

        // Trigger notes for any NEW or CHANGED midis
        nextPointers.forEach((data, id) => {
            const prevData = activePointers.get(id);
            if (!prevData || prevData.midi !== data.midi) {
                const freq = 440 * 2 ** ((data.midi - 69) / 12);
                const isLegato = activePointers.size > 0;
                triggerSoloNote(freq, 0, 60.0, 0.8, 0, 'scalar', isLegato);
                onNoteChange(data.midi);
            }
        });

        // Global kill if all touches released
        if (e.type === 'touchend' || e.type === 'touchcancel' || e.type === 'touchmove') {
            if (nextPointers.size === 0 && activePointers.size > 0) {
                stopSoloist();
                onNoteChange(null);
            }
        }

        setActivePointers(nextPointers);
    };

    return (
        <div
            ref={containerRef}
            style="flex: 1; width: 100%; height: 100%; position: relative; background: #0f172a; overflow: hidden;"
        >
            <canvas
                ref={canvasRef}
                style="width: 100%; height: 100%; touch-action: none; display: block;"
                onTouchStart={handleTouch}
                onTouchMove={handleTouch}
                onTouchEnd={handleTouch}
                onTouchCancel={handleTouch}
            />
        </div>
    );
}
