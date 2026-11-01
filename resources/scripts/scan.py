#!/usr/bin/env python3
"""deepclean-mydisk —— 只读磁盘体检（v0.3）。

硬约束：只读。不删除、不移动、不修改任何文件；删除建议只生成命令文本。
"""
import argparse
import json
import os
import re
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


def sh(cmd, timeout=120):
    try:
        return subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout).stdout
    except Exception:
        return ""


def du_map(pattern, timeout=180):
    out = sh(f'du -sk {pattern} 2>/dev/null', timeout=timeout)
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
    out = sh(f'du -sk "{path}" 2>/dev/null', timeout=timeout)
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


def plist_raw(path, key):
    if not os.path.exists(path):
        return None
    out = sh(f'plutil -extract "{key}" raw -o - "{path}" 2>/dev/null', timeout=10).strip()
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
    roots += [Path(p) / "Applications" for p in sh('ls -d /Volumes/* 2>/dev/null', timeout=10).split()]
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


def classify(base, kb, rules):
    low = base.lower()
    th = rules["thresholds"]
    if any(h in low for h in rules["mediaHints"]):
        if kb >= th["mediaConfirmMb"] * 1024:
            return "confirm", "媒体类 App 已卸载；体积较大，可能含已下载内容"
        return "safe", "媒体类 App 已卸载，缓存为主"
    if any(h in low for h in rules["meetingHints"]):
        return "safe", "会议软件已卸载，缓存/日志为主"
    if any(h in low for h in rules["userDataHints"]):
        return "confirm", "可能含聊天记录/文档/笔记"
    if any(h in low for h in rules["devHints"]):
        return "confirm", "开发工具数据，确认项目还在用再清"
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
   报告会严重漏报——这正是市面清理软件"扫不到"的原因。

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
    return sh("pgrep -fl . 2>/dev/null", timeout=15).lower()


