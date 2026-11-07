#!/usr/bin/env python3
"""deepclean-mydisk —— 只读磁盘体检（v0.3）。

硬约束：只读。不删除、不移动、不修改任何文件；删除建议只生成命令文本。
"""
import argparse
import glob
import heapq
import json
import os
import re
import shlex
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

VERSION = "0.5.0"
SCRIPT_DIR = Path(__file__).resolve().parent


def _progress(pct, label):
    """向宿主输出进度（stderr，仅供插件聚合展示，不污染报告）。"""
    try:
        print(f"PROGRESS {pct} {label}", file=sys.stderr, flush=True)
    except Exception:
        pass
SKILL_DIR = SCRIPT_DIR.parent
DEFAULT_RULES = {
    "thresholds": {"displayMinMb": 10, "mediaConfirmMb": 50, "commandMinMb": 100, "bigFileMb": 300},
    "mediaHints": ["video", "player", "music", "douyin"],
    "meetingHints": ["meeting", "zoom", "teams"],
    "userDataHints": ["wechat", "qq", "docs", "notes", "mail"],
    "devHints": ["xcode", "codex", "docker"],
    "extSuffixRe": r"(?i)\.(widget|extension|helper|share|service|intent|preview|provider|sync)$",
    "systemCacheNames": ["CloudKit", "GeoServices"],
    "knownNames": {},
    "denyPaths": [],
}


def load_rules():
    path = SKILL_DIR / "rules.json"
    rules = json.loads(json.dumps(DEFAULT_RULES))
    try:
        if path.exists():
            loaded = json.loads(path.read_text(encoding="utf-8"))
            for k, v in loaded.items():
                rules[k] = v
    except Exception as e:  # 规则坏了也要能跑
        print(f"[warn] rules.json 读取失败，使用内置规则：{e}", file=sys.stderr)
    th = rules.setdefault("thresholds", {})
    for key, val in (("displayMinMb", 10), ("mediaConfirmMb", 50),
                     ("commandMinMb", 100), ("bigFileMb", 300)):
        th.setdefault(key, val)
    try:
        rules["_extRe"] = re.compile(rules["extSuffixRe"])
    except re.error:
        rules["_extRe"] = re.compile(DEFAULT_RULES["extSuffixRe"])
    return rules


def run_cmd(argv, timeout=120):
    """只以 argv 形式执行外部命令：路径一律作为独立参数传递，绝不拼接 shell 字符串。

    容器/缓存目录名属于不可信数据（例如微信收到的文件夹名可以包含 $()、反引号、
    引号），一旦拼进 `sh -c` 就会被执行。这里统一用 argv + shell=False。
    """
    try:
        return subprocess.run(argv, capture_output=True, text=True, timeout=timeout).stdout
    except Exception:
        return ""


def du_map(pattern, timeout=180):
    """统计 glob 命中的路径；glob 与 du 全部以 argv 传参，避免 shell 注入。"""
    try:
        paths = sorted(glob.glob(pattern))
    except Exception:
        paths = []
    if not paths:
        return {}
    out = run_cmd(["du", "-sk", *paths], timeout=timeout)
    m = {}
    for line in out.splitlines():
        parts = line.split("\t", 1)
        if len(parts) != 2:
            continue
        try:
            m[parts[1]] = int(parts[0])
        except ValueError:
            continue
    return m


def du_one(path, timeout=120):
    out = run_cmd(["du", "-sk", str(path)], timeout=timeout)
    try:
        return int(out.split("\t", 1)[0])
    except Exception:
        return None


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


def plist_raw(path, key):
    if not os.path.exists(path):
        return None
    out = run_cmd(["plutil", "-extract", key, "raw", "-o", "-", str(path)], timeout=10).strip()
    return out or None


def _app_info(app):
    try:
        bid = plist_raw(app / "Contents" / "Info.plist", "CFBundleIdentifier")
        if not bid:
            return None
        name = (plist_raw(app / "Contents" / "Info.plist", "CFBundleDisplayName")
                or plist_raw(app / "Contents" / "Info.plist", "CFBundleName") or app.stem)
        return bid, {"path": str(app), "name": name}
    except Exception:
        return None


def installed_apps(home):
    """返回 {bundleId: {"path":..., "name":...}}（plutil 并行，约 0.5s）"""
    roots = [home / "Applications", Path("/Applications"), Path("/Applications/Utilities"),
             Path("/System/Applications"), Path("/System/Applications/Utilities")]
    roots += [Path(p) / "Applications" for p in glob.glob("/Volumes/*")]
    apps, seen = [], set()
    for root in roots:
        try:
            if not root.is_dir():
                continue
            for app in root.glob("*.app"):
                real = str(app.resolve())
                if real in seen:
                    continue
                seen.add(real)
                apps.append(app)
        except Exception:
            continue
    mapping = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        for item in ex.map(_app_info, apps):
            if item:
                mapping[item[0]] = item[1]
    return mapping


def base_id(bid, rules):
    cur = bid
    for _ in range(3):
        m = rules["_extRe"].search(cur)
        if not m:
            break
        cur = cur[: m.start()]
    return cur


def belongs_to_installed(bid, installed, component_of=None, base=None):
    if bid in installed:
        return installed[bid]
    for aid, info in installed.items():
        if bid.startswith(aid + "."):
            return info
    comp = component_of or {}
    parent = comp.get(bid) or (comp.get(base) if base else None)
    if parent and parent in installed:
        return installed[parent]
    return None


