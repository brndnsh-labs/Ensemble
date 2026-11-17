#!/bin/sh
# Writes the gate 1 audition files to out/gate-1/. See docs/MILESTONES.md.
# Safe to run again: the same commands always write the same files.
set -eu
cd "$(dirname "$0")/.."
out=out/gate-1
mkdir -p "$out"
# Gate 1 is the rhythm section alone, whatever seats have been built since.
render() { node packages/cli/src/main.ts render "$@" --without chords,solo | sed 's/^/  /'; }

echo "A 12-bar blues at three tempos, three seeds each (3 choruses):"
for tempo in 72 100 132; do
  for seed in 1 2 3; do
    render library/blues-12-bar-a.chart --tempo "$tempo" --passes 3 --seed "$seed" \
      --out "$out/12-bar-a-${tempo}bpm-seed${seed}.mid"
  done
done

echo "A minor blues, three seeds (3 choruses):"
for seed in 1 2 3; do
  render library/blues-minor-am.chart --passes 3 --seed "$seed" --out "$out/minor-blues-am-seed${seed}.mid"
done

echo "A 3-minute timed jam, three seeds:"
for seed in 1 2 3; do
  render library/blues-intro-outro-d.chart --key E --tempo 108 --minutes 3 --seed "$seed" --out "$out/timed-3min-quick-change-e-seed${seed}.mid"
done

echo "One level held throughout, to hear each part of the band's vocabulary on its own:"
render library/blues-12-bar-a.chart --energy 0.25 --passes 2 --seed 1 --out "$out/level-quiet-0.25-seed1.mid"
render library/blues-12-bar-a.chart --energy 0.38 --passes 2 --seed 1 --out "$out/level-low-0.38-seed1.mid"
render library/blues-12-bar-a.chart --energy 0.55 --passes 2 --seed 1 --out "$out/level-mid-0.55-seed1.mid"
render library/blues-12-bar-a.chart --energy 0.85 --passes 2 --seed 1 --out "$out/level-high-0.85-seed1.mid"
render library/blues-12-bar-a.chart --energy 0.85 --passes 2 --seed 2 --out "$out/level-high-0.85-seed2.mid"

echo "Mid-bar changes, and an intro with a written ending:"
render library/blues-jazz-f.chart --passes 3 --seed 1 --out "$out/jazz-blues-f-seed1.mid"
render library/blues-intro-outro-d.chart --passes 2 --seed 1 --out "$out/intro-and-tag-d-seed1.mid"
