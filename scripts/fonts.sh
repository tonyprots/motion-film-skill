#!/bin/sh
# Fetch the OFL font files a stage theme (engine/lib/themes.js) needs into assets/fonts/v/, Cyrillic + Latin, from
# Fontsource (jsDelivr). Run from the project root:  sh scripts/fonts.sh <theme | fontsource-id …>
#   sh scripts/fonts.sh newsroom            sh scripts/fonts.sh sofia-sans-extra-condensed commissioner
# A variable font comes as one wght file per subset; a static one (dela-gothic-one) as its 400 weight, or the weight
# after a colon (lxgw-wenkai-tc:700). The theme's handwriting face (T.H) comes with it.
set -e
[ -z "$1" ] && { echo "usage: sh scripts/fonts.sh <theme | fontsource-id[:weight] …>   themes: reference newsroom studio blueprint riso graphite feed notebook draft card yard stationery school"; exit 1; }
case "$1" in
  reference)  set -- caveat; echo "reference: the project's own Display/UI faces; fetching the hand only" ;;
  newsroom)   set -- sofia-sans-extra-condensed commissioner caveat ;;
  studio)     set -- literata commissioner bad-script ;;
  blueprint)  set -- tektur martian-mono commissioner lxgw-wenkai-tc:700 ;;
  riso)       set -- dela-gothic-one commissioner neucha ;;
  graphite)   set -- geologica pangolin ;;
  feed)       set -- manrope inter shantell-sans ;;
  notebook)   set -- commissioner caveat ;;
  draft)      set -- tektur martian-mono commissioner lxgw-wenkai-tc:700 ;;
  card)       set -- literata great-vibes ;;
  yard)       set -- sofia-sans-extra-condensed commissioner rubik-wet-paint ;;
  stationery) set -- playpen-sans commissioner ;;
  school)     set -- commissioner marck-script ;;
esac
D=assets/fonts/v; mkdir -p "$D"; B=https://cdn.jsdelivr.net/fontsource/fonts
for a in "$@"; do
  f=${a%%:*}; w=400; [ "$f" != "$a" ] && w=${a#*:}
  for s in cyrillic latin; do
    o="$D/$f-$s.woff2"; [ -s "$o" ] && continue
    { [ "$f" = "$a" ] && curl -sfL -o "$o" "$B/$f:vf@latest/$s-wght-normal.woff2"; } || curl -sfL -o "$o" "$B/$f@latest/$s-$w-normal.woff2" \
      || { rm -f "$o"; echo "FAILED: $f ($s) — check the id at fontsource.org and that it has a $s subset"; exit 1; }
  done
  echo "$f: $D/$f-cyrillic.woff2, $D/$f-latin.woff2"
done