CACHE_DIR_NAMES = {"caches", "cache", "tmp", "temp", "code cache", "gpucache",
                   "cachestorage", "service worker", "crashpad"}
CACHE_SKIP_TOP = {"Documents", "Desktop", "Downloads", "Movies", "Music", "Pictures"}


def cache_subdirs(container_path, max_depth=4, deadline=None):
    """容器 Data 下的可再生缓存目录（不跟随链接、限制深度与时间预算）。

    只按目录名命中 CACHE_DIR_NAMES，跳过个人目录顶层；命中后不再向下遍历。
    """
    base = os.path.join(container_path, "Data")
    # 容器或 Data 本身是符号链接时不拆（否则会返回链接外的路径）。
    if not os.path.isdir(base) or os.path.islink(base) or os.path.islink(container_path):
        return []
    hits = []
    for root, dirs, _files in os.walk(base):
        if deadline and time.time() > deadline:
            break
        rel = os.path.relpath(root, base)
        if rel != "." and rel.split(os.sep)[0] in CACHE_SKIP_TOP:
            dirs[:] = []
            continue
        depth = 0 if rel == "." else rel.count(os.sep) + 1
        if depth > max_depth:
            dirs[:] = []
            continue
        dirs[:] = [d for d in dirs if not os.path.islink(os.path.join(root, d))]
        if os.path.basename(root).lower() in CACHE_DIR_NAMES:
            hits.append(root)
            dirs[:] = []
    return hits


def strict_descendant(path, parents):
    """path 的 realpath 必须严格位于任一 parent 的 realpath 之下。"""
    try:
        real = os.path.realpath(path)
    except OSError:
        return False
    for parent in parents or []:
        try:
            base = os.path.realpath(parent)
        except OSError:
            continue
        if real != base and real.startswith(base + os.sep):
            return True
    return False


def apply_leftover_cache_split(groups, splits):
    """把 confirm 残留组里的缓存子目录拆成独立 safe 组。

    splits: {baseId: {"kb": int, "paths": [str]}}，只含未安装、未运行 App 的缓存子目录。
    拆出的组带 cachePart=True，客户端据此显示「App · 缓存」；原组保留其余数据并保持 confirm。
    """
    for base, split in list(splits.items()):
        group = groups.get(base)
        if group is None or group.get("bucket") != "confirm":
            continue
        if "进程正在运行" in (group.get("why") or ""):
            continue
        cache_kb = int(split.get("kb") or 0)
        if cache_kb < 1024:  # 小于 1 MB 不值得单列
            continue
        raw_paths = list(split.get("paths") or [])
        paths = [p for p in raw_paths if strict_descendant(p, group.get("paths"))]
        # 拆分路径必须严格在容器之下；否则（自命中/符号链接逃逸）保留原 confirm 组不拆。
        if not paths or len(paths) != len(raw_paths):
            continue
        split_id = f"{base}.cache"
        groups[split_id] = {
            "baseId": split_id,
            "name": group.get("name") or group["baseId"],
            "kb": cache_kb,
            "count": len(split.get("paths") or []),
            "bucket": "safe",
            "why": "已卸载 App 的缓存子目录，可重建；文档/聊天等数据仍保留",
            "paths": paths,
            "bundleIds": [],
            "cachePart": True,
        }
        group["kb"] = max(0, group["kb"] - cache_kb)
        group["why"] = f"{group['why']}；其中缓存子目录已单独列出（可清理）"
    # 缓存即全部内容时，原 confirm 组没有剩余数据
    for key in [k for k, g in groups.items() if int(g.get("kb") or 0) <= 0]:
        del groups[key]
    return groups


def classify(base, kb, rules):
    """整容器一律「需确认」；safe 只来自 cache_subdirs() 拆出的缓存子目录。

    卸载残留里可能混着文档/录制/下载内容，按名字猜「缓存为主」不够可靠；
    宁可让用户多确认一次，也不要把整个容器默认勾进推荐清理。
    """
    low = base.lower()
    if any(h in low for h in rules["mediaHints"]):
        return "confirm", "媒体类 App 已卸载；其中缓存子目录会单独列出（可清理），其余可能含已下载内容"
    if any(h in low for h in rules["meetingHints"]):
        return "confirm", "会议软件已卸载；其中缓存子目录会单独列出（可清理），录制/文档等需确认"
    if any(h in low for h in rules["userDataHints"]):
        return "confirm", "可能含聊天记录/文档/笔记"
    if any(h in low for h in rules["devHints"]):
        return "confirm", "开发工具数据，请确认项目仍在使用后再清理"
    return "confirm", "未知来源，需人工确认"


def fda_status(home):
    probes = [home / "Library" / "Mail", home / "Library" / "Messages", home / "Library" / "Safari",
              home / "Library" / "Group Containers",
              home / "Library" / "Application Support" / "com.apple.TCC" / "TCC.db"]
    accessible = existing = denied = 0
    for p in probes:
        if not p.exists():
            continue
        existing += 1
        try:
            if p.is_dir():
                os.listdir(p)
            else:
                with open(p, "rb") as f:
                    f.read(1)
            accessible += 1
        except PermissionError:
            denied += 1
        except Exception:
            pass
    if denied:
        return "denied", f"{denied}/{existing} 个受保护路径被拒绝"
    if accessible:
        return "granted", f"{accessible}/{existing} 个受保护路径可读"
    return "unknown", "未找到可探测的受保护路径"


