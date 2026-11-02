# deepclean-mydisk-plugin — 项目说明（给后续 Agent）

## 是什么
DSH 插件：原生侧边栏磁盘空间工具（macOS / Windows），只读体检 + 空间可视化 + 相似照片 + 微信/企微/QQ 专清 + 跨盘搬家 + 可撤销清理。
**只移动、不删除**；浏览器端是手写 bundle，**没有构建步骤**。

## 结构

### 宿主（`lib/`）
| 文件 | 职责 |
|---|---|
| `lib/index.js` | host 入口：3 个模型工具 + 23 条 HTTP 路由 + `scan`/`photos`/`move` 三个状态机 + 平台分支 |
| `lib/clean.js` | **唯一移动用户文件的地方**：`moveToTrash` / `restoreMoved` / `undoBatch`、废纸篓路径、审计日志、单批上限 200 |
| `lib/platform.js` | 宿主侧白名单二次校验 `isProtected`（win32 用 `path.win32` 语义）；`parseTreeOutput` 目前只被测试引用 |
| `lib/client.js` | 浏览器端单文件 bundle（`window.__ModuleLoader__.load`，内嵌 CSS / SVG / Phosphor 图标，无构建） |

### 扫描器与资源（`resources/`，只读）
| 文件 | 职责 |
|---|---|
| `resources/scripts/deepclean.py` | 统一 CLI 入口（`VERSION = 0.5.0`）：平台分发、`--self-test`、`--check-permissions`、`--version` |
| `resources/scripts/scan.py` | macOS 只读扫描（`du`/`plutil`/`sips`/`statvfs`，7 线程，进度走 stderr `PROGRESS`）；含微信/企微/QQ 专清聚合（缓存类可清理，企微 Profile 只读） |
| `resources/scripts/platforms/windows.py` | Windows 只读扫描（注册表已装程序、缓存与残留、UWP、OneDrive、大文件；预算 120s；9 项自检） |
| `resources/scripts/photos.py` | 相似照片 dHash 指纹与分组（macOS `sips`；Windows 走 PowerShell 批量解码） |
| `resources/scripts/photos-windows.ps1` | Windows `.NET` 指纹 / 缩略图解码，**不依赖 Pillow**；只写显式指定的临时 JPEG |
| `resources/scripts/tree.py` | 空间页单层目录统计：含隐藏项，返回 `partial`/`unavailable`/`skipped`/`metric`；不跟随链接与 Windows 重解析点 |
| `resources/rules.json` | macOS 分类规则（thresholds / knownNames / denyPaths 等） |
| `resources/images/disk.png` | 首页插画，**只经固定路由** `/dsh-deepclean/assets/disk.png` 暴露 |
| `resources/LICENSE-phosphor.txt` | 内嵌 Phosphor 图标（MIT）许可证 |

### 开发、测试与验收
| 路径 | 用途 |
|---|---|
| `scripts/preview.mjs` | 隔离预览：`127.0.0.1:4173`，加载真实 `lib/client.js`，宿主 API 全内存 mock，路径虚构在 `/demo`，不碰用户文件 |
| `scripts/sync-scanner.sh` | 从 skill 仓库同步 `scan.py` / `deepclean.py` / `platforms/` / `rules.json`（**不含** `photos.py` / `tree.py` / `photos-windows.ps1`） |
| `scripts/acceptance-windows.ps1` | Windows 真机验收（输出 `acceptance-report/`） |
| `tests/` | `node:test` **71** 个用例：pages 42 / host 14 / clean 5 / client 3 / windows-regressions 3 / scanner 2 / cancel 2 |
| `tests/photos-regressions.py` | 照片解码与只读回归（由 `tests/scanner.test.mjs` 调用） |
| `tests/fixtures/preview-report.mjs` | 预览与页面测试共用的合成报告 |
| `docs/windows-acceptance.md` | Windows 真机验收清单 |
| `docs/design/` + `design-qa.md` | 首页/清理页设计稿、截图、视觉验收结论 |
| `.github/workflows/tests.yml` | macOS + Windows CI（Node 24 + Python 3.12，只跑 `npm test`） |

## 常用命令
```bash
npm test                                   # 71 个用例（macOS：69 pass + 2 个 Windows 专用 skip）
node --check lib/index.js lib/client.js lib/clean.js lib/platform.js scripts/preview.mjs
python3 resources/scripts/deepclean.py --self-test          # 扫描器自检
python3 resources/scripts/deepclean.py --check-permissions  # 权限检查
python3 resources/scripts/deepclean.py --version            # deepclean-mydisk 0.5.0
python3 tests/photos-regressions.py                         # 照片解码回归
node scripts/preview.mjs                                    # http://127.0.0.1:4173
```

## 安全硬约束（改代码时必须保持）
- 扫描器只读；不删除、不移动用户文件；
- 清理只**移动**，可撤销，不提供自动删除：
  - macOS → `~/.Trash`
  - Windows → `%LOCALAPPDATA%\deepclean-mydisk\trash\<时间戳>`
  - 其他 → `~/.local/share/deepclean-mydisk/trash/<时间戳>`
  - 可用 `DEEPCLEAN_TRASH_DIR` 覆盖；
