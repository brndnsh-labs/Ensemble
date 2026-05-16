// @ts-nocheck
import { bench, describe } from 'vitest';
import { UnifiedVisualizer } from '../../public/visualizer-proxy.js';

describe('UnifiedVisualizer PushNote Performance', () => {
    // Mock container
    const container = document.createElement('div');
    container.id = 'viz-container';
    document.body.appendChild(container);

    const visualizer = new UnifiedVisualizer(
        document.createElement('canvas'),
        document.createElement('canvas'),
    );
    visualizer.addTrack('bench', '#000000');

    // Fill history to the limit (100)
    for (let i = 0; i < 100; i++) {
        visualizer.pushNote('bench', { time: i, midi: 60, duration: 0.1 });
    }

    bench(
        'pushNote with history full (triggering shift)',
        () => {
            visualizer.pushNote('bench', {
                time: 100,
                midi: 60,
                duration: 0.1,
                noteName: 'C',
                octave: 4,
            });
        },
        { time: 1000 },
    );
});
