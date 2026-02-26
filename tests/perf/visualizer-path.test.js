import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedVisualizer } from '../../public/visualizer.js';

// Mock Canvas Context
const mockCtx = {
    canvas: { width: 100, height: 100 },
    scale: vi.fn(),
    fillRect: vi.fn(),
    rect: vi.fn(),
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
    set fillStyle(_val) {},
    get fillStyle() {
        return '#000';
    },
    set strokeStyle(_val) {},
    get strokeStyle() {
        return '#000';
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

describe('UnifiedVisualizer Path Optimization', () => {
    let viz;

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup container
        const container = {
            appendChild: vi.fn(),
            getBoundingClientRect: () => ({ width: 800, height: 600 }),
            style: {},
        };
        document.getElementById.mockReturnValue(container);

        viz = new UnifiedVisualizer('viz-container');
        viz.resize({ width: 800, height: 600 });

        // Setup minimal theme cache
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
            chordColors: { root: '#f00', third: '#0f0', fifth: '#00f', seventh: '#ff0' },
        };
        viz.categoryColors = ['#f00', '#0f0', '#00f', '#ff0'];
    });

    it('should reduce moveTo/lineTo calls by reusing path for generic tracks', () => {
        // Add a generic track (Bass)
        viz.addTrack('bass', '#00ff00');

        // Add 10 notes to history
        // Each note is 1s long, spaced 1s apart
        for (let i = 0; i < 10; i++) {
            viz.pushNote('bass', {
                time: i,
                duration: 0.5,
                midi: 60,
                velocity: 0.8,
            });
        }

        // Render at time=10 (showing last 4s window: 6-10)
        // Window size is 4.0s.
        // Notes at 6, 7, 8, 9 should be visible. (4 notes)
        // Note at 10 starts at current time, so it's visible. (5 notes)
        // Note at 5 ends at 5.5, so not visible in [6, 10] window.

        // Actually, let's just make window large to capture all notes for simplicity
        viz.windowSize = 20.0;

        // Render at time=11, showing -9 to 11. All 10 notes (0..9) are visible.

        // Clear mock history before render
        mockCtx.moveTo.mockClear();
        mockCtx.lineTo.mockClear();
        mockCtx.beginPath.mockClear();
        mockCtx.stroke.mockClear();

        // Render with BPM=0 to disable grid
        viz.render(11.0, 0);

        const moveToCount = mockCtx.moveTo.mock.calls.length;
        const lineToCount = mockCtx.lineTo.mock.calls.length;
        const strokeCount = mockCtx.stroke.mock.calls.length;

        console.log(`moveTo: ${moveToCount}, lineTo: ${lineToCount}, stroke: ${strokeCount}`);

        // Expectations:
        // 10 notes.
        // Playhead: 1 line (1 moveTo, 1 lineTo).

        // Unoptimized (Current):
        // Track: 10 segments * 2 passes (outline + color) = 20 segments.
        // Each segment = 1 moveTo + 1 lineTo.
        // Total Track = 20 moveTo + 20 lineTo.
        // Total = 21 moveTo + 21 lineTo.

        // Optimized:
        // Track: 10 segments * 1 pass (shared path).
        // Total Track = 10 moveTo + 10 lineTo.
        // Total = 11 moveTo + 11 lineTo.

        // Verify baseline (Unoptimized behavior)
        // If optimized, this test will fail until we update expectation.
        // But here I want to assert the optimized behavior after I make changes.
        // For now, I'll log it.

        // I will assert assuming the optimization is NOT applied yet, so I can verify failure or pass.
        // Currently it should be 21.

        // Wait, playhead is drawn at the end.
        // Also: Static layer uses drawImage.
        // Also: "active note" circle might be drawn if note is active.
        // Note 9 is at time 9, duration 0.5. Ends 9.5. Current time 11. No active note.
        // So no circles.

        // Let's assert the "Unoptimized" count first to confirm baseline.
        expect(moveToCount).toBe(11);
    });
});
