# deepclean-mydisk

DSH 插件：macOS / Windows 原生侧边栏磁盘空间工具。**只读体检、只移动不删除** —— 扫描只读，清理只把文件移到废纸篓/隔离区并可撤销；提供实时容量、空间可视化、相似照片、跨盘搬家与恢复中心。

> 仓库：https://github.com/huangxiaoliang/deepclean-mydisk-plugin
> 安装：`dsh plugin --profile desktop add github:huangxiaoliang/deepclean-mydisk-plugin`（或本地 `link:/绝对路径`）
> 测试：`npm test`（71 个用例；GitHub Actions 矩阵 macOS + Windows）
> Windows 真机验收：`docs/windows-acceptance.md` + `scripts/acceptance-windows.ps1`
> 视觉验收：[design-qa.md](design-qa.md)

> 本文档描述 v0.10.1；更早版本见文末「版本历史」。

## 打开面板即显示

- **可用空间**大字 + **总容量 · 已用** + 已用比例条，数据来自宿主 `statfs` 实时快照（毫秒级、只读），**不需要先跑体检**；
- 每 60 秒、窗口重新获得焦点时经轻量 `GET /api/disk` 刷新；无实时快照时回退到最近一次扫描报告的容量，再没有才显示「正在读取磁盘信息…」；
- 首次扫描前「建议处理」显示「—」而不是 0，避免误导；
- 顶部导航常驻，5 个一级入口：**体检 / 空间 / 清理 / 历史 / 设置**。

## 界面结构

| 一级入口 | 内容 |
|---|---|
| 体检（首页） | 实时容量、开始体检 / 查看清理建议、扫描选项（快速 / 完整 / 权限检查）、扫描进度与取消、体检向导（推荐 → 确认 → 已释放 → 撤销）、最近一次整理 |
| 空间 | 两个视图：**目录分布**（环形图 + 面包屑 + 明细）与 **大文件**（筛选 + 搬家） |
| 清理 | 两个视图：**垃圾清理**（7 个内容分类 + 风险筛选 + 选择 + 清理）与 **相似照片**（分组 + 对比 + 去重） |
| 历史 | 扫描历史（最近 15 条）+ 可恢复的清理批次 |
| 设置 | 安全说明、中英切换、保护名单、权限检查、环境信息 |

## 功能

### 体检（首页）

- 单按钮二态：未扫描 →「开始体检」（打开向导并快速扫描）；已有新鲜结果 →「查看清理建议」（跳到清理页并选中推荐项）；
- 「扫描选项」展开快速扫描 / 完整扫描 / 权限检查；扫描中显示进度条、阶段、耗时与取消；
- **体检向导**：扫描完成列出推荐清单（默认勾选推荐项）→ 二次确认 → 显示「已移入废纸篓 X」→ 撤销 / 清理历史 / 完成；
- 扫描失败、过期、无数据、无推荐项分别有独立文案，不会把空结果当成功；
- 「最近一次整理」显示时间与项数，可直接跳到历史页恢复。

### 清理

- 按 **8 个内容分类**浏览：全部项目 / 开发缓存 / 浏览器缓存 / 应用残留 / **应用缓存（在用 App）** / 聊天软件缓存 / 其他缓存 / 系统缓存，每类显示容量；扫描中或没有报告时显示「待统计」；
- **应用缓存**只来自已安装 App 容器内的可再生目录（Caches/tmp/Code Cache/GPUCache 等），跳过微信/企微/QQ 与个人目录；运行中的 App 标记需确认、不进入清理允许集合；
- **风险标签独立**：推荐处理 / 可选处理 / 需确认 / 受保护；受保护（白名单）与只读项不显示复选框，不能选中，也不计入「建议处理」；
- 支持名称/路径**搜索**、按大小或名称**排序**、风险**筛选**、跨分类勾选、表头三态全选、「选择推荐项」；
- 行内**详情**展开：处理影响 / 怎么恢复 / 完整路径；同时提供复制命令、加入保护、撤销上次清理；
- 清理必须**二次确认**（确认区支持 Esc 关闭并聚焦）；确认框显示**预计实际释放**（逻辑大小 vs 分配大小，含 APFS 本地快照提示），清理后显示可用空间变化；
- 过期、扫描中、结果为空、扫描失败是四个独立状态：结果超过 10 分钟界面会实时翻成「过期」并禁用清理，只允许查看与重新扫描；
- 口径提示贯穿页面：**移入废纸篓不会立即增加可用空间**，「建议处理」只统计实际可移动的项目（排除受保护、只读、系统项与重叠缓存）。

