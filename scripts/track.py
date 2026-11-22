#!/usr/bin/env python3
"""Local translation-only ROI tracker. Fixed-size textured subjects, one continuous CFR shot."""
import argparse
from fractions import Fraction
import hashlib
import json
import math
import os
from pathlib import Path
import select
import subprocess
import sys
import time
import numpy as np
from scipy.signal import fftconvolve


def correlation(image, template):
    """Zero-mean normalized cross correlation; scores are correlations, not probabilities."""
    height, width = template.shape
    centered = template - template.mean()
    energy = np.square(centered).sum()
    if energy < 1e-8:
        raise ValueError('ROI has no trackable texture')
    def sums(values):
        integral = np.pad(values, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
        return integral[height:, width:] - integral[:-height, width:] - integral[height:, :-width] + integral[:-height, :-width]
    count = height * width
    variance = np.maximum(0, sums(image * image) - np.square(sums(image)) / count)
    numerator = fftconvolve(image, centered[::-1, ::-1], mode='valid')
    denominator = np.sqrt(variance * energy)
    return np.divide(numerator, denominator, out=np.full_like(numerator, -1), where=denominator > 1e-6)


class Tracker:
    def __init__(self, first, roi, search=40, threshold=.78, margin=.08, max_gap=5, cut_threshold=.25):
        x, y, width, height = roi
        self.template = first[y:y + height, x:x + width].astype(np.float64)
        if min(width, height) < 8 or self.template.shape != (height, width) or self.template.std() < 8:
            raise ValueError('ROI must be in bounds, at least 8x8 analysis pixels and visibly textured')
        self.x, self.y, self.width, self.height = x, y, width, height
        self.search, self.threshold, self.margin = search, threshold, margin
        self.max_gap, self.cut_threshold = max_gap, cut_threshold
        self.missing, self.recovery, self.locked = 0, None, False
        self.previous = first.astype(np.float64)

    def step(self, frame):
        current = frame.astype(np.float64)
        cut = np.abs(current - self.previous).mean() / 255
        self.previous = current
        if cut > self.cut_threshold:
            self.locked = True
        if self.locked:
            return {'x': None, 'y': None, 'confidence': None, 'margin': None, 'status': 'lost'}
        height, width = frame.shape
        x0, y0 = max(0, self.x - self.search), max(0, self.y - self.search)
        x1 = min(width, self.x + self.width + self.search)
        y1 = min(height, self.y + self.height + self.search)
        scores = correlation(current[y0:y1, x0:x1], self.template)
        py, px = np.unravel_index(np.argmax(scores), scores.shape)
        score = float(scores[py, px])
        # Nearby pixels describe the same peak. A separate strong peak is an ambiguous subject.
        competitors = scores.copy()
        radius = max(2, min(self.width, self.height) // 3)
        competitors[max(0, py-radius):py+radius+1, max(0, px-radius):px+radius+1] = -1
        margin = score - float(competitors.max())
        x, y = x0 + int(px), y0 + int(py)
        valid = score >= self.threshold and margin >= self.margin and x > 0 and y > 0 and x + self.width < width and y + self.height < height
        status = 'tracked'
        if not valid:
            self.missing += 1
            self.recovery = None
            status = 'lost'
        elif self.missing:
            # Two adjacent good frames, without moving the search window while the subject is lost.
            if self.recovery is None or math.hypot(x-self.recovery[0], y-self.recovery[1]) > self.search / 2:
                self.recovery = (x, y)
                self.missing += 1
                status = 'recovering'
            else:
                self.missing, self.recovery = 0, None
        if self.missing > self.max_gap:
            self.locked = True
            status = 'lost'
        if status != 'tracked':
            return {'x': None, 'y': None, 'confidence': round(score, 4), 'margin': round(margin, 4), 'status': status}
        self.x, self.y = x, y
        return {'x': x + self.width / 2, 'y': y + self.height / 2,
                'confidence': round(score, 4), 'margin': round(margin, 4), 'status': status}


def probe(path, max_frames):
    raw = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-read_intervals', f'%+#{max_frames+32}', '-show_streams', '-show_frames',
                          '-show_entries', 'stream=width,height,avg_frame_rate:stream_side_data=rotation:frame=best_effort_timestamp_time',
                          '-of', 'json', str(path)], capture_output=True, text=True, check=True, timeout=60)
    data = json.loads(raw.stdout)
    if not data.get('streams') or not data.get('frames'):
        raise ValueError('input has no decodable video frames')
    stream = data['streams'][0]
    try:
        fps = float(Fraction(stream['avg_frame_rate']))
        times = [float(frame['best_effort_timestamp_time']) for frame in data['frames']]
    except (KeyError, ValueError, ZeroDivisionError) as exc:
        raise ValueError('video requires a valid constant frame rate and frame timestamps') from exc
    if not times or len(times) > max_frames or not math.isfinite(fps) or fps <= 0:
        raise ValueError('empty video, invalid fps or frame limit exceeded')
    if any(side.get('rotation', 0) % 360 for side in stream.get('side_data_list', [])):
        raise ValueError('normalize video rotation before tracking')
    origin = times[0]
    if any(abs(t-origin-index/fps) > .002 for index, t in enumerate(times)):
        raise ValueError('variable frame rate is not supported; normalize the clip to CFR first')
    return stream['width'], stream['height'], fps, len(times)


