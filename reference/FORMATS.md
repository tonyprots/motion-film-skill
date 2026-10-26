# Formats: a visual language for the substance of the film

The arc (`reference/STORY.md`) decides **in what order** the film leads to its idea. The format decides **in what language** it
shows it: what holds the frame, how scenes follow one another, what carries the proof. These are two independent axes: the
results of a study can be shot as "data at true scale", or as a "statement" if the finding is a position, not a number. All four axes of a film (arc, format, brand, style) — `reference/STYLES.md`.

A film gets **one** main format. Another format is allowed only as a single chapter (for example, a counter scene inside a
demo), and it is written down in the shotlist. A mix of three languages reads as a reel of tricks with no idea.

## How to choose

The format is chosen by the substance of the material, not by a word in the request ("promo", "video") and not by habit.
Answer three questions about the sources:

1. **What proves the idea?** This is the main question; the first column of the table is built on it.
2. **What material is actually there?** A real interface, series of numbers, a diagram of how something is built, only the
   text of the theses, a story over time. Don't take a format without its material: a "demo" without screenshots turns into an
   invented interface.
3. **How long is it and where is it watched?** Short formats (one take) don't hold 2 minutes; a statement without sound works
   better in a feed than a demo.

| The idea is proved by… | Material | Format |
|---|---|---|
| how the product works in the hands | a real interface, a scenario of actions | **Product demo on a hero** |
| recognisability: the film must be remembered by one image | a mark, a product detail with "character" | **Through-line anchor** |
| transformations of one element | 6–12 states of one entity (button → loading → result) | **One take** |
| the words themselves: a position, a principle, an address | 3–7 theses, no product on screen | **Kinetic statement** |
| numbers, their scale and order | series of data, comparisons, durations | **Data at true scale** |
| how it's built: what it consists of and how it connects | a diagram, architecture layers, hardware, a process | **How it's built (exploded view)** |
| nested scales | a chain "whole → part → detail" of 3–6 levels | **Dive (zoom chain)** |
| a change of time: was → is, eras, versions | 2–5 periods of different character | **Shifting eras** |
| a short idea in the feed: every phrase is its own image | a list, numbers, news, a tip; vertical, 30–60 s | **An image per phrase** |

**Vertical and social default to "An image per phrase".** A film for social media, Telegram, Reels or Shorts whose first
format is 9:16 gets it unless the material needs another language; picking another format is written in pass 1 with the
reason ("demo: the proof is one action in a live interface"). Horizontal films have no default; the table decides.

If two fit on substance, the material decides (whichever has more of it, and real). If that is equal too, take the one the
same customer's previous film didn't use (the "Format" field in its `brief.md`): variety comes from the choice, not from tricks
inserted "for variety".

Issues of one recurring film keep the series' format: the viewer recognises the series by its language.

**Where it is recorded.** Pass 1 of step 2: the line "Format: <name> — <why, in one phrase>; the runner-up was <name> — <why
not>". The user approves it together with the beats. In `SCRIPT.md` → `## STORY` it is the "Format" field, in `brief.md` the
"Format" row. In the style guide (step 5): the format's signature and exactly which of the general rules it overrides.

## Cards

Fields in each: **Essence**, **Use when** and **Don't use**, **Signature** (the move without which this is not this format; the
critic checks it first), **Editing**, **Voice**, **Overrides** (which items of RULES.md do not apply here; what never changes is at the end of this file),
**Build** (what the engine has and what is written in the scene), **Risk**.

### 1. Product demo on a hero

- **Essence.** The camera leads through a real interface, the cursor does the work, the viewer sees the result.
- **Use when:** a feature launch, a tutorial, a decision for leadership where the proof is "here it works".
- **Don't use:** there is no interface or it isn't ready; the idea is about a position, not a product.
- **Signature:** one action of the hero runs from start to result on a live screen, with no redrawing.
- **Editing:** cut on action, push to the target of the action (a button, a field) before the click, return to a wide shot in
  the pause. A push toward text that can't be read otherwise is not editing: it means the scene needs a sign card (RULES.md).
