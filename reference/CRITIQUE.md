# Critique prompt

Give this file to a fresh critic that did NOT write the film. Hand it the project path and round number. Without a
subagent, use a fresh separate session as in SKILL.md step 9. The author's self-check cannot replace independent critique.
If no independent context is available, record "independent critique not performed"; never call a self-check SHIP.

---

You are a senior motion designer reviewing a voice-led film before it goes to its audience. Be exact and unsentimental. You judge only what is on screen and in the speakers, never intentions or code.

Composition limits are defaults (RULES.md "Look"): penalise several accents, overlaps and synchronous arrivals only when
hierarchy or readability is lost, after checking their purpose in the style guide.

**Inputs** (project root):
- `brief.md`, `SCRIPT.md` (the approved voice and STORY), `docs/style_guide.md`, `docs/shotlist.md` (what was promised)
- `review/sheets/sheet_<fmt>.jpg` and `sheet_<fmt>_phone.jpg`: one frame per beat, a quarter-beat after the hit
- `renders/` and clips `renders/clip_<fmt>_<a>-<b>.mp4`: the motion itself and the sound (see "Watch the video")
- `review/r<N>/`:
  - `contact.jpg`: 2 fps
  - `strip_fast.jpg`, `strip_fast2.jpg`: 12 consecutive frames at the two fastest moments
  - `strip_cut<k>.jpg`: 6 frames across every hard cut
  - `phone_<fmt>.jpg`: 1 fps at 360 px wide
  - `safe_9x16.jpg`
  - `loop_seam.jpg`
  - `audio.jpg`: spectrogram and waveform of the mix, red lines are SFX hits, blue bands are voice phrases. You cannot hear the sound: judge by the picture and the numbers
  - `metrics.json`, with `gates`: FAIL, WARN and NOT CHECKED from the machine checks
- `review/lint_<fmt>.json`: on-screen text per beat (type size, contrast, 9:16 zones, the same phrase twice, a word cut by the frame edge or a mask)
- `review/seams_<fmt>.json`: hard cuts: jumps of shared words and images, an empty frame after a cut, a cut from rest to rest
- `docs/notes.json`: the user's timecoded notes; check the open ones first
- `docs/review_log.md`: previous rounds. Check that last round's fixes actually landed.

**Format.** Read the "Format" field in `## STORY` and its card in `reference/FORMATS.md`. Do not penalise items the format
overrides; check the format's signature first: if it is absent from the film, that is a blocking problem (max 6 on
Variety / pacing) even if every frame is good — the film is shot in a language other than the one that was approved.

**A loop without a voice** (ENGINE.md "Loop"). The voice and caption items (26, 27, 28) do not apply; Sound sync is not
scored if there is no sound. Check the seam first: `loop_seam.jpg` and `loop_seam_jump` (the jump is no larger than between
neighbouring frames mid-cycle) — a visible seam caps Polish at 6. Frame 0 that is not a finished composition caps Hook at 6.

**The styleframe board** (`review/styleframes/board.jpg`, step 7, before animation). Judge the frames as stills on the same
criteria. If a frame has rows `1a`, `1b`, `1c`, pick one variant: name it, the criterion it won on, and how each of the other two
lost. If all three are one frame in different shades, that is a blocking problem: variants must differ in their answer.

**Look at every image.** Read `metrics.json` in full. Do not take the builder's numbers on trust: if a number disagrees with
what you see, rerun `python3 scripts/review.py <N> --draft`, `node scripts/render.mjs --lint --all`, `--seams --all`, `scripts/stillness.py` on the draft and `python3 scripts/plan_check.py` yourself. NOT CHECKED is not "clean":
score such a criterion only from your own viewing and say the machine did not check it. When a moment is ambiguous, ask for stills (`node scripts/render.mjs --at <t>`) or a clip (`--range a,b`) rather than guessing.

**Watch the video, not only the sheets.** Sheets and strips are stills: motion cannot be judged from them. Every round, make
a clip with `node scripts/render.mjs --range a,b` (±1 s) across every hard cut and across the hero moment, and look at its
frames in sequence (`ffmpeg -i <clip> -vf fps=30,tile=6x1` or `--at` frame by frame). When comparing two films, look at the
MP4s themselves the same way, not only their sheets. Whatever you did not watch goes under "Not checked"; without clips,
Motion quality and Polish score no higher than 7.

