# Notice: third-party work in this repository

motion-film incorporates the projects listed below. Their authors keep their rights; our MIT licence (`LICENSE`) covers only what we
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

## huashu-art-motion — alchaincyf (MIT)
[github.com/alchaincyf/huashu-art-motion](https://github.com/alchaincyf/huashu-art-motion), MIT, see
`LICENSE-huashu-art-motion`: `reference/EXPLAINERS.md` is a translated and rewritten derivative of its explainer grammars.

## Fonts and libraries
The only bundled font is Geist (SIL Open Font License 1.1) in `examples/readme-demo/preset/fonts/`, with its licence
next to it. The demo media in `docs/media/` were made with this skill and are covered by our MIT licence. Playwright (Apache-2.0) and the Python packages in `requirements.lock` are installed from their
registries under their own licences.

## Native scene adaptations and local SVGs

`engine/lib/blocks.js` adapts selected formulas and layouts from:

- [RenderComp/free-remotion-templates](https://github.com/RenderComp/free-remotion-templates): KPI odometer,
  Copyright 2026 Trimora Inc., MIT (`LICENSE-rendercomp`).
- [riaz37/remotion-ui](https://github.com/riaz37/remotion-ui): kanban move,
  Copyright 2026 RemotionUI, MIT (`LICENSE-remotion-ui`).
- [degueba/onda](https://github.com/degueba/onda): chart/count layout,
  Copyright 2026 Rodrigo Botelho, MIT (`LICENSE-onda`).
- [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes): chart and before/after wipe,
  Copyright 2026 HeyGen, Inc., Apache-2.0 (`LICENSE-hyperframes`).

Adaptations replace React and live timelines with pure absolute-time drawing, local data, precision normalization,
format-aware reflow, occupied-slot calculation and raster invalidation. Exact source blob pins: `library/ports-manifest.json`.

`library/assets/icons/` contains 40 SVGs from each project: [Lucide](https://github.com/lucide-icons/lucide)
(ISC, plus MIT Feather notices), [Tabler](https://github.com/tabler/tabler-icons) (MIT),
[Phosphor](https://github.com/phosphor-icons/core) (MIT). Keep each pack's full LICENSE with copied assets.
Their source pins and SHA-256 hashes are in `library/assets/icons/manifest.json`.

`library/assets/extras/noto/` contains 563 SVGs from [Noto Emoji](https://github.com/googlefonts/noto-emoji)
(`2D/svg/`, Apache License 2.0, Copyright 2013 Google, Inc.), with that LICENSE beside them. The files were modified:
Illustrator metadata, comments and unused ids removed, remaining ids shortened, coordinates rounded to 0.01 units; shapes and colours are
unchanged. Source pins and SHA-256 hashes are in `library/assets/extras/noto/manifest.json`.

External registry and source indexes contain metadata and links only; their entries are not installed or relicensed.

## anidoodle morphology

`engine/lib/morph.js` adapts `canvas-core/morph.ts` from [alexgreensh/anidoodle](https://github.com/alexgreensh/anidoodle),
Copyright 2026 Alex Greenshpun, Apache-2.0. Full grant and upstream notice: `LICENSE-anidoodle`, `NOTICE-anidoodle`.
Changes: plain JavaScript, seconds-based time/velocity, input validation, copied endpoints and SVG rendering.
`engine/lib/actor-hands.js` additionally contains SVG hand silhouettes derived from `character/human/hands.ts` and
math3/shape2d: open, point and relaxed poses projected to 2D and simplified at 0.22px. Frozen data only, no 3D runtime.
The assembled presenter includes these Apache-2.0 hands; its head, body and expression rig remain original.
The rest of the engine, audio pack, full character head/FK rig and reference images are not included.
