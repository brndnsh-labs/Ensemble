# Ensemble: Getting Started & Guide

Welcome to Ensemble, your AI-powered virtual band. Whether you're practicing soloing, writing a new song, or just jamming, this guide will help you get the most out of the engine.

---

## 🚀 The 30-Second Jam
If you want to start playing immediately:
1.  **Choose a Band Feel:** Open **Studio** and pick a genre from the **Band feel** chooser.
2.  **Type Chords:** Enter your progression in **Arranger** (e.g., `C | F G`).
3.  **Press Start:** The band will instantly begin playing.
4.  **Move Between Workspaces:** Use the workspace navigation to jump between **Arranger**, **Studio**, **Perform**, and **Visuals** while the music keeps running.
*✨ **Pro Tip:** In **Arranger**, open the `⋮` actions menu for edit, share, library, transpose, and soloist seed controls without covering the lead sheet.*

---

## 🎹 Common Workflows

### Understanding the Four Workspaces
- **Arranger:** Your lead-sheet view for chords, form, transposition, sharing, and the progression library.
- **Studio:** A compact live-mix surface where you can see which instruments are active, toggle them on or off, and open per-instrument settings.
- **Perform:** A clean launchpad for manual performance tools such as the solo surface and drum pad.
- **Visuals:** A dedicated visualizer view that stays out of the way until you want a larger visual performance display.

### "I want to practice soloing"
Ensemble is built for improvisation. 
- **Trade Mode:** In **Studio**, open the Soloist settings and enable **Trade Sections**. The band will play for one section, then hand off the lead to you for the next.
- **Status Indicator:** Watch the Soloist state pill in **Studio**. **On** means the AI is active, and **Queued** means the soloist is waiting for the next trading section.
- **Soloist Performance:** Open **Perform** and launch **Soloist Performance**, or press `S`. This lets you play the soloist instrument manually using your keyboard, with notes automatically mapped to the current and upcoming chords.

### "I want the soloist to sound more intentional"
The AI Soloist uses a **Dynamic Head** system to provide thematic direction to each session. Every time you press play, the soloist generates a unique "seed melody" that fits your specific chord progression.
- **Chorus 1 (The Head):** The soloist plays the seed melody clearly and accurately to establish the "song" for the session.
- **Chorus 2 (Evolution):** The soloist adds stylistic embellishments like slides, grace notes, and "blues curls" around the seed notes.
- **Chorus 3+ (Improvisation):** The soloist begins to improvise freely, but still maintains a slight "magnetic pull" toward the original theme, ensuring the performance feels connected and intentional rather than random.

### "I want to play the drums manually"
If you want to take over the rhythm section or just troubleshoot the kit:
- **Drum Pad:** Open **Perform** and launch the **Groove Drum Pad**, or press `D` to open **Drum Performance Mode** directly.
- **Performance Mode:** When the drum pad is open, the automatic drum patterns stop, giving you full manual control.
- **Ergonomic Layout:** The pads are mapped to your home row:
    - **Kick:** `Space`
    - **Pocket (Left Hand):** `F` (Snare), `D` (Rim)
    - **Pulse (Right Hand):** `J` (Hi-Hat), `K` (Ride), `L` (Open Hat)
    - **Fills:** `R`, `T`, `Y` (Toms) and `U` (Crash)

### "I'm writing a new song"
The chart is locked by default — your music stand. Tap **🔒 Edit** in the topbar (or press `E`) to unlock and start editing; lock re-engages automatically when you hit play.
- **🎲 Surprise me:** Roll a random arrangement in your current key, pick a curated template, or load a chord-progression preset. One button replaces the older Library + Generate Song + Inspiration Hub entry points.
- **Tap-a-chord:** While the chart is locked, tap any chord to swap it via a popover — no keyboard needed.
- **Per-section direction:** Each section header shows a dynamic-mark button (`pp` / `mp` / `mf` / `ff`) and five instrument dots (D · B · C · H · S) — tap to dial intensity per-section or mute an instrument just inside that section.

### "I want to record into my DAW"
Ensemble can act as a high-precision MIDI controller for Logic, Ableton, or hardware synths.
- **Enable MIDI:** Go to **Settings > Enable Web MIDI Output**.
- **Latency:** Use the **Latency Compensation** slider to perfectly sync Ensemble's timing with your DAW.
- **Automation:** The AI sends **Expression (CC 11)** and **Modulation (CC 1)** data automatically, making your virtual instruments sound "alive."

---

## 🧠 Understanding the Band

### The Conductor (Intensity & Complexity)
These controls are some of the most powerful ways to shape the band:
- **Intensity:** Controls the band's energy. At 0.1, the drummer might just use cross-sticks; at 0.9, they'll be playing heavy crashes and busy fills.
- **Complexity:** Controls "how much" the band plays. Higher values add jazzy chord extensions, walking bass variations, and rhythmic "pockets."

