# DeepClean MyDisk

[![tests](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/actions/workflows/tests.yml)
[![Windows acceptance](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/actions/workflows/windows-acceptance.yml/badge.svg?branch=main)](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/actions/workflows/windows-acceptance.yml)
[![npm](https://img.shields.io/npm/v/deepclean-mydisk.svg)](https://www.npmjs.com/package/deepclean-mydisk)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/LICENSE)
[![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey.svg)](https://github.com/huangxiaoliang/deepclean-mydisk-plugin#install)

English | [简体中文](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/docs/plugin/DETAIL.zh.md)

A DSH plugin with a native sidebar for macOS and Windows. **Scans are read-only and cleanup only moves files** — into the Trash (macOS) or a quarantine folder (Windows), with undo; permanent deletion requires a second confirmation and only applies to batches this plugin moved. It provides live capacity, space visualization, similar photos, cross-disk moves, software uninstall, a restore center, and read-only AI explanations of checkups, items, pre-cleanup reviews, and failures.

- Repository: [huangxiaoliang/deepclean-mydisk-plugin](https://github.com/huangxiaoliang/deepclean-mydisk-plugin)
- Install: `dsh plugin --profile <name> add deepclean-mydisk` (npm); it can also be installed from GitHub or a local directory
- Feedback: [GitHub Issues](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/issues/new/choose) · report security issues privately per [SECURITY.md](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/SECURITY.md)
- Changelog: [CHANGELOG.md](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/CHANGELOG.md)

![Checkup home screen](shot-home.jpg)

## Install

### DSH install

```bash
# From npm (recommended; prebuilt, no build step)
dsh plugin --profile <name> add deepclean-mydisk

# Or from GitHub
dsh plugin --profile <name> add github:huangxiaoliang/deepclean-mydisk-plugin

# Or from a local development directory (changes are mapped immediately)
dsh plugin --profile <name> add link:/absolute/path/deepclean-mydisk-plugin
```

Restart DSH after installing or changing host / client code.

### Platform requirements

- macOS: the built-in `python3` (the scanner uses `du`, `plutil`, and `sips`);
- Windows: Python 3.9 or later. The plugin tries `py -3`, `python`, and `python3` in order; one working launcher is enough. Photo decoding uses PowerShell `.NET` and does **not** need Pillow.
- If no usable Python is found, click **Let DSH install Python** to send the setup request to the current conversation. Restart DSH after setup, then retry the scan.
- macOS and Windows are supported; the Linux branch exists but is **unverified**.

### Permissions

- macOS needs Full Disk Access to read all protected paths; **Settings → Permission check** shows the current state. A disk checkup needs the permission first.
- Windows has no Full Disk Access concept; the panel only reports whether it runs as administrator or a regular user. Cleaning some system directories needs administrator rights.

## Interface

- **Checkup (home)**: live capacity, start scan / view cleanup suggestions, AI explanation, scan options, checkup wizard, last cleanup;
- **Clean**: junk cleanup (all items plus 7 content categories, risk tiers, search and sorting, per-item "Ask AI" and a pre-cleanup review) and similar photos;
- **Space**: directory breakdown (tide-band chart, breadcrumbs, drill-down) and large files (filters, move, "What is this");
- **Software**: desktop apps and terminal tools (actionable items sorted by name, blocked items grouped by reason), uninstall preview, execution and verification, AI explanations;
- **History**: software operations, trends and re-clean, quarantine/Trash occupancy and permanent deletion, scan history, restorable batches, AI trend analysis;
- **Settings**: safety notes, Chinese/English switch, protected paths, plugin update state, permission check, environment info, feedback and contact.

## Features

### Checkup

- The panel shows live capacity immediately; **no scan is required first**. Before the first scan, the Clean page shows "—" instead of 0 for the estimated reclaimable total.
- Quick and full scans are available; results fall into four tiers: **recommended / optional / needs review / protected**.
- Checkup wizard: recommended list → second confirmation → moved summary → undo / cleanup history / done.
- Scan failures, stale results, no data, and no recommendations are reported separately; an empty result is never treated as success.

### Clean

- 7 content categories: developer caches, browser caches, app caches, app leftovers, chat-app caches, other caches, and system caches.
- Regenerable cache subdirectories inside leftovers of uninstalled apps are split out as cleanable items; the rest stays in "needs review". Chat apps, system items, and running apps are not split.
- Search by name/path, sort by size or name, filter by risk, select across categories, tri-state select-all, and **Select recommended**.
- Protected and read-only items cannot be selected and are not counted in the estimated reclaimable total; "needs review" items are never auto-selected.
- Cleanup requires a second confirmation; **moving to the Trash/quarantine frees no space** until the batch is permanently deleted.
- More than 200 items are split into batches by the server, each with its own undo; results older than 10 minutes expire and disable cleanup.

![Cleanup screen](shot-clean.jpg)

### Space

- The directory breakdown covers the home folder (including hidden items); the tide-band chart and the table share the same denominator, with the long tail under "Other". Drill-down, breadcrumbs, show more, and re-scan are supported.
- The large-file view works globally (full scan) or per directory, with search by name/path, sorting by size or days since modification, and filters by modification time, type, and size.
- Rows can jump to the Clean page to inspect cleanable items for that path; the current directory is re-measured after a move.

### Software

Open **Software → Scan software** and search by name, package name, or install environment. Before confirming, preview the install location, impact, and recovery path. After an uninstall you can run a new checkup and review items under "App leftovers".

- macOS can move eligible standalone app bundles out, and restore them from **History**.
- Terminal tools cover applicable Homebrew, npm global, pipx, and uv tool installs. Shared dependencies, runtimes, and items with unclear ownership show the reason.
- Windows handles applicable MSI packages, current-user Appx packages, and WinGet portable packages with confirmed ownership through system interfaces. Other desktop apps can open system app management. Native Windows uninstall still awaits real-device acceptance.
- System or package-manager uninstalls usually need a reinstall to recover. The plan lists data-retention limits. Leftovers are confirmed separately.

### Similar photos

- dHash fingerprinting groups similar photos across Pictures / Downloads / Desktop / Documents, up to 600 photos of at least 200 KB; cloud folders and photo libraries are skipped.
- Keep strategies: largest / newest / shallowest path; folder filtering, grouped thumbnails, and side-by-side comparison are available.
- Bulk move to the Trash, undoable from History.

### Cross-disk moves

- Large files can be moved to another volume; the target shows free space and is pre-checked for capacity, and browsing it is read-only and **creates no directories**.
- **Cloud-backed files and app data directories cannot be moved** (photo libraries, Mail, Messages, app containers, store app data).
- Same-volume moves rename in place; cross-volume moves copy and verify **SHA-256 + size** in both directions, deleting the temporary file and keeping the original on failure.
- Background tasks, per-file progress, and cancellation; **moves are not undoable and the original location is not kept**.

![Move screen](shot-move.jpg)

### History and restore

- Scan history: time, free space, reclaimable, duration.
- Cleanup batches: time, item count, restorable count; **Restore this batch** moves files back to their original locations from the audit log (works across restarts).
- Permanently deleting a batch or all batches requires a second confirmation, only allows entries this plugin moved, and rejects symbolic links and paths outside the quarantine.
- The audit log is at `$DSH_HOME/deepclean-audit.log`; history is at `$DSH_HOME/deepclean-history.json`.

### Read-only AI assistance

- Entry points: checkup explanation, per-item "Ask AI / explain this item", pre-cleanup "review these n items", large-file "What is this", failure/degraded diagnosis, history trend analysis, and Software page explanations of why an item cannot be uninstalled, what an uninstall plan means, and what an uninstall result was.
- Prompts are built only from redacted data the panel already computed and are queued into the current DSH session; AI never takes part in scanning, risk tiers, the allow-set, or any write operation.
- The plugin cannot read model replies, so it never auto-selects or executes based on them; without an available session it falls back to copying the prompt.
- Prompts and tool output omit full absolute paths by default; cleanup decisions remain based on panel tiers and the second confirmation.

### Protected paths and bilingual UI

- Settings can add or remove absolute paths; protected paths never enter the cleanup allow-set, their subdirectories are protected too, and the host re-checks them.
- Chinese and English (Chinese is the source language), system dark theme, narrow-window support; no runtime CDN and no external fonts.

### Plugin updates

- When the panel opens it checks for an installable newer version; both the check and the update go through the **official DSH plugin manager service**, and the plugin makes no outbound requests of its own.
- Only stable versions that declare a DSH bundle and are compatible with the running DSH are recommended; prerelease, deprecated, or incompatible versions are skipped.
- When one is available, an **Update plugin** button appears next to the title. Confirming lets the DSH plugin manager update the package; restart DSH to load the new version. On failure the original version is kept and a localized reason is shown.
- Settings shows the current version, available version, state, and last check time, with a manual **Check for updates**. Results are cached in host memory for 6 hours; failures do not pop up.
- For a local development (`link:`) install, automatic updates are unsupported: Settings shows "the current install does not support automatic updates" and the header button is hidden.

## Safety model

- Scan and query interfaces are read-only; cleanup and moves only **move** files and never delete automatically; permanent deletion is limited to batches this plugin moved and needs a second confirmation.
- Only results from the last **10 minutes** are accepted; "needs review" items, running caches, and system items never enter the cleanup allow-set.
- Protected paths, symbolic links, cloud files, and app data directories are re-checked in the host and cannot be bypassed from the UI.
- A batch holds at most 200 items; larger selections are split by the server into independent batches.
- Clean, move, restore, and permanent deletion are all written to the audit log; name conflicts get a numeric suffix instead of being overwritten.

## Known limits

- Cloud protection relies on paths and Windows cloud-placeholder attributes (iCloud Drive / OneDrive / Dropbox / Google Drive); enterprise or custom sync folders need `DEEPCLEAN_CLOUD_ROOTS`.
- Windows does not report VSS / Recycle Bin occupancy: after permanent deletion, free space may lag briefly because of volume shadow copies.
- **The Windows chat-app category is macOS-only**; Windows app-cache scanning is not implemented yet (report fields are reserved).
- Windows directories that need administrator rights (such as `C:\Windows\Temp`) are shown read-only and never enter the allow-set; use the system "Disk Cleanup" for them.
- Real free-space estimation has an 8-second budget: very large trees may be truncated; the actual before/after free-space difference wins.
- Linux is unverified; in English mode a few scanner-generated strings are still Chinese.
- Undo applies only to batches in the current session's memory; use **Restore this batch** on the History page to restore across restarts.
- Similar-photo scanning is fixed to four folders, 600 photos, and a 200 KB minimum; HEIC/WebP support depends on system decoding, and cloud folders and photo libraries are skipped.
- Fine-grained leftover splitting only recognizes cache-like subdirectory names (Caches/tmp/Code Cache/GPUCache/CacheStorage, etc.); if the cache folder uses another name or the app is running, the whole group stays in "needs review".
- AI entry points depend on the current DSH session and model; without a session you can only copy the prompt, and the prompt carries a report summary rather than the full report, so answers can be wrong.
- Plugin update depends on the optional DSH plugin manager service: older DSH builds without it, or a `link:` development install, only show the Settings state without the header button.

## Feedback and support

- **Contact email**: **coolway.me@gmail.com**
- **In the panel**: Settings → Feedback & contact lists the email address, WeChat ID, and GitHub repository, plus a Star button that opens the repository page (sign in to GitHub to star it).
- **Bugs / usage questions / feature requests**: open a [GitHub issue](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/issues/new/choose) (the issue templates are preferred).
- **Security issues** (deleting outside the allow-set, path escapes, failed restores, privacy leaks): do not open a public issue; email **coolway.me@gmail.com** with details, and see [SECURITY.md](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/SECURITY.md).
- **Before filing**: restart DSH after any plugin change; authorize first if the permission check has not been granted.
- **Please include**: plugin version, DSH version, OS version, the failing feature, error code or failing stage, reproduction steps, and redacted logs or screenshots.
- **Never paste**: full disk paths, user names, file names, chat content, or raw audit-log entries; use `~/…` and `%LOCALAPPDATA%\…` instead.
- See [SUPPORT.md](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/SUPPORT.md) for the full support policy.

## Development and testing

See [CONTRIBUTING.md](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/CONTRIBUTING.md) for the development environment, directory layout, common commands, tests and CI, HTTP API, isolated preview, and scanner sync. Windows acceptance is covered by [docs/windows-ci.md](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/docs/windows-ci.md) and [docs/windows-acceptance.md](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/docs/windows-acceptance.md).

## License

MIT
