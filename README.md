# deepclean-mydisk

> 仓库：https://github.com/huangxiaoliang/deepclean-mydisk-plugin
> 安装：`dsh plugin --profile desktop add github:huangxiaoliang/deepclean-mydisk-plugin`（或本地 `file:/绝对路径`）
> 测试：`npm test`（17 个用例；GitHub Actions 矩阵 macOS + Windows）

DSH 插件：只读磁盘体检（macOS / Windows），提供**原生侧边栏页面** + 3 个模型工具。

## v0.8.0 信息架构重构

- 一级导航合并为 5 个：**体检 / 空间 / 清理 / 历史 / 设置**；大文件、相似照片改为子页；
- 首页单 CTA「开始体检」+ **体检向导**：推荐清单（默认勾选推荐项）→ 二次确认 → 已释放 + 撤销；
- 清理页：**分区总览卡**（项数/大小，点击切换）+ 全选/清空/按大小阈值批量选择 + 每类安全提示；
- 大文件：目标磁盘下拉（含可用空间）、空间对比与不足警告、完成后打开目标文件夹；
- 相似照片：保留策略（最大/最新/路径最浅）、文件夹筛选、并排对比弹层；
- 新增 48 个自动化测试（含 7 个页面 × 中英 × 有数据渲染），GitHub Actions 双平台。

## v0.7.2 国际化与安全沟通

- 中英双语：设置页可切换 中文 / English（持久化到 localStorage）；主界面、按钮、Tab、提示、确认框均翻译。
- 扫描器文案：常见 why/advice/分类通过模式翻译（未覆盖的专有名词保留原文）。
- 安全沟通：
  - 首次打开显示安全说明卡（只移动不删除、可恢复、保护规则）；
  - 每项展开显示「为什么在这里 / 删了会怎样 / 怎么恢复」；
  - 清理/照片/搬家确认框明确写出「移到废纸篓，可在历史恢复；不会永久删除」；
  - 设置页新增安全说明四条。

## v0.7.1 修复

- 跨 Tab 勾选的「已选 N 项 · 大小」改为全量统计（之前只算当前 Tab）
- 清理页显示"扫描结果超过 10 分钟"警告，避免点击后才发现过期
- 面板重新打开时从 `/api/state` 恢复"撤销上次清理"
- 相似照片页新增「撤销照片清理」按钮
- 空间搬家改为后台任务：逐文件进度、可取消、完成后自动重扫
- 复制命令按平台生成（Windows 用 `Move-Item`，macOS 用 `mv`）
- 侧边栏徽标改回稳定文案（避免动态重注册闪烁）

## v0.7 功能

- **相似照片**：sips + dHash 扫描 Pictures/Downloads/Desktop/Documents，按汉明距离分组，缩略图对比；
  默认保留每组最大一张，其余可移到废纸篓（可撤销，最多 600 张/次）。
- **空间搬家**：大文件页勾选 → 填目标目录（可外接盘）→ 跨盘复制 + SHA-256 校验后删除原文件；
  同盘直接 rename；目标空间不足/校验失败自动保留原文件。
- **状态徽标**：侧边栏入口显示可用空间（`DeepClean MyDisk · 100G`），每分钟刷新。
- 扫描器与 skill 0.5.0 同步。

## v0.6 功能

- **微信 / 企业微信 / QQ 专清**：按 App 与类型（缓存/聊天缓存/图片/视频/语音/文件/表情）聚合大小；
  - 只读展示全部类型；
  - **仅「缓存」可勾选清理**（CEF、Wedoc、WeMail、TencentMeeting 等）；
  - 「聊天缓存」与聊天文件默认锁定（删除后可能无法恢复），需人工确认。
- 清理页新增「微信/QQ」Tab；一键清理同样走废纸篓 + 可撤销 + 白名单保护。

## v0.5 功能

