#!/usr/bin/env python3
"""Windows 扫描器纯函数回归（跨平台可跑，不触注册表/ctypes）：

- big_files：返回 mtime、先排序后取 top-N、超过时间预算即截断；
- render：cleanable=False / admin 缓存不进「推荐清理」表与「预计可释放」估算。

由 tests/scanner.test.mjs 调用，macOS 与 Windows CI 都执行。
"""
import argparse
import importlib.util
import os
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
              "caches": caches, "leftoverGroups": [], "devCaches": [], "cloudStorage": [],
              "browsers": [{"name": "Chrome", "path": "C:/chrome-cache", "kb": 50, "running": False}],
              "appCaches": [],
              "bigFiles": [], "truncated": False, "elapsed": 0.1, "scope": "x",
              "estimate": {"safeKb": 0, "confirmKb": 0, "cacheKb": 100, "devKb": 0,
                           "overlapKb": 0, "totalKb": 100}}
    ns = argparse.Namespace(redact=False, quick=True, min_mb=300, min_leftover_mb=10)
    md = win.render(report, ns)
    sec1 = md.split("## 一、")[1].split("## 二、")[0]
    check("推荐清理表保留可清理项", "C:/ok-cache" in sec1, sec1[:200])
    check("推荐清理表排除 admin/不可清理项", "Windows/Temp" not in sec1 and "Local/Temp" not in sec1, sec1[:200])
    check("推荐清理表含浏览器缓存", "C:/chrome-cache" in sec1, sec1[:200])
    sec7 = md.split("## 七、")[1].split("## 八、")[0]
    check("暂不可清理项列入不建议清理表", "Windows/Temp" in sec7 and "Local/Temp" in sec7, sec7[:300])
    check("预计可释放排除不可清理项", "**100K**" in md and "8.9M" not in md, md[-600:])
    check("建议命令不含不可清理项", "Move-Item" not in md or "C:/ok-cache" in md.split("```powershell")[1])
    check("系统盘盘符缺省为 C:", "系统盘 C:" in md)
    report_d = {**report, "disk": {"total": 1, "used": 1, "free": 1, "drive": "D:"}}
    check("系统盘盘符来自 SystemDrive", "系统盘 D:" in win.render(report_d, ns))

    # 卸载残留 bucket 判定：整容器一律 confirm，safe 只来自缓存子目录拆分
    check("媒体小残留也需确认", win.classify_leftover("TenVideo", 10 * 1024)[0] == "confirm")
    check("媒体大残留需确认", win.classify_leftover("TenVideo", 60 * 1024)[0] == "confirm")
    check("会议残留需确认", win.classify_leftover("Zoom", 5 * 1024)[0] == "confirm")
    check("未知目录需确认", win.classify_leftover("SomeVendor", 5 * 1024)[0] == "confirm")

    # 已安装判定：中文 DisplayName / 版本号 / InstallLocation 都能匹配，宁多判已安装
    apps = {
        "Zoom Workplace": {"display": "Zoom Workplace", "installLocation": None},
        "爱奇艺 12.0 (x64)": {"display": "爱奇艺 12.0 (x64)", "installLocation": "C:/Program Files/IQIYI Video"},
    }
    tokens = win.installed_tokens(apps)
    check("归一化去掉版本号与括号", win._norm_name("爱奇艺 12.0 (x64)") == "爱奇艺")
    check("英文 DisplayName 匹配目录名", win.dir_name_matches_installed("Zoom", tokens))
    check("InstallLocation 匹配中文名应用", win.dir_name_matches_installed("IQIYI Video", tokens))
    check("未安装目录不误判", not win.dir_name_matches_installed("SomeVendor", tokens))

    # 浏览器多 profile 枚举：Default + Profile N + Firefox cache2
    local = tmp / "Local"
    for prof in ("Default", "Profile 2", "Crashpad"):
        cache = local / "Google" / "Chrome" / "User Data" / prof / "Cache"
        cache.mkdir(parents=True, exist_ok=True)
    (local / "Microsoft" / "Edge" / "User Data" / "Default" / "Cache").mkdir(parents=True)
    ff = tmp / "Roaming" / "Mozilla" / "Firefox" / "Profiles" / "abc.default" / "cache2"
    ff.mkdir(parents=True)
    old_local, old_roaming = os.environ.get("LOCALAPPDATA"), os.environ.get("APPDATA")
    os.environ["LOCALAPPDATA"], os.environ["APPDATA"] = str(local), str(tmp / "Roaming")
    try:
        specs = win.browser_specs()
    finally:
        if old_local is None:
            del os.environ["LOCALAPPDATA"]
        else:
            os.environ["LOCALAPPDATA"] = old_local
        if old_roaming is None:
            del os.environ["APPDATA"]
        else:
            os.environ["APPDATA"] = old_roaming
    names = sorted(s["name"] for s in specs)
    check("浏览器多 profile 枚举",
          names == ["Chrome", "Chrome（Profile 2）", "Edge", "Firefox"], repr(names))
    check("非 profile 目录不进入浏览器列表", all("Crashpad" not in s["path"] for s in specs))

    # 运行中进程解析：tasklist CSV → exe 名集合 → 浏览器 running 判定
    sample = ('"chrome.exe","1234","Console","1","100,000 K"\r\n'
              '"msedge.exe","2345","Console","1","50,000 K"\r\n'
              'INFO: No tasks are running which match the specified criteria.')
    names = win.parse_tasklist(sample)
    check("parse_tasklist 解析 exe 名", names == {"chrome.exe", "msedge.exe"}, repr(names))
    check("browser_exe 前缀匹配",
          win.browser_exe("Chrome（Profile 2）") == "chrome.exe"
          and win.browser_exe("Firefox") == "firefox.exe"
          and win.browser_exe("未知") == "")
    # 卸载残留细粒度拆分（纯函数，跨平台可跑）
    leftover = tmp / "AppData" / "Local" / "SomeApp"
    (leftover / "Cache").mkdir(parents=True)
    (leftover / "Temp").mkdir()
    (leftover / "Documents" / "Cache").mkdir(parents=True)
    found = sorted(os.path.relpath(p, leftover) for p in win.cache_subdirs(str(leftover)))
    check("windows cache_subdirs 只命中缓存目录", found == ["Cache", "Temp"], repr(found))
    wgroups = [{"baseId": "SomeApp", "name": "SomeApp", "kb": 10000, "count": 1, "bucket": "confirm",
                "why": "未匹配到已安装程序；可能含用户数据", "paths": [str(leftover)], "bundleIds": []}]
    win.apply_leftover_cache_split(wgroups, {str(leftover): {"kb": 6000, "paths": [str(leftover / "Cache")]}})
    # 目录名本身是 Cache/Temp 时不能自命中（否则整容器会被当成 safe 组）
    cache_named = tmp / "AppData" / "Local" / "Cache"
    cache_named.mkdir(parents=True)
    check("cache_subdirs 不把容器自身当缓存", win.cache_subdirs(str(cache_named)) == [], repr(win.cache_subdirs(str(cache_named))))
    outside = tmp / "outside-split"
    outside.mkdir()
    g_out = [{"baseId": "SomeApp", "name": "SomeApp", "kb": 10000, "count": 1, "bucket": "confirm",
              "why": "未匹配到已安装程序", "paths": [str(leftover)], "bundleIds": []}]
    win.apply_leftover_cache_split(g_out, {str(leftover): {"kb": 6000, "paths": [str(outside)]}})
    check("拆分路径逃逸容器时不拆", all(not g.get("cachePart") for g in g_out) and g_out[0]["kb"] == 10000, repr(g_out))
    # 运行中/聊天类/安装表缺失时不拆
    apps = {"SomeApp": {"display": "SomeApp", "installLocation": None}}
    check("聊天类残留不拆", not win.should_split_leftover("WeChat", apps, set()))
    check("运行中残留不拆", not win.should_split_leftover("SomeApp", apps, {"someapp.exe"}))
    check("安装表缺失时 fail-closed", not win.should_split_leftover("SomeApp", {}, set()))
    check("普通未安装残留可拆", win.should_split_leftover("SomeApp", apps, set()))
    wsplit = [g for g in wgroups if g.get("cachePart")]
    check("windows 拆分出 safe 缓存组", len(wsplit) == 1 and wsplit[0]["bucket"] == "safe", repr(wgroups))
    check("windows 原 confirm 组扣减缓存大小", [g for g in wgroups if g["baseId"] == "SomeApp"][0]["kb"] == 4000, repr(wgroups))
    wrunning = [{"baseId": "RunApp", "name": "RunApp", "kb": 100, "count": 1, "bucket": "safe",
                 "why": "x", "paths": [str(leftover)], "bundleIds": []}]
    win.apply_leftover_cache_split(wrunning, {str(leftover): {"kb": 60, "paths": ["Cache"]}})
    check("windows 非 confirm 组不拆分", not any(g.get("cachePart") for g in wrunning), repr(wrunning))
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print(f"\n回归结果：{'通过' if not fails else '失败 ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
