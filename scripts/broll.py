#!/usr/bin/env python3
"""Opt-in generated bridges. Run in a film project: broll.py [--yes] [--only ID] [--fmt 9x16].
Dry-run captures clean boundary frames and estimates cost; --yes submits new jobs.
--max-cost USD caps estimated NEW charges (unknown estimates fail closed).
--force replaces completed/failed runs, never an active or ambiguous submission.
--resume-job ID attaches a verified provider job to an ambiguous submit; requires --only and --fmt.
Raw videos, requests and older outputs stay under assets/broll; timeline _out stays compatible.
"""
import argparse
import base64
import fcntl
from fractions import Fraction
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.request
import uuid

from PIL import Image

API = 'https://openrouter.ai/api/v1'
ASPECT = {'16x9': '16:9', '9x16': '9:16', '1x1': '1:1'}
SIZE = {'16x9': (1920, 1080), '9x16': (1080, 1920), '1x1': (1080, 1080)}
SUFFIX = " Cinematic, realistic motion, no text, no logos, no people's faces."
FAILED = {'failed', 'cancelled', 'expired'}
TERMINAL = {'ready'} | FAILED


def save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.writing')
    with tmp.open('w', encoding='utf-8') as out:
        json.dump(value, out, ensure_ascii=False, indent=2)
        out.flush()
        os.fsync(out.fileno())
    os.replace(tmp, path)


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def call(method, path, body=None, raw=False):
    headers = {'Content-Type': 'application/json'}
    if os.environ.get('OPENROUTER_API_KEY'):
        headers['Authorization'] = 'Bearer ' + os.environ['OPENROUTER_API_KEY']
    req = urllib.request.Request(API + path, method=method, headers=headers,
                                 data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req, timeout=300) as response:
        return response.read() if raw else json.load(response)


def price(model, seconds, resolution):
    skus = model.get('pricing_skus') or {}
    # Discovery has used both descriptive SKUs and per-video-second names.
    for key in (f'duration_seconds_without_audio_{resolution}', f'per-video-second-{resolution}',
                f'image_to_video_duration_seconds_{resolution}', 'duration_seconds_without_audio',
                'per-video-second', 'duration_seconds'):
        if key in skus:
            value = float(skus[key]) * seconds
            return value if math.isfinite(value) and value >= 0 else None
    if 'cents_per_second_output' in skus:
        value = float(skus['cents_per_second_output']) / 100 * seconds
        return value if math.isfinite(value) and value >= 0 else None
    return None


def validate(bridge, fmt, model=None):
    if not re.fullmatch(r'[A-Za-z0-9_-]+', bridge.get('id', '')):
        raise ValueError('broll id must use letters, digits, underscore or hyphen')
    if not isinstance(bridge.get('at'), str) or not bridge['at']:
        raise ValueError(f"{bridge['id']}: at must be a mark name")
    if not isinstance(bridge.get('prompt'), str) or not bridge['prompt'].strip():
        raise ValueError(f"{bridge['id']}: prompt is empty")
    seconds = bridge.get('seconds', 4)
    if isinstance(seconds, bool) or not isinstance(seconds, (int, float)) or not math.isfinite(seconds) or seconds <= 0 or int(seconds) != seconds:
        raise ValueError('seconds must be a positive whole number')
    resolution = bridge.get('resolution', '1080p')
    if fmt not in ASPECT:
        raise ValueError(f'unsupported film format: {fmt}')
    if model is None:
        return int(seconds), resolution
    for field, value in [('supported_durations', seconds), ('supported_resolutions', resolution),
                         ('supported_aspect_ratios', ASPECT[fmt])]:
        if not model.get(field) or value not in model[field]:
            raise ValueError(f"{model['id']}: {field} does not confirm {value!r}")
    if not {'first_frame', 'last_frame'} <= set(model.get('supported_frame_images') or []):
        raise ValueError(f"{model['id']}: discovery must confirm first_frame and last_frame")
    return int(seconds), resolution


