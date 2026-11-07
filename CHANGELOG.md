# deepclean-mydisk 插件变更

## 0.14.1 — 2026-11-07
- 修复（Windows 软件清单）：默认客户端执行策略是 Restricted，`software-windows.ps1` 以 `-File` 启动会被直接拒绝，导致软件页来源全部失败。改为与照片/缩略图一致的 `-EncodedCommand` 执行（不受脚本执行策略或 GPO 影响）
- 修复（Windows 软件清单）：注册表项没有 `InstallLocation` 时位置都是空串，去重逻辑把第一个之后的 66 个程序全部当成同一安装丢掉（WPS Office、Node.js、VC++/.NET 运行时等）。现在只在位置已知时按安装位置去重
- 修复（软件来源）：全局 npm prefix 目录尚未创建时 `npm list --global` 以 ENOENT 退出，被误报为来源失败；现在按「没有全局包」处理，不再显示错误来源
- 安全（鉴权一致性）：`/api/software` 系列路由补上宿主 `connection.requestRejection` 校验，与面板路由一致；此前未登录 cookie 也能取得写接口 token 并调用 plan/execute（自定义头与 loopback 围栏仍保留为第二层）
- 修复（软件页）：桌面来源为 `partial` 时，客户端把所有可读 App 也判为不可操作；现在与后端 `sourceFor()` 一致，可读 App 仍能预览卸载/移出
- 修复（Windows 软件清单）：Appx 优先显示 Start 菜单名称（身份名保留在 `identityName`，搜索仍可命中）；语言/资源包（`IsResourcePackage`）按 `protected_system` 保护，Start 菜单查询失败只降级为来源警告
- 修复（估算口径）：`estimate` 计入可清理的浏览器 / 应用缓存 / 聊天缓存，新增 `browserKb` / `appCacheKb` / `specialKb`，`totalKb` 与面板可勾选合计、`disk_report` 与 AI 摘要保持一致
- 修复（估算口径，Markdown）：扫描器 Markdown「预计可释放」的「合计约」改用 `estimate.totalKb`（此前仍按 safe+cache+dev 三项求和，CLI / `disk_audit` 会少报浏览器、应用、聊天缓存；本机实测少报 1.36 GB），并补浏览器 / 应用 / 聊天缓存分项；旧报告缺 `totalKb` 时回退六项和（macOS 与 Windows 同步）
- 修复（估算口径，开发缓存）：`cleanable=false` 的开发缓存（Xcode Archives / CoreSimulator / Docker vms 等）只展示、不计入 `estimate`，与清理允许集合和面板可勾选合计同口径（扫描器 `estimate_of` 与宿主 `estimateOf` 同步）
- 安全（鉴权一致性）：`/api/update-check`、`/api/update` 也先问宿主 `connection.requestRejection`（此前仅校验自定义头 + 回环 Host，未登录本地进程可读版本信息并触发一次插件更新）；software/update/panel 三组路由统一经 `resolveConnection()` 解析 connection（模块级注入优先，其次 `webCtx.get('connection')`），消除注入时序造成的鉴权不对称
- 修复（界面）：暗色主题下「更新插件」徽标改为深色底（`var(--dc-select)`），此前固定浅色底 + 暗色文字对比度仅 1.87:1、几乎不可读
- 修复（软件空态）：所有来源都读取失败时显示明确告警与来源错误，而不是「没有匹配的软件」
- 测试 335（macOS 332 pass / 3 skip；Windows 按 335 总数应为 326 pass / 9 skip，以 CI 实测为准），新增 Windows 清单编码执行、空位置去重、缺失 npm prefix、软件路由鉴权、partial 可操作、全来源失败、Start 菜单显示名与真实脚本、estimate 新字段与 Markdown 合计/开发缓存过滤、update/software 路由 connection 鉴权与 webCtx 兜底、暗色更新徽标回归

