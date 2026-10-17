# Explainer formats

When to read: at step 2, if the film explains a mechanism, a conclusion or how numbers move, read the table "Choosing
by voice fragment"; read the general rules and a card if format 9–14 is chosen or taken as a chapter. Otherwise don't
read it. These are extra cards for `reference/FORMATS.md`: the same choice rules, one main format per film, the line
"Format: <name> — <why>; the runner-up was <name> — <why not>".

_Based on huashu-art-motion (MIT, alchaincyf), reworked for our engine._

## General rules

RULES.md stays in force; a card overrides only what is written in its "Overrides" field.

1. **Enter in 0.3–0.4 s, exit in ~0.18 s** with acceleration (`C.ease.expoIn`): attention leaves before the element.
   Enter on a spring with no overshoot: `"presets": {"explain": {"response": 0.3, "damping": 1}}` in `timeline.json "motion"`.
2. **Landed — hold.** A number ≥ 0.5 s, a payoff ≥ 0.9 s, ~1 s after a transformation. Nothing new in those seconds.
3. **Axes → data → label.** For diagrams: frame → content → highlight. One label per frame.
4. **Colour = concept.** One colour per concept for the whole film, the same in the formula and in the diagram; ≤ 3–4
   meaning colours, the rest neutral.
5. **One focus.** One element enters, the rest stands still; the main word ≥ 3:1 to the subline; the background one
   step quieter than the hero in saturation, contrast and line weight.
6. **Reveal on the mark.** The voice mark holds the frame where the new thing is first visible, not the start of the
   transition: start = mark − reveal point × duration. A count: start = mark − count duration. The picture may lead
   the sound by a frame, never lag it (`C.spHit`).
7. **Camera from the RULES vocabulary** ("The camera is punctuation"): it stands while people read and moves when the
   eye needs a new place. In an explainer, hold is the most frequent move.
8. **Flying into an opening** (logarithmic zoom, RULES): the final zoom ≥ the distance from the centre of an opening of
   radius r to the far corner of the frame / r, or the opening won't cover the frame and the last frame jumps.
9. **A number sits on an object** in the film's world (a document, a screen, a board, a bar), not on a full-frame
   fill: such a plate reads as an inserted slide.
10. **Transitions between phrases** or on a change of topic, never mid-phrase.
11. **Real material is the main frame**, nearly full-frame, proportions intact. Data changes how it appears, not its
    value; made-up data carries an "illustrative data" tag in every frame it is in.
12. **Check the logic.** "Grew 8.7 times" = "grew by 770 %"; a multiple is derivable from the numbers on screen; a number
    that has finished counting does not count again from zero after expanding to full frame.

**Growth in one place.** A counter, bars from zero, a line drawn over time — in one scene of the film, usually at the
main number. Other charts and numbers enter already built; only the highlight moves in them. In the shotlist: "growth:
scene N".

**Two frame rates (a style option).** The camera is smooth at 60 fps, the "paper" layer (highlighter, circling, typing,
cutouts) steps at 12 fps. All smooth reads as a corporate film, all stepped makes you seasick. Taken — a line in the
style guide. `q` below comes from here:
```js
const q = (t) => Math.floor(t * 12) / 12;
C.put(S.ring, { css: { strokeDashoffset: String(1 - C.sp(q(t), 's3.2', 'accent')) } });
```

**Palette** is light: the dark backgrounds of 3b1b and Kurzgesagt don't carry over; no blue-purple gradients, no glow.

### Choosing by voice fragment

| The voice fragment… | Take | Don't take |
|---|---|---|
| how one thing becomes another | 11. Transformation | 9: without documents it becomes a fake archive |
| scale, "what's inside", a system | 14. Object metaphor, 7. Dive | 9: same |
| an event, a story, a quote; screenshots and documents exist | 9. Investigation desk | 14: an illustration lowers trust |
| reasoning step by step, "why" | 10. Whiteboard | swapping the whole screen at each step |
| three reasons, stages, chapters | 13. Kinetic list | 11: nothing to transform |
| a product, steps in an interface | 1. Product demo on a hero | 11, 14: the interface is never redrawn |
| numbers, growth, shares that people will check | 12. Honest chart | 5, if the numbers must be shown physically |
| one number | the counter from 5 | 12: a chart for one number is empty |

## Cards

Fields as in FORMATS.md, plus **camera** and **timings**; "risk" is expanded into three **mistakes**.

### 9. Investigation desk (Vox)