### Smart Interaction
The virtual band members "listen" to each other to coordinate their performance in real-time:
- **Yielding:** When you activate the AI **Soloist**, the Chords and Bass instruments automatically simplify their parts to give the lead voice more "spectral space."
- **Pocket:** The Bass is hard-wired to the Kick Drum. They coordinate to always land on the "1" together for a professional, tight low-end.

## 🎼 Arranger & Chord Notation

### Standard Notation
The arranger supports standard notation formats like **Absolute** (`Cmaj7`), **Roman** (`Imaj7`), and **Nashville** (`1maj7`). 

### Measures & Beats
Use the pipe (`|`) character to separate measures. Chords are distributed evenly across the bar:
- `C | F G |` = 1 bar of C (4 beats), 1 bar of F then G (2 beats each).

### Common Song Forms
Standard forms like the **12-Bar Blues** can be written cleanly using measure markers:
- `I7 | I7 | I7 | I7 | IV7 | IV7 | I7 | I7 | V7 | IV7 | I7 | V7`
- *✨ **Pro Tip:** Each line in the text area is treated as a continuation of the progression.*

---

## 🎨 Style Gallery (Deep Links)
Click any of these to instantly load a curated preset. These are perfect for practice, analysis, or as a starting point for your own arrangements.

### 🎷 Standards & Jazz
- [🎺 **Jazz Blues in Bb**](index.html?prog=I7+%7C+IV7+%7C+I7+%7C+I7+%7C+IV7+%7C+IV7+%7C+I7+%7C+I7+%7C+ii7+%7C+V7+%7C+I7+%7C+V7&genre=Jazz&bpm=120&key=Bb) — Classic 12-bar jazz blues with a walking bass and swinging drums.
- [🍂 **Autumn Jazz (ii-V-I)**](index.html?prog=ii%C3%B87+%7C+V7+%7C+i+%7C+i+%7C+ii%C3%B87+%7C+V7+%7C+i+%7C+i&genre=Jazz&bpm=110&key=Cm) — Soulful minor jazz standard with a focus on harmonic resolution.
- [🌴 **Bossa Nova Morning**](index.html?prog=Imaj7+%7C+Imaj7+%7C+II7+%7C+II7+%7C+ii7+%7C+V7+%7C+Imaj7+%7C+V7&genre=Bossa&bpm=124) — Sophisticated Brazilian harmony with authentic syncopation.

### ☕ Modern & Soulful
- [🌆 **Neo-Soul Sunset**](index.html?prog=IVmaj9+%7C+III7%239+%7C+vi11+%7C+V9sus4&genre=Neo-Soul&bpm=82) — Lush extensions and a deep, laid-back rhythmic pocket.
- [🔥 **Funk & Soul Vamp**](index.html?prog=i7+%7C+i7+%7C+IV7+%7C+IV7+%7C+i7+%7C+i7+%7C+IV7+%7C+IV7&genre=Funk&bpm=98) — Tight, high-energy interplay with a focus on rhythmic syncopation.
- [🎧 **Lo-Fi Study Loop**](index.html?prog=vi+%7C+IV+%7C+ii+%7C+V&genre=Hip+Hop&bpm=88) — Smooth, repetitive progression for a relaxed, focused vibe.

### 🎸 Rock & Metal
- [🏟️ **Stadium Rock Anthem**](index.html?prog=I+%7C+V+%7C+vi+%7C+IV&genre=Rock&bpm=118) — Massive power chords and driving eighth-note bass energy.
- [🏁 **Ska-Punk Skank**](index.html?prog=I+%7C+III7+%7C+vi+%7C+V&genre=Ska-Punk&bpm=165) — Fast-paced upstroke chords and an agile walking bass.
- [🤘 **Power Metal Core**](index.html?prog=i+%7C+VI+%7C+i+%7C+V&genre=Metal&bpm=145) — Tight, rhythmic palm-muting and aggressive low-end gallops.

### ⛺ Acoustic & Folk
- [🚜 **Country Two-Step**](index.html?prog=I+%7C+I+%7C+IV+%7C+V&genre=Country&bpm=115) — Classic root-five bass movement and honky-tonk piano flair.
- [🏕️ **Campfire Folk**](index.html?prog=I+%7C+V+%7C+vi+%7C+IV+%7C+I+%7C+V+%7C+IV+%7C+IV&genre=Acoustic&bpm=92) — Intimate, strummed accompaniment for singer-songwriters.
- [💃 **Flamenco Fusion**](index.html?prog=i+%7C+VII+%7C+VI+%7C+V7&genre=Bossa&bpm=110) — Spanish-influenced harmonic descent over a syncopated groove.

---

## 🛠 Appendix: Engine Details
The following information is generated directly from the Ensemble engine to ensure accuracy.

### Available Smart Genres
{{GENRE_TABLE}}

### Instrument Styles
**Bass:**
{{BASS_STYLES}}

**Chords:**
{{CHORD_STYLES}}

**Soloist:**
{{SOLOIST_STYLES}}

**Harmony:**
{{HARMONY_STYLES}}

### Keyboard Shortcuts
{{SHORTCUT_TABLE}}

---

Ensemble &copy; 2026. Licensed under the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html).
