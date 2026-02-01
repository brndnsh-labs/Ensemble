// @vitest-environment happy-dom
import { describe, it, beforeEach, afterEach} from 'vitest';
import { UnifiedVisualizer } from '../../public/visualizer.js';

describe('UnifiedVisualizer Render Benchmark', () => {
  let visualizer;
  let container;
  let mockCtx;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'viz-container';
    document.body.appendChild(container);

    // Minimal Mock canvas context for speed
    mockCtx = {
      scale: () => {},
      fillRect: () => {},
      clearRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      fillText: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
    };

    // Stub property setters
    ['fillStyle', 'strokeStyle', 'globalAlpha', 'lineWidth', 'font', 'textAlign', 'textBaseline', 'lineCap', 'lineJoin'].forEach(prop => {
        Object.defineProperty(mockCtx, prop, { set: () => {} });
    });

    HTMLCanvasElement.prototype.getContext = () => mockCtx;

    global.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });

    visualizer = new UnifiedVisualizer('viz-container');
    visualizer.resize({ width: 800, height: 600 });

    // Setup heavy scene
    visualizer.addTrack('bass', '#ff0000');
    visualizer.addTrack('soloist', '#00ff00');

    // Add 100 notes history
    for(let i=0; i<100; i++) {
        visualizer.pushNote('bass', { time: i*0.1, duration: 0.1, midi: 40 + (i%12) });
        visualizer.pushNote('soloist', { time: i*0.1, duration: 0.1, midi: 60 + (i%12) });
    }
    // Add chords
    visualizer.pushChord({ time: 5, duration: 2, rootMidi: 60, notes: [60, 64, 67], intervals: [0, 4, 7] });
  });

  afterEach(() => {
    visualizer.destroy();
    document.body.removeChild(container);
  });

  // Using a manual loop instead of vitest 'bench' if not available or for simpler setup
  it('benchmarks render loop', () => {
    const start = performance.now();
    const iterations = 50000;

    for (let i = 0; i < iterations; i++) {
        visualizer.render(5.5, 120);
    }

    const end = performance.now();
    console.log(`Rendered ${iterations} frames in ${(end - start).toFixed(2)}ms`);
    console.log(`Average: ${((end - start) / iterations).toFixed(4)}ms per frame`);
  });
});
