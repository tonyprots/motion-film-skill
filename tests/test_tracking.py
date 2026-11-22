"""Translation tracking must hide uncertainty instead of inventing a smooth path."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import numpy as np

SKILL = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('track', SKILL / 'scripts/track.py')
track = importlib.util.module_from_spec(spec)
spec.loader.exec_module(track)


class TrackingTest(unittest.TestCase):
    def setUp(self):
        rng = np.random.default_rng(17)
        self.patch = rng.integers(20, 240, (20, 20), dtype=np.uint8)

    def frame(self, x=30, y=30, visible=True, background=70, duplicate=None):
        frame = np.full((100, 140), background, dtype=np.uint8)
        if visible:
            height, width = min(20, 100-y), min(20, 140-x)
            frame[y:y+height, x:x+width] = self.patch[:height, :width]
        if duplicate:
            dx, dy = duplicate
            frame[dy:dy+20, dx:dx+20] = self.patch
        return frame

    def tracker(self, **options):
        return track.Tracker(self.frame(), (30, 30, 20, 20), search=25, **options)

    def test_translation_survives_gain_and_offset(self):
        tracker = self.tracker()
        image = np.clip(self.frame(35, 34).astype(float)*.8+20, 0, 255).astype(np.uint8)
        result = tracker.step(image)
        self.assertEqual((result['x'], result['y']), (45, 44))
        self.assertGreater(result['confidence'], .99)

    def test_occlusion_is_null_and_recovery_requires_two_good_frames(self):
        tracker = self.tracker()
        self.assertIsNone(tracker.step(self.frame(visible=False))['x'])
        self.assertIsNone(tracker.step(self.frame(34))['x'])
        self.assertEqual(tracker.step(self.frame(36))['x'], 46)

    def test_long_loss_is_not_reacquired_as_a_similar_object(self):
        tracker = self.tracker(max_gap=2)
        for _ in range(3):
            self.assertIsNone(tracker.step(self.frame(visible=False))['x'])
        for _ in range(3):
            self.assertIsNone(tracker.step(self.frame(32))['x'])

    def test_competing_copy_is_ambiguous_even_with_high_correlation(self):
        tracker = self.tracker()
        result = tracker.step(self.frame(duplicate=(53, 30)))
        self.assertIsNone(result['x'])
        self.assertGreater(result['confidence'], .99)
        self.assertLess(result['margin'], .01)

    def test_strong_scene_cut_locks_even_if_same_object_is_present(self):
        tracker = self.tracker()
        self.assertIsNone(tracker.step(self.frame(background=200))['x'])
        self.assertIsNone(tracker.step(self.frame())['x'])

    def test_subject_leaving_frame_is_lost(self):
        image = self.frame(110)
        tracker = track.Tracker(image, (110,30,20,20), search=25)
        self.assertIsNone(tracker.step(self.frame(125))['x'])

    def test_flat_or_invalid_roi_is_rejected(self):
        with self.assertRaises(ValueError):
            track.Tracker(np.zeros((30, 30), dtype=np.uint8), (0,0,20,20))
        with self.assertRaises(ValueError):
            track.Tracker(self.frame(), (130,30,20,20))

    def test_stalled_decoder_is_killed_at_deadline(self):
        spawn = subprocess.Popen
        children = []
        def stalled(*args, **kwargs):
            process = spawn([sys.executable, '-c', 'import time; time.sleep(10)'],
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            children.append(process)
            return process
        with patch.object(track, 'probe', return_value=(100,100,24,1)), patch.object(track.subprocess, 'Popen', side_effect=stalled):
            with self.assertRaises(TimeoutError):
                track.analyze('unused.mp4', (20,20,20,20), timeout=.02)
        self.assertIsNotNone(children[0].poll())

    def test_multistream_decode_matches_first_probed_video_not_default(self):
        # v:1 is larger, vertically mirrored and marked default. FFmpeg's automatic
        # selection picks it, while probe deliberately describes v:0.
        with tempfile.TemporaryDirectory(prefix='motion-tracking-streams-') as folder:
            video = Path(folder) / 'two-streams.mp4'
            frames = b''.join(self.frame(y=40+index).tobytes() for index in range(12))
            subprocess.run(['ffmpeg', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'gray',
                            '-s', '140x100', '-r', '24', '-i', 'pipe:0',
                            '-filter_complex', '[0:v]split=2[a][b];[b]vflip,scale=280:200[b2]',
                            '-map', '[a]', '-map', '[b2]', '-c:v', 'libx264', '-crf', '0',
                            '-pix_fmt', 'yuv444p', '-disposition:v:0', '0',
                            '-disposition:v:1', 'default', str(video)], input=frames,
                           capture_output=True, check=True)
            result = track.analyze(video, (30,40,20,20))
            self.assertEqual((result['source']['width'], result['source']['height']), (140,100))
            self.assertEqual(len(result['samples']), 12)
            for index, sample in enumerate(result['samples']):
                self.assertEqual((sample['x'], sample['y']), (40,50+index))


if __name__ == '__main__':
    unittest.main()
