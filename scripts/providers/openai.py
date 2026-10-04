"""OpenAI (or any server with the same API): voice via /audio/speech, transcription via /audio/transcriptions.
Key: OPENAI_API_KEY. OPENAI_API_BASE points it at a compatible server or a proxy.
Voices: alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse (gpt-4o-mini-tts)."""
import json, os
from . import key
from ._http import post, multipart, sse
import base64

NAME, KEY_ENV = 'OpenAI', 'OPENAI_API_KEY'
DEFAULT_MODEL, DEFAULT_VOICE = 'gpt-4o-mini-tts', 'onyx'
VOICE_HINT = 'alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse'
TRANSCRIBE_MODEL = 'gpt-4o-transcribe'


def _cfg():
    return os.environ.get('OPENAI_API_BASE', 'https://api.openai.com/v1').rstrip('/'), {'Authorization': 'Bearer ' + key(KEY_ENV)}


# The functions below take (base, headers) so compatible gateways can reuse them with their own URL and auth.
def speech(base, h, name, text, voice, model, direction=''):
    body = {'model': model, 'input': text, 'voice': voice, 'response_format': 'pcm'}   # pcm = s16le 24 kHz mono
    if direction and 'tts' in model: body['instructions'] = direction
    return post(f'{base}/audio/speech', h, body, timeout=180, name=name).read()


def chat_audio(base, h, name, text, voice, model, direction=''):
    """Audio-output chat models (gpt-audio): livelier delivery, streamed pcm16."""
    sys_prompt = ('You are a narrator. Say exactly the text the user gives, word for word, nothing added. '
                  + (direction or 'Calm, confident voice, natural pauses.'))
    body = {'model': model, 'stream': True, 'modalities': ['text', 'audio'], 'audio': {'voice': voice, 'format': 'pcm16'},
            'messages': [{'role': 'system', 'content': sys_prompt}, {'role': 'user', 'content': text}]}
    buf = bytearray()
    for ch in sse(post(f'{base}/chat/completions', h, body, timeout=300, name=name)):
        for c in ch.get('choices', []):
            a = (c.get('delta') or {}).get('audio') or {}
            if a.get('data'): buf += base64.b64decode(a['data'])
    return bytes(buf)


def transcription(base, h, name, path, lang=None, model=TRANSCRIBE_MODEL):
    fields = {'model': model, 'prompt': 'Write numbers as words, exactly as pronounced.'}
    if lang: fields['language'] = lang
    form = multipart(fields, {'file': (os.path.basename(path), open(path, 'rb').read(), 'audio/mpeg' if path.endswith('.mp3') else 'audio/wav')})
    return json.load(post(f'{base}/audio/transcriptions', h, form=form, timeout=180, name=name))['text'].strip()


def tts(text, voice, model=None, direction='', lang=None):
    base, h = _cfg(); model = model or DEFAULT_MODEL
    return (chat_audio if 'audio' in model and 'tts' not in model else speech)(base, h, NAME, text, voice, model, direction)


def transcribe(path, lang=None):
    base, h = _cfg()
    return transcription(base, h, NAME, path, lang)
