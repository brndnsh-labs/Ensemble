#!/bin/sh
# Writes the gate 2 audition files to out/gate-2/. See docs/MILESTONES.md.
# Safe to run again: the same commands always write the same files.
set -eu
cd "$(dirname "$0")/.."
out=out/gate-2
mkdir -p "$out"
# Gate 2 is drums, bass, and piano, whatever seats have been built since.
render() { node packages/cli/src/main.ts render "$@" --without solo | sed 's/^/  /'; }

echo "Voicings alone: the piano holds each chord (no comping rhythm):"
node scripts/pads.ts library/blues-12-bar-a.chart "$out/pads-12-bar-a.mid"
node scripts/pads.ts library/blues-jazz-f.chart "$out/pads-jazz-blues-f.mid"
node scripts/pads.ts library/blues-minor-am.chart "$out/pads-minor-blues-am.mid"
node scripts/pads.ts library/blues-intro-outro-d.chart "$out/pads-quick-change-d.mid"

echo "One level held throughout, to hear each level's comping on its own (two seeds each):"
for seed in 1 2; do
  render library/blues-12-bar-a.chart --energy 0.3 --passes 2 --seed "$seed" --out "$out/level-low-0.30-seed${seed}.mid"
  render library/blues-12-bar-a.chart --energy 0.55 --passes 2 --seed "$seed" --out "$out/level-mid-0.55-seed${seed}.mid"
done
# Seed 1's hot figure is the pump; seed 3's is stabs around the backbeat.
for seed in 1 3; do
  render library/blues-12-bar-a.chart --energy 0.85 --passes 2 --seed "$seed" --out "$out/level-high-0.85-seed${seed}.mid"
done

echo "A 12-bar blues, 3 choruses, five seeds (the comping figure differs by seed):"
for seed in 1 2 3 4 5; do
  render library/blues-12-bar-a.chart --passes 3 --seed "$seed" --out "$out/12-bar-a-seed${seed}.mid"
done

echo "The same take with the piano exposed: no bass, then piano alone:"
node packages/cli/src/main.ts render library/blues-12-bar-a.chart --passes 3 --seed 1 \
  --without bass,solo --out "$out/12-bar-a-seed1-no-bass.mid" | sed 's/^/  /'
node packages/cli/src/main.ts render library/blues-12-bar-a.chart --passes 3 --seed 1 \
  --without drums,bass,solo --out "$out/12-bar-a-seed1-piano-alone.mid" | sed 's/^/  /'

echo "A 3-minute timed jam, two seeds:"
for seed in 1 2; do
  render library/blues-intro-outro-d.chart --key E --tempo 108 --minutes 3 --seed "$seed" --out "$out/timed-3min-quick-change-e-seed${seed}.mid"
done

echo "Other forms: mid-bar changes, a minor blues, a slow blues, an intro and a written ending:"
render library/blues-jazz-f.chart --passes 3 --seed 1 --out "$out/jazz-blues-f-seed1.mid"
render library/blues-minor-am.chart --passes 3 --seed 1 --out "$out/minor-blues-am-seed1.mid"
render library/blues-12-bar-a.chart --key G --tempo 66 --passes 2 --seed 1 --out "$out/slow-blues-g-seed1.mid"
render library/blues-intro-outro-d.chart --passes 2 --seed 1 --out "$out/intro-and-tag-d-seed1.mid"