- **Essence.** The argument lies on a desk of real material: screenshots, documents, clippings, photos. The camera moves
  over the desk like a reporter's eye; highlighter and red circling land in the tempo of the voice.
- **Take:** a news breakdown, the history of a product or market, a quote the viewer must see in the original. Matches
  our "never redraw the interface": the material goes in as it is.
- **Don't take:** the material would have to be invented; a mechanism (11, 14); step-by-step reasoning (10).
- **Signature:** real material from the sources is on the desk, and the highlighter marks at least one line exactly when
  the voice reads it.
- **Camera:** stands while something happens on a card. To the next card 0.5–0.9 s, push to a line 1.0–1.5 s, along the
  string 1.3–1.8 s (fast start, long settle), pull out ~1 s. Once it stops, the card fills 80–90 % of the frame; the
  desk shows only in transit and on the final pull-out.
- **Timings:** a shot 3–7 s (fast mode 1.4–1.8 s). Underline 0.5–1 s, circling ~1 s in one unclosed stroke,
  highlighter 1.5–3 s following the words, typing ~13 characters/s, string 0.5 s per segment.
- **Edit:** cuts on voice pauses; travel along the string; push into a photo until it fills the frame → cut to the same
  picture larger. Cards appear with the cut; only the next card on the string slides in (tilt 5–15° → 0).
- **Voice:** carries the argument; on "look at this line" the camera is already there.
- **Overrides:** "cut on action" → cut on a voice pause.
- **Build:** the desk is one big element, the camera is `CAM.rig` over it (zoom ≤ 3×). Material from `assets/shots/`
  as is; photos may go grey (`filter: 'grayscale(1)'`). Highlighter — a plate at 0.35–0.45 opacity revealed with
  `C.inset` left to right (`mix-blend-mode` is banned). Circling and string — SVG `path` with `pathLength="1"`,
  `stroke-dasharray="1"` and `stroke-dashoffset` from t. Label — a black plate, white text, `TYPE.type`.
  ```js
  CAM.rig(t, S.desk, [['s3', { x: 900, y: 600, z: 1 }], ['s3.2', { x: 1400, y: 520, z: 1.8 }]], { preset: 'desk', keep: false });   // a desk wider than the frame: a pan, not a cut screen
  C.put(S.mark, { clip: C.inset(0, 100 * (1 - C.seg(q(t), 's3.1', 's3.2')), 0, 0) });
  ```
  `desk` is a slow camera spring: `"presets": {"desk": {"response": 0.9, "damping": 1, "soft": 0.2}}`.
- **Mistakes:** (1) everything smooth, or the camera steps too; (2) templates: torn paper, cards dropping with a bounce,
  a jittering paper texture; (3) "slide in → label → circle" more than three times in a row. Text to be read is on the
  top layer.

### 10. Whiteboard

- **Essence.** The voice says a phrase — a line, a word, an icon appears on a big board. The camera follows the
  argument, pulls out at the end, and the reasoning is visible as one map.
- **Take:** cause and effect, "why it is so", the history of an idea; concepts are connected and can be laid out in space.
- **Don't take:** exact data (12), a real interface (1), emotion and brand. A whiteboard doesn't improve understanding,
  it holds attention.
- **Signature:** lines are drawn in the tempo of the voice, ~0.5 s behind it; the final pull-out shows the whole board.
- **Camera:** a move of ~0.23 frame widths over 1.2–2.4 s, the old area stays visible (~75 % overlap). A far jump —
  0.8 s, 0.5–1.2 widths, the render adds motion blur. Ending: pull out ~0.6 s to the whole board, hold ≥ 0.5 s.
- **Timings:** a stroke starts 0.2–0.8 s (usually 0.5) after the phrase starts and ends no later than 1 s after it ends.
  Text 16 characters/s, a heading 7.5. An icon 0.5–1 s, a portrait ~2 s. An area 4–14 s. Something the voice is
  waiting for is drawn in advance.
- **Edit:** no cuts, the transition is a camera move; a new area is a new point.
- **Voice:** even. The board holds images and keywords: if more than half the words match the voice, there are too few
  drawings.
- **Overrides:** "cut on action", J/L cuts; "the scene headline is on screen whole within ~1 s" (RULES, "Voice films")
  — an area's heading is written at 7.5 characters/s.
