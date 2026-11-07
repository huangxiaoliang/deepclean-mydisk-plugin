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
from collections import namedtuple
from pathlib import Path
from unittest.mock import patch

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

    # 云盘 prune 必须按目录边界：`.../OneDriveBackup` 不是云盘，不能连带跳过
    cloud_home = tmp / "cloudhome"
    (cloud_home / "OneDrive").mkdir(parents=True)
    (cloud_home / "OneDrive" / "cloud.bin").write_bytes(b"x" * 2 * 1024 * 1024)
    (cloud_home / "OneDriveBackup").mkdir()
    (cloud_home / "OneDriveBackup" / "local.bin").write_bytes(b"x" * 2 * 1024 * 1024)
    crows, _ = win.big_files(str(cloud_home), 1, [str(cloud_home / "OneDrive")])
    crels = sorted(os.path.relpath(r["path"], cloud_home) for r in crows)
    check("big_files 仍跳过真正的云盘目录",
          os.path.join("OneDrive", "cloud.bin") not in crels, repr(crels))
    check("big_files 不把 OneDriveBackup 误当云盘",
          os.path.join("OneDriveBackup", "local.bin") in crels, repr(crels))

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

    # 建议命令的路径必须按 PowerShell 单引号规则转义：Windows 用户名带 ' 很常见
    # （如 O'Brien），未转义会让用户复制出来的 Move-Item 直接报解析错误。
    tricky = tmp / "O'Brien cache"
    tricky.mkdir()
    report_q = {**report, "caches": caches + [
        {"path": str(tricky), "label": "缓存", "kb": 200 * 1024, "safe": True, "system": False,
         "admin": False, "cleanable": True, "advice": "缓存，可重建"}]}
    cmd_text = win.render(report_q, ns).split("```powershell")[1].split("```")[0]
    check("建议命令转义单引号路径", "O''Brien cache" in cmd_text, cmd_text)

    # 先脱敏再转义：home 自身带 ' 时（合法 Windows 用户名），命令块也必须替换成
    # %USERPROFILE%；否则 --redact（disk_audit 默认）会把完整用户名路径泄漏到输出。
    quoted_home = str(tmp / "O'Brien")
    secret_cache = quoted_home + "/AppData/Local/Secret/Cache"
    report_r = {**report, "home": quoted_home, "caches": [
        {"path": secret_cache, "label": "缓存", "kb": 300 * 1024, "safe": True, "system": False,
         "admin": False, "cleanable": True, "advice": "缓存，可重建"}],
        "leftoverGroups": [{"baseId": "Secret", "name": "Secret", "kb": 250 * 1024, "count": 1,
                            "bucket": "safe", "why": "已卸载", "paths": [quoted_home + "/AppData/Local/Secret/Leftover"],
                            "bundleIds": []}]}
    ns_redact = argparse.Namespace(redact=True, quick=True, min_mb=300, min_leftover_mb=10)
    md_redacted = win.render(report_r, ns_redact)
    cmd_redacted = md_redacted.split("```powershell")[1].split("```")[0]
    check("命令块先脱敏再转义（home 含单引号）",
          "%USERPROFILE%" in cmd_redacted and "O'Brien" not in cmd_redacted
          and "O''Brien" not in cmd_redacted, cmd_redacted)
    check("脱敏报告不泄漏 home", "O'Brien" not in md_redacted, md_redacted[-500:])

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
    # 进程快照 fail-closed：tasklist 失败返回空集合时不能当成「全部未运行」
    check("空快照判定不可用", win.snapshot_available(set()) is False)
    check("非空快照判定可用", win.snapshot_available({"explorer.exe"}) is True)
    check("快照不可用时浏览器标 running", win.browser_running("Chrome", set()) is True)
    check("快照可用且浏览器未运行时不算 running",
          win.browser_running("Chrome", {"explorer.exe"}) is False)
    check("快照可用且浏览器进程命中时标 running",
          win.browser_running("Chrome（Profile 2）", {"chrome.exe"}) is True)
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
    check("聊天类残留不拆", not win.should_split_leftover("WeChat", apps, {"explorer.exe"}))
    check("运行中残留不拆", not win.should_split_leftover("SomeApp", apps, {"someapp.exe"}))
    check("安装表缺失时 fail-closed", not win.should_split_leftover("SomeApp", {}, {"explorer.exe"}))
    check("进程快照不可用时 fail-closed", not win.should_split_leftover("SomeApp", apps, set()))
    check("普通未安装残留可拆", win.should_split_leftover("SomeApp", apps, {"explorer.exe"}))
    wsplit = [g for g in wgroups if g.get("cachePart")]
    check("windows 拆分出 safe 缓存组", len(wsplit) == 1 and wsplit[0]["bucket"] == "safe", repr(wgroups))
    check("windows 原 confirm 组扣减缓存大小", [g for g in wgroups if g["baseId"] == "SomeApp"][0]["kb"] == 4000, repr(wgroups))
    wrunning = [{"baseId": "RunApp", "name": "RunApp", "kb": 100, "count": 1, "bucket": "safe",
                 "why": "x", "paths": [str(leftover)], "bundleIds": []}]
    win.apply_leftover_cache_split(wrunning, {str(leftover): {"kb": 60, "paths": ["Cache"]}})
    check("windows 非 confirm 组不拆分", not any(g.get("cachePart") for g in wrunning), repr(wrunning))

    # cache_specs 的 admin/system/cleanable 标记会被宿主 allowedPaths 直接信任；
    # 这里在临时目录上跑真实函数（不 stub），防止标记被悄悄改掉。
    saved_env = {k: os.environ.get(k) for k in
                 ("LOCALAPPDATA", "APPDATA", "TEMP", "TMP", "USERPROFILE")}
    saved_cwd = os.getcwd()
    try:
        local = tmp / "cs-local"
        (local / "Temp").mkdir(parents=True)
        (local / "CrashDumps").mkdir()
        (local / "npm-cache").mkdir()
        roaming = tmp / "cs-roaming"
        roaming.mkdir()
        temp_env = tmp / "cs-temp"
        temp_env.mkdir()
        os.environ["LOCALAPPDATA"] = str(local)
        os.environ["APPDATA"] = str(roaming)
        os.environ["TEMP"] = str(temp_env)
        os.environ.pop("TMP", None)
        os.environ["USERPROFILE"] = str(tmp / "cs-profile")
        # Path("C:/Windows/Temp") 在非 Windows 宿主上是相对路径：切到临时目录后
        # 它同样会命中下面创建的目录；Windows 上则直接命中真实系统目录，两平台走同一分支。
        # 注意 Windows 不允许创建名为 "C:" 的目录，只有 posix 才需要伪造盘符子目录。
        if os.name != "nt":
            sysroot = tmp / "cs-sysroot"
            (sysroot / "C:" / "Windows" / "Temp").mkdir(parents=True)
            (sysroot / "C:" / "Windows" / "SoftwareDistribution" / "Download").mkdir(parents=True)
            os.chdir(sysroot)
        specs = {s["label"]: s for s in win.cache_specs()}
        user_temp = specs.get("用户临时文件", {})
        check("cache_specs 用户 Temp 不可清理且非管理员",
              user_temp.get("cleanable") is False and user_temp.get("admin") is False, repr(user_temp))
        crash = specs.get("崩溃转储", {})
        check("cache_specs 崩溃转储可清理",
              crash.get("cleanable") is True and crash.get("system") is False and crash.get("admin") is False,
              repr(crash))
        sys_temp = specs.get("系统临时文件", {})
        check("cache_specs 系统 Temp 需管理员且不可清理",
              sys_temp.get("admin") is True and sys_temp.get("cleanable") is False
              and sys_temp.get("system") is False, repr(sys_temp))
        winupd = specs.get("Windows 更新缓存")
        if Path("C:/Windows/SoftwareDistribution/Download").exists():
            # 目录存在时必须有 spec：否则删掉 cache_specs() 里的 add(...) 会被 SKIP 掩盖。
            check("cache_specs 更新缓存标记 system 且不 safe",
                  winupd is not None and winupd.get("system") is True and winupd.get("safe") is False,
                  repr(winupd))
        else:
            # C:/Windows/SoftwareDistribution/Download 是真实系统目录，某些镜像可能没有；
            # 这条是环境依赖项，缺目录时显式 SKIP 而不是误报产品回归。
            print("SKIP  cache_specs 更新缓存（该平台没有 C:/Windows/SoftwareDistribution/Download）")
    finally:
        os.chdir(saved_cwd)
        for k, v in saved_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    # 云盘根（OneDrive 等）必须有正例：宿主 moveBlockReason/allowedPaths 依赖它。
    saved_cloud_env = {k: os.environ.get(k) for k in
                       ("USERPROFILE", "OneDrive", "OneDriveConsumer", "OneDriveCommercial")}
    try:
        profile = tmp / "cloud-profile"
        profile.mkdir()
        onedrive = profile / "OneDrive"
        onedrive.mkdir()
        (profile / "OneDrive - Contoso").mkdir()
        (profile / "Dropbox").mkdir()
        os.environ["USERPROFILE"] = str(profile)
        os.environ["OneDrive"] = str(onedrive)
        os.environ.pop("OneDriveConsumer", None)
        os.environ.pop("OneDriveCommercial", None)
        roots = set(win.cloud_roots())
        check("cloud_roots 识别 OneDrive 环境变量",
              str(onedrive.resolve()) in roots, repr(sorted(roots)))
        check("cloud_roots 识别 profile 下的 OneDrive 子目录",
              str((profile / "OneDrive - Contoso").resolve()) in roots, repr(sorted(roots)))
        check("cloud_roots 识别 Dropbox",
              str((profile / "Dropbox").resolve()) in roots, repr(sorted(roots)))
        # 前缀匹配必须有目录边界与 normcase（否则 OneDriveBackup 误判、大小写不同漏判）
        onedrive_root = str(onedrive.resolve())
        backup = os.path.join(str(profile.resolve()), "OneDriveBackup")
        check("云盘根自身判为云盘", win.under_cloud(onedrive_root, [onedrive_root]) is True)
        check("云盘子路径判为云盘",
              win.under_cloud(os.path.join(onedrive_root, "sub", "f.bin"), [onedrive_root]) is True)
        check("相似前缀目录不误判为云盘", win.under_cloud(backup, [onedrive_root]) is False)
        check("相似前缀子路径不误判为云盘",
              win.under_cloud(os.path.join(backup, "x.bin"), [onedrive_root]) is False)
        check("空路径/空根安全返回 False",
              win.under_cloud("", [onedrive_root]) is False and win.under_cloud(None, None) is False)
        if os.name == "nt":
            # 必须从已 resolve 的根构造子路径：mkdtemp 在 Windows 上可能返回带 8.3
            # 短名（RUNNER~1）的路径，而 onedrive_root 是 resolve() 后的长名；混用两种
            # 形式会让大小写用例因为路径本身不同而假失败。
            check("云盘路径大小写不同仍判为云盘",
                  win.under_cloud(str(Path(onedrive_root) / "Sub").upper(),
                                  [onedrive_root.lower()]) is True)
        else:
            print("SKIP  云盘路径大小写（POSIX 上 os.path.normcase 为恒等，大小写敏感）")
    finally:
        for k, v in saved_cloud_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    # estimate 口径：被 UI 隐藏的父级缓存不计入 cacheKb；safe/confirm 算法保持现状
    wbase = "C:/Users/x/AppData/Local/Temp"
    est_report = {
        "caches": [
            {"path": wbase + "/Google", "label": "缓存", "kb": 5000, "safe": True, "system": False,
             "admin": False, "cleanable": True, "advice": "缓存，可重建"},
            {"path": wbase + "/Other", "label": "缓存", "kb": 3000, "safe": True, "system": False,
             "admin": False, "cleanable": True, "advice": "缓存，可重建"},
            {"path": wbase + "/Keep", "label": "缓存", "kb": 2000, "safe": True, "system": False,
             "admin": False, "cleanable": True, "advice": "缓存，可重建"},
            {"path": wbase + "/WithDev", "label": "缓存", "kb": 1200, "safe": True, "system": False,
             "admin": False, "cleanable": True, "advice": "缓存，可重建"},
            {"path": wbase + "/Locked", "label": "缓存", "kb": 4000, "safe": True, "system": False,
             "admin": False, "cleanable": False, "advice": "运行中不可清"},
        ],
        "devCaches": [{"path": wbase + "/WithDev", "advice": "x", "kb": 1000}],
        "browsers": [{"name": "Chrome", "path": wbase + "/Google/Chrome", "kb": 4000, "running": False}],
        "appCaches": [{"baseId": "Foo", "app": "Foo", "kb": 1500, "running": False,
                       "cleanable": True, "paths": [wbase + "/Other/sub"]}],
        "special": [],
        "leftoverGroups": [
            {"baseId": "A", "kb": 20000, "bucket": "safe", "paths": [wbase + "/LeftoverA"]},
            {"baseId": "B", "kb": 500, "bucket": "safe", "paths": [wbase + "/LeftoverB"]},
            {"baseId": "C", "kb": 7000, "bucket": "confirm", "paths": [wbase + "/LeftoverC"]},
        ],
    }
    west = win.estimate_of(est_report)
    check("windows estimate 排除被具体条目覆盖/包住的父级缓存", west["cacheKb"] == 2000, repr(west))
    check("windows estimate 排除与 devCaches 重复的缓存行（UI 已隐藏）",
          west["overlapKb"] == 0 and west["devKb"] == 1000, repr(west))
    check("windows estimate 保持 safeKb 现有算法（全部 safe 组）", west["safeKb"] == 20500, repr(west))
    check("windows estimate 保留 confirmKb", west["confirmKb"] == 7000, repr(west))
    check("windows estimate totalKb 不含 confirmKb", west["totalKb"] == 20500 + 2000 + 1000, repr(west))

    # 完整合成扫描（OS 发现全部打桩，不触注册表/ctypes）：报告必须带 minLeftoverKb / processSnapshot
    saved_scan_env = {k: os.environ.get(k) for k in
                      ("USERPROFILE", "LOCALAPPDATA", "APPDATA", "PROGRAMDATA")}
    try:
        scan_home = tmp / "scan-home"
        slocal, sroaming, sdata = (scan_home / "Local", scan_home / "Roaming", scan_home / "ProgramData")
        for d in (slocal, sroaming, sdata):
            d.mkdir(parents=True)
        os.environ.update({"USERPROFILE": str(scan_home), "LOCALAPPDATA": str(slocal),
                           "APPDATA": str(sroaming), "PROGRAMDATA": str(sdata)})
        ns_scan = argparse.Namespace(home=str(scan_home), quick=True, top=20, min_mb=1,
                                     min_leftover_mb=10, redact=False)
        usage = namedtuple("usage", "total used free")(1000000, 400000, 600000)
        with patch.object(win, "installed_apps", return_value={}), \
             patch.object(win, "is_admin", return_value=False), \
             patch.object(win, "cloud_roots", return_value=[]), \
             patch.object(win, "cache_specs", return_value=[]), \
             patch.object(win, "dev_specs", return_value=[]), \
             patch.object(win, "running_process_names", return_value={"explorer.exe"}), \
             patch.object(win.shutil, "disk_usage", return_value=usage):
            sreport = win.scan(ns_scan)
        check("windows 报告带 minLeftoverKb", sreport.get("minLeftoverKb") == 10 * 1024,
              repr(sreport.get("minLeftoverKb")))
        check("windows 报告带 processSnapshot", sreport.get("processSnapshot") == "ok",
              repr(sreport.get("processSnapshot")))
        check("windows 报告 estimate 带 confirmKb",
              isinstance(sreport.get("estimate", {}).get("confirmKb"), int), repr(sreport.get("estimate")))
    finally:
        for k, v in saved_scan_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print(f"\n回归结果：{'通过' if not fails else '失败 ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
