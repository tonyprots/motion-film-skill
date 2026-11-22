"""Local registry preserves provenance revisions and rejects changed, missing, or escaping files."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SKILL = Path(__file__).resolve().parents[1]
SCRIPT = SKILL / 'scripts/assets.py'
spec = importlib.util.spec_from_file_location('asset_registry', SCRIPT)
registry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(registry)


class AssetRegistry(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = Path(os.environ.get('MOTION_ASSETS_TEST_DIR') or tempfile.mkdtemp(prefix='motion-assets-'))
        cls.base.mkdir(parents=True, exist_ok=True)
        print('evidence:', cls.base)

    def setUp(self):
        self.root = self.base / self._testMethodName
        (self.root / 'assets').mkdir(parents=True)
        self.asset = self.root / 'assets/image.svg'
        self.asset.write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')

    def run_cli(self, *args, success=True):
        result = subprocess.run([sys.executable, str(SCRIPT), *args], cwd=self.root, capture_output=True, text=True, timeout=10)
        if success:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        return json.loads(result.stdout)

    def test_old_project_is_opt_in_and_unknown_license_warns(self):
        self.assertEqual(self.run_cli('check')['status'], 'NOT CHECKED')
        self.assertFalse((self.root / 'assets/manifest.json').exists())
        self.run_cli('add', 'assets/image.svg')
        checked = self.run_cli('check')
        self.assertEqual(checked['status'], 'WARN')
        self.assertEqual([c['level'] for c in checked['checks']], ['PASS', 'WARN'])

    def test_changed_and_missing_files_fail_without_rewriting_manifest(self):
        self.run_cli('add', 'assets/image.svg', '--license', 'CC0-1.0', '--source', 'fixture:svg')
        manifest = self.root / 'assets/manifest.json'
        before = manifest.read_bytes()
        self.assertEqual(self.run_cli('check')['status'], 'PASS')
        self.asset.write_text('<svg xmlns="http://www.w3.org/2000/svg">x</svg>')
        self.assertEqual(self.run_cli('check', success=False)['status'], 'FAIL')
        self.run_cli('add', 'assets/image.svg', success=False)
        self.assertEqual(manifest.read_bytes(), before)
        self.asset.rename(self.root / 'assets/retained-image.svg')
        self.assertEqual(self.run_cli('check', success=False)['status'], 'FAIL')
        self.assertEqual(manifest.read_bytes(), before)

    def test_refresh_preserves_exact_previous_record_and_is_idempotent(self):
        self.run_cli('add', 'assets/image.svg', '--license', 'CC0-1.0', '--source', 'fixture:svg')
        manifest = self.root / 'assets/manifest.json'
        first = json.loads(manifest.read_text())['assets']['assets/image.svg'][0]
        self.asset.write_text('<svg><rect/></svg>')
        refreshed = self.run_cli('add', 'assets/image.svg', '--refresh')
        self.assertEqual(refreshed['revisions'], 2)
        revisions = json.loads(manifest.read_text())['assets']['assets/image.svg']
        self.assertEqual(revisions[0], first)
        self.assertEqual(revisions[1]['provenance'], first['provenance'])
        self.assertEqual(revisions[1]['license'], first['license'])
        before = manifest.read_bytes()
        self.assertEqual(self.run_cli('add', 'assets/image.svg')['status'], 'UNCHANGED')
        self.assertEqual(manifest.read_bytes(), before)

    def test_paths_and_retargeted_links_cannot_escape_project(self):
        outside = self.base / 'outside.svg'
        outside.write_text('outside')
        link = self.root / 'assets/link.svg'
        link.symlink_to(self.asset)
        self.run_cli('add', 'assets/link.svg', '--license', 'CC0-1.0')
        link.rename(self.root / 'assets/retained-link.svg')
        link.symlink_to(outside)
        self.run_cli('check', success=False)
        for value in ('../outside.svg', str(outside), 'assets/link.svg', 'C:\\outside.svg'):
            self.run_cli('add', value, success=False)
        self.assertEqual(outside.read_text(), 'outside')
        manifest = self.root / 'assets/manifest.json'
        manifest.rename(self.root / 'assets/retained-manifest.json')
        manifest.symlink_to(outside)
        self.run_cli('add', 'assets/image.svg', success=False)
        self.run_cli('check', success=False)
        self.assertEqual(outside.read_text(), 'outside')

    def test_existing_capture_sfx_and_broll_metadata_need_no_network(self):
        (self.root / 'assets/capture.json').write_text(json.dumps({'url': 'https://example.test/page', 'title': 'Demo'}))
        self.run_cli('add', 'assets/image.svg', '--metadata', 'assets/capture.json')
        (self.root / 'audio/sfx/click').mkdir(parents=True)
        (self.root / 'audio/sfx/click/click.wav').write_bytes(b'local audio fixture')
        (self.root / 'audio/sfx/index.json').write_text(json.dumps({'click': [{'file': 'click/click.wav',
            'licence': 'CC0-1.0', 'url': 'https://example.test/sound', 'author': 'Example'}]}))
        self.run_cli('add', 'audio/sfx/click/click.wav', '--metadata', 'audio/sfx/index.json')
        (self.root / 'assets/broll.mp4').write_bytes(b'local video fixture')
        (self.root / 'assets/broll.json').write_text(json.dumps({'model': 'example/video', 'job': 'job-1', 'fingerprint': 'request-hash'}))
        self.run_cli('add', 'assets/broll.mp4', '--metadata', 'assets/broll.json')
        data = json.loads((self.root / 'assets/manifest.json').read_text())['assets']
        self.assertEqual(data['assets/image.svg'][0]['provenance']['source'], 'https://example.test/page')
        self.assertEqual(data['audio/sfx/click/click.wav'][0]['license'], 'CC0-1.0')
        self.assertEqual(data['assets/broll.mp4'][0]['provenance']['job'], 'job-1')
        self.assertEqual(data['assets/broll.mp4'][0]['license'], 'unknown')

    def test_parallel_additions_preserve_both_entries(self):
        (self.root / 'assets/second.svg').write_text('<svg><circle/></svg>')
        processes = [subprocess.Popen([sys.executable, str(SCRIPT), 'add', path, '--license', 'CC0-1.0'],
                     cwd=self.root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                     for path in ('assets/image.svg', 'assets/second.svg')]
        for process in processes:
            stdout, stderr = process.communicate(timeout=10)
            self.assertEqual(process.returncode, 0, stdout + stderr)
        self.assertEqual(self.run_cli('check')['registered'], 2)


if __name__ == '__main__':
    unittest.main()
