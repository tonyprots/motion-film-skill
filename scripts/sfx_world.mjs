// Sounds of the physical world on screen: the timing contract shared by sync.mjs and sfx.mjs (reference/AUDIO.md §3).
//
// MATERIAL — one sound for one physical transition (sfx type "material", "kind" below, "dur" in seconds). Everything
// inside it is placed by a FRACTION of "dur", not by seconds, so a longer or shorter transition keeps its sound on the
// picture; the transition shader is written against the same fractions. "hit" is the sharpest moment: review.py and
// mix.py check sync and audibility there, not at the start of the transition.
//   tear  0–0.06 tension, almost silent · 0.06–0.55 the tear runs top to bottom (fibrous noise, louder and brighter
//         toward the end) · 0.55 the last fibres snap · 0.55–1 the halves curl away (a light paper rustle) ·
//         a few small scrap rustles within 0.1–0.7
//   fold  creases at 0.15, 0.32, 0.48 (a dry crunch, paper friction between them) · 0.48–1 the folded sheet flips
//         and flies off: one light rustle near 0.6, no landing
//   slab  0–0.285 the slab falls: NO sound · 0.285 the impact (low dull thud + broadband slap + a short room) ·
//         0.285–0.6 small settling grit
// BEDS — the kinds of a continuous world bed (timeline "beds"): a texture led by a level 0..1 on voice marks.
export const MATERIAL = {
  tear: { dur: 2.4, hit: 0.55, tension: 0.06, scraps: [0.1, 0.7] },
  fold: { dur: 2.2, hit: 0.15, creases: [0.15, 0.32, 0.48], rustle: 0.6 },
  slab: { dur: 1.6, hit: 0.285, settle: 0.6 },
};
export const BEDS = ['wind', 'water', 'hum', 'air'];
