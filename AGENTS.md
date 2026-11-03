# deepclean-mydisk-plugin — 项目说明（给后续 Agent）

## 是什么
DSH 插件：原生侧边栏磁盘空间工具（macOS / Windows），只读体检 + 空间可视化 + 相似照片 + 微信/企微/QQ 专清 + 跨盘搬家 + 可撤销清理 + AI 只读解释。
**只移动、不删除**；AI 只解释、不执行；浏览器端是手写 bundle，**没有构建步骤**。

## 结构

### 宿主（`lib/`）
| 文件 | 职责 |
|---|---|
| `lib/index.js` | host 入口：**5 个只读模型工具**（`disk_check_permissions` / `disk_audit` / `disk_report` / `disk_inspect` / `disk_self_test`）+ **28 条 HTTP 路由**（含仅 macOS 的 `POST /api/open-privacy-settings`，用于打开「完全磁盘访问」设置）+ `scan`/`photos`/`move` 三个状态机 + 平台分支；`pruneReport` 在清理成功后增量剪枝内存报告（连续清理不重扫）；`cleanAnnotations` 只给审计记录补「清理时报告里的大小/分类」，不参与放行；`/api/clean` 超过 200 项时由 `splitBatches` 服务端分片（返回 `batchIds`），照片清理后 `prunePhotoResult` 剪枝；`/api/quarantine` 汇总隔离区，`/api/quarantine/purge` 是两阶段释放的第二阶段；`cloudRoots`/`isCloudBackedPath`/`moveBlockReason` 保护云盘与 App 数据目录；`disk_audit` 默认脱敏、输出附 `itemId` 并把工具体检报告单独存为 `toolReport`（只供 `disk_inspect`，绝不进入清理允许集合）；`disk_report` 只读面板最近报告、不触发扫描 |
| `lib/clean.js` | **唯一移动用户文件的地方**：`moveToTrash` / `restoreMoved` / `undoBatch` / `purgeMoved`、废纸篓路径、审计日志（超 5MB 自动轮转，保留近期记录与所有待恢复批次依据（活跃批次多时可超过阈值），`DEEPCLEAN_AUDIT_MAX_BYTES` 可覆盖）、单批上限 200；`moveToTrash(paths, allowed, { annotations })` 的 annotations 只写进审计（旧日志无此字段）；`restoreMoved(moved, batchId, { onConflict, recreateParents })` 返回 `{ results, auditOk }`，逐项带 `code`（`exists`/`notfound`/`changed`/`eacces`/`exdev`/`symlink`/`io`）；`quarantineRoot`/`quarantineSummary` 只读统计本插件批次占用；`purgeMoved` 删完会收掉空批次目录并返回 `auditOk` |
| `lib/platform.js` | 宿主侧白名单二次校验 `isProtected`（win32 用 `path.win32` 语义）；`parseTreeOutput` 目前只被测试引用 |
| `lib/client.js` | 浏览器端单文件 bundle（`window.__ModuleLoader__.load`，内嵌 CSS / SVG / Phosphor 图标，无构建）；含 **AI 只读解释入口**：体检解读、逐项「问 AI / 解释这一项」、清理前「复核这 n 项」、大文件「这是什么」、失败/降级诊断、历史趋势。提示词只拼面板已算好的报告/行/历史数据，经 `sessions.binding(id).session.prompt(..., 'queue')` 注入当前会话，**读不到模型回复**；会话服务缺失或没有打开的会话时降级为复制提示词 |

