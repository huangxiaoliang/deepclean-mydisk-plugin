"""Read-only directory totals from a single walk. Never follow symlinks, junctions or reparse points.

One post-order traversal produces the root listing plus:
- `dirs`: per-directory listings for subtrees >= MIN_DIR_KB (capped at MAX_DIRS by
  size), so the host can seed its tree cache for every level at once and drill-down
  does not re-walk the subtree;
- `bigFiles`: top files per directory from heaps maintained during the same walk,
  so the space page can list large files of any folder without a full-disk scan.

云盘（iCloud Drive / OneDrive / Dropbox / Google Drive）与 App 包目录（照片图库等）
不进入 bigFiles、也不播种下钻缓存：前者搬走会同步删除云端文件，后者移动单个文件
会破坏应用数据。它们仍然计入目录大小，避免空间统计失真。
"""
import heapq
import json
import os
import stat
import sys
import time
from pathlib import Path

MAX_DIRS = 500          # recorded subdirectory listings, largest subtrees first
MIN_DIR_KB = 10 * 1024  # only record subtrees >= 10 MB in `dirs`
ROOT_BIG = 50           # top files reported for the scanned root
DIR_BIG = 20            # top files kept per recorded directory
BIG_FLOOR = 1024 * 1024  # files below 1 MB never enter the big-file heaps
REPARSE = 0x400         # FILE_ATTRIBUTE_REPARSE_POINT (Windows)
CLOUD_ATTRS = 0x400000 | 0x40000 | 0x1000  # RECALL_ON_DATA_ACCESS | RECALL_ON_OPEN | OFFLINE

PACKAGE_SUFFIXES = (
    ".photoslibrary", ".photolibrary", ".sparsebundle", ".fcpbundle", ".logicx",
    ".band", ".imovielibrary", ".tvlibrary", ".aplibrary",
)
CLOUD_DIR_NAMES = ("onedrive", "dropbox", "google drive", "icloud drive")


def cloud_roots():
    """云盘根目录：平台固定位置 + Windows 已知环境变量/目录 + DEEPCLEAN_CLOUD_ROOTS（宿主注入）。"""
    roots = []
    home = Path.home()
    if sys.platform == "darwin":
        roots += [home / "Library" / "CloudStorage", home / "Library" / "Mobile Documents"]
    else:
        for name in ("OneDrive", "OneDriveConsumer", "OneDriveCommercial"):
            value = os.environ.get(name)
            if value:
                roots.append(Path(value))
        try:
            for child in home.iterdir():
                if child.name.lower().startswith(CLOUD_DIR_NAMES):
                    roots.append(child)
        except OSError:
            pass
    extra = os.environ.get("DEEPCLEAN_CLOUD_ROOTS")
    if extra:
        try:
            roots += [Path(p) for p in json.loads(extra) if isinstance(p, str)]
        except (ValueError, TypeError):
            pass
    out = []
    for root in roots:
        try:
            out.append(str(root.resolve()))
        except OSError:
            continue
    return out


def norm_path(path):
    """同时给出 abspath 与 realpath 两种形态：临时目录（/var → /private/var）与
    云盘根可能因符号链接前缀不同而比不中。"""
    raw = os.path.normcase(os.path.abspath(str(path)))
    try:
        real = os.path.normcase(os.path.realpath(str(path)))
    except OSError:
        real = raw
    return {raw, real}


def is_cloud_path(path, roots):
    targets = norm_path(path)
    for root in roots:
        bases = norm_path(root)
        if targets & bases:
            return True
        for target in targets:
            for base in bases:
                if target == base or target.startswith(base + os.sep):
                    return True
    return False


def is_cloud_placeholder(st):
    return bool(getattr(st, "st_file_attributes", 0) & CLOUD_ATTRS)


def is_package_dir(name):
    low = name.lower()
    return any(low.endswith(suffix) for suffix in PACKAGE_SUFFIXES)


