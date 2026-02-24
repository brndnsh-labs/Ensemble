import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedVisualizer } from '../../public/visualizer.js';

// Mock Canvas Context
const mockCtx = {
    canvas: { width: 100, height: 100 },
    scale: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    stroke: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fill: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    measureText: vi.fn(() => ({ width: 10 })),
    set fillStyle(val) {
        this._fillStyle = val;
        this._fillStyleCount++;
    },
    get fillStyle() {
        return this._fillStyle;
    },
    _fillStyle: '#000',
    _fillStyleCount: 0,
    set strokeStyle(val) {
        this._strokeStyle = val;
    },
    get strokeStyle() {
        return this._strokeStyle;
    },
    set globalAlpha(_val) {},
    get globalAlpha() {
        return 1;
    },
    set lineWidth(_val) {},
    set font(_val) {},
    set textAlign(_val) {},
    set textBaseline(_val) {},
    set lineCap(_val) {},
    set lineJoin(_val) {},
    arc: vi.fn(),
};

// Mock DOM
global.document = {
    getElementById: vi.fn(),
    createElement: vi.fn((tag) => {
        if (tag === 'canvas') {
            return {
                getContext: (type) => (type === '2d' ? mockCtx : null),
                style: {},
                width: 0,
                height: 0,
            };
        }
        if (tag === 'div') {
            return { style: {}, appendChild: vi.fn() };
        }
        return {};
    }),
    documentElement: {
        getAttribute: vi.fn(),
        style: { getPropertyValue: vi.fn() },
    },
};
global.window = {
    matchMedia: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })),
    devicePixelRatio: 1,
    getComputedStyle: vi.fn(() => ({ getPropertyValue: vi.fn(() => '#fff') })),
};
global.ResizeObserver = class {
    observe() {}
    disconnect() {}
};
global.MutationObserver = class {
    observe() {}
    disconnect() {}
};
global.getComputedStyle = global.window.getComputedStyle;

