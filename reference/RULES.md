# House rules

Apply these in every project, including one with no CLAUDE.md. A project's CLAUDE.md wins where it is stricter. The film's
format (`FORMATS.md`, `EXPLAINERS.md`) overrides only what is written in the "Overrides" field of its card; the render
contract, legibility, contrast and sound are never overridden by a format. The thresholds below are starting points;
critique rounds calibrate them. Where a machine checks a rule, the rule is named in one line with the name of the check:
the exact thresholds live in its code and its message.

## Render contract
- The film is a pure function of time. `window.seek(t)` paints frame t, in any order, cold or after any other frame.
- Render mode has no CSS transitions or animations, no `setTimeout`, no `requestAnimationFrame`, no `Date`, and no state carried between frames (no module variable mutated in `run()`).
- Randomness is seeded only (`C.mulberry32(seed)`, `C.noise1(seed)`). Never `Math.random`.
- Output is H.264 yuv420p, CRF 16, bt709 tags, 60 fps finals, AAC 320k, `+faststart`.
- Verify determinism once per project: `node scripts/render.mjs --verify --all`.
- No `mix-blend-mode`: in headless Chromium it blends with a layer left over from the previous frame, and in a parallel render frames bleed into each other. Grain and overlays use plain opacity.
- No `will-change`, no `translate3d`, no `translateZ(0)`: a composited layer caches its raster, so the same t paints differently depending on the previous frame. Use 2D transforms only (`C.put`). If a shot truly needs CSS 3D (`perspective` / `rotateX`), run `--verify` on it; if it fails, fake the depth in 2D (skew + scale + shadow) or use a canvas / WebGL layer (`engine/lib/gl.js`).

## Look
**Composition rules are defaults, not bans on intentional direction.** One accent, one focal object, staggered arrivals
and separated elements help a typical explanation. A diagram may need several meaningful accents, editing may use
deliberate overlaps, animation may move several objects together: record the purpose in the style guide and check the
result in motion; no separate permission is needed. The critic judges the clarity of the essential content, not the
count of accents. Accidental sticking and a lost important label remain defects. This is the only statement of the rule;
other places refer to it.

- **Banned defaults:** a centred title on a gradient; everything fading in; corner labels; frame borders; glow on UI
  chrome; generic particle bursts; crossfades between shots; spins, glitches, light leaks, bounce on UI.
- **Light theme by default.** One display face and one UI face: the brand's real files (`capture.mjs` downloads them).
  The fonts must cover the film's language: a site font may lack Cyrillic, Greek or accents, and the browser silently
  substitutes a system face. Check on `--sheet`; fallback: a Google Font with that coverage (Inter, Manrope, Noto Sans).
- **One accent is a starting point.** Several colours are valid when they encode entities, states or the intended
  direction; do not strip the colour from a meaningful multi-colour diagram. Accent colour in text goes on the key word or
  the second phrase only.
- **Real UI and real logos only.** Never draw a product screen that exists from memory or "close enough". A screen whose
  state changes in a scene is carried over as a live component (`capture.mjs --components`); a component marked FAILED is
  not used — the scene runs on the screenshot. When a piece exists only as a screenshot, rebuild it element by element and
  say so in a comment.
- **A screenshot is big, long and active.** At least half the stage, ≥ 3 s, and its state changes: a cursor, a highlight,
  a new row, a toggle; a camera move doesn't stand in for a change of state. A screenshot is used where the screen itself
  is the proof and its text reads at 360 px wide without a push. A push to a detail — one or two per film, after a wide
  shot, and only to the detail the voice names. A push never cuts a screen through text: the window holds the element
  whole across its width or cuts on a natural boundary (`CAM.rig` → `keep`; `--lint` catches the cut).
