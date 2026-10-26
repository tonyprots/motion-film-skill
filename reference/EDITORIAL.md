# Presenter, objects and causal connections

Read for a film where a presenter links chapters and objects explain a mechanism. These are components, not a finished
script. New scaffolds load them without React or additional dependencies. Every `draw(t)` uses absolute **seconds**.
Convert a voice mark with `C.bt('mark')` before passing `at`; a numeric `at` here is not a beat.

## Persistent presenter

```js
// Once in build, not a new entrance for every phrase.
S.actor = ACTOR.mount(root, {id:'guide', x:480, y:1260, w:520});
S.actor.draw(t, {
  pose:'point', previous:'explain', at:C.bt('important-word'), duration:0.55,
  mouth:0.3, look:-1, target:[250,-120], expression:'worried', previousExpression:'neutral'
});
```

Poses (`ACTOR.poses`): `rest`, `explain`, `point`, `listen`, `shrug`, `worry`, `welcome`, `hush`, `think`, `chin`,
`scratch`, `facepalm`, `cheer`, `wave`. `mouth` 0–1 controls mouth
opening; `look` -1..1 controls pupils. Arms, head tilt, brows and expression follow explicit pose states without frame
history. This is an illustrative talking rig, not phoneme synchronization. Drive mouth from speech/word intervals or
a baked envelope (`LIPSYNC` below does the former); do not claim random flapping is exact lip sync.

`target:[x,y]` is the pointing target in the presenter's SVG coordinates (500×600 viewBox), including points outside it.
The `point` pose aims its right index finger at that target; free hands use `open`/`relaxed`. The three silhouettes are
baked from Anidoodle (Apache-2.0), without a 3D runtime; load `actor-hands.js` before `actor.js`. Hand shape switches at
the pose transition midpoint: inspect the seam in motion; this is not finger morphing.
`expression`/`previousExpression`: `neutral`, `happy`, `worried`, `surprised`, `shocked`, `grimace`, `wink`, `sad`
(`ACTOR.expressions`). Defaults follow poses;
expressions can change independently of arms. Face geometry interpolates over the same duration.

### Presenter pool

All presenters share one rig: poses, expressions, hands and `draw` are identical; only the look changes. Set it with
`character` in `mount`:

```js
S.actor = ACTOR.mount(root, {id:'guide', x:480, y:1260, w:520, character:'casual'});
// A preset as the base plus individual field overrides:
S.actor = ACTOR.mount(root, {id:'guide', x:480, y:1260, w:520,
  character:{base:'casual', outfit:'tee', top:'#2f5fd0', sleeve:'#3a6be0', trim:'#2550b8', chain:true}});
```

Presets (`ACTOR.characters`):

| Preset | Look |
|---|---|
| `classic` | the original presenter and the default: dark crop, rectangular glasses, blazer with a pin |
| `casual` | short hair with a fringe, long face, light eyes, dark hoodie, slightly taller |
| `woman` | female presenter: long hair, lashes, earrings, tinted lips, blouse, slightly shorter; for a female voice |

Fields and allowed values (`ACTOR.styles`): `hairStyle` — `crop`, `short`, `long`, `bun`, `curls`, `bald`; `beard` —
`none`, `stubble`, `goatee`, `full`; `glasses` — `none`, `square`, `round`; `outfit` — `suit`, `hoodie`, `tee`, `shirt`,
`sweater`, `blouse`; `face` — `round`, `long`. `#hex` colors: `skin`, `hair`, `shine` (hair highlight), `top`, `sleeve`,
`trim` (cuffs, collar), `shade`, `shirt`, `accent` (pin, earrings, print), `lips`; `iris` is an iris color or `'none'`.
Flags: `chain`, `lashes`, `earrings`. `height` 0.8–1.15 scales the figure from the feet. An unknown field, value or a
non-`#hex` color throws at `mount`. Without `character` the presenter is `classic`, pixel-identical to before.

Why a pool: so films do not all look alike. Pick the presenter to match the voice and tone, and keep one presenter for
the whole film. Two presenters in one scene are fine with different `id`s; `look` (-1 left, 1 right) makes them look at
each other. There is no separate dialogue mode. `actor.character` returns the resolved look for checks.

