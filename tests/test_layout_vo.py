"""Audio placement must preserve takes, word offsets and explicit pauses; speech must not add bar padding."""
import array
import importlib.util
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import wave

SKILL = Path(__file__).resolve().parents[1]


@unittest.skipUnless(all(importlib.util.find_spec(n) for n in ('numpy', 'scipy', 'soundfile')), 'run with the motion-film venv (also run by smoke)')
class LayoutTest(unittest.TestCase):
    def fixture(self, mode, measured=False):
        tmp = tempfile.TemporaryDirectory(prefix='motion-layout-')
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        vo = root / 'audio/vo'
        vo.mkdir(parents=True)
        tl = {'duration': 20, 'bpm': 120, 'fps': 60, 'formats': ['9x16'], 'marks': {'custom': 42},
              'vo_layout': {'timing': mode, 'pre': 0.13, 'gap': 0.17, 'after': 0.11, 'tail': 0.43}}
        (root / 'timeline.json').write_text(json.dumps(tl))
        lines = [{'id': name, 'text': 'A B'} for name in ['s1a', 's1b', 's2a']]
        (vo / 'lines.json').write_text(json.dumps(lines))
        for line in lines:
            wav = vo / (line['id'] + '.wav')
            sr = 48000
            signal = array.array('h', (int(9000 * math.sin(i / sr * 440 * math.tau)) if 0.1 < i / sr < 0.73 else 0 for i in range(sr)))
            with wave.open(str(wav), 'wb') as out:
                out.setparams((1, 2, sr, 0, 'NONE', 'not compressed'))
                out.writeframes(signal.tobytes())
            (vo / (line['id'] + '.words.json')).write_text(json.dumps({'take': wav.name, 'take_mtime': wav.stat().st_mtime,
                'source': 'test', 'words': [{'text': 'A', 'start': 0.1}, {'text': 'B', 'start': 0.4}]}))
        if measured:
            (root / 'beats.json').write_text(json.dumps({'beat': 0.5, 'offset': 0.07, 'beats': [0.07, 0.51, 1.12, 1.65, 2.09, 2.7]}))
        result = subprocess.run([sys.executable, str(SKILL / 'scripts/layout_vo.py')], cwd=root, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        result = subprocess.run([sys.executable, str(SKILL / 'scripts/vo.py')], cwd=root, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return root, json.loads((root / 'timeline.json').read_text()), json.loads((root / 'audio/vo_placed.json').read_text())

    def test_speech_avoids_padding_and_preserves_words_and_takes(self):
        root, tl, placed = self.fixture('speech')
        music_root, music, music_placed = self.fixture('music')
        self.assertLess(tl['duration'], music['duration'])
        self.assertEqual(json.loads((root / 'audio/vo_layout_metrics.json').read_text())['grid_padding_s'], 0)
        self.assertGreater(json.loads((music_root / 'audio/vo_layout_metrics.json').read_text())['grid_padding_s'], 0)
        self.assertAlmostEqual(placed[0]['t0'], 0.13, places=3)
        self.assertAlmostEqual(placed[1]['t0'] - placed[0]['t1'], 0.17, places=3)
        self.assertAlmostEqual(placed[2]['t0'] - placed[1]['t1'], 0.24, places=3)
        self.assertEqual(tl['marks']['custom'], 42)
        for a, b in zip(placed, music_placed):
            self.assertAlmostEqual(a['t1'] - a['t0'], b['t1'] - b['t0'], places=3)
        self.assertAlmostEqual((tl['marks']['s1a.w2'] - tl['marks']['s1a.w1']) * 0.5, 0.3, places=5)
        self.assertAlmostEqual(tl['duration'] * 60, round(tl['duration'] * 60), places=4)

    def test_sync_writes_word_times_for_the_mouth_and_checks_puppet_packs(self):
        root, tl, placed = self.fixture('speech')
        (root / 'audio/vo/s1a.words.json').write_text(json.dumps({'take': 's1a.wav', 'source': 'test', 'words': [
            {'text': 'A', 'start': 0.1, 'end': 0.22}, {'text': 'B', 'start': 0.4, 'end': 0.61}]}))
        sync = lambda: subprocess.run(['node', str(SKILL / 'scripts/sync.mjs')], cwd=root, capture_output=True, text=True, timeout=30)
        result = sync()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        data = (root / 'film/data.js').read_text()
        vow = json.loads(data.split('window.VOW = ')[1].split(';\n')[0])
        self.assertEqual([w[2] for w in vow], ['A', 'B'] * 3)
        self.assertTrue(all(b > a for a, b, _ in vow) and all(x[0] <= y[0] for x, y in zip(vow, vow[1:])))
        self.assertTrue(0 <= vow[0][0] - placed[0]['t0'] < 0.05)                  # word 1 starts with its phrase (after the lead-in)
        self.assertAlmostEqual(vow[0][1] - vow[0][0], 0.12, places=2)              # its end from words.json
        self.assertAlmostEqual(vow[1][1] - vow[1][0], 0.21, places=2)              # and so is the last word's
        for i, p in enumerate(placed): self.assertLessEqual(vow[2 * i + 1][1], p['t1'] + 1e-3)   # no word outlives its phrase
        self.assertIn('window.PUPPETS = {}', data)
        pack = root / 'assets/puppets/bad'
        pack.mkdir(parents=True)
        (pack / 'puppet.json').write_text(json.dumps({'size': [10, 10], 'poses': {'rest': {'src': '../../secret.png'}}, 'faces': {}}))
        result = sync()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('puppet pack bad', result.stderr)

    def test_speech_on_measured_grid_preserves_real_seconds(self):
        _, _, placed = self.fixture('speech', measured=True)
        self.assertAlmostEqual(placed[0]['t0'], 0.13, places=3)
        self.assertAlmostEqual(placed[1]['t0'] - placed[0]['t1'], 0.17, places=3)
        self.assertAlmostEqual(placed[2]['t0'] - placed[1]['t1'], 0.24, places=3)

    def test_music_scenes_still_start_on_bars(self):
        _, tl, _ = self.fixture('music')
        self.assertEqual(tl['marks']['sc1'] % 4, 0)
        self.assertEqual(tl['marks']['sc2'] % 4, 0)


if __name__ == '__main__':
    unittest.main()