### 扫描器与资源（`resources/`，只读）
| 文件 | 职责 |
|---|---|
| `resources/scripts/deepclean.py` | 统一 CLI 入口（`VERSION = 0.5.0`）：平台分发、`--self-test`、`--check-permissions`、`--version` |
| `resources/scripts/scan.py` | macOS 只读扫描（`du`/`plutil`/`sips`/`statvfs`，7 线程，进度走 stderr `PROGRESS`）；含微信/企微/QQ 专清聚合（缓存类可清理，企微 Profile 只读）；**残留分档口径**：`classify` 对整容器一律 confirm，`cache_subdirs`/`apply_leftover_cache_split` 把可再生缓存子目录拆成独立 safe 组（`cachePart: true`），原组保持 confirm 并扣减大小；聊天类/系统 App/运行中的残留不拆；低于 1MB 不单列；浏览器缓存带 `running` 进程标记（运行中不可清）；大文件用 `find -print0` 流式 top-N 堆（不先截断再排序），prune 掉 `Library/CloudStorage`、`Library/Mobile Documents`、`Library/Mail`、`Library/Messages` 与 `*.photoslibrary` 等包目录，超 180s 预算标记 `truncated`，并输出 `bigFilesTop` |
| `resources/scripts/platforms/windows.py` | Windows 只读扫描（注册表已装程序、缓存与残留、UWP、OneDrive、浏览器缓存多 profile + `running` 标记、大文件；预算 120s；7 项自检）；残留经 `classify_leftover` 分档，**confirm 残留里的缓存子目录同样经 `cache_subdirs`/`apply_leftover_cache_split` 拆成 safe 组**（`cachePart: true`）；产出与 macOS 同契约的 `leftoverGroups`/`cloudStorage`/`browsers`/`estimate` |
| `resources/scripts/photos.py` | 相似照片 dHash 指纹与分组（macOS `sips`；Windows 走 PowerShell 批量解码）；跳过云盘目录/云占位文件与 App 包目录，结果带 `skippedCloud`/`skippedPackages` |
| `resources/scripts/photos-windows.ps1` | Windows `.NET` 指纹 / 缩略图解码，**不依赖 Pillow**；只写显式指定的临时 JPEG |
| `resources/scripts/tree.py` | 空间页目录统计：单趟后序遍历产出根清单 + `dirs` 各层缓存播种（≥10MB 子树、上限 500）+ 每层 `bigFiles` 堆（≥1MB，根 top 50 / 子目录 top 20）；含隐藏项，返回 `partial`/`unavailable`/`skipped`/`skippedCloud`/`metric`；不跟随链接与 Windows 重解析点；**云盘目录与 App 包目录仍计入大小，但不进 `bigFiles`/`dirs`**（防止被搬家/去重选中）；云盘根可用 `DEEPCLEAN_CLOUD_ROOTS` 注入 |
| `resources/rules.json` | macOS 分类规则（thresholds / knownNames / denyPaths 等） |
| `resources/images/disk.png` | 首页插画，**只经固定路由** `/dsh-deepclean/assets/disk.png` 暴露 |
| `resources/LICENSE-phosphor.txt` | 内嵌 Phosphor 图标（MIT）许可证 |

### 市场与本地化

| 路径 | 用途 |
|---|---|
| `locale/zh.json` / `locale/en.json` | 插件市场元数据（名称、简介、详情页路径） |
| `assets/icon-180.png` | 插件市场 180×180 图标（`package.json#icon`） |
| `docs/plugin/DETAIL.zh.md` / `DETAIL.en.md` + `shot-*.jpg` | 插件详情页文案与截图（`screenshots.json` 引用这四张图） |
| `docs/market/awesome-entry.yml` | 市场/awesome 条目元数据 |
| `screenshots.json` | 市场截图清单 |

