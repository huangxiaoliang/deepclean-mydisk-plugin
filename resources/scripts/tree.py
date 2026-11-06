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

口径说明：
- 同一个 inode 的硬链接只计一次大小、只进一条 bigFiles；重复名字以 kb=0/dedup=True
  列出，避免一个 10MB 文件被 500 个链接放大成 5GB。
- 云占位文件（OneDrive 按需下载）带 REPARSE 标记，必须先按云占位归类，不能算成
  「链接」。
- Windows 上 >260 字符的路径用 `\\\\?\\` 前缀访问，输出仍是常规路径。
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
WIN_LONG_THRESHOLD = 248  # leave headroom below MAX_PATH for child names

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
    云盘根可能因符号链接前缀不同而比不中。仅用于单个路径；遍历内部走 _Matcher。"""
    raw = os.path.normcase(os.path.abspath(str(path)))
    try:
        real = os.path.normcase(os.path.realpath(str(path)))
    except OSError:
        real = raw
    return {raw, real}


def _raw(path):
    return os.path.normcase(os.path.abspath(str(path)))


def _form(path):
    raw = _raw(path)
    try:
        real = os.path.normcase(os.path.realpath(str(path)))
    except OSError:
        real = raw
    return raw, real


def _under(path, base):
    if path == base:
        return True
    prefix = base if base.endswith(os.sep) else base + os.sep
    return path.startswith(prefix)


class _Matcher:
    """预归一化的根目录集合：遍历时每个条目只做字符串比较，不再逐条 realpath。

    根目录的 raw/real 形态各算一次，命中判断同时比较两种形态，保留
    「/var → /private/var」这类符号链接前缀的旧语义。
    """

    def __init__(self, roots):
        self.roots = [_form(root) for root in roots]

    def hit(self, raw, real):
        for base_raw, base_real in self.roots:
            if _under(raw, base_raw) or _under(real, base_real):
                return True
        return False


def is_cloud_path(path, roots):
    return _Matcher(roots).hit(*_form(path))


def is_cloud_placeholder(st):
    return bool(getattr(st, "st_file_attributes", 0) & CLOUD_ATTRS)


def is_package_dir(name):
    low = name.lower()
    return any(low.endswith(suffix) for suffix in PACKAGE_SUFFIXES)


def app_data_roots():
    home = Path(os.environ.get("HOME") or Path.home())
    return [home / "AppData"] + [Path(os.environ[k]) for k in ("LOCALAPPDATA", "APPDATA") if os.environ.get(k)]


def is_app_data_path(path, matcher=None, raw=None, real=None):
    raw = raw or _raw(path)
    parts = [p.lower() for p in raw.split(os.sep) if p]
    pairs = set(zip(parts, parts[1:]))
    if pairs & {("library", "application support"), ("library", "containers"),
                ("library", "group containers"), ("library", "mail"), ("library", "messages")}:
        return True
    if "windowsapps" in parts:
        return True
    if real is None:
        real = _form(path)[1]
    return (matcher or _Matcher(app_data_roots())).hit(raw, real)


def win_long(path):
    """Windows 上 >260 的路径需要 \\\\?\\ 前缀；只用于访问，输出仍是常规路径。"""
    if os.name != "nt":
        return str(path)
    absolute = os.path.abspath(str(path))
    if absolute.startswith("\\\\?\\"):
        return absolute
    return absolute if len(absolute) < WIN_LONG_THRESHOLD else "\\\\?\\" + absolute


def inspect_tree(target):
    logical = os.name == 'nt'
    dirs = {}
    clouds = cloud_roots()
    cloud_matcher = _Matcher(clouds)
    app_matcher = _Matcher(app_data_roots())
    target_raw = _raw(target)
    try:
        target_real = os.path.normcase(os.path.realpath(str(target)))
    except OSError:
        target_real = target_raw
    seen_inodes = set()

    def forms(path):
        """遍历内路径的 (raw, real)：目标之外才 realpath；目标内用前缀映射，避免逐条系统调用。"""
        raw = _raw(path)
        if _under(raw, target_raw):
            suffix = raw[len(target_raw):]
            return raw, target_real + suffix
        return _form(path)

    def push(heap, size_bytes, file_path, mtime, shared=False):
        if size_bytes < BIG_FLOOR:
            return
        item = (size_bytes, file_path, mtime, shared)
        if len(heap) < ROOT_BIG:
            heapq.heappush(heap, item)
        elif item > heap[0]:
            heapq.heapreplace(heap, item)

    def top(heap, k):
        return [dict(path=p, kb=b / 1024, mtime=m, shared=s)
                for b, p, m, s in sorted(heap, reverse=True)[:k]]

    def walk(dir_path, hidden=False, in_cloud=False):
        """Return a dict with total/heap/unavailable/skipped/cloud/cloud_files/shared/children.

        `hidden` 表示当前子树位于云盘/包目录/App 数据内：照常统计大小，但不产出 bigFiles、
        不播种下钻缓存（避免被搬家/去重流程选中）。
        """
        children = []
        heap = []
        total = 0
        unavailable = 0
        skipped = 0
        cloud = 0
        cloud_files = 0
        shared = 0
        shared_dup = 0
        try:
            entries = list(os.scandir(win_long(dir_path)))
        except OSError:
            return dict(total=0, heap=heap, unavailable=1, skipped=0, cloud=0,
                        cloud_files=0, shared=0, shared_dup=0, children=None)
        for e in entries:
            child = os.path.join(dir_path, e.name)
            try:
                st = e.stat(follow_symlinks=False)
            except OSError:
                unavailable += 1
                continue
            reparse = bool(getattr(st, 'st_file_attributes', 0) & REPARSE)
            if stat.S_ISLNK(st.st_mode):
                skipped += 1
                continue
            if stat.S_ISDIR(st.st_mode):
                raw, real = forms(child)
                if cloud_matcher.hit(raw, real):
                    # 云盘根/子目录：只计大小，不进入大文件清单、不播种下钻缓存。
                    if not in_cloud:
                        cloud += 1
                    sub = walk(child, True, True)
                    total += sub['total']
                    unavailable += sub['unavailable']
                    skipped += sub['skipped']
                    cloud_files += sub['cloud_files']
                    shared += sub['shared']
                    shared_dup += sub['shared_dup']
                    children.append(dict(name=e.name, path=child, kb=sub['total'] / 1024,
                                         isDir=True, partial=sub['unavailable'] > 0, cloud=True))
                    continue
                if reparse:
                    # 云占位目录先归类为云盘，不能当成普通链接；不遍历（可能是 reparse 环）。
                    if is_cloud_placeholder(st):
                        if not in_cloud:
                            cloud += 1
                        children.append(dict(name=e.name, path=child, kb=0, isDir=True,
                                             partial=True, cloud=True))
                    else:
                        skipped += 1
                    continue
                hidden_child = (hidden or is_package_dir(e.name)
                                or is_app_data_path(child, app_matcher, raw, real))
                sub = walk(child, hidden_child, False)
                if sub['children'] is None:
                    unavailable += 1
                    children.append(dict(name=e.name, path=child, kb=0, isDir=True, partial=True))
                    continue
                total += sub['total']
                unavailable += sub['unavailable']
                skipped += sub['skipped']
                cloud += sub['cloud']
                cloud_files += sub['cloud_files']
                shared += sub['shared']
                shared_dup += sub['shared_dup']
                if not hidden_child:
                    for item in sub['heap']:
                        push(heap, *item)
                children.append(dict(name=e.name, path=child, kb=sub['total'] / 1024,
                                     isDir=True, partial=sub['unavailable'] > 0))
                if sub['total'] >= MIN_DIR_KB * 1024 and not hidden_child:
                    dirs[child] = dict(
                        kb=sub['total'] / 1024,
                        children=sorted(sub['children'], key=lambda c: -c['kb']),
                        unavailable=sub['unavailable'], skipped=sub['skipped'],
                        skippedCloud=sub['cloud'], cloudFiles=sub['cloud_files'],
                        sharedFiles=sub['shared'], sharedDupKb=sub['shared_dup'] / 1024,
                        bigFilesCap=DIR_BIG,
                        bigFiles=top(sub['heap'], DIR_BIG))
                continue
            # file
            if is_cloud_placeholder(st):
                cloud_files += 1
                continue
            size_b = st.st_size if logical else getattr(st, 'st_blocks', 0) * 512
            nlink = getattr(st, 'st_nlink', 1)
            ino = getattr(st, 'st_ino', 0)
            dev = getattr(st, 'st_dev', 0)
            # Windows 的 DirEntry.stat() 不填 nlink/ino（都是 0）；只对可能进 bigFiles
            # 的大文件补一次完整 stat，避免在每个文件上多一次系统调用。
            if (not nlink or not ino) and size_b >= BIG_FLOOR:
                try:
                    full = os.stat(child)
                    nlink, ino, dev = full.st_nlink, full.st_ino, full.st_dev
                except OSError:
                    nlink, ino = 1, 0
            key = (dev, ino) if nlink > 1 and ino else None
            is_shared = key is not None
            if is_shared:
                shared += 1
                if key in seen_inodes:
                    shared_dup += size_b
                    children.append(dict(name=e.name, path=child, kb=0.0, isDir=False,
                                         partial=False, shared=True, dedup=True))
                    continue
                seen_inodes.add(key)
            total += size_b
            if not hidden:
                push(heap, size_b, child, int(st.st_mtime), is_shared)
            children.append(dict(name=e.name, path=child, kb=size_b / 1024,
                                 isDir=False, partial=False, shared=is_shared))
        return dict(total=total, heap=heap, unavailable=unavailable, skipped=skipped,
                    cloud=cloud, cloud_files=cloud_files, shared=shared,
                    shared_dup=shared_dup, children=children)

    root_cloud = cloud_matcher.hit(*forms(target))
    root_hidden = (is_app_data_path(target, app_matcher)
                   or any(is_package_dir(p) for p in Path(target).parts)
                   or root_cloud)
    root = walk(target, root_hidden, root_cloud)
    if root['children'] is None:
        return None
    if len(dirs) > MAX_DIRS:
        keep = sorted(dirs, key=lambda p: -dirs[p]['kb'])[:MAX_DIRS]
        dirs = {p: dirs[p] for p in keep}
    return dict(path=target, children=sorted(root['children'], key=lambda c: -c['kb']),
                at=int(time.time() * 1000), unavailable=root['unavailable'],
                skipped=root['skipped'], skippedCloud=root['cloud'],
                cloudFiles=root['cloud_files'], sharedFiles=root['shared'],
                sharedDupKb=root['shared_dup'] / 1024, bigFilesCap=ROOT_BIG,
                metric='logical' if logical else 'allocated',
                bigFiles=top(root['heap'], ROOT_BIG), dirs=dirs)


if __name__ == '__main__':
    result = inspect_tree(sys.argv[1])
    if result is None:
        print(f'无法读取目录：{sys.argv[1]}', file=sys.stderr)
        sys.exit(1)
    print(json.dumps(result, ensure_ascii=True))
