#!/usr/bin/env python3
"""ACE-Step 1.5: local music generation (github.com/ace-step/ACE-Step-1.5, MIT). Nothing leaves the machine:
the prompt, the BPM and the track stay here, so this source is allowed for work films that must not go to an outside API.

Lives outside the skill, in its own venv, so the skill's toolchain stays light:
  $MOTION_FILM_HOME/ace-step/src           the repo, pinned to COMMIT
  $MOTION_FILM_HOME/ace-step/venv          Python 3.11/3.12 + its requirements (torch, mlx, transformers, …)
  $MOTION_FILM_HOME/ace-step/checkpoints   weights: turbo DiT + VAE + text encoder (~6.3 GB). The 1.7B "thinking" LM
                                           (+3.8 GB) is skipped: instrumental music with explicit BPM/key/length needs no LM.

  python3 scripts/providers/ace_step.py setup [--yes]   clone + venv + weights; idempotent; refuses below NEED_GB free
  python3 scripts/providers/ace_step.py status          what is installed, size on disk
  music_source.py ace                                  generate (music.source "ace" in timeline.json)

The model takes BPM, key, time signature and length as conditions, not as a guarantee: beats.py measures the grid of
the result like any finished track (reference/AUDIO.md §2)."""
import json, os, shutil, subprocess, sys, tempfile, time

NAME = 'ACE-Step 1.5 (local)'
KEY_ENV = None
LOCAL = True                     # music_source.py: free and deterministic by seed → regenerate when the request changes
REPO = 'https://github.com/ace-step/ACE-Step-1.5'
COMMIT = 'ca1e85fe9430179831e6bc6be790c332190a3866'      # 2026-08-29, the version read and set up for this skill
HF_REPO = 'ACE-Step/Ace-Step1.5'
DEFAULT_MODEL = 'acestep-v15-turbo'
PARTS = ['acestep-v15-turbo', 'vae', 'Qwen3-Embedding-0.6B']   # the main repo minus the LM
NEED_GB = 12                     # weights 6.3 + venv ~3 + headroom for swap and the run itself

HOME = os.environ.get('MOTION_FILM_HOME') or os.path.expanduser('~/.cache/motion-film')
ACE = os.path.join(HOME, 'ace-step')
SRC, VENV, CKPT = (os.path.join(ACE, x) for x in ('src', 'venv', 'checkpoints'))
PY = os.path.join(VENV, 'bin', 'python')


def _weights_ok():
    return all(os.path.isdir(os.path.join(CKPT, p)) and any(f.endswith(('.safetensors', '.bin', '.pt'))
               for f in os.listdir(os.path.join(CKPT, p))) for p in PARTS)


def available():
    return os.path.exists(PY) and os.path.isdir(SRC) and _weights_ok()


def _du(p):
    if not os.path.exists(p): return 0
    r = subprocess.run(['du', '-sk', p], capture_output=True, text=True)
    return int(r.stdout.split()[0]) * 1024 if r.returncode == 0 else 0


def _free_gb(p):
    while not os.path.exists(p): p = os.path.dirname(p)
    return shutil.disk_usage(p).free / 1e9


def status():
    for n, p in (('src', SRC), ('venv', VENV), ('checkpoints', CKPT)):
        print(f'{n:<12} {_du(p) / 1e9:6.2f} GB  {p}' if os.path.exists(p) else f'{n:<12}   —      {p}')
    print(f'total        {_du(ACE) / 1e9:6.2f} GB; free on disk {_free_gb(ACE):.1f} GB; ready: {available()}')


def _python():
    for c in ('python3.12', 'python3.11'):
        p = shutil.which(c)
        if p: return p
    sys.exit('ACE-Step needs Python 3.11 or 3.12 (brew install python@3.11); not found on PATH')


def _run(*a, **kw):
    print('$', ' '.join(a), flush=True)
    subprocess.run(a, check=True, **kw)


