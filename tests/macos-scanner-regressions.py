#!/usr/bin/env python3
"""macOS 扫描器回归：big_files 流式 top-N 堆（不再 head 截断）、prune、预算截断。

依赖 POSIX find，Windows CI 上自动跳过。
由 tests/scanner.test.mjs 调用。
"""
import argparse
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

    # estimate 口径：被 UI 隐藏的父级缓存不计入 cacheKb；safe 阈值仍用 min_leftover_mb
    base = "/Users/x"
    est_report = {
        "caches": [
            {"path": base + "/Library/Caches/Google", "kb": 5000},  # 被 browsers 子路径覆盖
            {"path": base + "/Library/Caches/Other", "kb": 3000},  # 被 appCaches 子路径包住
            {"path": base + "/Library/Caches/Keep", "kb": 2000},  # 与任何具体条目都不重叠
            {"path": base + "/Library/Caches/CloudKit", "kb": 900, "system": True},
            {"path": base + "/Library/Caches/WithDev", "kb": 1200},  # 与 devCaches 重叠
        ],
        "devCaches": [
            {"path": base + "/Library/Caches/WithDev", "kb": 1000},
            # cleanable=False（Xcode Archives / CoreSimulator / Docker vms）：清理允许集合
            # 与面板都会排除，估算必须同口径，否则「预计可释放」大于可勾选合计。
            {"path": base + "/Library/Developer/Xcode/Archives", "kb": 9000, "cleanable": False},
        ],
        "browsers": [{"name": "Chrome", "path": base + "/Library/Caches/Google/Chrome",
                      "kb": 4000, "running": False}],
        "appCaches": [{"baseId": "com.foo", "app": "Foo", "kb": 1500, "running": False,
                       "cleanable": True, "paths": [base + "/Library/Caches/Other/sub"]}],
        "special": [{"app": "微信", "categories": [
            {"name": "缓存", "kb": 100, "cleanable": True,
             "paths": [base + "/Library/Containers/com.tencent.xinWeChat/Data/cache"]}]}],
        "leftoverGroups": [
            {"baseId": "a", "kb": 20000, "bucket": "safe",
             "paths": [base + "/Library/Containers/com.a/Data/Library/Caches"]},
            {"baseId": "b", "kb": 500, "bucket": "safe",
             "paths": [base + "/Library/Containers/com.b/Data/Library/Caches"]},
            {"baseId": "c", "kb": 7000, "bucket": "confirm",
             "paths": [base + "/Library/Containers/com.c/Data"]},
        ],
    }
    est = mac.estimate_of(est_report, 10)
    check("estimate 排除被具体条目覆盖/包住的父级缓存", est["cacheKb"] == 2000, repr(est))
    check("estimate 排除与 devCaches 重复的缓存行（UI 已隐藏）",
          est["overlapKb"] == 0 and est["devKb"] == 1000, repr(est))
    check("estimate safeKb 仍按 min_leftover_mb 阈值", est["safeKb"] == 20000, repr(est))
    check("estimate 补 confirmKb", est.get("confirmKb") == 7000, repr(est))
    check("estimate 计入可清理的浏览器缓存", est.get("browserKb") == 4000, repr(est))
    check("estimate 计入可清理的应用缓存", est.get("appCacheKb") == 1500, repr(est))
    check("estimate 计入可清理的聊天缓存", est.get("specialKb") == 100, repr(est))
    check("estimate totalKb 不含 confirmKb 且覆盖可清理缓存",
          est["totalKb"] == 20000 + 2000 + 1000 + 4000 + 1500 + 100, repr(est))
    check("estimate devKb 排除 cleanable=False 的开发缓存", est["devKb"] == 1000, repr(est))
    check("estimate totalKb == 六项和",
          est["totalKb"] == est["safeKb"] + est["cacheKb"] + est["devKb"]
          + est["browserKb"] + est["appCacheKb"] + est["specialKb"], repr(est))

    # 完整 quick 扫描（临时 HOME、只读）：报告必须带 minLeftoverKb / processSnapshot
    scan_home = tmp / "scan-home"
    (scan_home / "Library" / "Containers").mkdir(parents=True)
    (scan_home / "Library" / "Caches").mkdir(parents=True)
    ns_scan = argparse.Namespace(home=str(scan_home), quick=True, min_mb=300,
                                 min_leftover_mb=10, top=15, redact=False,
                                 no_cloud=False, home_total=False)
    full = mac.scan(ns_scan)
    check("报告带 minLeftoverKb", full.get("minLeftoverKb") == 10 * 1024, repr(full.get("minLeftoverKb")))
    check("报告带 processSnapshot", full.get("processSnapshot") in ("ok", "unavailable"),
          repr(full.get("processSnapshot")))
    check("报告 estimate 带 confirmKb", isinstance(full.get("estimate", {}).get("confirmKb"), int),
          repr(full.get("estimate")))

    # §九「合计约」必须等于 estimate.totalKb（修复前按 safe+cache+dev 求和，会少报
    # 浏览器 / 应用缓存 / 聊天缓存）；缺失 totalKb 时回退六项和。
    est_render = {**full["estimate"], "safeKb": 20000, "cacheKb": 2000, "devKb": 1000,
                  "browserKb": 4000, "appCacheKb": 1500, "specialKb": 1360000,
                  "overlapKb": 500,
                  "totalKb": 20000 + 2000 + 1000 + 4000 + 1500 + 1360000}
    md_render = mac.render_md({**full, "estimate": est_render, "trashKb": 700}, ns_scan)
    sec9 = md_render.split("## 九、预计可释放")[1].split("## 十、")[0]
    total_line = next((ln for ln in sec9.splitlines() if ln.startswith("- 合计约：")), "")
    check("Markdown §九 合计 == estimate.totalKb",
          total_line == f"- 合计约：**{mac.human(est_render['totalKb'])}**（不含需确认项与废纸篓）",
          f"{total_line!r} expect {mac.human(est_render['totalKb'])}"
          f" (旧口径 {mac.human(23000)})")
    check("Markdown §九 显示浏览器/应用/聊天缓存分项",
          "- 浏览器缓存：" in sec9 and "- 应用缓存：" in sec9 and "- 聊天缓存：" in sec9, sec9)
    check("Markdown §九 保留 overlap 与废纸篓行",
          "已避免重复计算" in sec9 and "废纸篓" in sec9, sec9)
    fallback_est = {k: v for k, v in est_render.items() if k != "totalKb"}
    md_fb = mac.render_md({**full, "estimate": fallback_est}, ns_scan)
    sec9_fb = md_fb.split("## 九、预计可释放")[1].split("## 十、")[0]
    total_fb = next((ln for ln in sec9_fb.splitlines() if ln.startswith("- 合计约：")), "")
    check("Markdown §九 缺 totalKb 时回退六项和",
          mac.human(est_render["totalKb"]) in total_fb, f"{total_fb!r}")

    # 浏览器缓存：运行中的浏览器标 running（宿主会把它挡在清理允许集合外）
    bhome = tmp / "bhome"
    chrome = bhome / "Library" / "Caches" / "Google" / "Chrome"
    chrome.mkdir(parents=True)
    (chrome / "f.bin").write_bytes(b"x" * 2048)
    running = mac.browser_caches(bhome, "501 /applications/google chrome.app/contents/macos/google chrome")
    idle = mac.browser_caches(bhome, "1 /sbin/launchd")
    lost = mac.browser_caches(bhome, "")
    check("运行中的浏览器标记 running", bool(running) and running[0]["running"] is True, repr(running))
    check("快照可用且未命中时不标 running", bool(idle) and idle[0]["running"] is False, repr(idle))
    check("快照不可用时浏览器标 running（fail-closed）", bool(lost) and lost[0]["running"] is True, repr(lost))

    # 进程快照 fail-closed：快照获取失败（空串）不能当成「全部未运行」
    check("空快照判定不可用", mac.snapshot_available("") is False)
    check("非空快照判定可用", mac.snapshot_available("1 /sbin/launchd") is True)
    check("快照不可用时 App 缓存视为运行中",
          mac.app_cache_running("微信", "com.tencent.xinwechat", "") is True)
    check("快照可用且未命中时 App 缓存不算运行中",
          mac.app_cache_running("示例", "com.example.app", "1 /sbin/launchd") is False)
    check("快照可用且命中 bundleId 时 App 缓存运行中",
          mac.app_cache_running("示例", "com.example.app",
                                "42 /applications/example.app/contents/macos/example com.example.app") is True)
    split_container = {"baseId": "com.example.app", "bundleId": "com.example.app"}
    check("快照不可用时残留不拆缓存子目录", mac.leftover_split_enabled(split_container, "") is False)
    check("快照可用且未命中时可拆残留缓存",
          mac.leftover_split_enabled(split_container, "1 /sbin/launchd") is True)
    check("快照可用且残留进程运行时不可拆",
          mac.leftover_split_enabled(split_container, "42 com.example.app") is False)
    # 不可信目录名（微信收到的文件夹名）不得进入 shell：special_clean 必须走 argv。
    evil_home = tmp / "evil home"
    payload = (evil_home / "Library" / "Containers" / "com.tencent.xinWeChat" / "Data"
               / "Documents" / "msg" / "x$(touch PWNED)" / "image")
    payload.mkdir(parents=True)
    (payload / "blob.bin").write_bytes(b"x" * (2 * 1024 * 1024))
    marker = tmp / "PWNED"
    old_cwd = os.getcwd()
    os.chdir(tmp)
    try:
        rows = mac.special_clean(evil_home)
    finally:
        os.chdir(old_cwd)
    check("special_clean 不执行目录名里的命令替换", not marker.exists(), str(marker))
    check("special_clean 对特殊字符路径仍正常返回", isinstance(rows, list), repr(rows))
    # du 失败返回 None 时必须跳过，不能 `None < 1024` 让整次体检崩溃。
    original_du_one = mac.du_one
    mac.du_one = lambda path, timeout=60: None
    try:
        rows_none = mac.special_clean(evil_home)
    finally:
        mac.du_one = original_du_one
    check("du 失败时跳过 None 条目而不是崩溃", rows_none == [], repr(rows_none))

finally:
    shutil.rmtree(tmp, ignore_errors=True)

print()
if fails:
    print(f"{len(fails)} 项失败")
    sys.exit(1)
print("全部通过")
