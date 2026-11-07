# CLAUDE.md

> Claude Code 项目入口。项目结构、命令、安全约束、已知缺口以 `AGENTS.md` 为准，本文直接引用；这里只补 Claude Code 专用的工作约定和最容易踩的坑。
>
> 自定义斜杠命令以 **skills** 形式放在 `.claude/skills/`（Claude Code 2.1 起 `.claude/commands/` 已标记废弃），所以 `/test`、`/preview`、`/self-check`、`/release` 都在 `.claude/skills/` 下。

@AGENTS.md

## 先读什么

- 改代码前：`AGENTS.md` 的「结构」「常见陷阱」「已知缺口」三节。
- 改界面：`README.md`「界面结构」+ `docs/design/README.md` + `design-qa.md`（视觉验收覆盖浅色首页、清理页、空间页与历史页；含 320/1280 窄宽窗与暗色走查，但完整暗色主题、Windows 真机与无障碍仍未验收）。
- 改扫描器：`resources/scripts/deepclean.py`（统一入口）、`scan.py`（macOS）、`platforms/windows.py`（Windows）。
- 改软件页 / 卸载：`AGENTS.md`「结构」+ `lib/software*.js` + `resources/scripts/software-*`，动手前先读 [软件卸载实施契约](docs/design/software-uninstall.md)。
- 改 AI 入口：`AGENTS.md`「AI 辅助清理」+ `docs/llm-opportunities.md`，重点看提示词安全与「读不到模型回复」的单向投递约束。

## 验证闭环（每次改动后按顺序执行）

```bash
node --check lib/index.js lib/client.js lib/clean.js lib/platform.js scripts/preview.mjs
npm test
python3 resources/scripts/deepclean.py --self-test    # 动了 resources/scripts/** 才需要
python3 tests/photos-regressions.py                   # 动了 photos.py / photos-windows.ps1 才需要
python3 tests/macos-scanner-regressions.py            # 动了 scan.py 的 big_files 才需要
python3 tests/windows-scanner-regressions.py          # 动了 platforms/windows.py 才需要
python3 tests/tree-regressions.py                     # 动了 tree.py 才需要
```

- 只改 `.md` 不用跑测试。
- macOS 上 `npm test` 是 **340 用例 / 337 pass / 3 skip**；3 个 skip 是 Windows 专用用例（`tests/host.test.mjs` 的 Windows tree / thumbnail 与 `software-windows.ps1` 脚本回归），属于预期，不要删改断言来「修绿」；Windows 上按 340 总数应为 **331 pass / 9 skip**（跳过 9 个 macOS / 非 Windows 宿主专用用例，以 Windows CI 实测为准）。
- 改 `lib/client.js` 的界面后，用 `node scripts/preview.mjs`（127.0.0.1:4173，宿主 API 全 mock、路径虚构在 `/demo`）人工确认；预览不碰真实磁盘。
- 提交前 `git diff` 自查：不能包含 `report.md` / `report.json` / `acceptance-report/` / `__pycache__` 等产物。

## 安全红线（与 AGENTS.md 一致，不可协商）

- 扫描器只读；清理只**移动**、可撤销、不自动删除。废纸篓：macOS `~/.Trash`；Windows `%LOCALAPPDATA%\deepclean-mydisk\trash\<时间戳>`；其他 `~/.local/share/deepclean-mydisk/trash/<时间戳>`；可用 `DEEPCLEAN_TRASH_DIR` 覆盖。
- 只接受最近 **10 分钟**的扫描结果；「需确认」档永不进入清理允许集合。
- 白名单在宿主用 `isProtected` **二次校验**（不依赖 UI 勾选）；win32 大小写不敏感并解析 `.` / `..`；命中保护名单的子路径同时保护其祖先。
- 软件卸载独立授权：软件实例不进入普通清理的 `allowedPaths()`，真实卸载/移出从 `lib/index.js` 发起，任务记录只写 `$DSH_HOME/deepclean-software-jobs.json`。
- 符号链接一律拒绝：清理逐条 `lstat`、搬家源逐级祖先、搬家目标、tree 浏览。
- 跨盘搬家必须复制后 **SHA-256 + 大小**双向校验；失败删除临时文件并保留原文件。搬家允许集合：10 分钟内的体检 `bigFiles` 或目录统计 `bigFiles`。
- 写用户文件的代码只允许出现在 `lib/clean.js` 与 `lib/index.js` 的清理/搬家入口；`lib/client.js` 只调 HTTP API，不做任何文件写操作。
- 不要为了跑通缩短新鲜度、放宽白名单、跳过 symlink 校验、改单批 200 上限或审计日志格式（`$DSH_HOME/deepclean-audit.log` / `deepclean-history.json`）。
- 不引入注册表清理、后台常驻扫描、恐吓式提示。

