# deepclean-mydisk-plugin — 项目说明（给后续 Agent）

## 是什么
DSH 插件：原生侧边栏磁盘空间工具（macOS / Windows），只读体检 + 空间可视化 + 相似照片 + 微信/企微/QQ 专清 + 跨盘搬家 + 可撤销清理 + AI 只读解释。
**缓存与残留清理先移动、可恢复**。软件卸载单独授权，可调用系统或原包管理器。AI 只解释、不执行；浏览器端是手写 bundle，**没有构建步骤**。

## 结构

### 宿主（`lib/`）
| 文件 | 职责 |
|---|---|
| `lib/index.js` | host 入口：**5 个只读模型工具**（`disk_check_permissions` / `disk_audit` / `disk_report` / `disk_inspect` / `disk_self_test`）+ **37 条 HTTP 路由**（27 条面板 API + 7 条软件 + 2 条更新 + 1 条固定静态资源；含仅 macOS 的 `POST /api/open-privacy-settings`，用于打开「完全磁盘访问」设置；**所有面板 API 路由先过来源校验**（固定资源 `/dsh-deepclean/assets/disk.png` 只返回内置图片、不做来源校验）：优先调用宿主可选 `connection` 服务的 `requestRejection`（Host/Origin 围栏 + 浏览器登录 cookie），服务缺失时回退回环 Host + 自定义头 `x-deepclean-ui: panel`，`/api/thumb` 因 `<img>` 不能加头只做围栏）+ `scan`/`photos`/`move` 三个状态机、软件卸载任务队列（7 条软件路由，见 `lib/software*.js`）+ 平台分支；`pruneReport` 在清理成功后增量剪枝内存报告并复算 `estimate`（连续清理不重扫）、把扫描时废纸篓总量标记 `trashKbStale`；`estimateOf` 与扫描器同口径（排除被 UI 更具体条目覆盖的缓存父目录与 `cleanable=false` 的开发缓存）；`cleanAnnotations` 只给审计记录补「清理时报告里的大小/分类」，不参与放行；`/api/clean` 超过 200 项时由 `splitBatches` 服务端分片（返回 `batchIds`），照片清理后 `prunePhotoResult` 剪枝；`/api/quarantine` 汇总隔离区，`/api/quarantine/purge` 是两阶段释放的第二阶段；`cloudRoots`/`isCloudBackedPath`/`moveBlockReason` 保护云盘与 App 数据目录；`disk_audit` 默认脱敏、输出附 `itemId` 并把工具体检报告单独存为 `toolReport`（只供 `disk_inspect`，绝不进入清理允许集合）；`disk_report` 只读面板最近报告、不触发扫描；`/api/overview` 附带缓存 5 分钟的 APFS 本地快照数 `snapshots`（非 macOS 或读取失败为 `null`）；`/api/update-check` 与 `/api/update` 只封装可选 `pluginManager` 服务的 `listBundles`/`listVersions`/`updateBundle`（读安装版本与更新都走官方服务，不自行访问 registry），更新检测在内存缓存 6 小时、不落盘 |
| `lib/clean.js` | 清理与搬家的写入口（同盘搬家的 `renameSync` 在 `lib/index.js`）：`moveToTrash` / `restoreMoved` / `undoBatch` / `purgeMoved` / `moveAcrossDevices`（跨盘复制 + SHA-256 校验）、废纸篓路径、审计日志（超 5MB 自动轮转，保留近期记录与所有待恢复批次依据（活跃批次多时可超过阈值），`DEEPCLEAN_AUDIT_MAX_BYTES` 可覆盖）、单批上限 200；`moveToTrash(paths, allowed, { annotations })` 的 annotations 只写进审计（旧日志无此字段）；`restoreMoved(moved, batchId, { onConflict, recreateParents })` 返回 `{ batchId, results, auditOk }`，逐项带 `code`（`exists`/`notfound`/`changed`/`enoent`/`eacces`/`exdev`/`symlink`/`io`；`enoent` = 原路径父目录缺失且未允许重建）；`quarantineRoot`/`quarantineSummary` 只读统计本插件批次占用；`purgeMoved` 删完会收掉空批次目录并返回 `auditOk` |
| `lib/software.js` / `lib/software-discovery.js` | 软件实例清单、卸载计划、任务与核验。修改来源识别、执行、恢复、接口或覆盖范围前读 [软件卸载实施契约](docs/design/software-uninstall.md)；真实卸载从 `lib/index.js` 发起。`deepclean-software-jobs.json` 超 1000 条自动裁剪，结构损坏时 fail-closed 并由面板显式重置（损坏文件改名备份）；扫描后**后台**测量可执行项的安装体积（并发 4、20s 预算、按 `id+fingerprint` 缓存，`measure` 由宿主注入）；计划/执行的身份比较只比 `id/fingerprint/location/executable`，**不能**把晚到的体积字段算进 `installation_changed`。 |
| `lib/platform.js` | 宿主侧白名单二次校验 `isProtected`（win32 用 `path.win32` 语义）；`parseTreeOutput` 目前只被测试引用 |
| `lib/client.js` | 浏览器端单文件 bundle（`window.__ModuleLoader__.load`，内嵌 CSS / SVG / Phosphor 图标，无构建）；含 **AI 只读解释入口**：体检解读、逐项「问 AI / 解释这一项」、清理前「复核这 n 项」、大文件「这是什么」、失败/降级诊断、历史趋势、软件页「不能卸载原因 / 卸载计划影响 / 卸载结果」解释。清理完成页与历史批次详情提供「为什么可用空间没变多？」**确定性诊断**（批次仍可恢复 / 已恢复 / 已永久删除、APFS 快照数、隔离区占用与观测差值，选分支由程序完成、不依赖模型）。复核提示词为每行附带程序原因码（`running` / `protected` / `unknown` / `cache-part` / `incomplete-size` / `optional`）与统计；软件卸载完成后的「重新体检并查看残留」按 bundle id（精确）/ 显示名（前缀）过滤「应用残留」并显示可清除的筛选横幅。提示词只拼面板已算好的报告/行/历史数据，经 `sessions.binding(id).session.prompt(..., 'queue')` 注入当前会话，**读不到模型回复**；会话服务缺失或没有打开的会话时降级为复制提示词。面板顶部在 DSH 插件管理报告有兼容新版本时显示「更新插件」，设置页展示当前/可用版本、上次检查与手动「检查更新」，并提供环境信息、联系方式与 GitHub Star 入口 |