Mount outside `C.scene` and update in `C.hooks.after` to persist between chapters; mount inside a scene to leave with it.
Compose around gestures: a hand may intentionally touch an object, but must not accidentally cover an eye or important
word. This presenter is one graphic family, not a mandatory character. Custom parts/characters can replace it after
visual testing.

### Mouth from the words: `LIPSYNC`

`sync.mjs` writes every spoken word into `data.js`: `window.VOW = [[t0, t1, 'word'], …]` in film seconds. Starts come
from the word marks `<id>.w<k>` (the same as the karaoke), ends from `audio/vo/<id>.words.json`; without one, the next
word or the phrase end, at most ~0.09 s per letter. `LIPSYNC.at(t)` returns `{shape, open, round, speaking}`. Inside a
word its letters share the time (vowels count double) and each letter picks a mouth shape:

| Shape | Letters | Mouth |
|---|---|---|
| `x` | m, b, p; silence between words | closed |
| `b` | other consonants | slightly open |
| `c` | e, i, y | wide, teeth showing |
| `d` | a | wide open |
| `e` | o | round |
| `f` | u, w | small pucker |

Russian letters map the same way (the table in `lipsync.js`). This is a letter guess on real word timing, not phoneme
recognition, but the mouth moves only while the voice speaks and opens on its vowels. Both presenters take it:

```js
const lip = LIPSYNC.at(t);
S.actor.draw(t, {pose:'explain', mouth: lip.open});      // SVG presenter: opening 0–1
S.host.draw(t, {pose:'explain', viseme: lip.shape});     // puppet: a drawn mouth picture
```

### Puppet: `PUPPET`

A drawn character as a set of pictures: one per pose, face, mouth shape, closed eyes and hand over the face. Its
`draw` is the same as `ACTOR`'s, so switching presenters is a change in `mount`:

```js
S.host = PUPPET.mount(root, {id:'host', pack:'<name>', x:120, y:180, w:900});   // outline: 'auto' by default
S.host.draw(t, {pose:'point', previous:'explain', at:C.bt('s1b.w1'), expression:'neutral',
  previousExpression:'happy', viseme: LIPSYNC.at(t).shape});
```

- **Poses:** the same 14 as `ACTOR` (`PUPPET.poses`). A pose replaces the previous one on `at` with a cut, hidden by
  the body pop. There is no crossfade: two drawn poses blended show ghost arms. A pose the pack has no picture for
  uses the pack's `alias` or the nearest pose; those are listed in `host.fallback` and in a console warning.
- **Expressions:** `neutral`, `happy`, `worried`, `surprised`, `shocked`, `grimace`, `wink`, `sad`, plus `skeptic`.
  A missing one falls back: `shocked` → `surprised`, `grimace` and `sad` → `worried`, `wink` → `happy`, else
  `neutral`. The face changes halfway through `duration`.
- **Mouth:** `viseme` is a shape from `LIPSYNC`; without it `mouth` 0–1 maps to a shape as on `ACTOR`. A closed mouth
  on a non-neutral face keeps that face's own mouth. A talking mouth over an emotion comes from the neutral face and
  reads slightly softer.
- **Blinks:** on the same schedule as `ACTOR`.
- **Rim:** a light outline around the silhouette, for dark backgrounds. `outline:'auto'` checks on every frame what is
  painted behind the figure: at three points by its sides and head, the topmost visible element in DOM order with an
  opaque background colour. That finds a dark parent as well as a dark layer behind. `z-index` is not considered and
  photos, `canvas` and video are not read: pass `outline:true` or a `'#hex'` colour there. `false` turns it off. It
  can also go to `draw`, for chapters that change the background.
- **Limits:** `look`, `target` and `sweat` are not drawn; the puppet points with the gesture in its picture. Pictures
  are raster, 1024 px: sharp at 1080p and in 9:16, soft in a 4K close-up.
- **Checks:** `host.root.dataset` shows the current `pose`, `face`, `mouth` and `rim` (`on`/`off`).

