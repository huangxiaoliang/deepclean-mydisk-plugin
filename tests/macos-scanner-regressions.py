#!/usr/bin/env python3
"""macOS 扫描器回归：big_files 流式 top-N 堆（不再 head 截断）、prune、预算截断。

依赖 POSIX find，Windows CI 上自动跳过。
由 tests/scanner.test.mjs 调用。
"""
import importlib.util
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

SPEC = Path(__file__).resolve().parent.parent / "resources" / "scripts" / "scan.py"
loader = importlib.util.spec_from_file_location("macscan", SPEC)
mac = importlib.util.module_from_spec(loader)
loader.loader.exec_module(mac)

fails = []


def check(name, cond, detail=""):
    print(("PASS  " if cond else "FAIL  ") + name + ("" if cond else f" {detail}"))
    if not cond:
        fails.append(name)


if os.name == "nt":
    print("SKIP  依赖 POSIX find，Windows 上跳过")
    sys.exit(0)

tmp = Path(tempfile.mkdtemp(prefix="dc-mac-regress 中文 "))
try:
    home = tmp / "home 用户"
    home.mkdir()
    # 50 个候选（超过旧实现 head -40 的截断线），按创建顺序体积递增：
    # 若仍是「先截断后排序」，top-15 里会漏掉最后创建的这批最大文件。
    for i in range(50):
        (home / f"f{i:02d}.bin").write_bytes(b"x" * (10 + i * 10) * 1024)
    # prune 目录里的超大文件不应入选
    nm = home / "node_modules"
    nm.mkdir()
    (nm / "huge.bin").write_bytes(b"x" * 5 * 1024 * 1024)

    rows, trunc = mac.big_files(str(home), 0, top=15)
    sizes = [r["bytes"] for r in rows]
    check("返回 top-15 且按大小降序", len(rows) == 15 and sizes == sorted(sizes, reverse=True), repr(sizes))
    expect = sorted(((10 + i * 10) * 1024 for i in range(35, 50)), reverse=True)
    check("最大的 15 个全部入选（无遍历顺序偏置）", sizes == expect,
          f"expect {expect[:3]}… got {sizes[:3]}…")
    check("node_modules 被 prune", all("node_modules" not in r["path"] for r in rows), repr(rows[:2]))
    check("预算内不截断", not trunc)
    check("返回 mtime/atime", all(isinstance(r.get("mtime"), int) and isinstance(r.get("atime"), int) for r in rows))

    # App 包目录（照片图库）内部文件不进入大文件清单
    pkg = home / "Pictures" / "Photos Library.photoslibrary"
    pkg.mkdir(parents=True)
    (pkg / "originals.bin").write_bytes(b"x" * 6 * 1024 * 1024)
    rows_pkg, _ = mac.big_files(str(home), 1, top=15)
    check("照片图库内部文件不进大文件", all(".photoslibrary" not in r["path"] for r in rows_pkg), repr(rows_pkg[:2]))

    # 卸载残留整容器一律 confirm；safe 只来自 cache_subdirs 拆出的缓存子目录
    rules = mac.load_rules()
    check("媒体残留整容器 confirm", mac.classify("com.tenvideo.player", 10 * 1024, rules)[0] == "confirm")
    check("会议残留整容器 confirm", mac.classify("com.zoom.xos", 5 * 1024, rules)[0] == "confirm")
    check("未知残留 confirm", mac.classify("com.somevendor.app", 5 * 1024, rules)[0] == "confirm")

    # 卸载残留细粒度拆分：缓存子目录单独成 safe 组，其余保持 confirm
    container = tmp / "Containers" / "com.example.app"
    (container / "Data" / "Library" / "Caches").mkdir(parents=True)
    (container / "Data" / "Library" / "Caches" / "blob.bin").write_bytes(b"x" * 4096)
    (container / "Data" / "tmp").mkdir(parents=True)
    (container / "Data" / "Documents" / "Caches").mkdir(parents=True)  # 个人目录里的同名目录不算缓存
    (container / "Data" / "Documents" / "note.txt").write_text("x")
    cache_named = tmp / "Containers" / "com.example.cache"
    (cache_named / "Data").mkdir(parents=True)
    check("cache_subdirs 不把容器自身当缓存", mac.cache_subdirs(str(cache_named)) == [], repr(mac.cache_subdirs(str(cache_named))))
    outside = tmp / "outside-split"
    outside.mkdir()
    g_out = {"com.example.app": {"baseId": "com.example.app", "name": "示例", "kb": 10000, "count": 1,
                                 "bucket": "confirm", "why": "未知来源", "paths": [str(container)], "bundleIds": []}}
    mac.apply_leftover_cache_split(g_out, {"com.example.app": {"kb": 6000, "paths": [str(outside)]}})
    check("拆分路径逃逸容器时不拆", "com.example.app.cache" not in g_out and g_out["com.example.app"]["kb"] == 10000, repr(g_out))
    found = sorted(os.path.relpath(p, container) for p in mac.cache_subdirs(str(container)))
    check("cache_subdirs 只命中缓存目录", found == ["Data/Library/Caches", "Data/tmp"], repr(found))
    groups = {"com.example.app": {"baseId": "com.example.app", "name": "示例", "kb": 10000, "count": 1,
                                  "bucket": "confirm", "why": "未知来源，需人工确认",
                                  "paths": [str(container)], "bundleIds": []}}
    split_paths = [str(container / "Data" / "Library" / "Caches"), str(container / "Data" / "tmp")]
    mac.apply_leftover_cache_split(groups, {"com.example.app": {"kb": 6000, "paths": split_paths}})
    split = groups.get("com.example.app.cache")
    check("拆分出 safe 缓存组", bool(split) and split["bucket"] == "safe" and split.get("cachePart") is True, repr(groups))
    check("原 confirm 组扣减缓存大小", groups["com.example.app"]["kb"] == 4000, repr(groups["com.example.app"]))
    check("原组说明标记已拆分", "单独列出" in groups["com.example.app"]["why"])
    running = {"x": {"baseId": "x", "name": "x", "kb": 100, "count": 1, "bucket": "confirm",
                     "why": "可能含数据；检测到相关进程正在运行，暂不可清理", "paths": ["/p"], "bundleIds": []}}
    mac.apply_leftover_cache_split(running, {"x": {"kb": 60, "paths": ["c"]}})
    check("运行中的残留不拆分", "x.cache" not in running, repr(running))
    tiny = {"y": {"baseId": "y", "name": "y", "kb": 500, "count": 1, "bucket": "confirm",
                  "why": "w", "paths": ["/q"], "bundleIds": []}}
    mac.apply_leftover_cache_split(tiny, {"y": {"kb": 100, "paths": ["d"]}})
    check("小于 1MB 的缓存不单列", "y.cache" not in tiny and tiny["y"]["kb"] == 500, repr(tiny))

    _rows2, trunc2 = mac.big_files(str(home), 0, top=15, deadline=time.time() - 1)
    check("超预算即截断", trunc2)

    rows3, _ = mac.big_files(str(home / "不存在"), 0, top=15)
    check("目录不存在返回空", rows3 == [])

    # 浏览器缓存：运行中的浏览器标 running（宿主会把它挡在清理允许集合外）
    bhome = tmp / "bhome"
    chrome = bhome / "Library" / "Caches" / "Google" / "Chrome"
    chrome.mkdir(parents=True)
    (chrome / "f.bin").write_bytes(b"x" * 2048)
    running = mac.browser_caches(bhome, "501 /applications/google chrome.app/contents/macos/google chrome")
    idle = mac.browser_caches(bhome, "")
    check("运行中的浏览器标记 running", bool(running) and running[0]["running"] is True, repr(running))
    check("无进程快照时不标 running", bool(idle) and idle[0]["running"] is False, repr(idle))
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print()
if fails:
    print(f"{len(fails)} 项失败")
    sys.exit(1)
print("全部通过")
