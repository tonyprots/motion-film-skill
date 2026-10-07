# Style guide: <product> reel

Source material: `assets/site/info.json`, `assets/site/*.png`, reference `refs/<file>` (frames in `refs/frames/`).
Take the reference's GRAMMAR (rhythm, transitions, camera, how text behaves), never its content, mascot, copy or palette.

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
Constant micro push on holds (1.00 → 1.03–1.06), punch-ins on UI, perspective only where it adds depth.

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