def frame(fmt, at):
    result = subprocess.run(['node', 'scripts/render.mjs', '--at', str(at), '--fmt', fmt],
                            capture_output=True, text=True, env={**os.environ, 'MF_BROLL_CAPTURE': '1'})
    paths = [line.split('wrote ', 1)[1] for line in result.stdout.splitlines() if line.startswith('wrote ')]
    if result.returncode or not paths:
        raise RuntimeError(f'render.mjs --at {at} failed: {result.stderr[-800:]}')
    buf = io.BytesIO()
    with Image.open(paths[-1]) as image:
        image.convert('RGB').save(buf, 'JPEG', quality=92)
    return buf.getvalue()


def request(bridge, fmt, model, first, last):
    seconds, resolution = validate(bridge, fmt)
    body = {'model': model['id'], 'prompt': bridge['prompt'] + SUFFIX,
            'duration': seconds, 'resolution': resolution, 'aspect_ratio': ASPECT[fmt], 'generate_audio': False}
    if model.get('seed'):
        body['seed'] = bridge.get('seed', 7)
    # Hash the actual boundary images, not their file names or old output metadata.
    identity = {**body, 'frames': [digest(first), digest(last)]}
    fingerprint = digest(json.dumps(identity, sort_keys=True, separators=(',', ':')).encode())
    body['frame_images'] = [
        {'type': 'image_url', 'image_url': {'url': 'data:image/jpeg;base64,' + base64.b64encode(data).decode()},
         'frame_type': kind}
        for data, kind in [(first, 'first_frame'), (last, 'last_frame')]
    ]
    return body, fingerprint, identity


def current_run(stem):
    pointer = Path(f'assets/broll/{stem}.job.json')
    return Path(read(pointer)['manifest']) if pointer.exists() else None


def new_run(stem, identity, fingerprint, first, last):
    directory = Path('assets/broll/jobs') / stem / uuid.uuid4().hex
    directory.mkdir(parents=True)
    (directory / 'first.jpg').write_bytes(first)
    (directory / 'last.jpg').write_bytes(last)
    manifest = directory / 'manifest.json'
    save(manifest, {'fingerprint': fingerprint, 'request': identity, 'state': 'prepared'})
    save(f'assets/broll/{stem}.job.json', {'manifest': str(manifest)})
    return manifest


def classify(manifest, fingerprint, force=False):
    if manifest is None:
        return 'new'
    state = read(manifest)
    if state['fingerprint'] != fingerprint:
        if state['state'] not in TERMINAL | {'prepared'}:
            raise ValueError('request changed while a job is unresolved; resume the original request first')
        return 'new'
    if state['state'] == 'submit_unknown':
        return 'ambiguous'
    if state['state'] not in TERMINAL:
        return 'resume' if state.get('job') else 'new'
    return 'new' if force else ('cached' if state['state'] == 'ready' else 'failed')


def submit_or_resume(manifest, body, resume_job=None, transport=None, sleep=time.sleep):
    transport = transport or call
    state = read(manifest)
    if resume_job:
        if state['state'] != 'submit_unknown' or not re.fullmatch(r'[A-Za-z0-9_-]+', resume_job):
            raise ValueError('--resume-job requires an ambiguous submission and a valid provider job id')
        state.update(job=resume_job, state='queued')
        save(manifest, state)
    if state['state'] == 'submit_unknown':
        raise ValueError('submission outcome unknown; inspect the provider and use --only ID --fmt FORMAT --resume-job JOB; no new POST sent')
    if state['state'] in FAILED:
        raise ValueError(f"job {state.get('job')} is {state['state']}; --force explicitly starts another paid run")
    if not state.get('job'):
        state['state'] = 'submit_unknown'
        save(manifest, state)  # Persist BEFORE POST: a lost response must never trigger an automatic second charge.
        job = transport('POST', '/videos', body)
        if not isinstance(job.get('id'), str) or not re.fullmatch(r'[A-Za-z0-9_-]+', job['id']):
            raise ValueError('provider returned no valid job id; submission remains ambiguous')
        state.update(job=job['id'], state=job.get('status', 'queued'))
        save(manifest, state)  # Persist before polling, downloading, or printing.
    for attempt in range(120):
        if state['state'] in {'completed', 'ready'}:
            return state
        if state['state'] in FAILED:
            raise ValueError(f"job {state['job']} is {state['state']}")
        job = transport('GET', f"/videos/{state['job']}")
        state.update(state=job['status'], usage=job.get('usage'))
        save(manifest, state)
        if state['state'] not in {'completed'} | FAILED:
            sleep(10)
    if state['state'] == 'completed':
        return state
    raise RuntimeError(f"job {state['job']} is {state['state']}; run again to resume")