PERMISSION_HELP = """\
❌ 缺少「完全磁盘访问权限」（Full Disk Access），已停止扫描。

   没有该权限时，macOS 会把其他 App 的容器显示成几十 KB 的空壳，
   报告会严重漏报——这正是市面清理软件「扫不到」的原因。

请这样开启：
  1. 打开「系统设置」→「隐私与安全性」→「完全磁盘访问权限」
  2. 点「+」添加 DeepSeek Harness（或打开已有开关）
  3. 完全退出并重新打开 DeepSeek Harness（TCC 变更通常需重启应用生效）
  4. 回到会话，重新运行本命令

若只想先看部分结果，可加 --force（报告会标注结果不可信）。
"""


def permission_line(status, detail):
    label = {"granted": "已授权", "denied": "**未授权**", "unknown": "无法确认"}[status]
    return f"权限检查：macOS 完全磁盘访问 = {label}（{detail}）"


def process_snapshot():
    """一次抓取全部进程命令行，避免每个 bundle id 反复 pgrep（几十倍提速）。"""
    return run_cmd(["pgrep", "-fl", "."], timeout=15).lower()


def snapshot_available(procs):
    """进程快照是否可用：`pgrep -fl .` 正常时至少能列出 init/自身，空输出即视为不可用。

    快照不可用时必须 fail-closed：宁可把浏览器/App 缓存误判成运行中，也不能默认放行清理。
    """
    return bool(str(procs or "").strip())


def app_cache_running(app, base_id, procs):
    """已安装 App 缓存是否按「运行中」处理（快照不可用时一律运行中）。"""
    if not snapshot_available(procs):
        return True
    low = str(procs).lower()
    return str(app or "").lower() in low or str(base_id or "").lower() in low


def leftover_split_enabled(container, procs):
    """卸载残留容器是否允许拆出缓存子目录；进程快照不可用时 fail-closed，不拆。"""
    if not snapshot_available(procs):
        return False
    return not any(str(b).lower() in procs for b in (container["bundleId"], container["baseId"]))


def dev_sizes(home, rules):
    # (path, advice, cleanable) —— cleanable=False 的只展示、不进入清理允许列表
    items = [
        (home / ".npm" / "_cacache", "npm cache clean --force", True),
        (home / "Library" / "pnpm" / "store", "pnpm store prune", True),
        (home / ".cache" / "codex-runtimes", "Codex 缓存，需要时会重新下载", True),
        (home / ".m2" / "repository", "Maven 仓库，构建时会重新下载", True),
        (home / "Library" / "Caches" / "electron-builder", "打包时会重新下载", True),
        (home / "Library" / "Caches" / "node-gyp", "需要时会重新下载", True),
        (home / "Library" / "Caches" / "next-swc", "需要时会重新下载", True),
        (home / "Library" / "Caches" / "CocoaPods", "CocoaPods 缓存，需要时会重新下载", True),
        (home / "Library" / "Caches" / "org.swift.swiftpm", "SwiftPM 缓存", True),
        (home / "Library" / "Developer" / "Xcode" / "DerivedData", "Xcode 构建缓存，安全可再生", True),
        (home / "Library" / "Developer" / "Xcode" / "DeviceSupport", "iOS 设备支持文件，需要时会重新下载", True),
        (home / "Library" / "Developer" / "CoreSimulator", "模拟器数据，确认不再使用后再清理", False),
        (home / "Library" / "Developer" / "Xcode" / "Archives", "应用归档，提交或回滚时可能需要，需确认", False),
        (home / "Library" / "Containers" / "com.docker.docker" / "Data" / "vms", "Docker 镜像和数据卷，删除会丢失容器数据，需确认", False),
    ]

    def one(pair):
        path, advice, cleanable = pair
        kb = du_one(path, timeout=90)
        return {"path": str(path), "kb": kb, "advice": advice, "cleanable": cleanable} if kb else None

    out = []
    with ThreadPoolExecutor(max_workers=4) as ex:
        for r in ex.map(one, items):
            if r:
                out.append(r)
    out.sort(key=lambda x: -x["kb"])
    return out


# 浏览器进程子串（pgrep -fl 小写全文匹配）：宁可误标运行中（暂时不可清），不可漏标。
BROWSER_PROC_HINTS = {
    "Chrome": "google chrome",
    "Edge": "microsoft edge",
    "Firefox": "firefox",
    "Safari": "safari",
    "Arc": "arc",
}


def browser_caches(home, procs=""):
    """浏览器缓存（按浏览器/profile 细分；不碰书签、密码、历史）。"""
    # 只统计真正的缓存目录；绝不进入 Application Support（含书签/密码/历史）
    specs = [
        ("Chrome", home / "Library" / "Caches" / "Google" / "Chrome"),
        ("Edge", home / "Library" / "Caches" / "Microsoft Edge"),
        ("Firefox", home / "Library" / "Caches" / "Firefox" / "Profiles"),
        ("Safari", home / "Library" / "Caches" / "com.apple.Safari"),
        ("Arc", home / "Library" / "Caches" / "Arc"),
    ]
    out = []
    for name, path in specs:
        kb = du_one(path, timeout=60)
        if kb:
            hint = BROWSER_PROC_HINTS.get(name, "")
            out.append({"name": name, "path": str(path), "kb": kb,
                        # 快照不可用时无法确认，统一按运行中处理（宁可暂时不可清）。
                        "running": (not snapshot_available(procs))
                        or (bool(hint) and hint in procs)})
    return out


