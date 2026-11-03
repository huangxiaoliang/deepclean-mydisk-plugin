---
name: self-check
description: 扫描器自检 + 宿主/前端语法检查 + 版本信息，输出 PASS/FAIL 表。
disable-model-invocation: true
allowed-tools: Bash(python3 resources/scripts/deepclean.py:*), Bash(python3 tests/photos-regressions.py:*), Bash(node --check:*), Read
---

# 自检

依次执行，任何一步非 0 退出就停下来说明原因，不要跳过：

```bash
node --check lib/index.js lib/client.js lib/clean.js lib/platform.js scripts/preview.mjs
python3 resources/scripts/deepclean.py --self-test
python3 resources/scripts/deepclean.py --check-permissions
python3 resources/scripts/deepclean.py --version
python3 tests/photos-regressions.py   # 仅在动过 photos.py / photos-windows.ps1 时
```

说明：

- `--self-test` 在临时 HOME 上跑一次 quick 扫描，验证只读链路与报告结构。
- `--check-permissions` 在 macOS 需要「完全磁盘访问」；未授权只报告，不代表代码坏了。
- `--version` 输出的是扫描器 CLI 版本（当前 0.5.0），与 `package.json` 的插件版本是两套独立版本号（插件版本以 `package.json` 为准），不要同步改。
