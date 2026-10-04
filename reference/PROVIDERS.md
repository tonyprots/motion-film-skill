# Providers: voice, voice check, music

Every API call for audio goes through `scripts/providers/<name>.py`. The pipeline never names a vendor; it asks for
`tts()`, `transcribe()` or `music()` and the configured provider answers.

| provider | voice | check (transcribe) | music | key (env) |
|---|---|---|---|---|
| `elevenlabs` | eleven_v4, any voice_id (own, cloned, shared library) | scribe_v2 | music (plan-dependent) | `ELEVENLABS_API_KEY` |
| `openrouter` | Gemini TTS, gpt-audio | Gemini with audio input | Lyria | `OPENROUTER_API_KEY` (+ `OPENROUTER_API_BASE`) |
| `openai` | gpt-4o-mini-tts, gpt-audio | gpt-4o-transcribe | — | `OPENAI_API_KEY` (+ `OPENAI_API_BASE` for compatible servers) |
| `file` | your own recordings in `audio/vo/<id>.wav` | via any provider above | your track (`music.source: file`) | — |
| `synth` | — | — | original score in code | — |

Keys are read from the environment (or a file named by `<ENV>_FILE`), never printed, never written into a project.
A provider whose module is absent from this copy of the skill fails with the list of what is available.

`"provider": "auto"` (the default) takes the first of elevenlabs → openrouter → openai whose key is set; the key may
also sit in a file named by `<ENV>_FILE` (or `OPENROUTER_KEY_FILE`, as in voice-film).

## Where settings come from (first match wins)
1. Command-line flags (`voice.py --provider openrouter --voice Charon`).
2. The project's `timeline.json`: `"voiceover": {provider, voice, model, lang, style}`, `"transcribe": {provider}`,
   `"music": {source, prompt, path, start, bpm, model}`. A preset writes these at init.
3. `<skill>/defaults.local.json` — personal defaults, never published.
4. `<skill>/defaults.json` — public defaults.

## Adding a provider
Create `scripts/providers/<name>.py` with `NAME`, `KEY_ENV` and any of:
```python
def tts(text, voice, model=None, direction='', lang=None) -> bytes   # raw PCM s16le, 24 kHz, mono
def transcribe(path, lang=None) -> str                               # verbatim text
def music(prompt, seconds, model=None) -> tuple[bytes, str]          # (audio bytes, 'mp3' | 'wav')
def voices(lang=None) -> list[dict]                                  # optional: [{id, name, gender, accent, about}]
DEFAULT_MODEL, DEFAULT_VOICE, VOICE_HINT                             # optional
```
Use `providers._http.post()` (retries on 429/5xx) and `providers.key(KEY_ENV)`. A server with the OpenAI audio API can
reuse `openai.speech / chat_audio / transcription` with its own base URL and auth header (copy `openrouter.py` as a template).
Then: `voice.py samples "<a line>" --provider <name> --voices <v>` and `voice.py check --check-with <name>`.

## What leaves the machine
The script text goes to the voice provider and to the checking provider; generated music prompts go to the music
provider. Before the first paid or external call, tell the user which provider gets what. Work material that must not
leave the company goes only through a company gateway (a private provider module), or is voiced from own recordings.
