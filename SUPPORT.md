# 支持与反馈

DSH 市场的插件详情页没有内置的反馈按钮；详情页的「主页」和「源代码」都指向本仓库，因此
**GitHub Issues 是公开的反馈入口**。

## 渠道

| 用途 | 入口 |
|---|---|
| Bug、使用问题、功能建议 | [GitHub Issues](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/issues/new/choose)（推荐用问题模板） |
| 安全 / 敏感数据（越权删除、路径逃逸、隐私泄露） | 邮件 **coolway.me@gmail.com**，不要公开提 Issue，详见 [SECURITY.md](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/SECURITY.md) |
| 安装、权限、平台限制 | [README](https://github.com/huangxiaoliang/deepclean-mydisk-plugin#readme) · [插件详情](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/docs/plugin/DETAIL.zh.md) · [Windows 验收](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/docs/windows-acceptance.md) |

中文或 English 都可以；收到后会尽力尽快回复，但这是个人维护的项目，没有商业 SLA。

## 提交前请先自查

以下命令需要在**插件源码目录**运行；从 npm / DSH 安装的版本请直接用面板「设置 → 权限检查」（安装包内也带 `resources/`，但不需要手动运行）：

```bash
python3 resources/scripts/deepclean.py --self-test
python3 resources/scripts/deepclean.py --check-permissions
```

- 更新或修改过插件后，**重启 DSH** 再试；
- 权限检查显示未授权「完全磁盘访问」时，扫描结果会明显偏少，先按面板提示授权；
- Windows 的已知限制（`appCaches` 未实现、聊天软件专项仅 macOS、部分系统目录需要管理员）见
  [README 已知限制](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/blob/main/README.md#已知限制)。

## 提交 Issue 时请附上

- 插件版本（设置页或 `dsh plugin list`）、DSH 版本、操作系统版本；
- 出问题的功能（体检 / 清理 / 恢复 / 永久删除 / 照片 / 空间 / 跨盘移动 / 软件 / AI）；
- 复现步骤、期望结果、实际结果；
- UI 显示的错误码或失败阶段（如 `eacces`、`exdev`、`notfound`、`symlink`）；
- 已脱敏的日志片段或截图。

## 日志、报告与隐私

- 审计日志：`$DSH_HOME/deepclean-audit.log`；历史：`$DSH_HOME/deepclean-history.json`；
- 在源码目录重新生成脱敏报告：`deepclean.py --quick --redact --md report.md --json report.json`；
- **不要**贴完整磁盘路径、用户名、文件名、聊天记录或未脱敏的审计日志原文；用 `~/…`、
  `%LOCALAPPDATA%\…` 或只保留错误码 / 大小 / 分类来复现问题；
- 插件不会自动上传任何扫描结果、日志或文件列表。
