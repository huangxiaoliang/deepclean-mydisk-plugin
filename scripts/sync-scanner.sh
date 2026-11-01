#!/usr/bin/env bash
# 从 deepclean-mydisk skill 仓库同步共享扫描器文件到本插件（独立项目的可选维护动作）。
# 用法: scripts/sync-scanner.sh /path/to/deepclean-mydisk
set -euo pipefail
SRC="${1:?usage: sync-scanner.sh <skill-repo-path>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$SRC/scripts/scan.py" ] || { echo "not a skill repo: $SRC"; exit 1; }
cp "$SRC/scripts/scan.py" "$ROOT/resources/scripts/scan.py"
cp "$SRC/scripts/deepclean.py" "$ROOT/resources/scripts/deepclean.py"
mkdir -p "$ROOT/resources/scripts/platforms"
cp -R "$SRC/scripts/platforms/." "$ROOT/resources/scripts/platforms/"
cp "$SRC/rules.json" "$ROOT/resources/rules.json"
echo "synced scanner from $SRC"
echo "note: photos.py 仅插件独有，不会被覆盖。"
