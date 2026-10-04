# Story: the frame before the script

_From voice-film (MIT, artkruglov/voice-film), used as is: the story frame and script rules. In motion-film the voice drives the timeline, so these rules decide the film before any motion is built._

A film lands one idea. Write the STORY block at the top of `SCRIPT.md` and get it approved before any script line:

```
## STORY
- Logline: <who> can't <what>, because <why>; <solution> changes that.
- One sentence the viewer repeats: "<the idea in ≤ 20 words>"
- Hero: <one concrete person/product with one task — carried through the whole film>
- Stakes: <what it costs to do nothing>
- Turn: <the surprise / the "but" that makes the solution necessary>
- Main number (voice): <one, with a comparison> — everything else on screen
- Must not claim: <unverified metrics, planned features, testimonials you don't have>
```
If the one sentence won't come, the film isn't ready — don't start the script.

## Arcs by film type

| Type | Arc |
|---|---|
| **Decision** (leadership) | hook → stakes → the obvious path and why it fails (one reason) → turn → the solution on the hero → proof on the real thing → what it needs (≤ 3, each on an example) → one ask → echo of the hook |
| **Launch** (product) | the pain in 5 s → the catch / "what if" → the demo on one hero → two or three "oh" moments → where it lives → the offer → echo |
| **Research summary** | the question → the surprising finding → why it happens → what it means → what to do |
| **Tutorial** | the result first → three steps → the common mistake → recap |

## Rules that make it watchable
- **Hook ≤ 60 characters**: a question, a contradiction or one striking fact. No number in it.
- **One hero** (a person or a product) through the whole film; other examples come as a fast montage after it.
- **≤ 8 spoken numbers per film, ≤ 1 per line, each with a comparison** ("three times fewer"). The rest are on screen.
- **Lines ≤ 200 characters (~13 s), sentences ≤ 15–20 words, lists ≤ 3 items.** Short fragments are fine: "Same silk. Same cut. Same colour."
- **Name the turn** ("but it has a catch") — a solution without a problem doesn't land.
- **Ending**: the last line is meaning, not logistics — echo the hook's image or words. One ask, with a verb. Links, footnotes and the rest of the asks go on screen, never in the voice.
- **Honesty**: say only what the product does today; label illustrations and estimates on screen.

## Voice direction (per line)
`{pre=0.6 air=1.2 hold=1.5 mood=intrigue pace=slow stress="…"}`
- `mood`: neutral · intrigue · concern · relief · confident · warm · excited (or any short English adjective pair). Change mood at least at every act; ≥ 3 moods per film.
- `pace`: slow · fast. Slow for the hook and the closing line.
- `hold`: a mute beat (picture + music only) after a key moment — 1–2 per film.
- `air` ≥ 1.2 s after every climax (the key number, the turn); `pre` ≥ 1 s before the closing line.

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
