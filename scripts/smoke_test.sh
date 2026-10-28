#!/bin/sh
# End-to-end smoke test, no API keys: scaffold → synth score → mix → draft render 16:9 + 9:16 → check the MP4s →
# text lint + review gates + seams, then negative runs (a truncated video, a slide deck with a blank second, a shot list
# with three push-ins and a foreign number, invisible text, an «Illustration» plate, a screen cut at the side, text on text, a whoosh
# cue, a jump on a cut must fail).
# Proves the locked toolchain installs, Chromium renders, ffmpeg encodes, and the parallel render joins chunks.
#   sh scripts/smoke_test.sh [work-dir]      (CI runs it on Linux and macOS; MOTION_FILM_HOME picks the toolchain dir)
set -e
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${1:-$(mktemp -d)}/smoke-film"
sh "$SKILL/scripts/init.sh" "$WORK" --preset blank
"$WORK/.venv/bin/python" -m unittest discover -s "$SKILL/tests" -p 'test_layout_vo.py'
node "$SKILL/tests/test_story.mjs"
node "$SKILL/tests/test_blocks.mjs"
node "$SKILL/tests/test_editorial.mjs"
node "$SKILL/tests/test_frame_clock.mjs"
node "$SKILL/tests/test_morph.cjs"
node "$SKILL/tests/test_render_server.mjs"
# the project gets every script the docs run from it (skill-only tooling: lock_deps.py, update_check.py, figures_build.py)
for p in "$SKILL"/scripts/*.py "$SKILL"/scripts/*.mjs; do
  n=$(basename "$p"); case "$n" in lock_deps.py|update_check.py|figures_build.py) continue;; esac
  [ -f "$WORK/scripts/$n" ] || { echo "FAIL: init.sh did not copy scripts/$n into the project"; exit 1; }
done
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
.venv/bin/python scripts/stillness.py renders/draft_9x16.mp4 >/dev/null || [ $? -eq 1 ]   # runs from the project; 1 = still stretches found
node scripts/player.mjs --selftest --shot review/player.png
# negative runs: a check that cannot fail proves nothing — each one must go red on a known-bad input
mkdir -p neg && cp renders/draft_16x9.mp4 neg/full.mp4
ffmpeg -v error -y -i neg/full.mp4 -t 3 -c copy renders/draft_16x9.mp4
if .venv/bin/python scripts/review.py neg --draft >/dev/null 2>&1; then echo "FAIL: review.py passed a truncated video"; exit 1; fi
echo "negative: truncated video → review.py FAIL (expected)"
cp neg/full.mp4 renders/draft_16x9.mp4
# a slide deck: static cards cut every 3 s, a grey second in the middle → blank FAIL + slideshow WARN
.venv/bin/python - <<'PY'
from PIL import Image, ImageDraw
for i, bg in enumerate([(245, 244, 239), (32, 36, 44), (250, 250, 250)]):
    im = Image.new('RGB', (1920, 1080), bg); d = ImageDraw.Draw(im); ink = (40, 40, 40) if i != 1 else (230, 230, 230)
    d.rectangle([160, 180, 1500, 260], fill=ink)
    for k in range(4): d.rectangle([200, 380 + 110 * k, 1300 - 120 * k, 420 + 110 * k], fill=ink)
    im.save(f'neg/card{i}.png')
Image.new('RGB', (1920, 1080), (128, 128, 128)).save('neg/grey.png')
open('neg/deck.txt', 'w').write(''.join(f"file '{p}'\nduration {t}\n" for p, t in
    [('card0.png', 3), ('card1.png', 3), ('grey.png', 1), ('card2.png', 3), ('card0.png', 3)]) + "file 'card0.png'\n")
PY
ffmpeg -v error -y -f concat -i neg/deck.txt -vf fps=30,format=yuv420p -c:v libx264 neg/deck.mp4
if .venv/bin/python scripts/review.py --slideshow neg/deck.mp4 > neg/deck.log 2>&1; then echo "FAIL: review.py --slideshow passed a blank second"; exit 1; fi
grep -q 'fast motion in' neg/deck.log || { echo "FAIL: review.py --slideshow did not flag a static slide deck"; cat neg/deck.log; exit 1; }
echo "negative: slide deck with a grey second → slideshow FAIL + WARN (expected)"
# a shot list with three push-ins in a row and a number the voice never says → plan_check FAIL + WARN
cp docs/shotlist.md neg/shotlist.ok; cp SCRIPT.md neg/SCRIPT.ok
cat > docs/shotlist.md <<'MD'
| # | Биты | Время (с) | Плотн. 1–5 | Объект | Действие | Камера | Текст на экране (дословно) | Переход (пресет, носитель) | SFX (метка таймлайна) | Голос (дословная строка) | Заметки для 9:16 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 0–4 | 0.0–2.0 | 3 | карточка тарифа | раскрывается вниз | медленный наезд | Рост 47% | | | | |
| 2 | 4–8 | 2.0–4.0 | 2 | график выручки | столбцы растут | медленный наезд | | | | | |
| 3 | 8–12 | 4.0–6.0 | 4 | курсор | щёлкает по кнопке | быстрый наезд | | | | | |
| 4 | 12–16 | 6.0–8.0 | 3 | логотип | собирается из точек | стоп | | | | | |
MD
printf '## 1. Хук\n**Голос:** «Двадцать команд уже работают так.»\n' > SCRIPT.md
if .venv/bin/python scripts/plan_check.py > neg/plan.log 2>&1; then cp neg/shotlist.ok docs/shotlist.md; cp neg/SCRIPT.ok SCRIPT.md; echo "FAIL: plan_check passed a number the voice never says"; exit 1; fi
cp neg/shotlist.ok docs/shotlist.md; cp neg/SCRIPT.ok SCRIPT.md
grep -q 'shows 47' neg/plan.log && grep -q 'three push-ins in a row' neg/plan.log || { echo "FAIL: plan_check missed the number or the push-ins"; cat neg/plan.log; exit 1; }
echo "negative: shot list with three push-ins and a foreign number → plan_check FAIL + WARN (expected)"
sed 's|</style>|.line .word{color:#ecebe6 !important}</style>|' film/index.html > neg/index.html && cp film/index.html neg/index.ok && cp neg/index.html film/index.html
if node scripts/render.mjs --lint --fmt 16x9 >/dev/null 2>&1; then cp neg/index.ok film/index.html; echo "FAIL: --lint passed near-invisible text"; exit 1; fi
cp neg/index.ok film/index.html
echo "negative: low-contrast text → --lint PROBLEM (expected)"
cp film/film.js neg/film.cut
cat >> film/film.js <<'JS'
(() => { C.el('div', { class: 'cap abs', style: 'top:900px;left:-160px;font:600 48px UI;color:#f5f4ef;background:#111' }, document.body, 'Caption runs off the edge'); })();
JS
if node scripts/render.mjs --lint --fmt 16x9 >/dev/null 2>&1; then cp neg/film.cut film/film.js; echo "FAIL: --lint passed a caption cut by the frame edge"; exit 1; fi
cp neg/film.cut film/film.js
echo "negative: caption off the frame edge → --lint PROBLEM (expected)"
cat >> film/film.js <<'JS'
(() => { C.el('div', { class: 'abs', style: 'top:120px;left:120px;font:600 40px UI;color:#111;background:#f5f4ef' }, document.body, 'Illustration'); })();
JS
if node scripts/render.mjs --lint --fmt 16x9 >/dev/null 2>&1; then cp neg/film.cut film/film.js; echo "FAIL: --lint passed an «Illustration» plate"; exit 1; fi
cp neg/film.cut film/film.js
echo "negative: «Illustration» plate → --lint PROBLEM (expected)"
cat >> film/film.js <<'JS'
(() => { const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500"><rect width="900" height="500" fill="#dde"/><text x="40" y="250" font-size="60">Privacy and Data</text></svg>';
  C.el('img', { class: 'abs', src: 'data:image/svg+xml,' + encodeURIComponent(svg), style: 'top:300px;left:-320px;width:900px;height:500px' }, document.body); })();
JS
if node scripts/render.mjs --lint --fmt 16x9 >/dev/null 2>&1; then cp neg/film.cut film/film.js; echo "FAIL: --lint passed a screen cut at the side"; exit 1; fi
cp neg/film.cut film/film.js
echo "negative: screen cut at the side → --lint PROBLEM (expected)"
cat >> film/film.js <<'JS'
(() => { C.el('div', { class: 'abs', style: 'top:420px;left:520px;font:700 64px UI;color:#111;background:#f5f4ef' }, document.body, 'Quarterly revenue');
  C.el('div', { class: 'abs', style: 'top:450px;left:600px;font:700 64px UI;color:#c22;background:#fff' }, document.body, 'Approved'); })();
JS
if node scripts/render.mjs --lint --fmt 16x9 2>&1 | grep -q ' lies on '; then :; else cp neg/film.cut film/film.js; echo "FAIL: --lint passed text lying on text"; exit 1; fi
cp neg/film.cut film/film.js
echo "negative: text on text → --lint PROBLEM overlap (expected)"
cp cues.json neg/cues.ok
node -e "const f='cues.json',c=JSON.parse(require('fs').readFileSync(f));c.cues.push({t:1,type:'whoosh',gain:0.5,what:'neg'});require('fs').writeFileSync(f,JSON.stringify(c))"
if node scripts/sfx.mjs >/dev/null 2>&1; then cp neg/cues.ok cues.json; echo "FAIL: sfx.mjs played a whoosh"; exit 1; fi
cp neg/cues.ok cues.json
echo "negative: whoosh cue → sfx.mjs stops (expected)"
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
