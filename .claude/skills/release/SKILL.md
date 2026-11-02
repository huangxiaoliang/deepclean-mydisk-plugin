---
name: release
description: 发布清单：版本号、CHANGELOG、测试、commit/tag 建议；每一步需用户确认，绝不自动 push/tag/release。
disable-model-invocation: true
allowed-tools: Bash(npm test:*), Bash(node --check:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Read
---

# 发布清单

只做检查和清单，**不要**自行 push、tag、`gh release`，也不要自行改版本号。

1. `git status`、`git diff`：工作区干净，没有 `report.md` / `report.json` / `acceptance-report/` / `__pycache__` 等产物。
2. `npm test` 全绿；改过 `lib/` 时先 `node --check`。
3. 版本一致：`package.json` 的 `version` = `CHANGELOG.md` 顶部条目 = `README.md` 顶部「本文档描述 vX.Y.Z」。
4. 给出建议的 commit 信息（`release: vX.Y.Z — 摘要`）和要执行的命令，**等用户确认**。
5. 用户确认后才按 `AGENTS.md`「独立性与同步」执行：`git commit` → `git tag vX.Y.Z` → `gh release create`。
6. 提醒：发布不改变本地安装方式，host/client 改动仍然需要重启 DSH。
