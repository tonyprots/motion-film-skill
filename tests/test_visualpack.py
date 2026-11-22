"""Encoded fixture: picture preservation, caption mask, continuous range, no audio/transcript."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SKILL = Path(__file__).resolve().parents[1]


class VisualPack(unittest.TestCase):
    def test_encoded_pack(self):
        root = Path(tempfile.mkdtemp(prefix='motion-visualpack-'))
        (root/'film').mkdir()
        (root/'renders').mkdir()
        (root/'timeline.json').write_text(json.dumps({'formats': ['16x9']}))
        (root/'film/film.js').write_text('CAPTIONS.karaoke({});')
        (root/'captions.json').write_text('[["line","secret caption"]]')
        src = root/'renders/draft_16x9.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
                        'color=white:s=320x180:r=30:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
                        '-vf', 'drawbox=x=20:y=20:w=40:h=40:color=red:t=fill,drawbox=x=10:y=145:w=280:h=20:color=blue:t=fill',
                        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', str(src)], check=True)
        cmd = [os.sys.executable, str(SKILL/'scripts/blindpack.py')]
        def run(*args):
            return subprocess.run(cmd + list(args), cwd=root, capture_output=True, text=True)
        self.assertNotEqual(run('1', '--draft', '--visual-only').returncode, 0)
        self.assertNotEqual(run('1', '--draft', '--visual-only', '--mask', '.9,.8').returncode, 0)
        r = run('1', '--draft', '--visual-only', '--mask', '.75,1', '--range', '.5,1.5')
        self.assertEqual(r.returncode, 0, r.stdout+r.stderr)
        out = root/'review/visual_r1'
        self.assertFalse((out/'text.md').exists())
        self.assertNotIn('secret caption', ''.join(f.read_text() for f in out.glob('*.md')))
        self.assertTrue(list(out.glob('sheet_*.jpg')))
        info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(out/'silent.mp4')]))
        self.assertEqual([s['codec_type'] for s in info['streams']], ['video'])
        self.assertAlmostEqual(float(info['format']['duration']), 1, places=2)
        raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(out/'silent.mp4'), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
        def pixel(x,y):
            k=(y*320+x)*3
            return raw[k:k+3]
        self.assertGreater(pixel(30,30)[0], 200)
        self.assertLess(pixel(30,30)[1], 40)
        self.assertLess(max(pixel(100,155)), 15)
        self.assertNotEqual(run('1', '--draft', '--visual-only', '--mask', '.75,1').returncode, 0)
        os.utime(root/'film/film.js', (src.stat().st_mtime+3,)*2)
        self.assertNotEqual(run('2', '--draft', '--visual-only', '--mask', '.75,1').returncode, 0)
        print('evidence:', root)


if __name__ == '__main__':
    unittest.main()