- **A sign card instead of a screenshot** (2026-10-17). When a scene needs the product rather than its screen, or a line
  on a screenshot can't be read without a push (under 28 px at 1080p), build a card from the real logo and name plus 1–2
  facts from the sources (a number, a status, one line of description) in the preset's fonts. No invented buttons, menus
  or rows — otherwise it is redrawn UI. Or use a live component; the camera does not rescue small text.
- **Not a slide deck.** One "headline + window + caption" layout in every scene in a row is a slide deck, not a film (2026-10-17).
- **Type** is left-aligned at x ≥ 120 px (1080p), sentence case, and the brand's punctuation habit applies. Scale the
  camera, not the font. A light accent (yellow, pastel) is not for text: use it only as a plate under dark text.
- **Legibility — `render.mjs --lint`:** type ≥ 28 px at 1080p and the 360 px-wide phone check, contrast ≥ 4.5:1, no glyph
  of settled text cut by the frame edge or a mask (a caption is a PROBLEM; a large headline under a push is a WARN, and
  then the cut must read as a decision), in 9:16 key content stays out of the platform zones (top 14 %, bottom 20 %, right 12 %).
- **Captions are burned in, word for word with the voice** (`captions.json`, `CAPTIONS.scene()`), ≥ 40 px at 1080p, two
  lines max. Placement is a style switch (`STYLES.md`): **at the bottom of the frame** by default (in 9:16 above the
  bottom platform zone); at the top when the style chooses it (recorded per STYLES "Where it is recorded"), below the 14 % top zone
  (2026-10-17 the top was rejected for one film; 2026-10-26 the top won a blind comparison in the "Editorial breakdown"
  recipe). Screen spelling may use digits; the words may not change. A caption does not repeat the headline — see "One line, one place".
- **One line, one place on screen.** If the headline already says the voice line, that line gets no caption. A frame
  inside the frame (a mini film, a preview, a phone) shows its own content, never the same headline.
- **No empty containers** for more than ~0.6 s or more than a third empty: resize to the content or fill it.
- **Clip what sits behind a rounded card** (`overflow: hidden` on the same radius): "the dark crescent" poking out of a
  corner survived three critique rounds.
- **Numbers on screen agree with each other.** The viewer recomputes a sum of parts, a duration, "N times". If a number
  is about a different object, label which one.
- **From a reference film, only the form** (2026-10-14). Rhythm, transitions, camera and text behaviour are taken; words,
  numbers, names and promises come only from the project's sources. `plan_check.py` looks up every on-screen number in the
  voice and the sources.
- **Characters and people.** Paths: a real photo or recording of a person; hands, a silhouette or a back only; a drawn
  presenter or character (`ACTOR` — EDITORIAL.md, your own or one from the library — LIBRARY.md); no person, told through
  an object and the interface. A character comes on request or when the situation calls for it (one hero carries the
  story, a reaction to an event is needed, chapters need a link), not as a default part of every film. When present, it
  keeps one style with the rest of the frame, does not change from scene to scene, and its gestures and expressions answer
  the meaning of the line rather than decorate it.
- **Light and depth.** One light source: all shadows point one way. The background is never perfectly flat (a soft
  gradient, `finish.grain`), but never a glow. A 3D screen tilt is 4–10°, with a shadow, on one or two scenes.
- **Rare devices — sparingly, with their rules next to the API in ENGINE.md:** "A screen in 3D" (`uiShot`) — only where
  the screen IS the scene's point; "Cutouts and depth" (`vision.py`) — photos only; video bridges (`broll.py`) — only when
  the customer asks. Never animate what looks wrong as a still.

## Rhythm
- **The voice is the timeline.** Everything on screen animates from voice marks (`<id>`, `<id>.<k>`, `<id>.w<k>`, `<id>.end`).
  With `vo_layout.timing: music`, hard cuts land on bars and phrases on half-beats; with `speech`, cuts follow speech
  without rounding. The grid is a coordinate system for time, not a compulsory metronome for speech.
