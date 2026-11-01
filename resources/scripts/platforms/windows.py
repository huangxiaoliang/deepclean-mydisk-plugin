#!/usr/bin/env python3
"""Windows 后端：只读磁盘体检（deepclean-mydisk v0.4.0）。

硬约束：只读。脚本不删除、不移动、不修改任何用户文件；
删除建议只生成 PowerShell 命令（移到回收站/隔离区），由用户确认后执行。
"""
import argparse
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from pathlib import Path

VERSION = "0.4.4"
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


def _tokens(text):
    if not text:
        return set()
    out = set()
    alnum = "".join(ch.lower() if ch.isalnum() else " " for ch in str(text))
    parts = [p for p in alnum.split() if len(p) >= 3]
    out.update(parts)
    if parts:
        out.add("".join(parts))
    return out


def installed_tokens(apps):
    tokens = set()
    for info in apps.values():
        tokens |= _tokens(info.get("display"))
        tokens |= _tokens(Path(str(info.get("installLocation"))).name if info.get("installLocation") else "")
    return tokens


def dir_name_matches_installed(name, tokens):
    toks = _tokens(name)
    return bool(toks & tokens)


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
    def add(p, label, safe=True, system=False, admin=False, advice="缓存，可重建"):
        if p and Path(p).exists():
            specs.append({"path": str(Path(p)), "label": label, "safe": safe,
                          "system": system, "admin": admin, "advice": advice})
    if local:
        add(local / "Temp", "用户临时文件")
        add(local / "CrashDumps", "崩溃转储")
        add(local / "Microsoft" / "Windows" / "WER", "Windows 错误报告")
        add(local / "npm-cache", "npm 缓存")
        add(local / "pnpm" / "store", "pnpm store")
        add(local / "pip" / "Cache", "pip 缓存")
        add(local / "Yarn" / "Cache", "Yarn 缓存")
        add(local / "Google" / "Chrome" / "User Data" / "Default" / "Cache", "Chrome 缓存")
        add(local / "Microsoft" / "Edge" / "User Data" / "Default" / "Cache", "Edge 缓存")
    if temp:
        add(temp, "临时文件")
    add(Path("C:/Windows/Temp"), "系统临时文件", admin=True)
    add(Path("C:/Windows/SoftwareDistribution/Download"), "Windows 更新缓存",
        safe=False, system=True, admin=True)
    # Firefox 多 profile
    if roaring := env_path("APPDATA"):
        for prof in _child_dirs(roaring / "Mozilla" / "Firefox" / "Profiles"):
            add(prof / "cache2", "Firefox 缓存")
    return specs


def dev_specs():
    home = Path(os.environ.get("USERPROFILE", "C:/Users/Default"))
    local = env_path("LOCALAPPDATA")
    out = []
    def add(p, advice):
        if p and Path(p).exists():
            out.append({"path": str(Path(p)), "advice": advice})
    add(home / ".gradle" / "caches", "Gradle 缓存，构建时重下")
    add(home / ".m2" / "repository", "Maven 仓库，构建时重下")
    add(home / ".nuget" / "packages", "NuGet 包，还原时重下")
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


def big_files(home, min_mb, cloud, top=15):
    skip_dirs = {"appdata", "node_modules", ".git", "$recycle.bin", "system volume information"}
    cloud_resolved = [str(Path(c)) for c in cloud]
    rows = []
    for root, dirs, files in os.walk(home):
        dirs[:] = [d for d in dirs if d.lower() not in skip_dirs
                   and not is_reparse(os.path.join(root, d))
                   and not any(os.path.join(root, d).startswith(c) for c in cloud_resolved)]
        for f in files:
            try:
                p = os.path.join(root, f)
                if is_reparse(p):
                    continue
                sz = os.path.getsize(p)
                if sz >= min_mb * 1024 * 1024:
                    rows.append({"path": p, "bytes": sz})
            except OSError:
                continue
    rows.sort(key=lambda x: -x["bytes"])
    return rows[:top]


