# Upstream and licences

motion-film is assembled from two sources plus our own code, built 2026-10-04 after a first real film on the kit's engine.
Both authors are credited in `README.md` → Acknowledgements; keep that section in every copy, public or not.

## 1. Motion Reel Kit (weekly10x.com) — NO LICENCE
Archive from the weekly10x.com newsletter, reviewed line by line on 2026-10-04 before use.
The archive carries **no licence file**: by default all rights stay with the author. Fine for our own
use; **public redistribution needs the author's written permission** (or a rewrite of these parts).
`publish/build_public.sh` refuses to run without `--kit-licence-ok`.

From the kit, as is or lightly edited:
- `engine/` — `core.js`, `type.js`, `lib/motion.js` (+ test), `index.html` (favicon, `.cap`, captions script added), starter `film.js` (captions line added)
- `scripts/` — `capture.mjs`, `beats.py`, `music.py`, `sfx.mjs`, `mix.py`, `review.py` as is; `sync.mjs` (+ captions),
  `vo.py` (main guard, provider-neutral doc), `preset.mjs` (multi-weight local fonts, voiceover/transcribe/vo_layout),
  `render.mjs` (fast PNG decode + parallel chunks, see below), `init.sh` (rewritten)
- `reference/` — `RULES.md`, `CRITIQUE.md` (+ voice-film failure modes, language, stop rule),
  `ENGINE.md` (+ layout, render speed), `AUDIO.md` (rewritten)
- `templates/docs/*`, `templates/timeline.json`, `presets/blank` (voiceover fields reworked)

Dropped: Fish Audio voiceover (replaced by providers), `install.sh` (global install), `prompts/`, `presets/lukas-yt`.

## 2. voice-film — MIT (artkruglov/voice-film, commit 7a4ce65) — `LICENSE-voice-film`
- `reference/STORY.md` (based on `references/story.md`; arcs, source and ending rules added), `scripts/extract_lines.py`, `scripts/script_lint.py` (STORY field checks extended).
- Provider code is a rewrite of its `tts.py` / `_or.py` / `_vc.py` / `music.py` ideas.

## 2b. huashu-art-motion — MIT (alchaincyf/huashu-art-motion, commit 64cb272) — `LICENSE-huashu-art-motion`
- `reference/EXPLAINERS.md`: the explainer grammars (`references/09-视频动画语法.md`, `动画语法/*.md`) and the per-genre base
  camera (`references/镜头语言.md`), translated and rewritten for our engine. Their code (canvas2D, `clips/*.js`) is not used.

## 2c. Scene and SVG library — 2026-10-26

`engine/lib/blocks.js` adapts selected formulas/layouts from RenderComp/free-remotion-templates (KPI odometer, MIT,
Copyright 2026 Trimora Inc.), riaz37/remotion-ui (kanban-move, MIT, Copyright 2026 RemotionUI), degueba/onda
(CountUp/BarChart, MIT, Copyright 2026 Rodrigo Botelho), and heygen-com/hyperframes (chart/wipe, Apache-2.0,
Copyright 2026 HeyGen, Inc.). Full grants: `LICENSE-rendercomp`, `LICENSE-remotion-ui`, `LICENSE-onda`, `LICENSE-hyperframes`.
Exact source blob pins: `library/ports-manifest.json`.

Changes replace React/live timelines with absolute-time `C.seek`, normalize counter precision, recompute occupied board
slots, reflow portrait layout, handle zero-valued charts and invalidate stale SVG/mask rasterization. Fixed-slot boards
and text wipes were rejected. Local icons: 40 each from Lucide (ISC plus MIT Feather notices), Tabler (MIT) and Phosphor
duotone (MIT); keep full LICENSE files beside packs. Source pins and SHA-256: `library/assets/icons/manifest.json`.
`graphics.js` and the offline catalog are our code. External indexes contain metadata/links only, with no automatic
bundling of external code or assets. Full credits are also listed in `NOTICE.md`.
Extras: 563 SVGs from googlefonts/noto-emoji `2D/svg/` (commit `e20cbc2b`, Apache-2.0, Copyright 2013 Google, Inc.),
LICENSE beside them in `library/assets/extras/noto/`. Modified: Illustrator metadata, comments and unused ids removed, remaining ids shortened,
coordinates rounded to 0.01 units (shapes and colours unchanged). Pins and SHA-256: `manifest.json` there. The
repainting into film skins (`ILLUSTRATIONS.extra`) is our code.

## 3. Our own (workspace)
`engine/lib/morph.js` is a separate adaptation of `alexgreensh/anidoodle` `canvas-core/morph.ts`, Copyright 2026
Alex Greenshpun, Apache-2.0 (`LICENSE-anidoodle`, `NOTICE-anidoodle`); pin in `library/ports-manifest.json`.
Changes: JavaScript, seconds-based time/velocity, validated inputs, copied endpoints and SVG adapter.
`engine/lib/actor-hands.js` contains baked SVG open/point/relaxed hands derived from `character/human/hands.ts`, same author
and Apache-2.0 grant. Changes: 2D projection, 0.22px simplification, frozen geometry without a 3D runtime. Source pins for
hands/math3/shape2d and the data hash are in `library/ports-manifest.json`. Other engine/audio/image modules, full head and
FK rig are not bundled.

- `engine/lib/actor.js`, `causal.js`, `illustrations.js`: original SVG head/body artwork, presenter rig, object states,
  spatial wave and causal transfer. Hands load separately from `actor-hands.js` under the Apache-2.0 attribution above;
  the assembled character is no longer wholly original artwork.
- `scripts/providers/` — registry and providers: `elevenlabs`, `openrouter`, `openai`.
- `scripts/voice.py`, `layout_vo.py` (generalised from the first film), `captions.py`, `music_source.py`, `png.mjs`, `tile.py`.
- `engine/lib/captions.js` (generalised from the first film), `templates/SCRIPT.md`, `templates/brief.md`, `templates/sfx_layout.py`.
- `defaults.json`, `README.md`.
- Render speed-up in `render.mjs` + `png.mjs`: measured on a 2:36 film, 9 min 46 s instead of ~42 min per format.

## Updating from upstream
Kit: diff a new archive against the checksums from the review, re-read changed scripts in full, re-apply the edits listed
above by hand. voice-film: diff against commit 7a4ce65 for the three files in §2.
