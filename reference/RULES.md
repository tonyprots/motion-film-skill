# House rules

Apply these in every project, including one with no CLAUDE.md. A project's CLAUDE.md wins where it is stricter.

## Render contract
- The film is a pure function of time. `window.seek(t)` paints frame t, in any order, cold or after any other frame.
- Render mode has no CSS transitions or animations, no `setTimeout`, no `requestAnimationFrame`, no `Date`, and no state carried between frames (no module variable mutated in `run()`).
- Randomness is seeded only (`C.mulberry32(seed)`, `C.noise1(seed)`). Never `Math.random`.
- Output is H.264 yuv420p, CRF 16, bt709 tags, 60 fps finals, AAC 320k, `+faststart`.
- Verify determinism once per project: `node scripts/render.mjs --verify --all`.
- No `mix-blend-mode`: in headless Chromium it blends with a layer left over from the previous frame, and in a parallel render frames bleed into each other. Grain and overlays use plain opacity.
- No `will-change`, no `translate3d`, no `translateZ(0)`. A composited GPU layer caches its raster, so the same t paints differently depending on the previous frame (measured: 9/12 probes differed, up to 211/255 per pixel). Use 2D transforms (`C.put` does). If a shot truly needs CSS 3D (`perspective` / `rotateX`), run `--verify` on it. If it fails, fake the depth in 2D (skew + scale + shadow) or draw it on a canvas or in the WebGL layer (`engine/lib/gl.js`, ENGINE.md).

## Look
- **Banned defaults:**
  - a centred title on a gradient
  - everything fading in
  - corner labels
  - frame borders
  - glow on UI chrome
  - generic particle bursts
  - crossfades between shots
  - spins, glitches, light leaks, bounce on UI
