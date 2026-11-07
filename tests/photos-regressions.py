"""Run via node:test. Fixtures are disposable; original image hashes must remain unchanged."""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'resources/scripts/photos.py'
spec = importlib.util.spec_from_file_location('photos', SCRIPT)
photos = importlib.util.module_from_spec(spec)
spec.loader.exec_module(photos)


def bmp(path):
    w = h = 40
    stride = (w * 3 + 3) & ~3
    pixels = b''.join(b''.join(bytes((x * 6, y * 6, (x + y) * 3)) for x in range(w)) + b'\0' * (stride - w * 3) for y in range(h))
    data = b'BM' + struct.pack('<IHHI', 54 + len(pixels), 0, 0, 54)
    data += struct.pack('<IiiHHIIiiII', 40, w, h, 1, 24, 0, len(pixels), 0, 0, 0, 0) + pixels
    path.write_bytes(data)


class PhotoTests(unittest.TestCase):
    def test_windows_paths_use_json_not_shell_interpolation(self):
        name = 'C:/Users/测试/Pictures/a & $(test).bmp'
        completed = subprocess.CompletedProcess([], 0, json.dumps([{'path': name, 'hash': 'ffffffffffffffff'}]), '')
        with patch.object(photos.subprocess, 'run', return_value=completed) as run:
            result = photos.windows_hashes([{'path': name}])
        self.assertEqual(result[name], (1 << 64) - 1)
        args, kwargs = run.call_args
        self.assertIn('-EncodedCommand', args[0])
        self.assertNotIn(name, base64.b64decode(args[0][-1]).decode('utf-16-le'))
        self.assertEqual(json.loads(kwargs['input']), [name])

    def test_missing_windows_decoder_is_an_error_not_an_empty_success(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / 'out.json'
            files = [dict(path='C:/fixture.bmp', kb=300, mtime=1, size=307200)]
            with patch.object(sys, 'platform', 'win32'), patch.object(sys, 'argv', ['photos.py', '--json', str(out)]), patch.object(photos, 'collect', return_value=(files, {'cloud': 0, 'package': 0})), patch.object(photos.subprocess, 'run', side_effect=FileNotFoundError('powershell.exe')):
                with self.assertRaises(FileNotFoundError):
                    photos.main()
            self.assertFalse(out.exists())

    def test_all_unsupported_images_fail_clearly(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / 'out.json'
            files = [dict(path='C:/fixture.heic', kb=300, mtime=1, size=307200)]
            completed = subprocess.CompletedProcess([], 0, '[{"path":"C:/fixture.heic","error":"unsupported"}]', '')
            with patch.object(sys, 'platform', 'win32'), patch.object(sys, 'argv', ['photos.py', '--json', str(out)]), patch.object(photos, 'collect', return_value=(files, {'cloud': 0, 'package': 0})), patch.object(photos.subprocess, 'run', return_value=completed):
                with self.assertRaisesRegex(RuntimeError, 'No images could be decoded'):
                    photos.main()
            self.assertFalse(out.exists())

    def test_cloud_and_package_dirs_are_skipped(self):
        with tempfile.TemporaryDirectory() as td:
            home = Path(td) / 'home'
            pictures = home / 'Pictures'
            pictures.mkdir(parents=True)
            (pictures / 'a.bmp').write_bytes(b'x')
            cloud = home / 'OneDrive'
            cloud.mkdir(parents=True)
            (cloud / 'cloud-only.bmp').write_bytes(b'x')
            package = pictures / 'My Library.photoslibrary'
            package.mkdir()
            (package / 'inside.bmp').write_bytes(b'x')
            os.environ['DEEPCLEAN_CLOUD_ROOTS'] = json.dumps([str(cloud)])
            try:
                files, stats = photos.collect([pictures, cloud], 0, 100)
            finally:
                os.environ.pop('DEEPCLEAN_CLOUD_ROOTS', None)
            self.assertEqual([Path(f['path']).name for f in files], ['a.bmp'],
                             'cloud/packages must not produce cleanup candidates')
            self.assertGreaterEqual(stats['package'], 1)
            self.assertGreaterEqual(stats['cloud'], 1)

    def test_exif_swapped_bitmap_dimensions_are_normalized(self):
        # EXIF Orientation 5/6/7/8 时 sips 输出 8 宽 x 9 高；dhash 必须先转置再取 8x9。
        normal = [[y * 9 + x for x in range(9)] for y in range(8)]
        self.assertEqual(photos.normalize_gray(normal), normal)
        swapped = [[y * 8 + x for x in range(8)] for y in range(9)]
        fixed = photos.normalize_gray(swapped)
        self.assertEqual((len(fixed), len(fixed[0])), (8, 9))
        self.assertEqual(fixed, [list(row) for row in zip(*swapped)])
        with self.assertRaises(ValueError):
            photos.normalize_gray([[0] * 8 for _ in range(8)])
        with self.assertRaises(ValueError):
            photos.normalize_gray([])

    @unittest.skipUnless(sys.platform == 'win32' or shutil.which('sips'), 'requires native Windows or macOS decoder')
    def test_native_identical_images_and_thumbnail_are_read_only(self):
        with tempfile.TemporaryDirectory() as td:
            home = Path(td) / '测试 home'
            pictures = home / 'Pictures'
            pictures.mkdir(parents=True)
            a = pictures / 'a & test.bmp'
            b = pictures / '照片.bmp'
            bmp(a)
            shutil.copyfile(a, b)
            corrupt = pictures / 'broken.jpg'
            corrupt.write_bytes(b'not a valid image')
            originals = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (a, b, corrupt)}
            out = Path(td) / 'report.json'
            cmd = [sys.executable, str(SCRIPT), '--home', str(home), '--min-kb', '0', '--json', str(out)]
            proc = subprocess.run(cmd, capture_output=True, timeout=90)
            self.assertEqual(proc.returncode, 0, proc.stderr.decode('utf-8', errors='replace'))
            report = json.loads(out.read_text(encoding='utf-8'))
            self.assertEqual(report['scanned'], 3)
            self.assertEqual(report['compared'], 2)
            self.assertEqual(report['skipped'], 1)
            self.assertEqual(len(report['groups']), 1)
            self.assertEqual(len(report['groups'][0]['items']), 2)
            thumbnail = Path(td) / 'thumb.jpg'
            if sys.platform == 'win32':
                proc = subprocess.run(photos.windows_command('thumbnail'), input=json.dumps({'path': str(a), 'output': str(thumbnail), 'size': 64}, ensure_ascii=False), encoding='utf-8', capture_output=True, timeout=30)
            else:
                proc = subprocess.run(['sips', '-Z', '64', '-s', 'format', 'jpeg', str(a), '--out', str(thumbnail)], capture_output=True, timeout=30)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertTrue(thumbnail.read_bytes().startswith(b'\xff\xd8'))
            self.assertEqual(originals, {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (a, b, corrupt)})


if __name__ == '__main__':
    unittest.main()
