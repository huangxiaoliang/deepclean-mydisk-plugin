# 开发与测试

本文面向修改插件代码的开发者。用户安装、功能与已知限制见 [README.md](README.md)；安全问题见 [SECURITY.md](SECURITY.md)，使用支持见 [SUPPORT.md](SUPPORT.md)。

## 环境

- Node.js 24（`npm test` 使用 `node --test`）；
- Python 3.12（扫描器与照片解码回归）；宿主按 `PYTHON` 环境变量 → Windows `py -3` / `python` / `python3`、macOS/POSIX `python3` / `python` → DSH 自带运行时（`$DSH_HOME/dsh-runtimes/*/dependencies/python`）的顺序探测，测试脚本自身只认 `PYTHON` 与 PATH；
- 依赖安装：`npm install`（CI 用）或 `pnpm install` 均可；`pnpm-workspace.yaml` 已为 pnpm 打开依赖提升，否则 Windows + Node 24 下 `node --test` 会报 `ERR_MODULE_NOT_FOUND`、`node scripts/preview.mjs` 会报 `Cannot find module 'scheduler'`；
- **没有构建步骤**：`lib/client.js` 是手写 bundle（CSS 内联、图标为内嵌 SVG），不要引入 JSX / 打包器 / 运行时 CDN；
- 修改 `lib/index.js` 或 `lib/client.js` 后需要重启 DSH（`link:` 挂载，宿主进程内加载）。

## 本地预览（不需要 DSH）

```bash
node scripts/preview.mjs
# http://127.0.0.1:4173   端口可用 DEEPCLEAN_PREVIEW_PORT 覆盖
```

- 加载**真实的 `lib/client.js`**，无构建、无安装（react 从 `node_modules` 内联）；
- 宿主 API 全部是**内存实现**，所有路径虚构在 `/demo`，清理 / 恢复 / 移动只改预览内存；
- `?data=1` 带扫描结果打开；`?data=1&expired=1` 演示过期状态；
- 只监听 127.0.0.1，不读取、不修改任何用户文件。

## 目录结构

```
lib/index.js         host 插件：5 个只读模型工具、37 条 HTTP 路由、扫描/照片/移动/软件状态机
                     （路由 = 27 条面板 + 7 条软件 + 2 条更新 + 1 条静态资源）
lib/clean.js         清理与搬家的写入口（废纸篓/隔离区、撤销/恢复、永久删除、跨盘复制搬运、审计日志、隔离区统计）；同盘搬家由 lib/index.js 直接 rename
lib/software.js      软件实例清单、卸载计划、任务核验与 job 日志（$DSH_HOME/deepclean-software-jobs.json）
lib/software-discovery.js 软件来源发现（macOS App / Homebrew / npm 全局 / pipx / uv；Windows 注册表 / Appx / WinGet）
lib/platform.js      宿主保护名单二次校验（跨平台路径语义）
lib/client.js        浏览器端单文件 bundle（手写，无构建；内嵌 CSS/图标）
resources/scripts/   只读扫描器：deepclean.py 入口、scan.py、platforms/windows.py、
                     photos.py、photos-windows.ps1、tree.py、
                     software-macos.py、software-windows.ps1（软件清单只读查询）
resources/rules.json macOS 分类规则
resources/images/    首页插画（只经宿主固定路由暴露）
locale/              市场元数据（zh/en）
assets/              插件市场图标
scripts/             隔离预览、扫描器同步、市场索引刷新、Windows 验收 / CI
tests/               node:test 用例（页面/宿主/清理/安全/软件/更新/鉴权/Windows 回归）+ Python 回归脚本
docs/                Windows 验收清单、设计稿与视觉验收、插件详情页与评审记录
.claude/             Claude Code 权限设置（settings.json）与 /test /preview /self-check /release skills
.github/             CI workflows、Issue 表单与 PR 模板
CODE_OF_CONDUCT.md   贡献者行为准则
SECURITY.md          安全问题私下报告渠道
SUPPORT.md           反馈与支持说明（Issue / 邮件 / 日志脱敏）
```