- Use one display face and one UI face: the brand's real files (`capture.mjs` downloads them).
- The fonts must cover the film's language: a site font may lack Cyrillic, Greek or accents, and the browser silently substitutes a system face. Check on `--sheet`; fallback: a Google Font with that coverage (Inter, Manrope, Noto Sans).
- Use one accent colour unless the brief says otherwise. If the reference is multi-coloured, translate it into a tonal ramp of the one accent.
- Use real product UI, captured from the site, and real logos. Never draw a product screen that exists from memory or "close enough". A screen whose state changes in a scene is carried over as a live component (`capture.mjs --components`: the site's markup and computed styles, checked against its pixels); a component marked FAILED is not used — the scene runs on the screenshot. When a piece exists only as a screenshot, rebuild it element by element and say so in a comment.
- **A sign card instead of a screenshot** (2026-10-17). When a scene needs the product rather than its screen, build a card
  from the real logo and name plus 1–2 facts from the sources (a number, a status, one line of description) in the preset's
  fonts. That is not redrawing UI as long as the card doesn't pretend to be the product's screen: no invented buttons, menus
  or rows. A screenshot stays where the screen itself is the proof and its text reads at 360 px wide without a push. If a
  line on a screenshot has to be read and it is under 28 px at 1080p, the scene needs a sign card or a live component, not
  the camera.
- Type is left-aligned at x ≥ 120 px (1080p), sentence case, and the brand's punctuation habit applies. Accent colour goes on the key word or the second phrase only.
- Anything that must be read is at least 28 px at 1080p and passes the 360 px-wide phone check. Scale the camera, not the font.
- Text contrast against whatever it sits on is ≥ 4.5:1. A light accent (yellow, pastel) is not for text: use it as a plate under dark text. `render.mjs --lint` checks it.
- 9:16 keeps key content out of the platform UI zones: top 14 %, bottom 20 %, right 12 %.

## Rhythm
- Something new must happen on screen every 2–4 s. Nothing holds longer than one bar without a new element. The end card holds ≤ 2 s and is never static.
- Hard cuts land on bar lines. Inner events land on beats or half-beats, in beats on the measured grid (`beats.json`), never in hard-coded seconds.
- The hook reads in the first 2 s, and frame 0 is never empty. In a launch film the product or hero is on screen by second 3.
- Text stays long enough to read: whole on screen for ≥ characters / 15 + 0.4 s and never under 0.8 s (2026-10-22: one
  rule instead of two; the old "≥ 1.3 s from five words" is softer, and "0.3 s per word + 0.5 s" also gives less on an
  ordinary headline: five words — 2.0 s against ~2.7 s). If you need room, take a bar of air, not a shorter show. Two headlines are never in frame at once.
- Something happens in a held shot: an element moves, something new is revealed, the camera leads the eye. The camera
  itself may stand still — see "The camera is punctuation" below. A slow micro push on every shot is the mark of a slide
  show, not of a live frame.

## Motion (lib/motion.js springs)
| Preset | For |
|---|---|
| `heavy` | display type, logo lockups, camera |
| `default` | cards, panels, containers |
| `snappy` | buttons, pills, selection, indicators, pops |
| `playful` | mascots only; never UI or type |

- **Enters:**
  - rise through a mask
  - grow out of something (scale 0.8–0.9 → 1 with opacity snapping in within ≤ 4 frames)
  - type on
  - build (skeleton → content)
  - card rise
- **Exits:**
  - lift through the mask
  - get covered
  - get pushed past camera
  - collapse into what replaces it
  - a hard cut
- A pure opacity fade is never an enter or an exit. Only small eyebrow or sub lines may fade.
- **Visual hits lead the beat so they READ on it.** Use `C.spHit()`, never `C.sp()`, for anything with a sound. The audio stays on the grid.
- **Swaps are sequential.** The outgoing line is fully gone before the incoming one lands (`rise(t, L, in, out)` with out = next in minus exit). At most one frame of overlap is allowed, with the outgoing line ≥ 95 % gone.
- Masked words start ≥ 140 % of their size below the mask, so no glyph tops peek through the padding on the first frame.
- Scene pre-roll never cuts in over an unfinished wipe. The incoming scene takes over exactly when the cover is complete.
- Every scene's type is animated on every frame it is registered. Anything registered visible leaks outside its window.

## Sound
- Score and SFX are synthesized in code unless a track is supplied (`music.py`, `sfx.mjs`).
- Every hit sits on the grid, and every SFX event is declared in `timeline.json` `sfx` (write them with `scripts/sfx_layout.py`). A synthesized score IS the nominal grid: no `beats.json` for it. A supplied or generated track is measured with `beats.py`.
- The mix sits at -14 LUFS integrated with true peak ≤ -1 dBTP (`mix.py`).
- Voiceover is cut into phrases and each phrase is placed on a beat (`layout_vo.py`). Never speed up a whole take: the native pace of a good voice is the pace of the film.
- The voice sits ≥ 12 dB above the bed in the speech band on every phrase (`mix.py`), and every phrase is transcribed correctly from the final mix (`voice.py check-mix`).
- Put hits in the voice's pauses, not on words: a hit on top of a stressed word masks both. Every hit has a high-frequency click or noise: from a sub-bass alone neither the ear (nor `review.py`) finds the hit.

## Process
- Loop before showing anything: contact sheet → score → fix the 3 worst → repeat until every score is ≥ 8 (at least 2 rounds; see SKILL.md step 9 for when to stop).
- Judge from the rendered MP4s and sheets. Never judge from the page or from memory of the code.
- Machine checks run before the critic's eyes: `plan_check.py` (the plan before the render), `review.py` (gates), `render.mjs --lint` and `--seams`, `mix.py`. A check that checked nothing is NOT CHECKED, not "clean". A new check is accepted only after it has failed on a known-bad input.
- The blind read (`reference/BLIND.md`) is a delivery gate: a fresh reader without the script retells the thesis, and it matches `## STORY`.
- A fix for a critic's note that removes or reorders a step of the argument chain changes the scope: the user decides it. Three sensible "for the pace" fixes in a row cut out of the film what it was proving.
- Parallel sessions may run the same brief. Use a distinctive project folder, never write into a folder you did not create, and if files change under you, stop and check.

## Voice films (motion-film additions, learned on the first film, 2026-10-04)
- **The voice is the timeline.** Scenes start on bars, phrases on half-beats, and everything on screen animates from the voice marks (`<id>`, `<id>.<k>`, `<id>.end`). Never time a scene in seconds.
- **The scene headline is on screen whole within ~1 s of the scene start.** Do not build it word by word with the voice: a half headline ("ChatGPT —") hanging for two seconds reads as a bug. The voice may land on details; the thesis is already there. The exception is the karaoke caption of "An image per phrase": there is no headline there, words land exactly on their marks, and a fragment holds no longer than one word.
- **Close every scene on one frame that holds the thesis and the result together**: headline + the answer card / number / "what to think about". The critic's one advantage of the slide-like version was exactly this.
- **Captions are burned in, word for word with the voice** (except a line the headline already shows, see below; `captions.json`, `CAPTIONS.scene()`), ≥ 40 px at 1080p, two lines max, **at the bottom of the frame** in every format (in 9:16 above the bottom platform zone). A caption at the top is an explicit exception with its reason in `docs/style_guide.md`. Screen spelling may use digits; the words may not change.
- **A hit lands on the frame the object lands.** Lead 0 (measured: 0 → 31/48 hits in sync, −35 ms → 25/48, −75 ms → 18/48). `review.py`'s sync metric measures the start of motion, not the landing: confirm sync on frame strips, not by the metric.
- **Real screenshots are shown big and long enough to read**: at least half the stage, ≥ 3 s, and their state changes: a
  cursor, a highlight, a new row, a toggle. A camera move doesn't stand in for a change of state. A push to a detail of a
  screenshot — one or two per film, after a wide shot, and only to the detail the voice names; a push without which the
  text can't be read means the wrong screenshot was picked (see "A sign card"). One "headline + window + caption" layout
  in every scene in a row is a slide deck, not a film (2026-10-17). A push never cuts a screen at the sides: the window
  holds the element or panel whole across its width, or cuts on a natural boundary (a card or panel edge), never through
  text. `CAM.rig` keeps the element whole across by itself (`keep`); `--lint` flags text and screenshots cut by the side
  edge of their window or the frame as a PROBLEM.
- **No empty containers.** A window or card that appears empty for more than ~0.6 s, or stays more than a third empty, gets resized to its content or filled.
- **Clip what sits behind a rounded card** (`overflow: hidden` on the same radius): a dark layer poking out of a corner ("the dark crescent") survived three critique rounds unnoticed by the builder.
- **One line, one place on screen.** If the headline already says the voice line, that line gets no caption. A frame inside the frame (a mini film, a preview, a phone) shows its own content, never the headline again. The same sentence two or three times in one frame reads as a template bug (README demo, 2026-10-05).
- **No jump at a cut.** A match cut keeps every shared element at the same position and scale: a slow push runs through both scenes as one function of time, and the outgoing headline leaves inside the incoming scene, so the old and new lines roll in one move with no blank frame. Check 6 frames across every cut.
- **Numbers on screen agree with each other.** The viewer recomputes a sum of parts, a duration, "N times": the blind reader of the demo found "208 s + 141 s" next to "9 min 46 s" and "a 2:36 film" in a 33 s film (2026-10-06). If a number is about a different object, label which one.
- **Light theme by default**, one accent, the house fonts of the preset.
- **From a reference film, only the form** (2026-10-14). Rhythm, transitions, camera and text behaviour are taken; words,
  numbers, names and promises come only from the project's sources. A borrowed reference prompt once put "a million
  visitors in eight months" into someone else's film for a brand that never had them. `plan_check.py` looks up every
  on-screen number in the voice and the sources.
- **Characters and people.** Three paths: a real photo or recording of a person; hands, a silhouette or a back only; no
  person, told through an object and the interface. Code-drawn little people, white robots and faces on objects (coins,
  balls, icons with eyes) give away AI — none of them. A character, if one is truly needed, keeps one style with the rest
  of the frame and does not change from scene to scene.
- **A huge change of scale** (galaxy → atom, city → button) zooms logarithmically: `s = s0·(s1/s0)^p`, with p on a
  spring. A linear zoom skips the middle in a frame and crawls at the ends.

## AAA direction (motion-film, 2026-10-06)
The thresholds are starting points; critique rounds calibrate them. These are defaults: the film's format (`reference/FORMATS.md`)
overrides individual items of this section and of "Rhythm" and "Voice films", and only what is listed in the "Overrides"
field of its card applies. The render contract, legibility, contrast and sound are never overridden.
- **One hero per frame.** At any moment exactly one element is the brightest and fastest in frame. While the voice talks about
  it, the rest is muted (opacity 0.3–0.4 or a 4–8 px blur).
- **One hero moment per film** (up to two in 3 minutes), at 60–85 % of the length. A build leads into it, a breath follows.
  The music drops out 0.3–0.7 s before the main hit, then the hit. The hero moment is the only place for a spring with a visible
  overshoot and for a 600–900 ms move; everything else lands without a visible overshoot.
- **Motion hierarchy within a shot** (2026-10-22). One main move per shot — on the hero of the frame. Secondary moves travel
  50–70 % of its path (offset, scale, rotation) and start 100–200 ms later. Background motion (drift, parallax, gradient
  grain) — under 5 % of the main move's path. Two moves of the same amplitude starting on the same frame are two heroes.
  One wave of a cascade ("Cascade rhythm" below) is elements of one level, not secondaries to a main move.
- **An intensity curve, not a plateau.** Scene density (1–5 in the shotlist) alternates: a dense scene is followed by a
  one-hero scene. No more than three scenes in a row of the same length (±10 %).
- **Air.** Every ~20 s, a quiet window of 0.6–1.2 s: the voice finishes, no new elements or hits, the camera keeps drifting.
  This does not break "something new every 2–4 s": the window sits after a key point or before the hero moment, not at random.
- **Cut on action, with a carrier.** A scene changes during an action (a click, a result appearing), not after it stops.
  Most transitions have a carrier: a shape, position or colour that travels into the next scene.
- **J/L cuts.** The next scene's sound (a hit, the first word) starts 80–200 ms before the picture; the previous
  scene's tail runs 100–300 ms past it. A hard sound cut only on purpose.
- **Cascade rhythm.** Elements of one wave start 30–80 ms apart in reading order, at most 6–8 per wave, the whole wave
  ≤ 0.6 s. Four or more elements starting on the same frame is a fault. A container arrives 40–120 ms before its content.
- **Anticipation on big moves.** Before the main zoom or a scene change: 2–3 frames of counter-motion or a sound "breath in".
  Only on big moves, never on every element.
- **The camera arrives before the action.** The push to a target starts 0.3–0.5 s before the click or the word that names it.
  Zoom 1.4–2.5×, never past 3×: context is lost and the raster goes soft.
- **The camera is punctuation, not decoration on every sentence** (2026-10-14). Before each move, three answers: where the
  viewer looks and whether it reads at the current scale; is this a transition or an accent; what the previous move was.
  The shotlist "Camera" column holds one move per shot from this vocabulary:

  | Move | Duration | When |
  |---|---|---|
  | hold | — | the frame moves by itself (typing, a growing line, a screen recording) or the viewer is reading. This is normal, not a failure |
  | push | 0.6–1.5 s, smooth | lead the eye to the detail the voice names (not to text that can't be read otherwise) |
  | pull | 0.8–2 s, long tail | show the whole, close a section |
  | pan | 0.5–0.9 s | move from one object to its neighbour |
  | snap | 0.25–0.35 s, +18–32 % | accent: a reveal, a turn, the key number |
  | punch | 0.17 s, 1.55 → 0.94 → 1.0 | accent on a beat, one word or number |
  | whip | 0.26–0.30 s with blur | an accent transition between scenes |
  | cut | 0 | a change of scale or angle without a move |

  Accents (snap, punch, whip) are at most a third of the shots. No three pushes in a row: within two shots after a push
  comes a pull, a pan or a cut to another scale. No three identical moves in a row. An even push on every shot reads as a
  presentation, a snap on every shot as fuss; the cure is the same: the camera follows the meaning of the section, calm on
  exposition and faster on a turn. `plan_check.py` checks this on the shotlist, `review.py` on the finished film (pushes
  per minute, share of slow zoom, share of frames without motion).
- **A directed cursor.** A smoothed curve with ease-in and ease-out, a micro-pause before the click, a response to the click
  (pulse + sound within a frame). A straight line at constant speed reads as synthetic.
- **Scene typography:** at most three text sizes, adjacent levels ≥ 1.5× apart. A headline is a point of up to 9 words.
  Time on screen — by the text-hold rule in "Rhythm".
- **Light and depth.** One light source: all shadows point one way. The background is never perfectly flat (a soft gradient,
  `finish.grain`), but never a glow. A 3D screen tilt is 4–10°, with a shadow, on one or two scenes (the exception: `uiShot`, below).
- **Stills first, motion second.** Key frames (styleframes) are approved as pictures before animation (SKILL.md step 7). The hook is built in three different variants; the one picked is the reference for the other frames.
  Never animate what looks wrong as a still.
- **Generated video bridges — only when the customer asks** (brief, `scripts/broll.py`). 4–8 s of atmosphere between scenes:
  fog, light, material, space. No screens, text, faces or logos — the model invents them. A bridge starts on a frame of the
  film and ends on one, so neither cut shows; one or two a film. Say the price before `--yes`.
- **Cutouts and depth: photos only, and sparingly.** A person or product lifted off its background with a shadow under it, or
  a slow 2.5D push on a photo (`scripts/vision.py`, `depthPhoto` in ENGINE.md) — on the hero or a human moment, one or two
  scenes a film. A UI screenshot, text, a logo, a chart — never: a cutout halos and parallax tears straight edges (`vision.py`
  refuses them). Depth shift ≤ 3 % of the frame; more and object edges tear.
- **A screen in 3D — only where the screen IS the scene's point.** `uiShot` (ENGINE.md): a real screenshot as a plane, the
  camera looks at it from 20–35° and travels along it, focus holds the detail the voice names. It is the exception to the
  "3D tilt 4–10°" above, so one or two scenes a film, and the shotlist marks the scene `uiShot` with one line on why.
  Use it when: (a) the product's first appearance — the viewer should feel "there it is, the real thing"; (b) the voice names
  one detail of a big screen and the camera's path to it is the proof; (c) a focus pull from one part of the screen to
  another IS the comparison. Not when: the screen must be read whole (a table, a list, numbers) — then a flat screenshot and
  `CAM.rig`; the screenshot is small or soft; the same shot was in the neighbouring scene. In frame: the named detail in focus
  and ≥ 40 px tall, blur ≤ 8–10 px, the page holds still — the camera travels on one rail, the angle does not spin. 9:16 gets
  its own keys through `C.pick`.