- **Voice:** leads, the screen proves; the title is the scene's thesis.
- **Overrides:** nothing — this is the format the general rules were written for.
- **Build:** `CAM` (camera, cursor, focus), real screenshots in `assets/shots/`, live components (`C.ui`, ENGINE.md "Live components") where the cursor changes the screen, `Motion.indicator`, `swapAlpha`; for one or two shots where a big screen is itself the scene's point, `uiShot` (ENGINE.md "A screen in 3D").
- **Risk:** a slideshow of screenshots: one layout in every scene (headline + window + caption) and a camera that travels to
  the text on every window. Every scene must do something, not just show.

### 2. Through-line anchor

- **Essence.** One graphic entity runs through the whole film, reacts to what is happening and in the finale becomes a mark or a
  plate. Example: in the LongCat film a cat's eyes watch the text being typed, blink on the beat, squint, and settle into the
  logo.
- **Use when:** a brand or product launch, an announcement, a film that should be recognised in the feed a week later.
- **Don't use:** a leadership summary or a breakdown where an anchor distracts from the argument; the product has no detail with
  character and nobody asked to invent a mascot.
- **Signature:** the anchor is in every scene (except the quiet windows) and has 3–5 states tied to the content of the scene;
  the final frame is its last state.
- **Editing:** the carrier of every cut is the anchor; scenes change around it.
- **Voice:** doesn't name the anchor; the anchor reacts to the words (blinks on a stress, turns to what is named).
- **Overrides:** "one hero per frame" is softened: the anchor may stay in frame as a muted second plane.
- **Build:** the anchor is an `anchor(t, state)` function in `film.js`, states switch with springs on the voice marks; the
  source of the shape is a mark or detail from the preset, `capture.mjs`.
- **Risk:** a grimacing mascot. The anchor reacts, it doesn't entertain; no more than one "joke" per film.

### 3. One take

- **Essence.** Not a single cut: every scene grows out of the shape of the previous one. A dot becomes a pill, the pill a photo,
  the photo a grid, a cell a screen.
- **Use when:** a short launch (15–45 s), a set of features that flow into one another naturally; a loop for the feed (4–14 s
  without a voice — the short route, ENGINE.md "Loop").
- **Don't use:** a film longer than ~45 s (the chain of transformations tires); an argument with a turn that needs a pause and a
  change of shot; material made of unrelated screens.
- **Signature:** `render.mjs --seams` finds zero hard cuts; every change has a shared element that changes size, radius or
  colour.
- **Editing:** instead of cuts — a container morph, a frame-filling shape that shrinks into the next scene (the fill goes past
  the corners and lasts ~0.3 s, otherwise half the screen changes in one frame), an iris, a push into an element. The last
  frame may equal the first.
- **Voice:** short, one phrase per state; often better with no voice, on music and interface sounds.
- **Overrides:** "cut on action" (there are no cuts); J/L cuts of sound are replaced by a hit on the change of state.
- **Build:** `Motion.swapAlpha` (text inside a morphing block), `Motion.indicator`, `Motion.loopT`; the fill and the iris are
  written in the scene.
- **Risk:** a "Dribbble film" with no idea. The chain of states must tell the arc itself, not list features.

### 4. Kinetic statement

- **Essence.** What is said is the picture. Words get roles and build the frame; the final idea literally stands on words said
  earlier. Example: "BUILD THE FLOOR", where WAIT is the crossbar, VOICE the support, FLOOR the platform.
- **Use when:** a position, a principle, a manifesto, a leader's address, a period summary of 3–5 theses; there is no product
  worth showing.
- **Don't use:** proof in an interface or in data; more than seven theses.
- **Signature:** the final frame is assembled from the elements of the previous theses; at least one word carries a role in the
  composition, not just stands in place.
- **Editing:** no cuts or almost none: the current phrase becomes part of the construction, the next takes the freed place. At
  least one absolute stillness of 400 ms before the main phrase.
