#!/bin/sh
# End-to-end smoke test, no API keys: scaffold → synth score → mix → draft render 16:9 + 9:16 → check the MP4s →
# text lint + review gates + seams, then negative runs (a truncated video, invisible text, a jump on a cut must fail).
# Proves the locked toolchain installs, Chromium renders, ffmpeg encodes, and the parallel render joins chunks.
#   sh scripts/smoke_test.sh [work-dir]      (CI runs it on Linux and macOS; MOTION_FILM_HOME picks the toolchain dir)
set -e
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${1:-$(mktemp -d)}/smoke-film"
sh "$SKILL/scripts/init.sh" "$WORK" --preset blank
cd "$WORK"
.venv/bin/python scripts/music_source.py
node scripts/sync.mjs >/dev/null
node scripts/sfx.mjs >/dev/null
.venv/bin/python scripts/mix.py
node scripts/render.mjs --draft --all --workers 2
for f in 16x9 9x16; do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "renders/draft_$f.mp4")
  s=$(ffprobe -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 "renders/draft_$f.mp4")
  echo "draft_$f.mp4: ${d}s, audio ${s:-none}"
  python3 -c "import sys; d=float('$d'); sys.exit(0 if d > 5 else 1)" || { echo "FAIL: draft_$f.mp4 too short"; exit 1; }
  [ -n "$s" ] || { echo "FAIL: draft_$f.mp4 has no audio"; exit 1; }
done
node scripts/render.mjs --lint --all
.venv/bin/python scripts/plan_check.py
.venv/bin/python scripts/review.py smoke --draft
# negative runs: a check that cannot fail proves nothing — each one must go red on a known-bad input
mkdir -p neg && cp renders/draft_16x9.mp4 neg/full.mp4
ffmpeg -v error -y -i neg/full.mp4 -t 3 -c copy renders/draft_16x9.mp4
if .venv/bin/python scripts/review.py neg --draft >/dev/null 2>&1; then echo "FAIL: review.py passed a truncated video"; exit 1; fi
echo "negative: truncated video → review.py FAIL (expected)"
cp neg/full.mp4 renders/draft_16x9.mp4
sed 's|</style>|.line .word{color:#ecebe6 !important}</style>|' film/index.html > neg/index.html && cp film/index.html neg/index.ok && cp neg/index.html film/index.html
if node scripts/render.mjs --lint --fmt 16x9 >/dev/null 2>&1; then cp neg/index.ok film/index.html; echo "FAIL: --lint passed near-invisible text"; exit 1; fi
cp neg/index.ok film/index.html
echo "negative: low-contrast text → --lint PROBLEM (expected)"
node scripts/render.mjs --seams --all
cp film/film.js neg/film.ok
cat >> film/film.js <<'JS'
(() => { const tag = C.el('div', { class: 'abs', style: 'top:60px;font:600 64px UI;color:var(--ink)' }, document.body, 'Pricing');
  C.hooks.after.push((t) => { tag.style.left = (t < C.bt('mid') ? 140 : 440) + 'px'; }); })();   // shared label that jumps 300 px on the cut
JS
if node scripts/render.mjs --seams --fmt 16x9 >/dev/null 2>&1; then cp neg/film.ok film/film.js; echo "FAIL: --seams passed a label that jumps on the cut"; exit 1; fi
cp neg/film.ok film/film.js
echo "negative: label jumps on a cut → --seams PROBLEM (expected)"
echo "SMOKE OK"
