#!/usr/bin/env python3
"""Windows 扫描器纯函数回归（跨平台可跑，不触注册表/ctypes）：

- big_files：返回 mtime、先排序后取 top-N、超过时间预算即截断；
- render：cleanable=False / admin 缓存不进「推荐清理」表与「预计可释放」估算。

由 tests/scanner.test.mjs 调用，macOS 与 Windows CI 都执行。
"""
import argparse
import importlib.util
import shutil
import sys
import tempfile
import time
from pathlib import Path

# Windows 的管道/控制台默认 cp1252，直接 print 中文会抛 UnicodeEncodeError；
# 与 resources/scripts/platforms/windows.py 的 _stdout_utf8 保持一致，强制 UTF-8。
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

SPEC = Path(__file__).resolve().parent.parent / "resources" / "scripts" / "platforms" / "windows.py"
loader = importlib.util.spec_from_file_location("winscan", SPEC)
win = importlib.util.module_from_spec(loader)
loader.loader.exec_module(win)

fails = []


def check(name, cond, detail=""):
    print(("PASS  " if cond else "FAIL  ") + name + ("" if cond else f" {detail}"))
    if not cond:
        fails.append(name)


tmp = Path(tempfile.mkdtemp(prefix="dc-win-regress 中文 "))
try:
    home = tmp / "home 用户"
    home.mkdir()
    for i, mb in enumerate([3, 1, 2]):
        (home / f"f{i}.bin").write_bytes(b"x" * mb * 1024 * 1024)

    rows, trunc = win.big_files(str(home), 1, [])
    check("big_files 返回 mtime", all(isinstance(r.get("mtime"), int) and r["mtime"] > 0 for r in rows),
          repr(rows))
    check("big_files 按大小降序", [r["bytes"] for r in rows] == sorted((r["bytes"] for r in rows), reverse=True),
          repr([r["bytes"] for r in rows]))
    check("big_files 预算内不截断", not trunc)

    _rows, trunc2 = win.big_files(str(home), 1, [], deadline=time.time() - 1)
    check("big_files 超预算即截断", trunc2)

    caches = [
        {"path": "C:/ok-cache", "label": "OK", "kb": 100, "safe": True, "system": False,
         "admin": False, "cleanable": True, "advice": "缓存，可重建"},
        {"path": "C:/Windows/Temp", "label": "系统临时文件", "kb": 9000, "safe": True, "system": False,
         "admin": True, "cleanable": False, "advice": "需要管理员权限；建议用「磁盘清理」处理"},
        {"path": "C:/Users/x/AppData/Local/Temp", "label": "用户临时文件", "kb": 8000, "safe": True,
         "system": False, "admin": False, "cleanable": False, "advice": "程序运行中持续使用；建议用「磁盘清理」处理"},
    ]
    report = {"version": win.VERSION, "platform": "windows", "generatedAt": "x", "host": "h",
              "home": str(tmp), "access": {"admin": False, "detail": "普通用户"},
              "installedCount": 0, "disk": {"total": 1, "used": 1, "free": 1},
              "caches": caches, "leftovers": [], "devCaches": [], "cloud": [], "appCaches": [],
              "bigFiles": [], "truncated": False, "elapsed": 0.1, "scope": "x"}
    ns = argparse.Namespace(redact=False, quick=True, min_mb=300, min_leftover_mb=10)
    md = win.render(report, ns)
    sec1 = md.split("## 一、")[1].split("## 二、")[0]
    check("推荐清理表保留可清理项", "C:/ok-cache" in sec1, sec1[:200])
    check("推荐清理表排除 admin/不可清理项", "Windows/Temp" not in sec1 and "Local/Temp" not in sec1, sec1[:200])
    sec6 = md.split("## 六、")[1].split("## 七、")[0]
    check("暂不可清理项列入不建议清理表", "Windows/Temp" in sec6 and "Local/Temp" in sec6, sec6[:300])
    check("预计可释放排除不可清理项", "**100K**" in md and "8.9M" not in md, md[-600:])
    check("建议命令不含不可清理项", "Move-Item" not in md or "C:/ok-cache" in md.split("```powershell")[1])
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print(f"\n回归结果：{'通过' if not fails else '失败 ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