### 开发、测试与验收
| 路径 | 用途 |
|---|---|
| `scripts/preview.mjs` | 隔离预览：`127.0.0.1:4173`，加载真实 `lib/client.js`，宿主 API 全内存 mock，路径虚构在 `/demo`，不碰用户文件；`DEEPCLEAN_PREVIEW_FDA=denied` 预览 FDA 引导卡 |
| `scripts/sync-scanner.sh` | 从 skill 仓库同步 `scan.py` / `deepclean.py` / `platforms/` / `rules.json`（**不含** `photos.py` / `tree.py` / `photos-windows.ps1`） |
| `scripts/acceptance-windows.ps1` | Windows 真机验收（输出 `acceptance-report/`） |
| `tests/` | `node:test` 覆盖 pages / host / clean / file-safety / client / windows-regressions / scanner / cancel / purge-interaction；实际数量与平台跳过项以 `npm test` 输出为准 |
| `tests/photos-regressions.py` | 照片解码与只读回归（由 `tests/scanner.test.mjs` 调用） |
| `tests/macos-scanner-regressions.py` | macOS `big_files` 回归：流式 top-N 无遍历顺序偏置、prune、预算截断（Windows CI 自动跳过） |
| `tests/windows-scanner-regressions.py` | Windows 扫描器纯函数回归：`big_files` 的 mtime/排序/预算截断、`cleanable`/`admin` 过滤（由 `tests/scanner.test.mjs` 调用，macOS 也能跑） |
| `tests/fixtures/preview-report.mjs` | 预览与页面测试共用的合成报告 |
| `docs/windows-acceptance.md` | Windows 真机验收清单 |
| `docs/design/` + `design-qa.md` | 首页/清理页设计稿、截图、视觉验收结论 |
| `docs/copy-terms.md` | 文案术语表（UI 与报告统一用词，改文案先查） |
| `docs/llm-opportunities.md` + `docs/analysis/` | AI 能力边界、代码链路测绘、行业对标与安全评估（改 AI 入口前先读；`docs/analysis/` 已被 `.gitignore` 忽略，公开仓库可能不包含） |
| `docs/review/` | 历次产品评审、P0/P1 修复记录与验收截图（本地材料，已被 `.gitignore` 忽略） |
| `scripts/windows-ci/` + `docs/windows-ci.md` | Windows CI 的用例驱动、扫描器与卷构造脚本 |
| `.github/workflows/tests.yml` | macOS + Windows CI（Node 24 + Python 3.12，只跑 `npm test`） |
| `.github/workflows/windows-acceptance.yml` | Windows 原生验收矩阵：`windows-2022` / `windows-2025` / `windows-11-arm`（Windows 11 Arm64 客户端镜像；无测试卷时显式 SKIP 跨卷用例），详见 `docs/windows-ci.md` |

## AI 辅助清理（只读解释，不参与放行）

AI 只做「解释 / 复核 / 诊断」；扫描、分档、允许集合、清理、恢复、永久删除全部仍由确定性代码和用户在面板确认。模型没有写工具，模型输出也不进入 `allowedPaths`、不改变勾选或风险档。

| 入口 | 位置 | 提示词数据 |
| --- | --- | --- |
| 让 AI 解读这次体检 | 首页 | 报告摘要、分档条目、大文件、估算与范围说明 |
| 问 AI / 解释这一项 | 清理页条目详情 | 单条目分类/风险/大小/脱敏路径/影响 + 只读证据 |
| 复核这 n 项 | 清理确认区 | 已勾选、尚未执行的条目集合与合计 |
| 这是什么 | 大文件行 | 文件名/脱敏路径/大小/扩展名/修改时间 + `itemId` |
| AI 解释这次失败 | 清理/恢复/撤销失败、扫描失败或被截断、权限被拒 | 错误码、计数、脱敏原因、`auditOk` / `truncated` / `fda` |
| 让 AI 分析趋势 | 历史页 | 可用空间趋势、清理批次、清了又长回来的条目 |

- **投递方式**：`lib/client.js` 调用 `sessions.binding(id).session.prompt([{ type: 'text', text }], 'queue')`，只消费返回的 `ok`；**读不到模型回复**，因此没有结构化回填、自动勾选或自动执行。会话服务缺失或没有打开的会话时降级为复制提示词。
- **只读工具**：`disk_report` 读面板最近报告、不重扫；`disk_inspect` 按 `itemId` 或报告覆盖路径查事实（fail-closed）；`disk_audit` 的工具体检报告只存为 `toolReport`。三者都不参与放行。
- **提示词安全**：文件名/目录名/App 显示名按不可信数据处理（NFKC、去控制字符/换行/定向符、单行化、截断、数据边界围栏并防伪造）；完整绝对路径默认不发送（`~ + 顶层目录 + … + basename`）；规则禁止输出命令、禁止用文件名判断可删、过期报告必须先重扫、没有 `disk_inspect` 时不得假装调用。
- **不能做**：不给模型新增写工具，不根据模型输出自动勾选/清理，不让模型决定分档、白名单或报告新鲜度。改 AI 入口前先读 `docs/llm-opportunities.md`。