**A pack** is a folder `assets/puppets/<name>/` with `puppet.json` and PNGs; `sync.mjs` checks the file names and puts
the manifest into `window.PUPPETS`. `scripts/puppet_pack.py` builds it from an anchor frame and its edits on a green
background. Every frame is an edit of that one anchor: the same character, framing and head, only the arms or only
the face changed. The script aligns each edit's head and prints its error: above ~15 the frame moved the head or
redrew the character, so regenerate it. Frame names and `geom.json` are described at the top of the script. `--touch`
names poses whose hand covers the mouth or eyes on purpose (`hush`, `facepalm`). Packs drawn after a real person stay
in the skill's `private/puppets/`: the folder is left out of every published copy, and `init.sh` copies its packs
into each new project.

## Object illustrations

```js
S.letter = ILLUSTRATIONS.object(root, 'envelope', {
  x:180, y:650, w:700, title:'New message', label:'Mailing'
});
S.letter.draw({open:0.8, title:'Opened message'});
C.put(S.letter.root, {x:220, r:-3});
```

Kinds (`ILLUSTRATIONS.kinds`), 23 objects:

- `server`, `visitor`, `keyboard`, `envelope`, `bill`, `gift`, `shield`, `gavel`, `globe`, `image`, `document`;
- `phone`, `calendar`, `card`, `coins`, `chat`, `form`, `stamp`, `decision`, `lock`, `scales`, `recordings`, `camera`.

These are objects and illustrative diagrams, not real product UI. Capture a named existing UI from its source. Template
text is neutral, not a factual source; localize meaningful labels and inspect phone-size readability.

Shared options: `x`, `y`, `w` (height = .75w), `label`, `skin`, `palette`. Text fields are base values in opts and frame
values in `draw(state)`. `draw(state)` restores fields from state and base options:

| Kind | Text fields | Mutable state |
|---|---|---|
| `envelope` | `title` | `open` 0–1: letter lift |
| `bill` | `title`, `amount` | — |
| `keyboard` | — | `key`: index 0–29; -1 releases all keys |
| `document` | `title` | `checked`: first 0–4 ticks |
| `phone` | `tag`: label at the cut, hidden when empty | `cut` 0–1: coiled cord parts; `ring` 0–1: ringing phase, the handset rattles |
| `calendar` | `title` | `day`: highlighted cell 0–34 (-1 none); `marks`: ring the first N repeating cells. Opts `start` (cell, default 4) and `every` (step, default 7) |
| `card` | `title`, `number`, `amount` | `chip` 0–1: amount pill slides out from under the card (refund, charge); `declined` 0–1: cross |
| `coins` | `amount` | `count` 0–8 coins in the stack |
| `chat` | `title`, `m0`–`m2`, `input` | `shown` 0–3 bubbles (in, out, in; empty text shows a placeholder bar); `typing` 0–1: typing-dots phase; `caret` 0/1 |
| `form` | `title`, `f0`–`f2` (labels), `v0`–`v2` (values), `button` | `filled` 0–3 visible values; `missing`: row with the gap (-1 none); `sent` 0/1 |
| `stamp` | `text` | `press` 0–1: the impression lands; overlay it on another object with `C.put` |
| `decision` | `title`, `subtitle` | `signed` 0–1: signature draws; `sealed` 0–1: seal is pressed |
| `lock` | — | `open` 0–1: shackle lifts |
| `scales` | `left`, `right` | `tilt` -1…1: positive drops the right pan |
| `recordings` | `title` | `count` 0–12 recordings in the grid; `rec` 0/1 |
| `camera` | — | `pan` -1…1: swing; `rec` 0/1; `view` 0–1: field of view |
| Any | `label` | — |

### Skin

Geometry is drawn once; `skin` decides the look, so the object set follows the Image switch in `STYLES.md` instead of
one house look:

