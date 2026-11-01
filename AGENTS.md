# deepclean-mydisk-plugin — 项目说明（给后续 Agent）

## 是什么
DSH 插件：原生侧边栏磁盘清理（macOS/Windows），只读体检 + 可撤销清理 + 空间可视化 + 相似照片 + 跨盘搬家。

## 结构
- `lib/index.js`：host 插件（工具注册、HTTP API、扫描/清理/搬家状态机）
- `lib/clean.js`：移动/撤销/跨盘校验（唯一允许写文件的地方，且只移到废纸篓/隔离区）
- `lib/client.js`：浏览器端（`window.__ModuleLoader__.load` 手写 bundle，无构建步骤）
- `resources/`：内置 Python 扫描器（与 deepclean-mydisk skill 同源，独立维护）
- `tests/`：node:test 测试（55 个用例）
- `docs/windows-acceptance.md` + `scripts/acceptance-windows.ps1`：Windows 真机验收
- `.github/workflows/tests.yml`：macOS + Windows CI

## 常用命令
```bash
npm test                              # 55 个测试
node --check lib/index.js lib/client.js lib/clean.js
python3 resources/scripts/deepclean.py --self-test
```

## 安全硬约束（改代码时必须保持）
- 扫描器只读；不删除、不移动用户文件；
- 清理只移动（废纸篓/隔离区），可撤销；不提供自动删除；
- 只接受最近 10 分钟扫描结果中的允许路径；白名单路径拒绝；符号链接拒绝；
- 跨盘搬家必须复制后 SHA-256 校验，失败保留原文件；
- ❌ 不引入注册表清理、后台常驻扫描、恐吓式提示。

## 独立性与同步
- 本仓库是独立项目，**不依赖** deepclean-mydisk skill 仓库；
- 扫描器是内置副本；如需同步：`scripts/sync-scanner.sh <skill-repo-path>`；
- 发布：改 `package.json` version → 更新 CHANGELOG → commit → `git tag vX.Y.Z` → `gh release create`。

## 本地安装（DSH profile）
```bash
dsh plugin --profile desktop add link:/Users/hxl/Documents/deepseek-harness/plugins/deepclean-mydisk-plugin
```
修改 host 或 client 代码后需要重启 DSH。
