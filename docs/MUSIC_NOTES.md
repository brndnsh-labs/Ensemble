# Music notes

What the previous version of Ensemble knew about music, written down by four extractors who read its code, tests, history, and notes on 2026-11-14. The old code is not here and must not be consulted. Treat this as domain knowledge, not as a design to copy.

The notes run to roughly 1,500 rules, so they are split by subject. **Read this page every session; read a part when your work touches it.**

| Part | File | Read it when |
|---|---|---|
| A | `music-notes/a-rhythm-section.md` | Working on drums, bass, the planner (energy, arc, fills, crashes), or endings |
| B | `music-notes/b-comping-soloist.md` | Working on voicings, comping rhythm, the soloist, or the critic |
| C | `music-notes/c-styles.md` | Writing or tuning a style pack. One section per genre, written to be transcribed |
| D | `music-notes/d-audit-history-sounds.md` | Designing metrics, judging what to trust, or setting up sounds and the mix (stage 5) |

## How to read a rule

Every rule has a stable ID (`BA-05`, `CH-16`, `ST-blues-22`), a tag, and a confidence mark. Cite the ID in code comments and gate reports.

- `[property]`: must always hold. Becomes a property test.
- `[metric]`: a quality to score, not assert. Becomes a critic metric. Many other rules end in a "Target:" clause, which is also a metric.
- `[style-data]`: a value or pattern that belongs in a style pack.
- `[taste]`: a judgment worth knowing.
- `(solid)`: the old code and tests agreed. `(unclear)`: intent was ambiguous or looked accidental; decide it again on purpose.

ID prefixes: `X-A`, `X-B`, `X-C` cross-cutting; `DR` drums; `BA` bass; `CO` conductor and energy; `EN` endings and transitions; `CH` chords; `SO` soloist; `KF-B` known failures of comping and soloist; `Q` what separates good from bad; `ST-<style>` styles; `AU` audit; `HI` history; `EAR` the owner's ear; `ME` measuring; `SN` sounds; `SU` surprises.

## The lessons that shape the whole design

These are the ones that cost the previous version the most to learn. Each points at the rules behind it.

1. **Tie every random choice to its place in the music, never to how many choices came before.** A bar must come out the same whether or not the bars before it were generated. It is what lets a lead-in promise the octave the next bar will play, and what lets a jam be extended. (X-A-34, X-B-19, CO-52)
2. **Figures belong to sections, not bars.** A groove, a riff, a register, a comping figure is chosen once per section and held; a repeat of a section is the same section. Re-choosing per bar measured clearly worse. Variation comes from structure: answer bars, fills at phrase and section ends, lead-ins at changes. How long a choice is held turned out to be one of the most audible style parameters. (X-A-29, X-A-30, X-B-14, X-C-42)
3. **A figure is chosen whole.** One draw picks a fill, a comping figure, or a riff from a written vocabulary. A coin per stroke reads as scatter. (X-A-31, DR-94)
4. **Everyone writes on a straight grid; feel is applied afterwards in one place.** Swing is geometry. The drums are the clock and never lean; every other seat sits a constant few milliseconds ahead of or behind them, and that differential is the pocket. A shift applied to the whole band is only latency. (X-A-10 to X-A-20)
5. **Energy is one number per bar, read two ways.** Three tiers choose *what* is played, and the change of part at a tier line is the audible change of section; the raw number scales *how loud*. Things that define the genre survive every tier. (X-A-06 to X-A-09, CO-01, CO-02)
6. **The players hear each other in one direction:** drums, then bass, then soloist, then chords. (X-B-05, CO-24)
7. **A chord change is an arrival for everyone,** and chord identity outranks everything else: the third, the seventh, and any written alteration survive every thinning. The bass and the comp must read the same chord scale, chosen by the chord's function, or they clash. (X-B-06, X-B-10 to X-B-13, X-A-26)
8. **A lead-in resolves by step in actual pitch,** into the exact octave the next bar plays, across section changes and into the final low root. The bottom of the instrument is where a new bass breaks first. (BA-05 to BA-09, BA-87 to BA-89)
9. **A fill and an arrival crash edit the groove; they do not layer on it.** A fill is sized by where the music is going, not where it is. (DR-12, DR-20, CO-43)
10. **An ending is three decisions:** which chord (home, in the style's colour, with the family read from the chart), which gesture, and whether the bar before sets it up. Each style ends in its own words. (EN-01 to EN-25)
11. **Why the soloist's quality varied:** every phrase was a single unscored draw of independent choices, with almost nothing tying one phrase to the next, and it never listened. The local rules were fine. (SO-60 to SO-69, KF-B-23, Q-43 to Q-50)

## Where the extractors disagreed or were unsure

Decide these on purpose; do not inherit them.

- The blues ride only appeared on a written repeat of a section, so most blues never reached it (DR-45, DR-109). Decided here: hat versus ride is a per-pass choice at high energy.
- Six styles, blues among them, never got written fill vocabularies (DR-88).
- Whether the comp should sit wholly under the soloist (CH-63 to CH-67).
- How often a solo should peak, and what jazz comping rhythm is supposed to be (SO-68, KF-B-09, CH-43, KF-B-31, KF-B-38).
- Tempo: no old style carried one and no pattern adapted to it (X-C-48, DR-91). Tempos in part C are assembled from other sources.
- Default instruments were decided in two places that disagreed (ST-surprise-25).
- Rock has no comp pushes because the band could not push together (CH-38, BA-84). A band-wide push is a missing concept worth building.
- The audit (part D) was run against the first generation of the band, so "fixed" there means fixed then; part D notes where the last generation differs, and lists seven places where its sources contradict parts A to C.
- Sounds: the encoded packs are in the old repo (paths in part D, `SN`). The originals are not on this machine, and the Rhodes pack is licensed for non-commercial use only (SN-15), which matters for the brief's "permissively licensed" requirement at stage 5.
- What the old measurements missed: everything scored was local (a note, a bar, a change), and the owner's remaining complaints sat where nothing was measured. Pooled averages and a handful of seeds hid the rest (ME-11, ME-26, ME-29). A critic needs phrase-level and form-level measures and a look at the worst takes, not the mean.
