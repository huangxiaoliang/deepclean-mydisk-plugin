#!/usr/bin/env python3
"""Windows 后端：只读磁盘体检（deepclean-mydisk v0.4.0）。

硬约束：只读。脚本不删除、不移动、不修改任何用户文件；
删除建议只生成 PowerShell 命令（移到回收站/隔离区），由用户确认后执行。
"""
import argparse
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from pathlib import Path

VERSION = "0.5.0"
PLATFORM = "windows"
FILE_ATTRIBUTE_REPARSE_POINT = 0x400
SCAN_BUDGET_SEC = 120

# 这些子目录属于系统/运行时/已安装程序，不当作「卸载残留」候选
SYSTEM_LOCAL = {
    "microsoft", "packages", "programs", "temp", "connecteddevicesplatform",
    "publishers", "comms", "d3dscache", "crashdumps", "google", "mozilla",
    "npm-cache", "pnpm", "pip", "yarn", "electron", "electron-builder",
    "deepclean-mydisk", "virtualstore", "application data",
}
SYSTEM_ROAMING = {
    "microsoft", "windows", "adobe", "google", "mozilla", "tencent",
    "apple computer", "npm", "npm-cache",
}
SYSTEM_PROGRAMDATA = {
    "microsoft", "windows", "packages", "microsoft windows", "microsoft office",
    "apple", "google", "mozilla", "tencent", "deepclean-mydisk",
    "chocolatey", "chocolateyhttpcache", "runner", "kind", "scoop",
}

# 卸载残留的 bucket 判定（目录名小写子串），与 macOS classify() 同口径：
# 整容器一律 confirm（只读）；safe 只来自 cache_subdirs() 拆出的缓存子目录，
# 不放宽「需确认不进允许集合」的硬约束。
LEFTOVER_MEDIA_HINTS = (
    "tenvideo", "iqiyi", "qiyi", "youku", "bilibili", "qqlive", "mangotv",
    "neteasecloudmusic", "kugou", "kuwo", "qqmusic", "spotify", "douyin", "tiktok",
)
LEFTOVER_MEETING_HINTS = (
    "zoom", "teams", "webex", "voov", "wemeet", "tencentmeeting",
)
def classify_leftover(name, kb):
    """整容器「需确认」；缓存子目录由 apply_leftover_cache_split 单独列为可清理。"""
    low = name.lower()
    if any(h in low for h in LEFTOVER_MEDIA_HINTS):
        return "confirm", "媒体类应用已卸载；其中缓存子目录会单独列出（可清理），其余可能含已下载内容"
    if any(h in low for h in LEFTOVER_MEETING_HINTS):
        return "confirm", "会议软件已卸载；其中缓存子目录会单独列出（可清理），录制/文档等需确认"
    return "confirm", "未匹配到已安装程序；可能含用户数据"


# 聊天类容器不做缓存拆分（交给专门的聊天清理/只读展示）。
CHAT_DIR_HINTS = ("wechat", "weixin", "wework", "qq", "telegram", "discord", "slack",
                  "feishu", "lark", "dingtalk", "whatsapp", "line")


def is_chat_dir(name):
    low = name.lower()
    return any(hint in low for hint in CHAT_DIR_HINTS)


def proc_matches_dir(name, procs):
    """目录名与 tasklist 进程名（去掉 .exe）做归一化包含匹配；取不到进程快照时按「未知」处理。"""
    norm = _norm_name(name).replace(" ", "")
    if not norm or not procs:
        return False
    for exe in procs:
        stem = exe[:-4] if exe.endswith(".exe") else exe
        stem = _norm_name(stem).replace(" ", "")
        if stem and (stem in norm or norm in stem):
            return True
    return False


def should_split_leftover(name, apps, procs):
    """只对「未安装、未运行、非聊天类」的 confirm 残留拆缓存子目录。

    installed_apps() 取不到（空）时 fail-closed：宁可不拆，也不把在用应用数据默认勾选。
    进程快照不可用（空集合）时同样 fail-closed：无法确认是否运行，就不拆。
    """
    if not apps:
        return False
    if not snapshot_available(procs):
        return False
    if is_chat_dir(name):
        return False
    if proc_matches_dir(name, procs):
        return False
    return True


CACHE_DIR_NAMES = {
    "cache", "caches", "cache2", "gpucache", "code cache", "cachestorage",
    "service worker", "crashpad", "tmp", "temp",
}
CACHE_SKIP_TOP = {"documents", "desktop", "downloads", "pictures", "videos", "music"}


def cache_subdirs(base_dir, max_depth=3, deadline=None):
    """已卸载残留目录里的可再生缓存子目录（不跟随重解析点、限制深度与时间预算）。"""
    base = os.path.abspath(str(base_dir))
    if not os.path.isdir(base) or is_reparse(base):
        return []
    hits = []
    for root, dirs, _files in os.walk(base):
        if deadline and time.time() > deadline:
            break
        rel = os.path.relpath(root, base)
        if rel != "." and rel.split(os.sep)[0].lower() in CACHE_SKIP_TOP:
            dirs[:] = []
            continue
        depth = 0 if rel == "." else rel.count(os.sep) + 1
        if depth > max_depth:
            dirs[:] = []
            continue
        dirs[:] = [d for d in dirs if not is_reparse(os.path.join(root, d))]
        # 目录本身不能算自己的缓存子目录（%LOCALAPPDATA%\Cache 这类名字会自命中）。
        if os.path.abspath(root) != base and os.path.basename(root).lower() in CACHE_DIR_NAMES:
            hits.append(root)
            dirs[:] = []
    return hits


