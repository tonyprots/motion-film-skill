#!/bin/sh
# Scaffold a motion-film project:  sh <skill>/scripts/init.sh <project-dir> [--preset <name|dir>]
# Copies the engine (film/), the pipeline scripts (scripts/) and the templates into a NEW folder, applies the preset,
# and links the shared toolchain: .venv → $MOTION_FILM_HOME/venv (Python deps) and node_modules → $MOTION_FILM_HOME/node_modules
# (Playwright). $MOTION_FILM_HOME defaults to ~/.cache/motion-film; it is created on first use (needs the network once).
# Refuses an existing non-empty folder: parallel sessions often pick the same slug.
set -e
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
HOMEDIR="${MOTION_FILM_HOME:-$HOME/.cache/motion-film}"
DEST="$1"
[ -z "$DEST" ] && { echo "usage: sh $0 <project-dir> [--preset <name|dir>]"; exit 1; }
PRESET=""
if [ "$2" = "--preset" ]; then
  for P in "$3" "presets/$3" "$SKILL/presets/$3" "$SKILL/presets/$(basename "$3")"; do
    [ -f "$P/preset.jsonc" ] && { PRESET="$(cd "$P" && pwd)"; break; }
  done
  [ -n "$PRESET" ] || { echo "no preset '$3' (looked in ./presets and $SKILL/presets)"; exit 1; }
fi
if [ -d "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null)" ]; then
  echo "REFUSING: $DEST exists and is not empty (another session may own it). Choose a new folder."; exit 2
fi
mkdir -p "$DEST"/film/lib "$DEST"/scripts/providers "$DEST"/docs "$DEST"/audio/vo "$DEST"/assets/fonts "$DEST"/assets/shots "$DEST"/renders "$DEST"/review
cp "$SKILL"/engine/index.html "$SKILL"/engine/core.js "$SKILL"/engine/type.js "$SKILL"/engine/film.js "$DEST"/film/
cp "$SKILL"/engine/lib/*.js "$DEST"/film/lib/
for f in render.mjs png.mjs sync.mjs sfx.mjs capture.mjs preset.mjs beats.py music.py music_source.py vo.py layout_vo.py captions.py \
         mix.py review.py tile.py voice.py extract_lines.py script_lint.py plan_check.py blindpack.py notes.py share.py sfx_fetch.py vision.py broll.py; do cp "$SKILL/scripts/$f" "$DEST/scripts/"; done
cp "$SKILL"/scripts/providers/*.py "$DEST"/scripts/providers/
cp "$SKILL"/templates/brief.md "$SKILL"/templates/timeline.json "$SKILL"/templates/SCRIPT.md "$DEST"/
cp "$SKILL"/templates/sfx_layout.py "$DEST"/scripts/
cp "$SKILL"/templates/docs/*.md "$DEST"/docs/
printf '{ "type": "commonjs", "private": true }\n' > "$DEST"/package.json   # a parent "type": "module" breaks motion.test.js
date -u +"created %Y-%m-%dT%H:%M:%SZ by motion-film init" > "$DEST"/.owner
printf 'node_modules\n.venv\nrenders/\nreview/\naudio/vo/_*\n' > "$DEST"/.gitignore
# providers read <skill>/defaults*.json through this pointer, so the project copy finds the same defaults
printf '%s\n' "$SKILL" > "$DEST"/scripts/providers/.skill

[ -n "$PRESET" ] && node "$SKILL"/scripts/preset.mjs "$PRESET" "$DEST"

# ---- shared toolchain (once per machine)
mkdir -p "$HOMEDIR"
# Pinned: requirements.lock (sha256 of every file) and toolchain/package-lock.json. A failed locked install stops here;
# it never falls back to unpinned versions. Python 3.11–3.13 preferred (librosa → numba lags new Pythons).
if [ ! -x "$HOMEDIR/venv/bin/python" ]; then
  PY=$(for p in python3.12 python3.11 python3.13 python3; do command -v $p >/dev/null && { echo $p; break; }; done)
  echo "creating $HOMEDIR/venv with $PY (numpy scipy soundfile librosa pillow, locked) …"
  $PY -m venv "$HOMEDIR/venv" && "$HOMEDIR/venv/bin/pip" install -q --require-hashes -r "$SKILL/requirements.lock" \
    || { rm -rf "$HOMEDIR/venv"; echo "ERROR: locked Python install failed (see above). Python 3.11–3.13 has wheels for every pin."; exit 1; }
fi
if [ ! -d "$HOMEDIR/node_modules/playwright" ] || [ ! -d "$HOMEDIR/node_modules/three" ]; then
  echo "installing Playwright, three.js, postprocessing, GSAP (locked) + Chromium headless shell into $HOMEDIR …"
  cp "$SKILL/toolchain/package.json" "$SKILL/toolchain/package-lock.json" "$HOMEDIR/"
  (cd "$HOMEDIR" && npm ci -s && npx playwright install chromium-headless-shell) || { echo "ERROR: Playwright install failed"; exit 1; }
fi
ln -s "$HOMEDIR/venv" "$DEST/.venv"
ln -s "$HOMEDIR/node_modules" "$DEST/node_modules"

cd "$DEST"
echo "scaffolded $DEST"
command -v ffmpeg >/dev/null || echo "WARN: ffmpeg not on PATH (brew install ffmpeg)"
.venv/bin/python -c "import numpy, scipy, soundfile, librosa, PIL" 2>/dev/null || echo "WARN: python deps missing in $HOMEDIR/venv"
node film/lib/motion.test.js >/dev/null && echo "motion.js tests pass"
node scripts/sync.mjs >/dev/null && echo "film/data.js written (nominal grid)"
echo "next: SKILL.md step 2 — STORY and SCRIPT.md"