## 0.14.0 — 2026-11-07
- 软件页：清单从按哈希排序改为「可处理项在前、按名称排序；暂不能处理的收进折叠分区并按原因分组」（运行中 / 官方卸载器 / 依赖 / 归属冲突 / 受保护等，组头带计数），预览夹具补充运行中与官方卸载器示例
- AI 辅助（只读）：软件页新增三个解释入口——不可卸载条目「问 AI 为什么不能卸载」、卸载计划「让 AI 解释这些影响」、操作记录「AI 解释这次结果」；提示词只带脱敏条目元数据与程序判定的枚举状态（`blockReason` / `warnings` / job 状态与错误码），不发送卸载命令与完整路径，规则禁止输出命令与绕过程序判定
- 插件更新：面板打开时通过 DSH 官方插件管理服务检查是否存在兼容新版本；有更新时标题「DeepClean MyDisk」右侧显示「更新插件」，确认后由插件管理执行更新并提示重启 DSH；设置页可查看当前/可用版本与上次检查时间并手动「检查更新」。检测结果在宿主内存缓存 6 小时，失败静默；只有正式版、声明 DSH bundle 且与当前 DSH 兼容的版本会被推荐
- 新增两条宿主路由：`GET /api/update-check`、`POST /api/update`（同源 + 回环 + 自定义头校验，更新入口可选依赖 `pluginManager` 服务）；`link:` 本地开发安装会被官方判定为 not-updatable，只显示设置页状态
- 隔离预览新增 `?update=available|none|link|error`、`?dialog=1`、`?view=settings` 三种更新状态与入口预览；新增 `tests/update.test.mjs` 宿主回归与页面渲染/英文文案断言
- 设置页：修正环境信息（平台显示 macOS/Windows、Windows 权限显示不适用、隔离区/废纸篓按平台选词并区分本插件占用）、安全说明措辞与保护名单绝对路径校验；新增「反馈与联系」（邮箱、微信复制、GitHub 仓库、打开仓库页的 Star 入口，不代点 Star）
- 安全（P0）：插件注册的面板 HTTP 路由此前**不受宿主鉴权保护**（实测未登录可读 `/api/overview` 的全部绝对路径、可 POST `/api/clean`）。现在所有面板路由先过 `panelRequestRejection`：优先复用宿主 `connection.requestRejection` 的 Host/Origin 围栏与浏览器登录 cookie，服务缺失时回退回环 Host + `sec-fetch-site` + 自定义头；`/api/thumb` 因 `<img>` 不能加头只做围栏；客户端面板请求统一走 `apiFetch()` 补头
- 修复（估算口径）：`pruneReport` 清理后按剪枝结果复算 `estimate`（连续清理不重扫时 AI 摘要与 `disk_report` 不再用旧数字），扫描时废纸篓总量标 `trashKbStale` 并在展示时注明「扫描时」；扫描器 `estimate` 同步排除被 UI 更具体条目覆盖的缓存父目录（如被 Chrome 条目覆盖的 `~/Library/Caches/Google`），`allowedPaths` 也不再放行这些隐藏父目录；macOS `estimate` 补齐 `confirmKb` 与 `minLeftoverKb`
- 修复（运行中检测 fail-closed）：扫描器报告新增 `processSnapshot`；`pgrep`/`tasklist` 快照失败时浏览器/App 缓存一律按运行中处理、卸载残留不再拆分缓存子目录，面板标注「无法确认运行状态，暂不开放清理」，不再静默放行
- 修复（跨盘搬家）：搬家后恢复源文件 atime/mtime（此前归档文件搬完 mtime 变成当前时刻，按时间筛选全部失真）；Node 无 xattr API，不承诺保留扩展属性。注意 APFS 上 utimes 会重写 birthtime，回滚身份校验已在 utimes 后重新取身份
- 修复（Windows 云盘判定）：`big_files` 与残留候选改走 `under_cloud`（normcase + 目录边界），`OneDriveBackup` 不再被误判为云盘、大小写不一致不再漏判
- 修复（撤销入口）：永久删除单批/分片批次后同时清空 `lastBatch` 与 `lastBatchIds`，宿主 `canUndo=false` 时也主动清空，「撤销上次清理」不再点了 404
- 修复（扫描错误文案）：`POST /api/scan`、`/api/photos/scan` 区分「软件卸载进行中」与「扫描已在进行中」，返回稳定 `errorCode`，客户端中英成对提示去软件页完成核验
- 测试 314（macOS 312 pass / 2 skip；Windows 按 314 总数应为 305 pass / 9 skip，以 CI 实测为准）

