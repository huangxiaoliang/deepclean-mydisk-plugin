"""Exercise the complete Windows scan with real synthetic browser directories.

Only OS discovery is stubbed. Enumeration, sizing, report generation and process
protection run together. Never enumerate the runner's registry or user profile.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from collections import namedtuple
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "windows_scan", Path(__file__).resolve().parents[2] / "resources/scripts/platforms/windows.py")
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)


class BrowserScan(unittest.TestCase):
    def test_complete_scan_with_browser_profiles(self):
        for browser, parts, exe in [
            ("Chrome", ("Google", "Chrome", "User Data", "Default", "Cache"), "chrome.exe"),
            ("Edge", ("Microsoft", "Edge", "User Data", "Profile 2", "Cache"), "msedge.exe"),
            ("Firefox", ("Mozilla", "Firefox", "Profiles", "test.default", "cache2"), "firefox.exe"),
        ]:
            with self.subTest(browser=browser), tempfile.TemporaryDirectory(prefix="dc-scan-中文-") as tmp:
                home = Path(tmp)
                local, roaming, programdata = home / "Local", home / "Roaming", home / "ProgramData"
                for directory in (local, roaming, programdata):
                    directory.mkdir()
                cache = (roaming if browser == "Firefox" else local).joinpath(*parts)
                cache.mkdir(parents=True)
                source = cache / "sample.bin"
                source.write_bytes(b"synthetic-cache" * 1024)
                original = source.read_bytes()
                args = argparse.Namespace(home=str(home), quick=True, top=20, min_mb=1,
                                          min_leftover_mb=10, redact=True)
                # Every discovery path stays inside this disposable fixture.
                env = {"USERPROFILE": str(home), "LOCALAPPDATA": str(local),
                       "APPDATA": str(roaming), "PROGRAMDATA": str(programdata)}
                with patch.dict(os.environ, env), \
                     patch.object(scanner, "installed_apps", return_value={}), \
                     patch.object(scanner, "is_admin", return_value=False), \
                     patch.object(scanner, "cloud_roots", return_value=[]), \
                     patch.object(scanner, "cache_specs", return_value=[]), \
                     patch.object(scanner, "dev_specs", return_value=[]), \
                     patch.object(scanner, "running_process_names", return_value={exe}), \
                     patch.object(scanner.shutil, "disk_usage", return_value=namedtuple("Usage", "total used free")(1000000, 400000, 600000)):
                    report = scanner.scan(args)
                    self.assertEqual(report["platform"], "windows")
                    self.assertEqual(len(report["browsers"]), 1)
                    self.assertTrue(report["browsers"][0]["running"])
                    self.assertGreater(report["browsers"][0]["kb"], 0)
                    markdown = scanner.render(report, args)
                    self.assertEqual(source.read_bytes(), original, "scan must leave input unchanged")
                    out = os.environ.get("DEEPCLEAN_CI_REPORT_DIR")
                    if out:
                        Path(out).mkdir(parents=True, exist_ok=True)
                        (Path(out) / f"scan-{browser}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
                        (Path(out) / f"scan-{browser}.md").write_text(markdown, encoding="utf-8")
                    recommended = markdown.split("## 一、")[1].split("## 二、")[0]
                    self.assertNotIn(str(cache), recommended, "running browser must not be recommended")


if __name__ == "__main__":
    unittest.main(verbosity=2)