## 开发边界

- **没有构建步骤**：`lib/client.js` 是手写 bundle（`window.__ModuleLoader__.load`，CSS 内联在 `<style>` 字符串、图标是内嵌 SVG data URI）。不要引入 JSX、打包器、运行时 CDN，也不要找 `npm run build`（不存在）。
- 不新增运行时依赖（`dependencies` 为空，`peerDependencies` 只有 `@deepseek-ai/dsh-tools`）。
- 新增静态资源 = 同步新增宿主固定路由（参考 `/dsh-deepclean/assets/disk.png`），不要暴露任意文件路径。
- 改 `lib/index.js` / `lib/client.js` 后必须提醒用户**重启 DSH**（`link:` 挂载，宿主进程内加载）。
- 扫描器是内置副本：`scripts/sync-scanner.sh <skill-repo>` 只同步 `scan.py` / `deepclean.py` / `platforms/` / `rules.json`；`photos.py` / `tree.py` / `photos-windows.ps1` 是插件独有，不要覆盖。
- 报告字段是扫描器 → 宿主 → 客户端的三方契约：改 `leftoverGroups` / `caches` / `devCaches` / `browsers` / `appCaches` / `special` 要同时改 `platforms/windows.py`、`lib/index.js` 的 `allowedPaths`、`lib/client.js` 和 `tests/`；`special` 目前仅 macOS 产出，Windows 的 `appCaches` 仍为空数组。

## AI 辅助（只读）改动约定

- AI 入口全部在 `lib/client.js`（`aiReportPrompt` / `aiItemPrompt` / `aiReviewPrompt` / `aiInspectPrompt` / `aiFailurePrompt` / `aiHistoryPrompt` / `aiSoftwarePrompt`）；数据只来自面板已算好的报告、行集合与历史，宿主侧只读工具 `disk_report` / `disk_inspect` 读取同一份内存报告。
- 提示词必须复用 `untrustedText`（NFKC、去控制字符/换行/定向符、围栏防伪）与 `safeDisplayPath`（默认不发完整绝对路径）；中英文 `aiRules` 成对修改。
- 不得给模型新增写工具、自动勾选或自动执行；模型输出不得进入 `allowedPaths` / `isProtected` / 新鲜度判断。当前实现读不到模型回复（`session.prompt` 只消费 `ok`），不要假设有结构化返回通道。
- `disk_audit` 的工具体检报告只存 `toolReport`，只供 `disk_inspect`；`disk_report` 只读面板最近报告、不重扫。
- 改 AI 文案或提示词后跑 `npm test`，并用 `node scripts/preview.mjs` 检查入口、降级复制提示词与「AI 证据」预览；用户可见的能力变化要同步 `README.md` 和 `docs/plugin/DETAIL.zh.md` / `DETAIL.en.md`。

## Claude Code 工作约定

- 用中文回复；代码、标识符、提交信息用英文。UI 文案以中文为源语言、英文在 `lib/client.js` 的 `EN` 映射表里，改文案要成对补。
- 未经用户明确同意，不做：`git push`、`git tag`、`gh release`、改 `package.json` 的 version、`rm`、移动仓库外文件。
- 提交信息沿用现有风格：`fix(ci): ...`、`feat(clean): ...`、`docs: ...`、`release: vX.Y.Z — 摘要`。
- `.claude/settings.json` 已把 `rm`、`sudo`、`diskutil`、`npm publish` 等设为禁止，把 `git push/tag`、`gh`、`mv`/`cp`、`git commit` 等设为需确认；不要改 settings 绕过限制，确实需要时先问用户。
- 长时间任务（预览服务器、Windows 验收、全盘扫描）放后台执行，结束时清理进程。
- 遇到「已知缺口」先读代码确认现状再改；修好后同步更新 `AGENTS.md` 对应条目，并补回归测试。
- 测试用户文件相关功能时用 `tests/fixtures/`、临时 `HOME`、`DEEPCLEAN_TRASH_DIR` 指向临时目录，不要动真实废纸篓。

## 斜杠命令（`.claude/skills/`）

- `/test`：跑完整测试套件并汇总失败原因，可带测试文件路径只跑单文件。
- `/preview`：后台起隔离预览，人工验收界面。
- `/self-check`：扫描器自检 + 宿主/前端语法检查 + 版本信息。
- `/release`：发布清单，逐项确认，不会自动 push/tag。