## 常用命令
```bash
npm test                                   # 全量测试（原生用例按平台跳过）
node --check lib/index.js lib/client.js lib/clean.js lib/platform.js scripts/preview.mjs
python3 resources/scripts/deepclean.py --self-test          # 扫描器自检
python3 resources/scripts/deepclean.py --check-permissions  # 权限检查
python3 resources/scripts/deepclean.py --version            # deepclean-mydisk 0.5.0
python3 tests/photos-regressions.py                         # 照片解码回归
python3 tests/macos-scanner-regressions.py                  # macOS 大文件流式 top-N 回归（改了 scan.py 才需要）
python3 tests/windows-scanner-regressions.py                # Windows 扫描器回归（改了 platforms/windows.py 才需要）
python3 tests/tree-regressions.py                         # tree.py 回归：dirs 播种、bigFiles 堆、partial 传播（改了 tree.py 才需要）
node scripts/preview.mjs                                    # http://127.0.0.1:4173
```

## 安全硬约束（改代码时必须保持）
- 扫描器只读；不删除、不移动用户文件；
- 清理只**移动**，可撤销，不提供自动删除：
  - macOS → `~/.Trash`
  - Windows → `%LOCALAPPDATA%\deepclean-mydisk\trash\<时间戳>`
  - 其他 → `~/.local/share/deepclean-mydisk/trash/<时间戳>`
  - 可用 `DEEPCLEAN_TRASH_DIR` 覆盖；
- 只接受最近 **10 分钟**的扫描结果：体检报告或相似照片结果任一新鲜即可，且只取允许集合（safe 档 + 非 system、非 admin、`cleanable≠false` 的缓存 / 开发缓存 / 浏览器 / 专项可清理项；「需确认」档与 Temp 类被占用目录永不进入）；
- 白名单路径在宿主用 `isProtected` **二次校验**（不依赖 UI 勾选）；win32 匹配大小写不敏感并解析 `.` / `..`；
- 符号链接拒绝：清理逐条 `lstat`、搬家源逐级祖先、搬家目标、tree 浏览均校验；
- 搬家允许集合有两个来源，共享 10 分钟新鲜度：体检报告 `bigFiles`，或 tree 缓存中新鲜目录统计的 `bigFiles`；跨盘搬家必须复制后 **SHA-256 + 大小**双向校验，失败删除临时文件并保留原文件；
- **两阶段释放**：清理只移出（可用空间不变）；释放必须走 `/api/quarantine/purge`（永久删除本批次/全部）并二次确认，只能删 `purgeMoved` 边界内的本插件批次条目；首页/历史展示隔离区/废纸篓占用；超过 200 项由服务端分片，一次操作可能产生多个批次（`batchIds`）；
- **云盘 / App 数据目录不参与搬家**：`tree.py`/`photos.py` 排除云盘根与包目录，宿主再用 `cloudRoots`/`moveBlockReason` 二次校验；`DEEPCLEAN_CLOUD_ROOTS` 只用于补充/测试；
- 审计日志 `$DSH_HOME/deepclean-audit.log`（`clean` / `move` / `restore` / `purge`），历史 `$DSH_HOME/deepclean-history.json`（最多 100 条）；批次展示最近 20 条及所有仍可恢复批次，恢复/释放操作使用完整索引；`clean` 条目的 `moved[].kb/category` 是新增的审计标注（旧日志可能没有），只用于历史趋势/复清展示，不参与放行；
- **恢复/撤销边界**：`restoreMoved` 只接受「审计记录里、`to` 位于 `trashRoots()` 下的 `deepclean-*` 批次目录、且 realpath 不逃逸」的条目；父目录是符号链接一律拒绝；`/api/undo` 会把已恢复条目从内存批次剔除（避免重试永远报 notfound、撤销入口清不掉）；默认拒绝覆盖原位置同名文件，只有显式 `onConflict:'rename'` 才另存为「名称 (restored)」；可为审计里的原路径重建缺失父目录，但逐级拒绝符号链接祖先；部分失败必须按 `results[].code` 如实返回，UI 不得报「已恢复」；审计写入失败时 `moveToTrash`/`restoreMoved` 返回 `auditOk:false`，调用方必须提示「历史里可能看不到恢复记录」；
- **残留拆分边界**：只对「未安装、未运行、非系统、非聊天类」容器的 confirm 组拆缓存子目录；拆出的 safe 组才进允许集合，原容器路径仍不进；拆分路径必须 realpath 严格位于容器之下（自命中/符号链接逃逸一律不拆）；Windows 在 `installed_apps()` 为空时 fail-closed；不要放宽成「confirm 整组可清」；
- **LLM 只做只读解释**：提示词由 `lib/client.js` 用已算好的报告数据拼接，注入当前会话（`queue`）；模型输出不进入允许集合、不触发任何写操作；`disk_report` 只读且不重扫，`disk_audit` 工具体检报告只存 `toolReport`、不参与放行；提示词里的文件名/目录名/App 显示名按不可信数据处理（NFKC、去控制/换行/定向符、单行化、截断、数据边界围栏），完整绝对路径默认不发送；`disk_inspect` 只读且 **fail-closed**（只接受最近一次报告覆盖的路径或面板 `itemId`，输出路径脱敏、顶层文件名单行化、`bundleId` 白名单校验后才查 Spotlight），lstat/readdir 不跟随符号链接、不写文件；不要给模型新增写工具或把 `prompt` 结果用于放行判断；
- ❌ 不引入注册表清理、后台常驻扫描、恐吓式提示。

