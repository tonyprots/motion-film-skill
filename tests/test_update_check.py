"""Users hear about a new release; the network is asked at most once a week.  python3 -m unittest discover tests"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import update_check as uc  # noqa: E402

DAY = 24 * 3600


def bump(version: str) -> str:
    major, minor, *_ = uc.parse_version(version)
    return f"v{major}.{minor + 1}.0"


class UpdateCheck(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.state = self.tmp / "update-check.json"
        os.environ.pop("MOTION_FILM_NO_UPDATE_CHECK", None)
        self.installed = uc.installed_version()
        self.assertTrue(self.installed, "VERSION missing next to scripts/")

    def test_network_at_most_once_a_week(self):
        calls = []
        fetch = lambda: calls.append(1) or "v0.1.0"  # noqa: E731
        for day in (0, 1, 6):
            uc.check(self.state, fetch=fetch, now=day * DAY)
        self.assertEqual(len(calls), 1)
        uc.check(self.state, fetch=fetch, now=7 * DAY)
        self.assertEqual(len(calls), 2)

    def test_newer_release_is_reported_from_cache(self):
        newer = bump(self.installed)
        uc.check(self.state, fetch=lambda: newer, now=0)
        found = uc.check(self.state, fetch=self.fail, now=DAY)   # cached: no second call
        self.assertEqual(found["latest"], newer.lstrip("v"))
        self.assertEqual(found["installed"], self.installed)
        self.assertIn(newer, found["how"])

    def test_same_or_older_release_is_silent(self):
        for tag in (f"v{self.installed}", "v0.1.0"):
            self.state.unlink(missing_ok=True)
            self.assertIsNone(uc.check(self.state, fetch=lambda: tag, now=0))

    def test_network_failure_keeps_last_answer_and_waits_a_week(self):
        newer = bump(self.installed)
        uc.check(self.state, fetch=lambda: newer, now=0)

        def offline():
            raise OSError("no network")

        self.assertTrue(uc.check(self.state, fetch=offline, now=8 * DAY))
        self.assertEqual(json.loads(self.state.read_text())["latest"], newer)
        self.assertFalse(uc.due(self.state, now=9 * DAY))

    def test_opt_out_never_touches_network(self):
        os.environ["MOTION_FILM_NO_UPDATE_CHECK"] = "1"
        try:
            self.assertIsNone(uc.check(self.state, fetch=self.fail, now=0))
        finally:
            del os.environ["MOTION_FILM_NO_UPDATE_CHECK"]

    def test_versions_compare_as_numbers(self):
        self.assertGreater(uc.parse_version("v1.10.0"), uc.parse_version("1.9.9"))
        self.assertIsNone(uc.parse_version("nightly"))

    def test_hint_follows_install(self):
        self.assertIn("git clone --branch v9.0.0", uc.update_hint("9.0.0", self.tmp))
        (self.tmp / ".git").mkdir()
        self.assertIn("checkout v9.0.0", uc.update_hint("9.0.0", self.tmp))


if __name__ == "__main__":
    unittest.main()
