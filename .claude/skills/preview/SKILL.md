---
name: preview
description: 启动隔离预览服务器（127.0.0.1:4173，宿主 API 全 mock、路径虚构在 /demo），用于人工验收 lib/client.js 的界面。
disable-model-invocation: true
allowed-tools: Bash(node scripts/preview.mjs:*), Read, Grep, Glob
---

# 隔离预览

用 Bash 工具以 `run_in_background` 启动：

```bash
node scripts/preview.mjs
```

然后：

1. 从输出里确认地址（默认 `http://127.0.0.1:4173`，可用 `DEEPCLEAN_PREVIEW_PORT` 改端口）。
2. 说明预览特性：加载真实 `lib/client.js`，宿主 API 全内存 mock，路径虚构在 `/demo`，**不读不写真实文件**。
3. 提醒用户按 `README.md`「界面结构」的 6 个一级入口（体检 / 清理 / 空间 / 软件 / 历史 / 设置）+ 中英切换逐项检查；改动视觉时对照 `docs/design/` 与 `design-qa.md`。
4. 用户确认结束后 kill 后台任务，不要让服务器常驻。

不要用预览验证真实扫描/清理结果——那需要宿主进程，预览里是合成数据。