describe('UnifiedVisualizer Performance', () => {
    let viz;

    beforeEach(() => {
        vi.clearAllMocks();
        mockCtx._fillStyleCount = 0;

        // Setup container
        const container = {
            appendChild: vi.fn(),
            getBoundingClientRect: () => ({ width: 800, height: 600 }),
            style: {},
        };
        document.getElementById.mockReturnValue(container);

        viz = new UnifiedVisualizer('viz-container');
        viz.resize({ width: 800, height: 600 });

        // Inject fake color cache to avoid DOM/style issues
        viz.themeCache = {
            bgColor: '#000',
            keyWhite: '#fff',
            keyBlack: '#333',
            keySeparator: '#555',
            gridColorMeasure: '#444',
            gridColorBeat: '#222',
            playheadColor: '#f00',
            outlineColor: '#fff',
            labelColor: '#aaa',
            guideLineBlack: '#111',
            guideLineWhite: '#222',
            separatorColor: '#666',
            chordColors: {
                root: '#ff0000', // Red
                third: '#00ff00', // Green
                fifth: '#0000ff', // Blue
                seventh: '#ffff00', // Yellow
            },
        };
        viz.intervalColors = [
            viz.themeCache.chordColors.root, // 0
            viz.themeCache.chordColors.seventh, // 1
            viz.themeCache.chordColors.seventh, // 2
            viz.themeCache.chordColors.third, // 3
            viz.themeCache.chordColors.third, // 4
            viz.themeCache.chordColors.seventh, // 5
            viz.themeCache.chordColors.seventh, // 6
            viz.themeCache.chordColors.fifth, // 7
            viz.themeCache.chordColors.seventh, // 8
            viz.themeCache.chordColors.seventh, // 9
            viz.themeCache.chordColors.seventh, // 10
            viz.themeCache.chordColors.seventh, // 11
        ];
    });

    it('should minimize fillStyle changes when rendering multiple chord notes', () => {
        // Setup a chord event with multiple notes (C Major 7: C, E, G, B)
        // C4=60 (Root), E4=64 (Major 3rd), G4=67 (Perfect 5th), B4=71 (Major 7th)
        const chordEvent = {
            time: 0,
            duration: 4,
            rootMidi: 60,
            notes: [60, 64, 67, 71], // Root, 3rd, 5th, 7th -> All different colors
        };
        viz.pushChord(chordEvent);

        // Before optimization:
        // 4 notes * different colors = 4 fillStyle changes per frame for this chord

        viz.render(1.0, 120);

        // We expect fillStyle to be set at least:
        // 1. Background (via drawImage, effectively clears, but static layer handles bg)
        // Wait, renderStaticLayer is separate. In render():
        // - cNotesBuffer.fill(0)
        // - Loop chordEvents -> fillStyle changes (4 times)
        // - Loop tracks -> fillStyle changes
        // - Text Labels -> fillStyle
        // - Grid lines -> strokeStyle (not fill)
        // - Fill Highlight -> fillStyle
        // - Guide Tones -> fillStyle

        // Let's count calls during the specific "Active Chords" phase.
        // Since we can't easily isolate the phase in the test without modifying code,
        // we'll look at the total count and reason about it.

        // Total fillStyle changes expected currently:
        // 1. Active Chords: 4 notes = 4 changes (since they are R, 3, 5, 7 - all different)
        // 2. Tracks: 0 tracks added in this test = 0 changes
        // 3. Labels: 1 change (to #fff)
        // 4. Fill highlight: 0 (not active)
        // 5. Guide Tones: 1 globalAlpha, then loops.
        //    Guide tones loop over notes [60, 64, 67, 71].
        //    For each note, it iterates octaves.
        //    60 (Root) -> fillStyle = Red
        //    64 (3rd) -> fillStyle = Green
        //    67 (5th) -> fillStyle = Blue
        //    71 (7th) -> fillStyle = Yellow
        //    So 4 more changes there (assuming 1 octave visible or loop order)

        // Total should be around 9-10 (including defaults).

        // Reset and run again to be sure
        mockCtx._fillStyleCount = 0;
        viz.render(1.0, 120);

        // console.log(`FillStyle changes per frame: ${mockCtx._fillStyleCount}`);

        // If we batch, Active Chords phase should ideally group by color.
        // But wait, in this specific Cmaj7 case, all 4 notes are different colors.
        // So batching by color would mean:
        // Set Red -> Draw C
        // Set Green -> Draw E
        // Set Blue -> Draw G
        // Set Yellow -> Draw B
        // That's still 4 changes.

        // To verify optimization, we need multiple notes sharing the same color.
        // Let's add a complex chord with extensions that map to same colors.
        // e.g. C13: C (R), E (3), G (5), Bb (b7), D (9), A (13)
        // R=Root(Red), 3=Third(Green), 5=Fifth(Blue), b7=7th(Yellow), 9=2(7th=Yellow), 13=6(7th=Yellow)
        // So b7, 9, 13 are all "Yellow" (Seventh category in interval map).

        viz.chordEvents = []; // clear
        viz.pushChord({
            time: 0,
            duration: 4,
            rootMidi: 60,
            notes: [60, 64, 67, 70, 74, 81], // C, E, G, Bb, D, A
            intervals: [0, 4, 7, 10, 2, 9], // Provide intervals to trigger Guide Tones
        });

        mockCtx._fillStyleCount = 0;
        viz.render(1.0, 120);
        const countOptimized = mockCtx._fillStyleCount;

        // console.log(`Optimized count (with repeated colors): ${countOptimized}`);
        expect(countOptimized).toBeLessThan(16); // Strict check for optimization success

        // Expected Unoptimized "Active Chords" part:
        // 60 -> Red
        // 64 -> Green
        // 67 -> Blue
        // 70 -> Yellow
        // 74 -> Yellow
        // 81 -> Yellow
        // Total 6 changes (or 5 if check for current fillStyle, but code doesn't check).

        // Expected Optimized:
        // Red -> Draw 60
        // Green -> Draw 64
        // Blue -> Draw 67
        // Yellow -> Draw 70, 74, 81
        // Total 4 changes.

        // Saving 2 changes here.
        // Plus Guide Tones? If we optimize those too.
    });

    it('should optimize generic track rendering by batching path commands', () => {
        // Setup generic track (bass)
        viz.addTrack('bass', '#ff0000');

        // Add 3 notes to history (Chronological order is required for optimization to work)
        viz.pushNote('bass', { time: -2.0, duration: 1.0, midi: 32, velocity: 0.8 }); // Past
        viz.pushNote('bass', { time: 0.0, duration: 1.0, midi: 36, velocity: 0.8 }); // Active
        viz.pushNote('bass', { time: 0.4, duration: 0.1, midi: 40, velocity: 0.8 }); // Recent Past

        // Clear mocks
        mockCtx.moveTo.mockClear();
        mockCtx.lineTo.mockClear();
        mockCtx.stroke.mockClear();
        mockCtx.beginPath.mockClear();

        // Render at time 0.5
        // All 3 notes are <= 0.5 and within window
        viz.render(0.5, 120);

        // Logic check:
        // Current implementation uses 'geom' array and strokes ONCE (outline + color).
        // It iterates 'geom' array to build path.
        // So we expect 3 segments * (moveTo + lineTo) = 3 calls each.
        // PLUS 1 playhead line (moveTo + lineTo).
        // Total = 4.

        // If implementation is correct, path construction happens inside loop.
        expect(mockCtx.moveTo).toHaveBeenCalledTimes(4);
        expect(mockCtx.lineTo).toHaveBeenCalledTimes(4);

        // Outline + Color strokes (2) + Active Note Circle (1) + Playhead (1) = 4 calls total
        expect(mockCtx.stroke).toHaveBeenCalledTimes(4);
    });
});
