# Set pieces: scenes people remember

A catalog of big cinematic devices: a world with sky and sea, a camera flight, a frame that behaves like a thing,
growth, scale. The device generator used to offer only what the DOM can do: cards, charts, type. Now set pieces are
built from ready-made engine kits: `world`, `sea`, `pass` (`engine/lib/world.js`), `materialCut`, `card`
(`engine/lib/material.js`), `tree`, `starfield` (`engine/lib/setpieces.js`), `C.sim` and `C.path` (`engine/core.js`). API:
ENGINE.md "Worlds and set pieces".

Read at step 2 (visual logic of the key beats), at step 5 (the hero moment in the shotlist) and at step 7 (the build).

## When a set piece fits

- **Slots.** The hook (first 3–6 s), the hero moment (60–85 % of the length), the finale or the echo. A film up to 1:30
  gets one or two set pieces, up to 4 minutes up to three. A material transition counts as a set piece.
- **Motivation.** A set piece is the thesis made physical. Test it with one sentence: "<device> shows that
  <thesis>". If the sentence does not come together, it is wallpaper, and it is not used.
- **Skip.** A leadership summary where the argument is a table; a shot that would hide the product or the interface; a render
  budget that does not survive `--perf` (below, "Cost").
- **Approval.** A set piece is named in the style guide and approved with it at step 5. It never appears silently:
  decorative motion is agreed with the customer in advance.

## How to invent

At step 2, in the item "2–3 prop answers for the main metaphor" (STORY.md "Hook and visual logic"), at least one
answer is a set piece of level 2–3 on the ladder below. In order:

1. **Find the physical quantity of the thesis:** scale (how many times), time (how long), a break (what ended), a path
   (where we are going), a choice (how many branches), a medium (where it lives).
2. **Take a device from the table** "quantity → device". The table is a hint, not a menu: your own device is better if it is more precise.
3. **Write the candidate down as a plan:** opening frame → action on the word → closing frame, camera move, length.
   A world shot runs at least 4 s, a material transition lasts 1.6–2.4 s.
4. **Name a level 0–1 fallback** that is built in the DOM if the trial fails.
5. **Try it early** (SKILL.md, step 2, "Early trial"): one styleframe and `render.mjs --perf` on it. Decide by the
   trial, not by the description.

**Boldness ladder:**
- 0 — DOM and SVG: cards, charts, type.
- 1 — 2.5D: photo depth, a screen in 3D (`uiShot`), paper (`paper.js`).
- 2 — material: the frame tears, folds, slams down as a slab; the film's frames are objects in space.
- 3 — world: sky, clouds, sea, a universe, a tree; the camera flies.

| Quantity of the thesis | Device |
|---|---|
| Scale, "N times" | a tower above the clouds; dominoes ×1.5; "Select all" on a growing object |
| Time, a path | a flight past the film's frames; a calendar compressed by pace |
| A break with the past, a change of chapter | the frame tears or folds; the new chapter slams down as a slab |
| A choice, branching | a tree |
| Reach, "all of this" | a flight through the universe |
| A new beginning | a dawn |
| A small error, big consequences | 1° over a large distance |

## Recipes

Each recipe has a status. "Verified on frames": built in the 2026-11-28 demo project, frames viewed; "recipe only": the
code has not been run. Cost is a `--perf` measurement on an M1, 1920×1080, GPU.

### 1. A tower above the clouds

- **Idea.** An honest linear scale: the last value is so much bigger than the rest that it breaks through the clouds, while
  the past years stay below them.
- **Shot.** The chart's bars stand in a world `world(L, { preset: 'golden' })`, the clouds at a height above every bar except
  the last. The camera rises along the tower on `C.path`, from the clouds to the top.
- **Build.** `world` + boxes (`THREE.BoxGeometry`) in the proportions of the chart on the slide; tone `neutral`: `agx` bleaches
  the accent to pink. Clouds: `clouds: { bottom, top, cover: 0.6 }`, the lower bars below `bottom`.