## 常见陷阱
- **没有构建步骤**：`lib/client.js` 是手写 bundle（CSS 内联在 `<style>` 字符串、图标是内嵌 SVG data URI）。不要引入 JSX / 打包器 / 运行时 CDN。
- 新增静态资源必须同时加宿主**固定路由**（参考 `assets/disk.png`），不要暴露任意文件路径。
- 写操作只能出现在 `lib/clean.js` 与 `lib/index.js` 的清理/搬家入口；`lib/client.js` 只调 HTTP API，**不做任何文件写操作**；AI 入口只是往会话里发一段提示词（`session.prompt(..., 'queue')`），不碰文件。
- 修改 `lib/index.js` 或 `lib/client.js` 后**必须重启 DSH**（`link:` 挂载，宿主进程内加载）。
- 扫描是**后台子进程**：`POST /scan` 立即 202，客户端 900ms 轮询 `GET /scan`；进度条按经验时长插值（28s / 45s），不是实测耗时，UI 进度与实际进度可能不同步。
- `/api/report` 的 GET 有副作用：除 `cached=1` 外都会**启动扫描**并返回 202；客户端已不再调用它，改由 `/api/scan`。
- `/api/tree` 走 `tree.py` + 60s 缓存（500 条 LRU）；tree.py 单趟遍历返回 `dirs` 各层清单，宿主一次播种全层缓存，下钻不再重复遍历；使用独立子进程句柄，浏览目录**不会**取消正在进行的扫描。
- **AI 是单向投递**：只能把提示词排入当前会话，读不到模型回复；不要设计依赖模型输出的自动勾选、自动清理或结构化回填。
- 新增/修改 AI 入口时必须复用 `lib/client.js` 的 `untrustedText` / `safeDisplayPath` / `aiRules`，中英文规则成对修改；不得给模型新增写工具，也不得把 `prompt` 结果用于 `allowedPaths` / `isProtected` / 新鲜度判断。
- 测试按平台跳过：macOS 跳 2 个 Windows 专用 HTTP 用例（`tests/host.test.mjs` 的 Windows tree / thumbnail），结果 179 pass / 2 skip；Windows 跳 7 个 macOS / 非 Windows 宿主专用用例（3 个 symlink 清理/恢复、1 个跨盘复制链接、tree 拒家目录外、permissions、`--platform windows` 拒绝用例），结果 174 pass / 7 skip。CI 两端都会跑全量。
- 换行统一 **LF**（`.gitattributes` 的 `* text=auto eol=lf`）：页面测试用源码字符串替换注入视图，CRLF checkout 会让断言失配；不要改该文件或改用会转 CRLF 的克隆配置。

