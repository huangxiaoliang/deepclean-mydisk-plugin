#!/usr/bin/env python3
"""相似照片扫描（dHash）——只读分析，供插件「相似照片」页面展示与清理。

实现：系统解码器将图片缩成 9x8 → 灰度像素 → dHash64 → 汉明距离分组。
不依赖第三方库；macOS 用 sips，Windows 用 PowerShell/.NET 系统图片解码器。
"""
import argparse
import json
import os
import struct
import subprocess
import sys
import tempfile
import time
from pathlib import Path

EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".gif", ".webp", ".bmp", ".tiff"}
SKIP_DIRS = {"node_modules", ".git", ".Trash", "Library", "Photos Library.photoslibrary"}
PACKAGE_SUFFIXES = (
    ".photoslibrary", ".photolibrary", ".sparsebundle", ".fcpbundle", ".logicx",
    ".band", ".imovielibrary", ".tvlibrary", ".aplibrary",
)
CLOUD_ATTRS = 0x400000 | 0x40000 | 0x1000  # RECALL_ON_DATA_ACCESS | RECALL_ON_OPEN | OFFLINE
CLOUD_DIR_NAMES = ("onedrive", "dropbox", "google drive", "icloud drive")


def cloud_roots():
    """云盘根：照搬 tree.py 的规则（平台固定位置 + 环境变量 + DEEPCLEAN_CLOUD_ROOTS）。"""
    roots = []
    home = Path.home()
    if sys.platform == "darwin":
        roots += [home / "Library" / "CloudStorage", home / "Library" / "Mobile Documents"]
    else:
        for name in ("OneDrive", "OneDriveConsumer", "OneDriveCommercial"):
            value = os.environ.get(name)
            if value:
                roots.append(Path(value))
        try:
            for child in home.iterdir():
                if child.name.lower().startswith(CLOUD_DIR_NAMES):
                    roots.append(child)
        except OSError:
            pass
    extra = os.environ.get("DEEPCLEAN_CLOUD_ROOTS")
    if extra:
        try:
            roots += [Path(p) for p in json.loads(extra) if isinstance(p, str)]
        except (ValueError, TypeError):
            pass
    out = []
    for root in roots:
        try:
            out.append(str(root.resolve()))
        except OSError:
            continue
    return out


def is_cloud_path(path, roots):
    try:
        target = os.path.normcase(str(Path(path).resolve()))
    except OSError:
        return False
    for root in roots:
        base = os.path.normcase(str(Path(root).resolve()))
        if target == base or target.startswith(base + os.sep):
            return True
    return False


def is_package_dir(name):
    low = name.lower()
    return any(low.endswith(suffix) for suffix in PACKAGE_SUFFIXES)


def _progress(pct, label):
    try:
        print(f"PROGRESS {pct} {label}", file=sys.stderr, flush=True)
    except Exception:
        pass


