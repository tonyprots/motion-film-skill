# Audio: voice, grid, music, SFX, mix

All commands run from the project root. Python scripts run as `.venv/bin/python scripts/<x>.py` (init.sh links the
shared venv); `voice.py` and the providers need only the standard library.

## 1. Voice first: it sets the length and the grid
1. `SCRIPT.md` approved (STORY + `**Voice:** "…" {pre air hold mood pace stress}` lines; rules in STORY.md).
   `python3 scripts/script_lint.py SCRIPT.md` → errors fixed.
2. `python3 scripts/extract_lines.py SCRIPT.md .` → `audio/vo/lines.json` (ids s1a, s2a, s2b…, character count). If a
   `lexicon.json` sits next to the script, lines with terms get a `say` field, the pronunciation for the voice; `text` stays for the screen.
3. Pick the voice. `voice.py voices --lang ru` (catalogue), then `voice.py samples "<the tightest real line>" --voices a,b,c`
   and let the user listen. Keep one provider and one voice for the film. Skip if the preset/defaults already fix it.
4. `voice.py lines` → `audio/vo/<id>.wav`. Every take is transcribed and retried if it drifts (match < 0.93).
   A line's `mood`/`pace` reach the voice: in words (OpenAI, OpenRouter and others) or, for ElevenLabs v4, as `voice_settings`.
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

Real sounds instead of the synth: `.venv/bin/python scripts/sfx_fetch.py` once per machine (free key `FREESOUND_API_KEY`,
freesound.org/apiv2/apply) builds a library of CC0 Freesound sounds for the same seven types, ~4 MB in `$MOTION_FILM_HOME/sfx`.
Picked by popularity plus measurement: a click is short and bright, a boom is low with a tail, a riser peaks at its end.
From then on `sfx.mjs` plays samples and the synth is the fallback: on first use the library is copied into the project's
`audio/sfx_lib/`, so a later re-fetch never changes a finished film. One sample per UI type (the product sounds like one
product); `whoosh` and `thump` rotate through three. `timeline.json`: `"sfx_source": "synth"` for synth only,
`"sfx_pick": {"click": 171697}` to choose by id; per event `"src": "synth"` or `"sample": <id>`. What was used:
`audio/sfx_credits.json` (CC0 needs no credit). The Freesound API is free for non-commercial use, commercial use is
negotiated with UPF; the sounds are CC0 either way.

## 4. Mix and master
`.venv/bin/python scripts/mix.py` → `audio/mix.wav`: −14 LUFS integrated, true peak ≤ −1 dBTP, 48 kHz 24-bit; music ducks
under the voice. Levels in `timeline.mix` (dB). A WARNING means the limiter works too hard: lower SFX first.

Polish, all on by default, plain ffmpeg filters (switch any item off with `false` in `timeline.mix`):
- `voice_chain` — TTS into a studio voice: cut below 80 Hz, de-esser, −2 dB at 300 Hz (boxiness), +1.5 dB at 3 kHz (clarity),
  +1.5 dB of air above 10 kHz, 3:1 compressor;
- `room` (0.08) — share of a short dark room (RT60 ~0.3 s, convolution with a generated impulse) on voice and SFX: one space
  instead of a dry TTS over dry clicks;
- `room_tone` (−60) — a quiet pink floor under the whole film: silence is not digital zero;
- `pocket` — −3 dB around 2.5 kHz in the music while there is a voice: room for consonants;
- `glue` — a gentle bus compressor before the limiter (1.8:1).
On the demo: voice over the bed in the worst phrase 6.2 → 8.2 dB, loudness and true peak on target. Voice over the bed is
measured on the voice after the chain, as it sounds in the mix.

After mastering, `mix.py` measures the **voice over the bed** for every phrase: speech band 300–4000 Hz, only frames where the
voice sounds, the voice stem against everything else after ducking. ≥ 12 dB is fine, < 12 a warning, < 6 an error (exit 1): on a
phone speaker the words get lost. The threshold is calibrated on a demo film approved by ear (7–20 dB). It also reports **hits on
speech**: a hit inside a sounding phrase. More than half of them: move the hits into the pauses.

Then `python3 scripts/voice.py check-mix`: every phrase is cut out of the final `mix.wav` and transcribed; a match < 0.85 means the
phrase got lost in the mix. The text goes to the transcription provider, as with `voice.py lines`.
`render.mjs` muxes `audio/mix.wav`; after a remix use `node scripts/render.mjs --mux --all` instead of re-rendering.

## 5. Sync checks
`review.py` finds the audio onset of every hit in the MP4: a 150 Hz high-pass (sub-bass gives false onsets), 2.5 ms blocks,
a rise over the four previous ones. `audio_vs_cue` > one frame means that at this point the ear catches not the hit but a voice
syllable or a drum: the hit is masked or has no high-frequency click. A shift of the whole sound is checked separately: the
audio in the MP4 is cross-correlated with `audio/mix.wav`, a drift over one frame is a FAIL, remux. `audio.jpg` shows a spectrogram
with hit lines for the critic, who cannot hear.

`visual_minus_audio` measures the START of visual motion against the audio onset, so it
reads hits as early/late when the landing is right. Confirm hits on frame strips (`render.mjs --at` around the cue,
16.7 ms per frame at 60 fps): the object touches down on the cue frame ±1.
