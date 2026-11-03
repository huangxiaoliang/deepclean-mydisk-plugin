#!/usr/bin/env python3
"""deepclean-mydisk 统一入口（v0.5.0）。

- macOS：调用 scripts/scan.py（成熟实现，行为与 v0.3.x 一致）
- Windows：调用 scripts/platforms/windows.py（只读，PowerShell 隔离区方案）

用法：
  python deepclean.py                       # 自动识别平台
  python deepclean.py --quick --redact      # 透传给平台脚本
  python deepclean.py --platform windows --self-test   # 仅限 Windows 宿主；跨平台合成扫描用 scripts/windows-ci/scanner.py
"""
import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

VERSION = "0.5.0"
HERE = Path(__file__).resolve().parent
MACOS = HERE / "scan.py"
WINDOWS = HERE / "platforms" / "windows.py"


def detect_platform():
    if sys.platform.startswith("win"):
        return "windows"
    if sys.platform == "darwin":
        return "macos"
    return "macos"


def target(platform):
    return WINDOWS if platform == "windows" else MACOS


def split_args(argv):
    platform = None
    self_test = False
    rest = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--platform":
            platform = argv[i + 1] if i + 1 < len(argv) else None
            i += 2
        elif a.startswith("--platform="):
            platform = a.split("=", 1)[1]
            i += 1
        elif a == "--self-test":
            self_test = True
            i += 1
        else:
            rest.append(a)
            i += 1
    return platform, self_test, rest


def macos_self_test():
    """在临时 HOME 上跑一次 quick 扫描，验证只读链路与报告结构。"""
    with tempfile.TemporaryDirectory(prefix="deepclean-mac-test-") as td:
        home = Path(td) / "home"
        (home / "Library" / "Containers").mkdir(parents=True)
        (home / "Library" / "Caches").mkdir(parents=True)
        report = Path(td) / "report.md"
        proc = subprocess.run(
            [sys.executable, str(MACOS), "--quick", "--home", str(home), "--md", str(report)],
            capture_output=True, text=True)
        if proc.returncode != 0:
            print("FAIL  macos 扫描退出码", proc.returncode)
            print(proc.stderr[-800:])
            return 1
        text = report.read_text(encoding="utf-8")
        checks = [
            ("报告标题", "磁盘体检报告" in text),
            ("预计可释放", "预计可释放" in text),
            ("不建议清理", "不建议清理" in text),
            ("扫描范围", "扫描范围" in text),
        ]
        ok = True
        for name, cond in checks:
            print(("PASS  " if cond else "FAIL  ") + name)
            ok = ok and cond
        print("\n自检结果：" + ("通过" if ok else "失败"))
        return 0 if ok else 1


def main():
    platform = None
    if len(sys.argv) > 1:
        platform, self_test, rest = split_args(sys.argv[1:])
    else:
        self_test, rest = False, []
    if rest and rest[0] in ("--version", "-V"):
        print(f"deepclean-mydisk {VERSION}")
        return 0
    platform = platform or detect_platform()
    if platform not in ("macos", "windows"):
        print(f"不支持的平台：{platform}", file=sys.stderr)
        return 2
    # Windows 后端依赖注册表、tasklist、%SystemDrive% 等真实 Windows 语义。
    # 非 Windows 宿主上强行透传只会抛 FileNotFoundError（例如 C:/ 不存在）；
    # 跨平台的合成扫描入口是 scripts/windows-ci/scanner.py，不是这里的 --platform。
    if platform == "windows" and not sys.platform.startswith("win"):
        print("Windows 后端只能在 Windows 上运行；跨平台合成扫描请用 scripts/windows-ci/scanner.py",
              file=sys.stderr)
        return 2
    if self_test:
        if platform == "windows":
            return subprocess.call([sys.executable, str(WINDOWS), "--self-test"])
        return macos_self_test()
    cmd = [sys.executable, str(target(platform))] + rest
    return subprocess.call(cmd)


if __name__ == "__main__":
    sys.exit(main())
