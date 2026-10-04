"""OpenRouter: one key for many models. Key: OPENROUTER_API_KEY. OPENROUTER_API_BASE: your own egress with the same API
(OpenRouter answers 403 from some regions).
  voice   google/gemini-3.8-flash-tts (default; /audio/speech, direction as a short [tag]; voices Kore, Aoede, Charon, Orus…)
          openai/gpt-audio (chat with audio output; voices marin, cedar, ash, coral, sage, verse…)
  check   google/gemini-3.8-flash with audio input
  music   google/lyria-3-pro-preview (~2.5–3 min) or lyria-3-clip-preview (short). Lyria refuses prompts that mention
          AI, video, a product or a brand: describe only the music."""
import base64, json, os, subprocess, tempfile
from . import key
from ._http import post, sse
from .openai import chat_audio

NAME, KEY_ENV = 'OpenRouter', 'OPENROUTER_API_KEY'
DEFAULT_MODEL, DEFAULT_VOICE = 'google/gemini-3.8-flash-tts', 'Charon'
VOICE_HINT = 'Gemini: Kore, Aoede (female), Charon, Orus (male) …; openai/gpt-audio: marin, cedar, ash, coral'
CHECK_MODEL, MUSIC_MODEL = 'google/gemini-3.8-flash', 'google/lyria-3-pro-preview'


def _cfg():
    return os.environ.get('OPENROUTER_API_BASE', 'https://openrouter.ai/api/v1').rstrip('/'), {'Authorization': 'Bearer ' + key(KEY_ENV)}


def _hint(code):
    return '403 can mean the region is blocked: another network or OPENROUTER_API_BASE' if code == 403 else ''


def tts(text, voice, model=None, direction='', lang=None):
    base, h = _cfg(); model = model or DEFAULT_MODEL
    if 'tts' in model:   # Gemini follows a short bracketed tag and does not read it aloud; a sentence prefix IS read aloud
        tag = f'[{direction}] ' if direction and len(direction) < 60 else ''
        return post(f'{base}/audio/speech', h, {'model': model, 'input': tag + text, 'voice': voice, 'response_format': 'pcm'},
                    timeout=180, name=NAME, hint=_hint).read()
    return chat_audio(base, h, NAME, text, voice, model, direction)


def transcribe(path, lang=None):
    base, h = _cfg()
    with tempfile.NamedTemporaryFile(suffix='.mp3') as tmp:
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', path, '-b:a', '64k', tmp.name], check=True)
        b = base64.b64encode(open(tmp.name, 'rb').read()).decode()
    body = {'model': CHECK_MODEL, 'messages': [{'role': 'user', 'content': [
        {'type': 'text', 'text': 'Transcribe this speech verbatim, in the language it is spoken. Return only the text; write numbers as words, exactly as pronounced.'},
        {'type': 'input_audio', 'input_audio': {'data': b, 'format': 'mp3'}}]}]}
    return json.load(post(f'{base}/chat/completions', h, body, timeout=180, name=NAME, hint=_hint))['choices'][0]['message']['content'].strip()


def music(prompt, seconds, model=None):
    base, h = _cfg()
    body = {'model': model or MUSIC_MODEL, 'stream': True, 'modalities': ['audio', 'text'], 'audio': {'format': 'mp3'},
            'messages': [{'role': 'user', 'content': prompt}]}
    buf = bytearray()
    for ch in sse(post(f'{base}/chat/completions', h, body, timeout=900, name=NAME, hint=_hint)):
        if 'error' in ch:
            raise SystemExit(f"Lyria error: {ch['error']}" + ('  (describe only the music: genre, BPM, instruments, mood, "no vocals")'
                                                              if 'PROHIBITED' in str(ch['error']).upper() else ''))
        for c in ch.get('choices', []):
            au = (c.get('delta') or {}).get('audio') or {}
            if au.get('data'): buf += base64.b64decode(au['data'])
    return bytes(buf), 'mp3'
