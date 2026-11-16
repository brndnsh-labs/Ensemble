#!/bin/sh
# Writes the gate 3 audition files to out/gate-3/. See docs/MILESTONES.md.
# Safe to run again: the same commands always write the same files.
# Every take is saved beside its MIDI file as a recipe (.json) that
# `ensemble replay` plays back exactly.
set -eu
cd "$(dirname "$0")/.."
out=out/gate-3
mkdir -p "$out"
chart=library/blues-12-bar-a.chart
# The band alone, three choruses of solo, and the band out: five passes.
passes=5
take() { # take <name> <chart> [options...]
  name=$1
  shift
  node packages/cli/src/main.ts render "$@" --out "$out/$name.mid" --save "$out/$name.json" |
    grep -v 'recipe saved' | sed 's/^/  /'
}

echo "Finding the three lowest-scoring solos in 200 seeds (solo.cost, lower is better):"
ranked=$(node scripts/rank-solos.ts "$chart" "$passes" 200)
worst=$(echo "$ranked" | head -3)
echo "$worst" | sed 's/^/  seed and cost: /'
echo "  (the middle solo of the 200 costs $(echo "$ranked" | sed -n 100p | cut -d' ' -f2), the best $(echo "$ranked" | tail -1 | cut -d' ' -f2))"

echo "Ten seeds on a 12-bar blues: seven ordinary ones, then the three worst:"
ordinary=0
seed=1
while [ "$ordinary" -lt 7 ]; do
  if ! echo "$worst" | cut -d' ' -f1 | grep -qx "$seed"; then
    take "seed-$(printf %03d "$seed")" "$chart" --passes "$passes" --solo --seed "$seed"
    ordinary=$((ordinary + 1))
  fi
  seed=$((seed + 1))
done
rank=1
for seed in $(echo "$worst" | cut -d' ' -f1); do
  take "worst-$rank-seed-$(printf %03d "$seed")" "$chart" --passes "$passes" --solo --seed "$seed"
  rank=$((rank + 1))
done

echo "Does the comping leave room? Seeds 1 and 2 again, soloist and piano alone, then with a piano that cannot hear the soloist:"
for seed in 1 2; do
  take "room-seed-$seed-piano-listening" "$chart" --passes "$passes" --solo --seed "$seed" --without drums,bass
  node scripts/deaf-piano.ts "$chart" "$out/room-seed-$seed-piano-deaf.mid" "$passes" "$seed"
done

echo "The alto sax, which has to breathe (seeds 1 and 2):"
for seed in 1 2; do
  take "alto-seed-$seed" "$chart" --passes "$passes" --solo-instrument alto-sax --seed "$seed"
done

echo "Other tunes and lengths:"
take "timed-4min-quick-change-e" library/blues-intro-outro-d.chart --key E --tempo 108 --minutes 4 --solo --seed 1
take "slow-blues-g" library/blues-12-bar-a.chart --key G --tempo 66 --passes 4 --solo --seed 1
take "minor-blues-am" library/blues-minor-am.chart --passes "$passes" --solo --seed 1
take "jazz-blues-f" library/blues-jazz-f.chart --passes "$passes" --solo --seed 1
take "intro-and-tag-d-song" library/blues-intro-outro-d.chart --song --solo --seed 1
