"""ElevenLabs: voice (TTS), transcription (Scribe) and music. Key: ELEVENLABS_API_KEY (your own account, you pay).

Voices are voice_ids: your own or cloned voices (GET /v2/voices) or the shared library (GET /v1/shared-voices).
pcm_24000 works on every plan; mp3 192k needs Creator+. eleven_v4 reads plain text: no direction tags.
Music (POST /v1/music) depends on the plan; force_instrumental keeps vocals out from under the voiceover."""
import json, os
from . import key
from ._http import post, get, multipart

NAME, KEY_ENV = 'ElevenLabs', 'ELEVENLABS_API_KEY'
BASE = os.environ.get('ELEVENLABS_API_BASE', 'https://api.elevenlabs.io').rstrip('/')
DEFAULT_MODEL = 'eleven_v4'
VOICE_HINT = 'a voice_id: `voice.py voices --provider elevenlabs --lang ru` lists the shared library'


def _h():
    return {'xi-api-key': key(KEY_ENV, 'put your ElevenLabs key there, e.g. in your shell profile')}


def _hint(code):
    return {401: 'key missing or wrong', 402: 'plan or quota: check the subscription', 403: 'this plan has no access to that model or feature'}.get(code, '')


def tts(text, voice, model=None, direction='', lang=None):
    body = {'text': text, 'model_id': model or DEFAULT_MODEL}
    if lang: body['language_code'] = lang
    return post(f'{BASE}/v1/text-to-speech/{voice}?output_format=pcm_24000', _h(), body, timeout=180, name=NAME, hint=_hint).read()


def transcribe(path, lang=None):
    fields = {'model_id': 'scribe_v2', 'tag_audio_events': 'false'}
    if lang: fields['language_code'] = lang
    form = multipart(fields, {'file': (os.path.basename(path), open(path, 'rb').read(), 'audio/mpeg' if path.endswith('.mp3') else 'audio/wav')})
    return json.load(post(f'{BASE}/v1/speech-to-text', _h(), form=form, timeout=180, name=NAME, hint=_hint))['text'].strip()


def music(prompt, seconds, model=None):
    body = {'prompt': prompt, 'music_length_ms': int(max(3, min(600, seconds)) * 1000), 'force_instrumental': True}
    if model: body['model_id'] = model
    return post(f'{BASE}/v1/music?output_format=mp3_44100_128', _h(), body, timeout=900, name=NAME, hint=_hint).read(), 'mp3'


def voices(lang=None):
    q = f'?page_size=40&sort=usage_character_count_1y' + (f'&language={lang}' if lang else '')
    out = [{'id': v['voice_id'], 'name': v.get('name', ''), 'gender': v.get('gender', ''), 'accent': v.get('accent', ''),
            'about': (v.get('description') or '')[:90]} for v in get(f'{BASE}/v1/shared-voices{q}', _h(), name=NAME).get('voices', [])]
    own = [{'id': v['voice_id'], 'name': v.get('name', '') + ' (own)', 'gender': '', 'accent': '', 'about': v.get('category', '')}
           for v in get(f'{BASE}/v2/voices?page_size=30', _h(), name=NAME).get('voices', []) if v.get('category') in ('cloned', 'generated', 'professional')]
    return own + out