def _strict_descendant(path, parents):
    try:
        real = os.path.normcase(os.path.realpath(str(path)))
    except OSError:
        return False
    for parent in parents or []:
        try:
            base = os.path.normcase(os.path.realpath(str(parent)))
        except OSError:
            continue
        if real != base and real.startswith(base + os.sep):
            return True
    return False


def apply_leftover_cache_split(groups, splits):
    """把 confirm 残留组里的缓存子目录拆成独立 safe 组（groups 原地修改）。

    splits: {残留路径: {"kb": 千字节, "paths": [缓存子目录]}}，只含未安装 App 的缓存子目录。
    拆出的组带 cachePart=True，客户端据此显示「App · 缓存」；原组保留其余数据并保持 confirm。
    """
    by_path = {}
    for group in groups:
        paths = group.get("paths") or []
        if paths:
            by_path[paths[0]] = group
    for path, split in list(splits.items()):
        group = by_path.get(path)
        if group is None or group.get("bucket") != "confirm":
            continue
        cache_kb = int(split.get("kb") or 0)
        if cache_kb < 1024:
            continue
        raw_paths = list(split.get("paths") or [])
        paths = [p for p in raw_paths if _strict_descendant(p, group.get("paths"))]
        if not paths or len(paths) != len(raw_paths):
            continue
        groups.append({
            "baseId": f'{group["baseId"]}.cache',
            "name": group["name"],
            "cachePart": True,
            "kb": cache_kb,
            "count": len(split.get("paths") or []),
            "bucket": "safe",
            "why": "已卸载 App 的缓存子目录，可重建；文档/聊天等数据仍保留",
            "paths": paths,
            "bundleIds": [],
        })
        group["kb"] = max(0, group["kb"] - cache_kb)
        group["why"] = f'{group["why"]}；其中缓存子目录已单独列出（可清理）'
    groups[:] = [g for g in groups if int(g.get("kb") or 0) > 0]
    return groups


def _stdout_utf8():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def env_path(name):
    v = os.environ.get(name)
    return Path(v) if v else None


def human(kb):
    if kb is None:
        return "?"
    n = float(kb) * 1024
    for unit in ("B", "K", "M", "G", "T"):
        if n < 1024 or unit == "T":
            return f"{n:.0f}{unit}" if unit in ("B", "K") else f"{n:.1f}{unit}"
        n /= 1024
    return f"{n:.1f}T"


# 文件名/路径可能带换行或控制字符；先单行化再放进 Markdown 表格，
# 避免伪造额外表格行或截断渲染（只影响展示，不影响扫描/分档）。
_CELL_CTRL = re.compile(r"[\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060\ufeff]")


def one_line_cell(value, max_len=200):
    s = "" if value is None else str(value)
    s = _CELL_CTRL.sub(" ", s)
    s = re.sub(r"\s+", " ", s).strip()
    if max_len and len(s) > max_len:
        s = s[: max_len - 1] + "…"
    return s


def is_admin():
    try:
        import ctypes
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def is_reparse(path):
    try:
        st = os.lstat(path)
    except OSError:
        return False
    if getattr(st, "st_file_attributes", 0) & FILE_ATTRIBUTE_REPARSE_POINT:
        return True
    try:
        return bool(getattr(os.path, "isjunction", lambda p: False)(path))
    except Exception:
        return False


def size_of(path, deadline=None):
    """递归统计逻辑字节数；跳过 junction/符号链接，带时间预算。"""
    total = 0
    stack = [str(path)]
    truncated = False
    while stack:
        if deadline and time.time() > deadline:
            truncated = True
            break
        cur = stack.pop()
        try:
            entries = os.scandir(cur)
        except OSError:
            continue
        with entries:
            for e in entries:
                try:
                    if is_reparse(e.path):
                        continue
                    if e.is_dir(follow_symlinks=False):
                        stack.append(e.path)
                    elif e.is_file(follow_symlinks=False):
                        total += e.stat(follow_symlinks=False).st_size
                except OSError:
                    continue
    return total, truncated


def _reg_value(key, name):
    try:
        import winreg
        return winreg.QueryValueEx(key, name)[0]
    except Exception:
        return None


