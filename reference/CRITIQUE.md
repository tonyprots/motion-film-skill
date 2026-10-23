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
  - `strip_cut<k>.jpg`: 6 frames across every hard cut
  - `phone_<fmt>.jpg`: 1 fps at 360 px wide
  - `safe_9x16.jpg`
  - `loop_seam.jpg`
  - `audio.jpg`: spectrogram and waveform of the mix, red lines are SFX hits, blue bands are voice phrases. You cannot hear the sound: judge by the picture and the numbers
  - `metrics.json`, with `gates`: FAIL, WARN and NOT CHECKED from the machine checks
- `review/lint_<fmt>.json`: on-screen text per beat (type size, contrast, 9:16 zones, the same phrase twice)
- `review/seams_<fmt>.json`: hard cuts: jumps of shared words and images, an empty frame after a cut, a cut from rest to rest
- `docs/notes.json`: the user's timecoded notes; check the open ones first
- `docs/review_log.md`: previous rounds. Check that last round's fixes actually landed.

**Format.** Read the "Format" field in `## STORY` and its card in `reference/FORMATS.md`. Do not penalise items the format
overrides; check the format's signature first: if it is absent from the film, that is a blocking problem (max 6 on
Variety / pacing) even if every frame is good — the film is shot in a language other than the one that was approved.

**A loop without a voice** (SKILL.md "Loop"). The voice and caption items (21, 27, 40) do not apply; Sound sync is not
scored if there is no sound. Check the seam first: `loop_seam.jpg` and `loop_seam_jump` (the jump is no larger than between
neighbouring frames mid-cycle) — a visible seam caps Polish at 6. Frame 0 that is not a finished composition caps Hook at 6.

**The styleframe board** (`review/styleframes/board.jpg`, step 7, before animation). Judge the frames as stills on the same
criteria. If a frame has rows `1a`, `1b`, `1c`, pick one variant: name it, the criterion it won on, and how each of the other two
lost. If all three are one frame in different shades, that is a blocking problem: variants must differ in their answer.

**Look at every image.** Read `metrics.json` in full. Do not take the builder's numbers on trust: if a number disagrees with
what you see, rerun `python3 scripts/review.py <N> --draft` and `node scripts/render.mjs --lint --all`, `--seams --all` and `python3 scripts/plan_check.py` yourself. NOT CHECKED is not "clean":
score such a criterion only from your own viewing and say the machine did not check it. When a moment is ambiguous, ask for stills (`node scripts/render.mjs --at <t>`) or a clip (`--range a,b`) rather than guessing.

## Score each 1–10 (8 = shippable to a demanding client)
| Criterion | 10 looks like | Automatic cap |
|---|---|---|
| **Hook (first 2 s)** | Frame 0 already reads. The promise lands by 1.5 s. You'd stop scrolling. | Frame 0 empty or near-blank → max 6 |
| **Readability at phone size** | Every must-read line reads in `phone_*.jpg` at 360 px, and the CTA is the most legible thing in the film. Captions read without sound. | CTA illegible at 360 px → max 6. A PROBLEM in `lint_<fmt>.json` → max 6. Key text in 9:16 UI zones → max 7. A scene headline still incomplete 1.5 s into its scene → max 7 |
| **Motion quality** | Springs with weight. Overlap and follow-through. Nothing snaps or pops in. Nothing fades as an enter or exit. Motion blur on fast moves. Strips show clean arcs. | A fade-in/out used as a transition → max 6. A visible pop or jump in a strip → max 7 |
| **Variety / pacing** | Something new every 2–4 s (`max_gap_between_visual_events`). Shot sizes and transition types vary. The build accelerates into the logo. | Any gap > 4 s, or a static run > 2 s outside the end card → max 7. No hero moment, or the energy is a plateau (no. 28, 31, 32) → max 7 |
| **Brand accuracy** | Real UI and real logo. Exact colours, the one accent, the real faces. The voice matches the site. None of the reference's content copied. | Invented UI where real UI exists, a wrong font, or a second accent → max 6 |
| **Sound sync** | Every hit lands with its picture (±45 ms in `metrics.sync`). No noise sweeps (whoosh, riser) and no cymbal hit at the climax or the end. Loudness -14 ±0.5 LUFS, true peak ≤ -1 dBTP. The VO matches the on-screen words. | Hits off by > 80 ms, or loudness off target → max 6. A phrase with voice headroom < 6 dB (`mix.py`) or lost in `voice.py check-mix` → max 6. More than half the hits on speech → max 7 |
| **Composition (every format)** | Each format is re-blocked, not cropped. No dead zones. Type never centred on an empty field. Depth from perspective and shadow. | 9:16 with a third of the frame empty for > 1 s → max 7 |
| **Polish** | No blank frames (`near_blank_frames`), no double exposures at swaps, no stray carets, no glyph slivers at masks, no orphaned captions. Clean loop seam. | Any blank frame mid-film, or a double-exposed caption → max 7. A FAIL in `gates` (flashes, file spec, mux) → max 5. A PROBLEM in `seams_<fmt>.json` → max 6 |

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
21. A caption that differs from what the voice says (beyond digits for number words), or a caption under the 9:16 platform zone, or a caption at the top of the frame with no reason in the style guide. An "Illustration" plate in the frame.
22. The same sentence twice or more in one frame: headline + caption, or a frame-in-frame repeating the headline.
23. A jump at a cut: shared elements change scale or position between the last frame of one scene and the first of the next, or a blank frame between two headlines. Check `strip_cut*.jpg` and a 30 fps strip across every cut.
24. A single-frame "pop" (`metrics.pops`): look at the frames before and after; it is a stray layer or a jump.
25. Numbers on screen do not agree with each other: a sum, a duration, "N times". Recompute every number that can be recomputed.
26. The product or hero is not on screen by second 3 of a launch film.
27. An SFX hit on top of a stressed word: neither the word nor the hit is heard (`mix.py` → hits on speech, `audio.jpg`).
28. No hero moment, or several: the film's energy is a flat plateau, the climax cannot be named with one timecode.
29. Everything flies in at once: four or more elements start on the same frame (`strip_fast*.jpg`), or a cascade runs past 0.6 s.
30. Two heroes in frame: two elements are the brightest and fastest at once while the voice talks about one.
31. No quiet window for 20 s straight: voice, hits and new elements in one unbroken stream.
32. A metronome: three or more scenes in a row of the same length, cuts on an even grid unrelated to what the voice means.
33. The cursor moves in a straight line at constant speed, or clicks with no response; the camera chases the action instead of arriving first.
34. Spring overshoot on UI and text outside the hero moment (wobble on every element).
35. Parallax or a cutout on a screenshot, text or a graphic; or depth on every other scene instead of one or two.
36. The camera does the same thing on every shot (an even slow push reads as a presentation, a snap as fuss); three pushes in
    a row with no pull; accents on more than a third of the shots; the camera moves while the viewer reads.