def _find_keyword_dirs(base, keywords, limit=80):
    """find 关键字目录：全部以 argv 传参，输出在 Python 侧截断。

    旧实现把 base 拼进 `find ... | head -80` shell 字符串，容器内不可信目录名里的
    `$()`/反引号会被执行；这里同时去掉 `| head`，避免 find 因 SIGPIPE 静默丢结果。
    """
    argv = ["find", str(base), "-maxdepth", "8", "-type", "d", "("]
    for index, keyword in enumerate(keywords):
        if index:
            argv.append("-o")
        argv.extend(["-iname", keyword])
    argv.extend([")", "-not", "-path", "*/WebKit/*", "-not", "-path", "*/.Trash/*"])
    return [p for p in run_cmd(argv, timeout=120).splitlines() if p][:limit]


def special_clean(home):
    """微信 / 企业微信 / QQ 专清：按类型聚合，只有缓存类 cleanable=True。"""
    apps = [
        ("微信", home / "Library" / "Containers" / "com.tencent.xinWeChat" / "Data"),
        ("企业微信", home / "Library" / "Containers" / "com.tencent.WeWorkMac" / "Data"),
        ("QQ", home / "Library" / "Containers" / "com.tencent.qq" / "Data"),
    ]
    keywords = ["cache", "caches", "cefcache", "image", "images", "video", "videos",
                "voice", "voices", "audio", "file", "files", "emoji", "emojis",
                "sticker", "stickers", "attach", "attachment", "attachments",
                "download", "downloads"]
    out = []
    for app, base in apps:
        if not base.is_dir():
            continue
        paths = _find_keyword_dirs(base, keywords, limit=80)
        rows = []
        for p in paths:
            kb = du_one(Path(p), timeout=60)
            # du 可能失败（扫描期间被删、权限变化、路径不可读）：None 不能参与比较。
            if kb is None or kb < 1024:
                continue
            name = os.path.basename(p).lower()
            low = p.lower()
            if "cache" in name:
                # 企微个人 Profile 下的 Caches 是聊天媒体缓存，删除后可能无法恢复 → 只读
                if "/profiles/" in low and "tencentmeeting" not in low:
                    cat, clean = "聊天缓存", False
                else:
                    cat, clean = "缓存", True
            elif "image" in name:
                cat, clean = "图片", False
            elif "video" in name:
                cat, clean = "视频", False
            elif "voice" in name or "audio" in name:
                cat, clean = "语音", False
            elif "emoji" in name or "sticker" in name:
                cat, clean = "表情", False
            elif "attach" in name or "download" in name:
                cat, clean = "附件/下载", False
            else:
                cat, clean = "文件", False
            rows.append({"path": p, "kb": kb, "category": cat, "cleanable": clean})
        rows.sort(key=lambda r: -r["kb"])
        kept = []
        for r in rows:
            if any(r["path"] == k["path"] or r["path"].startswith(k["path"] + os.sep) for k in kept):
                continue
            kept.append(r)
        if not kept:
            continue
        cats = {}
        for r in kept:
            c = cats.setdefault(r["category"], {"name": r["category"], "kb": 0,
                                                "paths": [], "cleanable": r["cleanable"]})
            c["kb"] += r["kb"]
            c["paths"].append(r["path"])
            c["cleanable"] = c["cleanable"] and r["cleanable"]
        out.append({"app": app, "base": str(base),
                    "totalKb": sum(c["kb"] for c in cats.values()),
                    "categories": sorted(cats.values(), key=lambda c: -c["kb"])})
    return out


def big_files(home, min_mb, top=15, deadline=None):
    """全盘大文件：流式读取 find -print0 并维护 top-N 堆；超预算即截断（与 Windows 端同一约定）。

    不能用 head 截断 find 输出：那会把「先遍历到的前 40 个」误当候选集，
    真正的最大文件可能根本没进堆（Windows 端已是全量遍历 + 排序取 top-N）。
    """
    home = Path(home)
    argv = [
        "find", str(home), "-xdev", "(",
        "-path", str(home / "Library" / "Containers"),
        "-o", "-path", str(home / "Library" / "CloudStorage"),
        "-o", "-path", str(home / "Library" / "Mobile Documents"),
        "-o", "-path", str(home / "Library" / "Mail"),
        "-o", "-path", str(home / "Library" / "Messages"),
        "-o", "-path", str(home / ".Trash"),
        "-o", "-name", "node_modules", "-o", "-name", ".git",
        # App 包目录内部的文件不能出现在「大文件」里：搬走单个文件会破坏照片图库/Final Cut 等。
        "-o", "-name", "*.photoslibrary", "-o", "-name", "*.photolibrary",
        "-o", "-name", "*.sparsebundle", "-o", "-name", "*.fcpbundle",
        "-o", "-name", "*.logicx", "-o", "-name", "*.band",
        ")", "-prune", "-o", "-type", "f", "-size", f"+{min_mb}M", "-print0",
    ]
    heap = []  # (bytes, path, mtime, atime)，只保留最大的 top 个
    truncated = False
    try:
        proc = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    except Exception:
        return [], False
    buf = b""
    while True:
        if deadline and time.time() > deadline:
            truncated = True
            proc.kill()
            break
        try:
            chunk = proc.stdout.read1(65536)  # read1：有数据即返回，不等缓冲区填满
        except Exception:
            break
        if not chunk:
            break
        buf += chunk
        *ready, buf = buf.split(b"\0")
        for raw in ready:
            try:
                p = raw.decode("utf-8", errors="replace")
                st = os.stat(p)
                item = (st.st_size, p, int(st.st_mtime), int(st.st_atime))
                if len(heap) < top:
                    heapq.heappush(heap, item)
                elif item[0] > heap[0][0]:
                    heapq.heapreplace(heap, item)
            except Exception:
                continue
    proc.wait()
    rows = [{"path": p, "bytes": b, "mtime": m, "atime": a}
            for b, p, m, a in sorted(heap, reverse=True)]
    return rows, truncated