### 空间

- 目录分布：统计范围限定家目录、含隐藏项；显示统计时间、无法读取项与跳过链接数；环形图与明细表共用同一分母，长尾 ≥7 项归入「其他」；支持点击下钻、面包屑、显示更多、重新统计（绕过 60 秒缓存）、「查看此目录的大文件」；
- 大文件：≥300 MB、结果数量有限；支持名称/路径搜索、大小或未修改天数排序、修改时间 / 类型 / 最小大小筛选、目录联动；过期或受保护项禁选；
- 空状态区分「还没扫描」「体检未覆盖大文件」「没有符合筛选条件」「没有发现大文件」。

### 相似照片

- dHash 指纹分组（汉明距离 ≤6），扫描 Pictures / Downloads / Desktop / Documents，最多 600 张、最小 200 KB；
- 保留策略：最大 / 最新 / 路径最浅；文件夹筛选；每组缩略图 + 并排对比弹层选择保留项；
- 默认勾选每组除首张外的照片，批量移入废纸篓，可撤销；移入记录与垃圾清理共用宿主接口。

### 跨盘搬家

- 大文件勾选后选择目标磁盘（含每盘可用空间）与子文件夹，目标浏览只读、**不创建目录**；
- 确认前读取目标实际可用容量并做 95% 预检，不足时禁用确认；
- 同盘直接改名；跨盘复制后做 **SHA-256 + 大小**双向校验，失败删除临时文件并保留原文件；
- 后台任务 + 逐文件进度 + 取消；完成后可打开目标位置。**搬家不属于废纸篓恢复记录**，原位置不再保留文件。

### 历史与恢复

- 扫描历史：时间、可用空间、可回收、耗时；
- 清理批次：时间、项数、可恢复项数，「恢复此批次」从审计日志把文件移回原位置（跨重启可用）；
- **永久删除本批次**：行内二次确认后删除废纸篓/隔离区里的该批次，写 `purge` 审计；只允许本插件移入的条目，拒绝符号链接与隔离区外路径；
- 审计日志 `$DSH_HOME/deepclean-audit.log`，历史 `$DSH_HOME/deepclean-history.json`。

### 保护名单

- 设置页添加/移除绝对路径；白名单路径永远不进清理允许集合，宿主会二次校验（不只依赖 UI）；
- 支持前缀包含（子目录同样受保护），Windows 大小写不敏感并解析 `.` / `..`。

### 双语与适配

- 中英双语：中文为源语言，英文查字典；扫描器产出的建议文案按模式规则翻译；语言选择持久化在 `localStorage['deepclean-lang']`；
- 窄窗口（≤1100px、≤760px）由 CSS 断点处理：760px 以下「处理影响」列收起、风险徽章移到文件名下方；
- 跟随系统暗色主题；`prefers-reduced-motion` 下关闭过渡；无运行时 CDN、无外部字体。

## 安装

### DSH 安装

```bash
# 从 GitHub 安装
dsh plugin --profile desktop add github:huangxiaoliang/deepclean-mydisk-plugin

# 或在本地开发目录安装（改动即时映射）
dsh plugin --profile desktop add link:/绝对路径/deepclean-mydisk-plugin
```

安装或修改 host / client 代码后**需要重启 DSH**。

### 平台依赖

- macOS：系统自带 `python3`（扫描器依赖 `du` / `plutil` / `sips`）；
- Windows：`py -3`（或 `python`），扫描器与照片解码为纯 Python + PowerShell `.NET`，**不需要 Pillow**；
- 支持 macOS / Windows；Linux 宿主有分支但**未验收**。

### 权限

- macOS 需要「完全磁盘访问」才能读到全部受保护路径；设置页「权限检查」可查看状态，未授权时不会进行任何扫描；
- Windows 无「完全磁盘访问」概念，只报告当前是管理员还是普通用户；清理部分系统目录需要管理员权限。

