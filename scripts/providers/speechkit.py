"""Yandex SpeechKit (Yandex Cloud): voice via TTS API v3, voice check via STT API v1 (sync recognition).
Access, first that works: YANDEX_CLOUD_API_KEY (service-account API key, or a file named by YANDEX_CLOUD_API_KEY_FILE)
→ the yc CLI profile already on the machine (`yc iam create-token`, folder from YANDEX_CLOUD_FOLDER_ID, the profile, or
the only folder across the account's clouds). Nothing to set up when `yc` works. Roles: ai.speechkit-tts.user, ai.speechkit-stt.user.
  voice   <name> or <name>:<role> — alena, filipp, ermil, jane, madirus, omazh, zahar, dasha, julia, lera, masha, marina,
          alexander, kirill, anton …; roles (per voice): neutral, good, strict, friendly, evil, whisper
  direction  free-text direction is not supported: pace words map to speed, the rest is dropped (nothing is read aloud)
  stress  put + before the stressed vowel in the script text («з+амок»); SpeechKit reads it as stress
  check   SpeechKit STT (general model), lines up to 30 s
  music   none
The script text goes to Yandex Cloud (a public cloud): not for material that must stay inside the company."""
import base64, json, os, shutil, subprocess, sys, tempfile, urllib.parse
from . import key, has_key, settings
from ._http import post

NAME, KEY_ENV = 'SpeechKit', 'YANDEX_CLOUD_API_KEY'
DEFAULT_MODEL, DEFAULT_VOICE = None, 'alena'
VOICE_HINT = ('alena, filipp, ermil, jane, madirus, omazh, zahar, dasha, julia, lera, masha, marina, alexander, kirill, '
              'anton; role after a colon: alena:good, kirill:strict, marina:whisper …')
TTS_URL = 'https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis'
STT_URL = 'https://stt.api.cloud.yandex.net/speech/v1/stt:recognize'
LANGS = {'ru': 'ru-RU', 'en': 'en-US', 'de': 'de-DE', 'kk': 'kk-KZ', 'uz': 'uz-UZ'}


def _yc(*args):
    exe = shutil.which('yc') or os.path.expanduser('~/yandex-cloud/bin/yc')
    if not os.path.exists(exe): return ''
    err = ''
    for _ in range(3):   # yc fails now and then on a loaded machine; the error text never holds the token
        try:
            r = subprocess.run([exe, *args], capture_output=True, text=True, timeout=120,
                               env={**os.environ, 'YC_CLI_INITIALIZATION_SILENCE': 'true'})
        except subprocess.TimeoutExpired:
            err = 'timeout'; continue
        if r.returncode == 0: return r.stdout.strip()
        err = r.stderr.strip()[-300:]
    if args[:1] != ('config',): print(f'yc {" ".join(args[:3])}: {err}', file=sys.stderr)
    return ''


def _folder():
    """Folder id: YANDEX_CLOUD_FOLDER_ID → "speechkit": {"folder": <name or id>} in defaults(.local).json →
    the yc profile → the only folder across the account's clouds."""
    want = os.environ.get('YANDEX_CLOUD_FOLDER_ID') or (settings('speechkit').get('folder') or '')
    if not want: want = _yc('config', 'get', 'folder-id')
    if want.startswith('b1g'): return want   # already an id
    clouds = [c['id'] for c in json.loads(_yc('resource-manager', 'cloud', 'list', '--format', 'json') or '[]')]
    fl = [x for c in clouds for x in json.loads(_yc('resource-manager', 'folder', 'list', '--cloud-id', c, '--format', 'json') or '[]')]
    hit = [x for x in fl if x['name'] == want] if want else fl
    if len(hit) == 1: return hit[0]['id']
    names = ', '.join(x['name'] for x in fl) or 'none found'
    raise SystemExit(f'Yandex Cloud folder {"«" + want + "» " if want else ""}is ambiguous or missing (folders: {names}): '
                     'set "speechkit": {"folder": "<name>"} in <skill>/defaults.local.json or YANDEX_CLOUD_FOLDER_ID')


_H = {}


def available():
    """For provider "auto": an API key in the environment, or a yc CLI profile on this machine (checked, not used)."""
    return has_key(KEY_ENV) or bool(_yc('config', 'profile', 'list'))


def _headers():
    """API key from the environment if set; otherwise the yc CLI profile (an IAM token, never printed or stored)."""
    if _H: return _H
    if has_key(KEY_ENV):
        k = key(KEY_ENV)
        _H.update({'Authorization': 'Bearer ' + k, 'x-folder-id': _folder()} if k.startswith('t1.') else {'Authorization': 'Api-Key ' + k})
    else:
        t = _yc('iam', 'create-token')
        if not t: raise SystemExit(f'no {KEY_ENV} and no working yc profile (`yc init`): see reference/PROVIDERS.md')
        _H.update({'Authorization': 'Bearer ' + t, 'x-folder-id': _folder()})
    return _H


def _hint(code):
    return {401: 'key rejected', 403: 'the service account lacks ai.speechkit-tts.user / ai.speechkit-stt.user',
            400: 'unknown voice or role for this voice?'}.get(code, '')


def _speed(direction):
    d = (direction or '').lower()
    return '0.9' if 'slow' in d else '1.1' if 'faster' in d or 'energetic' in d else '1.0'


def tts(text, voice, model=None, direction='', lang=None):
    name, _, role = (voice or DEFAULT_VOICE).partition(':')
    hints = [{'voice': name}, {'speed': _speed(direction)}] + ([{'role': role}] if role else [])
    body = {'text': text, 'hints': hints, 'unsafeMode': True, 'loudnessNormalizationType': 'LUFS',
            'outputAudioSpec': {'rawAudio': {'audioEncoding': 'LINEAR16_PCM', 'sampleRateHertz': 24000}}}
    raw, buf = post(TTS_URL, _headers(), body, timeout=180, name=NAME, hint=_hint).read().decode(), bytearray()
    # the reply is a stream of JSON objects, one per chunk: {"result": {"audioChunk": {"data": <base64>}, …}}
    dec, i = json.JSONDecoder(), 0
    while i < len(raw):
        while i < len(raw) and raw[i] in ' \r\n\t,': i += 1
        if i >= len(raw): break
        obj, i = dec.raw_decode(raw, i)
        data = ((obj.get('result') or obj).get('audioChunk') or {}).get('data')
        if data: buf += base64.b64decode(data)
    return bytes(buf)


def transcribe(path, lang=None):
    with tempfile.NamedTemporaryFile(suffix='.ogg') as tmp:   # sync STT takes oggopus or lpcm, up to 30 s / 1 MB
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', path, '-ac', '1', '-c:a', 'libopus', '-b:a', '32k', tmp.name], check=True)
        audio = open(tmp.name, 'rb').read()
    h = _headers()
    q = {'lang': LANGS.get(lang or 'ru', lang or 'ru-RU'), 'format': 'oggopus', 'topic': 'general'}
    if 'x-folder-id' in h: q['folderId'] = h['x-folder-id']   # STT v1 wants the folder in the query, not the header
    resp = post(f'{STT_URL}?{urllib.parse.urlencode(q)}', h, form=(audio, 'application/octet-stream'), timeout=120, name=NAME, hint=_hint)
    return json.load(resp).get('result', '').strip()