def scan(args):
    _stdout_utf8()
    t0 = time.time()
    home = Path(args.home).expanduser().resolve() if args.home else Path(os.environ.get("USERPROFILE", "C:/Users/Default"))
    local = env_path("LOCALAPPDATA") or home / "AppData" / "Local"
    roaming = env_path("APPDATA") or home / "AppData" / "Roaming"
    programdata = env_path("PROGRAMDATA") or Path("C:/ProgramData")
    deadline = t0 + SCAN_BUDGET_SEC
    admin = is_admin()
    disk = shutil.disk_usage("C:/")
    r = {
        "version": VERSION, "platform": PLATFORM,
        "generatedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        "host": os.environ.get("COMPUTERNAME", "windows"),
        "home": str(home),
        "disk": {"total": disk.total, "used": disk.used, "free": disk.free},
        "access": {"admin": admin, "detail": "管理员" if admin else "普通用户"},
        "installedCount": 0,
        "caches": [], "leftovers": [], "devCaches": [], "cloud": [],
        "bigFiles": [], "trashKb": None,
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
    r["cloud"] = [{"path": c, "kb": size_of(c, min(deadline, time.time() + 20))[0] // 1024} for c in cloud]

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

    # 已卸载 App 数据候选（LOCAL/ROAMING/PROGRAMDATA 顶层目录）
    def candidate_roots():
        yield local, SYSTEM_LOCAL
        yield roaming, SYSTEM_ROAMING
        yield programdata, SYSTEM_PROGRAMDATA

    for root, skip in candidate_roots():
        if not root or not Path(root).is_dir():
            continue
        for d in _child_dirs(root):
            name = d.name
            low = name.lower()
            if low in skip or low.startswith("deepclean"):
                continue
            if any(str(d).startswith(c) for c in cloud):
                continue
            if dir_name_matches_installed(name, tokens):
                continue
            kb, trunc = size_of(d, min(deadline, time.time() + 15))
            r["truncated"] |= trunc
            if kb < args.min_leftover_mb * 1024 * 1024:
                continue
            if not fresh(d):
                continue
            r["leftovers"].append({"name": name, "path": str(d), "kb": kb // 1024,
                                   "why": "未匹配到已安装程序；可能含用户数据"})

    # UWP 包数据（单独列为需确认）
    packages = local / "Packages"
    if packages.is_dir():
        for d in _child_dirs(packages):
            kb, trunc = size_of(d, min(deadline, time.time() + 15))
            r["truncated"] |= trunc
            if kb >= args.min_leftover_mb * 1024 * 1024 and fresh(d):
                r["leftovers"].append({"name": f"UWP: {d.name}", "path": str(d), "kb": kb // 1024,
                                       "why": "商店应用数据；删除会导致该应用重置/丢数据"})

    r["leftovers"].sort(key=lambda x: -x["kb"])
    if not args.quick:
        r["bigFiles"] = [{"path": b["path"], "kb": b["bytes"] // 1024}
                         for b in big_files(home, args.min_mb, cloud)]
    r["devPaths"] = sorted(dev_paths)
    r["elapsed"] = round(time.time() - t0, 1)
    safe_kb = sum(c["kb"] for c in r["caches"] if c["safe"] and not c["system"])
    dev_kb = sum(d["kb"] for d in r["devCaches"])
    r["estimate"] = {"safeKb": safe_kb, "devKb": dev_kb, "totalKb": safe_kb + dev_kb}
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
    a(f"- 系统盘 C: 共 {r['disk']['total']/1e9:.0f}G，已用 {r['disk']['used']/1e9:.0f}G，"
      f"可用 **{r['disk']['free']/1e9:.0f}G**")
    a(f"- 扫描耗时：{r['elapsed']}s" + ("（quick：未扫大文件）" if args.quick else ""))
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
            a(f"| {human(it['kb'])} | `{it['path']}` | {it.get('note', '')} |")
        a("")

    table("一、可安全清理（临时文件/缓存）",
          [{"path": c["path"], "kb": c["kb"], "note": f"{c['label']}；{c['advice']}"}
           for c in r["caches"] if c["safe"] and not c["system"]])
    table("二、需你确认（App 数据 / 可能的卸载残留 / UWP）",
          [{"path": l["path"], "kb": l["kb"], "note": l["why"]} for l in r["leftovers"]])
    table("三、开发缓存（可再生）",
          [{"path": d["path"], "kb": d["kb"], "note": d["advice"]} for d in r["devCaches"]])
    table("四、云盘目录（不要动）",
          [{"path": c["path"], "kb": c["kb"], "note": "云盘同步目录；删除占位文件会删除云端文件"}
           for c in r["cloud"]])
    table(f"五、大文件（> {args.min_mb}M，个人数据自行判断）",
          [{"path": b["path"], "kb": b["kb"], "note": "个人文件，自行判断"} for b in r["bigFiles"]])
    table("六、系统缓存（不建议动，需管理员）",
          [{"path": c["path"], "kb": c["kb"], "note": f"{c['label']}；{c['advice']}"}
           for c in r["caches"] if c["system"]])

    a("## 七、不要动")
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

    safe_kb = sum(c["kb"] for c in r["caches"] if c["safe"] and not c["system"])
    dev_kb = sum(d["kb"] for d in r["devCaches"])
    a("## 八、可回收估算")
    a("")
    a(f"- 可安全清理（缓存/临时）：**{human(safe_kb)}**")
    a(f"- 开发缓存：**{human(dev_kb)}**")
    a(f"- 合计约：**{human(safe_kb + dev_kb)}**（不含需确认项）")
    a("")

    a("## 九、建议命令（PowerShell，只生成，不执行）")
    a("")
    a("```powershell")
    a('# 缓存/临时：移到隔离区，确认后再删除（比直接删安全）')
    a('$q = Join-Path $env:LOCALAPPDATA "deepclean-mydisk\\trash"')
    a('New-Item -ItemType Directory -Force $q | Out-Null')
    emitted = 0
    for c in r["caches"]:
        if not c["safe"] or c["system"] or c["kb"] < 100 * 1024:
            continue
        a(f"Move-Item -LiteralPath '{c['path']}' -Destination $q")
        emitted += 1
    if emitted == 0:
        a("# 本次没有 ≥100M 的可安全清理缓存，无需移动")
    a("```")
    a("")
    a("> 需确认项（App 数据/UWP）不生成命令；删除前请先退出对应程序。")
    md = "\n".join(L)
    if args.redact:
        home = r["home"]
        md = md.replace(home, "%USERPROFILE%").replace(r["host"], "***")
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
             "caches": [], "leftovers": [], "devCaches": [], "cloud": [],
             "bigFiles": [], "truncated": False, "elapsed": 0.1, "scope": "x"}
        ns = argparse.Namespace(redact=False, quick=True, min_mb=300, min_leftover_mb=10)
        md = render(r, ns)
        check("报告含关键小节", "可回收估算" in md and "不要动" in md)
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