def dev_sizes(home, rules):
    # (path, advice, cleanable) —— cleanable=False 的只展示、不进入清理允许列表
    items = [
        (home / ".npm" / "_cacache", "npm cache clean --force", True),
        (home / "Library" / "pnpm" / "store", "pnpm store prune", True),
        (home / ".cache" / "codex-runtimes", "可删，Codex 用到会重下", True),
        (home / ".m2" / "repository", "可删，Maven 会重下", True),
        (home / "Library" / "Caches" / "electron-builder", "打包时重下", True),
        (home / "Library" / "Caches" / "node-gyp", "重下", True),
        (home / "Library" / "Caches" / "next-swc", "重下", True),
        (home / "Library" / "Caches" / "CocoaPods", "pod 缓存，用时重下", True),
        (home / "Library" / "Caches" / "org.swift.swiftpm", "SwiftPM 缓存", True),
        (home / "Library" / "Developer" / "Xcode" / "DerivedData", "Xcode 构建缓存，安全可再生", True),
        (home / "Library" / "Developer" / "Xcode" / "DeviceSupport", "iOS 设备支持文件，可重下", True),
        (home / "Library" / "Developer" / "CoreSimulator", "模拟器数据；确认不再用再删", False),
        (home / "Library" / "Developer" / "Xcode" / "Archives", "App 归档；提交/回滚可能需要，需确认", False),
        (home / "Library" / "Containers" / "com.docker.docker" / "Data" / "vms", "Docker 镜像/卷；删了会丢容器数据，需确认", False),
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


def browser_caches(home):
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
            out.append({"name": name, "path": str(path), "kb": kb})
    return out


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
    pattern = " -o ".join(f"-iname '{k}'" for k in keywords)
    out = []
    for app, base in apps:
        if not base.is_dir():
            continue
        cmd = (f'find "{base}" -maxdepth 8 -type d \\( {pattern} \\) '
               f'-not -path "*/WebKit/*" -not -path "*/.Trash/*" 2>/dev/null | head -80')
        paths = [p for p in sh(cmd, timeout=120).splitlines() if p]
        rows = []
        for p in paths:
            kb = du_one(Path(p), timeout=60)
            if kb < 1024:
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


def big_files(home, min_mb):
    expr = (
        f'find "{home}" -xdev \\('
        f' -path "{home}/Library/Containers" -o -path "{home}/Library/CloudStorage"'
        f' -o -path "{home}/.Trash" -o -name node_modules -o -name .git'
        f' \\) -prune -o -type f -size +{min_mb}M -print 2>/dev/null | head -40'
    )
    rows = []
    for line in sh(expr, timeout=180).splitlines():
        try:
            st = os.stat(line)
            rows.append({"path": line, "bytes": st.st_size,
                         "mtime": int(st.st_mtime), "atime": int(st.st_atime)})
        except Exception:
            continue
    rows.sort(key=lambda x: -x["bytes"])
    return rows


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
         "host": os.uname().nodename, "home": str(home)}

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
        f_cont = ex.submit(du_map, f'"{home}/Library/Containers"/*', 240)
        f_cache = ex.submit(du_map, f'"{home}/Library/Caches"/*', 180)
        f_dotcache = ex.submit(du_map, f'"{home}/.cache"/*', 120)
        f_cloud = ex.submit(du_map, f'"{home}/Library/CloudStorage"/*', 60) if not args.no_cloud else None
        f_dev = ex.submit(dev_sizes, home, rules)
        f_apps = ex.submit(installed_apps, home)
        f_home = ex.submit(du_one, home, 300) if args.home_total else None
        f_big = ex.submit(big_files, home, args.min_mb) if not args.quick else None
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
        big = f_big.result() if f_big else []
        _progress(88, "扫描大文件" if f_big else "整理结果")

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
                         "bucket": "keep", "why": f"已安装：{owner['name']}"})
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
    procs = process_snapshot()
    for g in groups.values():
        g["name"] = rules["knownNames"].get(g["baseId"], g["baseId"])
        if any(b.lower() in procs for b in g["bundleIds"]):
            g["bucket"] = "confirm"
            g["why"] += "；检测到相关进程正在运行，禁止删除"
    r["leftoverGroups"] = sorted(groups.values(), key=lambda x: -x["kb"])

    # 缓存
    caches = [{"path": p, "kb": k} for p, k in cache_sizes.items()]
    caches += [{"path": p, "kb": k} for p, k in dotcache_sizes.items()]
    for c in caches:
        c["system"] = any(s in c["path"] for s in rules["systemCacheNames"])
    r["caches"] = sorted(caches, key=lambda x: -x["kb"])
    r["devCaches"] = dev
    r["devPaths"] = sorted({d["path"] for d in dev})
    r["browsers"] = browser_caches(home)
    _progress(90, "分析微信/企微/QQ 数据")
    r["special"] = special_clean(home)

    r["cloudStorage"] = [{"path": p, "kb": k} for p, k in cloud_sizes.items()]
    _progress(95, "统计废纸篓")
    r["trashKb"] = du_one(home / ".Trash", timeout=120)
    r["bigFiles"] = [{"path": b["path"], "kb": b["bytes"] // 1024,
                      "mtime": b.get("mtime", 0), "atime": b.get("atime", 0),
                      "ext": os.path.splitext(b["path"])[1].lower(),
                      "category": big_category(b["path"], home)} for b in big[: args.top]]
    _progress(100, "完成")
    r["elapsed"] = round(time.time() - t0, 1)
    r["estimate"] = estimate_of(r, args.min_leftover_mb)
    return r


