#!/usr/bin/env python3
"""Read-only desktop installation instances; never follows app/root symlinks."""
import json
import os
import plistlib
import subprocess
from pathlib import Path


def inventory():
    items, errors = [], []
    roots = [Path.home() / 'Applications', Path('/Applications'), Path('/Applications/Utilities'), Path('/System/Applications'), Path('/System/Applications/Utilities')]
    seen = set()
    try:
        processes = subprocess.run(['/bin/ps', '-axo', 'command='], capture_output=True, text=True, timeout=10, check=True).stdout
    except (OSError, subprocess.SubprocessError):
        processes = None
    for root in roots:
        if root.is_symlink():
            errors.append('symlink_root')
            continue
        if not root.exists():
            continue
        try:
            for app in root.iterdir():
                if app.suffix != '.app' or app.is_symlink() or not app.is_dir():
                    continue
                if str(app) in seen:
                    continue
                seen.add(str(app))
                info_path = app / 'Contents' / 'Info.plist'
                if info_path.is_symlink() or (app / 'Contents').is_symlink():
                    errors.append('symlink_metadata')
                    continue
                try:
                    with info_path.open('rb') as f:
                        info = plistlib.load(f)
                    bid = info.get('CFBundleIdentifier', '')
                    protected = str(app).startswith('/System/') or bid.startswith('com.apple.') or any(word in (bid + app.name).lower() for word in ('deepseek', 'deepclean', 'harness'))
                    helpers = any((app / 'Contents' / p).exists() for p in ('Library/LoginItems', 'Library/LaunchServices', 'Library/SystemExtensions'))
                    if protected:
                        blocked = 'protected_system'
                    elif processes is None:
                        # Fail closed, but say why: a failed process snapshot is not "the app is running".
                        blocked = 'process_snapshot_unavailable'
                    elif str(app) + '/' in processes:
                        blocked = 'application_running'
                    elif helpers:
                        blocked = 'vendor_uninstaller_required'
                    else:
                        blocked = ''
                    stat = app.stat()
                    items.append(dict(key=bid or str(app), name=info.get('CFBundleDisplayName') or info.get('CFBundleName') or app.stem,
                                      version=str(info.get('CFBundleShortVersionString', info.get('CFBundleVersion', ''))),
                                      location=str(app), bundleId=bid,
                                      blockReason=blocked, action='move-app' if not blocked else '', identity=[str(stat.st_dev), str(stat.st_ino), str(stat.st_mtime_ns)]))
                except (OSError, ValueError, plistlib.InvalidFileException):
                    errors.append('unreadable_app')
        except OSError:
            errors.append('unreadable_root')
    return dict(items=items, errors=errors)


if __name__ == '__main__':
    print(json.dumps(inventory(), ensure_ascii=True))
