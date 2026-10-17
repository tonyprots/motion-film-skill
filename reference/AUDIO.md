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

**Voice marks** (`layout_vo.py`, in beats): `sc<N>` scene start, `<id>` phrase start, `<id>.<k>` k-th speech chunk by
pauses, `<id>.w<k>` k-th word of the line (`text`, k from 1), `<id>.end` phrase end, `done` end of the film. The word
order is in `vo.json` (`phrases[].words`, k = index + 1). Word marks follow the phrase's shift onto the half-beat: the
word's time in the take plus the phrase start on the grid.

**Where word timings come from.** `voice.py lines` and `voice.py check` transcribe every take to catch drift. When the
transcriber is ElevenLabs Scribe, the same answer carries the time of every word: `voice.py` writes
`audio/vo/<id>.words.json` at no extra cost, with no extra request (the take goes out lossless, as FLAC: an mp3 would shift
the words by its encoder delay). The line's words are matched to the heard ones; a word spelled differently (digits, a
`lexicon.json` term) shares the time between its neighbours by letter count. For takes that already exist and for your
own recordings: `voice.py check --check-with elevenlabs` — no new voice, the transcription costs cents. Other providers
(OpenAI, OpenRouter, SpeechKit) return no word timings: `layout_vo.py` then spreads the words over the speech chunks by
letter count and prints "ESTIMATED" — not enough for karaoke, a word may land 100–300 ms early or late. A words file older
than its take, or not matching the line's text, is ignored (printed as "stale"). A provider with
`transcribe_words(path, lang) → (text, words)` plugs in the same way as Scribe.

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
| `ace` | instrumental generated on this machine by ACE-Step 1.5 from `prompt`, `bpm`, `key`, `seed`; free, nothing leaves the machine. Same request → same track; a changed request regenerates | `beats.py audio/music.wav` |
| `none` | silent bed: voice + SFX only | nominal |

For `synth`, put a `dark` section under the voice (sparse, no motif), `drop` on each new chapter number, `build` before
the big turn, `outro` on the end card: a chord ringing to the end, no drums and no hit on its first beat. `drop` opens with the chord and the sub, no crash and no big kick. `accents` (crash and big kick) only on explicit request: a loud hit at the climax or the end is not a default. A `build` has no noise riser. Kinds and chord syntax: header of `scripts/music.py`.
**Your own music, locally: `ace` (ACE-Step 1.5).** One-time setup per machine:
`python3 scripts/providers/ace_step.py setup` → `$MOTION_FILM_HOME/ace-step/` (`src` is the repo at a pinned commit,
`venv` its own Python 3.11/3.12 with torch and mlx, `checkpoints` the weights). Weights are ~6.3 GB: turbo DiT 4.8, text
encoder 1.2, VAE 0.3. The 1.7B language model (another 3.8 GB) is not downloaded: an instrumental with a given BPM, key
and length does not need it. With the venv it takes about 12 GB of free space; below that `setup` stops and says how much
is missing. `ace_step.py status` shows what is installed and how big it is. The network is needed for `setup` only.

Run: `music_source.py ace` (or `"music": {"source": "ace", …}` in `timeline.json`). What it takes:
- `prompt` describes only the music: genre, instruments, mood, "instrumental, no vocals". Take mood and character from
  the film's brief and style guide, in words, without product or brand names. No `prompt` → calm default electronica;
- BPM: `--bpm`, else `music.bpm`, else `timeline.bpm`;
- key: `--key` or `music.key` (`"A minor"`, `"F# major"`); empty lets the model choose;
- `seed`: `--seed` or `music.seed`, default 0. The same `seed` and the same request give the same track;
- length: film duration + 4 s, 4/4.
The track lands in `audio/music_ace.wav`, the request next to it in `audio/music_ace.json`; then, like any finished track,
`music.wav` is cut to the film. A re-run with the same request reuses the track; a changed prompt, BPM, key or `seed`
generates a new one.

The model takes BPM and length as conditions, not guarantees, and does not hold section timings (neither does
ElevenLabs Music). So always run `beats.py audio/music.wav` afterwards and compare the measured BPM with the requested
one (`music_source.py` prints it). If a lift or a pause misses the arc, edit the track by bars: move pieces on the
beats of the measured grid, with short overlaps at the joins and a volume contour under the voice.