## 本地预览（不需要 DSH）

```bash
node scripts/preview.mjs
# http://127.0.0.1:4173   端口可用 DEEPCLEAN_PREVIEW_PORT 覆盖
```

- 加载**真实的 `lib/client.js`**，无构建、无安装（react 从 `node_modules` 内联）；
- 宿主 API 全部是**内存实现**，所有路径虚构在 `/demo`，清理 / 恢复 / 搬家只改预览内存；
- `?data=1` 带扫描结果打开；`?data=1&expired=1` 演示过期状态；
- 只监听 127.0.0.1，不读取、不修改任何用户文件。

## 开发

### 目录结构

```
lib/index.js         host 插件：3 个模型工具、23 条 HTTP 路由、扫描/照片/搬家状态机
lib/clean.js         唯一移动用户文件的模块（废纸篓/隔离区、撤销、审计日志）
lib/platform.js      宿主白名单二次校验（跨平台路径语义）
lib/client.js        浏览器端单文件 bundle（手写，无构建；内嵌 CSS/图标）
resources/scripts/   只读扫描器：deepclean.py 入口、scan.py、platforms/windows.py、
                     photos.py、photos-windows.ps1、tree.py
resources/rules.json macOS 分类规则
resources/images/    首页插画（只经宿主固定路由暴露）
scripts/             隔离预览、扫描器同步、Windows 验收
tests/               node:test 71 个用例 + 照片解码回归
docs/                Windows 验收清单、设计稿与视觉验收
```

### 常用命令

```bash
npm test                                                   # 71 个用例
node --check lib/index.js lib/client.js lib/clean.js lib/platform.js scripts/preview.mjs
python3 resources/scripts/deepclean.py --self-test         # 扫描器自检
python3 resources/scripts/deepclean.py --check-permissions # 权限检查
python3 tests/photos-regressions.py                        # 照片解码与只读回归
node scripts/preview.mjs                                   # 隔离预览
```

### 测试与 CI

- `npm test`（`node --test`）共 **71** 个用例：pages 42 / host 14 / clean 5 / client 3 / windows-regressions 3 / scanner 2 / cancel 2；
- 平台专用用例会跳过：macOS 跳过 2 个 Windows 专用 HTTP 用例，Windows 预期跳过 3 个 macOS 用例；
- CI（`.github/workflows/tests.yml`）在 macOS + Windows 上跑 Node 24 + Python 3.12，只执行 `npm test`；
- 页面测试是 SSR 渲染（`renderToString`），不是浏览器 E2E；真实交互请用隔离预览人工验收。

### 设计材料

- `docs/design/`：设计原图、最终截图、并排对照、英文窄窗口截图（说明见 [docs/design/README.md](docs/design/README.md)）；
- `design-qa.md`：视觉验收结论（浅色首页 + 清理页 + 英文窄窗口，隔离预览范围，`final result: passed`）；
- `docs/design/space-implementation.md`：空间页实现记录与边界。

## HTTP API

宿主注册 25 条路由，全部挂在 `/dsh-deepclean` 下；客户端使用其中 20 条。无鉴权，依赖 DSH webServer 自身边界；请求体上限 1 MB。下表按用途列出（`/api/scan` 的 GET / POST 分两行列）。