def big_category(path, home):
    try:
        parts = Path(path).relative_to(home).parts
    except Exception:
        parts = Path(path).parts
    if "Application Support" in parts:
        return "App 资源（删了会影响功能）"
    if parts and parts[0] in ("Documents", "Desktop", "Downloads", "Movies", "Music", "Pictures"):
        return "个人文件（可迁移/备份）"
    if parts and parts[0] in (".codex", ".claude", ".cache", ".npm", ".vscode", ".dsh"):
        return "工具数据（可能含会话/登录）"
    if parts and parts[0] == "Library":
        return "系统/App 数据（谨慎）"
    return "其他"


def scan(args):
    t0 = time.time()
    home = Path(args.home).expanduser().resolve() if args.home else Path.home()
    rules = load_rules()
    r = {"version": VERSION, "platform": "macos", "generatedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
         "host": os.uname().nodename, "home": str(home),
         "processSnapshot": "unavailable"}

    try:
        st = os.statvfs("/System/Volumes/Data")
        total = st.f_bavail * st.f_frsize + (st.f_blocks - st.f_bfree) * st.f_frsize
        free = st.f_bavail * st.f_frsize
        used = total - free
    except Exception:
        total = free = used = 0

    _progress(2, "读取磁盘信息")
    status, detail = fda_status(home)
    r["fda"] = {"status": status, "detail": detail}
    r["disk"] = {"total": total, "used": used, "free": free, "homeKb": None}

    with ThreadPoolExecutor(max_workers=7) as ex:
        f_cont = ex.submit(du_map, str(home / "Library" / "Containers") + "/*", 240)
        f_cache = ex.submit(du_map, str(home / "Library" / "Caches") + "/*", 180)
        f_dotcache = ex.submit(du_map, str(home / ".cache") + "/*", 120)
        f_cloud = ex.submit(du_map, str(home / "Library" / "CloudStorage") + "/*", 60) if not args.no_cloud else None
        f_dev = ex.submit(dev_sizes, home, rules)
        f_apps = ex.submit(installed_apps, home)
        f_home = ex.submit(du_one, home, 300) if args.home_total else None
        f_big = ex.submit(big_files, home, args.min_mb, args.top, time.time() + 180) if not args.quick else None
        _progress(8, "扫描 App 容器与缓存…")

        cont_sizes = f_cont.result()
        _progress(30, "扫描 App 容器")
        cache_sizes = f_cache.result()
        _progress(45, "扫描系统/用户缓存")
        dotcache_sizes = f_dotcache.result()
        _progress(55, "扫描 ~/.cache")
        cloud_sizes = f_cloud.result() if f_cloud else {}
        dev = f_dev.result()
        _progress(65, "扫描开发缓存")
        installed = f_apps.result()
        _progress(75, "识别已安装 App")
        if f_home:
            r["disk"]["homeKb"] = f_home.result()
        big, big_trunc = f_big.result() if f_big else ([], False)
        _progress(88, "扫描大文件" if f_big else "汇总结果")

    r["installedCount"] = len(installed)

    # 容器
    cont = []
    for path, kb in cont_sizes.items():
        bid = plist_raw(os.path.join(path, ".com.apple.containermanagerd.metadata.plist"),
                        "MCMMetadataIdentifier") or os.path.basename(path)
        base = base_id(bid, rules)
        owner = belongs_to_installed(bid, installed, rules.get("componentOf"), base)
        if owner:
            cont.append({"path": path, "bundleId": bid, "baseId": base, "kb": kb,
                         "bucket": "keep", "why": f"已安装：{owner['name']}",
                         "installed": True, "installedName": owner['name']})
            continue
        if bid.startswith("com.apple."):
            cont.append({"path": path, "bundleId": bid, "baseId": base, "kb": kb,
                         "bucket": "keep", "why": "系统自带 App 数据"})
            continue
        bucket, why = classify(base, kb, rules)
        cont.append({"path": path, "bundleId": bid, "baseId": base, "kb": kb,
                     "bucket": bucket, "why": why})
    cont.sort(key=lambda x: -x["kb"])
    r["containers"] = cont

    # 在用 App 的可再生缓存（仅 Caches/tmp；聊天类容器交给 special 专清）
    chat_prefixes = ("com.tencent.xinwechat", "com.tencent.weworkmac", "com.tencent.qq")

    cache_candidates = []
    for c in cont:
        if not c.get("installed"):
            continue
        low = c["baseId"].lower()
        if low.startswith("com.apple.") or any(low.startswith(p) for p in chat_prefixes):
            continue
        for p in cache_subdirs(c["path"]):
            cache_candidates.append((c, p))
    procs = process_snapshot()
    r["processSnapshot"] = "ok" if snapshot_available(procs) else "unavailable"
    app_caches = []
    if cache_candidates:
        _progress(80, "扫描应用缓存")

        def _cache_size(pair):
            c, p = pair
            kb = du_one(p, timeout=60)
            return (c, p, kb) if kb else None

        with ThreadPoolExecutor(max_workers=8) as ex:
            rows = [x for x in ex.map(_cache_size, cache_candidates) if x]
        by_app = {}
        for c, p, kb in rows:
            g = by_app.setdefault(c["baseId"], {"baseId": c["baseId"],
                                                 "app": c.get("installedName") or c["baseId"],
                                                 "kb": 0, "paths": [], "running": False})
            g["kb"] += kb
            g["paths"].append(p)
        for g in by_app.values():
            g["running"] = app_cache_running(g["app"], g["baseId"], procs)
            g["cleanable"] = not g["running"]
            g["count"] = len(g["paths"])
            if g["kb"] >= 1024:
                app_caches.append(g)
        app_caches.sort(key=lambda x: -x["kb"])
    r["appCaches"] = app_caches[:80]

    # 卸载残留的细粒度拆分：把 confirm 容器里的缓存子目录单独标为 safe，
    # 剩余部分仍为 confirm（可能含文档/聊天/下载内容）。聊天类容器交给 special 专清，不拆。
    split_deadline = time.time() + 25
    split_candidates = []
    for c in cont:
        if c.get("installed") or c["bucket"] != "confirm":
            continue
        low = c["baseId"].lower()
        if low.startswith("com.apple.") or any(low.startswith(p) for p in chat_prefixes):
            continue
        if not leftover_split_enabled(c, procs):
            continue
        for p in cache_subdirs(c["path"], deadline=split_deadline):
            split_candidates.append((c, p))
    leftover_splits = {}
    if split_candidates:
        _progress(84, "扫描残留缓存子目录")

        def _split_size(pair):
            c, p = pair
            kb = du_one(p, timeout=30)
            return (c, p, kb) if kb and kb >= 1024 else None

        with ThreadPoolExecutor(max_workers=8) as ex:
            split_rows = [x for x in ex.map(_split_size, split_candidates) if x]
        for c, p, kb in split_rows:
            entry = leftover_splits.setdefault(c["baseId"], {"kb": 0, "paths": []})
            entry["kb"] += kb
            entry["paths"].append(p)

    # 归并 + 运行中检查
    groups = {}
    for c in cont:
        if c["bucket"] == "keep":
            continue
        g = groups.setdefault(c["baseId"], {"baseId": c["baseId"], "kb": 0, "count": 0,
                                            "bucket": c["bucket"], "why": c["why"],
                                            "paths": [], "bundleIds": []})
        g["kb"] += c["kb"]
        g["count"] += 1
        g["paths"].append(c["path"])
        g["bundleIds"].append(c["bundleId"])
    for g in groups.values():
        g["name"] = rules["knownNames"].get(g["baseId"], g["baseId"])
        if any(b.lower() in procs for b in g["bundleIds"]):
            g["bucket"] = "confirm"
            g["why"] += "；检测到相关进程正在运行，暂不可清理"
    apply_leftover_cache_split(groups, leftover_splits)
    r["leftoverGroups"] = sorted(groups.values(), key=lambda x: -x["kb"])

    # 缓存
    caches = [{"path": p, "kb": k} for p, k in cache_sizes.items()]
    caches += [{"path": p, "kb": k} for p, k in dotcache_sizes.items()]
    for c in caches:
        c["system"] = any(s in c["path"] for s in rules["systemCacheNames"])
    r["caches"] = sorted(caches, key=lambda x: -x["kb"])
    r["devCaches"] = dev
    r["devPaths"] = sorted({d["path"] for d in dev})
    r["browsers"] = browser_caches(home, procs)
    _progress(90, "分析微信/企业微信/QQ 数据")
    r["special"] = special_clean(home)

    r["cloudStorage"] = [{"path": p, "kb": k} for p, k in cloud_sizes.items()]
    _progress(95, "统计废纸篓")
    r["trashKb"] = du_one(home / ".Trash", timeout=120)
    r["bigFiles"] = [{"path": b["path"], "kb": b["bytes"] // 1024,
                      "mtime": b.get("mtime", 0), "atime": b.get("atime", 0),
                      "ext": os.path.splitext(b["path"])[1].lower(),
                      "category": big_category(b["path"], home)} for b in big]
    r["truncated"] = big_trunc
    r["bigFilesTop"] = args.top
    _progress(100, "完成")
    r["elapsed"] = round(time.time() - t0, 1)
    r["minLeftoverKb"] = int(args.min_leftover_mb * 1024)
    r["estimate"] = estimate_of(r, args.min_leftover_mb)
    return r


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