- **Build:** the board is one SVG several frames wide, the camera is `CAM.rig`, the ending is a key with `z` < 1. A
  stroke is a `path` with `pathLength="1"`, duration = length / ~1300 px/s, `C.ease.inOut` inside. Handwritten text —
  a `C.inset` reveal. Line ~0.65 % of frame height, one accent on ~20 % of strokes. Type on the board ≥ 28 / z_final px
  (a `--lint` WARN on the pull-out is intended). Don't draw a hand.
  ```js
  // build: S.board = root.appendChild(C.frag(`<div class="abs">${BOARD_SVG}</div>`)) — CAM.rig needs an HTML element;
  //        S.st = paths: { p: C.reg(path), len: path.getTotalLength() }
  const draw = (s, mark) => { const p = C.clamp((t - C.bt(mark) - 0.5) / (s.len / 1300));
    C.put(s.p, { css: { strokeDashoffset: String(1 - C.ease.inOut(p)) } }); };
  CAM.rig(t, S.board, [['s2', { x: 960, y: 540, z: 1 }], ['s2.end', { x: 2880, y: 1620, z: 0.34 }]], { preset: 'board', keep: false });
  ```
  `board`: `{"response": 1.1, "damping": 1, "soft": 0.2}`.
- **Mistakes:** (1) drawing first, then the voice, or the other way round; (2) each area is a new empty screen, no final
  pull-out: the map is gone; (3) many colours, a thin even line, a complex illustration drawn on camera (reveal it
  ready-made with the camera).

### 11. Transformation (3b1b)

- **Essence.** The frame holds only what is being talked about, and it turns into the next concept: a grid into a column
  of dots, a curve into another curve. Almost no cuts.
