# Ensemble

Ensemble is a Progressive Web App (PWA) designed for musicians to practice and experiment with chord progressions and drum grooves. It combines a generative "Virtual Band" with a sophisticated chord visualizer and drum sequencer in a unified, responsive interface.

## Key Features

*   🖋️ **Advanced Arranger**: Build complex song structures using Roman Numerals, Nashville Numbers, or Absolute chord names. Features include song templates, drag-and-drop reordering, section duplication, and a compact kebab-style symbol menu.
*   🎤 **Audio Workbench**: A unified tool for analyzing existing audio files or live performances. Supports high-precision **Chord Detection** (polyphonic) and a specialized **Melody Harmonizer** (monophonic) that generates backing tracks from sung or played melodies.
*   🧠 **Loop-Back Training**: The Harmonizer engine automatically "trains" itself by extracting musical knowledge from the Band's internal Soloist and Harmony modules, ensuring generated progressions are perfectly calibrated for the band's playing style.
*   🎸 **Generative Virtual Band**: Intelligent **Bassist**, **Soloist**, and **Harmony** engines that utilize "Expressive Musicality" logic to generate human-like, intensity-aware accompaniment in real-time. Features advanced **Melodic Devices** (Enclosures, Quartal Harmony, Call & Response), **Motif Memory** for background hooks, and a **Smart Genres** system that coordinates all instruments for a cohesive feel.
*   🥁 **Smart Drum Machine**: A multi-level velocity step sequencer with built-in genre presets and adjustable swing/humanization. Integrated with a procedural fill engine.
*   📊 **Unified Visualizer**: A multi-track harmonic monitor that superimposes instrumental performance over chord data, with real-time interval analysis and retractable UI.
*   🎹 **Pro Accompaniment**: Highly optimized voicing engine with adjustable density, styles (Pad, Funk, Reggae, Organ, Counterpoint), and intelligent relative key transposition.
*   📁 **Workflow Tools**: Real-time Web MIDI output for DAW integration, MIDI file export, auto-save persistence, URL-based sharing, and a comprehensive user library for custom presets.
*   📱 **PWA Ready**: Fully responsive, installable, and works offline with native Solarized theme support.

## Usage

Ensemble uses Preact with JSX and requires a build step for production. For local development, you can serve the project, but note that modern browsers do not natively support `.jsx` files without a transformer.

### Local Development
To run the project locally, it is recommended to use a development server that supports JSX, or build the project using the provided deployment scripts which utilize `esbuild`.

### Deployment & Bundling
Ensemble includes scripts for automated deployment to remote servers using `esbuild` for bundling and minification.

To build and deploy to the test environment:
```bash
npm run deploy:test
```

To build and deploy to the production environment:
```bash
npm run deploy:prod
```

**Dry Run / Local Build:**
You can build the project locally to the `dist/` folder without uploading by using the `--dry-run` flag:
```bash
./scripts/deploy-test.sh --dry-run
```

## Testing

Automated unit and integration tests are located in the `tests/` directory and use Vitest.

```bash
npm test
```

## Tech Stack

*   **Engine**: Vanilla JavaScript (ES Modules) & Web Audio API. Modularized core for high-precision scheduling and synthesis.
*   **Background Processing**: Web Workers (`logic-worker.js`) for glitch-free algorithmic generation.
*   **UI**: **Preact (v10)** component-based architecture. Hybrid state bridge for reactive updates while maintaining high-performance audio engine sync.
*   **State**: Centralized reactive state with formalized action types and domain-specific slices.
*   **Build System**: `esbuild` for JSX transformation, bundling, and minification.

## License

GNU Affero General Public License v3.0 (AGPLv3). See [LICENSE](LICENSE) for details.