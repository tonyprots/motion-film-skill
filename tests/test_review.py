"""Encoded fixtures: missing deliverables fail; every format's ninth cut has pixel evidence."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from PIL import Image

SKILL = Path(__file__).resolve().parents[1]


class ReviewCoverage(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(os.environ.get('MOTION_REVIEW_TEST_DIR') or tempfile.mkdtemp(prefix='motion-review-'))
        cls.complete = cls.root / 'complete'
        cls.missing = cls.root / 'missing'
        for root in (cls.complete, cls.missing):
            (root / 'renders').mkdir(parents=True)
            (root / 'review').mkdir()
            (root / 'timeline.json').write_text(json.dumps({'formats': ['16x9', '9x16'], 'duration': 3, 'fps': 30}))
            (root / 'review/cuts.json').write_text(json.dumps({fmt: [round(i * .2, 2) for i in range(1, 13)] for fmt in ['16x9', '9x16']}))
        for fmt, size in [('16x9', '1920x1080'), ('9x16', '1080x1920')]:
            dest = cls.complete / f'renders/draft_{fmt}.mp4'
            args = ['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', f'testsrc2=size={size}:rate=30:duration=3']
            if fmt == '9x16':
                args += ['-vf', "drawbox=color=magenta:t=fill:enable='eq(n,54)'"]
            subprocess.run(args + ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p',
                                  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
                                  '-movflags', '+faststart', str(dest)], check=True, timeout=30)
        os.link(cls.complete / 'renders/draft_16x9.mp4', cls.missing / 'renders/draft_16x9.mp4')
        print('evidence:', cls.root)

    def review(self, root):
        script = os.environ.get('MOTION_REVIEW_SCRIPT', str(SKILL / 'scripts/review.py'))
        result = subprocess.run([os.sys.executable, script, 'test', '--draft'], cwd=root, capture_output=True, text=True, timeout=120)
        (root / 'review.log').write_text(result.stdout + '\n' + result.stderr)
        return result, json.loads((root / 'review/rtest/metrics.json').read_text())

    def test_missing_declared_format_fails(self):
        result, metrics = self.review(self.missing)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(any(g['level'] == 'FAIL' and g['check'] == 'formats' and '9x16' in g['msg'] for g in metrics['gates']))
        self.assertEqual(metrics['formats']['missing'], ['9x16'])

    def test_complete_set_and_late_portrait_cut(self):
        result, metrics = self.review(self.complete)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(metrics['formats']['missing'], [])
        for fmt in ['16x9', '9x16']:
            coverage = metrics['cut_coverage'][fmt]
            self.assertEqual(coverage['planned'], 12)
            self.assertEqual(coverage['rendered'], 12)
            self.assertEqual(len(coverage['strips']), 12)
        ninth = metrics['cut_coverage']['9x16']['strips'][8]
        self.assertEqual(ninth['at_s'], 1.8)
        frame_column = ninth['frames'].index(54)
        with Image.open(self.complete / 'review/rtest' / ninth['file']) as strip:
            red, green, blue = strip.convert('RGB').getpixel((6 + frame_column * (270 + 6) + 135, 6 + 22 + 240))
        self.assertGreater(red, 200)
        self.assertGreater(blue, 200)
        self.assertLess(green, 50)

    def test_outside_cuts_remain_in_coverage(self):
        root = self.root / 'outside'
        (root / 'renders').mkdir(parents=True)
        (root / 'review').mkdir()
        (root / 'timeline.json').write_text(json.dumps({'formats': ['16x9'], 'duration': 3, 'fps': 30}))
        (root / 'review/cuts.json').write_text(json.dumps({'16x9': [0, 1, 3, 4]}))
        os.link(self.complete / 'renders/draft_16x9.mp4', root / 'renders/draft_16x9.mp4')
        result, metrics = self.review(root)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        coverage = metrics['cut_coverage']['16x9']
        self.assertEqual(coverage['planned'], 4)
        self.assertEqual(coverage['rendered'], 1)
        self.assertEqual(coverage['skipped'], [0, 3, 4])
        self.assertTrue(any(g['level'] == 'WARN' and g['check'] == 'cuts' for g in metrics['gates']))


if __name__ == '__main__':
    unittest.main()
