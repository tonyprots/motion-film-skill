# Review log: README demo v2

Every round: draft render of both formats, `review.py` gates, `--lint` and `--seams`, then a critic agent that did not
write the film (reference/CRITIQUE.md, with the object pass), then a blind reader who saw only the frames and the
on-screen text (reference/BLIND.md).

## Round 1: machine checks only
`--lint` found 89 PROBLEMs: the presenter cut by the left frame edge in every scene, 13–17 px text inside small objects
(a calendar's day numbers, the agent's status pill, the report title). Fixed before any critic saw it: the presenter
stands whole in the frame, the calendar became a lock, object labels are off. Lint 0 PROBLEM in both formats.

## Scores

| Criterion | r2 | r3 | r4 | r5 |
|---|---|---|---|---|
| Hook | 7 | 8 | 8 | 8 |
| Readability | 6 | 8 | 8 | 8 |
| Motion | 6 | 7 | 7 | 7 |
| Variety / pacing | 7 | 7 | 7 | 7 |
| Brand | 8 | 8 | 8 | 8 |
| Sound sync | 7 | 7 | 7 | 7 |
| Composition | 6 | 7 | 7 | 7 |
| Polish | 6 | 6 | 6 | 6 |

## What each round fixed
- **r2 → r3.** The report swapped to a black square in one frame; now it morphs into the film frame (MORPH.handoff) and
  darkens as it lands. The end-card address grew to 46 px (54 px on 9:16). Empty frames after cuts: the waveform and the
  library land on the cut. Captions of the old scene no longer sit on the wipe. The SHIP stamp moved onto the board.
- **r2 blind read.** "Two cards are already shipped while the lowest score is still 7, and the title says it ships only
  at 8." The score now reaches 8 first, then the cards move.
- **r3 → r4.** The stamp sat off its column; it is centred on the shipped column. The six library objects slid up into
  the title on their exit; they sink and shrink instead.
- **r4 → r5.** The stamp struck in one place and settled in another; it now lands where it rests.
- **After r5.** At the strike the stamp's frame touched "8." in the caption; the caption leaves 0.15 s before the hit.
  The skin chips moved clear of the presenter's hand (blind read r5). A stray bass note in the outro was removed.

## Why it stopped at r5
SKILL.md step 9: the lowest score did not rise for three rounds. Polish was held at 6 by one object defect (the stamp),
fixed in parts each round and closed after r5, checked frame by frame. Left on purpose: one layout in six of seven
scenes (the presenter is the through-anchor), the empty "critic" column for ~0.9 s, a pose change in one frame (the
puppet switches poses), chips off their axis (lint WARN).

## Blind reads
Rounds 2, 3 and 5: the reader's thesis matched the story ("an agent turns a report nobody reads into a film, written in
code, timed to the voice, gated by a critic") and the chain was complete. Open for every reader: who the cartoon man is
before the presenter chapter, and that the mouth-shape names are lip-sync jargon.

## Final checks
`--verify`: 12/12 probes identical in both formats. Mix: −14.1 LUFS, true peak −1.5 dBTP, speech over the music
≥ 15.8 dB in every phrase, 0 of 2 hits on speech. The sound was measured, not listened to by a person.
