# 软件管理与卸载实施契约

依据已确认的方案实施。缓存清理和软件操作使用各自的允许集合。

## 验收边界

沿用已确认方案中的公开边界：软件清单/计划/任务 API（检查实例身份、过期、并发、审计和核验），系统管理器进程边界（使用合成输出和临时程序，不卸载开发机软件），真实客户端隔离预览（检查确认、降级、失败和中英文）。不测试私有函数的内部调用顺序。

## 本轮闭环

独立软件页；安装实例而非名称索引；来源覆盖和失败显式展示；单软件计划、确认、持久化任务、执行后再发现核验；卸载后的残留通过重新体检进入现有逐项清理流程；不自动清理数据或依赖。

管理器：Homebrew、npm 全局、pipx、uv tool；桌面软件：macOS App、Windows 注册表程序、当前用户 Appx 与可确认归属的 WinGet 便携包。无法证明安全的桌面/服务/运行时交由系统或官方卸载器，不直接删除目录、不执行任意 UninstallString。受支持的卸载在专用执行入口中发生，与旧清理 API 分开。

## 不变量

- 只读发现不加载 shell 配置、不扫描命令历史、不对任意程序运行版本探测。
- 实例 ID 绑定来源、环境、包 ID、安装位置；版本/文件身份/依赖/执行器发生变化即重新预览。
- 计划最长 10 分钟有效；执行前重新查询来源；管理器缺失或输出无法解析即拒绝。
- 前端只能传实例 ID、计划 ID 和确认字段，不接受命令/路径/参数。
- 校验回环 Host、同源请求和随机会话令牌。信任同源宿主代码和当前用户进程。
- 单任务互斥；先持久化意图再执行；日志不可用则不执行；中断任务启动后标为待核验，不自动重放。
- 结果按实际安装清单核验；退出成功不等于已卸载；未安装与来源查询失败严格区分。
- 外部卸载不能承诺撤销或安全中断；只允许取消尚未执行的计划。
- 不提权宿主、不收集密码；不自动运行第三方在线卸载脚本。
- 未验收的平台/管理器版本如实列入限制，不把 mock 测试当原生验收。

## 后续范围

Scoop、Chocolatey、Cargo、pnpm、.NET、运行时与环境管理、批量队列另行扩展适配器。暂不支持 WSL/容器内部的软件。

## 软件 HTTP 接口

前缀 `/dsh-deepclean/api/software`。所有请求需要 `X-Deepclean-UI: software`。GET 状态返回本宿主进程的随机 `token`。POST 使用 JSON 和 `X-Deepclean-Token`。

| 路由 | 请求 | 返回 |
|---|---|---|
| GET `/` | 无 | 软件清单、来源状态、任务和令牌 |
| POST `/scan` | `{}` | 202，扫描状态可轮询 |
| POST `/plan` | `{itemId}` | 计划、影响说明和可选目录大小估算 |
| POST `/execute` | `{planId, confirmed:true}` | 202，轮询任务直到核验完成 |
| POST `/reconcile` | `{jobId}` | 重新核验中断或待重启的任务 |
| POST `/open` | `{itemId}` | 打开 Finder 或系统应用管理 |

操作记录保存在 `$DSH_HOME/deepclean-software-jobs.json`。同一宿主进程内一次执行一个卸载。进程退出后如有中断记录，先检查已记录的卸载器 PID，再由用户请求重新核验。Windows MSI 需要重启时，保留待重启状态直到确认系统已重新启动。

WinGet 只处理具备便携包安装记录、唯一产品代码及明确作用域的条目。使用 Microsoft App Installer 提供的 WinGet，传入精确产品代码和 `--preserve`。其他 EXE 走系统设置。参见 [Microsoft 卸载参数](https://learn.microsoft.com/en-us/windows/package-manager/winget/uninstall) 和 [WinGet 便携安装记录实现](https://github.com/microsoft/winget-cli/blob/master/src/AppInstallerCLICore/PortableInstaller.cpp)。

## 验收记录

- `npm test` 覆盖计划过期、重复执行、任务持久化、恢复核验、依赖保护、请求校验和中英文渲染。
- macOS 上用离线合成 npm 包和 uv wheel，在临时安装目录验证真实卸载命令与卸载后查询。
- 使用隔离预览确认软件清单、保护状态、确认复选框、任务进度和残留入口。
- Windows 原生 MSI、Appx、WinGet、提权及待重启需在 Windows 环境使用专用测试包验收。Homebrew 和 pipx 卸载尚无原生临时安装回归。