def inspect_tree(target):
    logical = os.name == 'nt'
    dirs = {}
    clouds = cloud_roots()
    skipped_cloud = 0

    def push(heap, size_bytes, file_path, mtime):
        if size_bytes < BIG_FLOOR:
            return
        item = (size_bytes, file_path, mtime)
        if len(heap) < ROOT_BIG:
            heapq.heappush(heap, item)
        elif item > heap[0]:
            heapq.heapreplace(heap, item)

    def top(heap, k):
        return [dict(path=p, kb=b / 1024, mtime=m)
                for b, p, m in sorted(heap, reverse=True)[:k]]

    def walk(dir_path, hidden=False):
        """Return (total_bytes, heap, unavailable, skipped, children).

        `hidden` 表示当前子树位于云盘/包目录内：照常统计大小，但不产出 bigFiles、
        不播种下钻缓存（避免被搬家/去重流程选中）。
        """
        nonlocal skipped_cloud
        children = []
        heap = []
        total = 0
        unavailable = 0
        skipped = 0
        try:
            entries = list(os.scandir(dir_path))
        except OSError:
            return 0, heap, 1, 0, None
        for e in entries:
            try:
                st = e.stat(follow_symlinks=False)
            except OSError:
                unavailable += 1
                continue
            if stat.S_ISLNK(st.st_mode) or getattr(st, 'st_file_attributes', 0) & REPARSE:
                skipped += 1
                continue
            if stat.S_ISDIR(st.st_mode):
                if is_cloud_path(e.path, clouds):
                    skipped_cloud += 1
                    # 云盘目录只计大小，不进入大文件清单/下钻缓存。
                    size_b, _sub_heap, sub_un, sub_sk, _sub_children = walk(e.path, True)
                    total += size_b
                    unavailable += sub_un
                    skipped += sub_sk
                    children.append(dict(name=e.name, path=e.path, kb=size_b / 1024,
                                         isDir=True, partial=sub_un > 0))
                    continue
                hidden_child = hidden or is_package_dir(e.name)
                size_b, sub_heap, sub_un, sub_sk, sub_children = walk(e.path, hidden_child)
                if sub_children is None:
                    unavailable += 1
                    children.append(dict(name=e.name, path=e.path, kb=0, isDir=True, partial=True))
                    continue
                total += size_b
                unavailable += sub_un
                skipped += sub_sk
                if not hidden_child:
                    for size_i, path_i, mtime_i in sub_heap:
                        push(heap, size_i, path_i, mtime_i)
                children.append(dict(name=e.name, path=e.path, kb=size_b / 1024,
                                     isDir=True, partial=sub_un > 0))
                if size_b >= MIN_DIR_KB * 1024 and not hidden_child:
                    dirs[e.path] = dict(kb=size_b / 1024,
                                        children=sorted(sub_children, key=lambda c: -c['kb']),
                                        unavailable=sub_un, skipped=sub_sk,
                                        bigFiles=top(sub_heap, DIR_BIG))
            else:
                if is_cloud_placeholder(st):
                    skipped_cloud += 1
                    continue
                size_b = st.st_size if logical else getattr(st, 'st_blocks', 0) * 512
                total += size_b
                if not hidden:
                    push(heap, size_b, e.path, int(st.st_mtime))
                children.append(dict(name=e.name, path=e.path, kb=size_b / 1024,
                                     isDir=False, partial=False))
        return total, heap, unavailable, skipped, children

    _total, heap, unavailable, skipped, children = walk(target)
    if children is None:
        return None
    if len(dirs) > MAX_DIRS:
        keep = sorted(dirs, key=lambda p: -dirs[p]['kb'])[:MAX_DIRS]
        dirs = {p: dirs[p] for p in keep}
    return dict(path=target, children=sorted(children, key=lambda c: -c['kb']),
                at=int(time.time() * 1000), unavailable=unavailable, skipped=skipped,
                skippedCloud=skipped_cloud,
                metric='logical' if logical else 'allocated',
                bigFiles=top(heap, ROOT_BIG), dirs=dirs)


if __name__ == '__main__':
    result = inspect_tree(sys.argv[1])
    if result is None:
        print(f'无法读取目录：{sys.argv[1]}', file=sys.stderr)
        sys.exit(1)
    print(json.dumps(result, ensure_ascii=True))