def archive_outputs(stem):
    paths = [Path(f'assets/broll/{stem}{suffix}') for suffix in ('', '.mp4', '.json')]
    existing = [path for path in paths if path.exists()]
    if existing:
        archive = Path('assets/broll/versions') / stem / uuid.uuid4().hex
        archive.mkdir(parents=True)
        for path in existing:
            shutil.move(str(path), archive / path.name)


def materialize(manifest, stem, fmt, seconds, transport=None):
    transport = transport or call
    state = read(manifest)
    directory = manifest.parent
    source = directory / 'source.mp4'
    if not source.exists():
        content = transport('GET', f"/videos/{state['job']}/content", raw=True)
        if not content:
            raise ValueError('provider returned an empty video')
        partial = directory / 'source.downloading'
        with partial.open('wb') as out:
            out.write(content)
            out.flush()
            os.fsync(out.fileno())
        os.replace(partial, source)
    result = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                             'stream=r_frame_rate', '-of', 'csv=p=0', str(source)],
                            capture_output=True, text=True, check=True)
    fps = float(Fraction(result.stdout.strip()))
    if not math.isfinite(fps) or fps <= 0:
        raise ValueError('video has invalid fps')
    # Keep partial extraction attempts too; no successful or expensive artifact is deleted.
    frames = directory / ('frames-' + uuid.uuid4().hex)
    frames.mkdir()
    width, height = SIZE[fmt]
    subprocess.run(['ffmpeg', '-v', 'error', '-i', str(source), '-vf',
                    f'scale={width}:{height}:force_original_aspect_ratio=increase:flags=lanczos,crop={width}:{height}',
                    '-q:v', '2', str(frames / '%04d.jpg')], check=True)
    count = len(list(frames.glob('*.jpg')))
    expected = int(seconds * fps)
    if count < expected:
        raise ValueError(f'video too short: {count} frames, expected at least {expected}')
    output = {'fps': fps, 'frames': expected}
    archive_outputs(stem)
    shutil.move(str(frames), f'assets/broll/{stem}')
    shutil.copyfile(source, f'assets/broll/{stem}.mp4')
    metadata = {**state['request'], 'job': state['job'], 'usage': state.get('usage'),
                'fingerprint': state['fingerprint'], 'fps': fps, 'frames': count}
    save(f'assets/broll/{stem}.json', metadata)
    state.update(state='ready', output=output)
    save(manifest, state)
    return output


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--yes', action='store_true')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--only')
    parser.add_argument('--fmt', choices=ASPECT)
    parser.add_argument('--max-cost', type=float)
    parser.add_argument('--resume-job')
    args = parser.parse_args(argv)
    if args.max_cost is not None and (not math.isfinite(args.max_cost) or args.max_cost < 0):
        raise ValueError('--max-cost must be finite and non-negative')
    if args.resume_job and not (args.only and args.fmt and args.yes):
        raise ValueError('--resume-job requires --only, --fmt and --yes')
    timeline = read('timeline.json')
    bridges = [b for b in timeline.get('broll', []) if not args.only or b['id'] == args.only]
    if not bridges:
        raise ValueError('no matching broll entries; bridges are opt-in')
    ids = [b['id'] for b in bridges]
    if len(ids) != len(set(ids)):
        raise ValueError('duplicate broll ids')
    models = None  # An already accepted job does not depend on the current discovery catalog.
    plan, total, unknown = [], 0.0, False
    for bridge in bridges:
        model_id = bridge.get('model', 'google/veo-3.1-fast')
        formats = timeline.get('formats', ['16x9'])
        if not isinstance(formats, list) or not formats or len(formats) != len(set(formats)):
            raise ValueError('timeline formats must be a non-empty list without duplicates')
        if args.fmt:
            if args.fmt not in formats:
                raise ValueError('--fmt is not present in timeline formats')
            formats = [args.fmt]
        for fmt in formats:
            seconds, resolution = validate(bridge, fmt)
            first, last = frame(fmt, bridge['at']), frame(fmt, f"{bridge['at']}+{seconds}")
            stem = f"{bridge['id']}_{fmt}"
            manifest = current_run(stem)
            # Reconstruct with the submitted seed behavior, so a delisting/catalog outage
            # cannot invalidate an otherwise identical request. Only a NEW POST needs discovery.
            saved = read(manifest)['request'] if manifest else {}
            body, fingerprint, identity = request(bridge, fmt, {'id': model_id, 'seed': 'seed' in saved}, first, last)
            action = classify(manifest, fingerprint, args.force)
            if action == 'new':
                if models is None:
                    models = {model['id']: model for model in call('GET', '/videos/models')['data']}
                if model_id not in models:
                    raise ValueError(f'unknown model {model_id}; no new job submitted')
                model = models[model_id]
                validate(bridge, fmt, model)
                body, fingerprint, identity = request(bridge, fmt, model, first, last)
            cost = price(model, seconds, resolution) if action == 'new' else 0.0
            if cost is None:
                unknown = True
            else:
                total += cost
            label = 'estimate unknown' if cost is None else f'new charge ~\u0024{cost:.2f}'
            print(f"{stem}: {action}; {label}")
            plan.append((bridge, fmt, seconds, stem, manifest, action, body, fingerprint, identity, first, last))
    print(f"estimated NEW charges: {'unknown; known subtotal ' if unknown else ''}\u0024{total:.2f}")
    if args.max_cost is not None and (unknown or total > args.max_cost):
        raise ValueError('--max-cost cannot cover unknown or excessive estimated new charges')
    if not args.yes:
        print('nothing submitted; run with --yes to execute this plan')
        return
    if not os.environ.get('OPENROUTER_API_KEY'):
        raise ValueError('OPENROUTER_API_KEY is not set')
    if args.resume_job and (len(plan) != 1 or plan[0][5] != 'ambiguous'):
        raise ValueError('--resume-job requires exactly one ambiguous submission')
    for item in plan:
        if item[5] == 'ambiguous' and not args.resume_job:
            raise ValueError(f'{item[3]}: submission outcome unknown; verify the provider job before --resume-job')
        if item[5] == 'failed':
            raise ValueError(f'{item[3]}: previous job failed/cancelled/expired; --force is required for a new charge')
    for bridge, fmt, seconds, stem, manifest, action, body, fingerprint, identity, first, last in plan:
        if action == 'new':
            manifest = new_run(stem, identity, fingerprint, first, last)
        if action != 'cached':
            submit_or_resume(manifest, body, args.resume_job)
            output = materialize(manifest, stem, fmt, seconds)
        else:
            output = read(manifest)['output']
            if not all(Path(f'assets/broll/{stem}/{index:04d}.jpg').is_file() for index in range(1, output['frames'] + 1)):
                output = materialize(manifest, stem, fmt, seconds)
        bridge.setdefault('_out', {})[fmt] = output
        save('timeline.json', timeline)
    print('next: node scripts/sync.mjs; inspect both bridge edges with render.mjs --range')


if __name__ == '__main__':
    try:
        # The lock file is persistent; advisory locking is released even after a crash.
        Path('assets/broll').mkdir(parents=True, exist_ok=True)
        with open('assets/broll/.lock', 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            main()
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError) as exc:
        sys.exit(f'broll: {exc}')