## 已知缺口（改代码前先看，均为代码事实）
1. **已修复**：Windows 报告已对齐 macOS 契约——`leftoverGroups`、`cloudStorage`、`browsers`（Chrome/Edge 多 profile + Firefox cache2，含 running 进程保护）、`estimate`（含 `cacheKb`/`confirmKb`/`overlapKb` 去重）。**残留分档口径**：整容器（含媒体/会议类）一律 confirm；safe 只来自 `cache_subdirs()` 拆出的缓存子目录（`cachePart:true`）。
2. **已修复**：`acceptance-windows.ps1` 改查 `leftoverGroups` / `estimate.cacheKb` 等新契约字段，不再断言 Windows 没有的 `special`。
3. `/api/reveal` 的条件是「家目录外**且**非目录」才拒绝，即家目录外的已存在目录也会被打开，且不检查符号链接（只读操作）。
4. `lib/platform.js:parseTreeOutput` 未被生产代码调用（tree 已改用 `tree.py` 的 JSON），仅 `tests/windows-regressions.test.mjs` 引用。
5. Linux：宿主有 `bootMount` / `listVolumes` / `xdg-open` 分支，但 `deepclean.py` 对非 win/darwin 回退 macOS 扫描器，**未验收**；对外口径为「支持 macOS / Windows」。
6. 验收范围：`design-qa.md` 只覆盖浅色首页 + 清理页 + 英文窄窗口（隔离预览），Windows 真机 / 暗色主题 / 无障碍**未验收**；英文模式下权限检查输出等扫描器原文仍为中文（其余动态提示已补齐翻译，术语见 `docs/copy-terms.md`）。
7. **Windows 的 `appCaches` 尚未实现**：`platforms/windows.py` 已预留空数组，宿主/客户端已消费；Windows 端扫描逻辑待补。
8. **永久删除边界**：`purgeMoved` 仅允许删除「本插件移入废纸篓/隔离区」的批次条目，拒绝隔离区外路径与符号链接；不要放宽为任意路径删除。
9. **云盘保护是路径/云占位启发式**：默认覆盖 iCloud Drive、OneDrive、Dropbox、Google Drive；企业自建网盘或自定义同步目录需 `DEEPCLEAN_CLOUD_ROOTS` 补充；不做云客户端 API 调用。
10. **Windows 无 VSS/回收站提示**：永久删除后可用空间可能因卷影副本滞后，UI 暂只对 macOS 提示 APFS 快照。
11. **AI 只有单向投递**：`session.prompt` 只返回是否受理（插件只消费 `ok`），读不到模型正文，所以没有结构化输出、计划回填或自动评测；提示词只带报告摘要（各档前 6 项、大文件前 6 项、复核最多 30 行），问更细的条目用逐项「问 AI」。AI 提示词/能力的取舍见 `docs/llm-opportunities.md`。
12. **Windows 的聊天专项 `special` 未实现**：微信/企业微信/QQ 的 `special` 分类只在 macOS 扫描器生成；Windows 报告没有该数组（`appCaches` 同样仍为空）。

## 独立性与同步
- 本仓库是独立项目，**不依赖** deepclean-mydisk skill 仓库；
- 扫描器是内置副本：`scripts/sync-scanner.sh <skill-repo-path>` 只同步 `scan.py` / `deepclean.py` / `platforms/` / `rules.json`；`photos.py` / `tree.py` / `photos-windows.ps1` 是插件独有，不要覆盖；
- 发布：改 `package.json` version → 更新 `CHANGELOG.md` → commit → `git tag vX.Y.Z` → `gh release create`。

## 给 Claude Code
- `CLAUDE.md` 通过 `@AGENTS.md` 引用本文，只补充 Claude Code 的工作约定与验证闭环；项目事实以本文为准，改结构/约束时**只改这里**。
- `.claude/settings.json` 是权限设置（allow / ask / deny），`.claude/skills/` 是 `/test`、`/preview`、`/self-check`、`/release` 四个 skills（Claude Code 2.1 起 `.claude/commands/` 已废弃）。
- 改 `.claude/` 等同于改开发流程，提交前要和其他代码一样 review。
- 改 AI 入口：先读 `docs/llm-opportunities.md` 和上面的「AI 辅助清理」；提示词只加程序已算好的事实，不加写工具，不改放行逻辑；改完跑 `npm test` 并用隔离预览检查入口与降级文案。

## 本地安装（DSH profile）
```bash
dsh plugin --profile desktop add link:/path/to/deepclean-mydisk-plugin
```
修改 host 或 client 代码后需要重启 DSH。