def setup(yes=False):
    """Clone (pinned), venv, weights. Each step is skipped when already done."""
    have, free = _du(ACE) / 1e9, _free_gb(ACE)   # what is already here needs no space again
    if not available() and free + have < NEED_GB and not yes:
        sys.exit(f'STOP: {free:.1f} GB free (+{have:.1f} GB already in {ACE}), ACE-Step needs ~{NEED_GB} GB '
                 '(weights 6.3 + venv ~3 + headroom). Free space first, or --yes to try anyway.')
    os.makedirs(ACE, exist_ok=True)
    if not os.path.isdir(os.path.join(SRC, '.git')):
        _run('git', 'clone', '--filter=blob:none', REPO, SRC)
    head = subprocess.run(['git', '-C', SRC, 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
    if head != COMMIT:
        _run('git', '-C', SRC, 'fetch', '--quiet', 'origin', COMMIT)
        _run('git', '-C', SRC, 'checkout', '--quiet', COMMIT)
    if not os.path.exists(PY):
        _run(_python(), '-m', 'venv', VENV)
    if subprocess.run([PY, '-c', 'import torch, transformers, diffusers, mlx, soundfile, loguru'], capture_output=True).returncode:
        _run(PY, '-m', 'pip', 'install', '--quiet', '--upgrade', 'pip')
        # the repo's own requirements (torch for macOS arm64, mlx, transformers …); CUDA-only lines are skipped by markers
        _run(PY, '-m', 'pip', 'install', '--quiet', '-r', os.path.join(SRC, 'requirements.txt'), 'huggingface_hub', cwd=SRC)
    if not _weights_ok():
        os.makedirs(CKPT, exist_ok=True)
        _run(PY, '-c', 'import sys; from huggingface_hub import snapshot_download as d; '
                       'd(repo_id=sys.argv[1], local_dir=sys.argv[2], allow_patterns=[p + "/*" for p in sys.argv[3:]])',
             HF_REPO, CKPT, *PARTS)
    status()


# Runs inside the ACE-Step venv. Writes one WAV, prints a JSON line with the path and timings.
RUNNER = r'''
import json, os, sys, time
c = json.load(open(sys.argv[1]))
sys.path.insert(0, c["src"]); os.chdir(c["src"])
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ["ACESTEP_CHECKPOINTS_DIR"] = c["ckpt"]
import acestep.model_downloader as md                       # no LM here: do not let the presence check fetch 3.8 GB
md.MAIN_MODEL_COMPONENTS[:] = [x for x in md.MAIN_MODEL_COMPONENTS if not x.startswith("acestep-5Hz-lm")]
from acestep.handler import AceStepHandler
from acestep.llm_inference import LLMHandler
from acestep.inference import GenerationParams, GenerationConfig, generate_music
t0 = time.time()
h = AceStepHandler()
msg, ok = h.initialize_service(project_root=c["src"], config_path=c["model"], device="auto")
if not ok: sys.exit("ACE-Step init failed: " + str(msg)[-800:])
t1 = time.time()
p = GenerationParams(caption=c["prompt"], lyrics="[Instrumental]", instrumental=True, bpm=c["bpm"], keyscale=c["key"],
                     timesignature=c["timesig"], duration=c["seconds"], seed=c["seed"], inference_steps=8, shift=3.0,
                     thinking=False, use_cot_metas=False, use_cot_caption=False, use_cot_language=False)
g = GenerationConfig(batch_size=1, use_random_seed=False, seeds=[c["seed"]], audio_format="wav")
r = generate_music(h, LLMHandler(), p, g, save_dir=c["out"])
if not r.success or not r.audios: sys.exit("ACE-Step generation failed: " + str(r.error or r.status_message)[-800:])
a = r.audios[0]
print("ACE_RESULT " + json.dumps({"path": a["path"], "key": a.get("key"), "load_s": round(t1 - t0, 1),
                                  "gen_s": round(time.time() - t1, 1), "device": str(h.device)}))
'''


def music(prompt, seconds, model=None, bpm=None, key=None, seed=None, timesig='4'):
    """(wav bytes, 'wav'). bpm/key/time signature go to the model as conditions; seed makes the run reproducible."""
    if not available():
        raise SystemExit(f'ACE-Step is not set up here: python3 scripts/providers/ace_step.py setup  (~{NEED_GB} GB free needed)')
    seconds = max(10.0, min(600.0, float(seconds)))
    with tempfile.TemporaryDirectory() as tmp:
        cfg = dict(src=SRC, ckpt=CKPT, model=model or DEFAULT_MODEL, prompt=prompt, seconds=seconds,
                   bpm=int(round(bpm)) if bpm else None, key=key or '', timesig=str(timesig or ''),
                   seed=int(seed if seed is not None else 0), out=tmp)
        cf = os.path.join(tmp, 'cfg.json'); json.dump(cfg, open(cf, 'w'))
        rf = os.path.join(tmp, 'run.py'); open(rf, 'w').write(RUNNER)
        t = time.time()
        r = subprocess.run([PY, rf, cf], capture_output=True, text=True, cwd=SRC)
        line = next((l for l in r.stdout.splitlines() if l.startswith('ACE_RESULT ')), None)
        if r.returncode or not line:
            raise SystemExit(f'ACE-Step failed (exit {r.returncode}):\n{(r.stderr or r.stdout)[-2000:]}')
        res = json.loads(line[len('ACE_RESULT '):])
        print(f'ACE-Step: {seconds:.0f} s of music in {time.time() - t:.0f} s wall (load {res["load_s"]} s, '
              f'generate {res["gen_s"]} s, {res["device"]}); seed {cfg["seed"]}, bpm {cfg["bpm"]}, key {cfg["key"] or "auto"}',
              file=sys.stderr)
        return open(res['path'], 'rb').read(), 'wav'


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'status'
    if cmd == 'setup': setup(yes='--yes' in sys.argv)
    elif cmd == 'status': status()
    else: sys.exit(__doc__)
