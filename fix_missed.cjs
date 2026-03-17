const fs = require('fs');

// Fix tests/unit/visualizer.test.js
let content = fs.readFileSync('tests/unit/visualizer.test.js', 'utf8');
content = content.replace(
    /import \{ UnifiedVisualizer \} from '\.\.\/\.\.\/public\/visualizer\.js';/g,
    "import { UnifiedVisualizer } from '../../public/visualizer-proxy.js';",
);
content = content.replace(
    /new UnifiedVisualizer\('viz-container'\)/g,
    'new UnifiedVisualizer(mockCanvas, mockStaticCanvas)',
);
fs.writeFileSync('tests/unit/visualizer.test.js', content);

// Fix tests/perf/visualizer-push-note.bench.js
let content2 = fs.readFileSync('tests/perf/visualizer-push-note.bench.js', 'utf8');
content2 = content2.replace(
    /import \{ UnifiedVisualizer \} from '\.\.\/\.\.\/public\/visualizer\.js';/g,
    "import { UnifiedVisualizer } from '../../public/visualizer-proxy.js';",
);
content2 = content2.replace(
    /const visualizer = new UnifiedVisualizer\('viz-container'\);/g,
    "const visualizer = new UnifiedVisualizer(document.createElement('canvas'), document.createElement('canvas'));",
);
fs.writeFileSync('tests/perf/visualizer-push-note.bench.js', content2);

// Fix public/components/Visualizer.jsx, public/App.jsx, public/ui-root.jsx, public/main.js
// Visualizer.jsx
let vizJSX = fs.readFileSync('public/components/Visualizer.jsx', 'utf8');
vizJSX = vizJSX.replace(/import \{ getVisualTime \} from '\.\.\/engine\/engine\.js';\n/g, '');
vizJSX = vizJSX.replace(
    /export function Visualizer\(\{ enabled \}\) \{/g,
    'export function Visualizer({ enabled, getVisualTime }) {',
);
fs.writeFileSync('public/components/Visualizer.jsx', vizJSX);

// App.jsx
let appJSX = fs.readFileSync('public/App.jsx', 'utf8');
appJSX = appJSX.replace(/export function App\(\) \{/g, 'export function App({ getVisualTime }) {');
appJSX = appJSX.replace(
    /<VisualizerPanel enabled=\{vizEnabled\} \/>/g,
    '<VisualizerPanel enabled={vizEnabled} getVisualTime={getVisualTime} />',
);
appJSX = appJSX.replace(
    /function VisualizerPanel\(\{ enabled \}\) \{/g,
    'function VisualizerPanel({ enabled, getVisualTime }) {',
);
appJSX = appJSX.replace(
    /<Visualizer enabled=\{enabled\} \/>/g,
    '<Visualizer enabled={enabled} getVisualTime={getVisualTime} />',
);
fs.writeFileSync('public/App.jsx', appJSX);

// ui-root.jsx
let uiRoot = fs.readFileSync('public/ui-root.jsx', 'utf8');
uiRoot = uiRoot.replace(
    /export function mountComponents\(\) \{/g,
    'export function mountComponents(getVisualTime) {',
);
uiRoot = uiRoot.replace(/<App \/>/g, '<App getVisualTime={getVisualTime} />');
fs.writeFileSync('public/ui-root.jsx', uiRoot);

// main.js
let mainJS = fs.readFileSync('public/main.js', 'utf8');
mainJS = mainJS.replace(
    /import \{ initPWA \} from/g,
    "import { getVisualTime } from './engine/engine.js';\nimport { initPWA } from",
);
mainJS = mainJS.replace(/mountComponents\(\);/g, 'mountComponents(getVisualTime);');
fs.writeFileSync('public/main.js', mainJS);
