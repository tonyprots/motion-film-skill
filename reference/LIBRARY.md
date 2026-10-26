# Scene and graphics library

Read when choosing an object, visual metaphor or reusable element. Search before building from scratch:

```sh
node scripts/scenes.mjs counts
node scripts/scenes.mjs search "chart" --limit 12
node scripts/scenes.mjs list --status ready
node scripts/scenes.mjs show block:kanban-flow
node scripts/scenes.mjs copy icon:lucide:arrow-right --to assets/arrow.svg
```

Copy accepts only a local SVG, writes a new file inside the current project and refuses overwrites. The catalog is
offline, installs nothing and executes no external code. `init.sh` copies the catalog and icons into a new project;
run `node scripts/sync.mjs` after editing assets.

## Availability

For a gesturing presenter, object illustrations and causal transfer, read `EDITORIAL.md`: `ACTOR`, `PUPPET`, `LIPSYNC`, `ILLUSTRATIONS`,
`CAUSAL`. These entries use status `component`, separate from finished scene presets; no character/style is mandatory.
For an outline carried into another with a checked seam, read `MORPH.md` (`MORPH.handoff`).
Draw a film-specific object (a form with a missing field, an email lacking a detail) in the film project using the
`EDITORIAL.md` contract; a generic checklist does not explain a particular omission.

- `ready`: 13 presets: six PROPS actions plus seven BLOCKS presets. These are parameters of four new helpers,
  not 13 separate engines. Validate content, layout and meaning in each film.
- `asset`: 120 local SVGs: 40 each from Lucide outline, Tabler outline and Phosphor duotone. Licenses sit beside files.
- `external`: 710 HyperFrames/RemotionUI registry records: blocks, components, examples and support dependencies.
  These are metadata and links, not 710 ported scenes. No automatic code loading.
- `source:*`: 106 sources and packs for charts, maps, diagrams, typography, illustrations, 3D, shaders and mathematics.
  `source-license-checked` means the source license text was read; `not-adapted` means no runtime verification here.
  `metadata-license-only` and `license-needs-review` require a full grant review before copying. A player license does not license third-party assets.

Ready presets rank first among equal search matches. Asset records include runtime IDs, source URLs, Git blob SHAs
and SHA-256 hashes. Ported component pins are in the skill's `library/ports-manifest.json`.

## Scene API

`BLOCKS` is loaded by new scaffolds. Every `draw` computes state from absolute time in seconds. Keys resolve marks
through `C.bt`; numeric marks are beats, not seconds. Shared options: unique `id`, `label`, `x`, `y`, `w`, positive
`duration` in seconds. The returned `root` is registered for `C.put`.

```js
// build(root, S):
S.n = BLOCKS.mount(root, 'rolling-number', {
  id: 'audience', label: 'Participants', from: 0, to: 128, at: 'growth'
});
// run(t, b, S):
S.n.draw(t); // or draw(t, [[0, 0], ['growth', 128]])
```

| kind | Content/options | Selection |
|---|---|---|
| `rolling-number` | `from`, `to`: 0 <= n < 1e10; `decimals`: 0–2, `prefix`, `suffix`, `decimalSeparator` | default `mode:'spring'`; `plain` for calm changes, `drum` for a large mechanical carry |
| `kanban-flow` | 2–3 `columns`; 1–8 `cards`: `{id,title,column,to,at}`; `draw(t)` | `reflow` closes departures and accounts for occupied arrival slots; portrait columns become stacked sections |
| `data-chart` | 2–6 `data:[{label,value}]`, positive covering `max`; `unit`, `decimals`, `colors` | `draw(t, [[0,0],['growth',1]])`; staggered columns, or `layout:'horizontal'` for longer labels |
| `before-after` | `before`, `after`, `beforeLabel`, `afterLabel`; or `beforeSrc`, `afterSrc` | text uses `cut`; `wipe` requires two images; `draw(t, [[0,0],['change',1]])` |

Counter endpoints round to the chosen precision before animation. Negative/non-finite values and zero duration fail.
Tied chart maxima highlight the first by default; `colors` supplies a purposeful per-index palette. Chart modes
`together`/`line` remain available as source variants but are not selected ready presets. Drum numbers are a special
hero treatment: ordinary numbers read better at small size. Fixed-slot boards were rejected for gaps/collisions and
unstable portrait rasterization. Each card moves once; build a custom scene for a complex workflow. Recompose long
labels: helpers do not guarantee text fitting. Use local wipe images and await decoding before capture. Text wipes
were rejected because their boundary cuts through words.