def bmp_gray(path):
    """读 sips 产出的 9x8 BMP，返回 9x8 灰度（0-255）。"""
    b = open(path, "rb").read()
    if b[:2] != b"BM":
        raise ValueError("not BMP")
    off = struct.unpack_from("<I", b, 10)[0]
    w, h = struct.unpack_from("<ii", b, 18)
    bpp = struct.unpack_from("<H", b, 28)[0]
    if w < 2 or abs(h) < 1 or bpp not in (24, 32):
        raise ValueError(f"bad BMP w={w} h={h} bpp={bpp}")
    top_down = h < 0
    rows = abs(h)
    step = bpp // 8
    stride = ((w * bpp + 31) // 32) * 4
    gray = []
    for y in range(rows):
        row = y if top_down else rows - 1 - y
        base = off + row * stride
        line = []
        for x in range(w):
            i = base + x * step
            blue, green, red = b[i], b[i + 1], b[i + 2]
            line.append(int(0.299 * red + 0.587 * green + 0.114 * blue))
        gray.append(line)
    return gray


def windows_command(mode):
    if mode not in ("hash", "thumbnail"):
        raise ValueError("Unknown image operation")
    helper = Path(__file__).with_name("photos-windows.ps1")
    command = "& {\n" + helper.read_text(encoding="utf-8") + "\n} -Mode " + mode
    import base64
    encoded = base64.b64encode(command.encode("utf-16-le")).decode("ascii")
    return ["powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]


def windows_hashes(files):
    """Decode the batch in one PowerShell process; paths travel as UTF-8 JSON, not shell code."""
    result = subprocess.run(
        windows_command("hash"),
        input=json.dumps([f["path"] for f in files], ensure_ascii=False),
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=540)
    if result.returncode:
        raise RuntimeError("Windows image decoder failed: " + result.stderr.strip()[:500])
    rows = json.loads(result.stdout.lstrip("\ufeff"))
    return {r["path"]: int(r["hash"], 16) for r in rows if r.get("hash")}


def dhash(path):
    with tempfile.TemporaryDirectory(prefix="dc-photo-") as td:
        out = os.path.join(td, "x.bmp")
        subprocess.run(["sips", "-z", "8", "9", "-s", "format", "bmp", str(path), "--out", out],
                       capture_output=True, timeout=30, check=True)
        g = bmp_gray(out)
    bits = 0
    for y in range(8):
        for x in range(8):
            bits = (bits << 1) | (1 if g[y][x] > g[y][x + 1] else 0)
    return bits


def hamming(a, b):
    return bin(a ^ b).count("1")


def collect(dirs, min_kb, limit, stats=None):
    """收集候选图片；云盘目录与 App 包目录跳过（云端去重=删云端文件，包目录移动会破坏 App）。"""
    stats = stats if stats is not None else {"cloud": 0, "package": 0}
    clouds = cloud_roots()
    files = []
    for root in dirs:
        root = Path(root)
        if not root.is_dir():
            continue
        if is_cloud_path(root, clouds):
            stats["cloud"] += 1
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            kept = []
            for d in dirnames:
                if d in SKIP_DIRS or d.startswith("."):
                    continue
                child = Path(dirpath) / d
                if is_cloud_path(child, clouds):
                    stats["cloud"] += 1
                    continue
                if is_package_dir(d):
                    stats["package"] += 1
                    continue
                kept.append(d)
            dirnames[:] = kept
            for name in filenames:
                if Path(name).suffix.lower() not in EXTS:
                    continue
                p = Path(dirpath) / name
                try:
                    st = p.stat()
                except OSError:
                    continue
                if getattr(st, "st_file_attributes", 0) & CLOUD_ATTRS:
                    stats["cloud"] += 1
                    continue
                if st.st_size < min_kb * 1024:
                    continue
                files.append({"path": str(p), "kb": st.st_size // 1024, "mtime": int(st.st_mtime), "size": st.st_size})
    files.sort(key=lambda f: -f["size"])
    return files[:limit], stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", required=True)
    ap.add_argument("--limit", type=int, default=600)
    ap.add_argument("--min-kb", type=int, default=200)
    ap.add_argument("--home")
    args = ap.parse_args()
    home = Path(args.home).expanduser() if args.home else Path.home()
    dirs = [home / "Pictures", home / "Downloads", home / "Desktop", home / "Documents"]
    t0 = time.time()
    _progress(5, "查找图片")
    files, stats = collect(dirs, args.min_kb, args.limit)
    total = len(files)
    _progress(15, f"计算指纹（0/{total}）")
    if sys.platform == "win32" and files:
        hashes = windows_hashes(files)
        for f in files:
            f["hash"] = hashes.get(f["path"])
    else:
        for i, f in enumerate(files):
            try:
                f["hash"] = dhash(f["path"])
            except (FileNotFoundError, PermissionError):
                raise RuntimeError("Image decoder unavailable: sips")
            except (OSError, ValueError, struct.error, subprocess.SubprocessError):
                f["hash"] = None
            if i % 25 == 0:
                _progress(15 + int(70 * i / max(1, total)), f"计算指纹（{i}/{total}）")
    good = [f for f in files if f["hash"] is not None]
    if files and not good:
        raise RuntimeError("No images could be decoded; check image formats and the system decoder")
    _progress(88, "分组相似照片")
    parent = list(range(len(good)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for i in range(len(good)):
        for j in range(i + 1, len(good)):
            if hamming(good[i]["hash"], good[j]["hash"]) <= 6:
                union(i, j)
    groups = {}
    for i, f in enumerate(good):
        groups.setdefault(find(i), []).append(f)
    result = []
    for gi, items in groups.items():
        if len(items) < 2:
            continue
        items.sort(key=lambda x: -x["size"])
        total_kb = sum(x["kb"] for x in items)
        waste = total_kb - items[0]["kb"]
        result.append({
            "id": f"g{gi}",
            "items": [{k: it[k] for k in ("path", "kb", "mtime", "size")} for it in items],
            "totalKb": total_kb,
            "wastedKb": waste,
        })
    result.sort(key=lambda g: -g["wastedKb"])
    out = {"generatedAt": int(time.time() * 1000), "scanned": total,
           "compared": len(good), "skipped": total - len(good), "groups": result,
           "skippedCloud": stats.get("cloud", 0), "skippedPackages": stats.get("package", 0),
           "elapsed": round(time.time() - t0, 1)}
    Path(args.json).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    _progress(100, "完成")


if __name__ == "__main__":
    main()
