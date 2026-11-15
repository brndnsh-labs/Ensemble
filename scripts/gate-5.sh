#!/bin/sh
# Writes the gate 5 audition files to out/gate-5/. See docs/MILESTONES.md.
# Each take is rendered through the real sampler and mixer in a headless
# Chrome (scripts/render-audio.ts), then encoded to .m4a so that any player
# on a laptop or a phone will open it. The audio is not kept in git: running
# this again makes the same files from the same packs.
#
# The gate asks: do the instruments sound like they are in the same room, is
# anything too loud, too quiet or muddy, and which soloists are worth keeping?
# So: each band on a few of its own tunes, the same take with each soloist,
# and the same take with every dynamic layer and with one.
set -eu
cd "$(dirname "$0")/.."
out=out/gate-5
mkdir -p "$out"
rm -f "$out"/*.m4a
take() { # take <name> <chart> [key=value...]
  name=$1
  chart=$2
  shift 2
  node scripts/render-audio.ts "gate5-$name" "chart=$chart" "$@" >/dev/null 2>&1
  ffmpeg -v error -y -i "out/audio/gate5-$name.wav" -c:a aac -b:a 224k "$out/$name.m4a"
  loud=$(ffmpeg -hide_banner -nostats -i "out/audio/gate5-$name.wav" -af ebur128=peak=true -f null - 2>&1 |
    awk '/I:/{i=$2} /Peak:/{p=$2} END{printf "%.1f LUFS, peak %.1f dBFS", i, p}')
  rm -f "out/audio/gate5-$name.wav" "out/audio/gate5-$name.json"
  echo "  $name.m4a  ($loud)"
}

echo "1. Jazz: drum kit, upright bass, grand piano."
take 1-jazz-rhythm-changes-bb-alto jazz-rhythm-changes-bb.chart passes=4 seed=1 solo=alto-sax
take 1-jazz-two-five-one-c-vibes jazz-two-five-one-c.chart passes=4 seed=4 solo=vibraphone
take 1-jazz-ballad-eb-alto jazz-ballad-eb.chart passes=2 seed=8 solo=alto-sax
take 1-jazz-waltz-f-no-solo jazz-waltz-f.chart passes=3 seed=9

echo "2. Blues: the same three instruments."
take 2-blues-12-bar-a-alto blues-12-bar-a.chart passes=5 seed=2 solo=alto-sax
take 2-blues-slow-g-vibes blues-slow-g.chart passes=3 seed=4 solo=vibraphone
take 2-blues-quick-change-e-no-solo blues-quick-change-e.chart passes=4 seed=3

echo "3. Funk: drum kit, electric bass, clean guitar."
take 3-funk-vamp-a-alto funk-vamp-a.chart passes=4 seed=1 solo=alto-sax
take 3-funk-two-chord-dm-no-solo funk-two-chord-dm.chart passes=4 seed=7
take 3-funk-verse-bridge-e-vibes funk-verse-bridge-e.chart passes=3 seed=6 solo=vibraphone

echo "4. The same take with each soloist (a jazz blues in F)."
take 4-soloist-alto blues-jazz-f.chart style=jazz passes=4 seed=2 solo=alto-sax
take 4-soloist-vibes blues-jazz-f.chart style=jazz passes=4 seed=2 solo=vibraphone

echo "5. The same take with every dynamic layer, and with one."
take 5-layers-all jazz-rhythm-changes-bb.chart passes=2 seed=3 solo=alto-sax
take 5-layers-one jazz-rhythm-changes-bb.chart passes=2 seed=3 solo=alto-sax layers=1
take 5-funk-layers-all funk-one-chord-e.chart passes=3 seed=9
take 5-funk-layers-one funk-one-chord-e.chart passes=3 seed=9 layers=1

# A page to listen from: every file with a player, in the order above.
{
  echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
  echo '<title>Ensemble gate 5</title><style>:root{color-scheme:light dark;font:16px/1.5 system-ui,sans-serif}body{max-width:40rem;margin:0 auto;padding:1rem}audio{width:100%}p{margin:1rem 0 0.2rem}</style></head><body>'
  echo '<h1>Gate 5: one band</h1><p><a href="GATE_REPORT.md">The report</a> &middot; <a href="/tools/audition/">Play any take live</a></p>'
  for file in "$out"/*.m4a; do
    name=$(basename "$file")
    echo "<p>$name</p><audio controls preload=\"none\" src=\"$name\"></audio>"
  done
  echo '</body></html>'
} >"$out/index.html"
echo "Listen at /out/gate-5/ on the audition server (pnpm audition)."
