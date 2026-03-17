# Ensemble: Getting Started & Guide

Welcome to Ensemble, your AI-powered virtual band. Whether you're practicing soloing, writing a new song, or just jamming, this guide will help you get the most out of the engine.

---

## 🚀 The 30-Second Jam
If you want to start playing immediately:
1.  **Pick a Genre:** Select a style from the **Grooves** panel (e.g., Jazz, Rock, or Funk).
2.  **Type Chords:** Enter your progression in the **Arranger** (e.g., `C | F G`).
3.  **Press Start:** The band will instantly begin playing.
*✨ **Pro Tip:** Click the **Dice Icon** for an instant, musically coherent song structure!*

---

## 🎹 Common Workflows

### "I want to practice soloing"
Ensemble is built for improvisation. 
- **Trade Mode:** In the Soloist settings, enable **Trade Sections**. The band will play for one section, then "hand off" the lead to you for the next.
- **Status Indicator:** Watch the Soloist power button (⏻). **Green** means the AI is playing; **Yellow** means it's your turn!
- **Soloist Performance:** Press `S` to open the Performance Card. This lets you play the soloist instrument manually using your keyboard, with notes automatically mapped to the current and upcoming chords.

### "I want to play the drums manually"
If you want to take over the rhythm section or just troubleshoot the kit:
- **Drum Pad:** Press `D` (or click the 🥁 icon in the Grooves panel) to open the **Drum Pad & Diagnostic Lab**.
- **Performance Mode:** When the Drum Pad is open, the automatic drum patterns will stop, giving you full manual control.
- **Ergonomic Layout:** The pads are mapped to your home row:
    - **Kick:** `Space`
    - **Pocket (Left Hand):** `F` (Snare), `D` (Rim)
    - **Pulse (Right Hand):** `J` (Hi-Hat), `K` (Ride), `L` (Open Hat)
    - **Fills:** `R`, `T`, `Y` (Toms) and `U` (Crash)

### "I'm writing a new song"
Use the **Audio Workbench** to bridge your ideas with the AI.
- **Seeding:** Have a cool riff? Type it in, then use the **Song Generator** with **Seeding** enabled. The AI will keep your chords as the "Verse" and compose an Intro/Chorus/Outro around it.
- **Melody Harmonizer:** Sing or play a melody into your mic in the Workbench. The AI will analyze your notes and suggest a chord progression that fits.

### "I want to record into my DAW"
Ensemble can act as a high-precision MIDI controller for Logic, Ableton, or hardware synths.
- **Enable MIDI:** Go to **Settings > Enable Web MIDI Output**.
- **Latency:** Use the **Latency Compensation** slider to perfectly sync Ensemble's timing with your DAW.
- **Automation:** The AI sends **Expression (CC 11)** and **Modulation (CC 1)** data automatically, making your virtual instruments sound "alive."

---

## 🧠 Understanding the Band

### Soloist Melodic Devices
The Soloist engine utilizes procedural algorithms to generate stylistic embellishments, runs, and licks based on the selected genre. Examples include:
- **Jazz & Bebop:** `bebopScale` runs, `chromaticEnclosure`s, and Coltrane-style `sheetsOfSound`.
- **Blues & Rock:** Signature `bluesLick`s, `bluesTurnaround`s, and expressive `bluesCurl` bends.
- **Country:** Authentic `chickenPick` double-stops, `banjoRoll`s, and `countryBend`s.
- **Modern/Fusion:** `quartalStack`s and `graceSlide`s for sophisticated phrasing.

### The Conductor (Intensity & Complexity)
These two sliders are the most powerful tools in the app:
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