- **Voice:** the on-screen text matches the voice word for word, captions are not needed. The film reads with the sound off.
- **Overrides:** "at most three text sizes" (scale is the main tool, the jump can be 10×) and "something new every 2–4 s" (the
  pressure is held by the composition, not by events).
- **Build:** `TYPE`, GSAP SplitText; for construction words — glyphs as SVG paths, the baseline deformation is written in the
  scene. One contrasting face for speech, one heavy face for the "load-bearing" words.
- **Risk:** kinetics for kinetics' sake. Until a phrase has been read, it doesn't turn into a construction.

### 5. Data at true scale

- **Essence.** Numbers are the main heroes of the frame, and the animation respects their truth: duration runs in real time,
  order in the real order, scale on one scale. Example: the Audi film, where the 0–100 timer runs exactly 3.4 s and the
  cylinders flash in firing order.
- **Use when:** study results, metrics, a market, an "N times" comparison where the number is the finding.
- **Don't use:** fewer than three numbers, or they are not comparable with each other; the figures illustrate a thesis rather
  than being the thesis.
- **Signature:** at least one number is shown at true scale (time, quantity, proportion are seen, not written), and one big
  counter across the whole frame with a hit on a digit change.
- **Editing:** one scale per scene, transition along a shared axis (a bar becomes the axis of the next chart).
- **Voice:** names one number with a comparison, the rest are on screen (STORY: ≤ 8 numbers by voice).
- **Overrides:** nothing; adds the rule "one diagram, one metric".
- **Build:** a counter with monospaced digits and a slowdown toward a round number is written in the scene; charts are SVG +
  springs.
- **Risk:** a dashboard in motion. Every scene answers one question.

### 6. How it's built (exploded view)

- **Essence.** An object or system comes apart into labelled parts, then assembles back, and the viewer understands how it is
  built. Example: a film about a mechanical keyboard (keycap, case, stem, spring).
- **Use when:** a service architecture, platform layers, hardware, a process made of stages, "how it works".
- **Don't use:** the viewer doesn't need the construction, they need the result (then a demo).
- **Signature:** one frame of the exploded view with all parts and labels; the reassembly is the hero moment.
- **Editing:** the camera orbits or pushes in on the part the voice names; the other parts are muted.
- **Voice:** names a part and its role in one phrase; the order of parts is the order a signal or data travels.
- **Overrides:** "3D tilt on one or two scenes" — here depth is the language.
- **Build:** a three.js layer (`gl.js`) for volume; for diagrams, SVG layers with a z offset through `CAM`.
- **Risk:** a technical diagram with no idea. The end answers the question "and therefore…".

### 7. Dive (zoom chain)

- **Essence.** A continuous push through levels of scale: each level contains the next. Example: an endless zoom through a watch
  face, a lens and a magnifier; for us — "company → product → feature → button" or "market → segment → customer".
- **Use when:** an idea about scale, nesting, "where exactly this happens"; a hook-in for a film of another format.
- **Don't use:** the levels are not nested in meaning; fewer than three levels.
- **Signature:** the speed of the push is constant: the duration of a leg is proportional to log(zoom), the move to the next
  level happens when the "portal" fills the frame.
- **Editing:** one continuous fly-through, no cuts.
- **Voice:** a phrase per level, the phrase starts when the level has filled the frame.
- **Overrides:** "zoom no more than 3×" — here the zoom runs through levels, each level drawn at its own resolution.
- **Build:** levels are separate layers with their own scale, the shared exponent is computed in the scene; a level's raster is
  redrawn, not scaled.
- **Risk:** motion sickness. No more than 5 levels, and on the last one — a stop and an exhale.

### 8. Shifting eras

- **Essence.** Each chapter has its own visual language, and the change of language itself says "time has changed". Example: an
  explanation of recursion where each level is shot in a different genre.
- **Use when:** was → is, the history of a product or market, the evolution of an approach, a comparison of generations.
- **Don't use:** more than five chapters; the difference between eras isn't visible to the viewer without a caption.
- **Signature:** each era has its own typeface, palette and type of motion, and the transition between them is an event (not a
  smooth flow).