- **空间可视化**：懒加载目录树 + 可点击钻取的环形图（`GET /api/tree?path=`），只允许浏览家目录；
- **大文件 / 旧文件**：大小、修改时间、类型筛选、排序；复制路径 / 在 Finder 中显示（只读）；
- **浏览器缓存细分**：Chrome / Edge / Firefox / Safari / Arc（只统计 Caches，不碰书签/密码/历史）；
- **开发缓存专项**：Xcode DerivedData/DeviceSupport/Archives、CoreSimulator、Docker、CocoaPods、SwiftPM、npm/pnpm、Maven、Codex 等；高风险的标记「需确认」且不进入一键清理；
- **智能体检**：扫描后自动选中推荐项（安全档 + 可再生缓存/开发缓存），核对后一键清理。

## v0.4 功能

- 首页 Dashboard：磁盘环形图、可用/总量、可回收估算、历史趋势、快捷扫描；
- 扫描后台化：进度条 + 阶段 + 取消（`POST /api/scan`、`GET /api/scan`、`POST /api/scan/cancel`）；
- 列表增强：大小/名称排序、搜索、风险徽章（安全/需确认/系统/保护）、行内展开详情；
- 清理后自动重扫 + 历史和恢复中心（跨重启从审计日志恢复批次）；
- 白名单/保护名单：勾选「加入保护」或设置页添加，白名单路径永不清理；
- 保留：一键清理（移到废纸篓/隔离区，可撤销）、复制命令、权限检查。

## 功能

- **侧边栏「磁盘体检」**：三档清单（可安全清理 / 需确认 / 缓存与开发缓存 / 不要动）、每项详情、可回收估算、快速/完整扫描、权限检查；勾选后可**一键清理**（移到废纸篓/隔离区，可撤销，写审计日志）或复制命令。
- **模型工具**：`disk_check_permissions`、`disk_audit`、`disk_self_test`（只读）。
- **HTTP API**：
  - `GET /dsh-deepclean/api/permissions` → `{ code, text }`
  - `GET /dsh-deepclean/api/report?quick=1|full=1` → `{ report, at }`
  - `POST /dsh-deepclean/api/clean` `{ paths }` → 移入废纸篓/隔离区
  - `POST /dsh-deepclean/api/undo` `{ batchId? }` → 撤销上一批
  - `GET /dsh-deepclean/api/state` → `{ canUndo, lastBatchId }`
- 扫描器内置于 `resources/`，与 `deepclean-mydisk` skill v0.4.4 同源；本机需要 `python3`（Windows 为 `py -3`）。

## 安全边界

- 扫描与查询接口只读；一键清理只**移动**（移到废纸篓/隔离区），不永久删除。
- 清理只接受最近一次扫描（10 分钟内）允许列表里的路径：可安全清理档 + 用户勾选的缓存/开发缓存；「需确认」档永不接受。
- 符号链接一律拒绝；目标名冲突自动加序号，不覆盖；撤销只回滚仍存在且原位置为空的条目。
- 清理/撤销写入 `$DSH_HOME/deepclean-audit.log`。

## 安装（本地开发）

包名/显示名：`deepclean-mydisk` / **DeepClean MyDisk**。

```bash
dsh plugin --profile desktop add file:/absolute/path/to/dsh-plugin-deepclean
# 然后重启 DSH
```

## 配置

- `dsh.bundle.patch`：`./cordis.patch.yml`，插入 `deepclean-mydisk` 条目。
- `dsh.client`：`platform: web`，导出 `./client`（手写 `window.__ModuleLoader__.load` bundle，无构建步骤）。
- peer：`@deepseek-ai/dsh-tools@0.2.1-rc.5`。

## 已知限制

- 扫描在宿主进程内同步执行（快速版约 20–30s），UI 期间显示「扫描中」。
- 侧边栏页面在 Web GUI 与桌面端共用；Windows 真机尚待验收。
- 撤销批次保存在内存里，DSH 重启后不可撤销（废纸篓里的文件仍在，可手动恢复）。