## 常用命令

```bash
npm test                                                   # 全量测试
node --check lib/index.js lib/client.js lib/clean.js lib/platform.js scripts/preview.mjs
python3 resources/scripts/deepclean.py --self-test         # 扫描器自检
python3 resources/scripts/deepclean.py --check-permissions # 权限检查
python3 tests/photos-regressions.py                        # 照片解码与只读回归
python3 tests/windows-scanner-regressions.py               # Windows 扫描器纯函数回归
python3 tests/tree-regressions.py                          # tree.py 回归
python3 tests/macos-scanner-regressions.py                 # macOS big_files 回归
node scripts/preview.mjs                                   # 隔离预览
npm run market:index                                       # 刷新 docs/market/index.json 的版本（--check 只校验）
```

测试用户文件相关功能时用 `tests/fixtures/`、临时 `HOME`、`DEEPCLEAN_TRASH_DIR` 指向临时目录，不要动真实废纸篓。

## 测试与 CI

- `npm test`（`node --test`）当前 **340** 个用例（平台相关用例会跳过，实际数量与跳过项以 `npm test` 输出为准）；
- 平台专用用例会跳过：macOS 跳过 3 个 Windows 专用用例（337 pass / 3 skip），Windows 跳过 9 个 macOS / 非 Windows 宿主专用用例（331 pass / 9 skip，以 Windows CI 实测为准）；
- CI（[.github/workflows/tests.yml](.github/workflows/tests.yml)）在 macOS + Windows 上跑 Node 24 + Python 3.12，只执行 `npm test`；
- [.github/workflows/windows-acceptance.yml](.github/workflows/windows-acceptance.yml) 额外在 windows-2022 / windows-2025 / windows-11-arm 上跑原生验收，详见 [docs/windows-ci.md](docs/windows-ci.md)；
- 页面测试是 SSR 渲染（`renderToString`），不是浏览器 E2E；真实交互请用隔离预览人工验收。

## 设计材料

- `docs/design/`：设计原图、最终截图、并排对照、英文窄窗口截图（说明见 [docs/design/README.md](docs/design/README.md)）；
- `design-qa.md`：视觉验收结论（浅色首页、清理页、空间页与历史页；含 320/1280 窄宽窗与暗色走查，完整暗色/Windows 真机/无障碍未验收）；
- `docs/design/space-implementation.md`：空间页实现记录与边界。

## HTTP API

原有磁盘路由挂在 `/dsh-deepclean` 下，统一由 `panelRoute` 做来源校验（宿主 `connection.requestRejection` 优先，缺失时退回回环 Host + `sec-fetch-site` + `x-deepclean-ui: panel`），请求体上限 1 MB。软件路由要求 `x-deepclean-ui: software` 头，写操作还要会话令牌 `x-deepclean-token` 与 JSON content-type，写请求体上限 8 KB。更新路由要求 `x-deepclean-ui: update` 头，写操作要求 JSON content-type，请求体上限 4 KB。三组路由都先经 `resolveConnection` 问宿主登录鉴权，再依次校验回环 Host、`sec-fetch-site` 与 Origin，防止 DNS rebinding。软件路由契约见 [软件卸载实施契约](docs/design/software-uninstall.md)。下表列出磁盘路由，软件路由见其后的独立小节。