- **Take:** a mechanism where each phrase is an action on an object ("squeeze the image into a column", "multiply by the
  weight"): a model, an algorithm, a calculation.
- **Don't take:** a position, a story, a slogan — nothing to transform; real data over time (12); a launch or a brand film.
- **Signature:** at least one change of concept is made by transforming one object without a cut; a concept's colour is
  the same in the formula and in the diagram.
- **Camera:** stands → push to the next object ~1 s → stands. A fast push of 0.28 s — on the conclusion, once or twice
  per film.
- **Timings:** a transformation 1–3 s, then ~1 s of rest; a concept 8–20 s; a cascade of a uniform mass — 0.01–0.1 s
  steps; hold the conclusion ≥ 0.6 s.
- **Edit:** the last frame of a step = the first frame of the next. Change of topic — exit upward through a mask or fly
  into the object (general rule 8). A formula symbol travels to the place of the same symbol in the new formula.
- **Voice:** one phrase — one transformation: it starts on the action verb and has landed by the end of the phrase.
- **Overrides:** "one accent colour" (RULES, "Look") → 3–4 concept colours; "at most 6–8 per wave" — a uniform mass
  counts as one element.
- **Build:** the object is a set of elements with two positions each, the move is `heavy` (no overshoot) offset by
  `C.stagger(i, 0.01)`. Morphing an outline — only GSAP MorphSVG (ENGINE.md, "GSAP"). Concept colours are variables in
  `:root` (`--c-signal`), the same one in the formula and in the diagram; on a light background darker than usual,
  contrast ≥ 4.5:1.
  ```js
  S.cells.forEach((c, i) => { const p = C.sp(t - C.stagger(i, 0.01), 's2.1', 'heavy');
    C.put(c, { x: C.lerp(gx(i), nx(i), p), y: C.lerp(gy(i), ny(i), p), css: { borderRadius: `${50 * p}%` } }); });
  ```
- **Mistakes:** (1) glow and a dark gradient "to look scientific"; (2) transformations fast and frequent, no rest;
  (3) a concept's colour changes mid-film, or more than four colours. The first frame is the object, not a heading.

### 12. Honest chart

- **Essence.** Axes → data → one label. Bars from zero, units and source on the chart; the animation decides how a
  number appears, not what it is.
- **Take:** revenue, shares, growth, market, "before and after" — figures people will retell and check.
- **Don't take:** one number (the counter from 5); the source can't be named; a mechanism (11).
- **Signature:** the title is the conclusion in one phrase, the label marks one thing, the source sits bottom left.
- **Camera:** stands while the chart grows. The voice names a point — push ~1 s or move 0.7 s; a fast push — on the one
  or two main numbers of the film.
- **Timings:** stages of 0.5–1.3 s: frame → grid lines left to right (0.12 s apart) → axis labels → data → hero colour →
  label. Bars 0.22 s apart, ~1.3 s in total; a line 1.5–2 s; a count 0.9–1.3 s, slowing down. A chart 2.5–6 s.
- **Growth in one place.** Bars from zero, a line over time, a counter — only in one scene. Other charts enter already
  built; only the highlight changes in them: the hero colour and the label.
- **Edit:** a cut with the layout unchanged; a panel slide; a push into a point. Turn one chart into another only for
  the same data.
- **Voice:** the bar has finished growing and the label has landed on the word with the number. "Grew by" — the
  increase, "grew to" — the new level, "N times" — the ratio to the start; voice and title use the same form.
- **Overrides:** nothing; adds "one chart — one metric" and "growth in one place".
- **Build:** a `heavy` spring. A bar is `sy` from 0 with `transform-origin: bottom`, its value rides above it and counts
  (`tabular-nums`). A line is revealed along x, not along its path length: `clip: C.inset(0, 100 * (1 - p), 0, 0)` —
  a steep stretch passes faster; an event label fires when the line's edge passes the point. Grid horizontal and pale,
  zero dark; the hero in the accent, the rest grey. Up is green, down is red.
  ```js
  S.bars.forEach((bar, i) => { const p = C.sp(t - C.stagger(i, 0.22), 's4.1', 'heavy');
    C.put(bar, { sy: Math.max(p, 0.001) });
    C.put(S.val[i], { y: -S.h[i] * p, text: fmt(S.v[i] * p) }); });
  ```
- **Mistakes:** (1) a truncated axis: bars only from zero, a line not from zero — with a note; lie factor (visible
  effect ÷ effect in the data) 0.95–1.05; (2) many colours, everything is the hero; (3) bounce, 3D bars, spinning.

### 13. Kinetic list

An addition to "4. Kinetic statement": there the words build a construction, here the text carries structure — reasons,
stages, chapters. More often a chapter inside another format. Below is only what 4 doesn't have.

- **Take:** 3–5 items, numbered stages, chapter cards. More than five items — a static infographic.
- **Signature:** every item has the same layout and the same beat positions, so from the second item on the viewer knows
  where the next hit will be.
- **Camera:** hits and fast pushes follow the voice's stresses.
- **Timings:** the main word — 1–2 words, the subline ≤ 6–8 words. The main word on the downbeat, small things on
  half-beats. Hold the main word ≥ 0.5 s, the subline ≥ 1 s. One event per beat; a chapter card may be denser, but no
  longer than 8 s.
- **Edit:** on a chapter change — a new background tone (steps of the accent and neutrals), a band wipe, a push into a
  shape whose colour is the next screen's background. The reveal frame on the downbeat (general rule 6).
- **Overrides:** the same as 4; plus "accents — at most a third of the shots" (RULES, "The camera is punctuation").
- **Build:** subline — `TYPE.line` + `TYPE.rise`, main word — `C.spHit` with the `hero` role, number — a large pale
  digit, progress — `Motion.indicator`. Once landed, it doesn't drift; the camera and background carry the motion.
- **Mistakes:** (1) everything the same size and entering at once; (2) the word drifts while it is being read; (3) the
  same layout more than three screens in a row without a break — slides.

### 14. Object metaphor (Kurzgesagt)

Close to "7. Dive" and to 11; its own part is that an abstraction is drawn as an object in the film's world.

- **Essence.** A concept becomes an object (a cache — a shelf, a queue — a conveyor) in a world with a background; the
  camera moves between scales. **Take:** a system, "what's inside". **Don't take:** real events (9); little time for
  craft.
- **Signature:** every concept the voice names is drawn as an object.
- **Camera and timings:** the background (particles, water, clouds) moves all the time and quietly, the hero stands after
  entering. Before flying in — a stop of ≥ 0.3 s and a highlight on the target; the fly-in is logarithmic. Each phrase
  gets at least one change of state: appearing, transforming, going inside, pulling out.
- **Overrides:** the same as 7, if there is a fly-through across scales.
- **Build:** flat shapes without outlines, shade — the same hue one step darker, highlight — a light arc; 3–5 parallax
  layers (layer shift = camera shift × depth); a light background, 2–3 saturated accents. No mascots and no faces on
  objects (RULES, "Characters and people").
- **Mistakes:** (1) everything "breathes", not just the background; (2) a linear zoom or a stretched raster instead of
  redrawing the level; (3) a busy palette or a black outline — a children's book.

## What was left out

The source's API (canvas2D, MO/CAM/DG/TY/CH); dark palettes, neon glow, glass cards; a hand drawn in code; "story with
a character" (needs a frame-by-frame character); the product-presentation format (covered by "1. Product demo on a
hero"); a `multiply` highlighter (`mix-blend-mode` is banned); red-up / green-down from the Chinese market.
