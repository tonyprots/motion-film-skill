#!/bin/sh
# End-to-end smoke test, no API keys: scaffold → synth score → mix → draft render 16:9 + 9:16 → check the MP4s.
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
echo "SMOKE OK"
