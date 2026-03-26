# Ensemble: The Intelligent Virtual Band

**Ensemble** is an ultra-lightweight, high-performance Virtual Band in your browser. It’s an intelligent "beyond-the-metronome" toolkit for musicians that generates real-time, reactive backing tracks—drums, bass, chords, harmony, and solo phrases—that adapt to your style, intensity, and genre.

Whether you're practicing a `ii-V-I` progression, sketching a new song idea, or exporting MIDI for a DAW, Ensemble provides a "pro-level" rhythm section that understands the pocket.

---

## 🚀 Why Ensemble?

*   **Ultra-Lean & Fast**: At less than 500KB total transfer size, Ensemble is smaller than a single high-res photo. It's a full-featured PWA that loads instantly and works anywhere—even offline.
*   **Generative, Not Static**: Unlike a standard backing track (which is just a recording), Ensemble generates every note on the fly. This means the "pocket" is alive, with micro-timing (like Dilla-style lag or Reggae lay-back) that makes it feel like a human rhythm section.
*   **Creative Speed**: Rapidly input chord progressions using Roman Numerals, Nashville Numbers, or Absolute chord names. Dial up the intensity and hear your song idea performed instantly.
*   **Pro Connectivity**: Seamlessly drag-and-drop your generated arrangements into any DAW via MIDI export, or connect your MIDI controller to play along with the engine.
*   **Focused Workspaces**: Move between four purpose-built workspaces—**Arranger**, **Studio**, **Perform**, and **Visuals**—so the lead sheet, mix controls, live tools, and visualizer each have room to breathe.

## 🎹 Key Features

*   **Intensity-Aware Phrasing**: Dial the "energy" of the band up or down. Watch the drummer move from subtle cross-sticks to driving fills, and the bass transition from simple roots to complex chromatic walking lines.
*   **Musical Coordination**: A centralized "Coordination Context" ensures the band plays together. The Bass locks to the Kick drum, and the Accompaniment engine intelligently yields sonic space when the Soloist is active.
*   **Smart Genres**: Expert-tuned musical rules for 32+ genres (Jazz, Neo-Soul, Ska-Punk, Reggae, Funk, and more).
*   **Audio Analysis Tools**: Analyze existing audio files or live performances with high-precision chord detection and a specialized Melody Harmonizer.
*   **Unified Visualizer**: A multi-track harmonic monitor that superimposes instrumental performance over chord data with real-time interval analysis.

## 🛠 Tech Stack

*   **UI**: **Preact (v10)** for a snappy, reactive interface with zero bloat.
*   **Audio Engine**: Custom synthesis engines and a precision `scheduler-core.js` for rock-solid timing.
*   **Background Processing**: Web Workers (`logic-worker.js`) handle all generative logic to ensure a glitch-free experience even on low-end devices.
*   **Build System**: `esbuild` for ultra-fast JSX transformation and bundling.

---

## 🏃 Quickstart

### Local Development
Install dependencies, build the preview bundle, and serve it locally:
```bash
npm install
npm run dev
```

### Workspace Tour
- **Arranger**: Build and follow the lead sheet, open the progression library, share/export, and transpose quickly.
- **Studio**: Manage the live mix, toggle instruments on or off, and choose the current band feel from one compact surface.
- **Perform**: Launch the soloist and drum performance tools without cluttering the rest of the UI.
- **Visuals**: Open the full-size visualizer workspace while playback continues.

### Deployment
Ensemble deploys as static files. The deployment scripts build cache-busted assets into `dist/` and sync them to the target host, which fits a simple Nginx-style container setup well.
```bash
npm run deploy:test   # Build and deploy to test
npm run deploy:prod   # Build and deploy to production
```

## 🧪 Testing

Ensemble uses a dual-layer testing strategy:
1.  **Unit & Integration**: Powered by Vitest to verify musical logic and engine integrity.
    ```bash
    npm test
    ```
2.  **E2E & Visual Regression**: Powered by Playwright to verify UI layout and interaction.
    ```bash
    npm run test:e2e
    ```
3.  **Full Validation**: Runs type-checking, dependency checks, formatting, linting, mutation checks, and the full Vitest suite.
    ```bash
    npm run validate
    ```

---

## 📜 License

GNU Affero General Public License v3.0 (AGPLv3). See [LICENSE](LICENSE) for details.
