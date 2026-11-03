# 无 Windows 电脑时的自动验收

仓库保留原有 `tests` 双平台工作流，另新增 **Windows acceptance**：在固定的 `windows-2022`、`windows-2025` x64 与 `windows-11-arm`（Windows 11 Arm64 客户端镜像）环境执行原生验收。测试失败仍上传报告，不将已知产品缺陷标为预期通过。

## 触发与查看结果

1. 把需要验证的产品代码、工作流及 `scripts/windows-ci/` 一起提交并推送到同一个分支。仅保存本地文件不会触发 GitHub Actions。
2. 修改 `lib/`、`resources/`、验收脚本、工作流或 package.json 的 push/PR 会自动运行。首次新增工作流时，推送本身即可触发，不依赖手动按钮。
3. 工作流进入默认分支后，也可在 GitHub → Actions → **Windows acceptance** → **Run workflow** 选择分支运行。
4. 点击对应的 Windows job 查看 Summary，在运行页面下载 `windows-acceptance-windows-2022-*` / `windows-acceptance-windows-2025-*` / `windows-acceptance-windows-11-arm-*`。
5. 解压后先看 `summary.md`，再看失败阶段的 `.log`。报告保留 14 天。

## 覆盖范围

| 阶段 | 检查内容 |
|---|---|
| existing-suite | 原有完整 node:test 套件，包含扫描器、照片原生解码、宿主路由、安全和页面渲染回归；输出 TAP |
| browser-scan | 临时中文目录中创建 Chrome/Edge/Firefox profile 缓存，运行完整 Windows `scan()` 和报告渲染；校验运行标记、推荐表及只读不变性 |
| volume-setup | 只在临时目录新建唯一的 128 MB VHD，挂载并初始化其 NTFS 分区；绝不选择已有物理盘 |
| native-scenarios | 中文长路径清理与恢复、真实独占文件锁、较高祖先 junction、普通 AppData 数据库保护、21 批全部释放、真实不同卷复制校验和重名拒绝 |
| volume-cleanup | 尝试卸载此次新建的 VHD；setup 中途失败也会进入清理。best-effort：卸载失败只写日志，不改变 job 结论 |

`environment.json` 包含 commit SHA、runner镜像/系统/架构、Node版本。`results.json` 提供每阶段退出码和耗时。成功完成的浏览器扫描还会生成合成数据的 JSON/Markdown 报告；若扫描中途崩溃，以 `browser-scan.log` 的 traceback 为准，不会伪造扫描报告。

`windows-11-arm` 是 Windows 11 客户端 OS（不是 Server），用于补客户端分支、UWP/MSIX 布局与 ARM64 `.NET` 解码。若该镜像无法创建可丢弃测试卷，`volume-setup` 会显式记作 `SKIP` 并写进 `summary.md`，跨卷用例随之标记 skip，其余原生用例照常执行；Server 镜像仍必须提供测试卷，不允许静默跳过。该 label 不可用时 job 会排队等待 runner 并最终超时/失败，需检查仓库/计划是否可用 Arm64 runner。

OS发现（注册表、进程集合等）在浏览器场景中固定为合成值，以便稳定复现；浏览器目录枚举、文件大小、扫描主流程、报告生成仍使用生产代码。真实进程解析与原生图片解码由原有回归覆盖。

原生用例只访问自己创建的临时文件；清理/恢复/永久删除操作不面向个人资料。应用数据保护测试只提交合成路径用于判断。验收结束后托管 runner 被回收。

## 首次出现红灯怎么处理

2026-11-03 首轮运行已复现下列问题；第一批 P1 修复后，这些用例应转为通过：

- 浏览器场景：Windows `scan()` 在初始化 `proc_names` 前引用该变量。
- 原生边界：普通 AppData 未被阻止搬家、更高祖先 junction 恢复保护缺失、全部释放仅处理最近20批。

这些是有效的失败信号，不应通过删除断言、添加 skip 或 `continue-on-error` 隐藏。每个阶段独立执行，一个阶段失败不会阻止后续用例运行；最终任一阶段失败都会使 job 失败。

VHD挂载/管理员权限/runner配置失败同样报红，需查看 volume-setup.log 区分环境问题与产品问题；不能以跳过跨卷测试冒充验收通过。唯一例外是显式声明 `DEEPCLEAN_CI_ALLOW_MISSING_VOLUME=1` 的 `windows-11-arm` 客户端镜像：它的 SKIP 会写进 `summary.md` / `results.json`，且只跳过跨卷用例；两个 Server job 仍必须提供测试卷。

## 本地运行

Windows 已安装 Node 24、Python 3.12 和项目依赖后，可在**可丢弃的测试虚拟机**中用管理员终端执行：

```powershell
node scripts/windows-ci/run.mjs
```

输出：`acceptance-report/windows-ci/`。普通个人 Windows 环境建议继续使用只读的 `scripts/acceptance-windows.ps1`；不要把需要挂载测试盘的 CI 协调器当成普通扫描命令。

macOS 可以先验证浏览器扫描组合逻辑：

```bash
python3 scripts/windows-ci/scanner.py
```

这是跨平台的合成扫描入口检查，不等于 Windows 原生验收。协调器在非Windows系统上会拒绝运行。

## 无法据此宣称已覆盖

Windows Server / Windows 11 Arm64 镜像仍不是普通用户的 Windows 11 x64 桌面。本工作流不包含 DSH 桌面交互、截图/录屏、OneDrive真实同步、真实微信/企业微信安装目录、UAC桌面提示、VSS空间变化、外置盘突然断开；ARM64 桌面应用兼容性同样不在覆盖内。

现有预览入口还有白屏缺陷，不能用页面服务端渲染测试替代真实交互验收。修复产品缺陷后，可再增加浏览器交互与截图阶段；需要实际桌面/应用账号的部分仍应独立标记覆盖范围。