def estimate_of(r, min_leftover_mb):
    """统一估算，供 Markdown 与 JSON 共用（已去重）。"""
    safe = sum(g["kb"] for g in r["leftoverGroups"]
               if g["bucket"] == "safe" and g["kb"] >= min_leftover_mb * 1024)
    cache_map = {c["path"]: c["kb"] for c in r["caches"] if not c.get("system")}
    dev_map = {d["path"]: d["kb"] for d in r["devCaches"]}
    overlap = sum(min(cache_map[p], dev_map[p]) for p in set(cache_map) & set(dev_map))
    cache = sum(cache_map.values()) - overlap
    dev = sum(dev_map.values())
    return {"safeKb": safe, "cacheKb": cache, "devKb": dev,
            "overlapKb": overlap, "totalKb": safe + cache + dev}


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
    a(f"- 数据卷：{tb/1e9:.0f}G 中已用 {used/1e9:.0f}G，可用 **{free/1e9:.0f}G**")
    if r["disk"]["homeKb"]:
        a(f"- 家目录：{human(r['disk']['homeKb'])}")
    a(f"- 扫描耗时：{r['elapsed']}s" + ("（quick：未扫大文件）" if args.quick else ""))
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
            a(f"| {human(it.get('kb'))} | `{it.get('path','')}` | {it.get('note','')} |")
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

    table("一、可安全清理（已卸载媒体/会议类，缓存为主）", group_rows("safe"))
    table("二、需你确认（可能含聊天记录/文档/笔记/下载内容）", group_rows("confirm"))
    if small:
        a(f"> 另有 **{len(small)}** 个小于 {args.min_leftover_mb}M 的残留碎片，"
          f"合计 {human(sum(g['kb'] for g in small))}。")
        a("")

    dev_paths = set(r.get("devPaths", []))
    table("三、系统缓存（不建议清理）",
          [{"path": c["path"], "kb": c["kb"], "note": "系统缓存，收益小，不建议动"}
           for c in r["caches"] if c.get("system") and c["kb"] >= th["displayMinMb"] * 1024])
    def cache_note(c):
        note = "缓存，可重建"
        if "ms-playwright" in c["path"]:
            note += "；Playwright 浏览器，项目测试在用请保留"
        elif c["kb"] >= 500 * 1024:
            note += "；⚠️ 较大，确认对应 App 是否仍需要"
        return note

    table("四、用户缓存（可重建）",
          [{"path": c["path"], "kb": c["kb"], "note": cache_note(c)}
           for c in r["caches"]
           if not c.get("system") and c["kb"] >= th["displayMinMb"] * 1024
           and c["path"] not in dev_paths])
    table("五、开发缓存（可再生，按说明清理）",
          [{"path": d["path"], "kb": d["kb"], "note": d["advice"]} for d in r["devCaches"]])
    table("六、云盘目录（不要动）",
          [{"path": c["path"], "kb": c["kb"], "note": "云盘同步目录，**不要直接删文件**"}
           for c in r["cloudStorage"]])
    table(f"七、大文件（> {args.min_mb}M）",
          [{"path": b["path"], "kb": b["kb"], "note": b["category"]} for b in r["bigFiles"]])

    a("## 八、不要动")
    a("")
    a("- `~/Library/Mail`、`~/Library/Messages`、`~/Library/Photos`、`~/Library/Keychains`")
    a("- `~/Library/CloudStorage`（云盘：本地删除可能同步删除云端）")
    a("- `~/Library/Group Containers`、`~/Library/Application Support`（除明确缓存子目录）")
    a("- 任何「已安装 App」的容器（已自动归并，不会出现在清理项里）")
    a("")

    est = r.get("estimate") or estimate_of(r, args.min_leftover_mb)
    safe_kb, cache_kb, dev_kb = est["safeKb"], est["cacheKb"], est["devKb"]
    overlap_kb = est["overlapKb"]
    a("## 九、可回收估算")
    a("")
    a(f"- 可安全清理：**{human(safe_kb)}**")
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
    a("# 卸载残留：仅「可安全清理」档，且只移到废纸篓（-n 不覆盖重名）")
    emitted = 0
    for g in big_g:
        if g["bucket"] != "safe" or g["kb"] < th["commandMinMb"] * 1024:
            continue
        for p in g["paths"][:3]:
            a(f'mv -n "{p}" ~/.Trash/')
            emitted += 1
    if emitted == 0:
        a("# 本次可安全清理项均 <100M，未生成 mv；如需清理请逐项确认")
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
    ap.add_argument("--home-total", action="store_true", help="额外统计家目录总大小（慢 ~30s）")
    ap.add_argument("--no-cloud", action="store_true", help="跳过 CloudStorage 统计")
    ap.add_argument("--redact", action="store_true", help="脱敏：HOME→~、主机名打码")
    ap.add_argument("--check-permissions", action="store_true",
                    help="只检查完全磁盘访问权限后退出")
    ap.add_argument("--force", action="store_true", help="权限不足时仍生成部分报告（不可信）")
    ap.add_argument("--version", action="version", version=f"deepclean-mydisk {VERSION}")
    args = ap.parse_args()

    home = Path(args.home).expanduser().resolve() if args.home else Path.home()
    status, detail = fda_status(home)
    if args.check_permissions:
        print(permission_line(status, detail))
        if status == "denied":
            print()
            print(PERMISSION_HELP)
            sys.exit(2)
        sys.exit(0)
    if status == "denied" and not args.force:
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
        sys.exit(2)


if __name__ == "__main__":
    main()