- 只接受最近 **10 分钟**的扫描结果：体检报告或相似照片结果任一新鲜即可，且只取允许集合（safe 档 + 非 system 缓存 / 开发缓存 / 浏览器 / 专项可清理项；「需确认」档永不进入）；
- 白名单路径在宿主用 `isProtected` **二次校验**（不依赖 UI 勾选）；win32 匹配大小写不敏感并解析 `.` / `..`；
- 符号链接拒绝：清理逐条 `lstat`、搬家源逐级祖先、搬家目标、tree 浏览均校验；
- 跨盘搬家必须复制后 **SHA-256 + 大小**双向校验，失败删除临时文件并保留原文件；
- 审计日志 `$DSH_HOME/deepclean-audit.log`（`clean` / `move` / `restore`），历史 `$DSH_HOME/deepclean-history.json`（最多 100 条）；批次读取最近 20 条；
- ❌ 不引入注册表清理、后台常驻扫描、恐吓式提示。

## 常见陷阱
- **没有构建步骤**：`lib/client.js` 是手写 bundle（CSS 内联在 `<style>` 字符串、图标是内嵌 SVG data URI）。不要引入 JSX / 打包器 / 运行时 CDN。
- 新增静态资源必须同时加宿主**固定路由**（参考 `assets/disk.png`），不要暴露任意文件路径。
- 写操作只能出现在 `lib/clean.js` 与 `lib/index.js` 的清理/搬家入口；`lib/client.js` 只调 HTTP API，**不做任何文件写操作**。
- 修改 `lib/index.js` 或 `lib/client.js` 后**必须重启 DSH**（`link:` 挂载，宿主进程内加载）。
- 扫描是**后台子进程**：`POST /scan` 立即 202，客户端 900ms 轮询 `GET /scan`；进度条按经验时长插值（28s / 45s），不是实测耗时，UI 进度与实际进度可能不同步。
- `/api/report` 的 GET 有副作用：除 `cached=1` 外都会**启动扫描**并返回 202；客户端已不再调用它，改由 `/api/scan`。
- `/api/tree` 走 `tree.py` + 60s 缓存（100 条 LRU），使用独立子进程句柄，浏览目录**不会**取消正在进行的扫描。
- 测试按平台跳过：macOS 跳 2 个 Windows 专用 HTTP 用例（`tests/host.test.mjs:130`、`:150`）；Windows 预期跳 3 个（tree 拒家目录外、permissions、符号链接）。CI 两端都会跑全量。
- 换行统一 **LF**（`.gitattributes` 的 `* text=auto eol=lf`）：页面测试用源码字符串替换注入视图，CRLF checkout 会让断言失配；不要改该文件或改用会转 CRLF 的克隆配置。

## 已知缺口（改代码前先看，均为代码事实）
1. **Windows 报告字段与消费方不一致**：`platforms/windows.py` 产出 `leftovers` / `cloud`，而宿主 `allowedPaths` 与客户端只读 `leftoverGroups` / `caches` / `devCaches` / `browsers` / `special`。结果：Windows 的「已卸载残留 / UWP / OneDrive」只出现在 Markdown 报告，**不进面板清单、也不进清理允许集合**。
2. `scripts/acceptance-windows.ps1` 检查 `browsers` / `special` 字段存在，但 Windows 报告本就没有 → 真机上必然 2 项假失败（待改脚本或补字段）。
3. Windows 的 `admin: true` 缓存（如 `C:\Windows\Temp`）未被排除，会进入清理允许集合（非管理员执行会失败）。
4. `/api/reveal` 的条件是「家目录外**且**非目录」才拒绝，即家目录外的已存在目录也会被打开，且不检查符号链接（只读操作）。
5. `lib/platform.js:parseTreeOutput` 未被生产代码调用（tree 已改用 `tree.py` 的 JSON），仅 `tests/windows-regressions.test.mjs` 引用。
6. Linux：宿主有 `bootMount` / `listVolumes` / `xdg-open` 分支，但 `deepclean.py` 对非 win/darwin 回退 macOS 扫描器，**未验收**；对外口径为「支持 macOS / Windows」。
7. 验收范围：`design-qa.md` 只覆盖浅色首页 + 清理页 + 英文窄窗口（隔离预览），Windows 真机 / 暗色主题 / 无障碍**未验收**；英文模式下少量动态提示仍有中文残留。
8. **Windows 的 `appCaches` 尚未实现**：`platforms/windows.py` 已预留空数组，宿主/客户端已消费；Windows 端扫描逻辑待补。
9. **永久删除边界**：`purgeMoved` 仅允许删除「本插件移入废纸篓/隔离区」的批次条目，拒绝隔离区外路径与符号链接；不要放宽为任意路径删除。

## 独立性与同步
- 本仓库是独立项目，**不依赖** deepclean-mydisk skill 仓库；
- 扫描器是内置副本：`scripts/sync-scanner.sh <skill-repo-path>` 只同步 `scan.py` / `deepclean.py` / `platforms/` / `rules.json`；`photos.py` / `tree.py` / `photos-windows.ps1` 是插件独有，不要覆盖；
- 发布：改 `package.json` version → 更新 `CHANGELOG.md` → commit → `git tag vX.Y.Z` → `gh release create`。

## 给 Claude Code
- `CLAUDE.md` 通过 `@AGENTS.md` 引用本文，只补充 Claude Code 的工作约定与验证闭环；项目事实以本文为准，改结构/约束时**只改这里**。
- `.claude/settings.json` 是权限设置（allow / ask / deny），`.claude/skills/` 是 `/test`、`/preview`、`/self-check`、`/release` 四个 skills（Claude Code 2.1 起 `.claude/commands/` 已废弃）。
- 改 `.claude/` 等同于改开发流程，提交前要和其他代码一样 review。

## 本地安装（DSH profile）
```bash
dsh plugin --profile desktop add link:/Users/hxl/Documents/deepseek-harness/plugins/deepclean-mydisk-plugin
```
修改 host 或 client 代码后需要重启 DSH。
