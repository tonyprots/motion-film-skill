# Carry an object through a transformation

Read when one object becomes another: bill to gift, seal to card, dot to page. `MORPH` carries one simple closed
outline with exact source/target contours at its endpoints. Adapted from `anidoodle/canvas-core/morph.ts`
(Apache-2.0), without the rest of that engine or additional dependencies.

```js
// build(root, S): scene-local pixels and absolute seconds.
S.target = MORPH.rect(630, 840, 280, 190, 8);
S.move = MORPH.handoff({
  from:MORPH.rect(170, 695, 230, 310, 8), to:S.target,
  at:C.bt('every-renewal'), duration:1.6, arc:120, turn:[0.35, 0.93]
});
S.paper = MORPH.mount(root, S.move, {fill:'#fffef9', stroke:'#202421', width:5});
// run(t, b, S)
S.paper.draw(t);
const [x, y] = S.move.centre(t); // anchor for accompanying details
// Once while preparing the seam:
MORPH.check(S.move.at(S.move.end), S.target); // throws above 2px gap
```

Shapes are arrays of `[x,y]`, without a duplicate closing point. `MORPH.circle([x,y],radius)` and
`MORPH.rect(x,y,w,h,radius)` create basic silhouettes; `MORPH.path(shape)` returns an SVG path. Inputs and returned
arrays are copied: caller mutation does not change the model.

Handoff options: `at`, positive `duration`, `arc` lift in px, `stretch` 0–1 (default .16), `turn:[start,end]` within
0–1 (default `[0.3,1]`), `points` 8–512 (default 160). `speedRef` is the speed in px/s at which stretch saturates
(default 360), not rendering FPS. `move.at(t)` returns the contour; `move.centre(t)` its path centre; `move.start/end`
are seconds. Point pairing happens once at construction; backward seeks do not alter the result.

Before start the source is exact; after end the target is exact. The SVG adapter occupies `C.W` by `C.H`, or explicit
`w/h`; its root is registered for `C.put`. Contour updates do not depend on previous raster state. `MORPH.gap(a,b)` and
`check(a,b,tolerance)` sample vertices/edges: practical seam checks, not topological proofs. Identical arrays have a
zero gap without rounding error.

## Art direction

- Let the object explain its initial meaning. Leave on the causal word, land on the resulting word. Do not turn a bill
  into a gift before speech has explained why it changes.
- Details and labels travel with `centre(t)`, then yield to new details. Build a bow/mark after landing instead of
  abruptly swapping unrelated images.
- Coordinate color/edge at the seam. A sharp change can be a meaningful turn, but must not accidentally destroy object
  identity (composition defaults — RULES "Look").
- This does not morph arbitrary SVG, letter holes, whole faces or compound paths. Split parts or use a suitable adapter.
  Arbitrary polygon self-intersections are not validated here.
- More points are not automatically better: inspect the contour and capture cost at the real display scale.

Regressions: `node tests/test_morph.cjs` for geometry/timing/endpoints/history/mutation; `node tests/test_editorial.mjs`
for two stories, both formats, intermediate raster and hidden scenes. Full license/notice: `LICENSE-anidoodle`,
`NOTICE-anidoodle`; exact source pin: `library/ports-manifest.json`.
