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
- `reference/` — `RULES.md` (+ "Voice films"), `CRITIQUE.md` (+ voice-film failure modes, language, stop rule),
  `ENGINE.md` (+ layout, render speed), `AUDIO.md` (rewritten)
- `templates/docs/*`, `templates/timeline.json`, `presets/blank` (voiceover fields reworked)

Dropped: Fish Audio voiceover (replaced by providers), `install.sh` (global install), `prompts/`, `presets/lukas-yt`.

## 2. voice-film — MIT (artkruglov/voice-film, commit 7a4ce65) — `LICENSE-voice-film`
- `reference/STORY.md` (= `references/story.md`), `scripts/extract_lines.py`, `scripts/script_lint.py` (one doc line changed).
- Provider code is a rewrite of its `tts.py` / `_or.py` / `_vc.py` / `music.py` ideas.

## 3. Our own (workspace)
- `scripts/providers/` — registry and providers: `elevenlabs`, `openrouter`, `openai`.
- `scripts/voice.py`, `layout_vo.py` (generalised from the first film), `captions.py`, `music_source.py`, `png.mjs`, `tile.py`.
- `engine/lib/captions.js` (generalised from the first film), `templates/SCRIPT.md`, `templates/brief.md`, `templates/sfx_layout.py`.
- `defaults.json`, `README.md`.
- Render speed-up in `render.mjs` + `png.mjs`: measured on a 2:36 film, 9 min 46 s instead of ~42 min per format.

## Updating from upstream
Kit: diff a new archive against the checksums from the review, re-read changed scripts in full, re-apply the edits listed
above by hand. voice-film: diff against commit 7a4ce65 for the three files in §2.