37. A number or promise that is not in the project's sources (carried over from a reference film or made up); code-drawn
    little people and faces on objects.
38. One layout in every scene: a headline, a window or screenshot under it, a caption under that — scene after scene only
    the window's content changes. That is a slide deck: at most 6 on Variety / pacing.
39. The camera travels to a screenshot's text because it can't be read without the push, or a screenshot carries text the
    voice asks you to read that is under 28 px at 1080p (look at `phone_*.jpg`). The fix is a sign card or a live component
    (RULES.md), not one more push.
40. The voice names a thing and nothing in frame changes: the phrase plays over the same state as the one before. In "An
    image per phrase" this is a failed format signature.
41. No motion hierarchy in a shot (RULES.md "Motion hierarchy"): a secondary move travels the same path as the main one or
    starts on the same frame; the background moves more than 5 % of the main move's path. Check on `strip_fast*.jpg`: in
    every shot one element travels the longest path, the rest start 100–200 ms later and travel 50–70 % of it.

## Verbal feedback → numbers (2026-10-22)
A note in words ("livelier", "more premium") is not a change. Turn it into numbers first, then change one thing. Write the
"Fix" column of the problem table the same way: a number, not an adjective.

| Note | What changes | How to check |
|---|---|---|
| "livelier", "make it pop" | a scale hit on the key word or number the voice names: 1.0 → 1.08 → 1.0 over 6 frames (0.1 s at 60 fps), peak exactly on the beat; at most one per scene | `--at` on the beat and ±3 frames around it |
| "more premium" | linear moves (`C.seg`) — ease-out-quint, `cubic-bezier(0.22, 1, 0.36, 1)`, in code `1 - (1 - x) ** 5`; container springs — ζ = 0.8 (~1.5 % overshoot); text — `heavy` (ζ = 1), no overshoot | `--range` over the scene: no overshoot on text in the strips |
| "it drags" | every pause one beat shorter: `air`, `pre`, `hold` in `SCRIPT.md`, quiet windows, holds between events; text hold never below the RULES.md "Rhythm" rule | `plan_check.py`, `--animatic` |
| "too busy" | one main move per shot; the rest start 150 ms later and travel 60 % of its path (RULES.md "Motion hierarchy") | `strip_fast*.jpg`: one fastest element in frame |
| "looks AI-made" | list every default move in the shot (a fade entrance, a uniform cascade, a slow push on every shot, a preset with no role), ban each with a line in the style guide's "Rules from notes" and re-render | the new sheet or clip against the last one: none of the listed moves left |

**The revision loop.** The user's taste notes — one or two per round, not all at once: after five changes at once you cannot
tell which one worked. A change that worked becomes a rule: `notes.py resolve N --rule "…"` appends it to "Rules from
notes" in `docs/style_guide.md`, and the next round and issue start from it. This does not limit the critic's blocking
defects: fix all of them.

## Output (append to docs/review_log.md exactly like this)
```
## Round N: <what was reviewed>

| Criterion | Score | Evidence (timestamps, frame numbers, metric values) |
|---|---|---|
| Hook (first 2 s) | 7 | f0 shows the headline at 30 % rise; reads at 0.2 s … |
| … 8 rows … |

**Issues** (ranked by damage to the film; blocking ones first, no more than 6 in total)

| # | Level | Time | Symptom | Fix | Acceptance condition |
|---|---|---|---|---|---|
| 1 | blocking | 12.40 s | … | what changes and where | how to verify: `--at` stills, a clip, a metric and its threshold |
| 2 | advice | … | … | … | … |

**Not checked** (what you could not look at or verify, and why; NOT CHECKED from `gates` goes here too)

Sound measured, not listened to.

**Verdict:** SHIP (every score ≥ 8, round ≥ 2, no blocking issue left) | ANOTHER ROUND
```
Check every fix against the argument chain in `## STORY`. A fix that removes or reorders a step of the chain is not a
pacing fix: mark it "user decides" and do not count it as blocking for this round.

Write the evidence, the problems and the fixes in the user's language; criterion names may stay as in the table. Scores must be earned: no 8 without evidence. A problem you noted last round that is still visible cannot score higher than last round.

If a previous version of the film exists (the brief names it), end the round with a short blunt comparison: what each version does better, which one you would show, and the one thing worth taking from the other.
