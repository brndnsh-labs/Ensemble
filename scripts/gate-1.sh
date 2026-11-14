#!/bin/sh
# Writes the gate 1 audition files to out/gate-1/. See docs/MILESTONES.md.
# Safe to run again: the same commands always write the same files.
set -eu
cd "$(dirname "$0")/.."
out=out/gate-1
mkdir -p "$out"
render() { node packages/cli/src/main.ts render "$@" | sed 's/^/  /'; }

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
  render library/blues-quick-change-e.chart --minutes 3 --seed "$seed" --out "$out/timed-3min-quick-change-e-seed${seed}.mid"
done

echo "Mid-bar changes, and an intro with a written ending:"
render library/blues-jazz-f.chart --passes 3 --seed 1 --out "$out/jazz-blues-f-seed1.mid"
render library/blues-intro-outro-d.chart --passes 2 --seed 1 --out "$out/intro-and-tag-d-seed1.mid"