- **Editing:** a hard cut at the change of era, inside an era its own grammar. The last era is the brand's language.
- **Voice:** one for all eras, tying them together.
- **Overrides:** one display face and one interface face (RULES.md "Look") apply inside an era, not across the whole film.
- **Build:** an era is a set of tokens (typeface, palette, motion roles) in `timeline.json "motion"` per chapter; the styling is
  written in the scene.
- **Risk:** parody. Eras are recognised by typography and motion, not by costumes and clichés.

### 9. An image per phrase

- **Essence.** A vertical film of 30–60 s for the feed. The frame is a still stage, one object-image sits in the centre, and
  every phrase of the voice changes its state. The only text anyone reads is a karaoke caption under the voice. Example
  (Reels review, 2026-10-17): a traffic gauge fills under "while the site costs nothing" and turns red on the word "DDoS"; a
  plug drops into a power strip "0/4 → 1/4" and the plugin's card unfolds out of it.
- **Use when:** social media, Telegram, Reels, Shorts; a list (n tools, reasons, mistakes), a breakdown of numbers, news, a
  tip. The default for vertical (see "How to choose").
- **Don't use:** the proof is one action in a live interface from start to result (then demo); a film longer than ~75 s; the
  idea is a position with no objects (then kinetic statement).
- **Signature:** at least 80 % of voice phrases change the object's state (value, colour, detail, shape); the camera does
  not move (except one cut at the turn); apart from the karaoke caption, the chapter label and the counter there is no text
  to read in frame.
- **Stage:** the karaoke caption sits where the style puts it (RULES "Captions"), by default at the bottom (in 9:16 above the bottom platform zone), the object in
  the centre; the through-line set and the counter go at the top or along an edge, not under the caption. A list gets a through-line set with a place for each item and an `n/N` counter in the corner, a chapter label in
  small monospace (`01 — supabase`). The story's turn is a change of world: the light background goes dark, or a chapter
  gets its own colour.
- **Objects:** a number is an instrument at true scale (a gauge, a counter with rolling digits, a grid of N cells, a
  "1 in 10" dot matrix); a product is a sign card (RULES.md); an action is the object that performs it (a plug, a stamp,
  scales, a lock). One object carries the whole item: its states change, it is not swapped on every phrase.
- **Editing:** almost no cuts: one object turns into the next by morph, scatter-and-gather or a hit. The state changes
  every 1–2 s, on the word that names it (word mark `<id>.w<k>`).
- **Voice:** short phrases; the first is a shock with a number or a contradiction (STORY.md "Hook"). The caption matches the
  voice word for word, its key word in the accent.
- **Overrides:** "the scene headline is whole on screen within ~1 s" and "the caption does not repeat the headline" (there
  is no headline; karaoke does its job); "close every scene on one frame with thesis and result" (the object's last state
  closes the scene); "something new every 2–4 s" (here 1–2 s); "screenshots ≥ half the stage, ≥ 3 s"; the default length
  1:00–2:30 (here 30–60 s).
- **Build:** `CAPTIONS.karaoke` on word marks (ENGINE.md); use `PROPS.mount` recipes (PROPS.md) or your own
  `prop(t, state)`. Change state on word marks; derive 16:9 via `C.pick`. For new films use `vo_layout.timing: "speech"`.
  Set `visual_format: "image-per-phrase"`, link phrases to changes in `visual-events.json`, run `render.mjs --story --all`.
  Coverage counts phrases with observed states and pixels; the critic checks meaning and the 80% signature from pairs/clips.
  Captions, camera moves and decorative shaking do not substitute for an action.
- **Risk:** objects for their own sake. Every state is something the voice said; an object that doesn't change with a word
  is a slide.

## What a format doesn't change

The render contract, legibility on a phone, contrast, the mix, the blind read, "only from the source" and "must not claim" are
the same for all formats. A format overrides only what is written in its "Overrides" field.

A new format that worked on a real film is a candidate for this file: a card with the same fields, and the film it was tested
on.