**只读**

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/assets/disk.png` | 固定首页插画，不暴露任意路径 |
| GET | `/api/permissions` | `{ code, text }`，每次调用启动一次扫描器权限检查（30s 超时） |
| GET | `/api/overview` | `{ at, report, disk, scan, history(最近 30), cleanBatches, whitelist, platform }` |
| GET | `/api/disk` | 实时 `statfs` 容量快照 |
| GET | `/api/scan` | `{ scan, report, at }` 扫描状态 |
| GET | `/api/volumes` | 卷列表与各自容量 |
| GET | `/api/tree?path=&refresh=1` | 单层目录统计（含隐藏项、部分统计、跳过链接计数） |
| GET | `/api/destination?path=` | 只读目标文件夹浏览 + 容量预检，不创建目录 |
| GET | `/api/photos` | 照片扫描状态与分组结果 |
| GET | `/api/thumb?path=&size=` | 缩略图 JPEG（size 限制 64–320） |
| GET | `/api/state` | `{ at, canUndo, lastBatchId, scan }` |
| GET | `/api/history` | `{ scans, cleans }` |
| GET | `/api/report?cached=1` | 有缓存时返回 `{ report, at }`；**不带 `cached=1` 会启动扫描并返回 202** |

**控制 / 写操作**

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/scan` | `{ full }` 后台启动扫描，202 / 409 |
| POST | `/api/scan/cancel` | 取消扫描并终止子进程树 |
| POST | `/api/photos/scan` | 启动照片扫描，202 / 409 |
| POST | `/api/photos/cancel` | 取消照片扫描 |
| POST | `/api/clean` | `{ paths }` 移入废纸篓/隔离区，返回 `{ batchId, moved, results }` |
| POST | `/api/undo` | `{ batchId? }` 撤销本会话批次 |
| POST | `/api/restore` | `{ batchId }` 从审计日志恢复历史批次 |
| POST | `/api/purge` | `{ batchId? }` 永久删除隔离区中的批次（二次确认后调用） |
| POST | `/api/reclaim` | `{ paths }` 估算逻辑/分配大小、文件数与 APFS 快照数 |
| POST | `/api/move` | `{ paths, destination }` 后台搬家，202 |
| POST | `/api/move/cancel` | 取消搬家 |
| POST | `/api/reveal` | 在 Finder / 资源管理器中打开位置 |
| GET/PUT/POST | `/api/whitelist` | 读取或保存保护名单 |

**模型工具（只读）**：`disk_check_permissions`、`disk_audit`（支持 `quick` / `redact` / `platform` / `json`）、`disk_self_test`。

## 安全边界

- 扫描与查询接口只读；清理与搬家默认只**移动**，不自动永久删除；仅用户二次确认后可永久删除本插件移入隔离区的清理批次；
- 清理只接受最近 **10 分钟**的结果：体检报告或相似照片结果任一新鲜即可，且只取允许集合（safe 档 + 非 system 缓存 / 开发缓存 / 浏览器 / 专项可清理项），「需确认」档永不进入；
- 白名单路径在宿主用 `isProtected` **二次校验**，无法通过 UI 绕过；符号链接在清理、搬家源、搬家目标、目录浏览处均被拒绝；
- 跨盘搬家复制后做 SHA-256 + 大小校验，失败保留原文件；单批最多 200 项；
- 打开位置只针对家目录内文件或已存在的目录；缩略图只读家目录内的图片文件；
- 清理、搬家、恢复、永久删除写入审计日志；重名自动加序号，不覆盖。

## 已知限制

- **Windows 部分分类尚未接入面板**：已卸载应用残留、UWP 商店数据、OneDrive 云盘目前只出现在只读扫描的 Markdown 报告里，面板清单与清理允许集合尚未覆盖；
- **Windows 应用缓存尚未扫描**：报告已预留 `appCaches` 字段，Windows 端暂为空数组；macOS 已接入；
- 真实释放估算有 8 秒预算：超大目录可能被截断（界面不区分，按逻辑大小兜底），最终以清理前后可用空间差为准；
- Windows 需要管理员权限的目录（如 `C:\Windows\Temp`）会进入清理尝试，非管理员执行时该项失败；
- Windows 真机验收待执行；`scripts/acceptance-windows.ps1` 中有 2 项检查与 Windows 报告字段不一致，会误报失败；
- Linux 未验收（宿主有分支，扫描器会回退 macOS 实现）；
- 暗色主题、完整无障碍与真实宿主重启后的最终视觉**未验收**；`design-qa.md` 的 passed 仅限浅色首页/清理页/英文窄窗口的隔离预览；
- 英文模式下少量动态提示仍有中文残留；
- 扫描是后台子进程，进度条按经验时长插值（快速 28s / 完整 45s），长任务时进度可能滞后；扫描不提供字节级进度；
- `tree.py` 在 macOS 按分配占用、Windows 按逻辑大小统计，跨平台不可直接比较，也不等于整盘已用容量；
- 撤销只针对本会话内存中的批次；跨重启恢复请用历史页的「恢复此批次」；
- 相似照片扫描范围固定为四个目录、最多 600 张、最小 200 KB；HEIC/WebP 等格式受系统解码能力限制；
- 依赖本机 Python 3（Windows `py -3`）；缺失时扫描与权限检查不可用。