- **Sound.** The `wind` bed (AUDIO.md §3).
- **Cost.** 79 ms per shot, 2–6 blur sub-frames.
- **Status.** Verified on frames.

### 2. The frame as material: tear, fold, slab

- **Idea.** A change of chapter as an event: the old world has physically ended. The material comes from the story: in a film
  about documents paper tears, in a film about a launch the new chapter slams down as a slab.
- **Shot.** `tear`: the sheet tears from top to bottom, the halves fall, and the next scene is already alive under them (it
  shows in the rip before the sheet is gone). `fold`: the sheet folds in four and flies off. `slab`: the next frame slams
  down onto the screen as a slab.
- **Build.** `materialCut(C.stage, { kind, plate: C.plate(name), at })` in `film/gl.js` and a row in `timeline.json`
  `"plates"`. For `tear` and `fold` the plate is the last frame of the outgoing scene: `"at": "<mark>-0.02"`, and the scene
  ends on the mark. For `slab` the plate is the frame of the incoming scene at `at + 0.6·dur`, and the incoming scene's camera
  holds still until that moment. The sheet at the seam matches the frame pixel for pixel (measured: difference 0). Default
  lengths are 2.4 / 2.2 / 1.6 s, the same as the sound's.
- **Sound.** The cue `{"type": "material", "kind": "tear", "at": "<mark>", "dur": 2.4}`; the sound places itself on the
  transition's fractions.
- **Rule.** One or two per film, only at a chapter change or in the hero moment, the material motivated by the story.
- **Status.** Verified on frames (all three kinds).

### 3. A flight past the film's frames

- **Idea.** The path travelled: the frames of scenes already shown stand in space, and the camera flies past them to the last
  one. Works well before the finale or as an echo.
- **Shot.** Frame cards (`card(texture, { w })`) hang over the sea (`sea`) or in the sky, swaying slightly; the camera goes
  low on `C.path` and stops facing the last frame.
- **Build.** The frames are plates (`"plates"`), the texture is `L.texture(C.plate(name))`. By default `card` shows the frame
  in its own colours: otherwise a world lit for the clouds bleaches a white slide to cream.
- **Cost.** 88 ms per shot, but 9–17 blur sub-frames: the camera moves low and fast past nearby objects. In the demo that is
  68 % of the finale's time. A slower camera near close cards means fewer sub-frames.
- **Status.** Verified on frames.

### 4. A flight through the universe

- **Idea.** Reach: "all of this", from one point to a galaxy. Works well paired with the gesture anchor (recipe 9).
- **Shot.** `starfield(L, { count: 80000, seed })`: stars by temperature, spiral galaxies; the camera flies on `C.path`
  to one of `U.galaxies` and stops when it fills the frame.
- **Build.** A layer with `bloom: 0.6` (a dark ground is the only place for bloom). Stars are set in world units and
  fade near the camera and in the distance, so nothing pops in.
- **Rule.** The universe is dark: it is a shot, not a theme. A light film returns to the light after it.
- **Status.** Verified on frames; cost not measured.

### 5. A tree

- **Idea.** Branching: one decision has many consequences; growth from a seed to a crown.
- **Shot.** `tree(L, { seed, depth: 7 })`, with `T.grow(g)` in `L.frame`, g from 0 to 1. The trunk grows first, each branch
  starts when its parent has finished, the leaves open last. `T.tips` are the branch tips for labels.
- **Build.** The default height is 10 units, the camera at a distance of ~30. Leaves in the accent colour make the crown a sign.
- **Status.** Verified on frames; cost not measured.

### 6. Dominoes ×1.5

- **Idea.** Geometric growth that cannot be read as a number: 30 dominoes, each 1.5 times the size of the one before, from
  1 cm to 1.28 km (1.5²⁹ ≈ 127,800). Check the arithmetic before the script.