| `skin` | Look | When |
|---|---|---|
| `line` | line, grey fills, soft shadow; default, pixel-identical to the original artwork | editorial explainer, light background |
| `flat` | fills without outlines | coloured or dark background; on a light one only with an object shadow, or paper merges with the page |
| `mono` | two inks and the accent: light greys become paper, dark greys ink | dark chapters, strict tone, print look |
| `sketch` | wobbly hand-drawn line (deterministic SVG noise), light fills | lively, hand-drawn tone |

`palette` takes `#rrggbb` preset colours: `ink`, `paper`, `accent`, `second`, `shadow`, and greys by name (`muted`,
`edge`, `metal`, `dark`, `darkEdge`, `line2`, `tint`, `tint2`, `key`, `tint4`). With your own `ink` or `paper`, greys are
mixed from them. For a dark chapter use `skin:'mono'` with `palette:{ink:'#f3f1e8', paper:'#171b18', accent:'#ff7958'}`.
An unknown skin, colour value or colour name throws.

```js
// Once before C.start(): the look of every object in the film. A single call may still override skin/palette.
ILLUSTRATIONS.style({skin:'sketch', palette:{accent:'#cf3e29'}});
S.phone = ILLUSTRATIONS.object(root, 'phone', {x:120, y:600, w:820, tag:'§ 631'});
S.phone.draw({cut:C.clamp((t - C.bt('wiretap')) / .5)});
```

Skins never touch label text: the `sketch` noise applies to shapes only.

Call draw each frame for changing objects. Omitted fields return to their base values, not the previous frame.
Numbers must be finite, sizes/durations positive. No automatic text fitting: shorten, enlarge or recompose labels.
Micro labels require a separate 360px review.

Only reusable objects live here. Draw an object needed by one film (a form with a specific missing field, an email
lacking a specific detail) in that film's project using the same contract: 400×300 SVG, `data-field` for text,
`draw(state)` resetting the whole frame state. When an omission matters, show it on the object itself rather than a
checklist, and label the annotation with an explicit "no" at the word that explains it.

**One object per phrase.** Each chapter gets its own object metaphor, and the object changes state with the phrase:
the cord parts on "wiretapping", the recordings grid grows on "every session", the amount pill slides out on "refund".
Do not reuse one object for different meanings (a visitor with a gavel in the hook and again for a specific court reads
as the same thing). If the phrase changes meaning while the object stands for more than 3–4 s, add a second object or a
new state. In the blind reference comparison, object points were lost here, not on drawing polish.

Select discrete labels/annotations with `C.frameTime` and continuous geometry with t to avoid shutter-mixed opposites.

## Observable transfer

```js
S.link = CAUSAL.connector(root, {
  id:'request', from:{x:420,y:850}, to:{x:760,y:850},
  bend:90, packets:3, label:'IP address'
});
S.link.draw(t, {at:C.bt('request'), duration:1.4});
```

`from`/`to` are points or `(t) => ({x,y})` in scene-local coordinates. Compute moving object anchors and wire endpoints
from one model instead of measuring uncommitted DOM. `bend` is arc deviation in pixels; `width`, `color`, `w`, `h` set
appearance/area. Use 1–20 packets. Draw also accepts `progress` 0–1 or `active:false`. Packets travel from cause to effect,
not forever after the transfer.

`CAUSAL.point(a,b,p,bend)` returns a point on the same arc for carrying an object, such as a bill becoming a gift.
The resulting state must remain visible after the transition.

## Spatial wave

```js
S.wave = CAUSAL.wave(points, {
  origin:{x:0,y:0}, speed:900, at:C.bt('signal'), duration:0.45, mode:'radial'
});
const phases = S.wave(t); // one phase 0–1 per input point
```

Modes: `radial`, `x`, `y`. Distance from the source determines delay, rather than arbitrary array order. Use for a signal,
column sequence or shared field response. Simultaneous motion is valid when it explains a common mechanism. Seed point
generation, not playback.

## Acceptance

`node tests/test_editorial.mjs` checks rendered frames, changing data, hidden scenes and invalid inputs. Technical fitness
does not prove artistic superiority. Compare equal content, duration and scale with hidden provenance, full-film coverage
and dense motion strips. Winning a few frames does not prove a full-video win; record what remains NOT CHECKED.