## 0.13.1 — 2026-11-07
- 修复（兼容性声明）：`engines.dsh` 与 `@deepseek-ai/dsh-tools` 的 peer 范围补上 0.2.2 预发布分支（`>=0.2.1-rc.5 <0.3.0-0 || >=0.2.2-rc.1 <0.3.0-0`）。此前的单一 0.2.1 分支会让 node-semver **静默排除所有 0.2.2 预发布宿主**，导致插件在 DSH 0.2.2-rc.x 的「插件 → 发现」里被判定为不兼容而隐藏；插件本身在同一宿主上可直接安装并正常运行
- 实测依据：DSH 0.2.2-rc.1 上 `dsh plugin add deepclean-mydisk@0.13.0` 安装成功，宿主加载后 `/dsh-deepclean/api/disk` 与 `/api/overview` 均正常响应，但 semver 判定为不兼容

## 0.13.0 — 2026-11-06
- 空间页改版：环形图换成**潮汐带状图**（按目录占比分带、保留面包屑与下钻、新增范围与可清理提示）；图表与明细共用同一分母
- 空间统计加固（`tree.py`）：单趟后序遍历 + 预归一化根路径；硬链接按 `(dev, ino)` 去重，`bigFiles` 只保留一条并在客户端给出共享说明；云占位在重解析点之前判定；超过 260 字符的 Windows 路径改用 `\\?\` 前缀；新增 `skippedCloud` / `cloudFiles` / `sharedFiles` / `sharedDupKb` / `bigFilesCap` 字段
- 宿主 tree 接口：缓存上限提高到 2000 条，target-last 播种并在命中时做 LRU 回写；子目录刷新回填祖先行；客户端断开时中止子进程；错误统一为 `tree_*` 稳定错误码，非 GET 返回 405
- 客户端：目录错误本地化、每层上限提示、硬链接说明与移动警告、停止取消、刷新期间保留潮汐图挂载、展开尾部标签切换、打开位置错误独立通道、大文件搜索按路径边界过滤
- 历史页：新增**文件流带**（可恢复容量、批次详情、按 batch id 重放 purge / restore）
- Windows 运行时探测：扫描前依次尝试 `py -3` / `python` / `python3`，要求 Python 3.9+；扫描可中止；找不到可用运行时时给出 `python_unavailable` 恢复提示，并可把设置请求发到当前对话
- 预览与文档：预览 mock 补齐新计数；README / DETAIL / AGENTS / CLAUDE / CONTRIBUTING 同步潮汐图与 Windows Python 要求
- 测试 206（macOS 204 pass / 2 skip；Windows 199 pass / 7 skip），新增 Python 探测、Windows Python 兜底、云盘根平台分支与 `tree.py` 回归；开发侧新增 `pnpm-workspace.yaml` 以便 `node --test` 与预览脚本在 Windows + Node 24 下解析 peer 依赖

## 0.12.1 — 2026-11-03
- 修复（Windows 报告/隐私）：`--redact` 改为先脱敏 home 路径再生成 PowerShell 命令，并按 PowerShell 规则转义 `'`（含 `O'Brien` 这类用户名），home 路径与用户名不再泄漏到报告或模型上下文；生成的 `Move-Item` 命令同样转义
- 修复（扫描器）：`--redact` 不再对全文替换主机名（主机名是常见子串时，如 `h`，会打碎正文）；非 Windows 宿主执行 `--platform windows` 改为显式退出 2，并提示跨平台合成扫描入口 `scripts/windows-ci/scanner.py`
- Windows 验收：矩阵新增 `windows-11-arm`（Windows 11 Arm64 客户端镜像）；客户端镜像拿不到测试卷时显式 SKIP 跨卷用例并写入 `summary.md` / `results.json`，两个 Server job 仍必须提供测试卷；2022 / 2025 / Arm64 三个镜像全部通过（Arm64 的 6 个原生用例全跑）
- 文档重构：README 精简为用户向内容；开发环境、目录结构、常用命令、测试与 CI、HTTP API、扫描器同步、发布流程迁入新增 `CONTRIBUTING.md`；新增 `SUPPORT.md` / `SECURITY.md`、Issue 表单与 `config.yml`；`docs/plugin/DETAIL.zh.md` / `DETAIL.en.md` 增加「反馈与支持」节，并修正 DSH 版本范围与 Windows 验收表述
- 打包：npm 包纳入 `SUPPORT.md` / `SECURITY.md`（`npm pack` 28 个文件）
- 测试 181（macOS 179 pass / 2 skip；Windows 174 pass / 7 skip），新增 Windows 隔离区归属、云盘 / OneDrive 根保护、PowerShell 引号与脱敏、缓存规格等回归

## 0.12.0 — 2026-11-03
- 模型工具：4 个工具描述改为英文并补齐使用边界；新增只读 `disk_report`（读面板最近报告，不重扫）；`disk_audit` 删除 `json` 参数、默认脱敏、输出去掉「建议命令」节并附 `itemId`；`disk_inspect` 标注报告来源/过期/组首路径；扫描器表格单元格单行化防注入
- `disk_audit` 的工具体检报告单独保存为 `toolReport`，只供 `disk_inspect`，绝不进入清理允许集合
- AI 提示词：去掉「删除/搬家」措辞，补「无写权限/报告过期/无 disk_inspect」规则，报告与复核行补 `itemId`，围栏防伪，平台术语按平台选词
- 市场元数据：`locale/en.json` / `locale/zh.json`、180×180 图标、`docs/plugin/DETAIL.en.md` / `DETAIL.zh.md`、`screenshots.json`、`docs/market/awesome-entry.yml`；`package.json` 升 0.12.0，补 `engines.dsh` 并放宽 peer 范围
- P1 安全修复：Windows 浏览器扫描初始化进程快照；运行中缓存的父/子路径统一拒绝清理；普通 AppData / Application Support 数据目录仅统计、不允许移动
- P1 恢复与释放修复：逐级拒绝恢复目标祖先链接；所有待恢复批次保留历史入口，完整索引用于恢复/释放；审计轮转保留活跃批次恢复依据；清理完成页永久删除新增第二次确认，分片批次一并处理
- **未知残留 / 长尾解释增强**：提示词新增只读证据包（容器归属、bundle id、是否已安装、运行状态、扫描完整性、报告时间等，全部来自已算好的报告，零额外读盘）；清理页展开详情新增「AI 证据」预览（显示「AI 会看到哪些脱敏证据」）；未收录应用残留的按钮改为「解释这一项」
- **失败 / 降级诊断**：清理/恢复/撤销有失败项或审计写失败时出现「AI 解释这次失败」；macOS 未授权时权限卡新增「问 AI 为什么扫不到」；扫描失败/被时间预算截断时新增「AI 解释这次失败 / 为什么结果不完整」；提示词只带错误码、计数与脱敏原因，不重新执行任何操作
- **AI 输入安全与隐私**：提示词中的文件名/目录名/App 显示名按不可信数据处理（NFKC、去控制字符/换行/定向符、单行化、截断、数据边界围栏）；完整绝对路径默认不发送（`~ + 顶层目录 + … + basename`）；`disk_inspect` 改为 `itemId` 解析 + 报告外路径 fail-closed，输出路径脱敏、`top` 文件名单行化、`bundleId` 白名单校验后再查 Spotlight
- AI 只读解释入口：首页「让 AI 解读这次体检」、清理页逐项「问 AI」、清理前「复核这 n 项」、历史「让 AI 分析趋势」、大文件「这是什么」（客户端拼接提示词注入当前会话，可降级为复制提示词）
- 新增只读模型工具 `disk_inspect`（类型/大小/文件数/修改时间/报告分档/对应 App 是否安装），并给未收录的应用残留加「未收录」标记
- 历史页新增「趋势与复清」：可用空间趋势、累计清理量、清了又长回来的条目；清理审计新增 `moved[].kb/category` 标注（旧日志无此字段，仅用于展示、不参与放行）
- AI 提示词口径修正：补「按分类合计」「各档合计与未列出条目汇总」「范围说明（报告不等于整盘占用）」，去掉与条目风险档冲突的 `estimate.safeKb` 措辞，并禁止把扫描器 advice 里的命令文本带进提示词
- 已卸载残留细粒度拆分：`scan.py` / `platforms/windows.py` 在 confirm 残留容器里识别可再生缓存子目录（Caches/tmp/Code Cache/GPUCache 等，深度 ≤4、不跟随链接），拆成独立 safe 组（`cachePart: true`，客户端显示「App · 缓存」），原组保持 confirm 并扣减大小；聊天类 / 系统 App / 运行中的残留不拆，小于 1 MB 不单列
- 开发缓存影响文案细分：pnpm store 与 npm 一样标注「安装依赖时可能重新下载」；electron-builder / node-gyp / next-swc / CocoaPods / SwiftPM / DeviceSupport 各自标注重新下载时机；条目级「问 AI」可调用只读 `disk_inspect` 补充文件数/修改时间
- 测试 177（macOS 175 pass / 2 skip）

## 0.11.0
- 在用 App 缓存清理：扫描器新增 `appCaches`（仅 Caches/tmp/Code Cache/GPUCache 等可再生目录，跳过聊天容器与个人目录，运行中 App 不进入允许集合）；清理页新增「应用缓存」分类，向导推荐项包含可清理的 App 缓存
- 真实释放估算：新增 `POST /api/reclaim`，区分逻辑大小与分配大小（`st_blocks`），统计 APFS 本地快照；清理/向导确认框显示「预计实际释放 X（逻辑 Y）」，完成后显示「可用空间 A → B（+C）」
- 废纸篓闭环：新增 `purgeMoved` 与 `POST /api/purge`，历史页与向导完成页支持「永久删除本批次」（行内二次确认，仅限本插件移入隔离区的条目，拒绝符号链接/隔离区外路径），并写 `purge` 审计
- 安全文案更新为「默认只移动…永久删除需二次确认」
- Windows：报告契约补 `appCaches` 字段（扫描逻辑待实现）
- 测试 92（90 pass / 2 skip）

## 0.10.1
- 修复 Windows CI：页面测试通过精确源码片段注入视图，在 CRLF checkout 下失配；读取源码时归一化换行，并新增 `.gitattributes` 统一文本文件为 LF。

## 0.10.0
- 重做首页与清理页：顶部导航、实时容量条（可用大字 + 总容量 · 已用 + 比例条）、7 个内容分类、风险筛选、固定操作条和清理前确认。
- 重做空间分析：范围与完整性提示、隐藏项统计、统一图表/列表占比、其他汇总、面包屑、更多结果、联动和键盘入口。
- 大文件补齐完整扫描入口、空状态、搜索/大小/类型/修改时间筛选、目录联动和切页状态保留。
- 搬家新增只读目标文件夹浏览、容量预检、明确确认与完成反馈；恢复后台任务进度，拒绝过期、受保护与链接文件。
- 修复 Windows 保护名单的子目录/大小写/分隔符匹配，以及空间树将字节误当 KB 的问题。
- Windows 照片指纹和缩略图改用内置 PowerShell/.NET 解码；批量计算、不增加第三方依赖，全部解码失败会明确报错。
- 清理统计排除受保护与只读项，处理通用缓存与专项缓存的路径重叠；完成提示按实际移动结果统计。
- 修正扫描待统计与过期交互、搜索输入焦点、清理后反馈和窄窗口英文布局。
- 新增本机隔离预览、页面回归测试和固定插画资源路由；测试从 55 增至 71。

## 0.9.0
- 打开面板即显示磁盘容量：宿主在 `/api/overview` 直接 `statfs` 返回实时快照（`disk` 字段），首页展示「已用 / 总量 / 可用」+ 环形图，无需先扫描
- 新增轻量 `GET /api/disk`（只读一次 statfs）供面板每 60 秒 / 回到前台时刷新，避免与扫描轮询抢状态
- 标题栏常驻「共 X · 已用 Y」；清理后立刻回显；无快照时回退到扫描报告的 `disk`
- 没有体检结果时可安全清理估算显示「—」，不再显示 0B；无扫描时文案改为提示统计可清理项
- 补中英翻译（实时 / Used / Total / Free）与环形图中心的「已用」文案
- 新增 5 个测试（宿主实时容量、打开即显示、回退路径），测试总数 55

## 0.8.2
- CI 稳定性：取消测试在「扫描已提前完成」时接受已完成状态（v0.8.1 tag 的 CI 为红）
- 新增 Windows 真机验收文档 `docs/windows-acceptance.md` 与 PowerShell 一键脚本
- 50 个测试通过；当前最新 tag 对应绿色 CI

## 0.8.1
- 修复扫描/照片「取消」不生效：改用进程组/taskkill 终止整个子进程树（原本只杀包装进程，扫描继续跑）
- 空间目录树 API 增加 60 秒缓存（首次仍较慢，重复进入秒开）
- 新增取消回归测试；测试总数 50

## 0.8.0
- 信息架构：5 个一级入口；大文件/相似照片改为子页
- 首页单 CTA + 体检向导（推荐 → 确认 → 释放 → 撤销）
- 清理页分区总览 + 全选/清空/阈值选择 + 分类安全提示
- 大文件：目标磁盘选择、空间对比、打开目标文件夹
- 相似照片：保留策略、文件夹筛选、并排对比
- 测试 48 个；CI macOS + Windows

## 0.7.2
- 中英 i18n（设置页切换，含扫描器文案模式翻译）
- 安全沟通：首屏安全卡、逐项「为什么/删了怎样/怎么恢复」、确认框恢复说明、设置页安全说明

## 0.7.1
- 跨 Tab 选中大小修正；清理页过期提示
- 撤销状态持久化（挂载读 /state）；照片页撤销入口
- 空间搬家：后台任务、逐文件进度、取消、完成后重扫
- Windows 复制命令修正；侧边栏徽标稳定文案

## 0.7.0
- 相似照片：dHash 分组 + 缩略图 + 批量移入废纸篓（默认保留最大一张）
- 空间搬家：大文件跨盘移动，复制后 SHA-256 校验，失败保留原文件
- 侧边栏状态徽标：显示可用空间
- 扫描器与 skill 0.5.0 同步

## 0.6.0
- 微信/企业微信/QQ 专清：按类型聚合（缓存/聊天缓存/图片/视频/语音/文件/表情）
- 只有「缓存」类进入一键清理；聊天缓存与聊天文件只读
- 清理页新增「微信/QQ」Tab

## 0.5.0
- 空间可视化：目录树 API + 环形图钻取
- 大文件/旧文件页：时间/类型筛选、Finder 定位
- 浏览器缓存细分（仅 Caches）
- 开发缓存专项（Xcode/Docker/CocoaPods/SwiftPM 等，高风险只读）
- 智能体检：扫描后自动选中推荐项

## 0.4.x
- 首页 Dashboard、后台扫描 + 进度插值 + 取消
- 列表排序/搜索/风险徽章/展开详情
- 清理后自动重扫；历史/恢复中心（跨重启）
- 白名单/保护名单

## 0.3.0
- 一键清理（移到废纸篓）+ 撤销 + 审计日志
- 白名单拦截、符号链接拒绝、过期报告保护

## 0.2.0
- 原生侧边栏页面（client 插件），四分类清单、清理、复制命令

## 0.1.0
- 3 个模型工具：disk_audit / disk_check_permissions / disk_self_test