- Something new appears every 2–4 s; nothing holds longer than one bar without a new element. The end card holds ≤ 2 s and is never static.
  A camera creep or a breathing character is not an event: viewers read the frame as stuck when under ~5 % of the
  picture outside the captions changes in a second (`scripts/stillness.py`; 2026-10-26, agrees with blind critics). An
  event is an element moving, something new revealed, the camera leading the eye (the camera may also stand still — see
  "The camera is punctuation"). A slow micro push on every shot is the mark of a slide show.
- The hook reads in the first 2 s, and frame 0 is never empty. In a launch film the product or hero is on screen by second 3.
- **Text hold:** whole on screen for ≥ characters / 15 + 0.4 s and never under 0.8 s (2026-10-22, one rule instead of the
  two earlier ones). If you need room, take a bar of air, not a shorter show. Two simultaneous headlines need a clear
  relationship (a comparison) and time to read.
- **The scene headline is on screen whole within ~1 s of the scene start**, not word by word with the voice: half a
  headline hanging for two seconds reads as a bug. The voice lands on details; the thesis is already on screen. The
  exception is the karaoke caption of "An image per phrase": there is no headline there, and a fragment holds no longer than one word.
- **Close every scene on one frame that holds the thesis and the result together:** headline + the answer card / number / "what to think about".

## Motion (lib/motion.js springs; roles — ENGINE.md "Motion roles")
| Preset | For |
|---|---|
| `heavy` | display type, logo lockups, camera |
| `default` | cards, panels, containers |
| `snappy` | buttons, pills, selection, indicators, pops |
| `playful` | mascots only; never UI or type |

- **Enters:** rise through a mask; grow out of something (0.8–0.9 → 1, opacity within ≤ 4 frames); type on; build
  (skeleton → content); card rise. **Exits:** lift through the mask; get covered; get pushed past camera; collapse into
  what replaces it; a hard cut. A pure opacity fade is never an enter or an exit; only small eyebrow and sub lines may fade.
- **A hit's motion starts before the beat so it lands on it:** use `C.spHit()`, never `C.sp()`, for anything with a sound.
  The audio stays on the grid, on the frame the object lands, with no lead of its own (measured: an audio lead of 0 gives 31/48 hits in sync). `review.py`'s
  metric measures the start of motion — confirm sync on frame strips.
- **Swaps are sequential.** The outgoing line is gone before the incoming one lands (`rise(t, L, in, out)`, out = next in
  minus exit); at most one frame of overlap, with the outgoing line ≥ 95 % gone.
- Masked words start ≥ 140 % of their size below the mask. Scene pre-roll never cuts in over an unfinished wipe.
  Every scene's type is animated on every frame it is registered.
- **No jump at a cut** (`render.mjs --seams`): shared elements keep the same position and scale, a slow push runs through
  both scenes as one function, and the outgoing headline leaves inside the incoming scene.
- **A huge change of scale** (galaxy → atom) zooms logarithmically: `s = s0·(s1/s0)^p`, with p on a spring.

## AAA direction (2026-10-06)
- **One hero per frame.** At any moment exactly one element is the brightest and fastest in frame; the rest is muted
  (0.3–0.4 or a 4–8 px blur, `CAM.focus`) while the voice talks about the hero. This is a default from "Look".
- **One hero moment per film** (up to two in 3 minutes), at 60–85 % of the length. A build leads into it, a breath follows.
  The music drops out 0.3–0.7 s before the main hit, then the hit. Only in the hero moment — a spring with a visible
  overshoot (> ~2 %; ζ = 0.8 with ~1.5 % is fine anywhere) and a 600–900 ms move.
- **Motion hierarchy** (2026-10-22). One main move per shot — on the hero. Secondary moves travel 50–70 % of its path and
  start 100–200 ms later; background motion (drift, parallax, grain) — under 5 %. Two moves of the same amplitude starting
  on the same frame are two heroes. One wave of a cascade is elements of one level, not secondaries.
