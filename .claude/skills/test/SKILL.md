---
name: test
description: 跑 deepclean-mydisk 的 node:test 套件并汇总失败原因；可传入测试文件路径只跑单文件。
disable-model-invocation: true
allowed-tools: Bash(npm test:*), Bash(node --test:*), Read, Grep, Glob
---

# 跑测试

执行 `npm test`（等价 `node --test`），然后按下面格式汇报：

1. 总数 / pass / fail / skip；
2. 失败用例所在文件与断言，判断是实现问题还是测试假设问题；
3. 用户若传了参数（`$ARGUMENTS`，例如 `tests/pages.test.mjs`），改成 `node --test <路径>` 只跑那个文件。

约束：

- macOS 上固定出现 **3 个 skip**（`tests/host.test.mjs` 的 2 个 Windows HTTP 用例 + `tests/software-windows-script.test.mjs` 的 `software-windows.ps1` 脚本回归），这是预期结果，不要删改。
- 不要把断言改松、删用例或改平台判断来「变绿」；先解释为什么失败。
- 改完代码重跑直到全绿；只改 `.md` 时不需要跑测试。