- **Build.** `C.sim`: the state is the dominoes' angles, step 1/240, an impact is recorded as an event (`emit('hit', …)`), the
  sound takes the events from `C.simEvents()`. The camera pulls back on `C.path` following the wave.
  ```js
  const D = C.sim({ name: 'domino', init: () => ({ a: new Float32Array(30), w: new Float32Array(30) }),
    tick: (s, dt, t, emit) => { /* each falling domino pushes the next one when its top reaches it */ } });
  // in run(t): const s = D.at(t);
  ```
- **Status.** Recipe only. `C.sim` is verified by tests (`engine/lib/motion.test.js`), not on frames.

### 7. A dawn

- **Idea.** A new beginning: the same world in a different light.
- **Build.** `world` and `W.set({ sun: { elev } })` in `L.frame`: the sun rises from −4° to 12°, preset `dawn`.
- **Cost.** The sky and its reflections are rebuilt on every change of sun: measure with `--perf` before the shotlist.
- **Status.** Recipe only.

### 8. An object over the sea

- **Idea.** One object alone in a big medium: a product, a decision, a point.
- **Build.** `world` + `sea(L, W, { waves: 'swell' })` + the object. Camera near the water: the waves' `scale` at least 0.5,
  otherwise the ripples read as a grid.
- **Status.** Verified on frames (with cards, recipe 3).

### 9. "Select all": the gesture anchor

- **Idea.** One gesture on bigger and bigger objects: a selection box lands on a paragraph, a page, a building, a city, a planet.
  The growing object under one gesture is the point of the film (FORMATS.md "Through-line anchor", the "gesture" variant).
- **Build.** The first steps are DOM, the far ones a world or `starfield`; the box stays a DOM element over the layer.
- **Status.** Recipe only.

### 10. A calendar compressed by pace

- **Idea.** Time is uneven: a day in the year's calendar is bigger the faster progress went in it.
- **Build.** A DOM grid of 365 cells, the cell size from the data, the camera moves along the year.
- **Status.** Recipe only.

### 11. 1° over a large distance

- **Idea.** A small error grows with distance: 1° is 17 cm at 10 m and about 6,700 km at the distance of the Moon (almost two
  of its diameters).
- **Build.** A ray from a point, the camera pulls back in steps of scale, the divergence labelled at every step.
- **Status.** Recipe only.

## Building a world: what to check

- **Light.** The world has its own sun (`world({ sun })`), and that is the single light source from RULES. Shadows and
  highlights on objects come from it.
- **Text over the world.** Only on a calm area (sky, water) with a measured contrast of at least 4.5:1, otherwise on a
  card.
- **Cost.** `render.mjs --perf` before the draft. More than 10 sub-frames on average: slow the camera near close objects.
  A world with clouds is about 80 ms per 1080p shot.
- **Determinism.** Everything from t, state only through `C.sim`, `--verify` once per project. A layer that is not
  visible right now returns `false` from its `L.frame` and spends no render time.
- **Plates.** They re-render themselves before every render mode. A plate does not show another plate. No file: a
  magenta sheet takes its place with an error in the console, so such a frame shows at once.
- **Vertical.** World camera keys go through `C.pick`: the narrow 9:16 frame crops objects placed for 16:9 (in the demo
  a card over the sea went off the edge).
- **Layer camera range.** `layer()` sees from 0.1 to 200 units. `world`, `tree` and `starfield` extend the range
  themselves; build your own bigger scene with `L.camera.far`.

## Risks

- **3D for its own sake.** A world without a thesis is wallpaper. The one-sentence test (above).
- **A shot that drags.** A world holds 4–8 s; longer only with new information in the frame.
- **Identical worlds.** The golden preset in every film is a cliché. The preset, time of day and palette come from the film.
- **The accent gets lost.** Haze and the tone curve dull the brand colour: compare the accent on the styleframe with the colour in the style guide.
- **Sound.** The bed and the material sound are a trial; decide after listening (AUDIO.md §3).