def analyze(path, roi, start_frame=0, analysis_width=640, max_frames=7200, timeout=120, **options):
    width, height, fps, count = probe(path, max_frames)
    if not 0 <= start_frame < count:
        raise ValueError('start frame is outside the clip')
    x, y, rw, rh = roi
    if min(x, y) < 0 or min(rw, rh) <= 0 or x+rw > width or y+rh > height:
        raise ValueError('ROI is outside the source frame')
    aw = min(width, analysis_width)
    ah = round(height * aw / width)
    sx, sy = width / aw, height / ah
    small_roi = (round(x/sx), round(y/sy), round(rw/sx), round(rh/sy))
    options['search'] = max(1, round(options.get('search', 40) / sx))
    process = subprocess.Popen(['ffmpeg', '-v', 'error', '-noautorotate', '-i', str(path), '-map', '0:v:0', '-an',
                                '-vf', f'scale={aw}:{ah},format=gray', '-fps_mode', 'passthrough', '-frames:v', str(count),
                                '-f', 'rawvideo', 'pipe:1'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    samples, tracker = [], None
    deadline = time.monotonic() + timeout
    try:
        for index in range(count):
            parts, remaining = [], aw * ah
            while remaining:
                wait = deadline - time.monotonic()
                if wait <= 0 or not select.select([process.stdout], [], [], wait)[0]:
                    raise TimeoutError('video decode/analysis time limit exceeded')
                chunk = os.read(process.stdout.fileno(), remaining)
                if not chunk:
                    raise ValueError(f'video decode stopped at frame {index}')
                parts.append(chunk)
                remaining -= len(chunk)
            frame = np.frombuffer(b''.join(parts), dtype=np.uint8).reshape(ah, aw)
            if index < start_frame:
                sample = {'x': None, 'y': None, 'confidence': None, 'margin': None, 'status': 'not-started'}
            else:
                if tracker is None:
                    tracker = Tracker(frame, small_roi, **options)
                sample = tracker.step(frame)
                if sample['x'] is not None:
                    sample['x'], sample['y'] = round(sample['x']*sx, 3), round(sample['y']*sy, 3)
            samples.append(sample)
        if process.wait(timeout=30):
            raise ValueError('ffmpeg failed to decode the clip')
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        process.stdout.close()
    checksum = hashlib.sha256()
    with Path(path).open('rb') as source:
        for chunk in iter(lambda: source.read(1024*1024), b''):
            checksum.update(chunk)
    return {'version': 1, 'source': {'file': str(path), 'sha256': checksum.hexdigest(), 'width': width, 'height': height,
                                    'fps': fps, 'frames': count},
            'roi': list(roi), 'start_frame': start_frame, 'method': 'fixed-template-translation-ncc',
            'parameters': {**options, 'analysis_width': aw}, 'samples': samples}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video', type=Path)
    parser.add_argument('--roi', required=True, help='x,y,width,height in original source pixels')
    parser.add_argument('--out', type=Path, default=Path('tracks.json'))
    parser.add_argument('--start-frame', type=int, default=0)
    parser.add_argument('--analysis-width', type=int, default=640)
    parser.add_argument('--max-frames', type=int, default=7200)
    parser.add_argument('--timeout', type=float, default=120, help='decode/analysis deadline in seconds')
    parser.add_argument('--search', type=int, default=40, help='maximum local displacement in source pixels')
    parser.add_argument('--threshold', type=float, default=.78)
    parser.add_argument('--margin', type=float, default=.08)
    parser.add_argument('--max-gap', type=int, default=5, help='lost/recovering frames before permanent loss')
    parser.add_argument('--cut-threshold', type=float, default=.25)
    args = parser.parse_args(argv)
    roi = tuple(int(value) for value in args.roi.split(','))
    if len(roi) != 4:
        raise ValueError('--roi requires four integers')
    if not 32 <= args.analysis_width <= 1280 or not 1 <= args.max_frames <= 36000:
        raise ValueError('analysis width must be 32..1280; max frames 1..36000')
    if not math.isfinite(args.timeout) or not 1 <= args.timeout <= 3600:
        raise ValueError('timeout must be finite and in 1..3600 seconds')
    if not 1 <= args.search <= 256 or not 0 <= args.max_gap <= 30:
        raise ValueError('search must be 1..256; max gap 0..30')
    if not all(math.isfinite(value) and 0 < value <= 1 for value in [args.threshold, args.margin, args.cut_threshold]):
        raise ValueError('thresholds must be finite values in (0,1]')
    if args.out.exists():
        raise ValueError('output already exists; choose a new version filename')
    result = analyze(args.video, roi, args.start_frame, args.analysis_width, args.max_frames, args.timeout,
                     search=args.search, threshold=args.threshold, margin=args.margin,
                     max_gap=args.max_gap, cut_threshold=args.cut_threshold)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation also prevents a concurrent run from replacing another result.
    with args.out.open('x', encoding='utf-8') as output:
        json.dump(result, output, ensure_ascii=False, indent=2)
    visible = sum(sample['x'] is not None for sample in result['samples'])
    print(f"{args.out}: {visible}/{len(result['samples'])} tracked frames; lost frames carry null coordinates")


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as exc:
        sys.exit(f'track: {exc}')
