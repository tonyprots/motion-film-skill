# Style guide: <product> reel

Source material: `assets/site/info.json`, `assets/site/*.png`, reference `refs/<file>` (frames in `refs/frames/`).
Take the reference's GRAMMAR (rhythm, transitions, camera, how text behaves), never its content, mascot, copy, numbers
or palette.

## 0. Reference films
| Reference | Scenes (frame-by-frame breakdown) | Take | Leave |
|---|---|---|---|
| `refs/<file>` or URL | 1. … 2. … | | |
One-line summary: what we take from all references and what we leave to them on purpose (e.g. "no white scenes", "no
borrowed numbers").

## 1. Palette (measured, not guessed)
| Token | Hex | Source |
|---|---|---|
| `--bg` | | site canvas |
| `--ink` | | site headline |
| `--ink-2` | | body copy |
| `--accent` | | logo / primary button — the ONE accent |
| `--card` | | |
If the reference is multi-accent, translate it into a tonal ramp of the one accent.

## 2. Type
- Display face: <family, weight, file in assets/fonts/>. Tracking, line-height, case, punctuation habit (full stop?).
- UI face: <family, weights>.
- Sizes at 1080p: hero ≥ 200 px, cards ≥ 110 px, nothing that must be read < 28 px (check at 360 px wide).
- Accent colour on the second phrase / key word only.

## 3. Rhythm (reference, measured)
Scene-cut times, bar length, BPM estimate, shot table (in–out, length, what happens). Extracted rules
(e.g. hard cuts on bar lines, inner events on beats/half-beats, nothing holds longer than 1 bar).

## 4. Transitions (allowed vocabulary)
e.g. hard cut on the bar · push-through · card rise · collapse-reveal · iris wipe · whip with overlap.
Never: crossfades, spins, glitches, light leaks.

## 5. Camera
Vocabulary and limits — RULES.md "The camera is punctuation". Here: this film's base move (on exposition, a hold or a slow
push to the detail), where accents are allowed (snap, punch, whip — only a reveal, a turn, the key number) and perspective
only where it adds depth.

## 6. Texture & finish
Grain or clean digital? Shadows and blur for depth, never glow.

## 7. Text in / out
Enter: rise through a mask / slam / type. Exit: lift through the mask / covered / pushed past camera. Never a fade.

## 8. Sound
Tempo, feel, which UI events get which SFX (see timeline.json sfx), VO voice if any.

## 9. Motion grammar
| Role | Preset / duration | Cascade | Overshoot |
|---|---|---|---|
| UI entrance | `default`, 250–450 ms | 30–80 ms, ≤ 8 per wave | no |
| Text | `heavy` | by word, ≤ 0.6 s per wave | no |
| Accents / pills | `snappy` | — | no |
| Hero moment | `heavy`, 600–900 ms | — | yes, once |
| Camera | `heavy`, push 0.3–0.5 s before the action, 1.4–2.5× | — | no |
Roles live in `timeline.json` `"motion"` (`enter`, `exit`, `text`, `accent`, `hero`, `camera`): change one, change the other.
Finish (`timeline.json` → `finish`): LUT <file or none>, grain <0 / 1.5–2.5>, `--master` <yes/no>.

## 10. Rules from notes
Every user or critic note that could recur becomes a line here (`notes.py resolve N --reply "…" --rule "…"`): date, time,
the rule, the verbatim reaction. The next round and the next issue of a series read this section before building.
