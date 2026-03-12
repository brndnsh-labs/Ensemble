# Ensemble: Getting Started & Guide

Welcome to Ensemble, your AI-powered virtual band. Whether you're practicing soloing, writing a new song, or just jamming, this guide will help you get the most out of the engine.

---

## 🚀 The 30-Second Jam
If you want to start playing immediately:
1.  **Pick a Genre:** Select a style from the **Drums** panel (e.g., Jazz, Rock, or Funk).
2.  **Type Chords:** Enter your progression in the **Arranger** (e.g., `C | F G`).
3.  **Press Space:** The band will instantly begin playing.
*✨ **Pro Tip:** Click the **Dice Icon** for an instant, musically coherent song structure!*

---

## 🎹 Common Workflows

### "I want to practice soloing"
Ensemble is built for improvisation. 
- **Trade Mode:** In the Soloist settings, enable **Trade Sections**. The band will play for one section, then "hand off" the lead to you for the next.
- **Status Indicator:** Watch the Soloist power button (⏻). **Green** means the AI is playing; **Yellow** means it's your turn!
- **Complexity:** Crank the **Complexity** slider in Settings to hear more syncopated and advanced rhythms from the band.

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
Click any of these to instantly load a curated preset:
- [🎸 **Stadium Rock**](index.html?prog=I+vi+IV+V&genre=Rock&bpm=120)
- [🎷 **Bebop Jazz**](index.html?prog=ii7+V7+Imaj7&genre=Jazz&bpm=110)
- [🎸 **12-Bar Blues**](index.html?prog=I7+|++I7+|++I7+|++I7+|++IV7+|++IV7+|++I7+|++I7+|++V7+|++IV7+|++I7+|++V7&genre=Blues&bpm=100)
- [☕ **Neo-Soul Chill**](index.html?prog=IVmaj9+III7%239+vi11+V9sus4&genre=Neo-Soul&bpm=85)
- [🕺 **70s Disco**](index.html?prog=i7+IV7&genre=Disco&bpm=124)

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
