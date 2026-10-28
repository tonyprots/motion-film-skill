#!/bin/sh
# Fetch the OFL font files a stage theme (engine/lib/themes.js) needs into assets/fonts/v/, Cyrillic + Latin, from
# Fontsource (jsDelivr). Run from the project root:  sh scripts/fonts.sh <theme | fontsource-id …>
#   sh scripts/fonts.sh newsroom            sh scripts/fonts.sh sofia-sans-extra-condensed commissioner
# A variable font comes as one wght file per subset; a static one (dela-gothic-one) as its 400 weight.
set -e
[ -z "$1" ] && { echo "usage: sh scripts/fonts.sh <reference|newsroom|studio|blueprint|riso|graphite|feed | fontsource-id …>"; exit 1; }
case "$1" in
  reference) echo "reference uses the project's own Display/UI faces: nothing to fetch"; exit 0 ;;
  newsroom)  set -- sofia-sans-extra-condensed commissioner ;;
  studio)    set -- literata commissioner ;;
  blueprint) set -- tektur martian-mono commissioner ;;
  riso)      set -- dela-gothic-one commissioner ;;
  graphite)  set -- geologica ;;
  feed)      set -- unbounded inter ;;
esac
D=assets/fonts/v; mkdir -p "$D"; B=https://cdn.jsdelivr.net/fontsource/fonts
for f in "$@"; do
  for s in cyrillic latin; do
    o="$D/$f-$s.woff2"; [ -s "$o" ] && continue
    curl -sfL -o "$o" "$B/$f:vf@latest/$s-wght-normal.woff2" || curl -sfL -o "$o" "$B/$f@latest/$s-400-normal.woff2" \
      || { rm -f "$o"; echo "FAILED: $f ($s) — check the id at fontsource.org and that it has a $s subset"; exit 1; }
  done
  echo "$f: $D/$f-cyrillic.woff2, $D/$f-latin.woff2"
done
