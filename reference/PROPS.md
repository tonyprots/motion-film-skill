# Prop recipes and phrase coverage

Read when building a prop explanation or "An image per phrase". `engine/lib/props.js` is a small library of geometric
visual verbs, never product UI. Its language comes from our counter, connection, card and assembly patterns. These are
new helpers, not automatically approved artwork: type, source data and meaning still need review for each film.
No third-party paid assets are included.

## Selection

| Kind | Explains | Extra options | Observable result |
|---|---|---|---|
| `accumulate` | each new object adds a contribution | integer `max` 1–24, `unit` | count and filled cells |
| `meter` | proportion, reserve, capacity | `max`, `unit` | bar width and number |
| `compare` | one value against another | `max`, `baseline`, `reference`, `unit` | first bar against the second |
| `connect` | connection between entities | `left`, `right` | growing link and completion percentage |
| `reveal` | hidden cause or answer | `detail`, `initial`, `result` | uncovered card and answer |
| `assemble` | parts create a whole | up to four `parts` labels, `initial`, `result` | parts join and the result appears |

Values come from sources. A connection percentage is animation progress, not a measured product claim: if misleading,
replace the label in your own scene. Pick a recipe by mechanism, not to add variety.

## API

New scaffolds load `PROPS`. In an older project copy `lib/props.js` and load it after `core.js`, before `film.js`.

```js
C.scene({
  name: 'queue', from: 'sc1', to: 'sc2',
  build(root, S) {
    S.prop = PROPS.mount(root, 'accumulate', { id: 'queue', label: 'Request queue', max: 6 });
  },
  run(t, b, S) {
    S.prop.draw(t, [['sc1', 0], ['s1a.w3', 1], ['s1b.w2', 2]]);
  }
});
```

Common options: unique `id`, `label`, `max`, `x`, `y`, `w`, `role` (default `text`, no overshoot). Default ranges:
0–1 for `connect/reveal/assemble`, 0–100 for `meter/compare`. `draw(t, keys)` takes marks and values as `C.trk`, returns
the current value and updates every observable without depending on the previous frame. Move `root` with `C.put`;
`value` is the real result text node. Choose dimensions per film and keep captions clear of props. To reuse in a second
story, change data/labels without changing recipe internals.

## Declare actions

For format 9 set `timeline.json` → `"visual_format": "image-per-phrase"`. Create `visual-events.json`:

```json
{
  "version": 1,
  "events": [{
    "id": "queue-add", "phrase": "s1a", "at": "s1a.w3",
    "region": "[data-prop='queue']",
    "selector": "[data-prop='queue'] [data-role='value']",
    "property": "text", "from": "0", "to": "1",
    "action": "accumulate", "meaning": "A new request adds an item to the queue",
    "window": [-0.1, 0.7]
  }]
}
```

Each event references a placed voice phrase and a real mark inside it. `window` is seconds before/after the mark,
at most two seconds total; let the result settle before the next event. `region` contains only the prop, no captions;
`selector` matches exactly one observable inside it. `property` is visible leaf `text`, or a rendered SVG attribute
`attr:width`, `attr:height`, `attr:d`, or `digits` for a mechanical number (below). Inert HTML/data attributes, opacity and transforms do not prove an action.
`action`: `accumulate`, `fill`, `compare`, `connect`, `reveal`, `assemble`, `change`; `meaning` explains its connection to
the phrase. A phrase counts once even with several actions. All phrases in `audio/vo_placed.json` are the denominator.

## The object must look right, not only change

Defects a viewer sees at once and `--story` coverage does not catch (presenter promo post-mortem, 2026-10-27):

- **A familiar interface by its anatomy.** When a scene shows a product the viewer knows by sight (Reels, Shorts,
  TikTok, Telegram, YouTube, App Store), list in the shot list the 4–6 details that make it recognisable and build each
  one. Reels and Shorts: the video fills the screen height; a like · comment · share column at the bottom right; author
  with avatar and caption at the bottom left; a thin progress bar; the next video arrives by a full vertical swipe.
  Telegram: bubbles with tails and timestamps, a header with avatar and status, the input field at the bottom. Without
  them it is "a generic card" and nobody reads it as a feed. A real screenshot or `capture.mjs` beats a drawing when available.
- **A label lives by its object.** Chips, badges, captions and stamps are placed with `C.anchor(el, object, …)`: centred
  under the object, on its corner, or beside it. Not by box coordinates like `left:0`: that glues labels to the left edge
  and drops stamps mid-word. A label with no object is centred on the frame; a row of labels is centred as one unit.
- **Nothing lies on text or on an icon.** A sticker does not cover the play button, a title does not run into another
  header, a stamp lands on the card's corner, not its name. `render.mjs --lint` reports it as PROBLEM `overlap`.
- **A state holds; an empty one does not.** An empty container (a sheet, window or card with no content) lasts no more
  than 0.5 s. Every state of an object holds ≥ 0.8 s. When the words come faster, states accumulate (sheets stack, items
  add up) instead of replacing each other.
- **Devices with a thin frame or none.** A phone or laptop around a frame gets a light or dark grey 2–4 px bezel with real
  proportions and radius, a camera notch optional. A solid black 10+ px outline reads as a funeral-notice border; an uneven or
  crooked one reads as a bug.

## Check and critique

After `vo.py` and `sync.mjs`: `node scripts/render.mjs --story --all`.

- Checks references, before/after states, visibility and internal pixel changes, normalizing prop position and scale.
  Captions or camera motion alone cannot supply coverage. The 80% threshold belongs to format 9; it is not imposed on
  other formats, where the file is optional. No voice-free loop check.
- `review/story_<fmt>.json` contains coverage, uncovered phrases, errors and observed values. Pairs are in
  `review/story/<fmt>/*-pair.jpg`; each event also includes the `--range` command for a short disputed-action clip.
- `EVIDENCE` means an observed change, never SHIP or proof of meaning. The critic inspects pairs and renders a clip
  when needed, excluding decorative shaking, irrelevant actions and misleading metaphors from semantic coverage.
- `review.py` blocks format 9 without current evidence. Input hashes detect stale evidence after edits; rerun `--story`.
  Missing material is NOT CHECKED (or FAIL for the required contract), never a successful check.

Regressions: `node tests/test_story.mjs` from the installed skill. It creates an isolated temporary project, checks six
recipes with two data sets in both formats, seek order and negative examples. No paid provider calls.

For composite scenes and local SVGs, read `LIBRARY.md`. For mechanical numbers, `property:"digits"` reads the visible
characters in the `data-digit-window` elements under the selected number group; hidden or fake data attributes do not count.
