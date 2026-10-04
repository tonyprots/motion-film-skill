# Audio: voice, grid, music, SFX, mix

All commands run from the project root. Python scripts run as `.venv/bin/python scripts/<x>.py` (init.sh links the
shared venv); `voice.py` and the providers need only the standard library.

## 1. Voice first: it sets the length and the grid
1. `SCRIPT.md` approved (STORY + `**Voice:** "…" {pre air hold mood pace stress}` lines; rules in STORY.md).
   `python3 scripts/script_lint.py SCRIPT.md` → errors fixed.
2. `python3 scripts/extract_lines.py SCRIPT.md .` → `audio/vo/lines.json` (ids s1a, s2a, s2b…, character count).
3. Pick the voice. `voice.py voices --lang ru` (catalogue), then `voice.py samples "<the tightest real line>" --voices a,b,c`
   and let the user listen. Keep one provider and one voice for the film. Skip if the preset/defaults already fix it.
4. `voice.py lines` → `audio/vo/<id>.wav`. Every take is transcribed and retried if it drifts (match < 0.93).
   Own recordings instead: put them in `audio/vo/<id>.wav` and run `voice.py check --check-with <provider>`.
5. `layout_vo.py` → `vo.json` + timeline marks and duration; `vo.py` → `audio/vo.wav`; `node scripts/sync.mjs`.
6. Re-voice one line: `voice.py lines --only s4b`, then steps 5 again. Hand marks the film added survive a re-layout.

Numbers: the voice says words ("twelve hundred"), the screen shows digits ("1,200"). Write them as words in the
script if the engine misreads digits. Native pace: never `atempo` a whole take; per-phrase `tempo` 0.9–1.1 in
`vo.json` only to make one phrase fit.

## 2. Music
`.venv/bin/python scripts/music_source.py` reads `timeline.json` `music.source`:

| source | what happens | grid |
|---|---|---|
| `synth` (default) | `music.py` writes an original score from `bpm`, `chords`, `sections`, `accents` | nominal, exact — no `beats.py` |
| `file` | your track (`path`, `start`, `bpm`): cut, looped with crossfades if short, faded out | `beats.py audio/music.wav` |
| `elevenlabs` / `openrouter` | generated instrumental from `prompt` (credits!) — reused on re-runs unless `--force` | `beats.py audio/music.wav` |
| `none` | silent bed: voice + SFX only | nominal |

For `synth`, put a `dark` section under the voice (sparse, no motif), `drop` on each new chapter number, `build` before
the big turn, `outro` on the end card. Kinds and chord syntax: header of `scripts/music.py`.
For a measured track: if `beats.py` reports a max residual > 15 ms or a BPM off by 2×, fix the `bpm` hint and rerun; if
it still fails, delete `beats.json` and use the nominal grid at the track's BPM (that is what the first film did).

## 3. SFX
Write events in `scripts/sfx_layout.py` (template from init) against the voice marks, run it, then
`node scripts/sync.mjs && node scripts/sfx.mjs` → `audio/sfx.wav`.

| type | use | timing |
|---|---|---|
| `pop` | something appears (word, pill, card) | on the landing beat |
| `click` | cursor press, tab, send | on the cue |
| `tick` | typing (`every: 0.25` over the window) | on the cue |
| `whoosh` | push, wipe, morph | builds 0.3 s, peaks on the cue → cue ~0.6 beat before the cut |
| `riser` | build into a drop | builds 2 s, peaks on the cue |
| `thump` | chapter number, stamp, CTA | on the landing beat |
| `shutter` | hard cut, barrier | on the cue |

Gains: primary 0.55–0.8, secondary 0.4–0.5, texture 0.3. Under a voice keep SFX sparse: never on top of a stressed word.

## 4. Mix and master
`.venv/bin/python scripts/mix.py` → `audio/mix.wav`: −14 LUFS integrated, true peak ≤ −1 dBTP, 48 kHz 24-bit; music ducks
under the voice. Levels in `timeline.mix` (dB). A WARNING means the limiter works too hard: lower SFX first.
`render.mjs` muxes `audio/mix.wav`; after a remix use `node scripts/render.mjs --mux --all` instead of re-rendering.

## 5. Sync checks
`review.py` writes per-cue `metrics.sync`, but it measures the START of visual motion against the audio onset, so it
reads hits as early/late when the landing is right. Confirm hits on frame strips (`render.mjs --at` around the cue,
16.7 ms per frame at 60 fps): the object touches down on the cue frame ±1.
