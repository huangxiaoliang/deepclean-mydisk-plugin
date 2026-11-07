# deepclean-mydisk

DSH 插件：macOS / Windows 原生侧边栏磁盘工具。**扫描只读，清理只移动**——文件先移入废纸篓（macOS）或隔离区（Windows），可撤销；永久删除必须二次确认，且只限本插件移入的批次。提供实时容量、空间可视化、相似照片、跨盘移动、恢复中心，以及只读的 AI 体检解读、条目解释、清理前复核与失败诊断。

DeepClean MyDisk is a DSH plugin for macOS and Windows. It audits disk usage read-only, then moves the files you select to the Trash or a quarantine folder with undo. Cleanup is two-stage: moving files does not free space until you permanently delete a batch after a second confirmation.

- 仓库：[huangxiaoliang/deepclean-mydisk-plugin](https://github.com/huangxiaoliang/deepclean-mydisk-plugin)
- 安装：`dsh plugin --profile <name> add deepclean-mydisk`（npm）；也可 `add github:huangxiaoliang/deepclean-mydisk-plugin` 或本地 `link:/绝对路径`
- 反馈：[GitHub Issues](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/issues/new/choose) · 安全问题按 [SECURITY.md](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/SECURITY.md) 私下发邮件
- 插件详情：[中文](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/docs/plugin/DETAIL.zh.md) · [English](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/docs/plugin/DETAIL.en.md) · [更新日志](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/CHANGELOG.md)

## 安装

### DSH 安装

```bash
# 从 npm 安装（推荐；预构建，无构建步骤）
dsh plugin --profile <name> add deepclean-mydisk

# 或从 GitHub 安装
dsh plugin --profile <name> add github:huangxiaoliang/deepclean-mydisk-plugin

# 或在本地开发目录安装（改动即时映射）
dsh plugin --profile <name> add link:/绝对路径/deepclean-mydisk-plugin
```

安装或修改 host / client 代码后**需要重启 DSH**。

### 平台依赖

- macOS：系统自带 `python3`（扫描器依赖 `du` / `plutil` / `sips`）；
- Windows：需要 Python 3.9 或更新版本。插件依次尝试 `py -3`、`python`、`python3`；能运行其中一个即可。照片解码使用 PowerShell `.NET`，**不需要 Pillow**；
- 找不到可用的 Python 时，点击「让 DSH 帮我安装 Python」，把设置请求发送到当前对话。DSH 会先检查是否已有兼容版本，再请你确认所需的安装或设置。没有打开的对话时，可以复制提示词。设置完成后重启 DSH，再重试扫描。
- 支持 macOS / Windows；Linux 宿主有分支但**未验收**。

### 权限

- macOS 需要「完全磁盘访问」才能读到全部受保护路径；设置页「权限检查」可查看状态。磁盘体检需要先获得该权限。
- Windows 无「完全磁盘访问」概念，只报告当前是管理员还是普通用户；清理部分系统目录需要管理员权限。

## 界面结构

| 入口 | 内容 |
|---|---|
| 体检（首页） | 实时容量、开始体检 / 查看清理建议、AI 解读、扫描选项、体检向导、最近一次整理 |
| 清理 | 垃圾清理（全部项目 + 7 个内容分类，风险分档、搜索排序、逐项「问 AI」与清理前复核）与相似照片 |
| 空间 | 目录分布（潮汐带状图 + 面包屑 + 下钻）与大文件（筛选 + 移动 + 「这是什么」） |
| 软件 | 桌面应用与终端工具清单、卸载预览、执行与核验 |
| 历史 | 软件操作记录、趋势与复清、隔离区/废纸篓占用与永久删除、扫描历史、可恢复批次、AI 趋势分析 |
| 设置 | 安全说明、中英切换、保护名单、权限检查、环境信息 |

## 功能

### 体检

- 打开面板即显示实时容量，**不需要先跑体检**；首次扫描前「建议处理」显示「—」而不是 0。
- 支持快速扫描与完整扫描；结果分为**推荐清理 / 可选清理 / 需确认 / 受保护**四档。
- 体检向导：推荐清单 → 二次确认 → 显示已移出 → 撤销 / 清理历史 / 完成。
- 扫描失败、结果过期、无数据、无推荐项分别提示，不会把空结果当成功。

### 软件

点击「软件 → 扫描软件」，按名称、包名或安装环境查找。确认计划前可以查看安装位置、影响和恢复方式。软件卸载结束后可重新体检，在「应用残留」中逐项查看。

- macOS 可以移出符合条件的独立 App 本体，并从「历史」恢复移出的文件。
- 终端工具支持 Homebrew、npm 全局、pipx 和 uv tool 的适用安装实例。共享依赖、运行时和来源不明确的项目会显示处理原因。
- Windows 通过系统接口处理适用的 MSI、当前用户 Appx 和能确认归属的 WinGet 便携包。其他桌面软件可打开系统应用管理。Windows 原生卸载仍待真机验收。
- 系统或包管理器卸载通常需要重新安装才能恢复。卸载计划显示数据保留限制。残留另行确认。

### 清理

- 7 个内容分类：开发缓存、浏览器缓存、应用缓存、应用残留、聊天软件缓存、其他缓存、系统缓存。
- 已卸载残留中的可再生缓存子目录会单独拆出为可清理项，其余数据保持「需确认」；聊天/系统/运行中的 App 不拆。
- 支持名称/路径搜索、按大小或名称排序、风险筛选、跨分类勾选、三态全选与「选择推荐项」。
- 受保护与只读项不可勾选，也不计入「预计可释放」；「需确认」项不会被自动勾选。
- 清理必须二次确认；**移入废纸篓/隔离区不会立即释放空间**，永久删除本批次后才真正释放。
- 单次超过 200 项时服务端自动分片，每片独立批次、统一撤销；结果超过 10 分钟会过期并禁用清理。

### 空间

- 目录分布以家目录为范围（含隐藏项），潮汐带状图与明细表共用分母，长尾归入「其他」；支持下钻、面包屑、显示更多与重新统计。
- 大文件视图支持全局（完整扫描）与目录联动，可按名称/路径搜索，按大小或未修改天数排序，按修改时间/类型/大小筛选。
- 明细行可跳到清理页查看该路径的可清理项；移动完成后自动重新统计当前目录。

### 相似照片

- 基于 dHash 指纹分组，扫描 Pictures / Downloads / Desktop / Documents，最多 600 张、最小 200 KB；云盘目录与照片图库会被跳过。
- 保留策略：最大 / 最新 / 路径最浅；支持文件夹筛选、分组缩略图与并排对比。
- 批量移入废纸篓，可在历史中撤销。

### 跨盘移动

- 大文件可移动到其他磁盘；目标盘显示可用空间并做容量预检，浏览目标目录只读、**不创建目录**。
- **云盘文件与 App 数据目录不允许移动**（照片图库、Mail、Messages、应用容器、商店应用数据）。
- 同盘直接改名；跨盘复制后做 **SHA-256 + 大小**双向校验，失败删除临时文件并保留原文件。
- 后台任务、逐文件进度与取消；**移动不可撤销，原位置不再保留文件**。

### 历史与恢复

- 扫描历史：时间、可用空间、可回收、耗时。
- 清理批次：时间、项数、可恢复项数；「恢复此批次」从审计日志把文件移回原位置（跨重启可用）。
- 永久删除本批次或全部批次需二次确认，只允许本插件移入的条目，拒绝符号链接与隔离区外路径。
- 审计日志在 `$DSH_HOME/deepclean-audit.log`，历史在 `$DSH_HOME/deepclean-history.json`。

### AI 辅助（只读解释）

- 入口：体检解读、逐项「问 AI / 解释这一项」、清理前「复核这 n 项」、大文件「这是什么」、失败/降级诊断、历史趋势分析。
- 只把面板已经算好的脱敏数据拼成提示词注入当前 DSH 会话；AI 不参与扫描、分档、允许集合或任何写操作。
- 插件读不到模型回复，不会根据回答自动勾选或执行；没有可用会话时降级为复制提示词。
- 提示词与工具输出默认不含完整绝对路径；清理判断仍以面板分档与二次确认为准。

### 保护名单与双语

- 设置页可添加/移除绝对路径；保护名单路径永远不进清理允许集合，子目录同样受保护，宿主会二次校验。
- 中英双语（中文为源语言）、跟随系统暗色主题、窄窗口适配；无运行时 CDN、无外部字体。

## 安全边界

- 扫描与查询接口只读；清理与移动默认只**移动**，不自动永久删除；永久删除仅限本插件移入的批次，且需二次确认。
- 只接受最近 **10 分钟**的结果；「需确认」项、运行中的缓存与系统项永不进入清理允许集合。
- 保护名单、符号链接、云盘文件与 App 数据目录在宿主二次校验，无法通过 UI 绕过。
- 单批最多 200 项；超过由服务端分片，每片独立批次。
- 清理、移动、恢复、永久删除都会写入审计日志；重名自动加序号，不覆盖。

## 已知限制

- 云盘保护基于路径与 Windows 云占位属性识别（iCloud Drive / OneDrive / Dropbox / Google Drive）；企业自建网盘或自定义同步目录需通过 `DEEPCLEAN_CLOUD_ROOTS` 补充。
- Windows 暂未提供 VSS / 回收站占用提示：永久删除后可用空间可能因卷影副本短暂滞后。
- **Windows 的聊天软件专项分类仅 macOS 提供**；Windows 的应用缓存扫描也尚未实现（报告字段已预留）。
- Windows 需要管理员权限的目录（如 `C:\Windows\Temp`），非管理员执行时清理会失败。
- 真实释放估算有 8 秒预算：超大目录可能被截断，最终以清理前后可用空间差为准。
- Linux 未验收；英文模式下少量扫描器生成的文本仍是中文。
- 撤销只针对本会话内存中的批次；跨重启恢复请用历史页的「恢复此批次」。
- 相似照片范围固定为四个目录、最多 600 张、最小 200 KB；HEIC/WebP 等格式受系统解码能力限制，云盘目录与照片图库会被跳过。
- 残留细粒度拆分只认目录名像缓存的子目录（Caches/tmp/Code Cache/GPUCache/CacheStorage 等）；缓存目录用了别的名字或 App 仍在运行时，整组仍留在「需确认」。
- AI 入口依赖当前 DSH 会话与模型；没有打开的会话时只能复制提示词，提示词带的是报告摘要而不是完整报告，模型也可能答错。
- 如果 Windows 提示找不到 Python，在 PowerShell 运行 `py -3 --version`、`python --version` 或 `python3 --version`。如果都无法显示可用版本，请安装 Python 3 并确保命令在 `PATH` 中，然后重启 DSH。

## 反馈与支持

- **Bug / 使用问题 / 功能建议**：请开 [GitHub Issue](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/issues/new/choose)（推荐用问题模板）。
- **安全问题**（越权删除、路径逃逸、恢复失败、隐私泄露等）：不要公开提 Issue，请发邮件到 **coolway.me@gmail.com**，详见 [SECURITY.md](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/SECURITY.md)。
- **提交前**：升级或改过插件后先重启 DSH；权限检查未授权时先授权再重试。
- **请附上**：插件版本、DSH 版本、系统版本、出问题的功能、错误码/失败阶段、复现步骤、已脱敏的日志或截图。
- **不要贴**：完整磁盘路径、用户名、文件名、聊天记录或未脱敏的审计日志原文；用 `~/…`、`%LOCALAPPDATA%\…` 代替。
- 详细支持说明见 [SUPPORT.md](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/SUPPORT.md)。

## 开发与测试

开发环境、目录结构、常用命令、测试与 CI、HTTP API、隔离预览与扫描器同步见 [CONTRIBUTING.md](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/CONTRIBUTING.md)；Windows 验收见 [docs/windows-ci.md](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/docs/windows-ci.md) 与 [docs/windows-acceptance.md](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/docs/windows-acceptance.md)。

## 许可证

MIT