def installed_apps():
    """从注册表 Uninstall 键读取已安装程序（HKLM/HKCU，含 WOW6432Node）。"""
    try:
        import winreg
    except Exception:
        return {}
    roots = [
        (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
    ]
    apps = {}
    for hive, sub in roots:
        try:
            root = winreg.OpenKey(hive, sub)
        except OSError:
            continue
        i = 0
        while True:
            try:
                name = winreg.EnumKey(root, i)
            except OSError:
                break
            i += 1
            try:
                key = winreg.OpenKey(root, name)
            except OSError:
                continue
            display = _reg_value(key, "DisplayName")
            if display:
                apps[display] = {
                    "display": display,
                    "installLocation": _reg_value(key, "InstallLocation"),
                    "publisher": _reg_value(key, "Publisher"),
                }
            try:
                winreg.CloseKey(key)
            except Exception:
                pass
        try:
            winreg.CloseKey(root)
        except Exception:
            pass
    return apps


_CJK_RE = re.compile(r"[\u4e00-\u9fff]")
_PAREN_RE = re.compile(r"[\(（\[【].*?[\)）\]】]")
_VERSION_RE = re.compile(r"\bv?\d+(?:\.\d+)+")
_YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")
_NON_WORD_RE = re.compile(r"[^0-9a-z\u4e00-\u9fff]+")


def _norm_name(text):
    """归一化应用/目录名：去括号说明、版本号、年份、空白与标点。

    「爱奇艺 12.0 (x64)」「KuGou 2023」这类 DisplayName 与目录名能落到同一形态上比较。
    """
    if not text:
        return ""
    s = str(text).lower()
    s = _PAREN_RE.sub(" ", s)
    s = _VERSION_RE.sub(" ", s)
    s = _YEAR_RE.sub(" ", s)
    s = _NON_WORD_RE.sub(" ", s)
    return " ".join(s.split())


def _tokens(text):
    """可比较的 token：CJK 片段保留 2 字（中文应用名常为 2–4 字），拉丁片段至少 3 字。"""
    norm = _norm_name(text)
    if not norm:
        return set()
    parts = [p for p in norm.split()
             if len(p) >= 2 and (_CJK_RE.search(p) or len(p) >= 3)]
    out = set(parts)
    if parts:
        out.add("".join(parts))
    return out


# 厂商容器名与 DisplayName/Publisher 的别名。中文系统的注册表 DisplayName 常见
# 「WPS Office」「腾讯电脑管家」「火绒…」，而数据目录是 Kingsoft/Tencent/Huorong；
# 只靠目录名与显示名互包含时会把在用 App 数据判成残留。
VENDOR_CONTAINER_ALIASES = (
    ("kingsoft", ("kingsoft", "wps", "金山")),
    ("tencent", ("tencent", "腾讯")),
    ("huorong", ("huorong", "火绒")),
    ("sangfor", ("sangfor", "深信服")),
    ("leagsoft", ("leagsoft", "联软")),
)


def installed_tokens(apps):
    tokens = set()
    vendor_text = []
    for info in apps.values():
        display = info.get("display") or ""
        publisher = info.get("publisher") or ""
        vendor_text.append(f"{display} {publisher}".lower())
        tokens |= _tokens(display)
        tokens |= _tokens(publisher)
        loc = info.get("installLocation")
        if loc:
            base = Path(str(loc)).name
            tokens |= _tokens(base)
            norm = _norm_name(base)
            if norm:
                tokens.add(norm)
    joined = " ".join(vendor_text)
    for container, aliases in VENDOR_CONTAINER_ALIASES:
        if any(alias in joined for alias in aliases):
            tokens.add(container)
    return tokens


def dir_name_matches_installed(name, tokens):
    """目录名是否像某个已安装程序（宁多判已安装，不可把在用数据当残留）。

    依次尝试：归一化全名相等 → token 交集 → DisplayName/目录名互相包含。
    """
    norm = _norm_name(name)
    if not norm:
        return False
    if norm in tokens:
        return True
    if _tokens(name) & tokens:
        return True
    short_ok = _CJK_RE.search(norm) and len(norm) >= 2 or len(norm) >= 3
    if not short_ok:
        return False
    for token in tokens:
        if not token:
            continue
        if len(token) < 2:
            continue
        if token in norm or norm in token:
            return True
    return False


def _child_dirs(path):
    out = []
    try:
        with os.scandir(path) as it:
            for e in it:
                try:
                    if e.is_dir(follow_symlinks=False) and not is_reparse(e.path):
                        out.append(Path(e.path))
                except OSError:
                    continue
    except OSError:
        pass
    return out


def cache_specs():
    local = env_path("LOCALAPPDATA")
    temp = env_path("TEMP") or env_path("TMP")
    roaming = env_path("APPDATA")
    specs = []
    def add(p, label, safe=True, system=False, admin=False, cleanable=True, advice="缓存，可重建"):
        if p and Path(p).exists():
            specs.append({"path": str(Path(p)), "label": label, "safe": safe,
                          "system": system, "admin": admin, "cleanable": cleanable,
                          "advice": advice})
    if local:
        # Temp 被运行中的程序持续占用，整体移动要么失败、要么破坏程序 → 仅供查看。
        add(local / "Temp", "用户临时文件", cleanable=False,
            advice="程序运行中持续使用；建议用「磁盘清理」处理")
        add(local / "CrashDumps", "崩溃转储")
        add(local / "Microsoft" / "Windows" / "WER", "Windows 错误报告")
        add(local / "npm-cache", "npm 缓存")
        add(local / "pnpm" / "store", "pnpm store")
        add(local / "pip" / "Cache", "pip 缓存")
        add(local / "Yarn" / "Cache", "Yarn 缓存")
    if temp:
        add(temp, "临时文件", cleanable=False,
            advice="程序运行中持续使用；建议用「磁盘清理」处理")
    # 需要管理员权限，且整体移动系统 Temp 目录本身就有风险 → 不进入清理允许集合。
    add(Path("C:/Windows/Temp"), "系统临时文件", admin=True, cleanable=False,
        advice="需要管理员权限；建议用「磁盘清理」处理")
    add(Path("C:/Windows/SoftwareDistribution/Download"), "Windows 更新缓存",
        safe=False, system=True, admin=True)
    return specs


def parse_tasklist(text):
    """解析 tasklist /FO CSV /NH 输出为 exe 名小写集合。"""
    names = set()
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith('"'):
            continue
        end = line.find('"', 1)
        if end > 1:
            names.add(line[1:end].lower())
    return names


def running_process_names():
    """进程快照；失败返回空集合。

    调用方必须用 snapshot_available() 区分「tasklist 失败」与「真的没有进程」，
    失败时按运行中/不可拆处理（fail-closed），不阻断扫描。
    """
    try:
        out = subprocess.run(["tasklist", "/FO", "CSV", "/NH"], capture_output=True,
                             text=True, timeout=30, errors="replace").stdout
    except Exception:
        return set()
    return parse_tasklist(out)


def snapshot_available(procs):
    """进程快照是否可用：tasklist 成功时不可能返回空集合，空即视为不可用。"""
    try:
        return bool(procs)
    except Exception:
        return False


BROWSER_EXE_HINTS = (("Chrome", "chrome.exe"), ("Edge", "msedge.exe"), ("Firefox", "firefox.exe"))


def browser_exe(name):
    for prefix, exe in BROWSER_EXE_HINTS:
        if name.startswith(prefix):
            return exe
    return ""


def browser_running(name, procs):
    """浏览器缓存是否按运行中处理；快照不可用时一律运行中（宁可暂时不可清）。"""
    if not snapshot_available(procs):
        return True
    exe = browser_exe(name)
    return bool(exe) and exe in procs


def browser_specs():
    """浏览器缓存（按浏览器/profile 细分；只统计 Cache 目录，不碰书签/密码/历史）。

    与 macOS 报告同一契约：{name, path}，由 scan() 补 kb/running。
    """
    local = env_path("LOCALAPPDATA")
    roaming = env_path("APPDATA")
    specs = []

    def add(name, p):
        if p and Path(p).exists():
            specs.append({"name": name, "path": str(Path(p))})

    def chromium(label, user_data):
        for prof in _child_dirs(user_data):
            if prof.name != "Default" and not prof.name.lower().startswith("profile"):
                continue
            suffix = "" if prof.name == "Default" else f"（{prof.name}）"
            add(f"{label}{suffix}", prof / "Cache")

    if local:
        chromium("Chrome", local / "Google" / "Chrome" / "User Data")
        chromium("Edge", local / "Microsoft" / "Edge" / "User Data")
    if roaming:
        for prof in _child_dirs(roaming / "Mozilla" / "Firefox" / "Profiles"):
            add("Firefox", prof / "cache2")
    return specs


def dev_specs():
    home = Path(os.environ.get("USERPROFILE", "C:/Users/Default"))
    local = env_path("LOCALAPPDATA")
    out = []
    def add(p, advice):
        if p and Path(p).exists():
            out.append({"path": str(Path(p)), "advice": advice})
    add(home / ".gradle" / "caches", "Gradle 缓存，构建时会重新下载")
    add(home / ".m2" / "repository", "Maven 仓库，构建时会重新下载")
    add(home / ".nuget" / "packages", "NuGet 包，还原时会重新下载")
    add(home / ".cargo" / "registry", "Cargo 缓存")
    add(home / ".conda" / "pkgs", "Conda 包缓存")
    add(local / "npm-cache" if local else None, "npm cache clean --force")
    add(local / "pnpm" / "store" if local else None, "pnpm store prune")
    add(local / "pip" / "Cache" if local else None, "pip cache purge")
    return out


def cloud_roots():
    roots = set()
    for name in ("OneDrive", "OneDriveConsumer", "OneDriveCommercial"):
        p = env_path(name)
        if p and Path(p).exists():
            roots.add(str(Path(p).resolve()))
    home = env_path("USERPROFILE")
    if home:
        for d in _child_dirs(home):
            if d.name.lower().startswith("onedrive") or d.name.lower() in ("dropbox", "google drive"):
                roots.add(str(d.resolve()))
    return sorted(roots)


def under_cloud(path, roots):
    """路径是否位于任一云盘根之下。

    必须按目录边界（== root 或 root + os.sep 前缀）判断，裸 startswith 会把
    `...\\OneDriveBackup` 误判为云盘；Windows 上还要 normcase，避免大小写不一致漏判。
    """
    try:
        target = os.path.normcase(os.path.normpath(str(path)))
    except Exception:
        return False
    if not target:
        return False
    for root in roots or []:
        try:
            base = os.path.normcase(os.path.normpath(str(root)))
        except Exception:
            continue
        if not base:
            continue
        if target == base:
            return True
        prefix = base if base.endswith(os.sep) else base + os.sep
        if target.startswith(prefix):
            return True
    return False


def big_files(home, min_mb, cloud, top=15, deadline=None):
    """全盘大文件：先排序后取 top-N；超过时间预算即截断（与 size_of 同一约定）。"""
    skip_dirs = {"appdata", "node_modules", ".git", "$recycle.bin", "system volume information"}
    cloud_resolved = [str(Path(c)) for c in cloud]
    rows = []
    truncated = False
    for root, dirs, files in os.walk(home):
        if deadline and time.time() > deadline:
            truncated = True
            break
        dirs[:] = [d for d in dirs if d.lower() not in skip_dirs
                   and not is_reparse(os.path.join(root, d))
                   and not under_cloud(os.path.join(root, d), cloud_resolved)]
        for f in files:
            try:
                p = os.path.join(root, f)
                if is_reparse(p):
                    continue
                st = os.stat(p)
                if st.st_size >= min_mb * 1024 * 1024:
                    rows.append({"path": p, "bytes": st.st_size, "mtime": int(st.st_mtime)})
            except OSError:
                continue
    rows.sort(key=lambda x: -x["bytes"])
    return rows[:top], truncated


def _norm_path(p):
    """路径归一化：去掉 . / .. 与重复分隔符，Windows 上再统一大小写；异常返回空串。"""
    try:
        return os.path.normcase(os.path.normpath(str(p)))
    except Exception:
        return ""


def _path_within(child, parent):
    """child 是否等于 parent 或位于 parent 之下（按目录边界，不做 realpath）。"""
    c, p = _norm_path(child), _norm_path(parent)
    if not c or not p:
        return False
    return c == p or c.startswith(p + os.sep)


def _overlaps_specific(path, specific):
    """通用缓存路径是否被更具体条目覆盖或包住（任一方向重叠即算，与客户端隐藏口径一致）。"""
    return any(_path_within(path, s) or _path_within(s, path) for s in specific)


def _specific_paths(report):
    """更具体条目（UI 中优先展示、会隐藏其父级 caches 行）的路径集合。

    来源与 lib/client.js buildRows 的 specific 一致：browsers / devCaches / appCaches /
    special.categories / leftoverGroups（所有 bucket，含 safe 与 confirm）。
    """
    out = set()
    for b in report.get("browsers") or []:
        if b.get("path"):
            out.add(b["path"])
    for d in report.get("devCaches") or []:
        if d.get("path"):
            out.add(d["path"])
    for a in report.get("appCaches") or []:
        for p in a.get("paths") or []:
            if p:
                out.add(p)
    for app in report.get("special") or []:
        for cat in app.get("categories") or []:
            for p in cat.get("paths") or []:
                if p:
                    out.add(p)
    for g in report.get("leftoverGroups") or []:
        for p in g.get("paths") or []:
            if p:
                out.add(p)
    return out


def estimate_of(r):
    """与 macOS estimate_of 同契约的估算（已去重）。

    cacheKb 只统计 UI 会展示的 caches 行：被 browsers/devCaches/appCaches/special/
    leftoverGroups 覆盖或包住的父级缓存目录不计入（与客户端 buildRows 隐藏口径一致）。
    safeKb 仍统计所有 safe 残留组（不额外加 minLeftoverKb 阈值，保持现有行为）。
    """
    specific = _specific_paths(r)
    cache_map = {os.path.normcase(c["path"]): c["kb"] for c in r["caches"]
                 if c["safe"] and not c["system"] and c.get("cleanable", True)
                 and not _overlaps_specific(c["path"], specific)}
    # 与清理允许集合 / 面板同口径：cleanable=False 的开发缓存只展示，不计入可释放。
    dev_map = {os.path.normcase(d["path"]): d["kb"] for d in r["devCaches"]
               if d.get("cleanable", True)}
    overlap_kb = sum(min(cache_map[p], dev_map[p]) for p in set(cache_map) & set(dev_map))
    cache_kb = sum(cache_map.values()) - overlap_kb
    dev_kb = sum(dev_map.values())
    safe_kb = sum(g["kb"] for g in r["leftoverGroups"] if g["bucket"] == "safe")
    confirm_kb = sum(g["kb"] for g in r["leftoverGroups"] if g["bucket"] != "safe")
    # 浏览器 / 应用缓存同样进入允许集合，也必须计入「预计可释放」，
    # 否则 disk_report 与 AI 摘要会比面板可勾选合计小。
    browser_kb = sum(b.get("kb", 0) for b in r.get("browsers") or [] if not b.get("running"))
    app_cache_kb = sum(a.get("kb", 0) for a in r.get("appCaches") or []
                       if not a.get("running") and a.get("cleanable", True))
    return {"safeKb": safe_kb, "confirmKb": confirm_kb,
            "cacheKb": cache_kb, "devKb": dev_kb,
            "browserKb": browser_kb, "appCacheKb": app_cache_kb, "specialKb": 0,
            "overlapKb": overlap_kb,
            "totalKb": safe_kb + cache_kb + dev_kb + browser_kb + app_cache_kb}


def scan(args):
    _stdout_utf8()
    t0 = time.time()
    home = Path(args.home).expanduser().resolve() if args.home else Path(os.environ.get("USERPROFILE", "C:/Users/Default"))
    local = env_path("LOCALAPPDATA") or home / "AppData" / "Local"
    roaming = env_path("APPDATA") or home / "AppData" / "Roaming"
    programdata = env_path("PROGRAMDATA") or Path("C:/ProgramData")
    deadline = t0 + SCAN_BUDGET_SEC
    admin = is_admin()
    system_drive = os.environ.get("SystemDrive", "C:")
    disk = shutil.disk_usage(system_drive + "/")
    r = {
        "version": VERSION, "platform": PLATFORM,
        "generatedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        "host": os.environ.get("COMPUTERNAME", "windows"),
        "home": str(home),
        "disk": {"total": disk.total, "used": disk.used, "free": disk.free, "drive": system_drive},
        "access": {"admin": admin, "detail": "管理员" if admin else "普通用户"},
        "installedCount": 0,
        "caches": [], "leftoverGroups": [], "devCaches": [], "cloudStorage": [],
        "browsers": [], "appCaches": [],
        "bigFiles": [], "trashKb": None, "bigFilesTop": args.top,
        "processSnapshot": "unavailable",
        "scope": f"{local}、{roaming}、{programdata}、Temp、浏览器缓存、开发缓存、云盘、"
                 f"{home}（不含 AppData 的大文件）",
        "truncated": False,
    }
    apps = installed_apps()
    r["installedCount"] = len(apps)
    tokens = installed_tokens(apps)

    seen_real = set()

    def fresh(path):
        key = os.path.normcase(os.path.realpath(str(path)))
        if key in seen_real:
            return False
        seen_real.add(key)
        return True

    cloud = cloud_roots()
    r["cloudStorage"] = [{"path": c, "kb": size_of(c, min(deadline, time.time() + 20))[0] // 1024} for c in cloud]

    specs = cache_specs()
    seen = set()
    for spec in specs:
        if not fresh(spec["path"]):
            continue
        seen.add(spec["path"])
        kb, trunc = size_of(spec["path"], min(deadline, time.time() + 20))
        r["truncated"] |= trunc
        r["caches"].append({**spec, "kb": kb // 1024})

    dev_paths = set()
    for spec in dev_specs():
        if not fresh(spec["path"]):
            continue
        seen.add(spec["path"])
        dev_paths.add(spec["path"])
        kb, trunc = size_of(spec["path"], min(deadline, time.time() + 20))
        r["truncated"] |= trunc
        r["devCaches"].append({**spec, "kb": kb // 1024})

    proc_names = running_process_names()
    r["processSnapshot"] = "ok" if snapshot_available(proc_names) else "unavailable"
    for spec in browser_specs():
        if not fresh(spec["path"]):
            continue
        seen.add(spec["path"])
        kb, trunc = size_of(spec["path"], min(deadline, time.time() + 20))
        r["truncated"] |= trunc
        r["browsers"].append({**spec, "kb": kb // 1024,
                              "running": browser_running(spec["name"], proc_names)})
    r["browsers"].sort(key=lambda x: -x["kb"])

    # 已卸载 App 数据候选（LOCAL/ROAMING/PROGRAMDATA 顶层目录）。
    # 与 macOS 报告同一契约：单路径 leftoverGroups，bucket 由 classify_leftover 判定。
    def candidate_roots():
        yield local, SYSTEM_LOCAL
        yield roaming, SYSTEM_ROAMING
        yield programdata, SYSTEM_PROGRAMDATA

    leftover_splits = {}
    for root, skip in candidate_roots():
        if not root or not Path(root).is_dir():
            continue
        for d in _child_dirs(root):
            name = d.name
            low = name.lower()
            if low in skip or low.startswith("deepclean"):
                continue
            if under_cloud(d, cloud):
                continue
            if dir_name_matches_installed(name, tokens):
                continue
            kb, trunc = size_of(d, min(deadline, time.time() + 15))
            r["truncated"] |= trunc
            if kb < args.min_leftover_mb * 1024 * 1024:
                continue
            if not fresh(d):
                continue
            bucket, why = classify_leftover(name, kb // 1024)
            r["leftoverGroups"].append({"baseId": name, "name": name, "kb": kb // 1024,
                                        "count": 1, "bucket": bucket, "why": why,
                                        "paths": [str(d)], "bundleIds": []})
            # confirm 残留里的可再生缓存子目录单独成 safe 组，其余数据保持只读；
            # 未安装判定不可靠（installed_apps 为空）、聊天类、运行中的一律不拆。
            if bucket == "confirm" and should_split_leftover(name, apps, proc_names):
                split_paths = cache_subdirs(d, deadline=min(deadline, time.time() + 3))
                kept, split_kb = [], 0
                for sp in split_paths:
                    skb, strunc = size_of(sp, min(deadline, time.time() + 8))
                    r["truncated"] |= strunc
                    if skb >= 1024 * 1024:
                        kept.append(sp)
                        split_kb += skb // 1024
                if kept and split_kb >= 1024:
                    leftover_splits[str(d)] = {"kb": split_kb, "paths": kept}

    # UWP 包数据（单独列为需确认）
    packages = local / "Packages"
    if packages.is_dir():
        for d in _child_dirs(packages):
            kb, trunc = size_of(d, min(deadline, time.time() + 15))
            r["truncated"] |= trunc
            if kb >= args.min_leftover_mb * 1024 * 1024 and fresh(d):
                r["leftoverGroups"].append({"baseId": d.name, "name": f"UWP: {d.name}", "kb": kb // 1024,
                                            "count": 1, "bucket": "confirm",
                                            "why": "商店应用数据；删除后应用将被重置且数据丢失",
                                            "paths": [str(d)], "bundleIds": []})

    apply_leftover_cache_split(r["leftoverGroups"], leftover_splits)
    r["leftoverGroups"].sort(key=lambda x: -x["kb"])
    if not args.quick:
        big, big_trunc = big_files(home, args.min_mb, cloud, top=args.top, deadline=deadline)
        r["truncated"] |= big_trunc
        r["bigFiles"] = [{"path": b["path"], "kb": b["bytes"] // 1024, "mtime": b["mtime"]}
                         for b in big]
    r["devPaths"] = sorted(dev_paths)
    r["elapsed"] = round(time.time() - t0, 1)
    r["minLeftoverKb"] = int(args.min_leftover_mb * 1024)
    r["estimate"] = estimate_of(r)
    return r


def render(r, args):
    L = []
    a = L.append
    a("# 磁盘体检报告（Windows）")
    a("")
    a(f"- 工具版本：deepclean-mydisk v{r['version']}（{r['platform']}）")
    a(f"- 生成时间：{r['generatedAt']}")
    a(f"- 机器：{r['host'] if not args.redact else '***'}")
    a(f"- 权限：{r['access']['detail']}（清理 ProgramData / Windows 目录需要管理员）")
    a(f"- 已安装程序（注册表）：{r['installedCount']} 个")
    a(f"- 系统盘 {r['disk'].get('drive', 'C:')} 共 {r['disk']['total']/1e9:.0f} GB，已用 {r['disk']['used']/1e9:.0f} GB，"
      f"可用 **{r['disk']['free']/1e9:.0f} GB**")
    a(f"- 扫描耗时：{r['elapsed']}s" + ("（快速模式：未扫描大文件）" if args.quick else ""))
    a(f"- 扫描范围：{r['scope']}")
    if r["truncated"]:
        a("- ⚠️ 部分目录超过时间预算，大小可能偏小（仍可安全使用）")
    a("")

    def table(title, rows):
        a(f"## {title}")
        a("")
        if not rows:
            a("（无）")
            a("")
            return
        a("| 大小 | 位置 | 说明 |")
        a("|---|---|---|")
        for it in rows:
            path_cell = one_line_cell(it.get("path", ""))
            note_cell = one_line_cell(it.get("note", ""))
            a(f"| {human(it.get('kb'))} | `{path_cell}` | {note_cell} |")
        a("")

    table("一、推荐清理（临时文件/缓存）",
          [{"path": c["path"], "kb": c["kb"], "note": f"{c['label']}；{c['advice']}"}
           for c in r["caches"] if c["safe"] and not c["system"] and c.get("cleanable", True)]
          + [{"path": b["path"], "kb": b["kb"], "note": f"{b['name']} 浏览器缓存，可重建（不碰书签/密码）"}
             for b in r.get("browsers", []) if not b.get("running")])
    table("二、已卸载残留（推荐清理）",
          [{"path": g["paths"][0], "kb": g["kb"], "note": f"{g['name']}；{g['why']}"}
           for g in r["leftoverGroups"] if g["bucket"] == "safe"])
    table("三、需确认（应用数据 / 可能的卸载残留 / UWP）",
          [{"path": g["paths"][0], "kb": g["kb"], "note": f"{g['name']}；{g['why']}"}
           for g in r["leftoverGroups"] if g["bucket"] != "safe"])
    table("四、开发缓存（可再生）",
          [{"path": d["path"], "kb": d["kb"], "note": d["advice"]} for d in r["devCaches"]])
    table("五、云盘目录（不建议清理）",
          [{"path": c["path"], "kb": c["kb"], "note": "云盘同步目录；删除占位文件会删除云端文件"}
           for c in r["cloudStorage"]])
    table(f"六、大文件（> {args.min_mb} MB，个人文件请自行判断）",
          [{"path": b["path"], "kb": b["kb"], "note": "个人文件，请自行判断"} for b in r["bigFiles"]])
    table("七、系统缓存与暂不可清理项（不建议清理）",
          [{"path": c["path"], "kb": c["kb"], "note": f"{c['label']}；{c['advice']}"}
           for c in r["caches"] if c["system"] or not c.get("cleanable", True)]
          + [{"path": b["path"], "kb": b["kb"], "note": f"{b['name']} 正在运行，退出后重新扫描再清理"}
             for b in r.get("browsers", []) if b.get("running")])

    a("## 八、不建议清理")
    a("")
    a("- `C:\\Windows\\WinSxS`、`C:\\Windows\\System32`、驱动仓库")
    a("- `pagefile.sys` / `hiberfil.sys` / `System Volume Information`")
    a("- `C:\\Windows.old`（请用「磁盘清理」处理）")
    a("- `C:\\Program Files`、`C:\\Program Files (x86)`、`C:\\ProgramData`（除明确缓存子目录）")
    a("- 注册表、Defender 隔离区、回收站内部结构")
    a("- OneDrive 等云盘的占位文件（删除会同步删除云端）")
    a("- `%LOCALAPPDATA%\\Packages`（商店应用数据）")
    a("- 浏览器配置目录（书签/密码/登录态）")
    a("")

    est = r.get("estimate") or {}
    safe_kb = est.get("safeKb", 0)
    cache_kb = est.get("cacheKb", 0)
    dev_kb = est.get("devKb", 0)
    browser_kb = est.get("browserKb", 0)
    app_cache_kb = est.get("appCacheKb", 0)
    # 合计以 estimate.totalKb 为准（与 JSON / 面板可勾选合计同源）；旧报告没有
    # totalKb 时按六项分项回退（Windows special 恒 0），避免少报浏览器 / 应用缓存。
    total_kb = est.get("totalKb")
    if total_kb is None:
        total_kb = safe_kb + cache_kb + dev_kb + browser_kb + app_cache_kb
    a("## 九、预计可释放")
    a("")
    a(f"- 推荐清理（缓存/临时文件，已去重）：**{human(cache_kb)}**")
    if safe_kb:
        a(f"- 已卸载残留（推荐清理）：**{human(safe_kb)}**")
    a(f"- 开发缓存：**{human(dev_kb)}**")
    if browser_kb:
        a(f"- 浏览器缓存：**{human(browser_kb)}**（可重建，不碰书签/密码）")
    if app_cache_kb:
        a(f"- 应用缓存：**{human(app_cache_kb)}**（可重建）")
    a(f"- 合计约：**{human(total_kb)}**（不含需确认项）")
    if est.get("overlapKb"):
        a(f"- 已避免重复计算：{human(est['overlapKb'])}（同时出现在缓存与开发缓存中）")
    a("")

    a("## 十、建议命令（PowerShell，只生成，不执行）")
    a("")
    a("```powershell")
    a('# 缓存/临时：移到隔离区，确认后再删除（比直接删安全）')
    a('$q = Join-Path $env:LOCALAPPDATA "deepclean-mydisk\\trash"')
    a('New-Item -ItemType Directory -Force $q | Out-Null')
    emitted = 0

    def command_path(path):
        # 先脱敏再按 PowerShell 规则转义。顺序反了的话，home 里的 ' 会被转成 ''，
        # 末尾的 md.replace(home, "%USERPROFILE%") 就匹配不到，完整用户名路径会泄漏到
        # 报告（以及默认 --redact 的 disk_audit 输出/模型上下文）。
        text = str(path)
        return text.replace(r["home"], "%USERPROFILE%") if args.redact else text

    for c in r["caches"]:
        if not c["safe"] or c["system"] or not c.get("cleanable", True) or c["kb"] < 100 * 1024:
            continue
        a("Move-Item -LiteralPath " + _move_quote(command_path(c["path"])) + " -Destination $q")
        emitted += 1
    for g in r["leftoverGroups"]:
        if g["bucket"] != "safe" or g["kb"] < 100 * 1024:
            continue
        a("Move-Item -LiteralPath " + _move_quote(command_path(g["paths"][0])) + " -Destination $q")
        emitted += 1
    if emitted == 0:
        a("# 本次没有 ≥100 MB 的推荐清理项，无需移动")
    a("```")
    a("")
    a("> 需确认项（App 数据/UWP）不生成命令；删除前请先退出对应程序。")
    md = "\n".join(L)
    if args.redact:
        home = r["home"]
        # 只替换 home：host 在上面的「机器」行里已经按 args.redact 直接写成 ***。
        # 再对全文 replace(host, "***") 会把主机名碰巧是常见子串时（如 "h"）的文字
        # 一起打碎（powershell → powers***ell）。
        md = md.replace(home, "%USERPROFILE%")
    return md


def _move_quote(path):
    return "'" + str(path).replace("'", "''") + "'"


def self_test():
    fails, skips = [], []

    def check(name, cond, detail=""):
        if cond:
            print(f"PASS  {name}")
        else:
            fails.append(name)
            print(f"FAIL  {name} {detail}")

    tmp = Path(tempfile.mkdtemp(prefix="deepclean 中文 空格 "))
    try:
        f = tmp / "a b 中文.txt"
        f.write_bytes(b"x" * 4096)
        kb, trunc = size_of(tmp)
        check("size_of 统计（4KB）", kb == 4096 and not trunc, f"got {kb}")

        # junction 跳过
        link = tmp / "link"
        try:
            subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(tmp / "a b 中文.txt")],
                           capture_output=True, check=False)
            check("junction 识别", is_reparse(link) or not link.exists())
        except Exception:
            skips.append("junction 创建")

        # 注册表
        apps = installed_apps()
        check("注册表已安装程序可读（>0）", len(apps) > 0, f"got {len(apps)}")

        # 命令转义（避免 f-string 表达式里出现反斜杠，兼容 Python 3.9）
        tricky = "C:\\A B\\it's"
        expected = "-LiteralPath 'C:\\A B\\it''s'"
        cmd = "Move-Item -LiteralPath " + _move_quote(tricky)
        check("命令转义", expected in cmd, cmd)

        # 报告渲染
        r = {"version": VERSION, "platform": PLATFORM, "generatedAt": "x", "host": "h",
             "home": str(tmp), "access": {"admin": False, "detail": "普通用户"},
             "installedCount": len(apps), "disk": {"total": 1, "used": 1, "free": 1},
             "caches": [], "leftoverGroups": [], "devCaches": [], "cloudStorage": [],
             "browsers": [], "appCaches": [],
             "bigFiles": [], "truncated": False, "elapsed": 0.1, "scope": "x"}
        ns = argparse.Namespace(redact=False, quick=True, min_mb=300, min_leftover_mb=10)
        md = render(r, ns)
        check("报告含关键小节", "预计可释放" in md and "不建议清理" in md)
        md.encode("utf-8")

        # 隔离区往返
        q = tmp / "quarantine"
        q.mkdir()
        target = tmp / "move-me 中文"
        target.mkdir()
        (target / "f").write_text("x", encoding="utf-8")
        shutil.move(str(target), str(q / target.name))
        check("隔离区移动", (q / target.name).exists() and not target.exists())
        shutil.move(str(q / target.name), str(target))
        check("隔离区还原", target.exists())
    finally:
        # 仅清理自检用的临时目录，不触碰任何用户文件
        shutil.rmtree(tmp, ignore_errors=True)

    if skips:
        print("SKIP:", ", ".join(skips))
    print(f"\n自检结果：{'通过' if not fails else '失败 ' + ', '.join(fails)}")
    return 0 if not fails else 1


def main():
    _stdout_utf8()
    ap = argparse.ArgumentParser(description="Windows 只读磁盘体检")
    ap.add_argument("--md")
    ap.add_argument("--json")
    ap.add_argument("--home")
    ap.add_argument("--top", type=int, default=15)
    ap.add_argument("--min-mb", type=int, default=300)
    ap.add_argument("--min-leftover-mb", type=int, default=10)
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--redact", action="store_true")
    ap.add_argument("--check-permissions", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--version", action="version", version=f"deepclean-mydisk {VERSION} (windows)")
    args = ap.parse_args()
    if args.check_permissions:
        role = "管理员" if is_admin() else "普通用户"
        print(f"权限检查：Windows 无「完全磁盘访问」概念；当前 = {role}"
              "（清理 ProgramData/Windows 目录需要管理员）")
        sys.exit(0)
    if args.self_test:
        sys.exit(self_test())
    r = scan(args)
    md = render(r, args)
    print(md)
    if args.md:
        Path(args.md).write_text(md, encoding="utf-8")
        print(f"[written] {args.md}", file=sys.stderr)
    if args.json:
        data = json.dumps(r, ensure_ascii=False, indent=2)
        Path(args.json).write_text(data, encoding="utf-8")
        print(f"[written] {args.json}", file=sys.stderr)


if __name__ == "__main__":
    main()