**只读**

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/assets/disk.png` | 固定首页插画，不暴露任意路径 |
| GET | `/api/permissions` | `{ code, status, text }`，每次调用启动一次扫描器权限检查（30s 超时）。macOS 另返回 `fda: { status, revision }`，区分 `granted`、`denied`、`unknown` |
| GET | `/api/overview` | `{ at, report, disk, scan, history(最近 30), cleanBatches, quarantine, whitelist, paths(audit/history/whitelist 文件位置), platform }` |
| GET | `/api/disk` | 实时 `statfs` 容量快照 |
| GET | `/api/scan` | `{ scan, report, at }` 扫描状态。macOS 扫描产生权限结果时，`scan.fda` 与权限检查共用按发起顺序分配的 `revision` 序号 |
| GET | `/api/volumes` | 卷列表与各自容量 |
| GET | `/api/tree?path=&refresh=1` | 单层目录统计（含隐藏项、部分统计、跳过链接计数） |
| GET | `/api/destination?path=` | 只读目标文件夹浏览 + 容量预检，不创建目录 |
| GET | `/api/photos` | 照片扫描状态与分组结果 |
| GET | `/api/thumb?path=&size=` | 缩略图 JPEG（size 限制 64–320） |
| GET | `/api/state` | `{ at, canUndo, lastBatchId, lastBatchIds, scan }`；`lastBatchIds` 是最近一次清理操作的批次组（分片清理含多批） |
| GET | `/api/history` | `{ scans, cleans }`；`cleans[].lastRestore` 为 `{ at, ok, failed, codes }`（最近一次恢复的失败项数按 code 分类） |
| GET | `/api/quarantine` | 隔离区/废纸篓里本插件批次的 `{ root, kb, files, batches, truncated, systemTrashKb }`（3 秒缓存） |
| GET | `/api/report?cached=1` | 已有缓存报告时返回 `{ report, at }`；无缓存或未带 `cached=1` 会启动扫描并返回 202（`full=1` 请求完整扫描） |
| GET | `/api/update-check?refresh=1` | 插件更新检测：`{ supported, reason, updatable, updateAvailable, installedVersion, latestVersion, newestVersion?, checkedAt }`；走可选的 DSH `pluginManager` 服务，结果在宿主内存缓存 6 小时，`refresh=1` 强制重查 |

**控制 / 写操作**

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/scan` | `{ full }` 后台启动扫描，202 / 409 |
| POST | `/api/scan/cancel` | 取消扫描并终止子进程树 |
| POST | `/api/photos/scan` | 启动照片扫描，202 / 409 |
| POST | `/api/photos/cancel` | 取消照片扫描 |
| POST | `/api/clean` | `{ paths }` 移入废纸篓/隔离区；超过 200 项时服务端自动分片，返回 `{ batchId, batchIds, moved, results, batches, chunkErrors, auditOk }` |
| POST | `/api/undo` | `{ batchId? / batchIds? }` 撤销本会话批次；返回 `{ results, summary, batches, retryable, auditOk }`，部分失败保留撤销入口 |
| POST | `/api/restore` | `{ batchId, onConflict? }` 从审计日志恢复历史批次；`onConflict:'rename'` 时冲突另存为「name (restored)」；返回 `{ results, summary, auditOk }` |
| POST | `/api/purge` | `{ batchId? }` 永久删除隔离区中的批次（二次确认后调用） |
| POST | `/api/quarantine/purge` | `{ batchIds }` 或 `{ all: true }`（必须显式二选一，空 body 返回 400）两阶段释放的第二阶段：永久删除指定/全部本插件批次，返回 `{ total: { purged, freedBytes }, batches, results, auditOk }`；需 UI 二次确认 |
| POST | `/api/reclaim` | `{ paths }` 估算逻辑/分配大小、文件数、APFS 快照数与 `truncated`（8 秒预算，超时标记不完整） |
| POST | `/api/move` | `{ paths, destination }` 后台移动，202 |
| POST | `/api/move/cancel` | 取消移动 |
| POST | `/api/reveal` | 在 Finder / 资源管理器中打开位置 |
| POST | `/api/open-privacy-settings` | 仅 macOS：打开「完全磁盘访问」系统设置（`DEEPCLEAN_NO_OPEN=1` 时只返回成功，不真正打开；该变量也作用于 `/api/software/open`） |
| GET/PUT/POST | `/api/whitelist` | 读取或保存保护名单 |
| POST | `/api/update` | `{ confirm: true }` 由 DSH 官方插件管理更新到最新兼容版本；返回 `{ ok, from, to, application, stage, restartRequired, errorCode }`；需要 `X-Deepclean-UI: update` 与 JSON 请求体 |

