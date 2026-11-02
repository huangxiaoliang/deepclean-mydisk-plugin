# Windows 真机验收（给同事，5–30 分钟）

> 目的：验证 CI 覆盖不到的真实 Windows 环境（OneDrive、UWP、中文系统、普通用户权限、隔离区）。
> 只验扫描器约 5 分钟；验 DSH 插件约 15–30 分钟。

## 一、准备

- Windows 10/11，PowerShell 5+；
- Python 3.9+（`py -3 --version` 能输出）；
- 把插件仓库拷到本机，例如 `C:\deepclean-mydisk-plugin`；
- （可选）DSH Windows 版，且能打开 Web GUI。

## 二、只验扫描器（5 分钟）

在仓库根目录执行：

```powershell
py -3 --version
py -3 resources\scripts\deepclean.py --check-permissions
py -3 resources\scripts\deepclean.py --self-test
py -3 resources\scripts\deepclean.py --quick --redact --md report.md --json report.json
```

一键脚本（推荐，自动跑完并做检查）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\acceptance-windows.ps1
```

它会生成 `acceptance-report\`：`acceptance.txt`、`report.md`、`report.json`，并输出 PASS/FAIL 清单。

需要检查的 8 项：

| # | 检查 | 期望 |
|---|---|---|
| 1 | `--self-test` | 全部 PASS（或 SKIP 有说明） |
| 2 | 权限检查 | 显示「普通用户」或「管理员」，不报错 |
| 3 | 报告标题/版本 | `磁盘体检报告（Windows）` |
| 4 | OneDrive | 云盘目录只进「不要动」，不出现在可清理 |
| 5 | 中文路径 | 报告里中文不乱码 |
| 6 | 系统目录 | `C:\Windows`、`Program Files`、`ProgramData` 系统项不进可清理 |
| 7 | UWP | `%LOCALAPPDATA%\Packages` 只进「需确认」 |
| 8 | 命令 | 建议命令只有 `Move-Item -LiteralPath`，无 `del/rd` |

把 `acceptance-report\` 整个发回即可。

## 三、验 DSH 插件（15–30 分钟）

安装（二选一）：

```powershell
# 从 GitHub（需要能访问）
dsh plugin --profile desktop add github:huangxiaoliang/deepclean-mydisk-plugin
# 或本地目录
dsh plugin --profile desktop add file:C:\deepclean-mydisk-plugin
```

重启 DSH 后检查：

1. 侧边栏出现 **DeepClean MyDisk**；
2. 打开面板立即显示系统盘 **总量 / 已用 / 可用**（数据来自 statfs，无需先体检；标题栏也有一行）；
3. 首页「开始体检」→ 进度 → 体检结果 → 清理推荐项 → 确认 → 撤销；
4. 空间页：目录树、环形图可钻取；
5. 大文件：勾选 + 目标磁盘下拉 + 空间对比（不需要真的搬）；
6. 相似照片：扫描、缩略图、对比、保留策略；
7. 历史：扫描记录、清理批次恢复、审计日志；
8. 设置：中英文切换、安全说明、白名单；
9. 权限检查显示当前是管理员还是普通用户；
10. 清理建议命令是 **PowerShell `Move-Item`**，隔离区在 `%LOCALAPPDATA%\deepclean-mydisk\trash`。

**特别验证**：
- OneDrive 同步目录只读、不可勾选；
- `%LOCALAPPDATA%\Temp` 可清理、可撤销；
- 普通用户下 `C:\ProgramData` 相关项被标注需管理员。

## 四、发回什么

1. `acceptance-report\`（含 report.md/json、acceptance.txt）；
2. 插件验收：截图或录屏 + 不符合项；
3. 如果 DSH 插件列表报错，附错误文本。

## 五、常见问题

- `py` 不存在：用 `python` 替换；或安装 Python 并勾选 py launcher；
- 企业策略限制 PowerShell 脚本：`powershell -ExecutionPolicy Bypass -File ...`；
- 无 Windows 机器：可先用 GitHub Actions（仓库已配 windows-latest），但那不是真实用户环境。


## 照片与路径保护修复验收

- `npm test` 在 Windows 会执行原生 .NET 指纹/缩略图测试，以及 HTTP 目录树、缩略图回归；macOS 本地会跳过两个 Windows 专用 HTTP 测试。
- 保护 `C:\Users\用户名\Cache` 后，其子项、不同大小写或正斜杠写法都应被服务端拒绝；相邻的 `Cache-old` 不应被误保护。
- 空间页中 1 MiB 文件应统计为 1024 KB，不能显示为 1 GiB；中文路径应保持可见。
- 照片使用系统解码器，不需安装 Pillow。验证 JPEG/PNG/BMP 等受支持格式可分组和查看缩略图；HEIC/WebP 等格式以系统解码能力为限。部分文件失败会体现在“扫描/比较”张数差异与 JSON 的 skipped 字段；全部失败必须报错，不能显示为空结果成功。
- 对照片执行扫描与缩略图查看后，对比原文件 SHA-256，内容应保持不变。
