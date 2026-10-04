"""Pluggable audio providers for motion-film: voice (TTS), transcription (voice check) and music.

A provider is a module in this package that defines any of:
  NAME, KEY_ENV                         display name and the env var holding its key (checked, never printed)
  tts(text, voice, model=None, direction='', lang=None) -> bytes   raw PCM s16le, 24 kHz, mono
  transcribe(path, lang=None) -> str                               verbatim text of an audio file
  music(prompt, seconds, model=None) -> (bytes, ext)               an instrumental track ('mp3' or 'wav')
  voices(lang=None) -> list[dict]                                  optional: voice catalogue for picking
  DEFAULT_VOICE, DEFAULT_MODEL, VOICE_HINT                         optional defaults

Built in: elevenlabs, openrouter, openai. "auto" (the default) picks the first of them whose key is set. Anything else (a corporate proxy, a local engine) is one more file here;
see reference/PROVIDERS.md. A provider missing from this copy of the skill fails with a clear message.

Settings resolve in this order: command-line flags → the project's timeline.json ("voiceover", "music") →
<skill>/defaults.local.json (personal, never published) → <skill>/defaults.json.
"""
import importlib, json, os, sys

_here = os.path.dirname(os.path.abspath(__file__))
# in the skill: <skill>/scripts/providers; in a project copy: .skill (written by init.sh) points back at the skill
SKILL = open(os.path.join(_here, '.skill')).read().strip() if os.path.exists(os.path.join(_here, '.skill')) else os.path.dirname(os.path.dirname(_here))


def load(name):
    if not name or name in ('none', 'file', 'synth'):
        raise SystemExit(f'"{name}" is not an API provider')
    try:
        return importlib.import_module(f'providers.{name}')
    except ModuleNotFoundError as e:
        if e.name == f'providers.{name}':
            have = sorted(f[:-3] for f in os.listdir(os.path.dirname(__file__)) if f.endswith('.py') and not f.startswith('_'))
            raise SystemExit(f'provider "{name}" is not in this copy of the skill (available: {", ".join(have)})')
        raise


AUTO_ORDER = ('elevenlabs', 'openrouter', 'openai')


def resolve(name, fn='tts'):
    """"auto" → the first provider whose key is in the environment and that has fn(); anything else as is."""
    if name != 'auto': return name
    here = os.path.dirname(__file__)
    rest = sorted(f[:-3] for f in os.listdir(here) if f.endswith('.py') and not f.startswith('_') and f[:-3] not in AUTO_ORDER)
    for n in (*AUTO_ORDER, *rest):
        try: m = importlib.import_module(f'providers.{n}')
        except ModuleNotFoundError: continue
        if hasattr(m, fn) and has_key(getattr(m, 'KEY_ENV', None)):
            print(f'provider auto → {n} ({m.KEY_ENV} found)', file=sys.stderr); return n
    raise SystemExit('provider "auto": no key found (ELEVENLABS_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY …). '
                     'Set one, or pass --provider / timeline.json "voiceover.provider" (reference/PROVIDERS.md)')


def need(mod, fn):
    if not hasattr(mod, fn):
        raise SystemExit(f'provider {mod.NAME} has no {fn}(): pick another one for this step (reference/PROVIDERS.md)')
    return getattr(mod, fn)


def defaults():
    out = {}
    for f in ('defaults.json', 'defaults.local.json'):
        p = os.path.join(SKILL, f)
        if os.path.exists(p):
            for k, v in json.load(open(p, encoding='utf-8')).items():
                if isinstance(v, dict) and isinstance(out.get(k), dict): out[k] = {**out[k], **v}
                elif not k.startswith('_'): out[k] = v
    return out


def settings(section, project='.'):
    """Merged settings for "voiceover" / "transcribe" / "music": defaults, then the project's timeline.json."""
    s = dict(defaults().get(section) or {})
    tl = os.path.join(project, 'timeline.json')
    if os.path.exists(tl):
        v = json.load(open(tl, encoding='utf-8')).get(section)
        if isinstance(v, dict): s.update({k: x for k, x in v.items() if x not in (None, '')})
    return s


def _keyfile(env):
    # <ENV>_FILE, plus voice-film's spelling (OPENROUTER_KEY_FILE for OPENROUTER_API_KEY)
    for f in (env + '_FILE', env.replace('_API_KEY', '_KEY_FILE').replace('_TOKEN', '_TOKEN_FILE')):
        if os.environ.get(f): return os.environ[f]


def has_key(env):
    return bool(env and (os.environ.get(env) or _keyfile(env)))


def key(env, hint=''):
    """The secret from the environment (or a file named by <ENV>_FILE). Never printed, never written anywhere."""
    k = os.environ.get(env)
    if not k and _keyfile(env):
        k = open(_keyfile(env)).read().strip()
    if not k:
        raise SystemExit(f'{env} is not set in the environment of this command{": " + hint if hint else ""}')
    return k