- **An intensity curve, not a plateau.** Density (1–5 in the shotlist) alternates: a dense scene is followed by a one-hero
  scene. No more than three scenes in a row of the same length (±10 %).
- **Air.** Every ~20 s, a quiet window of 0.6–1.2 s after a key point or before the hero moment: the voice finishes, no new
  elements or hits, the camera drifts. This does not break "something new every 2–4 s".
- **Cut on action, with a carrier.** A scene changes during an action, not after it. Most transitions have a carrier: a
  shape, position or colour that travels into the next scene.
- **J/L cuts.** The next scene's sound starts 80–200 ms before the picture; the previous scene's tail runs 100–300 ms past it.
- **Cascade rhythm.** Steps of 30–80 ms in reading order (`C.stagger`), at most 6–8 per wave, the wave ≤ 0.6 s. Four or
  more elements on the same frame is a fault by default, unless the synchrony is deliberate ("Composition rules" above). A container arrives 40–120 ms before its content.
- **Anticipation on big moves:** before the main zoom or a scene change — 2–3 frames of counter-motion or a sound "breath in".
- **The camera arrives before the action:** the push starts 0.3–0.5 s before the click or the word. Zoom 1.4–2.5×, never past 3×.
- **The camera is punctuation, not decoration on every sentence** (2026-10-14). Before each move, three answers: where the
  viewer looks and whether it reads; is this a transition or an accent; what the previous move was. The shotlist "Camera"
  column holds one move per shot:

  | Move | Duration | When |
  |---|---|---|
  | hold | — | the frame moves by itself or the viewer is reading. This is normal, not a failure |
  | push | 0.6–1.5 s, smooth | lead the eye to the detail the voice names |
  | pull | 0.8–2 s, long tail | show the whole, close a section |
  | pan | 0.5–0.9 s | move from one object to its neighbour |
  | snap | 0.25–0.35 s, +18–32 % | accent: a reveal, a turn, the key number |
  | punch | 0.17 s, 1.55 → 0.94 → 1.0 | accent on a beat, one word or number |
  | whip | 0.26–0.30 s with blur | an accent transition between scenes |
  | cut | 0 | a change of scale or angle without a move |

  Accents are at most a third of the shots. No three pushes in a row and no three identical moves in a row. The camera is
  calm on exposition and faster on a turn. Checked by `plan_check.py` (the shotlist) and `review.py` (the finished film).
- **A directed cursor:** an arc with ease-in and ease-out, a micro-pause before the click, a response (pulse + sound).
- **Scene typography:** at most three text sizes, adjacent levels ≥ 1.5× apart. A headline is a point of up to 9 words.
- **Stills first, motion second:** styleframes are approved before animation, the hook in three variants (SKILL.md step 7).

## Sound (details — AUDIO.md)
- Score and SFX are synthesized in code unless a track is supplied; every hit sits on the grid and is declared in
  `timeline.json` `sfx` (via `scripts/sfx_layout.py`). The mix sits at -14 LUFS, true peak ≤ -1 dBTP (`mix.py`).
- Never speed up a whole voice take: the native pace of a good voice is the pace of the film.
- The voice sits ≥ 12 dB above the bed on every phrase (`mix.py`), and every phrase is recognised from the final mix (`voice.py check-mix`).
- Put hits in the voice's pauses, not on words. Every hit has a high-frequency click or noise: from a sub-bass alone it can't be found.

## Process
- Loop before showing anything: sheet → score → fix the 3 worst → repeat (when to stop — SKILL.md step 9).
- Judge from the rendered MP4s, clips and sheets. Never judge from the page or from memory of the code.
- Machine checks run before the critic's eyes. A check that checked nothing is NOT CHECKED, not "clean". A new check is
  accepted only after it has failed on a known-bad input.
- The blind read is a delivery gate; a fix to the argument chain is the user's decision (BLIND.md).
- Parallel sessions may run the same brief. Use a distinctive project folder, never write into someone else's folder; if
  files change under you, stop and check.
