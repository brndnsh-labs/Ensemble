#!/bin/sh
# Writes the gate 4 audition files to out/gate-4/. See docs/MILESTONES.md.
# Safe to run again: the same commands always write the same files.
# Every take is saved beside its MIDI file as a recipe (.json) that
# `ensemble replay` plays back exactly.
#
# The gate asks two things: are these three different bands, and did the
# blues get worse? So: the same charts played by all three, each band on its
# own tunes, and the blues takes of gate 3 again.
set -eu
cd "$(dirname "$0")/.."
out=out/gate-4
mkdir -p "$out"
take() { # take <name> <chart> [options...]
  name=$1
  shift
  node packages/cli/src/main.ts render "$@" --out "$out/$name.mid" --save "$out/$name.json" |
    grep -v 'recipe saved' | sed 's/^/  /'
}

echo "1. The same chart, three bands. A 12-bar blues in A at the chart's tempo (100):"
for style in blues jazz funk; do
  take "1-same-12-bar-a-as-$style" library/blues-12-bar-a.chart --style "$style" --passes 5 --solo --seed 1
done
echo "   A jazz blues in F, each band at its own tempo:"
take "1-same-jazz-blues-f-as-blues" library/blues-jazz-f.chart --style blues --tempo 100 --passes 5 --solo --seed 1
take "1-same-jazz-blues-f-as-jazz" library/blues-jazz-f.chart --style jazz --tempo 138 --passes 5 --solo --seed 1
take "1-same-jazz-blues-f-as-funk" library/blues-jazz-f.chart --style funk --tempo 105 --passes 5 --solo --seed 1
echo "   A two-chord vamp in D minor (100), no soloist: the rhythm sections alone:"
for style in blues jazz funk; do
  take "1-same-two-chord-dm-as-$style" library/funk-two-chord-dm.chart --style "$style" --passes 4 --seed 1
done

echo "2. Jazz on its own tunes:"
for seed in 1 2 3; do
  take "2-jazz-rhythm-changes-bb-seed-$seed" library/jazz-rhythm-changes-bb.chart --passes 5 --solo --seed "$seed"
done
take "2-jazz-two-five-one-c" library/jazz-two-five-one-c.chart --passes 5 --solo --seed 1
take "2-jazz-minor-two-five-cm" library/jazz-minor-two-five-cm.chart --passes 5 --solo --seed 1
take "2-jazz-falling-fifths-gm" library/jazz-falling-fifths-gm.chart --passes 5 --solo --seed 1
take "2-jazz-modal-dm" library/jazz-modal-dm.chart --passes 5 --solo --seed 1
take "2-jazz-ballad-eb" library/jazz-ballad-eb.chart --passes 3 --solo --seed 1
take "2-jazz-waltz-f" library/jazz-waltz-f.chart --passes 5 --solo --seed 1
take "2-jazz-rhythm-changes-bb-no-solo" library/jazz-rhythm-changes-bb.chart --passes 3 --seed 1
take "2-jazz-rhythm-changes-bb-vibes" library/jazz-rhythm-changes-bb.chart --passes 5 --solo-instrument vibraphone --seed 1

echo "3. Funk on its own tunes:"
for seed in 1 2 3; do
  take "3-funk-vamp-a-seed-$seed" library/funk-vamp-a.chart --passes 5 --solo --seed "$seed"
done
take "3-funk-one-chord-e" library/funk-one-chord-e.chart --passes 5 --solo --seed 1
take "3-funk-two-chord-dm" library/funk-two-chord-dm.chart --passes 5 --solo --seed 1
take "3-funk-verse-bridge-e" library/funk-verse-bridge-e.chart --passes 4 --solo --seed 1
take "3-funk-minor-am" library/funk-minor-am.chart --passes 5 --solo --seed 1
take "3-funk-intro-outro-c-song" library/funk-intro-outro-c.chart --song --solo --seed 1
take "3-funk-vamp-a-no-solo" library/funk-vamp-a.chart --passes 4 --seed 1
take "3-funk-vamp-a-timed-4min" library/funk-vamp-a.chart --minutes 4 --solo --seed 1

echo "4. The blues again: gate 3's seeds 2 and 4 (seed 1 is the first file of section 1), and its other tunes:"
for seed in 2 4; do
  take "4-blues-12-bar-a-seed-$seed" library/blues-12-bar-a.chart --passes 5 --solo --seed "$seed"
done
take "4-blues-slow-g" library/blues-slow-g.chart --passes 4 --solo --seed 1
take "4-blues-minor-am" library/blues-minor-am.chart --passes 5 --solo --seed 1
take "4-blues-quick-change-e-timed-4min" library/blues-quick-change-e.chart --minutes 4 --solo --seed 1