## SVG

```js
const arrow = GRAPHICS.icon(root, 'lucide:arrow-right', {
  x: 240, y: 300, size: 120, color: 'var(--accent)'
});
C.put(arrow, { x: 260 });
const ids = GRAPHICS.ids();
```

`sync.mjs` embeds `assets/icons/<pack>/*.svg` in `film/data.js`; the helper performs no network requests. Icons are signs
and object parts, not replacements for real logos or UI. One stroke family per scene is a useful default; mixing is
valid when the idea benefits. Active SVG content and external references are rejected.

## External intake

Explore these mechanisms for a wider scene vocabulary; they are design recipes, not ready runtime presets:

| Mechanism | Meaning/input | Time and limits | Source |
|---|---|---|---|
| Reaction wave | a signal spreads across objects | delay = distance / speed; fixed points and seed | [OF Play](https://www.ordinaryfolk.co/play), ideas only; no rig redistribution grant assumed |
| Object morph | a shape changes role or several combine | prepare interpolator once, path = f(phase); inspect holes and self-intersections | [Flubber](https://github.com/veltman/flubber), MIT |
| Type surface | a word becomes a ribbon/cylinder | local font; keep factual text separately readable | [Troika](https://github.com/protectwise/troika), MIT |
| Flow field | load, signals or a moving medium | precompute trajectories and sample t; no trails accumulating across seeks | [motion-lab](https://github.com/bytepatterns/motion-lab), MIT |
| Contour by rule | reveal an algorithm, terrain or structure | use actual intermediate states, not fabricated data | [motion-lab contours](https://github.com/bytepatterns/motion-lab/tree/main/projects/47-contour-lines) |
| Material reveal | abstraction turns into a real image | Paper `setSpeed(0)` then `setFrame(t*1000)`; units are milliseconds; adapter not accepted yet | [Paper Shaders](https://github.com/paper-design/shaders), Apache-2.0 |
| Actor with an action | a character gives, builds or points | local GLB/clips; absolute time; test skeleton/root motion separately | Kenney / Quaternius, selected CC0 packs |
| Vector action | a prepared character/object animation | dotLottie `autoplay:false`; preload WASM/asset before `setFrame`; separate asset license | [dotLottie](https://github.com/LottieFiles/dotlottie-web) |

**Objects from open sets.** No ready set of neutral objects with states and a compatible licence exists, so hero objects
are drawn to the `EDITORIAL.md` contract (23 objects, skins `line`, `flat`, `mono`, `sketch`) and icons stay for chips
and small signs. Verdicts as of 2026-10-26:
- Lucide, Tabler, Phosphor, Iconoir, Heroicons (MIT/ISC) — signs, not the hero object of a frame;
- Fluent Emoji (MIT) — wide vocabulary, but the sticker look fights any film style and it has no states; not bundled;
- Twemoji (CC BY 4.0, attribution) and OpenMoji (CC BY-SA 4.0, share-alike) — not for an MIT library;
- unDraw, DrawKit, Storyset, ManyPixels, SVG Repo — licences forbid redistributing the set.

For 3D, start with Three.js and one Poly Haven object/local HDRI; for vector characters, Open Peeps, Open Doodles or
Humaaans (selected CC0 sources). Fluent Emoji supplies 3D-looking raster, not rotatable models. Twemoji code is MIT,
graphics are CC BY 4.0. Do not bundle raw Mixamo, unDraw, DrawKit or LottieFiles as a general asset pack.

Choose by the mechanism of the claim and phone-size clarity. Compare multiple solutions to the same task with equal
data, timing and formats. Read source and full license, pin versions, assess dependencies, fonts, network and capture
cost, preserve required notices. Permission to use an asset in video does not imply permission to redistribute it.

Remove React wrappers only when simpler than maintaining an adapter. Replace live clocks, timers, callbacks and
randomness with `draw(t)`/seed. No asynchronous mutation after frame readiness. Check intermediate times, forward and
backward seek, hidden scenes, alternate data, both formats and local resources; run `--verify` and inspect a clip.
Decoration need not prove a phrase event; semantic coverage requires observable state.

Composition limits are defaults (RULES "Look"). Select elements for what they explain.
