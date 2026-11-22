"""Blind A/B packs strip identifying tags/audio while preserving decoded video pixels."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from PIL import Image

SKILL = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('visual_compare', SKILL / 'scripts/compare.py')
compare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compare)


class ComparePack(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(os.environ.get('MOTION_COMPARE_TEST_DIR') or tempfile.mkdtemp(prefix='motion-compare-'))
        cls.root.mkdir(parents=True, exist_ok=True)
        chapters = cls.root / 'chapters.txt'
        chapters.write_text(';FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=500\ntitle=SECRET_CHAPTER\n')
        cls.sources = []
        for color in ('red', 'blue'):
            path = cls.root / f'SECRET_SOURCE_{color}.mp4'
            subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', f'color=c={color}:s=64x40:r=10:d=1',
                '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-f', 'ffmetadata', '-i', str(chapters),
                '-map', '0:v', '-map', '1:a', '-map_chapters', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-metadata', 'title=SECRET_GLOBAL_TITLE', '-metadata', 'comment=SECRET_GLOBAL_COMMENT',
                '-metadata:s:v:0', 'handler_name=SECRET_STREAM_HANDLER', '-metadata:s:v:0', 'language=fra',
                str(path)], check=True, timeout=30)
            cls.sources.append(path)
        print('evidence:', cls.root)

    def media_info(self, path):
        return json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format',
                                                 '-show_chapters', '-of', 'json', str(path)], timeout=10))

    def pixels(self, path):
        return subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path), '-map', '0:v:0',
                                        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], timeout=10)

    def test_pack_removes_audio_metadata_and_chapters_but_preserves_pixels(self):
        source_info = self.media_info(self.sources[0])
        self.assertIn('SECRET_GLOBAL_TITLE', json.dumps(source_info))
        self.assertIn('SECRET_STREAM_HANDLER', json.dumps(source_info))
        self.assertTrue(source_info['chapters'])
        output, mapping = compare.prepare(*self.sources, self.root / 'pack', seed=42)
        self.assertEqual(mapping.parent, output.parent)
        self.assertFalse(mapping.is_relative_to(output))
        assignments = json.loads(mapping.read_text())['assignments']
        self.assertEqual(set(assignments), {'A', 'B'})
        for label, record in assignments.items():
            clip = output / f'{label}.mp4'
            info = self.media_info(clip)
            self.assertEqual([s['codec_type'] for s in info['streams']], ['video'])
            self.assertFalse(info['chapters'])
            self.assertNotIn('SECRET', json.dumps(info))
            self.assertNotEqual(info['streams'][0].get('tags', {}).get('language'), 'fra')
            self.assertEqual(self.pixels(clip), self.pixels(Path(record['source'])))
            with Image.open(output / f'{label}.jpg') as board:
                self.assertEqual(board.width, 4 * (320 + 8) + 8)
                self.assertGreater(board.height, 200)
        self.assertEqual({p.name for p in output.iterdir()}, {'A.mp4', 'B.mp4', 'A.jpg', 'B.jpg', 'BRIEF.md'})
        brief = (output / 'BRIEF.md').read_text()
        self.assertIn('Blind visual comparison', brief)
        self.assertNotIn('SECRET', brief)

    def test_russian_brief_and_no_overwrite_of_pack_or_mapping(self):
        output, mapping = compare.prepare(*self.sources, self.root / 'pack-ru', seed=1, lang='ru')
        self.assertIn('Слепое визуальное сравнение', (output / 'BRIEF.md').read_text())
        before = mapping.read_bytes()
        with self.assertRaises(ValueError):
            compare.prepare(*self.sources, output, seed=1)
        self.assertEqual(mapping.read_bytes(), before)
        other = self.root / 'blocked'
        other_mapping = other.with_name(other.name + '-mapping.json')
        other_mapping.write_text('retained mapping')
        with self.assertRaises(ValueError):
            compare.prepare(*self.sources, other)
        self.assertFalse(other.exists())
        self.assertEqual(other_mapping.read_text(), 'retained mapping')

    def test_spec_mismatch_and_variable_timestamps_are_rejected_before_output(self):
        mismatch = self.root / 'different-size.mp4'
        variable = self.root / 'variable-rate.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=green:s=80x40:r=10:d=1',
                        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(mismatch)], check=True, timeout=30)
        with self.assertRaises(ValueError):
            compare.prepare(self.sources[0], mismatch, self.root / 'mismatch-pack')
        self.assertFalse((self.root / 'mismatch-pack').exists())
        subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=64x40:r=10:d=1',
                        '-vf', 'setpts=if(lt(N\\,5)\\,N\\,N+2)/(10*TB)', '-fps_mode', 'vfr',
                        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(variable)], check=True, timeout=30)
        with self.assertRaisesRegex(ValueError, 'CFR'):
            compare.prepare(variable, variable, self.root / 'vfr-pack')
        self.assertFalse((self.root / 'vfr-pack').exists())


if __name__ == '__main__':
    unittest.main()