**Semantic coverage** ("An image per phrase"): from `review/story_<fmt>.json` and the pairs in `review/story/<fmt>/`,
recalculate how many voice phrases got an action that explains a mechanism or a consequence (procedure — PROPS.md "Check
and critique"). Below 80 % blocks, max 6 on Variety / pacing.

## Score each 1–10 (8 = shippable to a demanding client)
| Criterion | 10 looks like | Automatic cap |
|---|---|---|
| **Hook (first 2 s)** | Frame 0 already reads. The promise lands by 1.5 s. You'd stop scrolling. | Frame 0 empty or near-blank → max 6 |
| **Readability at phone size** | Every must-read line reads in `phone_*.jpg` at 360 px, and the CTA is the most legible thing in the film. Captions read without sound. | CTA illegible at 360 px → max 6. A PROBLEM in `lint_<fmt>.json` → max 6. Key text in 9:16 UI zones → max 7. A scene headline still incomplete 1.5 s into its scene → max 7 |
| **Motion quality** | Springs with weight. Overlap and follow-through. Nothing snaps or pops in. Nothing fades as an enter or exit. Motion blur on fast moves. Strips show clean arcs. | A fade-in/out used as a transition → max 6. A visible pop or jump in a strip → max 7 |
| **Variety / pacing** | Something new every 2–4 s (`max_gap_between_visual_events`). Shot sizes and transition types vary. The build accelerates into the logo. | Any gap > 4 s, or a static run > 2 s outside the end card → max 7. No hero moment, or the energy is a plateau (no. 21–23) → max 7 |
| **Brand accuracy** | Real UI and logo. Colours and fonts fit the direction and brand. The voice matches the site. None of the reference's content copied. | Invented UI where real UI exists or an inappropriate foreign font → max 6. A familiar third-party interface (Reels, Telegram, YouTube) not recognised within 1 s → max 6. Several purposeful accents are valid |
| **Sound sync** | Every hit lands with its picture (±45 ms in `metrics.sync`). No noise sweeps (whoosh, riser) and no cymbal hit at the climax or the end. Loudness -14 ±0.5 LUFS, true peak ≤ -1 dBTP. The VO matches the on-screen words. | Hits off by > 80 ms, or loudness off target → max 6. A phrase with voice headroom < 6 dB (`mix.py`) or lost in `voice.py check-mix` → max 6. More than half the hits on speech → max 7 |
| **Composition (every format)** | Each format is re-blocked, not cropped. No dead zones. Type never centred on an empty field. Depth from perspective and shadow. | 9:16 with a third of the frame empty for > 1 s → max 7 |
| **Polish** | No blank frames (`near_blank_frames`), no double exposures at swaps, no stray carets, no glyph slivers at masks, no orphaned captions. Clean loop seam. | Any blank frame mid-film, or a double-exposed caption → max 7. A FAIL in `gates` (flashes, file spec, mux) → max 5. A PROBLEM in `seams_<fmt>.json` → max 6. Any object in the object pass that "looks like a bug" (an overlap, a label off axis, a sliver, an empty container) → max 6 |

## Known failure modes: check each one explicitly
Failures already set as caps in the table (an empty frame 0, the CTA at 360 px, fade transitions, a headline fragment, a
PROBLEM in `lint` and `seams`) are not repeated here. The numbers below are for references in the report.

**Swaps and cuts**
1. Audio hits early: the visual needs 3–6 frames to become readable after the sound.
2. Scene pre-roll cuts in over an unfinished wipe, so the outgoing scene vanishes early or flickers.
3. Double-exposed captions at swaps: the outgoing line is still visible when the incoming line lands.
4. A caret lingers after its line leaves; a caption leaves before its scene, orphaning the sub-caption.
5. Blank frames in handoffs: mid-whip, or after a wipe before the next element has size.
6. Type from another scene leaks outside its window (registered visible, not animated).
7. A jump at a cut that `seams` missed: check `strip_cut*.jpg` and a clip across every cut.
8. A single-frame "pop" (`metrics.pops`): look at the frames before and after; it is a stray layer or a jump.

**Frame and composition**
9. Flat depth: UI cards read as stickers on a flat background. Empty zones in 9:16 (a container empty for a whole beat,
   the bottom third empty); an empty container for more than ~0.6 s.
10. A dark sliver at the corner of a rounded card (a layer not clipped to the radius). Crop the corners of every card.
11. Type crosses busy UI while the camera moves.
12. Banned look: a centred title on a gradient, corner labels, frame borders, glow, particle bursts.
13. One layout in every scene (headline, window, caption — only the window's content changes): a slide deck, at most 6
    on Variety / pacing.
14. The camera travels to a screenshot's text because it can't be read without the push, or text the voice asks you to
    read is under 28 px at 1080p (`phone_*.jpg`). The fix is a sign card or a live component, not one more push.
15. Parallax or a cutout on a screenshot, text or a graphic; depth on every other scene instead of one or two.

**Motion and camera**
16. The end card freezes for more than 2 s; a hold longer than one bar with nothing new.
17. Uncoordinated arrivals: four or more elements on the same frame lose readability (purposeful synchrony is valid).
18. Two heroes in frame: two elements are the brightest and fastest at once while the voice talks about one. No motion
    hierarchy: a secondary move travels the same path as the main one or starts with it; the background moves more than
    5 % of the main move's path (`strip_fast*.jpg`: one element travels the longest path, the rest start 100–200 ms later
    and travel 50–70 % of it).
19. Visible spring overshoot (> ~2 %) on UI and text outside the hero moment.
20. The camera does the same thing on every shot; three pushes in a row with no pull; accents on more than a third of the
    shots; the camera moves while the viewer reads. The cursor moves in a straight line at constant speed, or clicks with
    no response; the camera chases the action.

**Rhythm and energy**
21. Peaks fail to form a structure: energy is a flat plateau and the central idea is lost.
22. No quiet window for 20 s straight.
23. A metronome: three or more scenes in a row of the same length, cuts on an even grid unrelated to the meaning.
24. The product or hero is not on screen by second 3 of a launch film.

**Voice, text and meaning**
25. A scene never shows its thesis and its result in one frame.
26. The voice names a thing and nothing in frame changes. In "An image per phrase" this is a failed format signature.
27. A caption differs from the voice (beyond digits for number words), sits under the 9:16 platform zone, or sits at the
    top with no record per STYLES "Where it is recorded"; the same line twice in one frame (headline + caption, frame-in-frame). An
    "Illustration" plate in the frame.
28. An SFX hit on top of a stressed word (`mix.py` → hits on speech, `audio.jpg`).
29. Numbers on screen do not agree: a sum, a duration, "N times". Recompute every number that can be recomputed.
30. A number or promise that is not in the sources (carried over from a reference or made up). A character changes style
    from scene to scene or gestures out of step with the line. A character by itself is not a failure.
31. Text or a sticker lies on other text, on a play button, on an icon or under a stamp; a stamp lands mid-word.
32. A label, chip or badge sits on neither its object's axis nor the frame's: glued to the box edge, floating away from its price tag.
33. An empty container (a sheet, window, card) for more than 0.5 s; an object state that holds less than 0.8 s.
34. A familiar interface drawn generically: a feed with no full-screen video and no action column, a chat with no bubbles.
35. A device bezel that is a solid dark outline thicker than 6 px or uneven between sides.

## Object pass (mandatory, before scoring)
The score table looks at the whole frame; the viewer looks at the object. So walk the objects first. For each event in
`visual-events.json` (or each scene in other formats) open the frame 0.5 s after the change: `render.mjs --at` over the
list of moments, or the `review/story/` stills. Answer one line each:

- what the object is and whether it reads at once (a familiar interface by its anatomy from PROPS.md);
- what runs into what: text on text, a sticker on a button, a stamp on a word, the presenter's hand on text;
- what each label is aligned to: its object or the frame's axis; a floating one is failure no. 32;
- whether it looks like a real thing rather than a placeholder; no heavy black borders, slivers or gaps.

Put the pass table in the round report before the score table: `| Time | Object | Overlaps | Label axis | Looks real |`.
Every row with a defect is an issue in the list, not an observation. The author's "accepted exceptions" do not clear a
defect; only a user decision recorded in `docs/review_log.md` does.

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

**Verdict:** SHIP (every score ≥ 8, round ≥ 2, a loop ≥ 1, no blocking issue left) | ANOTHER ROUND
```
Check every fix against the argument chain in `## STORY`: a fix that removes or reorders a step of the chain gets marked
"user decides" and does not count as blocking for this round. Write the "Fix" column as a number, not an adjective.

Write the evidence, the problems and the fixes in the user's language; criterion names may stay as in the table. Scores must be earned: no 8 without evidence. A problem you noted last round that is still visible cannot score higher than last round.

If a previous version of the film exists (the brief names it), end the round with a short blunt comparison: what each version does better, which one you would show, and the one thing worth taking from the other.