def estimate_of(r, min_leftover_mb):
    """统一估算，供 Markdown 与 JSON 共用（已去重）。

    cacheKb 只统计 UI 会展示的 caches 行：被 browsers/devCaches/appCaches/special/
    leftoverGroups 覆盖或包住的父级缓存目录不计入（与客户端 buildRows 隐藏口径一致）。
    minLeftoverKb 语义见报告同名字段；safe 阈值仍用传入的 min_leftover_mb。
    """
    safe = sum(g["kb"] for g in r["leftoverGroups"]
               if g["bucket"] == "safe" and g["kb"] >= min_leftover_mb * 1024)
    specific = _specific_paths(r)
    cache_map = {c["path"]: c["kb"] for c in r["caches"]
                 if not c.get("system") and not _overlaps_specific(c["path"], specific)}
    dev_map = {d["path"]: d["kb"] for d in r["devCaches"]}
    overlap = sum(min(cache_map[p], dev_map[p]) for p in set(cache_map) & set(dev_map))
    cache = sum(cache_map.values()) - overlap
    dev = sum(dev_map.values())
    confirm = sum(g["kb"] for g in r["leftoverGroups"] if g["bucket"] == "confirm")
    # 浏览器 / 应用缓存 / 聊天缓存同样进入允许集合，也必须计入「预计可释放」，
    # 否则 disk_report 与 AI 摘要会比面板可勾选合计小。
    browser = sum(b.get("kb", 0) for b in r.get("browsers") or [] if not b.get("running"))
    app_cache = sum(a.get("kb", 0) for a in r.get("appCaches") or []
                    if not a.get("running") and a.get("cleanable", True))
    special = sum(c.get("kb", 0) for app in r.get("special") or []
                  for c in app.get("categories") or [] if c.get("cleanable"))
    return {"safeKb": safe, "confirmKb": confirm, "cacheKb": cache, "devKb": dev,
            "browserKb": browser, "appCacheKb": app_cache, "specialKb": special,
            "overlapKb": overlap, "totalKb": safe + cache + dev + browser + app_cache + special}


