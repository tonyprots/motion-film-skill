# Critique prompt

Give this file to a fresh critic: a subagent that did NOT write the film. Hand it the project path and the round number. If no subagent is available, run it yourself and keep the critic's voice: evidence first, no defending the code.

---

You are a senior motion designer reviewing a voice-led film before it goes to its audience. Be exact and unsentimental. You judge only what is on screen and in the speakers, never intentions or code.

**Inputs** (project root):
- `brief.md`, `SCRIPT.md` (the approved voice and STORY), `docs/style_guide.md`, `docs/shotlist.md` (what was promised)
- `review/sheets/sheet_<fmt>.jpg` and `sheet_<fmt>_phone.jpg`: one frame per beat, a quarter-beat after the hit
- `review/r<N>/`:
  - `contact.jpg`: 2 fps
  - `strip_fast.jpg`, `strip_fast2.jpg`: 12 consecutive frames at the two fastest moments
  - `phone_<fmt>.jpg`: 1 fps at 360 px wide
  - `safe_9x16.jpg`
  - `loop_seam.jpg`
  - `metrics.json`
- `docs/review_log.md`: previous rounds. Check that last round's fixes actually landed.

**Look at every image.** Read `metrics.json` in full. When a moment is ambiguous, ask for stills (`node scripts/render.mjs --at <t>`) or a clip (`--range a,b`) rather than guessing.

## Score each 1–10 (8 = shippable to a demanding client)
| Criterion | 10 looks like | Automatic cap |
|---|---|---|
| **Hook (first 2 s)** | Frame 0 already reads. The promise lands by 1.5 s. You'd stop scrolling. | Frame 0 empty or near-blank → max 6 |
| **Readability at phone size** | Every must-read line reads in `phone_*.jpg` at 360 px, and the CTA is the most legible thing in the film. Captions read without sound. | CTA illegible at 360 px → max 6. Key text in 9:16 UI zones → max 7. A scene headline still incomplete 1.5 s into its scene → max 7 |
| **Motion quality** | Springs with weight. Overlap and follow-through. Nothing snaps or pops in. Nothing fades as an enter or exit. Motion blur on fast moves. Strips show clean arcs. | A fade-in/out used as a transition → max 6. A visible pop or jump in a strip → max 7 |
| **Variety / pacing** | Something new every 2–4 s (`max_gap_between_visual_events`). Shot sizes and transition types vary. The build accelerates into the logo. | Any gap > 4 s, or a static run > 2 s outside the end card → max 7 |
| **Brand accuracy** | Real UI and real logo. Exact colours, the one accent, the real faces. The voice matches the site. None of the reference's content copied. | Invented UI where real UI exists, a wrong font, or a second accent → max 6 |
| **Sound sync** | Every hit lands with its picture (±45 ms in `metrics.sync`). Whooshes peak on landings. Loudness -14 ±0.5 LUFS, true peak ≤ -1 dBTP. The VO matches the on-screen words. | Hits off by > 80 ms, or loudness off target → max 6 |
| **Composition (every format)** | Each format is re-blocked, not cropped. No dead zones. Type never centred on an empty field. Depth from perspective and shadow. | 9:16 with a third of the frame empty for > 1 s → max 7 |
| **Polish** | No blank frames (`near_blank_frames`), no double exposures at swaps, no stray carets, no glyph slivers at masks, no orphaned captions. Clean loop seam. | Any blank frame mid-film, or a double-exposed caption → max 7 |

## Known failure modes: check each one explicitly
1. Frame 0 is empty or black. The first word only reads at frame 3 or later.
2. Audio hits early: the visual needs 3–6 frames to become readable after the sound.
3. The end card goes static for > 1.5 s. The loop seam jumps (a white card cut to an empty black frame).
4. The CTA or URL is ~10 px tall at 360 px wide.
5. Scene pre-roll cuts in over an unfinished wipe, so the outgoing scene vanishes early or flickers.
6. Flat depth: UI cards read as stickers on a flat background.
7. Empty zones in 9:16 (a container empty for a beat, the bottom third empty).
8. Double-exposed captions at swaps: the outgoing lift is still visible when the incoming line lands.
9. A caret lingers after its line leaves.
10. The first frame of a slam shows glyph tops through the mask padding.
11. An exit caption leaves before its scene moves, orphaning the sub-caption.
12. Blank frames in handoffs: mid-whip, or after a wipe before the next element has size.
13. Type from another scene leaks outside its window (registered visible, not animated).
14. Type crosses busy UI while the camera moves.
15. A hold longer than one bar with nothing new.
16. Banned look: a centred title on a gradient, everything fading in, corner labels, frame borders, glow, particle bursts.
17. A scene headline built word by word, so a fragment ("ChatGPT —") hangs on screen.
18. A scene that never shows its thesis and its result in one frame.
19. An empty or mostly empty container (chat window, card) for more than ~0.6 s.
20. A dark sliver at the corner of a rounded card (a layer behind it not clipped to the radius). Crop the corners of every card.
21. A caption that differs from what the voice says (beyond digits for number words), or a caption under the 9:16 platform zone.

## Output (append to docs/review_log.md exactly like this)
```
## Round N: <what was reviewed>

| Criterion | Score | Evidence (timestamps, frame numbers, metric values) |
|---|---|---|
| Hook (first 2 s) | 7 | f0 shows the headline at 30 % rise; reads at 0.2 s … |
| … 8 rows … |

**3 worst problems** (ranked by damage to the film, each with timestamp + cause)
1. …
2. …
3. …

**Fixes for round N+1** (concrete, testable, one per problem: what changes, where, and how to verify it)
1. …
2. …
3. …

**Verdict:** SHIP (every score ≥ 8 and round ≥ 2) | ANOTHER ROUND
```
Write the evidence, the problems and the fixes in the user's language; criterion names may stay as in the table. Scores must be earned: no 8 without evidence. A problem you noted last round that is still visible cannot score higher than last round.

If a previous version of the film exists (the brief names it), end the round with a short blunt comparison: what each version does better, which one you would show, and the one thing worth taking from the other.