### 扫描器与资源（`resources/`，只读）
| 文件 | 职责 |
|---|---|
| `resources/scripts/deepclean.py` | 统一 CLI 入口（`VERSION = 0.5.0`）：平台分发、`--self-test`、`--check-permissions`、`--version` |
| `resources/scripts/scan.py` | macOS 只读扫描（`du`/`plutil`/`statvfs`，7 线程，进度走 stderr `PROGRESS`；图片解码 `sips` 在 `photos.py`）；含微信/企微/QQ 专清聚合（缓存类可清理，企微 Profile 只读）；**残留分档口径**：`classify` 对整容器一律 confirm，`cache_subdirs`/`apply_leftover_cache_split` 把可再生缓存子目录拆成独立 safe 组（`cachePart: true`），原组保持 confirm 并扣减大小；聊天类/系统 App/运行中的残留不拆；低于 1MB 不单列；浏览器缓存带 `running` 进程标记（运行中不可清），报告带 `processSnapshot`（进程快照不可用时浏览器/App 缓存一律 `running:true`、残留不拆，fail-closed）与 `minLeftoverKb`；`estimate` 排除被更具体条目（browsers/devCaches/appCaches/special/leftoverGroups）覆盖的缓存父目录并输出 `confirmKb`；`totalKb` 同时计入可清理的浏览器 / 应用缓存 / 聊天缓存（`browserKb` / `appCacheKb` / `specialKb`），与面板可勾选合计一致（`cleanable=false` 的开发缓存只展示、不计入）；Markdown §九「合计约」用 `estimate.totalKb`（旧报告回退六项和）；大文件用 `find -print0` 流式 top-N 堆（不先截断再排序），prune 掉 `Library/CloudStorage`、`Library/Mobile Documents`、`Library/Mail`、`Library/Messages` 与 `*.photoslibrary` 等包目录，超 180s 预算标记 `truncated`，并输出 `bigFilesTop` |
| `resources/scripts/platforms/windows.py` | Windows 只读扫描（注册表已装程序、缓存与残留、UWP、OneDrive、浏览器缓存多 profile + `running` 标记、大文件；预算 120s；7 项自检）；残留经 `classify_leftover` 分档，**confirm 残留里的缓存子目录同样经 `cache_subdirs`/`apply_leftover_cache_split` 拆成 safe 组**（`cachePart: true`）；`installed_tokens` 同时匹配 DisplayName、Publisher 与厂商容器别名（Kingsoft/WPS/金山、Tencent/腾讯、Huorong/火绒、Sangfor/深信服、Leagsoft/联软），避免中文系统把在用 App 的数据目录误判成残留；产出与 macOS 同契约的 `leftoverGroups`/`cloudStorage`/`browsers`/`estimate`/`processSnapshot`（快照不可用时 fail-closed）；云盘判定用 `under_cloud`（normcase + 目录边界，避免 `OneDriveBackup` 误判）；`estimate` 同样计入可清理的浏览器 / 应用缓存（`browserKb` / `appCacheKb`，Windows 暂无 `special`），并排除 `cleanable=false` 的开发缓存；Markdown §九 合计同样用 `estimate.totalKb` |
| `resources/scripts/photos.py` | 相似照片 dHash 指纹与分组（macOS `sips`；Windows 走 PowerShell 批量解码）；跳过云盘目录/云占位文件与 App 包目录，结果带 `skippedCloud`/`skippedPackages` |
| `resources/scripts/photos-windows.ps1` | Windows `.NET` 指纹 / 缩略图解码，**不依赖 Pillow**；只写显式指定的临时 JPEG |
| `resources/scripts/software-macos.py` / `software-windows.ps1` | 软件实例**只读**清单：macOS 读 App 包 `Info.plist`（符号链接直接跳过；系统 App、运行中、含登录项/系统扩展的包仍列入清单，只标记 `blockReason`（`protected_system` / `application_running` / `process_snapshot_unavailable` / `vendor_uninstaller_required`），不提供卸载动作），Windows 读注册表 Uninstall 键、当前用户 Appx 并定位 `winget.exe`；脚本只查询，**不执行 `UninstallString`**。`lib/software-discovery.js` 的 `parseVendorUninstall` 把注册表里的 `UninstallString` 解析成单个绝对 `.exe` + argv（拒绝 `cmd`/`powershell`/`rundll32` 等解释器、相对路径与 UNC；`msiexec` 走 MSI 分支），执行仍由 `lib/index.js` 的专用入口发起 |
| `resources/scripts/tree.py` | 空间页目录统计：单趟后序遍历产出根清单 + `dirs` 各层缓存播种（≥10MB 子树、上限 500）+ 每层 `bigFiles` 堆（≥1MB，根 top 50 / 子目录 top 20，`bigFilesCap` 随响应返回）；含隐藏项，返回 `partial`/`unavailable`/`skipped`/`skippedCloud`/`cloudFiles`/`sharedFiles`/`sharedDupKb`/`metric`；不跟随链接与 Windows 重解析点；**云盘目录与 App 包目录仍计入大小，但不进 `bigFiles`/`dirs`**（防止被搬家/去重选中）；云盘占位文件先按云占位归类、不算「链接」；同一 inode 的硬链接只计一次大小、只进一条 `bigFiles`（重复项 `dedup:true`）；Windows >260 字符路径用 `\\?\` 访问；云盘/AppData 根预归一化，遍历内不再逐条 `realpath`；云盘根可用 `DEEPCLEAN_CLOUD_ROOTS` 注入 |
| `resources/rules.json` | macOS 分类规则（thresholds / knownNames / denyPaths 等） |
| `resources/images/disk.png` | 首页插画，**只经固定路由** `/dsh-deepclean/assets/disk.png` 暴露 |
| `resources/LICENSE-phosphor.txt` | 内嵌 Phosphor 图标（MIT）许可证 |

### 市场与本地化

| 路径 | 用途 |
|---|---|
| `locale/zh.json` / `locale/en.json` | 插件市场元数据（名称、简介、详情页路径） |
| `assets/icon-180.png` | 插件市场 180×180 图标（`package.json#icon`） |
| `docs/plugin/DETAIL.zh.md` / `DETAIL.en.md` + `shot-*.jpg` | 插件详情页文案与截图：内容与 README 对齐（含同一组徽章），中英各一份，由 `locale/*.json` 的 `meta.detail` 指定；`screenshots.json` 引用这四张图 |
| `docs/market/awesome-entry.yml` | 市场/awesome 条目元数据 |
| `docs/market/index.json` | 自建插件市场索引（format 1）：条目的 `homepage` 指向对应 GitHub README，`versions` 由 `npm run market:index` 从 npm registry 刷新；用 jsDelivr / 任意静态托管加进「发现 → 索引源」 |
| `docs/market/README.md` | 自建索引的使用说明：本地预览、jsDelivr / profile 配置、刷新脚本、条目字段与 DSH 侧行为备忘 |
| `screenshots.json` | 市场截图清单 |

