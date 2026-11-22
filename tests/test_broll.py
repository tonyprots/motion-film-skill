"""B-roll must not silently repeat a charge, reuse changed inputs, or lose expensive outputs."""
import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SKILL = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('broll', SKILL / 'scripts/broll.py')
broll = importlib.util.module_from_spec(spec)
spec.loader.exec_module(broll)
MODEL = {'id': 'test/model', 'supported_durations': [4, 8], 'supported_resolutions': ['720p', '1080p'],
         'supported_aspect_ratios': ['16:9', '9:16'], 'supported_frame_images': ['first_frame', 'last_frame'],
         'pricing_skus': {'per-video-second-720p': '0.25'}, 'seed': True}
BRIDGE = {'id': 'bridge', 'at': 's1', 'prompt': 'A ball rolls', 'seconds': 4,
          'model': 'test/model', 'resolution': '720p'}


class Provider:
    def __init__(self):
        self.posts = 0
        self.fail = None
        self.content = b'video'

    def __call__(self, method, path, body=None, raw=False):
        if path == '/videos/models':
            return {'data': [MODEL]}
        if method == 'POST':
            self.posts += 1
            if self.fail == 'submit':
                raise OSError('response lost after provider accepted request')
            return {'id': 'job-1', 'status': 'queued'}
        if path.endswith('/content'):
            if self.fail == 'download':
                raise OSError('download failed')
            return self.content
        if self.fail == 'poll':
            raise OSError('poll failed')
        return {'id': 'job-1', 'status': 'completed', 'usage': {'cost': 1}}


class BrollTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        previous = Path.cwd()
        os.chdir(self.temp.name)
        self.addCleanup(os.chdir, previous)
        self.provider = Provider()
        self.body, self.fingerprint, self.identity = broll.request(BRIDGE, '16x9', MODEL, b'first', b'last')
        self.manifest = broll.new_run('bridge_16x9', self.identity, self.fingerprint, b'first', b'last')

    def test_poll_and_download_failure_resume_without_another_post(self):
        self.provider.fail = 'poll'
        with self.assertRaises(OSError):
            broll.submit_or_resume(self.manifest, self.body, transport=self.provider)
        self.assertEqual(broll.read(self.manifest)['job'], 'job-1')
        self.provider.fail = None
        broll.submit_or_resume(self.manifest, self.body, transport=self.provider)
        self.provider.fail = 'download'
        with self.assertRaises(OSError):
            broll.materialize(self.manifest, 'bridge_16x9', '16x9', 4, transport=self.provider)
        self.provider.fail = None
        broll.submit_or_resume(self.manifest, self.body, transport=self.provider)
        self.assertEqual(self.provider.posts, 1)

    def test_ambiguous_submit_blocks_force_until_verified_job_is_attached(self):
        self.provider.fail = 'submit'
        with self.assertRaises(OSError):
            broll.submit_or_resume(self.manifest, self.body, transport=self.provider)
        self.assertEqual(broll.classify(self.manifest, self.fingerprint, force=True), 'ambiguous')
        with self.assertRaises(ValueError):
            broll.submit_or_resume(self.manifest, self.body, transport=self.provider)
        self.provider.fail = None
        broll.submit_or_resume(self.manifest, self.body, resume_job='job-1', transport=self.provider)
        self.assertEqual(self.provider.posts, 1)

    def test_cache_identity_uses_request_and_both_actual_images(self):
        state = broll.read(self.manifest)
        state['state'] = 'ready'
        broll.save(self.manifest, state)
        self.assertEqual(broll.classify(self.manifest, self.fingerprint), 'cached')
        for bridge, first, last in [
            ({**BRIDGE, 'prompt': 'A cube rolls'}, b'first', b'last'),
            ({**BRIDGE, 'seed': 8}, b'first', b'last'),
            (BRIDGE, b'changed', b'last'),
            (BRIDGE, b'first', b'changed'),
        ]:
            fingerprint = broll.request(bridge, '16x9', MODEL, first, last)[1]
            self.assertEqual(broll.classify(self.manifest, fingerprint), 'new')

    def test_active_job_cannot_be_replaced_by_force_or_changed_request(self):
        state = broll.read(self.manifest)
        state.update(job='job-1', state='queued')
        broll.save(self.manifest, state)
        self.assertEqual(broll.classify(self.manifest, self.fingerprint, force=True), 'resume')
        with self.assertRaises(ValueError):
            broll.classify(self.manifest, 'changed', force=True)

    def test_expired_job_stops_after_one_poll_without_sleeping(self):
        polls, sleeps = [], []
        def transport(method, path, body=None):
            if method == 'POST':
                return {'id': 'job-expired', 'status': 'queued'}
            polls.append(path)
            return {'status': 'expired'}
        with self.assertRaises(ValueError):
            broll.submit_or_resume(self.manifest, self.body, transport=transport, sleep=sleeps.append)
        self.assertEqual(len(polls), 1)
        self.assertEqual(sleeps, [])
        self.assertEqual(broll.classify(self.manifest, self.fingerprint, force=True), 'new')

    def test_known_job_resumes_without_catalog_and_changed_input_cannot_sneak_through(self):
        for unavailable in ('delisted', 'network'):
            with self.subTest(catalog=unavailable):
                state = broll.read(self.manifest)
                state.update(state='queued', job='job-1')
                broll.save(self.manifest, state)
                broll.save('timeline.json', {'formats': ['16x9'], 'broll': [BRIDGE]})
                calls = []
                def transport(method, path, body=None, raw=False):
                    calls.append((method, path))
                    if path.endswith('/models'):
                        if unavailable == 'network':
                            raise OSError('catalog offline')
                        return {'data': []}
                    return {'id': 'job-1', 'status': 'completed'}
                with patch.object(broll, 'call', side_effect=transport), \
                        patch.object(broll, 'frame', side_effect=[b'first', b'last']), \
                        patch.object(broll, 'materialize', return_value={'fps': 24, 'frames': 96}), \
                        patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test-only'}):
                    broll.main(['--yes'])
                self.assertEqual(calls, [('GET', '/videos/job-1')])
                # A different input must require live discovery, never use saved capabilities for a new POST.
                state.update(state='ready', output={'fps': 24, 'frames': 96})
                broll.save(self.manifest, state)
                with patch.object(broll, 'call', side_effect=transport), \
                        patch.object(broll, 'frame', side_effect=[b'changed', b'last']):
                    with self.assertRaises((ValueError, OSError)):
                        broll.main(['--yes'])
                self.assertFalse(any(method == 'POST' for method, path in calls))

    def test_cached_output_with_missing_middle_frame_is_rebuilt_without_catalog(self):
        state = broll.read(self.manifest)
        state.update(state='ready', job='job-1', output={'fps': 24, 'frames': 96})
        broll.save(self.manifest, state)
        broll.save('timeline.json', {'formats': ['16x9'], 'broll': [BRIDGE]})
        frames = Path('assets/broll/bridge_16x9')
        frames.mkdir()
        (frames / '0001.jpg').write_bytes(b'first')
        (frames / '0096.jpg').write_bytes(b'last')
        with patch.object(broll, 'call', side_effect=OSError('catalog offline')) as network, \
                patch.object(broll, 'frame', side_effect=[b'first', b'last']), \
                patch.object(broll, 'materialize', return_value=state['output']) as rebuild, \
                patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test-only'}):
            broll.main(['--yes'])
        network.assert_not_called()
        rebuild.assert_called_once()

    def test_capabilities_and_fractional_duration_fail_before_generation(self):
        for field in ['supported_durations', 'supported_resolutions', 'supported_aspect_ratios', 'supported_frame_images']:
            model = copy.deepcopy(MODEL)
            model[field] = []
            with self.assertRaises(ValueError, msg=field):
                broll.validate(BRIDGE, '16x9', model)
        with self.assertRaises(ValueError):
            broll.validate({**BRIDGE, 'seconds': 4.1}, '16x9', MODEL)
        with self.assertRaises(ValueError):
            broll.validate({**BRIDGE, 'id': '../escape'}, '16x9', MODEL)
        self.assertEqual(self.provider.posts, 0)

    def test_unknown_price_is_not_zero_and_ceiling_blocks_it(self):
        self.assertIsNone(broll.price(MODEL, 4, '1080p'))
        self.assertEqual(broll.price(MODEL, 4, '720p'), 1)
        timeline = {'formats': ['16x9'], 'broll': [{**BRIDGE, 'resolution': '1080p'}]}
        broll.save('timeline.json', timeline)
        with patch.object(broll, 'call', self.provider), patch.object(broll, 'frame', return_value=b'frame'):
            log = io.StringIO()
            with contextlib.redirect_stdout(log):
                broll.main([])
            self.assertIn('unknown', log.getvalue())
            with self.assertRaises(ValueError):
                broll.main(['--yes', '--max-cost', '100'])
        self.assertEqual(self.provider.posts, 0)

    def test_known_budget_applies_to_new_jobs_not_already_submitted_jobs(self):
        broll.save('timeline.json', {'formats': ['16x9'], 'broll': [BRIDGE]})
        with patch.object(broll, 'call', self.provider), patch.object(broll, 'frame', side_effect=[b'first', b'last']):
            with self.assertRaises(ValueError):
                broll.main(['--yes', '--max-cost', '0.99'])
        self.assertEqual(self.provider.posts, 0)
        broll.submit_or_resume(self.manifest, self.body, transport=self.provider)
        with patch.object(broll, 'call', self.provider), patch.object(broll, 'frame', side_effect=[b'first', b'last']):
            broll.main(['--max-cost', '0'])
        self.assertEqual(self.provider.posts, 1)

    def test_frame_capture_disables_generated_overlay(self):
        from PIL import Image
        Image.new('RGB', (2, 2), 'red').save('frame.png')
        def run(command, **kwargs):
            self.assertEqual(kwargs['env']['MF_BROLL_CAPTURE'], '1')
            return subprocess.CompletedProcess(command, 0, 'wrote frame.png\n', '')
        with patch.object(broll.subprocess, 'run', side_effect=run):
            self.assertTrue(broll.frame('16x9', 's1').startswith(b'\xff\xd8'))

    def test_raw_video_survives_invalid_fps_and_does_not_execute_code(self):
        broll.submit_or_resume(self.manifest, self.body, transport=self.provider)
        result = subprocess.CompletedProcess([], 0, "__import__('os').system('touch injected')", '')
        with patch.object(broll.subprocess, 'run', return_value=result):
            with self.assertRaises(ValueError):
                broll.materialize(self.manifest, 'bridge_16x9', '16x9', 4, transport=self.provider)
        self.assertEqual((self.manifest.parent / 'source.mp4').read_bytes(), b'video')
        self.assertFalse(Path('injected').exists())

    def test_replacing_outputs_archives_them(self):
        root = Path('assets/broll')
        (root / 'bridge_16x9').mkdir()
        (root / 'bridge_16x9/0001.jpg').write_bytes(b'expensive')
        (root / 'bridge_16x9.mp4').write_bytes(b'old-master')
        broll.archive_outputs('bridge_16x9')
        versions = list((root / 'versions/bridge_16x9').iterdir())
        self.assertEqual(len(versions), 1)
        self.assertEqual((versions[0] / 'bridge_16x9/0001.jpg').read_bytes(), b'expensive')
        self.assertEqual((versions[0] / 'bridge_16x9.mp4').read_bytes(), b'old-master')

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'ffmpeg required')
    def test_full_run_publishes_compatible_output_and_reuses_it_without_charge(self):
        subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=32x18:r=24',
                        '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', 'fixture.mp4'], check=True)
        self.provider.content = Path('fixture.mp4').read_bytes()
        broll.save('timeline.json', {'formats': ['16x9'], 'broll': [BRIDGE]})
        with patch.object(broll, 'call', self.provider), patch.object(broll, 'frame', side_effect=lambda fmt, at: at.encode()), \
                patch.dict(broll.SIZE, {'16x9': (32, 18)}), patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test-only'}):
            broll.main(['--yes', '--max-cost', '1'])
            broll.main(['--yes', '--max-cost', '0'])
        self.assertEqual(self.provider.posts, 1)
        output = broll.read('timeline.json')['broll'][0]['_out']['16x9']
        self.assertEqual(output, {'fps': 24.0, 'frames': 96})
        self.assertEqual(len(list(Path('assets/broll/bridge_16x9').glob('*.jpg'))), 96)
        current = broll.current_run('bridge_16x9')
        self.assertTrue((current.parent / 'source.mp4').exists())
        self.assertEqual(broll.read(current)['state'], 'ready')

    @unittest.skipUnless(shutil.which('node'), 'node required')
    def test_renderer_capture_hook_removes_only_broll_before_scene_initialization(self):
        # Execute the actual callback used by addInitScript; recording and all marks survive.
        source = (SKILL / 'scripts/render.mjs').read_text()
        start = source.index("if (process.env.MF_BROLL_CAPTURE === '1') await page.addInitScript(")
        end = source.index('\n  page.on(', start)
        hook = source[start:end]
        script = "global.window = {}; const page = {addInitScript: async fn => fn()};\n" + hook + """
window.TL = {broll: [{_out: {}}], recording: {src: 'real'}, marks: {s1: 3}};
if (window.TL.broll.length || window.TL.recording.src !== 'real' || window.TL.marks.s1 !== 3) process.exit(1);
"""
        result = subprocess.run(['node', '--input-type=module', '-e', script], env={**os.environ, 'MF_BROLL_CAPTURE': '1'},
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