**模型工具（只读，共 5 个）**：`disk_check_permissions`、`disk_audit`（支持 `quick` / `redact` / `platform`）、`disk_report`（只读面板最近一次报告，不触发扫描）、`disk_inspect`（检查最近一次报告——面板报告或 `disk_audit` 的 `toolReport`——覆盖的路径或 `itemId` 的事实：类型/大小/文件数/修改时间/报告分档/对应 App 是否仍安装；`toolReport` 只用于定位、不参与放行；报告外路径 fail-closed，输出路径脱敏）、`disk_self_test`。

## 软件路由

软件接口挂在 `/dsh-deepclean/api/software*` 下，改用 `x-deepclean-ui: software` 头（不再要求面板头）。`GET /api/software` 返回清单快照并下发本进程随机 `token`；写操作还要 `X-Deepclean-Token` 与 JSON content-type。清单来自 `resources/scripts/software-macos.py` / `software-windows.ps1` 的只读查询，卸载执行在宿主侧。请求体上限 8 KB，契约详见 [软件卸载实施契约](docs/design/software-uninstall.md)。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/software` | 软件清单快照 + `token`；扫描进行中时 `scanning: true` |
| POST | `/api/software/scan` | 后台启动软件清单扫描，202；磁盘扫描/搬家/照片扫描进行中返回 409 `busy` |
| POST | `/api/software/open` | `{ itemId }`：在 Finder（macOS）或系统「应用」设置（Windows）中定位；`DEEPCLEAN_NO_OPEN=1` 时只返回成功 |
| POST | `/api/software/plan` | `{ itemId }`：返回卸载/移出计划与作用域估算 `size`；受保护路径 409 `protected_path` |
| POST | `/api/software/execute` | `{ planId, confirmed }`：执行计划，202；写入自己的 job 日志（`$DSH_HOME/deepclean-software-jobs.json`） |
| POST | `/api/software/reconcile` | `{ jobId }`：核验任务结果（退出码/重启要求/空间变化） |
| POST | `/api/software/journal/reset` | 仅在 job 日志损坏（`journalError`）时允许：备份损坏文件后重置，返回 200；正常时 409 `journal_ok` |

## 独立项目与扫描器同步

本目录是独立 Git 仓库，不依赖 `deepclean-mydisk` skill 仓库，也不依赖 `default-workspace`：扫描器内置于 `resources/`。其中 `scan.py` / `deepclean.py` / `platforms/` / `rules.json` 可选用 `scripts/sync-scanner.sh <skill-repo-path>` 从 skill 同步；`photos.py` / `tree.py` / `photos-windows.ps1` 为本插件独有，不要覆盖。

## 贡献流程

- 提交前请阅读 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)；
- 从 fork 开分支提交 PR，模板会带上安全红线自查、验证命令与文档/契约同步清单；
- 安全相关改动（清理、恢复、搬家、允许集合、鉴权、审计）必须在 PR 里逐项说明红线自查结果；
- 不要提交 `report.md` / `report.json` / `acceptance-report/` / `__pycache__` 等产物。

## 发布

1. 更新 `CHANGELOG.md` 与 `package.json` 的 version；
2. 发布前跑 `npm test`、`node --check`、`deepclean.py --self-test` 与相关 Python 回归；
3. `git commit` → `git tag vX.Y.Z` → `gh release create`（附 `npm pack` 生成的 `.tgz`）；
4. `npm publish`：账号需安全密钥 2FA；首次发布时 npm 会自动生成 `0.0.0-stage` 占位版本（属正常，`latest` 不受影响）；
5. 市场条目（awesome-dsh-plugin）只在描述/分类变化时需要更新；npm 版本映射由该仓库 CI 自动探测。
6. 自建索引 `docs/market/index.json` 由 `.github/workflows/market-index.yml` 在 release 发布后（以及每日）用 `scripts/update-market-index.mjs` 自动刷新；本地用 `npm run market:index` / `--check` 校验。

安全红线与不可协商的约束见 [AGENTS.md](AGENTS.md)。