def redacted(text, home, host):
    """脱敏：兼容 POSIX / Windows 两种路径分隔符。"""
    raw = str(home)
    variants = {raw, raw.replace("/", "\\"), raw.replace("\\", "/")}
    for v in variants:
        if v:
            text = text.replace(v, "~")
    return text.replace(host, "***")


def render_md(r, args):
    home = Path(r["home"])
    host = r["host"]
    rules = load_rules()
    th = rules["thresholds"]
    L = []
    a = L.append
    a("# Mac 磁盘体检报告")
    a("")
    a(f"- 工具版本：deepclean-mydisk v{r['version']}（{r.get('platform', 'macos')}）")
    a(f"- 生成时间：{r['generatedAt']}")
    a(f"- 机器：{host if not args.redact else '***'}")
    status = r["fda"]["status"]
    fda_txt = {"granted": "已授权", "denied": "**未授权（App 容器会显示为空壳）**",
               "unknown": "无法确认（未找到可探测路径）"}[status]
    a(f"- 完全磁盘访问（FDA）：{fda_txt}（{r['fda']['detail']}）")
    a(f"- 已安装 App：{r['installedCount']} 个")
    tb, used, free = r["disk"]["total"], r["disk"]["used"], r["disk"]["free"]
    a(f"- 数据卷：{tb/1e9:.0f} GB 中已用 {used/1e9:.0f} GB，可用 **{free/1e9:.0f} GB**")
    if r["disk"]["homeKb"]:
        a(f"- 个人文件夹：{human(r['disk']['homeKb'])}")
    a(f"- 扫描耗时：{r['elapsed']}s" + ("（快速模式：未扫描大文件）" if args.quick else ""))
    if r.get("truncated"):
        a("- ⚠️ 大文件扫描超过时间预算，结果可能不全")
    a("- 扫描范围：`~/Library/Containers`、`~/Library/Caches`、`~/.cache`、开发缓存、"
      "`~/Library/CloudStorage`、`~/.Trash`、大文件；**不含** `/private/var`、`/Library`、其他用户。")
    if status == "denied":
        a("")
        a("> ⚠️ 没有完全磁盘访问权限时，下面的容器大小不可信。"
          "请先到「系统设置 → 隐私与安全性 → 完全磁盘访问权限」授权后重跑。")

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

    gl = r["leftoverGroups"]
    minb = args.min_leftover_mb * 1024
    big_g = [g for g in gl if g["kb"] >= minb]
    small = [g for g in gl if g["kb"] < minb]

    def group_rows(bucket):
        rows = []
        for g in big_g:
            if g["bucket"] != bucket:
                continue
            name = g.get("name") or g["baseId"]
            rows.append({"path": f"{name}（{g['baseId']}）", "kb": g["kb"],
                         "note": f"{g['why']}；{g['count']} 个目录；示例 `{g['paths'][0]}`"})
        return rows

    table("一、推荐清理（已卸载 App 的可再生缓存子目录）", group_rows("safe"))
    table("二、需确认（可能含聊天记录/文档/笔记/下载内容）", group_rows("confirm"))
    if small:
        a(f"> 另有 **{len(small)}** 个小于 {args.min_leftover_mb} MB 的残留碎片，"
          f"合计 {human(sum(g['kb'] for g in small))}。")
        a("")

    dev_paths = set(r.get("devPaths", []))
    table("三、系统缓存（不建议清理）",
          [{"path": c["path"], "kb": c["kb"], "note": "系统缓存，释放空间有限，不建议清理"}
           for c in r["caches"] if c.get("system") and c["kb"] >= th["displayMinMb"] * 1024])
    def cache_note(c):
        note = "缓存，可重建"
        if "ms-playwright" in c["path"]:
            note += "；Playwright 浏览器，测试仍在使用请保留"
        elif c["kb"] >= 500 * 1024:
            note += "；体积较大，请确认对应应用仍在使用"
        return note

    table("四、用户缓存（可重建）",
          [{"path": c["path"], "kb": c["kb"], "note": cache_note(c)}
           for c in r["caches"]
           if not c.get("system") and c["kb"] >= th["displayMinMb"] * 1024
           and c["path"] not in dev_paths])
    table("五、开发缓存（可再生，按说明清理）",
          [{"path": d["path"], "kb": d["kb"], "note": d["advice"]} for d in r["devCaches"]])
    table("六、云盘目录（不建议清理）",
          [{"path": c["path"], "kb": c["kb"], "note": "云盘同步目录，**不要直接删文件**"}
           for c in r["cloudStorage"]])
    table(f"七、大文件（> {args.min_mb} MB，最大的 {args.top} 个）",
          [{"path": b["path"], "kb": b["kb"], "note": b["category"]} for b in r["bigFiles"]])

    a("## 八、不建议清理")
    a("")
    a("- `~/Library/Mail`、`~/Library/Messages`、`~/Library/Photos`、`~/Library/Keychains`")
    a("- `~/Library/CloudStorage`（云盘：本地删除可能同步删除云端）")
    a("- `~/Library/Group Containers`、`~/Library/Application Support`（除明确缓存子目录）")
    a("- 任何「已安装 App」的容器（已自动归并，不会出现在清理项里）")
    a("")

    est = r.get("estimate") or estimate_of(r, args.min_leftover_mb)
    safe_kb, cache_kb, dev_kb = est["safeKb"], est["cacheKb"], est["devKb"]
    overlap_kb = est["overlapKb"]
    a("## 九、预计可释放")
    a("")
    a(f"- 推荐清理：**{human(safe_kb)}**")
    a(f"- 用户缓存（已去重）：**{human(cache_kb)}**（删除后会重新下载/重建）")
    a(f"- 开发缓存：**{human(dev_kb)}**（用到时重新下载）")
    a(f"- 合计约：**{human(safe_kb + cache_kb + dev_kb)}**（不含需确认项与废纸篓）")
    if overlap_kb:
        a(f"- 已避免重复计算：{human(overlap_kb)}（同时出现在缓存与开发缓存中）")
    if r["trashKb"]:
        a(f"- 另有废纸篓 {human(r['trashKb'])}，清空可额外释放。")
    a("")

    a("## 十、建议命令（只生成，不执行）")
    a("")
    a("```bash")
    a("# 缓存类（安全）")
    a("npm cache clean --force")
    a("pnpm store prune")
    a("")
    a("# 卸载残留：仅「推荐清理」档，且只移到废纸篓（-n 不覆盖重名）")
    emitted = 0
    for g in big_g:
        if g["bucket"] != "safe" or g["kb"] < th["commandMinMb"] * 1024:
            continue
        for p in g["paths"][:3]:
            a(f'mv -n {shlex.quote(str(p))} ~/.Trash/')
            emitted += 1
    if emitted == 0:
        a("# 本次推荐清理项均小于 100 MB，未生成 mv；如需清理请逐项确认")
    a("```")
    a("")
    a("> 需确认项不生成命令；永久删除必须二次确认。")
    md = "\n".join(L)
    if args.redact:
        md = redacted(md, r["home"], host)
    return md


