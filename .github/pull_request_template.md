## 变更说明

<!-- 说明改了什么、为什么改。涉及用户可见行为时，写清前后差异。 -->

## 变更类型

- [ ] fix（修复缺陷）
- [ ] feat（新增功能）
- [ ] docs（文档）
- [ ] refactor / test / chore（不改变行为的整理）
- [ ] release（版本发布）

## 安全红线自查

涉及清理、恢复、搬家、允许集合、鉴权或审计日志时请逐项确认；不涉及可标注「N/A」。

- [ ] 扫描器仍然只读，没有新增删除或修改用户文件的操作
- [ ] 清理仍然只**移动**、可撤销，没有新增自动删除；永久删除仍走 `/api/quarantine/purge`
- [ ] 允许集合仍要求「最近 10 分钟」的新鲜度；「需确认」档与 Temp 类未被放宽
- [ ] 宿主 `isProtected` 二次校验、符号链接拒绝与云盘/App 目录保护未被削弱
- [ ] 面板路由仍经 `panelRoute` 做来源校验，没有新增裸 `route(...)`
- [ ] 没有给模型新增写工具；AI 输出未进入 `allowedPaths` / `isProtected` / 新鲜度判断

## 验证

- [ ] `npm test`（结果：）
- [ ] `node --check lib/index.js lib/client.js lib/clean.js lib/platform.js scripts/preview.mjs`（改 JS 时）
- [ ] `python3 resources/scripts/deepclean.py --self-test`（改扫描器时）
- [ ] 对应回归脚本（`tests/photos-regressions.py` / `tests/macos-scanner-regressions.py` / `tests/windows-scanner-regressions.py` / `tests/tree-regressions.py`）
- [ ] `node scripts/preview.mjs` 人工确认（改界面时；附截图或说明）
- [ ] Windows 真机验收（改 Windows 特有逻辑时；按 `docs/windows-acceptance.md`）

## 文档与契约

- [ ] 已更新 `CHANGELOG.md`
- [ ] 已同步 `README.md` / `AGENTS.md` / `CONTRIBUTING.md` 中受影响的部分
- [ ] 报告字段契约已同步：`resources/scripts/scan.py`、`resources/scripts/platforms/windows.py`、`lib/index.js`、`lib/client.js`、`tests/`
- [ ] AI 入口改动已确认提示词复用 `untrustedText` / `safeDisplayPath`，中英文规则成对修改

## 提交前检查

- [ ] 没有提交 `report.md`、`report.json`、`acceptance-report/`、`__pycache__` 等产物
- [ ] 文件保持 LF（`.gitattributes` 未改动）
- [ ] 没有引入构建步骤、打包器或新的运行时依赖
- [ ] 没有包含个人绝对路径、密钥、Token 或未脱敏的日志

## 关联 Issue

Closes #
