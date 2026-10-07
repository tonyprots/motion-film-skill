# Blind read: does the film prove its thesis

The critic checks whether the film is well made, but it has read `SCRIPT.md` and sees on screen what it already knows. A blind
reader has not seen the script. It gets only the frames and the text on screen, and from them it retells what the film is
about. If the retelling disagrees with `## STORY`, the film proves something else, whatever scores the critic gave.

## When
- Once per critique round, right after it, on the same draft. The film is not delivered until the blind read matches.
- After a fix that removes or reorders a step of the chain. Such a fix changes the scope, and the user decides it, not a
  "pacing fix" (see CRITIQUE.md).

## How
1. `python3 scripts/blindpack.py <N> --draft` → `review/blind_r<N>/`: sheets of 12 frames (one frame per beat, at 0.72 of the beat,
   from the encoded video), `text.md` (all on-screen text with time and place), `BRIEF.md` (the reader's brief).
2. **Reader:** a fresh subagent on the session's model with one task: "Read `<project>/review/blind_r<N>/BRIEF.md` and
   do it. Do not open anything outside this folder." Without subagents: a separate fresh session (`claude -p`, `codex exec -s read-only`)
   with the same sentence. The reader of round N is no longer blind for round N+1: a new one every time.
3. Compare the answer with `## STORY` and log it in `docs/review_log.md` as a section `## Blind read N`:

| | STORY | Reader | Match? |
|---|---|---|---|
| Thesis | the one sentence the viewer repeats | the reader's thesis | yes / partly / no |
| Chain | the steps from STORY | the reader's steps | which steps got lost |
| Not about | what the film must rule out | what it does not claim | ruled out? |

   **Match** means the thesis is the same in meaning, the chain is recognisable with no missing steps, and the wrong reading
   is ruled out. Otherwise the film goes back for fixes: what on screen made the reader understand it differently, and what to
   change (a frame, a headline, the time on a step).
4. Every line under **Unclear** is a fix task, even if the thesis matched. The next round checks what was fixed.

## What not to do
- Do not prompt the reader: its folder holds no script, no brief, no scene names and no author's comments, and neither does the task.
- Do not argue with the reader: it is the viewer. If it understood it differently, the screen said so.

<!-- reader -->
# Blind reader's brief

You are watching a short film you know nothing about. This folder holds everything the viewer sees:
- `sheet_*.jpg`: frames in order, one per beat of the music, with the time in the corner;
- `text.md`: all the text on screen: the time, where it sits (a voice caption or text in the scene itself) and the text.

Captions and "voice (heard)" lines are what the off-screen voice says. You have no sound.

**Rules.** Do not open anything outside this folder and do not search the web. Do not guess what the author "meant": write only
what follows from the frames and the text. First look through all the sheets in order, then read `text.md`, then answer.

**Answer** (in the language of the film's text, exactly in this form):

1. **Thesis**: one sentence: what the film claims.
2. **Chain**: 3–6 steps by which the film leads there, each with a time.
3. **What the viewer should do or believe** after watching.
4. **What the film does NOT claim**: which wrong reading it rules out, and which it leaves open.
5. **Unclear**: places where you did not understand what is shown or why, each with a time and a reason.
6. **Where the screen goes**: roughly what share of the time each type of frame takes (interface, text, diagram, people…).
