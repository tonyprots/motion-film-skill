# Story: the frame before the script

_Based on voice-film (MIT, artkruglov/voice-film): the story frame and script rules; the extra arcs and the source and ending rules were added after our own films. In motion-film the voice drives the timeline, so these rules decide the film before any motion is built._

A film lands one idea. Write the STORY block at the top of `SCRIPT.md` and get it approved before any script line:

```
## STORY
- Type and arc: <a type from the table below, or your own arc as steps joined by "→">
- Logline: <who> can't <what>, because <why>; <solution> changes that.
- One sentence the viewer repeats: "<the idea in ≤ 20 words>"
- Argument chain: <3–6 steps by which the film leads to that sentence; the step that carries the thesis gets the most time and the music drop>
- Not about: <the wrong reading the film must rule out: "about X, not about Y">
- Hero: <one concrete person/product with one task — carried through the whole film>
- Stakes: <what it costs to do nothing>
- Turn: <the surprise / the "but" that makes the solution necessary>
- Main number (voice): <one, with a comparison> — everything else on screen
- Must not claim: <unverified metrics, planned features, testimonials you don't have>
```
If the one sentence won't come, the film isn't ready — don't start the script.

Type, the one sentence, the chain, "not about" and "must not claim" are required. Hero, stakes, turn and the main number go in
when the material has them. An announcement, a news breakdown or a report often has no turn and no human hero: then the field
says "none — <why>" instead of bending the material to fit. A surprise at the end ("an AI made this film") is not a turn: the
turn sits in the middle and makes the solution necessary.

The one sentence, the chain and "not about" are the thesis contract: the blind reader checks the finished film against them
(`reference/BLIND.md`). They also guard the edits: a step of the chain is not cut "for the pace" without asking the user. A film
"about fewer screens" that spends most of its time showing screens argues with itself: time on a step is part of the argument.

## Arcs by film type

| Type | Arc |
|---|---|
| **Decision** (leadership) | hook → stakes → the obvious path and why it fails (one reason) → turn → the solution on the hero → proof on the real thing → what it needs (≤ 3, each on an example) → one ask → echo of the hook |
| **Launch** (product) | the pain in 5 s → the catch / "what if" → the demo on one hero → two or three "oh" moments → where it lives → the offer → echo |
| **Research summary** | the question → the surprising finding → why it happens → what it means → what to do |
| **Tutorial** | the result first → three steps → the common mistake → recap |
| **Event announcement** (meetup, launch, webinar) | the audience's pain or question → the promise: what, when, how long → the programme (carries the thesis, gets the most time) → why come (≤ 3 reasons from the source) → one ask with the date → echo |
| **News breakdown** | what happened, as one fact → why it is not just another headline → what exactly changed (≤ 3 points) → what it means for the viewer → what to do or watch |
| **Results** (team, project, quarter) | the goal and how it was set → the main result against a baseline → how we got there (≤ 3 moves) → what did not work and why → the next step and what we need from the viewer |
| **Period review** (digest, roundup) | the one idea of the period → 3–5 shifts, each with "what it means for us" → which shift matters most → what to watch next |

If the film fits no type, build the arc yourself from 4–7 steps, write it in "Type and arc" and explain the order in one line.
A new arc that worked is a candidate for this table.

## Rules that make it watchable
- **Hook ≤ 60 characters**: a question, a contradiction or one striking fact. No number in it.
- **One hero** (a person or a product) through the whole film; other examples come as a fast montage after it.
- **≤ 8 spoken numbers per film, ≤ 1 per line, each with a comparison** ("three times fewer"). The rest are on screen.
- **Lines ≤ 200 characters (~13 s), sentences ≤ 15–20 words, lists ≤ 3 items.** Short fragments are fine: "Same silk. Same cut. Same colour."
- **Name the turn** ("but it has a catch") when the arc has one — a solution without a problem doesn't land.
- **Ending**: one ending. The last line is meaning, not logistics — echo the hook's image or words. One ask, with a verb, and
  after it the voice promises nothing new: a line after the ask with a fresh "come / watch / we'll show" is a second ending,
  and the blind reader will see it. Put a surprise before the ask or make it the echo. Links, footnotes and the rest of the asks go on screen, never in the voice.
- **Source only.** Names, people, programme items and lists come from the sources word for word: no items added for the rhythm
  of a list ("Codex, Claude, new video models" when the source has no video models), no shortening that shifts the meaning
  ("video" for "making video"). A contrast "X, not Y" is voiced only if the source makes it.
- **"Not about" is a contract, not a line.** The field is for the blind reader and for edits; it never goes into the voice or the titles.
- **Honesty**: say only what the product does today; label illustrations and estimates on screen.
- **Terms**: everything the voice reads differently from how it is written (abbreviations, versions, addresses, foreign names)
  goes to `lexicon.json` next to the script: `{"SQL": "sequel", "v2.0": "version two"}`. The script, the screen and the captions
  keep the spelling; the voice gets the pronunciation. Check a new entry on a voice sample. Set words off with commas and
  dashes, not an ellipsis: engines read an ellipsis unpredictably.

## Voice direction (per line)
`{pre=0.6 air=1.2 hold=1.5 mood=intrigue pace=slow stress="…"}`
- `mood`: neutral · intrigue · concern · relief · confident · warm · excited (or any short English adjective pair). Change mood at least at every act; ≥ 3 moods per film. Models that read direction as text get the mood in words; ElevenLabs v4 reads no direction and gets mood as `voice_settings` (stability, style, speed: the `MOOD` table in `scripts/providers/elevenlabs.py`), and `pace` changes the speed. The table is a starting point: listen to takes on your voice and tune it.
- `pace`: slow · fast. Slow for the hook and the closing line.
- `hold`: a mute beat (picture + music only) after a key moment — 1–2 per film.
- `air` 1–1.5 s only after 1–2 climaxes (the key number, the turn, the hero moment); `pre` ≥ 1 s before the closing line. The
  other lines are fine with the defaults: every scene starts on a bar, so an extra pause on a seam rounds up to the next one.
  Voice silence on a scene seam is 1–2 s; 3 s or more reads as a dropout.

## Golden template (launch or decision, 1:20–2:00)
```
## 1. Hook · 0:00–0:06
**Shot:** the hero at the moment of pain, close.
**Voice:** "<≤ 60 chars: question / contradiction / fact>" {mood=intrigue pace=slow air=1.2}
## 2. Stakes · 0:06–0:18
**Voice:** "<what it costs; the one number + a comparison>" {mood=concern}
## 3. The catch / the obvious path · 0:18–0:32
**Voice:** "<why the obvious answer fails — one reason>" {mood=concern}
**Voice:** "<the turn: "So …" / "Then we flipped it">" {mood=confident hold=1.0}
## 4. The solution on the hero · 0:32–0:55
**Voice:** "<the same hero task, now easy — show, don't list>" {mood=relief hold=1.2}
## 5. Proof / where it lives · 0:55–1:10
**Voice:** "<≤ 3 places or facts, each with a picture>" {mood=confident}
## 6. Range (optional montage) · 1:10–1:16
## 7. The ask · 1:16–1:24
**Voice:** "<one action>" {mood=warm}
## 8. Echo · 1:24–1:30
**Shot:** the same hero, the pain gone. Links and footnotes on screen.
**Voice:** "<one short line that answers the hook>" {mood=warm pace=slow pre=1.0 air=3.5}
```