def main():
    ap = argparse.ArgumentParser(description="只读 Mac 磁盘体检")
    ap.add_argument("--md")
    ap.add_argument("--json")
    ap.add_argument("--home", help="覆盖扫描根（测试用）")
    ap.add_argument("--top", type=int, default=15)
    ap.add_argument("--min-mb", type=int, default=300, help="大文件阈值 MB")
    ap.add_argument("--min-leftover-mb", type=int, default=10, help="残留展示阈值 MB")
    ap.add_argument("--quick", action="store_true", help="跳过全盘大文件扫描")
    ap.add_argument("--home-total", action="store_true", help="额外统计个人文件夹总大小（慢 ~30s）")
    ap.add_argument("--no-cloud", action="store_true", help="跳过 CloudStorage 统计")
    ap.add_argument("--redact", action="store_true", help="脱敏：HOME→~、主机名打码")
    ap.add_argument("--check-permissions", action="store_true",
                    help="只检查完全磁盘访问权限后退出")
    ap.add_argument("--permission-status", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("--force", action="store_true", help="权限不足时仍生成部分报告（不可信）")
    ap.add_argument("--version", action="version", version=f"deepclean-mydisk {VERSION}")
    args = ap.parse_args()

    home = Path(args.home).expanduser().resolve() if args.home else Path.home()
    status, detail = fda_status(home)
    if args.check_permissions:
        if args.permission_status:
            print(f"DEEPCLEAN_FDA {status}", file=sys.stderr)
        print(permission_line(status, detail))
        if status == "denied":
            print()
            print(PERMISSION_HELP)
            sys.exit(2)
        sys.exit(0)
    if status == "denied" and not args.force:
        if args.permission_status:
            print("DEEPCLEAN_FDA denied", file=sys.stderr)
        print(PERMISSION_HELP)
        sys.exit(2)

    r = scan(args)
    md = render_md(r, args)
    print(md)
    if args.md:
        Path(args.md).write_text(md, encoding="utf-8")
        print(f"[written] {args.md}", file=sys.stderr)
    if args.json:
        data = json.dumps(r, ensure_ascii=False, indent=2)
        if args.redact:
            data = redacted(data, r["home"], r["host"])
        Path(args.json).write_text(data, encoding="utf-8")
        print(f"[written] {args.json}", file=sys.stderr)
    if r["fda"]["status"] == "denied" and not args.force:
        if args.permission_status:
            print("DEEPCLEAN_FDA denied", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
