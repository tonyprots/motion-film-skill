# Notice: third-party work in this repository

motion-film is built on two projects. Their authors keep their rights; our MIT licence (`LICENSE`) covers only what we
wrote. Details of every change: `UPSTREAM.md`.

## Motion Reel Kit — Lukas Margerie
*Motion Reel Kit: beat-synced launch videos, made in code with Claude Code* — [weekly10x.com](https://weekly10x.com).
Distributed by its author without a licence file. The following files come from the kit (as is or edited) and remain
the author's work; they are **not** covered by our MIT licence:

- `engine/core.js`, `engine/type.js`, `engine/lib/motion.js`, `engine/lib/motion.test.js`, `engine/index.html`,
  `engine/film.js` (starter)
- `scripts/capture.mjs`, `scripts/beats.py`, `scripts/music.py`, `scripts/sfx.mjs`, `scripts/mix.py`, `scripts/review.py`,
  `scripts/sync.mjs`, `scripts/vo.py`, `scripts/preset.mjs`, `scripts/render.mjs` (parallel render and PNG path are ours)
- `reference/RULES.md`, `reference/CRITIQUE.md`, `reference/ENGINE.md` (sections marked as motion-film additions are ours)
- `templates/docs/*`, `templates/timeline.json`, `presets/blank/preset.jsonc`

If you are the author and want any of this changed, open an issue — we will act on it.

## voice-film — ArtKruglov (MIT)
[github.com/artkruglov/voice-film](https://github.com/artkruglov/voice-film), MIT, see `LICENSE-voice-film`:
`reference/STORY.md`, `scripts/extract_lines.py`, `scripts/script_lint.py`.

## Fonts and libraries
The only bundled font is Geist (SIL Open Font License 1.1) in `examples/readme-demo/preset/fonts/`, with its licence
next to it. The demo media in `docs/media/` were made with this skill and are covered by our MIT licence. Playwright (Apache-2.0) and the Python packages in `requirements.lock` are installed from their
registries under their own licences.
