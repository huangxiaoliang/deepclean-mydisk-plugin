"""Read-only directory totals. Never follow symlinks, junctions or reparse points."""
import json
import os
import stat
import sys
import time


def inspect_tree(target):
    skipped = 0
    unavailable = 0

    def size(p):
        nonlocal skipped, unavailable
        try:
            st = os.lstat(p)
            if stat.S_ISLNK(st.st_mode) or getattr(st, 'st_file_attributes', 0) & 0x400:
                skipped += 1
                return 0
            if stat.S_ISDIR(st.st_mode):
                with os.scandir(p) as entries:
                    return sum(size(e.path) for e in entries)
            return st.st_size if os.name == 'nt' else getattr(st, 'st_blocks', 0) * 512
        except OSError:
            unavailable += 1
            return 0

    children = []
    with os.scandir(target) as entries:
        for e in entries:
            before = unavailable
            kb = size(e.path) / 1024
            try:
                st = e.stat(follow_symlinks=False)
                if stat.S_ISLNK(st.st_mode) or getattr(st, 'st_file_attributes', 0) & 0x400:
                    continue
                children.append(dict(name=e.name, path=e.path, kb=kb,
                                     isDir=stat.S_ISDIR(st.st_mode), partial=unavailable > before))
            except OSError:
                unavailable += 1
    return dict(path=target, children=sorted(children, key=lambda c: -c['kb']),
                at=int(time.time() * 1000), unavailable=unavailable, skipped=skipped,
                metric='logical' if os.name == 'nt' else 'allocated')


if __name__ == '__main__':
    print(json.dumps(inspect_tree(sys.argv[1]), ensure_ascii=True))