Licence: code and weights are MIT; the model card on Hugging Face explicitly allows commercial use of the generated
music and states training on licensed, royalty-free and synthetic data. The project README asks users to check the
originality of results and to disclose AI involvement.

For a measured track: if `beats.py` reports a max residual > 15 ms or a BPM off by 2×, fix the `bpm` hint and rerun; if
it still fails, delete `beats.json` and use the nominal grid at the track's BPM (that is what the first film did).

## 3. SFX
Write events in `scripts/sfx_layout.py` (template from init) against the voice marks, run it, then
`node scripts/sync.mjs && node scripts/sfx.mjs` → `audio/sfx.wav`. `sfx.mjs` reads `cues.json`, not `timeline.json`:
after any sound edit in the timeline run `sync.mjs` first, or the old sounds stay.

| type | use | timing |
|---|---|---|
| `pop` | something appears (word, pill, card) | on the landing beat |
| `click` | cursor press, tab, send | on the cue |
| `tick` | typing (`every: 0.25` over the window) | on the cue |
| `thump` | chapter number, stamp, CTA | on the landing beat |
| `shutter` | hard cut, barrier | on the cue |

Gains: primary 0.55–0.8, secondary 0.4–0.5, texture 0.3. Under a voice keep SFX sparse: never on top of a stressed word.

**No noise sweeps.** `whoosh` and `riser` are gone: a filtered-noise sweep is the harshest sound in the mix and reads as
a stock transition. A push, a wipe or a cut gets no sound of its own; if something lands, a `pop` or `thump` on the
landing. `sfx.mjs` stops with an error on these types, so an old `timeline.json` does not pass silently.

Real sounds instead of the synth: `.venv/bin/python scripts/sfx_fetch.py` once per machine (free key `FREESOUND_API_KEY`,
freesound.org/apiv2/apply) builds a library of CC0 Freesound sounds for the same five types, ~4 MB in `$MOTION_FILM_HOME/sfx`.
Picked by popularity plus measurement: a click is short and bright, a boom is low with a tail.
From then on `sfx.mjs` plays samples and the synth is the fallback: on first use the library is copied into the project's
`audio/sfx_lib/`, so a later re-fetch never changes a finished film. One sample per UI type (the product sounds like one
product); `thump` rotates through three. `timeline.json`: `"sfx_source": "synth"` for synth only,
`"sfx_pick": {"click": 171697}` to choose by id; per event `"src": "synth"` or `"sample": <id>`. What was used:
`audio/sfx_credits.json` (CC0 needs no credit). The Freesound API is free for non-commercial use, commercial use is
negotiated with UPF; the sounds are CC0 either way.

No key: `.venv/bin/python scripts/sfx_fetch.py --kenney` adds Kenney's CC0 packs (interface, impacts) to the same library
through the same per-type filters: on 2026-10-14, 51 of 83 sounds passed (`click` 43, `pop` 4, `tick` 3, `thump` 1). They
are appended, so the defaults of a built library do not change; without a Freesound library Kenney becomes the main one.
Kenney's shutters do not measure like ours: that type stays Freesound or synth.

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

**Sound against the picture, by event kind.** An `sfx` event's `"visual"` says what the frame does on it: `cut` (a hard
frame change, ±1 frame, whole frame), `move` (a speed peak, ±0.1 s), `appear` (a local jump, ±1 frame), `land` (motion
settles, ±0.07 s). `move`, `appear` and `land` read the 8×4 tile that moves most near the cue: over the whole frame a small
element drowns in the card's drift. A miss on `cut`, `move` or `appear` is a WARN `picture`; `land` goes to `metrics.json`
(`sync.picture`) as a pointer only: a spring with overshoot over a drift has no clean stop (on the demo 13 of 14 landings read
80–200 ms off while the strips showed them on the beat). No `visual` at all: NOT CHECKED. After `qa.py` in
Bodila51/opus-sound-layer.

**Every sound is audible.** After the master, `mix.py` checks each hit against everything under it (music and voice as they
reach the sum): in one of its own bands (one carrying ≥ 10 % of its energy) it must rise ≥ 1.5 dB over the bed within
−30…+250 ms. Below that, a WARNING with the band and a fix: louder, a brighter sample, or into a pause.
