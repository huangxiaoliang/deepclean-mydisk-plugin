#!/usr/bin/env python3
"""tree.py 回归：单趟后序遍历的 dirs 全层输出、bigFiles 堆与 partial 传播。

由 tests/scanner.test.mjs 调用，macOS 与 Windows CI 都执行。
"""
import importlib.util
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

# Windows 的管道/控制台默认 cp1252，直接 print 中文会抛 UnicodeEncodeError。
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

SPEC = Path(__file__).resolve().parent.parent / "resources" / "scripts" / "tree.py"
loader = importlib.util.spec_from_file_location("dctree", SPEC)
tree = importlib.util.module_from_spec(loader)
loader.loader.exec_module(tree)

fails = []


def check(name, cond, detail=""):
    print(("PASS  " if cond else "FAIL  ") + name + ("" if cond else f" {detail}"))
    if not cond:
        fails.append(name)


env_keys = ("HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA")
previous_env = {key: os.environ.get(key) for key in env_keys}
MB = 1024 * 1024
tmp = Path(tempfile.mkdtemp(prefix="dc-tree-regress 中文 "))
try:
    root = tmp / "home 用户"
    os.environ.update(HOME=str(root), USERPROFILE=str(root), LOCALAPPDATA=str(root / "AppData" / "Local"), APPDATA=str(root / "AppData" / "Roaming"))
    a = root / "a 相册"
    deep = a / "deep"
    b = root / "b 小目录"
    for d in (a, deep, b):
        d.mkdir(parents=True)
    (a / "f1.bin").write_bytes(b"x" * 8 * MB)
    (a / "f2.bin").write_bytes(b"x" * 6 * MB)
    (deep / "big.bin").write_bytes(b"x" * 12 * MB)  # deep 共 12MB ≥ 10MB → 进 dirs
    (b / "small.txt").write_bytes(b"x" * 20 * 1024)  # b 仅 20KB → 不进 dirs
    (root / ".hidden").write_bytes(b"x" * 8192)
    is_win = os.name == "nt"
    if not is_win:
        os.symlink(tempfile.gettempdir(), root / "linked")

    r = tree.inspect_tree(str(root))

    names = {c["name"] for c in r["children"]}
    check("根 children 包含目录与隐藏文件", {"a 相册", "b 小目录", ".hidden"} <= names, repr(names))
    if not is_win:
        check("符号链接不进 children", "linked" not in names, repr(names))
        check("符号链接计入 skipped", r["skipped"] >= 1, repr(r["skipped"]))

    kb = {c["name"]: c["kb"] for c in r["children"]}
    # macOS 按 st_blocks、Windows 按 st_size；写满的文件两种口径都精确。
    check("目录大小自洽", abs(kb["a 相册"] - 26 * 1024) < 64, repr(kb.get("a 相册")))
    check("小目录大小自洽", abs(kb["b 小目录"] - 20) < 4, repr(kb.get("b 小目录")))

    dirs = r["dirs"]
    check("dirs 收录 ≥10MB 的子树", str(a) in dirs and str(deep) in dirs, repr(list(dirs)))
    check("dirs 跳过 <10MB 的子树", str(b) not in dirs, repr(list(dirs)))
    check("dirs 键为绝对路径", all(os.path.isabs(p) for p in dirs))

    da = dirs[str(a)]
    check("dirs 条目带 children 且按大小降序",
          [c["name"] for c in da["children"]] == ["deep", "f1.bin", "f2.bin"],
          repr([c["name"] for c in da["children"]]))
    check("dirs 条目 bigFiles 合并子目录堆",
          [os.path.basename(f["path"]) for f in da["bigFiles"]] == ["big.bin", "f1.bin", "f2.bin"],
          repr(da["bigFiles"]))
    dd = dirs[str(deep)]
    check("深层目录 bigFiles 只含自身",
          [os.path.basename(f["path"]) for f in dd["bigFiles"]] == ["big.bin"], repr(dd["bigFiles"]))

    big = r["bigFiles"]
    check("根 bigFiles 按大小降序",
          [os.path.basename(f["path"]) for f in big] == ["big.bin", "f1.bin", "f2.bin"], repr(big))
    check("bigFiles 带 mtime 与 kb", all(f["mtime"] > 0 and f["kb"] > 0 for f in big), repr(big))
    check("bigFiles 过滤 <1MB 的文件", all(f["kb"] >= 1024 for f in big), repr(big))

    check("metric 口径正确", r["metric"] == ("logical" if is_win else "allocated"), r["metric"])

    # 不可读目录 → partial 传播（root 运行或 Windows 上 chmod 不可靠，跳过）
    if not is_win and hasattr(os, "geteuid") and os.geteuid() != 0:
        locked = root / "locked"
        locked.mkdir()
        (locked / "x.bin").write_bytes(b"x" * 1024)
        locked.chmod(0)
        try:
            r2 = tree.inspect_tree(str(root))
            entry = next(c for c in r2["children"] if c["name"] == "locked")
            check("不可读目录标记 partial", entry["partial"] is True and entry["kb"] == 0, repr(entry))
            check("不可读计入 unavailable", r2["unavailable"] >= 1, repr(r2["unavailable"]))
        finally:
            locked.chmod(0o755)

    # 云盘与 App 包目录：不进入 bigFiles / 下钻缓存，但仍计入目录大小
    cloud = root / "OneDrive"
    (cloud / "sub").mkdir(parents=True)
    (cloud / "sub" / "cloud.bin").write_bytes(b"x" * 5 * 1024 * 1024)
    pkg = root / "Pictures" / "Photos Library.photoslibrary"
    pkg.mkdir(parents=True)
    (pkg / "originals.bin").write_bytes(b"x" * 5 * 1024 * 1024)
    os.environ["DEEPCLEAN_CLOUD_ROOTS"] = json.dumps([str(cloud)])
    try:
        rc = tree.inspect_tree(str(root))
    finally:
        os.environ.pop("DEEPCLEAN_CLOUD_ROOTS", None)
    all_paths = [f["path"] for f in rc["bigFiles"]]
    for d in rc["dirs"].values():
        all_paths += [f["path"] for f in d["bigFiles"]]
    check("云盘文件不进入 bigFiles", all("OneDrive" not in p for p in all_paths), repr(all_paths[:3]))
    check("包目录内文件不进入 bigFiles", all(".photoslibrary" not in p for p in all_paths), repr(all_paths[:3]))
    check("云盘目录计入 skippedCloud", rc.get("skippedCloud", 0) >= 1, repr(rc.get("skippedCloud")))
    check("包目录子项不播种下钻缓存", all(".photoslibrary" not in p for p in rc["dirs"]), repr(list(rc["dirs"])[:3]))
    check("云盘/包目录仍计入大小",
          any(c["name"] == "OneDrive" and c["kb"] > 0 for c in rc["children"])
          and any(c["name"] == "Pictures" and c["kb"] > 0 for c in rc["children"]),
          repr(rc["children"]))

    # ── 硬链接只计一次 + 标注 ──────────────────────────────────────────
    hl = tmp / "extra" / "hl"
    hl.mkdir(parents=True)
    src = hl / "src.bin"
    src.write_bytes(b"x" * (2 * MB))
    os.link(src, hl / "link.bin")
    rh = tree.inspect_tree(str(hl))
    total_kb = sum(c["kb"] for c in rh["children"])
    check("硬链接只计一次大小", abs(total_kb - 2 * 1024) < 2, repr(total_kb))
    check("硬链接只进一条 bigFiles",
          len(rh["bigFiles"]) == 1 and rh["bigFiles"][0]["shared"] is True, repr(rh["bigFiles"]))
    check("重复硬链接标记 dedup", any(c.get("dedup") for c in rh["children"]), repr(rh["children"]))
    check("硬链接计数与重复大小",
          rh["sharedFiles"] == 2 and abs(rh["sharedDupKb"] - 2 * 1024) < 2,
          repr((rh["sharedFiles"], rh["sharedDupKb"])))

    # ── bigFiles 上限写进响应，客户端才能说清「最多 N 个」 ────────────
    check("根 bigFiles 上限", rc.get("bigFilesCap") == tree.ROOT_BIG, repr(rc.get("bigFilesCap")))
    check("子目录 bigFiles 上限", dirs[str(a)].get("bigFilesCap") == tree.DIR_BIG,
          repr(dirs[str(a)].get("bigFilesCap")))

    # ── 云盘根只计一次（OneDrive/sub 两层只算 1 个云盘目录）────────────
    check("云盘根只计一次", rc.get("skippedCloud") == 1, repr(rc.get("skippedCloud")))
    check("云盘占位文件单独计数", rc.get("cloudFiles") == 0, repr(rc.get("cloudFiles")))

    # ── 遍历不再逐条 realpath（性能回归）──────────────────────────────
    perf = tmp / "extra" / "perf"
    for i in range(60):
        d = perf / f"d{i:02d}"
        d.mkdir(parents=True)
        (d / "x").write_bytes(b"x")
    calls = []
    original_realpath = os.path.realpath

    def counting_realpath(p, *args, **kwargs):
        calls.append(p)
        return original_realpath(p, *args, **kwargs)

    os.path.realpath = counting_realpath
    try:
        tree.inspect_tree(str(perf))
    finally:
        os.path.realpath = original_realpath
    check("遍历 60 个目录的 realpath 次数受控", len(calls) < 40, repr(len(calls)))

    # ── >260 字符路径（Windows）───────────────────────────────────────
    if is_win:
        long_root = tmp / "extra" / "long"
        deep_path = long_root
        while len(str(deep_path)) < 280:
            deep_path = deep_path / ("d" * 40)
        os.makedirs("\\\\?\\" + str(deep_path))
        with open("\\\\?\\" + str(deep_path / "f.bin"), "wb") as f:
            f.write(b"x" * (2 * MB))
        rl = tree.inspect_tree(str(long_root))
        long_child = rl["children"][0] if rl and rl["children"] else {}
        check(">260 字符路径仍统计大小",
              long_child.get("kb", 0) > 0 and rl["unavailable"] == 0,
              repr((long_child, rl["unavailable"] if rl else None)))
        shutil.rmtree("\\\\?\\" + str(long_root), ignore_errors=True)

    # ── 云占位判断在 reparse 之前（junction 模拟云占位）────────────────
    if is_win:
        import subprocess
        jt = tmp / "extra" / "jt"
        jt.mkdir(parents=True)
        (jt / "x.bin").write_bytes(b"x")
        jl = tmp / "extra" / "jlink"
        subprocess.run(["cmd", "/c", "mklink", "/J", str(jl), str(jt)], check=True, capture_output=True)
        original_placeholder = tree.is_cloud_placeholder
        tree.is_cloud_placeholder = lambda st: bool(getattr(st, "st_file_attributes", 0) & tree.REPARSE)
        try:
            rj = tree.inspect_tree(str(jt.parent))
        finally:
            tree.is_cloud_placeholder = original_placeholder
        link_entry = next((c for c in (rj["children"] if rj else []) if c["name"] == "jlink"), {})
        check("云占位目录不被算作链接",
              link_entry.get("cloud") is True and rj["skipped"] == 0,
              repr((link_entry, rj["skipped"] if rj else None)))
        subprocess.run(["cmd", "/c", "rmdir", str(jl)], check=True, capture_output=True)

    check("根目录不可读返回 None", tree.inspect_tree(str(tmp / "不存在")) is None)
finally:
    for key, value in previous_env.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value
    shutil.rmtree(tmp, ignore_errors=True)

print()
if fails:
    print(f"{len(fails)} 项失败")
    sys.exit(1)
print("全部通过")