### 开发、测试与验收
| 路径 | 用途 |
|---|---|
| `scripts/preview.mjs` | 隔离预览：`127.0.0.1:4173`，加载真实 `lib/client.js`，宿主 API 全内存 mock，路径虚构在 `/demo`，不碰用户文件；`DEEPCLEAN_PREVIEW_FDA=denied` 预览 FDA 引导卡 |
| `scripts/sync-scanner.sh` | 从 skill 仓库同步 `scan.py` / `deepclean.py` / `platforms/` / `rules.json`（**不含** `photos.py` / `tree.py` / `photos-windows.ps1`） |
| `scripts/update-market-index.mjs` | 从 npm registry 刷新 `docs/market/index.json` 的 versions / `publishTimestamp`（新版本自动补 `engines.dsh`）；`--check` 只校验不改写，`--dry-run` 只打印；`npm run market:index` / `market:index:check` |
| `scripts/acceptance-windows.ps1` | Windows 真机验收（输出 `acceptance-report/`） |
| `tests/` | 20 个 `node:test` 文件：pages / host / clean / file-safety / client / windows-regressions / scanner / cancel / purge-interaction / panel-guard / python-detection / update / windows-python / windows-quarantine / software（执行、核验、HTTP、鉴权、journal、来源发现、Windows 清单脚本）；实际数量与平台跳过项以 `npm test` 输出为准 |
| `tests/photos-regressions.py` | 照片解码与只读回归（由 `tests/scanner.test.mjs` 调用） |
| `tests/macos-scanner-regressions.py` | macOS `big_files` 回归：流式 top-N 无遍历顺序偏置、prune、预算截断（Windows CI 自动跳过） |
| `tests/windows-scanner-regressions.py` | Windows 扫描器纯函数回归：`big_files` 的 mtime/排序/预算截断、`cleanable`/`admin` 过滤（由 `tests/scanner.test.mjs` 调用，macOS 也能跑） |
| `tests/tree-regressions.py` | `tree.py` 回归：dirs 播种、bigFiles 堆上限、partial 传播、硬链接去重、长路径、realpath 次数（由 `tests/scanner.test.mjs` 调用） |
| `tests/fixtures/` | 隔离预览使用的合成数据：`preview-report.mjs`（扫描报告）与 `software-inventory.mjs`（软件清单）；页面测试自带内联夹具，不依赖它们 |
| `docs/windows-acceptance.md` | Windows 真机验收清单 |
| `docs/design/` + `design-qa.md` | 首页/清理页设计稿、截图、视觉验收结论 |
| `docs/copy-terms.md` | 文案术语表（UI 与报告统一用词，改文案先查） |
| `docs/llm-opportunities.md` + `docs/analysis/` | AI 能力边界、代码链路测绘、行业对标与安全评估（改 AI 入口前先读；`docs/analysis/` 已被 `.gitignore` 忽略，公开仓库可能不包含） |
| `docs/review/` | 历次产品评审、P0/P1 修复记录与验收截图（本地材料，已被 `.gitignore` 忽略） |
| `scripts/windows-ci/` + `docs/windows-ci.md` | Windows CI 的用例驱动、扫描器与卷构造脚本 |
| `.github/workflows/tests.yml` | macOS + Windows CI（Node 24 + Python 3.12，只跑 `npm test`） |
| `.github/workflows/windows-acceptance.yml` | Windows 原生验收矩阵：`windows-2022` / `windows-2025` / `windows-11-arm`（Windows 11 Arm64 客户端镜像；无测试卷时显式 SKIP 跨卷用例），详见 `docs/windows-ci.md` |
| `.github/workflows/market-index.yml` | 发版（release published）/ 每日 06:00（Asia/Shanghai）/ 手动触发时用 `scripts/update-market-index.mjs` 刷新 `docs/market/index.json` 并提交（仅该文件变化时） |
| `.github/ISSUE_TEMPLATE/` + `.github/pull_request_template.md` + `SUPPORT.md` / `SECURITY.md` / `CODE_OF_CONDUCT.md` | 反馈与协作渠道：GitHub Issues 问题表单、PR 安全红线/验证清单、支持说明与日志脱敏要求、贡献者行为准则；安全问题走邮件私下报告（coolway.me@gmail.com） |
| `CONTRIBUTING.md` | 面向开发者的环境、目录结构、常用命令、测试与 CI、HTTP API、设计材料、扫描器同步与发布流程；README 只保留用户内容 |

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
| 问 AI 为什么不能卸载 / 让 AI 解释这些影响 / AI 解释这次结果 | 软件页（条目、卸载计划、操作记录） | 脱敏条目元数据（名称/来源/版本/类型/位置/依赖）、`blockReason`、计划 `warnings` 与作用域/估算占用、job 状态/错误码与观测空间变化；**不发送卸载命令与完整路径** |

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
python3 tests/tree-regressions.py                         # tree.py 回归：dirs 播种、bigFiles 堆、partial 传播、硬链接去重、长路径、realpath 次数（改了 tree.py 才需要）
node scripts/preview.mjs                                    # http://127.0.0.1:4173
npm run market:index                                       # 刷新 docs/market/index.json 的版本（--check 只校验）
```

## 安全硬约束（改代码时必须保持）
- 扫描器只读；不删除、不移动用户文件；
- 清理只**移动**，可撤销，不提供自动删除：
  - macOS → `~/.Trash`
  - Windows → `%LOCALAPPDATA%\deepclean-mydisk\trash\<时间戳>`
  - 其他 → `~/.local/share/deepclean-mydisk/trash/<时间戳>`
  - 可用 `DEEPCLEAN_TRASH_DIR` 覆盖；
- 只接受最近 **10 分钟**的扫描结果：体检报告或相似照片结果任一新鲜即可，且只取允许集合（safe 档 + 非 system、非 admin、`cleanable≠false` 的缓存 / 开发缓存 / 浏览器 / 专项可清理项；「需确认」档与 Temp 类被占用目录永不进入）；照片允许集合在**每次照片扫描开始时清空**，只有成功且在 10 分钟内的结果才放行（`photoAllowedIsFresh`），旧照片路径不能借新鲜磁盘报告进入清理；
- 白名单路径在宿主用 `isProtected` **二次校验**（不依赖 UI 勾选）；win32 匹配大小写不敏感并解析 `.` / `..`；命中保护名单的子路径同时保护其祖先（父目录同样拒绝），清理允许集合、报告分档与软件预检共用同一语义；
- **面板 HTTP 路由来源校验**：面板（磁盘）路由必须经 `panelRoute(...)` 注册并先过 `panelRequestRejection`（宿主 `connection.requestRejection` 优先；缺失时回环 Host + `sec-fetch-site` + 自定义头 `x-deepclean-ui: panel`）。software 路由用 `softwareRejection`：同样先问 `connection.requestRejection`，再校验 `x-deepclean-ui: software` / loopback / `sec-fetch-site` / 写操作 token（`x-deepclean-token` + JSON content-type）；update 路由用 `updateRejection`（同样先问 `connection.requestRejection`，再校验 `x-deepclean-ui: update` 与写操作 content-type）。三组路由统一经 `resolveConnection(webCtx)` 解析 connection（模块级注入优先，其次 `webCtx.get('connection')`），避免注入时序不同造成鉴权不对称。不要用裸 `route(...)` 注册新的面板路由；固定资源 `/assets/disk.png` 只返回内置图片、不做来源校验；`/api/thumb` 是唯一允许无自定义头的读路由（`<img>` 不能加头，仍受围栏与登录鉴权约束）；
- 符号链接拒绝：清理逐条 `lstat`、搬家源逐级祖先、搬家目标、tree 浏览均校验；
- 搬家允许集合有两个来源，共享 10 分钟新鲜度：体检报告 `bigFiles`，或 tree 缓存中新鲜目录统计的 `bigFiles`；跨盘搬家必须复制后 **SHA-256 + 大小**双向校验，失败删除临时文件并保留原文件；跨盘搬家协会恢复源文件 atime/mtime（Node 无内置 xattr API，不承诺保留扩展属性；utimes 在 APFS 上会重写 birthtime，回滚身份校验需在 utimes 后重新取身份）；
- **两阶段释放**：清理只移出（可用空间不变）；释放必须走 `/api/quarantine/purge`（按 `batchIds` 或 `all:true` 批量）或 `/api/purge`（单个批次），两者都只在 `purgeMoved` 边界内删除本插件批次条目、并需 UI 二次确认；首页/历史展示隔离区/废纸篓占用；超过 200 项由服务端分片，一次操作可能产生多个批次（`batchIds`）；
- **云盘 / App 数据目录不参与搬家**：`tree.py`/`photos.py` 排除云盘根与包目录，宿主再用 `cloudRoots`/`moveBlockReason` 二次校验；`DEEPCLEAN_CLOUD_ROOTS` 只用于补充/测试；
- 审计日志 `$DSH_HOME/deepclean-audit.log`（`clean` / `move` / `restore` / `purge`），历史 `$DSH_HOME/deepclean-history.json`（最多 100 条）；批次展示最近 20 条及所有仍可恢复批次，恢复/释放操作使用完整索引；`clean` 条目的 `moved[].kb/category` 是新增的审计标注（旧日志可能没有），只用于历史趋势/复清展示，不参与放行；
- **恢复/撤销边界**：`restoreMoved` 只接受「审计记录里、`to` 位于 `trashRoots()` 下的 `deepclean-*` 批次目录、且 realpath 不逃逸」的条目；父目录是符号链接一律拒绝；`/api/undo` 会把已恢复条目从内存批次剔除（避免重试永远报 notfound、撤销入口清不掉）；面板默认只撤销**最近一次清理操作**的批次组（`lastUndoGroup`，分片清理含多批），`/api/undo` 仍接受显式 `batchId`/`batchIds`，可撤销内存队列（最近 20 批）里的更早批次，更早批次也可从历史逐批恢复/释放；本次清理未移动文件时保留上一次可撤销组；默认拒绝覆盖原位置同名文件，只有显式 `onConflict:'rename'` 才另存为「名称 (restored)」；可为审计里的原路径重建缺失父目录，但逐级拒绝符号链接祖先；部分失败必须按 `results[].code` 如实返回，UI 不得报「已恢复」；审计写入失败时 `moveToTrash`/`restoreMoved` 返回 `auditOk:false`，调用方必须提示「历史里可能看不到恢复记录」；
- **残留拆分边界**：只对「未安装、未运行、非系统、非聊天类」容器的 confirm 组拆缓存子目录；拆出的 safe 组才进允许集合，原容器路径仍不进；拆分路径必须 realpath 严格位于容器之下（自命中/符号链接逃逸一律不拆）；Windows 在 `installed_apps()` 为空时 fail-closed；不要放宽成「confirm 整组可清」；
- **软件卸载执行器白名单**：只允许 macOS `.app` 移入废纸篓、Windows MSI（`msiexec /x`）、当前用户 Appx、WinGet 便携包、`brew`/`npm`/`pipx`/`uv` 的官方卸载命令，以及 `parseVendorUninstall` 从注册表 `UninstallString` 解析出的「单个绝对 `.exe` + argv」。解释器（`cmd`/`powershell`/`pwsh`/`rundll32`/`wscript`/`mshta`/`reg`/`explorer` 等）、相对路径、UNC 与整串命令行一律拒绝；计划界面展示完整命令并要求用户核对，执行前用文件戳核对同一文件。**不要**放宽成「执行任意 UninstallString」，也不要直接 `shell:true`；
- **LLM 只做只读解释**：提示词由 `lib/client.js` 用已算好的报告数据拼接，注入当前会话（`queue`）；模型输出不进入允许集合、不触发任何写操作；`disk_report` 只读且不重扫，`disk_audit` 工具体检报告只存 `toolReport`、不参与放行；提示词里的文件名/目录名/App 显示名按不可信数据处理（NFKC、去控制/换行/定向符、单行化、截断、数据边界围栏），完整绝对路径默认不发送；`disk_inspect` 只读且 **fail-closed**（只接受最近一次报告——面板报告或 `disk_audit` 的 `toolReport`——覆盖的路径或 `itemId`，`toolReport` 只用于定位、不参与放行；输出路径脱敏、顶层文件名单行化、`bundleId` 白名单校验后才查 Spotlight），lstat/readdir 不跟随符号链接、不写文件；不要给模型新增写工具或把 `prompt` 结果用于放行判断；
- ❌ 不引入注册表清理、后台常驻扫描、恐吓式提示。

## 常见陷阱
- **没有构建步骤**：`lib/client.js` 是手写 bundle（CSS 内联在 `<style>` 字符串、图标是内嵌 SVG data URI）。不要引入 JSX / 打包器 / 运行时 CDN。
- 新增静态资源必须同时加宿主**固定路由**（参考 `assets/disk.png`），不要暴露任意文件路径。
- 文件移动、清理和软件执行走 `lib/clean.js` / `lib/index.js`；`lib/software.js` 只写自己的任务记录。软件实例不进入普通清理的 `allowedPaths()`。`lib/client.js` 只调 HTTP API，**不做任何文件写操作**；AI 入口只是往会话里发一段提示词（`session.prompt(..., 'queue')`），不碰文件。
- 修改 `lib/index.js` 或 `lib/client.js` 后**必须重启 DSH**（`link:` 挂载，宿主进程内加载）。
- 扫描是**后台子进程**：`POST /scan` 立即 202，客户端 900ms 轮询 `GET /scan`；进度条按经验时长插值（28s / 45s），不是实测耗时，UI 进度与实际进度可能不同步。
- `/api/report` 的 GET 有副作用：只有 `cached=1` 且已有缓存报告时只读返回；否则（含无缓存的 `cached=1`）都会**启动扫描**并返回 202；客户端已不再调用它，改由 `/api/scan`。
- `/api/tree` 走 `tree.py` + 60s 缓存（2000 条 LRU）；播种时先写子目录、最后写目标，且容量大于单次可播种的 500 层，目标不会被自己的 `dirs` 挤出；命中时刷新 LRU 顺序；子树刷新会同步修正父级缓存行的大小；客户端断开连接会通过 `AbortSignal` 杀掉 `tree.py`（`停止加载`）；错误带稳定 `errorCode`（`tree_missing`/`tree_denied`/`tree_outside`/`tree_symlink`/`tree_timeout`/`tree_failed`）供中英文界面本地化；使用独立子进程句柄，浏览目录**不会**取消正在进行的扫描。
- **插件注册的 web 路由不继承宿主 `/api` 鉴权**：`webServer.register` 注册的路由实测未登录也能访问，也不经过 DSH 的 Host/Origin 围栏，必须走 `panelRoute`；`lib/client.js` 的面板请求统一用 `apiFetch()`（自动补 `x-deepclean-ui: panel`）。software 路由用自己的自定义头 + token，update 路由用 `x-deepclean-ui: update`，但两者都先过 `connection.requestRejection`（经 `resolveConnection` 解析，含 webServer 作用域兜底）。
- **AI 是单向投递**：只能把提示词排入当前会话，读不到模型回复；不要设计依赖模型输出的自动勾选、自动清理或结构化回填。
- **插件更新走 DSH 官方插件管理服务**：宿主 `ctx.inject(['pluginManager'])` 是可选服务，`/api/update-check`、`/api/update` 只封装官方 `listBundles`/`listVersions`/`updateBundle`，不要自己访问 npm registry 或自行修改 profile；`link:` 安装被官方判为 not-updatable 属预期，不要放宽成绕过插件管理直接更新。
- 新增/修改 AI 入口时必须复用 `lib/client.js` 的 `untrustedText` / `safeDisplayPath` / `aiRules`，中英文规则成对修改；不得给模型新增写工具，也不得把 `prompt` 结果用于 `allowedPaths` / `isProtected` / 新鲜度判断。
- 测试按平台跳过：共 **376** 个用例；macOS 跳 4 个 Windows 专用用例（2 个 HTTP 用例 + `software-windows.ps1` 脚本回归 + 注册表官方卸载器解析集成），实测 **372 pass / 4 skip**；Windows 跳 9 个 macOS / 非 Windows 宿主专用用例（3 个 symlink 清理/恢复、1 个跨盘复制链接、tree 拒家目录外、permissions、`--platform windows` 拒绝用例、macOS 扫描器权限降级、history 写入失败回归），按 376 总数应为 **367 pass / 9 skip**（以两端 CI 实测为准）。CI 两端都会跑全量。
- 换行统一 **LF**（`.gitattributes` 的 `* text=auto eol=lf`）：页面测试用源码字符串替换注入视图，CRLF checkout 会让断言失配；不要改该文件或改用会转 CRLF 的克隆配置。

## 已知缺口（改代码前先看，均为代码事实）
1. **已修复**：Windows 报告已对齐 macOS 契约——`leftoverGroups`、`cloudStorage`、`browsers`（Chrome/Edge 多 profile + Firefox cache2，含 running 进程保护）、`estimate`（含 `cacheKb`/`confirmKb`/`overlapKb` 去重）。**残留分档口径**：整容器（含媒体/会议类）一律 confirm；safe 只来自 `cache_subdirs()` 拆出的缓存子目录（`cachePart:true`）。
2. **已修复**：`acceptance-windows.ps1` 改查 `leftoverGroups` / `estimate.cacheKb` 等新契约字段，不再断言 Windows 没有的 `special`。
3. `/api/reveal` 的条件是「家目录外**且**非目录」才拒绝，即家目录外的已存在目录也会被打开，且不检查符号链接（只读操作）。
4. `lib/platform.js:parseTreeOutput` 未被生产代码调用（tree 已改用 `tree.py` 的 JSON），仅 `tests/windows-regressions.test.mjs` 引用；`lib/clean.js:undoBatch` 同样未被生产代码调用（宿主直接调用 `restoreMoved` 并维护内存批次队列），仅 `tests/clean.test.mjs` 引用。
5. Linux：宿主有 `bootMount` / `listVolumes` / `xdg-open` 分支，但 `deepclean.py` 对非 win/darwin 回退 macOS 扫描器，**未验收**；对外口径为「支持 macOS / Windows」。
6. 验收范围：`design-qa.md` 以浅色首页 / 清理页 / 英文窄窗为主，另含空间页与历史页（含 320/1280 宽窗与暗色走查）；Windows 真机、完整暗色主题与无障碍**未验收**；英文模式下权限检查输出等扫描器原文仍为中文（其余动态提示已补齐翻译，术语见 `docs/copy-terms.md`）。
7. **Windows 的 `appCaches` 尚未实现**：`platforms/windows.py` 已预留空数组，宿主/客户端已消费；Windows 端扫描逻辑待补。
8. **永久删除边界**：`purgeMoved` 仅允许删除「本插件移入废纸篓/隔离区」的批次条目，拒绝隔离区外路径与符号链接；不要放宽为任意路径删除。
9. **云盘保护是路径/云占位启发式**：默认覆盖 iCloud Drive、OneDrive、Dropbox、Google Drive；企业自建网盘或自定义同步目录需 `DEEPCLEAN_CLOUD_ROOTS` 补充；不做云客户端 API 调用。
10. **Windows 的卷影副本提示已部分补齐**：永久删除后可用空间可能因 VSS 滞后；「为什么可用空间没变多？」诊断会在 Windows 上说明卷影副本/统计滞后，其余位置仍只对 macOS 提示 APFS 快照。
11. **AI 只有单向投递**：`session.prompt` 只返回是否受理（插件只消费 `ok`），读不到模型正文，所以没有结构化输出、计划回填或自动评测；提示词只带报告摘要（各档前 6 项、大文件前 6 项、复核最多 30 行），问更细的条目用逐项「问 AI」。AI 提示词/能力的取舍见 `docs/llm-opportunities.md`。
12. **Windows 的聊天专项 `special` 未实现**：微信/企业微信/QQ 的 `special` 分类只在 macOS 扫描器生成；Windows 报告没有该数组（`appCaches` 同样仍为空）。
13. **Windows 软件原生卸载未真机验收**：MSI / Appx / WinGet 便携包 / 注册表官方卸载器（`vendor`）分支只有合成输出与 `tests/software-*.test.mjs` 覆盖；`scripts/acceptance-windows.ps1` 与 `.github/workflows/windows-acceptance.yml` 尚无软件用例，Homebrew / pipx 卸载也缺原生临时安装回归（见 [软件卸载实施契约](docs/design/software-uninstall.md) 的「验收记录」）。注册表里指向已不存在文件的 `UninstallString` 会保持 `vendor_uninstaller_required`（本机企业微信就是这种情况），不猜测替代路径。
14. **插件更新只支持 registry 安装**：官方 `updateBundle` 会拒绝 `link:` 本地开发安装与官方/内置包；此时顶部不显示「更新插件」，只有设置页状态。真机验收需装 npm 版本，或使用隔离预览 `?update=available` 验证。
15. **微信/企微/QQ 的 `special` 缓存与 macOS 顶层 `~/Library/Caches/*` 暂无运行中保护**：`special_clean()` 不接收进程快照，通用 `caches` 也没有 `running` 字段（本轮 P1-3 未做，用户确认先跳过）；App 运行中仍可勾选这些缓存。浏览器缓存与 `appCaches` 已有运行中保护。
16. `/api/thumb` 的家目录校验是**词法** `withinHome` + `fs.statSync`（跟随符号链接），家目录内的符号链接可指向家目录外可读图片；只做缩略图读取、仍受 Host/登录围栏（与 #3 同类，只读操作）。

## 独立性与同步
- 本仓库是独立项目，**不依赖** deepclean-mydisk skill 仓库；
- 扫描器是内置副本：`scripts/sync-scanner.sh <skill-repo-path>` 只同步 `scan.py` / `deepclean.py` / `platforms/` / `rules.json`；`photos.py` / `tree.py` / `photos-windows.ps1` 是插件独有，不要覆盖；
- 发布：改 `package.json` version → 更新 `CHANGELOG.md` → commit → `git tag vX.Y.Z` → `gh release create`；release 发布后 `.github/workflows/market-index.yml` 会自动刷新 `docs/market/index.json`（本地可 `npm run market:index`）。

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