## 版本历史

### v0.11.0 — 应用缓存、真实释放估算、废纸篓闭环

- 清理页新增「应用缓存」分类（在用 App 的 Caches/tmp/Code Cache 等；跳过聊天与个人目录，运行中不可选）；
- 清理确认显示「预计实际释放（逻辑 vs 分配）」，完成后显示可用空间变化；新增 APFS 快照提示；
- 历史页/向导支持「永久删除本批次」（二次确认，仅限隔离区内的本插件批次）；
- Windows 报告契约补 `appCaches`（待实现扫描）；测试 92。

### v0.10.1 — CI 修复

- 页面测试读取源码时归一化换行（Windows CRLF checkout 不再失配）；新增 `.gitattributes` 统一文本文件为 LF。

### v0.10.0 — 首页与清理页改版、空间重做

- 重做首页与清理页：顶部导航、实时容量条（可用大字 + 总容量 · 已用 + 比例条）、7 内容分类、风险筛选、固定操作条、清理前确认；
- 重做空间分析：范围与完整性提示、隐藏项统计、统一图表/列表分母与「其他」汇总、面包屑、更多结果、目录联动、60 秒缓存与重新统计；
- 大文件筛选（搜索 / 大小 / 类型 / 修改时间 / 目录联动）与四种空状态；搬家只读目标浏览、容量预检、确认绑定；
- 相似照片：Windows 改用内置 PowerShell/.NET 解码（免 Pillow），失败明确报错；
- 新增 `lib/platform.js`（宿主白名单二次校验）、`resources/scripts/tree.py`（取代内联 `du`/PowerShell 统计）、`scripts/preview.mjs`（隔离预览）、固定插画资源路由；
- 修复 Windows 保护名单的子目录 / 大小写 / 分隔符匹配，以及空间树把字节误当 KB 的问题；
- 测试从 55 增至 71（含页面渲染、过期/保护禁选、Windows 路径与树单位、照片解码回归）。

### v0.9.0 — 打开即显示磁盘容量

- 宿主在 `/api/overview` 直接 `statfs` 返回实时容量，新增轻量 `GET /api/disk` 供每 60 秒 / 回到前台刷新；
- 无需扫描即可看到已用 / 总量 / 可用；无快照时回退扫描报告，估算缺失显示「—」。

### v0.8.x

- v0.8.0：信息架构重构（5 个一级入口、单 CTA + 体检向导、清理页概览与批量选择、大文件目标盘选择、相似照片保留策略）；
- v0.8.1：取消扫描修复（终止整个子进程树）、空间目录树 60 秒缓存；
- v0.8.2：CI 稳定性修复、Windows 真机验收文档与 PowerShell 脚本。

### v0.7.x

- v0.7.0：相似照片（dHash 分组 + 缩略图 + 批量移入废纸篓）、空间搬家（复制 + SHA-256 校验）、侧边栏徽标；
- v0.7.1：跨 Tab 选中统计、过期提示、撤销状态恢复、搬家后台任务与逐文件进度；
- v0.7.2：中英双语（含扫描器文案模式翻译）、首次安全说明、逐项「为什么 / 删了怎样 / 怎么恢复」。

### v0.6 / v0.5 / v0.4

- v0.6：微信 / 企业微信 / QQ 专清（仅缓存可勾选，聊天缓存默认锁定）；
- v0.5：空间可视化（懒加载目录树 + 可下钻环形图）、大文件 / 旧文件、浏览器缓存细分、开发缓存专项、智能体检；
- v0.4：首页 Dashboard、扫描后台化与取消、列表排序搜索与风险徽章、白名单、清理历史与恢复。

## 独立项目

本目录是独立 Git 仓库，不依赖 `deepclean-mydisk` skill 仓库，也不依赖 `default-workspace`：扫描器内置于 `resources/`（`scan.py` / `deepclean.py` / `platforms/` / `rules.json` 可选用 `scripts/sync-scanner.sh` 从 skill 同步，`photos.py` / `tree.py` / `photos-windows.ps1` 为本插件独有），并自带许可证、测试、CI、Windows 验收文档与发布流程。

## 许可证

MIT
