"""Subject evidence for a small change inside a whole-frame STILL flag."""
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

from PIL import Image

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/stillness.py'


class StillnessEvidence(unittest.TestCase):
    def test_small_change_and_last_frame_at_eof(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            video = root / 'subject.mp4'
            subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
                            'color=white:s=320x180:r=10:d=3', '-vf',
                            "drawbox=x=240:y=120:w=16:h=12:color=red:t=fill:enable='gte(t,2.9)'",
                            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(video)], check=True)

            def run(*args):
                return subprocess.run([sys.executable, SCRIPT, video, *args], cwd=root,
                                      capture_output=True, text=True)

            plain = run('--json', 'base.json')
            self.assertEqual(plain.returncode, 1, plain.stderr)
            base = json.loads((root / 'base.json').read_text())
            self.assertEqual(base['spans'], [[0.5, 3.0]])
            self.assertNotIn('pairs', base['params'])

            checked = run('--pairs', 'pairs', '--region', '.70,.50,.90,.90', '--json', 'evidence.json')
            self.assertEqual(checked.returncode, 1, checked.stderr)
            self.assertEqual(json.loads((root / 'evidence.json').read_text())['spans'], base['spans'])
            with Image.open(root / 'pairs/still-001.png') as pair:
                width = (pair.width - 2) // 2
                self.assertLess(width, 320)
                # (248,126) is inside the box, offset from the selected region's (224,90).
                before = pair.getpixel((24, 24 + 36))
                after = pair.getpixel((width + 2 + 24, 24 + 36))
                self.assertGreater(min(before), 230)
                self.assertGreater(after[0], 200)
                self.assertLess(max(after[1:]), 50)
            self.assertEqual(run('--pairs', 'pairs').returncode, 2)
            self.assertEqual(run('--pairs', 'bad', '--region', '.5,0,.2,1').returncode, 2)
            self.assertFalse((root / 'bad').exists())
            self.assertEqual(run('--min', '4', '--pairs', 'none').returncode, 0)


if __name__ == '__main__':
    unittest.main()
