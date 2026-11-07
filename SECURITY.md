# Security Policy（安全策略）

## 支持版本

安全修复只针对**最新发布版本**（[Releases](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/releases)）。旧版本如果问题仍然存在，请先更新并确认是否复现。

## 报告安全问题（请勿公开）

**不要**在公开的 GitHub Issue 中披露安全问题。请发邮件到：

**coolway.me@gmail.com**

邮件主题建议：`[deepclean-mydisk security] <一句话摘要>`

请尽量包含：

- 插件版本、DSH 版本、操作系统与架构；
- 问题类型（越权删除、路径逃逸、恢复失败、允许集合绕过、隐私泄露等）；
- 影响范围与触发条件；
- 可复现的最小步骤（路径请用 `~/…` / `%LOCALAPPDATA%\…` 脱敏）；
- 是否已经公开、是否在真实用户目录上验证过。

通常会在 **3 个工作日内**回复（尽力而为，不是商业 SLA）。确认问题后会尽快发布修复，并在
Release Notes 中致谢（如需匿名请注明）。请在没有修复前避免公开细节。

## 范围

属于安全问题的例子：

- 清理 / 恢复 / 永久删除超出允许集合，覆盖或丢失用户文件；
- 符号链接、junction、`..`、大小写或路径归一化绕过 `isProtected` / 允许集合；
- 恢复或永久删除越出本插件批次目录；
- 审计日志、报告、AI 提示词或工具输出泄露完整路径、用户名、文件名等隐私信息；
- 云盘 / App 数据目录保护被绕过，导致同步删除或应用数据损坏；
- 依赖、构建链或发布产物被篡改。

## 不属于安全问题

扫描误报、UI 文案、性能、兼容性、功能建议等，请走
[GitHub Issues](https://github.com/huangxiaoliang/deepclean-mydisk-plugin/issues/new/choose)。
