#!/usr/bin/env python3
"""Prepare a silent, anonymized visual A/B comparison from two matching MP4s.

compare.py first.mp4 second.mp4 NEW_DIR [--seed N] [--lang en|ru]
NEW_DIR contains A/B clips, contact sheets and a neutral BRIEF.
The mapping stays beside NEW_DIR, outside the reader's allowed directory.
This prepares evidence; it does not score quality or replace continuous playback.
Only CFR inputs with matching dimensions, rate and decoded frame count are supported.
Timestamp spacing is checked within one container time-base tick; VFR is rejected.
Container/stream tags, chapters and audio are removed; visible watermarks are not edited.
"""
import argparse
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import random
import secrets
import subprocess

from PIL import Image, ImageDraw


def run(args):
    return subprocess.run(args, capture_output=True, check=True, timeout=120)


def probe(path):
    info = json.loads(run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_frames',
                          '-show_frames', '-show_entries',
                          'stream=width,height,avg_frame_rate,nb_read_frames,time_base:frame=best_effort_timestamp',
                          '-of', 'json', str(path)]).stdout)
    stream = info['streams'][0]
    fps = Fraction(stream['avg_frame_rate'])
    frames = int(stream['nb_read_frames'])
    if fps <= 0 or frames < 2:
        raise ValueError('comparison needs at least two frames and a positive frame rate')
    tick = Fraction(stream['time_base'])
    timestamps = [int(frame['best_effort_timestamp']) for frame in info['frames']]
    if tick <= 0 or len(timestamps) != frames:
        raise ValueError('comparison needs complete frame timestamps')
    for before, after in zip(timestamps, timestamps[1:]):
        if after <= before or abs((after - before) * tick - 1 / fps) > tick:
            raise ValueError('comparison supports CFR only; irregular frame timestamps detected')
    return {'width': int(stream['width']), 'height': int(stream['height']),
            'fps': str(fps), 'frames': frames}


def sheet(clip, spec, destination):
    count = min(12, spec['frames'])
    indices = sorted({round(i * (spec['frames'] - 1) / (count - 1)) for i in range(count)})
    width = 320 if spec['width'] >= spec['height'] else 180
    height = round(width * spec['height'] / spec['width'])
    select = '+'.join(f'eq(n\\,{i})' for i in indices)
    raw = run(['ffmpeg', '-v', 'error', '-i', str(clip), '-vf',
               f"select='{select}',scale={width}:{height}:flags=area",
               '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']).stdout
    frame_size = width * height * 3
    if len(raw) != len(indices) * frame_size:
        raise ValueError('contact sheet did not decode every requested frame')
    cols, pad, label = 4, 8, 20
    board = Image.new('RGB', (cols * (width + pad) + pad,
                             ((len(indices) + cols - 1) // cols) * (height + label + pad) + pad), '#ececec')
    draw = ImageDraw.Draw(board)
    for index, frame in enumerate(indices):
        x, y = pad + index % cols * (width + pad), pad + index // cols * (height + label + pad)
        draw.text((x, y), f'{frame / float(Fraction(spec["fps"])):.3f}s', fill='#222222')
        image = Image.frombytes('RGB', (width, height), raw[index * frame_size:(index + 1) * frame_size])
        board.paste(image, (x, y + label))
    board.save(destination, quality=92)


BRIEFS = {'ru': """# Слепое визуальное сравнение

В этой папке два варианта одного короткого фрагмента: A и B.
Открывайте только эту папку. Не ищите исходники, имена авторов и таблицу соответствий.
Звук удалён намеренно; оценивается только изображение.

Сначала опишите действие и его результат в каждом варианте.
Затем сравните ясность действия, узнаваемость предметов, читаемость подписей,
материал и стабильность изображения во времени. Назовите конкретные моменты.
Выберите A, B или «нет убедительного преимущества» и объясните выбор.
Красивое оформление не компенсирует потерю смысла или читаемости.
Не угадывайте способ изготовления и не ставьте оценку за предполагаемую сложность.

MP4 нужен для движения; листы кадров помогают найти нужный момент.
Явно укажите, что действительно просмотрено: непрерывное видео или только кадры.
Не делайте выводов о непроверенном звуке и незаметных между выбранными кадрами дефектах.
""", 'en': """# Blind visual comparison

This folder contains two versions of the same short segment: A and B.
Open only this folder. Do not look for source files, authors, or the assignment mapping.
Audio has been removed intentionally; assess the picture only.

First describe the action and its outcome in each version.
Then compare clarity of action, recognizable objects, label readability,
material, and stability over time. Identify specific moments.
Choose A, B, or "no convincing advantage" and explain your choice.
Attractive styling does not compensate for lost meaning or readability.
Do not guess the production method or reward presumed complexity.

Play the MP4s to assess motion; contact sheets help locate moments.
State what you actually inspected: continuous video or still frames only.
Do not make claims about the removed audio or defects between unexamined frames.
"""}


def prepare(first, second, output, seed=None, lang='en'):
    if lang not in BRIEFS:
        raise ValueError('language must be en or ru')
    sources = [Path(first).resolve(strict=True), Path(second).resolve(strict=True)]
    output = Path(output).absolute()
    mapping = output.with_name(output.name + '-mapping.json')
    if output.exists() or mapping.exists():
        raise ValueError('comparison or mapping already exists; choose a new directory')
    specs = [probe(source) for source in sources]
    if specs[0] != specs[1]:
        raise ValueError('inputs must match in dimensions, frame rate and decoded frame count')
    seed = secrets.randbits(64) if seed is None else seed
    order = list(range(2))
    random.Random(seed).shuffle(order)
    output.mkdir(parents=True)
    manifest = {'version': 1, 'seed': seed, 'spec': specs[0], 'assignments': {}}
    # Persist provenance before processing; a failed build remains inspectable.
    for label, index in zip(('A', 'B'), order):
        source = sources[index]
        with source.open('rb') as file:
            fingerprint = hashlib.file_digest(file, 'sha256').hexdigest()
        manifest['assignments'][label] = {'source': str(source), 'sha256': fingerprint}
    with mapping.open('x', encoding='utf-8') as file:
        json.dump(manifest, file, ensure_ascii=False, indent=2)
    for label, index in zip(('A', 'B'), order):
        clip = output / f'{label}.mp4'
        run(['ffmpeg', '-v', 'error', '-i', str(sources[index]), '-map', '0:v:0',
             '-an', '-c:v', 'copy', '-map_metadata', '-1', '-map_metadata:s:v', '-1',
             '-metadata:s:v:0', 'handler_name=VideoHandler', '-map_chapters', '-1', '-movflags', '+faststart', str(clip)])
        if probe(clip) != specs[0]:
            raise ValueError(f'{label}: remux changed the video specification')
        sheet(clip, specs[0], output / f'{label}.jpg')
    (output / 'BRIEF.md').write_text(BRIEFS[lang], encoding='utf-8')
    return output, mapping


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('first')
    parser.add_argument('second')
    parser.add_argument('output')
    parser.add_argument('--seed', type=int)
    parser.add_argument('--lang', choices=BRIEFS, default='en')
    args = parser.parse_args()
    output, mapping = prepare(args.first, args.second, args.output, args.seed, args.lang)
    print(f'Give the reader only: {output}\nKeep outside the reader context: {mapping}')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, IndexError, subprocess.SubprocessError) as error:
        raise SystemExit(str(error))
