window.__ModuleLoader__.load({
	id: "deepclean-mydisk",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const h = React.createElement;
		const { useState, useEffect, useCallback, useRef } = React;

		const PANEL_ID = "deepclean";
		const API = "/dsh-deepclean/api";

		// ---- i18n（中文为源语言，英文用映射；扫描器文案用模式翻译）----
		// 文案术语以 docs/copy-terms.md 为准；改中文 key 必须成对更新此表。
		const EN = {
			"没有可永久删除的批次": "No batches available for permanent deletion",
			"确认永久删除这次清理的全部批次？删除后无法撤销。": "Permanently delete all batches from this cleanup? This cannot be undone.",
			// 导航与通用
			"体检": "Checkup", "空间": "Space", "清理": "Clean", "历史": "History", "设置": "Settings",
			"主导航": "Main navigation", "取消": "Cancel", "重试": "Retry", "关闭": "Close", "完成": "Done",
			"名称": "Name", "大小": "Size", "占比": "Share", "项目": "Item", "详情": "Details", "操作": "Actions", "选择": "Select",
			"添加": "Add", "移除": "Remove", "（暂无）": "(none)", "今天 {time}": "Today {time}",
			// 首页
			"磁盘体检": "Disk checkup", "了解空间占用，按需整理文件。": "Understand your storage. Organize what you choose.",
			"磁盘容量": "Disk capacity", "系统磁盘": "System disk", "实时": "Live", "上次扫描": "Last scan",
			"当前可用 {size}": "{size} available", "当前可用": "Available now", "正在读取磁盘信息…": "Reading disk…",
			"总容量 {total} · 已用 {used}": "Total {total} · Used {used}", "磁盘已用 {pct}%": "Disk used {pct}%",
			"已用 {pct}%": "Used {pct}%", "可用 {pct}%": "Free {pct}%",
			"正在查找可整理的空间": "Finding space to organize", "扫描已完成，看看清理建议": "Scan finished — review the cleanup suggestions",
			"看看哪些空间可以整理": "See what you can organize", "预计可释放 {size}，请核对后再清理。": "Estimated reclaimable {size}. Review before cleaning.",
			"扫描只读取文件信息，清理前由你确认。": "Scanning is read-only. You confirm what gets moved.",
			"查看清理建议": "Review suggestions", "开始扫描": "Start scan", "扫描选项": "Scan options",
			"覆盖应用残留、浏览器缓存、开发缓存与大文件。": "Checks app leftovers, browser caches, developer caches and large files.",
			"快速扫描": "Quick scan", "完整扫描": "Full scan", "权限检查": "Check permission",
			"扫描失败，请重试。": "Scan failed. Please try again.",
			"最近一次整理": "Last cleanup", "{time} · 移入{trash} {n} 项": "{time} · {n} items moved to {trash}",
			"还没有整理记录": "No cleanup history yet", "文件先移到{trash}，可在「历史」中恢复。": "Files go to {trash} first. Restore them from History.",
			"查看与恢复": "Review and restore",
			// 扫描进度与状态（含扫描器 PROGRESS 阶段名，经 trNote 动态查表）
			"扫描进度": "Scan progress", "正在扫描…": "Scanning…", "取消扫描": "Cancel scan", "准备扫描": "Preparing scan",
			"扫描中…": "Scanning…", "扫描完成": "Scan complete", "扫描结果已过期": "Scan results expired", "等待首次扫描": "Waiting for the first scan",
			"重新扫描": "Rescan", "扫描结果已超过 10 分钟，请重新扫描后清理。": "Scan results are over 10 minutes old. Scan again before cleanup.",
			"读取磁盘信息": "Reading disk info", "扫描 App 容器与缓存…": "Scanning app containers and caches…",
			"扫描 App 容器": "Scanning app containers", "扫描系统/用户缓存": "Scanning system and user caches",
			"扫描 ~/.cache": "Scanning ~/.cache", "扫描开发缓存": "Scanning developer caches", "识别已安装 App": "Identifying installed apps",
			"扫描大文件": "Scanning large files", "汇总结果": "Preparing results", "分析微信/企业微信/QQ 数据": "Analyzing WeChat/WeCom/QQ data",
			"统计废纸篓": "Measuring Trash", "扫描应用缓存": "Scanning app caches", "准备": "Preparing", "已取消": "Canceled",
			"查找图片": "Finding photos", "分组相似照片": "Grouping similar photos",
			// 清理向导
			"扫描完成后会给出推荐清单": "Recommendations will appear when the scan finishes",
			"确认清理 {n} 项（{size}）？": "Clean {n} items ({size})?", "确认清理": "Confirm clean",
			"已移入{trash} {size}": "Moved {size} to {trash}", "撤销": "Undo", "清理历史": "Clean history",
			"扫描结果": "Scan result", "没有可清理项": "Nothing to clean",
			"推荐": "Recommended", "可选": "Optional",
			"清理推荐项": "Clean recommended", "查看全部详情": "View all details",
			// 清理页
			"清理文件": "Clean files", "垃圾清理": "Junk clean", "相似照片": "Similar photos", "清理类型": "Cleanup type", "清理项目": "Cleanup items",
			"内容分类": "Categories", "全部项目": "All items", "开发缓存": "Developer caches", "浏览器缓存": "Browser caches",
			"应用残留": "App leftovers", "应用缓存": "App caches", "聊天软件缓存": "Chat app caches", "其他缓存": "Other caches", "系统缓存": "System cache",
			"待统计": "Pending", "预计可释放": "Estimated reclaimable", "仅统计可清理的项目": "Only cleanable items are counted",
			"搜索名称或路径": "Search name or path", "风险筛选": "Filter by risk", "风险：全部": "Risk: all",
			"推荐清理": "Recommended", "可选清理": "Optional", "需确认": "Needs review", "受保护": "Protected",
			"排序": "Sort", "大小 ↓": "Size ↓", "大小 ↑": "Size ↑",
			"正在查找可整理的文件": "Finding files to organize", "先做一次磁盘扫描": "Run your first disk scan",
			"完成后将显示分类结果，请稍候。": "Results will appear when scanning finishes.",
			"没有匹配的项目": "No matching items", "这个分类没有发现项目": "No items found in this category",
			"试试其他分类或调整筛选条件。": "Try another category or adjust the filters.",
			"选择当前列表中可清理的项目": "Select all cleanable items in this list", "选择 {name}": "Select {name}",
			"清理影响": "Cleanup impact", "查看详情": "View details", "怎么恢复": "How to recover",
			"在{trash}或「历史」中恢复": "Restore from {trash} or History", "仅供查看，不提供清理": "View only; cleanup is unavailable",
			"完整路径": "Full paths",
			"已加入保护，不会移动": "Protected; will not be moved", "可能含重要数据，仅供查看": "May contain important data; view only",
			"下次构建时重新生成": "Regenerated on the next build", "使用时可能重新下载或构建": "May require downloading or building again",
			"离线构建可能受影响": "Offline builds may be affected", "安装依赖时可能重新下载": "May download dependencies again",
			"下次构建或打包时可能重新下载": "May download again on the next build or package",
			"再次连接设备时可能重新下载": "May download again when the device reconnects",
			"网页资源可能需要重新加载": "Web resources may need to reload", "缓存可重新生成": "Cache can be regenerated",
			"系统缓存，释放空间有限，不建议清理": "System cache; limited gain, not recommended",
			"浏览器缓存，可重建（不碰书签/密码）": "Browser cache, regenerable (bookmarks/passwords untouched)",
			"聊天数据只读；缓存可清理": "Chat data is read-only; caches can be cleaned",
			"已安装 App 的缓存/临时文件，可重建，不碰聊天/文档": "Installed app caches/temp files; regenerable, chats and documents untouched",
			"App 正在运行，退出后可清理": "App is running; quit it before cleaning",
			"App 缓存可重新生成，不影响聊天/文档": "App cache can be regenerated; chats and documents are unaffected",
			"确认将 {n} 项（{size}）移到{trash}？": "Move {n} items ({size}) to {trash}?",
			"已选 {n} 项 · {size}": "Selected {n} items · {size}", "清空选择": "Clear selection",
			"移到{trash}": "Move to {trash}", "处理中…": "Working…", "更多操作": "More actions",
			"选中推荐项": "Select recommended", "全选当前列表": "Select all in this list", "复制命令": "Copy commands",
			"加入保护名单": "Add to protected paths", "撤销上次清理": "Undo last clean",
			"移入{trash}不会立即增加可用空间；可在「历史」中对本批次永久删除。": "Items in {trash} still occupy disk space; the batch can be permanently deleted from History.",
			"本次移出 {size}，立即释放 0": "Moved out {size}; freed 0 right now",
			"永久删除本批次后可释放约 {size}（逻辑大小 {logical}）": "Permanently deleting this batch can free about {size} (logical {logical})",
			"{trash}里还有 {size}，永久删除后可释放": "{size} still sits in {trash}; permanently deleting it frees space",
			"查看并释放": "Review and release",
			"系统废纸篓共 {size}（含非本插件文件，请在 Finder 中清空）": "System Trash totals {size} (includes non-app files; empty it in Finder)",
			"隔离区/废纸篓": "Quarantine/Trash", "永久删除全部（{n} 批）": "Delete all permanently ({n} batches)",
			"确认永久删除全部？删除后无法撤销。": "Permanently delete everything? This cannot be undone.",
			"确认永久删除全部": "Delete all permanently",
			"已永久删除 {n} 项（约 {size}）": "Permanently deleted {n} items (~{size})",
			"已移出 {n} 项 · {size}；可用空间未变化": "Moved out {n} items · {size}; free space unchanged",
			"文件在{trash}；永久删除后可释放（约 {size}）": "Files are in {trash}; deleting them permanently frees about {size}",
			"永久删除并释放": "Delete permanently and free space",
			"可用空间现在不会变化": "Free space does not change yet",
			"永久删除此批次后约释放 {size}": "About {size} is freed after permanently deleting this batch",
			"可用空间未变化（文件在{trash}）": "Free space unchanged (files are in {trash})",
			"关闭提示": "Dismiss notification",
			// 历史
			"扫描历史": "Scan history", "可用 {size}": "Free {size}", "可释放 {size}": "Reclaimable {size}",
			"清理批次（可恢复）": "Clean batches (restorable)", "{n} 项": "{n} items", "，其中 {n} 项可恢复": ", {n} restorable",
			"清理完成": "Cleanup complete", "永久删除并释放": "Delete permanently and free space",
			"文件在{trash}；永久删除后可释放（约 {size}）": "Files are in {trash}; deleting them permanently frees about {size}",
			"恢复此批次": "Restore this batch", "已恢复/已清空": "Restored/emptied",
			"已永久删除": "Permanently deleted", "已清空": "Emptied",
			// 空间
			"空间分析": "Storage analysis", "找到占用来源，按需整理或移动。": "Find what uses storage. Organize or move what you choose.",
			"空间视图": "Storage view", "目录分布": "Folders", "大文件": "Large files", "目录导航": "Folder navigation",
			"个人文件夹": "Home folder", "仅统计个人文件夹，包含隐藏项；不代表整盘已用容量。": "Home folder including hidden items; this is not total disk usage.",
			"按文件大小统计；压缩、共享文件和系统保留空间可能造成差异。": "Logical file sizes; compression, shared files and system reserves can cause differences.",
			"按文件占用统计；共享文件和系统保留空间可能造成差异。": "Allocated file storage; shared files and system reserves can cause differences.",
			"正在统计目录，请稍候…": "Counting folder usage, please wait…", "停止加载": "Stop loading", "已停止加载，可重试。": "Stopped. You can retry.",
			"未能读取 {n} 项，跳过链接 {s} 项；统计可能不完整。": "Could not read {n} items; skipped {s} links. Totals may be incomplete.",
			"已跳过云盘目录 {n} 个：云盘文件不参与搬家或去重。": "Skipped {n} cloud folders: cloud files are excluded from moving and dedupe.",
			"当前目录分布": "Current folder usage", "当前已统计": "Counted in this folder", "其他": "Other",
			"其中可清理 {size}": "{size} cleanable", "去清理页处理": "Clean these from the Clean page",
			"点击目录或色块进入下一级": "Select a folder or chart segment to explore",
			"查看此目录的大文件": "Large files in this folder", "打开位置": "Show location", "重新统计": "Refresh totals",
			"此目录没有可显示的项目": "No items to display in this folder", "部分统计": "Partial total", "显示更多": "Show more",
			"无法打开位置": "Could not open location", "打开目标文件夹": "Open destination",
			// 大文件与跨盘移动
			"扫描范围：个人文件夹 · 仅列出 ≥300 MB 的大文件": "Scope: home folder · files ≥300 MB only",
			"扫描范围：个人文件夹 · ≥300 MB · 仅显示最大的 {n} 个": "Scope: home folder · ≥300 MB · top {n} only",
			"扫描时间预算有限，大文件结果可能不全。": "Scan hit its time budget; large-file results may be incomplete.",
			"来源：目录统计 · {path}": "Source: folder analysis · {path}",
			"该目录没有大文件": "No large files in this folder",
			"目录统计已过期，请重新统计后移动。": "Folder totals are stale. Refresh totals before moving.",
			"扫描结果已过期，请重新扫描后移动。": "Results have expired. Scan again before moving.",
			"正在扫描大文件…": "Scanning large files…", "大文件扫描失败，请重试": "Large-file scan failed. Try again.",
			"先扫描，查找占用较大的文件": "Scan to find large files",
			"当前扫描未覆盖大文件，请进行完整扫描": "This scan did not cover large files. Run a full scan.",
			"没有符合筛选条件的大文件": "No large files match these filters", "没有发现大文件": "No large files found", "清除筛选": "Clear filters",
			"修改时间": "Modification time", "全部时间": "Any time", "超过 {n} 天未修改": "Not modified for {n} days",
			"文件类型": "File type", "全部类型": "Any type", "最小大小": "Minimum size", "全部大小": "All sizes",
			"按大小": "By size", "按未修改天数": "By unmodified days",
			"修改时间未知": "Modification time unknown", "复制路径": "Copy path", "已复制路径": "Path copied", "无法复制路径": "Could not copy path",
			"共 {n} 个文件": "{n} files", "选择筛选结果": "Select filtered results",
			"已选 {n} 个 · {size}": "Selected {n} files · {size}", "目标磁盘": "Target disk", "选择目标磁盘…": "Choose a destination…",
			"可用": "Free", "目标目录": "Destination folder", "选择文件夹": "Browse folders",
			"目标可用 {free} · 已选 {size}": "Destination free {free} · selected {size}", "目标磁盘空间不足": "Not enough space on the destination",
			"目标目录不可写": "The destination folder is not writable", "进入子文件夹": "Enter subfolder", "上一级": "Up",
			"移动到…": "Move to…", "确认移动": "Confirm move", "确认移动 {n} 个文件到 {dest}？": "Move {n} files to {dest}?",
			"移动到其他磁盘时会先复制并逐字节校验，确认一致后才移除原文件。": "Moves to another disk copy first and verify content; originals are removed only after verification.",
			"成功后原位置不再保留文件；移动不进入清理历史，无法通过「历史」恢复。": "After a successful move the original is removed; moves are not listed in History and cannot be restored there.",
			"正在移动 {done}/{total}": "Moving {done}/{total}", "无法取消当前任务": "Could not cancel the task",
			"正在取消；当前文件处理完成后停止。": "Canceling after the current file finishes.",
			"移动已取消；已完成的文件保留在目标位置。": "Move canceled. Completed files remain at the destination.",
			"移动失败，失败项见上方列表。": "Move failed. Failed items are listed above.", "移动完成": "Move completed",
			"无法读取移动进度": "Could not read move progress",
			// 相似照片
			"扫描相似照片": "Scan similar photos",
			"默认保留每组中体积最大的一张，其余已勾选待清理；可手动调整": "Keeps the largest photo in each group by default and selects the rest for cleanup; adjust as needed",
			"保留策略": "Keep rule", "最大": "Largest", "最新": "Newest", "路径最浅": "Shallowest", "全部文件夹": "All folders",
			"建议保留": "Keep", "可清理": "Removable", "对比": "Compare", "保留": "Keep",
			"相似组 · {n} 张 · 可释放 {size}": "Similar group · {n} photos · reclaimable {size}",
			"扫描 {n} 张，比较 {m} 张，找到 {g} 组相似；预计可释放 {size}": "Scanned {n}, compared {m}, found {g} similar groups; reclaimable {size}",
			"选择保留的照片": "Choose the photo to keep", "应用保留": "Apply",
			"已选 {n} 张 · {size}": "Selected {n} photos · {size}", "上次照片清理可恢复": "Last photo clean can be restored",
			"撤销照片清理": "Undo photo clean", "确认将 {n} 张移到{trash}？": "Move {n} photos to {trash}?",
			"将移到{trash}，可在「历史」恢复；不会自动永久删除": "Moves to {trash}; restorable from History; never automatically purged",
			"移动中…": "Moving…",
			// 永久删除
			"确认永久删除本批次？删除后无法撤销。": "Permanently delete this batch? This cannot be undone.",
			"确认永久删除": "Delete permanently", "永久删除此批次": "Delete this batch permanently",
			"永久删除后无法恢复，也不会保留恢复记录。": "Permanent deletion cannot be undone and leaves no recovery record.",
			"已永久删除 {n} 项（约 {size}）": "Permanently deleted {n} items (~{size})",
			// 设置
			"安全说明": "Safety",
			"默认只移动：清理和照片去重都先移到{trash}，可在「历史」恢复；永久删除需在「历史」中二次确认。": "Moves by default: cleaned files and photo dedupe go to {trash} first and can be restored from History; permanent deletion requires a second confirmation in History.",
			"「需确认」和聊天数据永远不会被自动勾选，也不会进入推荐清理。": "\"Needs review\" and chat data are never auto-selected or included in recommended cleanup.",
			"保护名单中的路径永远不会被清理；符号链接一律拒绝。": "Protected paths are never cleaned; symlinks are always refused.",
			"跨盘移动会先复制并做 SHA-256 校验，校验失败保留原文件。": "Cross-disk moves copy first and verify with SHA-256; originals are kept if verification fails.",
			"语言 / Language": "Language", "保护名单（永不清理）": "Protected paths (never clean)", "输入要保护的绝对路径": "Absolute path to protect",
			"环境": "Environment", "平台": "Platform", "权限": "Permission",
			"完全磁盘访问已授权": "Full Disk Access granted", "完全磁盘访问未授权": "Full Disk Access not granted",
			"无法确认": "Unknown", "未知": "Unknown",
			"未授权完全磁盘访问，扫描结果会严重漏报。": "Full Disk Access not granted — scan results will be severely incomplete.",
			"打开系统设置": "Open System Settings", "查看详细步骤": "Show detailed steps", "收起详细步骤": "Hide detailed steps",
			"重新检查": "Recheck",
			"审计日志": "Audit log", "历史文件": "History file", "保护名单文件": "Protected-paths file", "立即扫描": "Scan now",
			// 提示与通知（客户端生成，创建时已按当前语言翻译）
			"已移动 {n} 项到{trash}，可撤销": "Moved {n} items to {trash}; can be undone", "失败 {n} 项：{errors}": "{n} failed: {errors}",
			"已恢复 {n} 项；如需再次清理请重新扫描。": "Restored {n} items. Scan again to clean them once more.", "已加入保护名单 {n} 项": "Added {n} items to protected paths",
			"已加入保护名单": "Added to protected paths", "该批次已恢复": "Batch restored", "已复制 {n} 条命令": "Copied {n} commands",
			// 恢复/撤销诚实反馈
			"已恢复 {n} 项，失败 {m} 项": "Restored {n} items, {m} failed",
			"另存为副本恢复": "Restore as a copy",
			"上次恢复失败 {n} 项": "Last restore failed for {n} items",
			"原位置已有同名文件，可另存为副本恢复。": "A file already exists there — restore as a copy instead.",
			"审计写入失败：文件已在{trash}，但历史里可能看不到恢复记录。": "Audit log write failed: files are in {trash}, but History may not list them.",
			"恢复记录写入失败：历史里可能仍显示为可恢复。": "Restore log write failed: History may still show this batch as restorable.",
			"已恢复 {n} 项，其中 {k} 项另存为副本": "Restored {n} items; {k} saved as copies",
			"副本位置：{paths}": "Copy locations: {paths}",
			"部分批次失败：{errors}": "Some batches failed: {errors}",
			"请先扫描一次": "Run a scan first", "已撤销": "Restored",
			"已移动 {n} 张相似照片到{trash}，可撤销": "Moved {n} similar photos to {trash}; can be undone", "已恢复 {n} 张照片": "Restored {n} photos",
			"已恢复 {n} 张照片，失败 {m} 张": "Restored {n} photos, {m} failed",
			"分 {n} 批": "{n} batches", "将分 {n} 批执行（每批最多 200 项）": "Will run in {n} batches (max 200 items each)",
			"扫描失败：": "Scan failed: ", "未知错误": "unknown error", "扫描已取消": "Scan canceled", "正在取消…": "Canceling…",
			// 释放估算
			"预计实际释放 {size}（逻辑大小 {logical}）": "Estimated real reclaim {size} (logical {logical})",
			"正在估算实际释放…": "Estimating real reclaim…",
			"本机有 {n} 个 APFS 本地快照，可能影响实际释放": "{n} APFS local snapshots present; actual reclaim may differ",
			"可用空间 {from} → {to}（+{delta}）": "Free space {from} → {to} (+{delta})",
			// 扫描器返回的分类名与目录别名（经 tr/trNote 动态查表）
			"缓存": "Cache", "聊天缓存": "Chat cache", "图片": "Photos", "视频": "Videos", "语音": "Voice messages",
			"表情": "Stickers", "附件/下载": "Attachments/Downloads", "文件": "Files",
			"npm 缓存": "npm cache", "Maven 本地仓库": "Maven repository", "pnpm 缓存": "pnpm cache",
			"Codex 运行缓存": "Codex runtime cache", "Xcode 归档": "Xcode archives", "iOS 模拟器数据": "iOS simulator data",
			// AI（只读解释：面板把已算好的数据整理成提示词，注入当前 DSH 会话）
			"让 AI 解读这次体检": "Ask AI to explain this checkup",
			"问 AI": "Ask AI", "这是什么": "What is this?",
			"复核这 {n} 项": "Have AI review these {n} items",
			"让 AI 分析趋势": "Ask AI to analyze trends",
			"未收录": "Not catalogued", "扫描器没有收录这个应用名": "The scanner has no catalog entry for this app name",
			"已发送到对话": "Sent to the conversation",
			"已复制提示词，打开对话后粘贴发送": "Prompt copied — paste it into a conversation to send",
			"AI 入口不可用（当前环境没有会话服务）": "AI entry unavailable (no session service in this environment)",
			"AI 发送失败，请重试": "Sending to the conversation failed. Try again.",
			"趋势与复清": "Trends and regrowth", "可用空间趋势": "Free space trend",
			"还没有足够的历史数据": "Not enough history yet",
			"过去 {days} 天：可用 {from} → {to}（{delta}）": "Last {days} days: free {from} → {to} ({delta})",
			"累计清理 {n} 批 · 约 {size}": "{n} clean batches · ~{size}", "累计清理 {n} 批": "{n} clean batches",
			"清了又长回来": "Cleaned, then grew back",
			"清过 {size}，现在 {now}（{time}）": "Cleaned {size}, now {now} ({time})",
			"当前体检里再次出现，说明清理后会重新生成，或上次清理不彻底。": "Present again in the current checkup: it either regenerates after cleaning or the last clean was partial.",
			"更早的清理批次没有记录大小": "Older clean batches did not record sizes",
			"历史趋势数据来自本机的扫描与清理审计；大小由程序统计。": "Trends come from local scan and clean audit records; sizes are computed by the app.",
		};

		function tr(lang, s) { return lang === "en" ? (EN[s] || s) : s; }
		function tf(lang, s, vars) {
			let out = tr(lang, s);
			for (const k of Object.keys(vars || {})) out = out.split("{" + k + "}").join(String(vars[k]));
			return out;
		}
		function noteEn(s) {
			if (!s) return s;
			let out = String(s);
			const rules = [
				// 扫描器（scan.py / photos.py）输出的说明文字与阶段名
				[/^计算指纹（(\d+)\/(\d+)）/, "Fingerprinting ($1/$2)"],
				[/^已安装：(.+)$/, "Installed: $1"],
				[/^媒体类 App 已卸载，缓存为主/, "Media app uninstalled; cache only"],
				[/^媒体类 App 已卸载；体积较大，可能含已下载内容/, "Media app uninstalled; may contain downloads"],
				[/^可能含聊天记录\/文档\/笔记/, "May contain chats/documents/notes"],
				[/^检测到相关进程正在运行，暂不可清理/, "Related process running; cleanup disabled for now"],
				[/^系统自带 App 数据/, "Built-in app data"],
				[/^缓存，可重建；体积较大，请确认对应应用仍在使用/, "Cache, regenerable; large — confirm the app is still in use"],
				[/^缓存，可重建；Playwright 浏览器，测试仍在使用请保留/, "Cache; Playwright browsers — keep if tests use them"],
				[/^缓存，可重建/, "Cache, regenerable"],
				[/^系统缓存，释放空间有限，不建议清理/, "System cache; limited gain, not recommended"],
				[/^聊天数据（图片\/视频\/文件\/缓存），删除后可能无法恢复，需人工确认/, "Chat data (photos/videos/files/cache); may be unrecoverable — confirm manually"],
				[/^Codex 缓存，需要时会重新下载/, "Codex cache; re-downloaded when needed"],
				[/^Maven 仓库，构建时会重新下载/, "Maven repository; re-downloaded on build"],
				[/^打包时会重新下载/, "Re-downloaded when packaging"],
				[/^CocoaPods 缓存，需要时会重新下载/, "CocoaPods cache; re-downloaded when needed"],
				[/^需要时会重新下载/, "Re-downloaded when needed"],
				[/^SwiftPM 缓存/, "SwiftPM cache"],
				[/^pnpm store prune/, "pnpm store prune"],
				[/^npm cache clean --force/, "npm cache clean --force"],
				[/^Xcode 构建缓存，安全可再生/, "Xcode build cache; safe to regenerate"],
				[/^iOS 设备支持文件，需要时会重新下载/, "iOS device support; re-downloaded when needed"],
				[/^模拟器数据，确认不再使用后再清理/, "Simulator data; clean only after confirming it is no longer used"],
				[/^应用归档，提交或回滚时可能需要，需确认/, "App archives; may be needed for submission or rollback"],
				[/^Docker 镜像和数据卷，删除会丢失容器数据，需确认/, "Docker images and volumes; deleting loses container data"],
				// Windows 扫描器（platforms/windows.py）的缓存与残留说明
				[/^程序运行中持续使用；建议用「磁盘清理」处理/, "In use by running programs; use Windows Disk Cleanup instead"],
				[/^需要管理员权限；建议用「磁盘清理」处理/, "Requires administrator rights; use Windows Disk Cleanup instead"],
				[/^媒体类应用已卸载，缓存为主/, "Media app uninstalled; cache only"],
				[/^媒体类应用已卸载；体积较大，可能含已下载内容/, "Media app uninstalled; may contain downloads"],
				[/^会议软件已卸载，缓存\/日志为主/, "Meeting app uninstalled; cache and logs only"],
				[/^未匹配到已安装程序；可能含用户数据/, "No installed app matched; may contain user data"],
				[/^商店应用数据；删除后应用将被重置且数据丢失/, "Store app data; deleting resets the app and loses its data"],
				[/^已卸载 App 的缓存子目录，可重建；文档\/聊天等数据仍保留$/, "Uninstalled app cache subfolders; regenerable, documents and chats stay"],
				[/；其中缓存子目录已单独列出（可清理）$/, "; cache subfolders are listed separately (cleanable)"],
				// 宿主（lib/index.js / lib/clean.js）返回的错误
				[/^扫描结果已过期/, "Scan results have expired; scan again first"],
				[/^没有要估算的路径/, "No paths to estimate"],
				[/^有 (\d+) 项在保护名单中，拒绝清理/, "$1 items are in protected paths; cleanup refused"],
				[/^一次最多清理 (\d+) 项/, "At most $1 items per cleanup"],
				[/^不在最近一次扫描的允许列表中/, "Not in the allowed set of the latest scan"],
				[/^符号链接/, "Symlinks are not supported"],
				[/^个人文件夹之外或受保护的路径不可移动/, "Paths outside the home folder or protected paths cannot be moved"],
				[/^只允许移动个人文件夹内的文件/, "Only files inside the home folder can be moved"],
				[/^只允许浏览个人文件夹/, "Only the home folder can be browsed"],
				[/^只允许打开个人文件夹内的文件或已存在的目录/, "Only files in the home folder or existing directories can be opened"],
				[/^已有移动任务在进行中/, "A move task is already running"],
				[/^当前没有移动任务/, "No move task is running"],
				[/^没有可移动的大文件/, "No large files to move"],
				[/^包含未经最近扫描确认的文件/, "Contains files not confirmed by the latest scan"],
				[/^目标目录不存在/, "Destination folder does not exist"],
				[/^目标目录不可写/, "The destination folder is not writable"],
				[/^目标磁盘空间不足/, "Not enough space on the destination"],
				[/^当前没有进行中的扫描/, "No scan is running"],
				[/^扫描已在进行中/, "A scan is already running"],
				[/^当前没有照片扫描/, "No photo scan is running"],
				[/^已有扫描在进行中/, "A scan is already running"],
				[/^没有可撤销的批次/, "Nothing to undo"],
				[/^找不到该清理批次/, "Batch not found"],
				[/^没有选择任何条目/, "Nothing selected"],
				[/^仅 macOS 支持/, "macOS only"],
				[/^路径不存在/, "Path does not exist"],
				[/^图片不可读/, "Image unreadable"],
				[/^(废纸篓|隔离区)里已没有该批次文件/, "The batch is no longer in $1 (it may have been emptied)"],
			];
			for (const [re, rep] of rules) out = out.replace(re, rep);
			return out;
		}
		function trNote(lang, s) { return lang === "en" ? noteEn(EN[s] || s) : s; }
		// 清理目的地的平台词：macOS 为废纸篓，Windows 与其他平台为隔离区（见 docs/copy-terms.md）。
		function trashWord(lang, platform) {
			if (lang === "en") return platform === "win32" ? "quarantine" : "Trash";
			return platform === "win32" ? "隔离区" : "废纸篓";
		}
		function wizardItems(report, whitelist = []) {
			return buildRows(report, whitelist, "all", "", "sizeDesc", "zh").filter((r) => r.checkable).map((r) => ({ ...r, note: r.note }));
		}

		function wizardInitSel(report, whitelist = []) {
			const next = {};
			for (const it of wizardItems(report, whitelist)) if (it.recommended) next[it.id] = true;
			return next;
		}

		function fmt(kb) {
			if (kb === null || kb === undefined) return "?";
			const n = Number(kb) * 1024;
			if (n < 1024) return `${Math.round(n)}B`;
			if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}K`;
			if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}M`;
			return `${(n / 1024 / 1024 / 1024).toFixed(2)}G`;
		}
		function fmtBytes(b) { return fmt((b || 0) / 1024); }
		function timeStr(at) {
			if (!at) return "—";
			try { return new Date(at).toLocaleString(); } catch { return "—"; }
		}

		// Phosphor Icons (regular), MIT. Vendored from phosphor-icons/core; no runtime CDN.
		const ICONS = {
			"hard-drive": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M224,64H32A16,16,0,0,0,16,80v96a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V80A16,16,0,0,0,224,64Zm0,112H32V80H224v96Zm-24-48a12,12,0,1,1-12-12A12,12,0,0,1,200,128Z\"/></svg>",
			"magnifying-glass": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z\"/></svg>",
			"clock": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z\"/></svg>",
			"shield-check": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M208,40H48A16,16,0,0,0,32,56v56c0,52.72,25.52,84.67,46.93,102.19,23.06,18.86,46,25.26,47,25.53a8,8,0,0,0,4.2,0c1-.27,23.91-6.67,47-25.53C198.48,196.67,224,164.72,224,112V56A16,16,0,0,0,208,40Zm0,72c0,37.07-13.66,67.16-40.6,89.42A129.3,129.3,0,0,1,128,223.62a128.25,128.25,0,0,1-38.92-21.81C61.82,179.51,48,149.3,48,112l0-56,160,0ZM82.34,141.66a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32l-56,56a8,8,0,0,1-11.32,0Z\"/></svg>",
			"arrow-right": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z\"/></svg>",
			"arrow-clockwise": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M240,56v48a8,8,0,0,1-8,8H184a8,8,0,0,1,0-16H211.4L184.81,71.64l-.25-.24a80,80,0,1,0-1.67,114.78,8,8,0,0,1,11,11.63A95.44,95.44,0,0,1,128,224h-1.32A96,96,0,1,1,195.75,60L224,85.8V56a8,8,0,1,1,16,0Z\"/></svg>",
			"trash": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z\"/></svg>",
			"caret-right": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z\"/></svg>",
			"caret-down": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z\"/></svg>",
			"squares-four": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M104,40H56A16,16,0,0,0,40,56v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,104,40Zm0,64H56V56h48v48Zm96-64H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm0,64H152V56h48v48Zm-96,32H56a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,104,136Zm0,64H56V152h48v48Zm96-64H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,200,136Zm0,64H152V152h48v48Z\"/></svg>",
			"code": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M69.12,94.15,28.5,128l40.62,33.85a8,8,0,1,1-10.24,12.29l-48-40a8,8,0,0,1,0-12.29l48-40a8,8,0,0,1,10.24,12.3Zm176,27.7-48-40a8,8,0,1,0-10.24,12.3L227.5,128l-40.62,33.85a8,8,0,1,0,10.24,12.29l48-40a8,8,0,0,0,0-12.29ZM162.73,32.48a8,8,0,0,0-10.25,4.79l-64,176a8,8,0,0,0,4.79,10.26A8.14,8.14,0,0,0,96,224a8,8,0,0,0,7.52-5.27l64-176A8,8,0,0,0,162.73,32.48Z\"/></svg>",
			"globe": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M128,24h0A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24Zm88,104a87.61,87.61,0,0,1-3.33,24H174.16a157.44,157.44,0,0,0,0-48h38.51A87.61,87.61,0,0,1,216,128ZM102,168H154a115.11,115.11,0,0,1-26,45A115.27,115.27,0,0,1,102,168Zm-3.9-16a140.84,140.84,0,0,1,0-48h59.88a140.84,140.84,0,0,1,0,48ZM40,128a87.61,87.61,0,0,1,3.33-24H81.84a157.44,157.44,0,0,0,0,48H43.33A87.61,87.61,0,0,1,40,128ZM154,88H102a115.11,115.11,0,0,1,26-45A115.27,115.27,0,0,1,154,88Zm52.33,0H170.71a135.28,135.28,0,0,0-22.3-45.6A88.29,88.29,0,0,1,206.37,88ZM107.59,42.4A135.28,135.28,0,0,0,85.29,88H49.63A88.29,88.29,0,0,1,107.59,42.4ZM49.63,168H85.29a135.28,135.28,0,0,0,22.3,45.6A88.29,88.29,0,0,1,49.63,168Zm98.78,45.6a135.28,135.28,0,0,0,22.3-45.6h35.66A88.29,88.29,0,0,1,148.41,213.6Z\"/></svg>",
			"app-window": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM80,84A12,12,0,1,1,68,72,12,12,0,0,1,80,84Zm40,0a12,12,0,1,1-12-12A12,12,0,0,1,120,84Z\"/></svg>",
			"chat-circle": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-6.54-.67L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z\"/></svg>",
			"folder": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72ZM40,56H92.69l16,16H40ZM216,200H40V88H216Z\"/></svg>",
			"lock-simple": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96ZM208,208H48V96H208V208Z\"/></svg>",
			"info": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z\"/></svg>",
			"dots-three": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M140,128a12,12,0,1,1-12-12A12,12,0,0,1,140,128Zm56-12a12,12,0,1,0,12,12A12,12,0,0,0,196,116ZM60,116a12,12,0,1,0,12,12A12,12,0,0,0,60,116Z\"/></svg>",
			"x": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z\"/></svg>",
			"check-circle": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z\"/></svg>",
			"warning-circle": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm-8-80V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z\"/></svg>"
};
		const STYLES = `
.dc{--dc-bg:#fff;--dc-text:#182230;--dc-muted:#667085;--dc-line:#e7ebf1;--dc-tint:#f5f8fe;--dc-blue:#356ae6;--dc-select:#edf3ff;--dc-green:#18794e;--dc-green-bg:#e9f7ef;--dc-amber:#986316;--dc-amber-bg:#fff4df;box-sizing:border-box;height:100%;overflow:auto;background:var(--dc-bg);color:var(--dc-text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.5;color-scheme:light}
.dc *{box-sizing:border-box}
.dc button,.dc input,.dc select,.dc summary{font:inherit}
.dc button,.dc summary{cursor:pointer}
.dc button:disabled{cursor:not-allowed;opacity:.48}
.dc button:focus-visible,.dc input:focus-visible,.dc select:focus-visible,.dc summary:focus-visible{outline:3px solid #94b8ff;outline-offset:3px}
.dc button{transition:background .15s,color .15s}
.dc button:not(:disabled):hover{filter:brightness(.95)}
.dc .dc-header{position:sticky;top:0;z-index:10;background:var(--dc-bg);padding:18px 34px 0;border-bottom:1px solid var(--dc-line);display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:64px}
.dc .dc-brand{display:flex;align-items:center;gap:12px;font-size:19px;font-weight:650;white-space:nowrap;padding-bottom:18px;letter-spacing:-.5px}
.dc .dc-nav{display:flex;gap:24px;align-self:stretch}
.dc .dc-nav button{background:none;border:0;border-bottom:3px solid transparent;color:var(--dc-muted);padding:0 5px 16px;font-weight:500}
.dc .dc-nav button[aria-current=page]{color:var(--dc-blue);border-color:var(--dc-blue)}
.dc .dc-content{max-width:1440px;margin:auto;padding:34px 48px 0;min-height:calc(100% - 66px);display:flex;flex-direction:column}
.dc h1{font-size:30px;letter-spacing:-.7px;line-height:1.25;margin:0 0 10px;font-weight:700}
.dc h2{font-size:22px;line-height:1.4;margin:0 0 8px;font-weight:650}
.dc p{margin:0}
.dc .dc-subtitle{color:var(--dc-muted);font-size:15px}
.dc .dc-button{display:inline-flex;align-items:center;justify-content:center;gap:9px;padding:10px 17px;min-height:42px;border:1px solid #d5dce6;border-radius:8px;background:var(--dc-bg);color:var(--dc-text);font-weight:500;white-space:nowrap;text-decoration:none}
.dc .dc-primary{background:var(--dc-blue);border-color:var(--dc-blue);color:white}
.dc .dc-link{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:none;border:0;color:var(--dc-blue);padding:6px 0;white-space:nowrap;text-decoration:none}
.dc td .dc-link+.dc-link,.dc .dc-detail-grid dd .dc-link+.dc-link{margin-left:14px}
.dc .dc-muted{color:var(--dc-muted)}
.dc .dc-icon-disc{width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--dc-select);flex-shrink:0}
.dc .dc-disk-summary{display:flex;align-items:center;gap:42px;padding:36px 0 32px}
.dc .dc-disk-data{display:flex;align-items:center;gap:18px;flex:1;min-width:310px}
.dc .dc-drive-image{width:114px;height:114px;object-fit:contain;flex-shrink:0}
.dc .dc-drive-name{font-size:14px;margin-bottom:4px;overflow-wrap:anywhere}
.dc .dc-free{font-size:48px;font-weight:650;line-height:1.2;letter-spacing:-1.6px;white-space:nowrap;font-variant-numeric:tabular-nums}
.dc .dc-free-label{color:var(--dc-muted);margin-top:3px}
.dc .dc-capacity{font-size:13px;color:var(--dc-muted);margin-top:12px}
.dc .dc-live{font-size:11px;color:var(--dc-muted);font-weight:400;margin-left:8px}
.dc .dc-capacity-chart{flex:.95;min-width:230px}
.dc .dc-capacity-track{height:22px;border-radius:7px;background:var(--dc-line);overflow:hidden}
.dc .dc-capacity-used{height:100%;background:#4c82f7}
.dc .dc-legend{display:flex;gap:30px;justify-content:space-between;margin-top:15px;font-size:13px;color:var(--dc-muted)}
.dc .dc-legend span{display:flex;align-items:center;gap:8px}
.dc .dc-key{width:10px;height:10px;border-radius:50%;display:inline-block;background:var(--dc-line)}
.dc .dc-key-used{background:#4c82f7}
.dc .dc-home-action>.dc-icon-disc{width:96px;height:96px}
.dc .dc-home-action>.dc-icon-disc img{width:48px;height:48px}
.dc .dc-home-action{display:flex;align-items:center;gap:28px;padding:30px 32px;border-radius:12px;background:var(--dc-tint);margin:0 0 26px}
.dc .dc-home-action-body{flex:1;min-width:0}
.dc .dc-home-actions{display:flex;gap:24px;align-items:center;margin:20px 0 12px;flex-wrap:wrap}
.dc .dc-home-action .dc-primary{min-width:168px}
.dc .dc-caption{font-size:12px;color:var(--dc-muted)}
.dc .dc-scan-options{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px;padding-top:18px;border-top:1px solid var(--dc-line)}
.dc .dc-recent{display:flex;align-items:center;gap:18px;border-top:1px solid var(--dc-line);padding:18px 0 18px;margin-top:auto}
.dc .dc-recent .dc-icon-disc{width:52px;height:52px;background:var(--dc-tint)}
.dc .dc-recent-body{flex:1;min-width:0}
.dc .dc-recent-title{font-weight:600;margin-bottom:6px}
.dc .dc-recent-note{display:flex;align-items:center;gap:7px;margin-top:6px}
.dc .dc-notice{display:flex;align-items:flex-start;gap:10px;white-space:pre-wrap;overflow-wrap:anywhere;padding:12px 16px;background:var(--dc-tint);border:1px solid var(--dc-line);border-radius:8px;font-size:13px;margin:0 0 20px}
.dc .dc-notice span{flex:1;min-width:0}
.dc .dc-notice button{padding:0;background:none;border:0}
.dc .dc-progress{margin:20px 0}
.dc .dc-progress-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:16px}
.dc .dc-progress-track{height:6px;border-radius:4px;background:var(--dc-line);overflow:hidden}
.dc .dc-progress-fill{height:100%;background:var(--dc-blue);transition:width .4s}
.dc .dc-progress-meta{display:flex;justify-content:space-between;gap:12px;margin-top:8px;color:var(--dc-muted);font-size:12px}
.dc .dc-page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:30px}
.dc .dc-page-meta{display:flex;align-items:center;gap:15px;flex-wrap:wrap;color:var(--dc-muted);font-size:13px}
.dc .dc-mode-switch{display:flex;gap:20px;font-size:13px}
.dc .dc-mode-switch button{padding:7px 0;background:none;border:0;border-bottom:2px solid transparent;color:var(--dc-muted)}
.dc .dc-mode-switch button[aria-pressed=true]{color:var(--dc-blue);border-bottom-color:var(--dc-blue)}
.dc .dc-clean{display:flex;flex-direction:column;flex:1;min-height:0}
.dc .dc-clean-workspace{display:grid;grid-template-columns:184px minmax(0,1fr);gap:26px;flex:1;align-items:start}
.dc .dc-categories{border-right:1px solid var(--dc-line);padding-right:16px;min-height:100%}
.dc .dc-category-title{font-size:12px;font-weight:600;margin:0 12px 12px}
.dc .dc-category{width:100%;background:none;border:0;border-left:3px solid transparent;padding:13px 10px;display:flex;gap:12px;text-align:left;align-items:flex-start;border-radius:5px;color:var(--dc-text);margin-bottom:3px}
.dc .dc-category[aria-pressed=true]{background:var(--dc-select);border-left-color:var(--dc-blue);color:var(--dc-blue)}
.dc .dc-category small{display:block;color:var(--dc-muted);font-size:12px;margin-top:4px}
.dc .dc-category[aria-pressed=true] small{color:var(--dc-blue)}
.dc .dc-category-title-readonly{margin-top:22px;color:var(--dc-muted)}
.dc .dc-clean-main{min-width:0;padding-bottom:20px}
.dc .dc-clean-toolbar{display:flex;align-items:center;gap:8px;margin-bottom:20px;flex-wrap:wrap}
.dc .dc-clean-total{margin-right:auto;padding-right:12px;font-weight:600;font-size:16px}
.dc .dc-clean-total strong{font-size:24px;margin-left:8px;letter-spacing:-.5px;white-space:nowrap}
.dc .dc-clean-total small{font-size:12px;font-weight:400;display:block;color:var(--dc-muted);margin-top:3px}
.dc .dc-field{display:flex;align-items:center;gap:7px;border:1px solid #d5dce6;border-radius:7px;padding:0 9px;background:var(--dc-bg);height:36px;min-width:0}
.dc .dc-field input{border:0;outline:none;background:none;color:var(--dc-text);width:150px;min-width:0;font-size:12px;padding:6px 0}
.dc .dc-select{border:1px solid #d5dce6;border-radius:7px;background:var(--dc-bg);color:var(--dc-text);padding:7px 9px;font-size:12px;min-height:36px;max-width:100%}
.dc .dc-file-table{width:100%;border-collapse:collapse;table-layout:fixed}
.dc .dc-file-table th{text-align:left;color:var(--dc-muted);font-size:12px;font-weight:500;padding:10px 8px;border-top:1px solid var(--dc-line);border-bottom:1px solid var(--dc-line)}
.dc .dc-file-table td{padding:18px 8px;border-bottom:1px solid var(--dc-line);vertical-align:top;font-size:13px}
.dc .dc-file-table .dc-check-col{width:34px;padding-left:0}
.dc input[type=checkbox]{accent-color:var(--dc-blue);width:17px;height:17px;cursor:pointer;vertical-align:middle;margin:2px 0}
.dc .dc-file-table .dc-size-col{width:88px;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.dc .dc-file-table .dc-impact-col{width:30%;padding-left:20px}
.dc .dc-file-table .dc-detail-col{width:85px;text-align:right;padding-right:0}
.dc .dc-file-name{display:flex;gap:12px;align-items:center;min-width:0}
.dc .dc-file-name-body{min-width:0}
.dc .dc-file-name strong{font-size:13px;font-weight:550;display:block;overflow-wrap:anywhere}
.dc .dc-file-path{color:var(--dc-muted);font-size:11px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dc .dc-file-icon{display:flex;align-items:center;justify-content:center;flex-shrink:0;width:32px;height:34px;border-radius:6px;background:var(--dc-tint)}
.dc .dc-badge{display:inline-block;padding:2px 7px;font-size:11px;line-height:1.5;border-radius:4px;color:var(--dc-green);background:var(--dc-green-bg);white-space:nowrap}
.dc .dc-badge-review{background:var(--dc-amber-bg);color:var(--dc-amber)}
.dc .dc-badge-protected,.dc .dc-badge-optional{background:var(--dc-tint);color:var(--dc-muted)}
.dc .dc-impact{font-size:11px;line-height:1.55;color:var(--dc-muted);margin-top:4px;overflow-wrap:anywhere}
.dc .dc-details-button{font-size:12px}
.dc .dc-expanded td{background:var(--dc-tint);padding:18px 20px}
.dc .dc-detail-grid{display:grid;grid-template-columns:100px minmax(0,1fr);gap:8px 14px;font-size:12px}
.dc .dc-detail-grid dt{color:var(--dc-muted)}
.dc .dc-detail-grid dd{margin:0;overflow-wrap:anywhere}
.dc .dc-empty{text-align:center;color:var(--dc-muted);padding:65px 20px 80px}
.dc .dc-empty h2{font-size:18px;color:var(--dc-text);margin:15px 0 8px}
.dc .dc-empty p{max-width:440px;margin:0 auto 18px;font-size:13px}
.dc .dc-action-bar{position:sticky;bottom:0;background:var(--dc-bg);border-top:1px solid var(--dc-line);padding:18px 0 16px;z-index:2;margin-top:25px}
.dc .dc-action-bar-main{display:flex;align-items:center;gap:20px;flex-wrap:wrap}
.dc .dc-selection{display:flex;align-items:center;gap:20px;margin-right:auto;flex-wrap:wrap}
.dc .dc-selection strong{font-size:16px}
.dc .dc-action-bar .dc-caption{display:flex;align-items:center;gap:8px;margin-top:10px}
.dc .dc-more{position:relative}
.dc .dc-menu{position:absolute;right:0;bottom:calc(100% + 9px);min-width:220px;border:1px solid var(--dc-line);border-radius:9px;background:var(--dc-bg);box-shadow:0 8px 26px #172b4d16;padding:6px;z-index:5}
.dc .dc-menu button{border:0;background:none;display:block;text-align:left;width:100%;padding:9px 12px;border-radius:5px;color:var(--dc-text);font-size:13px}
.dc .dc-menu button:hover{background:var(--dc-tint)}
.dc .dc-confirm{background:var(--dc-tint);border:1px solid var(--dc-line);border-radius:10px;padding:16px;margin-bottom:15px}
.dc .dc-confirm strong{display:block;margin-bottom:6px}
.dc .dc-confirm-actions{display:flex;gap:12px;margin-top:12px}
.dc .dc-legacy-page{padding-bottom:32px}
.dc .dc-wizard{margin-bottom:26px}
.dc .dc-wizard button{font-size:13px;min-height:34px}
.dc .dc-wizard label{min-height:39px}
.dc .dc-mobile-impact{display:none}
@media(min-width:1450px){.dc .dc-content{padding-top:45px}
.dc .dc-disk-summary{padding-top:58px;padding-bottom:50px}
.dc .dc-home-action{padding:38px}
.dc .dc-clean{min-height:650px}}
@media(max-width:1100px){.dc .dc-header{padding-left:28px;padding-right:28px}
.dc .dc-content{padding:28px 28px 0}
.dc .dc-nav{gap:15px}
.dc .dc-disk-summary{gap:22px}
.dc .dc-clean-workspace{grid-template-columns:165px minmax(0,1fr);gap:18px}
.dc .dc-clean-total{margin-bottom:0}
.dc .dc-clean-total strong{font-size:22px}
.dc .dc-field input{width:120px}
.dc .dc-file-table .dc-impact-col{width:28%;padding-left:12px}
.dc .dc-file-table .dc-detail-col{width:58px}
.dc .dc-details-button{font-size:11px}
.dc .dc-details-button img{display:none}}
@media(max-width:760px){.dc .dc-header{padding:17px 20px 0;display:block}
.dc .dc-brand{padding-bottom:12px;font-size:17px}
.dc .dc-nav{gap:4px;justify-content:space-between}
.dc .dc-nav button{padding:0 2px 12px}
.dc .dc-content{padding:26px 20px 0}
.dc h1{font-size:26px}
.dc .dc-disk-summary{flex-wrap:wrap;padding:28px 0}
.dc .dc-disk-data{min-width:0}
.dc .dc-drive-image{width:88px;height:88px}
.dc .dc-free{font-size:40px}
.dc .dc-capacity-chart{flex-basis:100%;padding:0 4px}
.dc .dc-home-action{padding:24px;gap:18px}
.dc .dc-home-action>.dc-icon-disc{display:none}
.dc .dc-recent{align-items:flex-start;flex-wrap:wrap}
.dc .dc-recent>.dc-link{margin-left:70px}
.dc .dc-clean-workspace{display:flex;flex-direction:column;gap:20px}
.dc .dc-categories{display:flex;overflow:auto;width:100%;padding:0 0 10px;border-right:0;border-bottom:1px solid var(--dc-line);min-height:0;gap:6px}
.dc .dc-category-title{display:none}
.dc .dc-category{width:auto;min-width:120px;padding:9px 10px;border-left:0;border-bottom:2px solid transparent;flex-shrink:0}
.dc .dc-category[aria-pressed=true]{border-bottom-color:var(--dc-blue)}
.dc .dc-category img{display:none}
.dc .dc-category small{font-size:11px}
.dc .dc-clean-main{width:100%}
.dc .dc-page-head{gap:12px;flex-wrap:wrap;margin-bottom:24px}
.dc .dc-file-table .dc-impact-col{display:none}
.dc .dc-file-table .dc-size-col{width:70px}
.dc .dc-file-table .dc-detail-col{width:55px}
.dc .dc-mobile-impact{display:block;margin-top:6px}
.dc .dc-file-table td{padding:15px 5px}
.dc .dc-file-name{gap:8px}
.dc .dc-file-icon{width:28px}
.dc .dc-file-name strong{font-size:12px}
.dc .dc-action-bar-main{gap:10px}
.dc .dc-selection{flex-basis:100%}
.dc .dc-detail-grid{grid-template-columns:1fr}
.dc .dc-clean{min-height:620px}
.dc .dc-caption{font-size:12px}
.dc .dc-field{flex:1}
.dc .dc-field input{width:100%}}
@media(prefers-reduced-motion:reduce){.dc *{transition:none!important}}
@media(prefers-color-scheme:dark){.dc{--dc-bg:#171b23;--dc-text:#eef2f8;--dc-muted:#abb6c8;--dc-line:#343e50;--dc-tint:#202938;--dc-blue:#91b4ff;--dc-select:#283c60;--dc-green:#8cdbb2;--dc-green-bg:#183c2e;--dc-amber:#edc37d;--dc-amber-bg:#443822;color-scheme:dark}
.dc .dc-primary{background:#356ae6;border-color:#356ae6;color:white}
.dc .dc-button,.dc .dc-field,.dc .dc-select{border-color:var(--dc-line)}}


.dc .dc-space-grid{display:grid;grid-template-columns:250px minmax(0,1fr);gap:32px;align-items:start;margin-top:22px}
.dc .dc-space-crumbs,.dc .dc-space-tools{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:14px}
.dc .dc-space-entry{display:flex;align-items:center;gap:8px;background:none;border:0;color:inherit;text-align:left;padding:8px 0;overflow-wrap:anywhere;cursor:pointer;min-height:40px}
.dc .dc-space-legend{display:flex;align-items:center;gap:8px;font-size:13px;padding:7px 0;overflow-wrap:anywhere}
.dc .dc-space-legend>span{width:10px;height:10px;border-radius:3px;flex-shrink:0}.dc .dc-space-legend strong{margin-left:auto}
.dc .dc-space-bar{height:3px;background:var(--dc-line);margin-top:7px;min-width:55px}.dc .dc-space-bar span{display:block;height:100%;background:var(--dc-blue)}
.dc .dc-space-cleanable{display:block;background:none;border:0;color:var(--dc-green);font-size:11px;padding:2px 0 0;cursor:pointer;text-align:left}
.dc .dc-space-actions{position:sticky;bottom:0;background:var(--dc-bg);border-top:1px solid var(--dc-line);padding:16px 0;display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.dc .dc-space-actions input,.dc .dc-space-actions select{max-width:100%}
.dc .dc-space-filters{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0;align-items:center}
.dc .dc-space-filters input{min-width:180px;flex:1}
.dc .dc-space-filters input,.dc .dc-space-filters select,.dc .dc-space-actions input,.dc .dc-space-actions select{font:inherit;font-size:13px;padding:9px;border:1px solid var(--dc-line);border-radius:7px;background:var(--dc-bg);color:var(--dc-text)}
.dc button:focus-visible,.dc input:focus-visible,.dc select:focus-visible{outline:2px solid var(--dc-blue);outline-offset:3px}
@media(max-width:760px){.dc .dc-space-grid{grid-template-columns:minmax(0,1fr)}.dc .dc-space-grid aside{max-width:300px}.dc .dc-space-filters>*{max-width:100%}}
`;
		function Icon({ name, size = 20, color = "currentColor", ...props }) {
			const svg = (ICONS[name] || ICONS["folder"]).replace(/currentColor/g, color === "currentColor" ? "#667085" : color);
			return h("img", { ...props, src: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg), width: size, height: size, alt: "", "aria-hidden": true, style: { flexShrink: 0, verticalAlign: "middle", ...props.style } });
		}
		function recentTime(at, lang) {
			if (!at) return "—";
			const date = new Date(at);
			const locale = lang === "en" ? "en-US" : "zh-CN";
			if (date.toDateString() === new Date().toDateString()) return tf(lang, "今天 {time}", { time: date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: lang === "en" }) });
			return date.toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
		}
		function DiskIcon() {
			return h("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
				h("rect", { x: 3, y: 4, width: 18, height: 7, rx: 2 }),
				h("rect", { x: 3, y: 13, width: 18, height: 7, rx: 2 }),
				h("circle", { cx: 7.5, cy: 7.5, r: 0.8, fill: "currentColor", stroke: "none" }),
				h("circle", { cx: 7.5, cy: 16.5, r: 0.8, fill: "currentColor", stroke: "none" }));
		}

		function displaySize(kb) {
			const n = Math.max(0, Number(kb) || 0) * 1024;
			if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
			if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
			if (n >= 1024) return `${Math.round(n / 1024)} KB`;
			return `${Math.round(n)} B`;
		}
		function normalizedPath(p) { return String(p || "").replace(/\\/g, "/").replace(/\/+$/, ""); }
		// Windows 报告路径用反斜杠；显示与派生一律先归一化再拆分。
		function baseName(p) { return normalizedPath(p).split("/").pop(); }
		function parentDir(p) { const n = normalizedPath(p); const i = n.lastIndexOf("/"); return i > 0 ? n.slice(0, i) : n; }
		function pathDepth(p) { return normalizedPath(p).split("/").length; }
		function insidePath(p, parent) {
			const win = /^[a-z]:/i.test(p) || /^[a-z]:/i.test(parent);
			const a = win ? normalizedPath(p).toLowerCase() : normalizedPath(p);
			const b = win ? normalizedPath(parent).toLowerCase() : normalizedPath(parent);
			return a === b || a.startsWith(b + "/");
		}
		function uniquePaths(paths) {
			return [...new Set(paths)].sort((a, b) => a.length - b.length).filter((p, i, all) => !all.slice(0, i).some((parent) => insidePath(p, parent)));
		}
		function rowRisk(row) { return row.protected ? "protected" : !row.checkable ? "review" : row.recommended ? "recommended" : "optional"; }
		// 清理列表固定分组：可勾选（推荐 → 可选）在前，「需确认」其后，只读的「受保护」最后；
		// 组内仍按用户选择的大小/名称排序（不把只读项混进可清理项里）。
		const RISK_ORDER = { recommended: 0, optional: 1, review: 2, protected: 3 };
		function riskLabel(lang, row) { return tr(lang, { protected: "受保护", review: "需确认", recommended: "推荐清理", optional: "可选清理" }[rowRisk(row)]); }
		function shortPath(p, home) { return home && insidePath(p, home) ? "~" + p.slice(home.length) : p; }
		function devName(p, lang) {
			const names = [[/DerivedData/, "Xcode DerivedData"], [/\/\.npm\//, "npm 缓存"], [/\/\.m2\/repository/, "Maven 本地仓库"], [/pnpm.*store/, "pnpm 缓存"], [/codex-runtimes/, "Codex 运行缓存"], [/Xcode\/Archives/, "Xcode 归档"], [/CoreSimulator/, "iOS 模拟器数据"]];
			const found = names.find(([re]) => re.test(normalizedPath(p)));
			return found ? tr(lang, found[1]) : normalizedPath(p).split("/").pop();
		}
		function impactOf(lang, row) {
			if (row.protected) return tr(lang, "已加入保护，不会移动");
			if (!row.checkable) return row.note || tr(lang, "可能含重要数据，仅供查看");
			if (row.category === "dev") {
				const p = normalizedPath(row.paths[0] || "");
				// 按「什么时候会重新下载」区分，避免把 pnpm store 说成“使用时”才重新下载。
				if (/\/\.m2\/repository/.test(p)) return tr(lang, "离线构建可能受影响");
				if (/\/\.npm\/|\/pnpm\/store/.test(p)) return tr(lang, "安装依赖时可能重新下载");
				if (/DerivedData/.test(p)) return tr(lang, "下次构建时重新生成");
				if (/electron-builder|node-gyp|next-swc|CocoaPods|org\.swift\.swiftpm/.test(p)) return tr(lang, "下次构建或打包时可能重新下载");
				if (/DeviceSupport/.test(p)) return tr(lang, "再次连接设备时可能重新下载");
				return tr(lang, "使用时可能重新下载或构建");
			}
			if (row.category === "browser") return tr(lang, "网页资源可能需要重新加载");
			if (row.category === "app") return tr(lang, /正在运行/.test(row.note || "") ? "App 正在运行，退出后可清理" : "App 缓存可重新生成，不影响聊天/文档");
			return row.note || tr(lang, "缓存可重新生成");
		}


		const btn = { padding: "4px 10px", border: "1px solid rgba(127,127,127,.45)", borderRadius: 6, background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12 };
		const btnPrimary = { ...btn, borderColor: "rgba(80,140,255,.8)", color: "rgba(80,140,255,1)" };
		const btnDanger = { ...btn, borderColor: "rgba(229,83,75,.8)", color: "#e5534b" };
		const navBtn = (active) => ({ padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, border: "none", background: active ? "rgba(80,140,255,.16)" : "transparent", color: active ? "rgba(80,140,255,1)" : "inherit", opacity: active ? 1 : 0.75, textAlign: "left", width: "100%" });
		const table = { width: "100%", borderCollapse: "collapse", fontSize: 12.5 };
		const td = { padding: "6px", borderTop: "1px solid rgba(127,127,127,.18)", verticalAlign: "top" };
		const th = { ...td, textAlign: "left", fontWeight: 500, opacity: 0.6, borderTop: "none" };
		const input = { padding: "4px 8px", border: "1px solid rgba(127,127,127,.45)", borderRadius: 6, background: "transparent", color: "inherit", fontSize: 12, minWidth: 160 };
		const card = { border: "1px solid rgba(127,127,127,.25)", borderRadius: 10, padding: "12px 14px", flex: "1 1 180px", minWidth: 170 };


		function buildRows(report, whitelist, tab, search, sort, lang) {
			if (!report) return [];
			const rows = [];
			const running = [...(report.caches || []), ...(report.devCaches || []), ...(report.browsers || []), ...(report.appCaches || [])]
				.filter((item) => item.running).flatMap((item) => item.paths || [item.path]).filter(Boolean);
			const add = (row) => {
				row.paths = [...new Set((row.paths || []).filter(Boolean))];
				if (row.checkable && row.paths.some((p) => running.some((base) => insidePath(p, base) || insidePath(base, p)))) {
					row.checkable = false; row.recommended = false;
					row.note = tr(lang, "App 正在运行，退出后可清理");
				}
				row.protected = row.paths.some((p) => whitelist.some((w) => insidePath(p, w)));
				row.checkable = !!row.checkable && !row.protected && row.paths.length > 0;
				rows.push(row);
			};
			for (const g of report.leftoverGroups || []) add({ id: `g:${g.baseId}`, bucket: g.bucket, category: "leftover", name: `${g.name || g.baseId}${g.cachePart ? ` · ${tr(lang, "缓存")}` : ""}`, paths: g.paths, kb: g.kb, note: trNote(lang, g.why || ""), checkable: g.bucket === "safe", recommended: g.bucket === "safe", unknown: !g.cachePart && (!g.name || g.name === g.baseId) });
			for (const a of report.appCaches || []) add({ id: `a:${a.baseId}`, bucket: "app", category: "app", name: `${a.app || a.baseId} · ${tr(lang, "应用缓存")}`, paths: a.paths, kb: a.kb, note: tr(lang, a.running ? "App 正在运行，退出后可清理" : "已安装 App 的缓存/临时文件，可重建，不碰聊天/文档"), checkable: a.cleanable !== false && !a.running, recommended: a.cleanable !== false && !a.running });
			for (const d of report.devCaches || []) add({ id: `d:${d.path}`, bucket: "dev", category: "dev", name: devName(d.path, lang), paths: [d.path], kb: d.kb, note: trNote(lang, d.advice || "缓存"), checkable: d.cleanable !== false, recommended: d.cleanable !== false });
			for (const b of report.browsers || []) add({ id: `b:${b.path}`, bucket: "cache", category: "browser", name: `${b.name} · ${tr(lang, "缓存")}`, paths: [b.path], kb: b.kb, note: tr(lang, b.running ? "App 正在运行，退出后可清理" : "浏览器缓存，可重建（不碰书签/密码）"), checkable: !b.running, recommended: !b.running });
			for (const app of report.special || []) for (const c of app.categories || []) add({ id: `s:${app.app}:${c.name}`, bucket: "special", category: "special", name: `${app.app} · ${tr(lang, c.name)}`, paths: c.paths, kb: c.kb, note: tr(lang, c.cleanable ? "缓存可重新生成" : "聊天数据只读；缓存可清理"), checkable: !!c.cleanable, recommended: !!c.cleanable });
			// Generic caches may contain an already listed browser/developer directory. Prefer the specific explanation.
			const specific = rows.flatMap((r) => r.paths);
			for (const c of report.caches || []) {
				if (specific.some((p) => insidePath(c.path, p) || insidePath(p, c.path))) continue;
				// admin 项（如 C:\Windows\Temp）、cleanable=false 的项（如被占用的 Temp）与运行中应用的缓存仅供查看。
				const locked = !!c.system || !!c.admin || c.cleanable === false || !!c.running;
				add({ id: `c:${c.path}`, bucket: c.system ? "system" : "cache", category: c.system ? "system" : "other", name: baseName(c.path), paths: [c.path], kb: c.kb, note: c.running ? tr(lang, "App 正在运行，退出后可清理") : c.advice ? trNote(lang, c.advice) : tr(lang, c.system ? "系统缓存，释放空间有限，不建议清理" : "缓存可重新生成"), checkable: !locked, recommended: false });
			}
			const seen = new Set();
			const q = search.trim().toLowerCase();
			const filtered = rows.filter((r) => {
				const key = r.paths.map(normalizedPath).sort().join("\n");
				if (seen.has(key)) return false;
				seen.add(key);
				if (tab === "safe" && r.bucket !== "safe") return false;
				if (tab === "confirm" && r.bucket !== "confirm") return false;
				if (tab === "cache" && r.bucket !== "cache" && r.bucket !== "dev") return false;
				if (tab === "keep" && r.bucket !== "system") return false;
				if (["dev", "browser", "leftover", "app", "special", "other", "system"].includes(tab) && r.category !== tab) return false;
				if (q && !(r.name + " " + r.paths.join(" ") + " " + r.note).toLowerCase().includes(q)) return false;
				return true;
			});
			filtered.sort((a, b) => {
				const rank = RISK_ORDER[rowRisk(a)] - RISK_ORDER[rowRisk(b)];
				if (rank !== 0) return rank;
				return sort === "name" ? String(a.name).localeCompare(String(b.name)) : sort === "sizeAsc" ? a.kb - b.kb : b.kb - a.kb;
			});
			return filtered;
		}

		// ── AI 入口（只读解释）──────────────────────────────────────────────
		// 约定：提示词里只放「程序已经算好的数据」；模型只负责解释与建议，不参与允许集合判定，
		// 也不产生任何写操作；真正的清理仍由用户在面板二次确认。
		const AI_CATEGORY_LABEL = {
			all: "全部项目", dev: "开发缓存", browser: "浏览器缓存", leftover: "应用残留",
			app: "应用缓存", special: "聊天软件缓存", other: "其他缓存", system: "系统缓存",
		};

		function createAiBridge(ctx) {
			// 用 ctx.get 取可选服务：缺少会话服务时插件仍要正常渲染扫描/清理面板，AI 入口降级即可。
			const pick = (name) => {
				try {
					if (ctx && typeof ctx.get === "function") return ctx.get(name);
					return ctx ? ctx[name] : undefined;
				} catch { return undefined; }
			};
			// 服务在 apply 时可能还没就绪（client 插件的加载顺序不定），所以每次调用再解析一次。
			const usableSessions = (candidate) => !!(candidate && candidate.list && typeof candidate.list.getSnapshot === "function" && typeof candidate.binding === "function");
			function currentSessionId(sessions) {
				try {
					const snap = sessions.list.getSnapshot() || {};
					const byId = snap.byId || {};
					const ids = Array.isArray(snap.ids) ? snap.ids : Object.keys(byId);
					for (const id of ids) {
						const row = byId[id];
						if (row && ((row.retainedBy && row.retainedBy.mainView) || 0) > 0) return id;
					}
				} catch { /* 会话服务异常按不可用处理 */ }
				return "";
			}
			async function ask(text) {
				const prompt = typeof text === "string" ? text.trim() : "";
				if (!prompt) return "error";
				const sessions = pick("sessions");
				if (!usableSessions(sessions)) return "unavailable";
				const id = currentSessionId(sessions);
				if (!id) return "no-session";
				try {
					const binding = sessions.binding(id);
					const session = binding && binding.session;
					if (!session || typeof session.prompt !== "function") return "unavailable";
					const result = await session.prompt([{ type: "text", text: prompt }], "queue");
					if (!result || result.ok !== true) return "error";
					try {
						const layout = pick("layout");
						if (layout && typeof layout.selectPanel === "function") layout.selectPanel(null);
					} catch { /* 切换面板失败不影响已发送的消息 */ }
					return "sent";
				} catch { return "error"; }
			}
			return {
				ask,
				get available() { return usableSessions(pick("sessions")); },
			};
		}

		function aiRules(lang) {
			return (lang === "en" ? [
				"Answer rules:",
				"1) Use only the data above plus facts returned by the read-only disk_inspect tool; sizes are computed by the app, do not recompute them.",
				"2) Say \"not sure\" when the data is insufficient; never invent app names, purposes, or sizes.",
				"3) Do not print delete/cleanup commands and never claim you cleaned anything; the user still confirms in the panel.",
				"4) Lead with the conclusion, then 2–4 reasons, under 120 words.",
			] : [
				"回答要求：",
				"1) 只使用上面提供的数据，以及只读工具（disk_inspect）返回的事实；数字已由程序算好，不要自行重算或估算。",
				"2) 数据不足时直接说“不确定”，不要编造应用名、用途或大小。",
				"3) 不要输出删除/清理命令，也不要声称已经替用户清理；用户仍会在面板里二次确认。",
				"4) 先给结论，再给 2–4 条理由，总长度控制在 200 字以内。",
			]).join("\n");
		}

		// 提示词里的「清理影响」：开发缓存走面板的安全文案（不把扫描器 advice 里的命令带进来）；
		// 其余行保留具体说明（运行中、聊天数据、需确认原因），否则复核/需确认行会退化成一句空话。
		function aiImpactOf(lang, row) {
			if (row && row.category === "dev") return impactOf(lang, row);
			return (row && row.note) || impactOf(lang, row);
		}

		function aiReportDigest(lang, report, rows, at) {
			if (!report) return "";
			const zh = lang !== "en";
			const L = [];
			const disk = report.disk || {};
			const est = report.estimate || {};
			const fda = report.fda ? report.fda.status : "unknown";
			// 条目统一用 buildRows 的完整行集（含未展示的），保证「合计」与「未列出」可核对。
			const list = (rows || []).filter((r) => Number(r.kb) > 0);
			const sum = (items) => items.reduce((n, r) => n + (Number(r.kb) || 0), 0);
			const catLabel = (c) => tr(lang, AI_CATEGORY_LABEL[c] || c);
			L.push(zh ? "## 磁盘体检数据（DeepClean 面板提供）" : "## Disk checkup data (provided by the DeepClean panel)");
			L.push(zh
				? `- 扫描时间：${timeStr(at)}；平台：${report.platform || "?"}；完全磁盘访问：${fda}；扫描耗时：${report.elapsed || "?"}s`
				: `- Scan time: ${timeStr(at)}; platform: ${report.platform || "?"}; Full Disk Access: ${fda}; duration: ${report.elapsed || "?"}s`);
			if (disk.total) {
				L.push(zh
					? `- 数据卷：总 ${fmtBytes(disk.total)}，已用 ${fmtBytes(disk.used)}，可用 ${fmtBytes(disk.free)}`
					: `- Volume: total ${fmtBytes(disk.total)}, used ${fmtBytes(disk.used)}, free ${fmtBytes(disk.free)}`);
			}
			L.push(zh
				? "- 范围说明：下面只统计扫描器识别的可清理 / 需确认项，不等于整盘占用分布（用户文件、系统数据不在其中）；回答「空间主要被什么占用」时必须说明这一点。"
				: "- Scope: the rows below cover only cleanup-relevant items the scanner recognized; they are not a full-disk usage breakdown. Say so when asked what uses most space.");
			// 按分类合计：让模型能回答「钱花在哪」，而不是只看 Top 6。
			const catParts = ["dev", "browser", "leftover", "app", "special", "other", "system"].map((c) => {
				const items = list.filter((r) => r.category === c);
				return items.length > 0 ? `${catLabel(c)} ${fmt(sum(items))}（${items.length} ${zh ? "项" : "items"}）` : "";
			}).filter(Boolean);
			if (catParts.length > 0) L.push(`${zh ? "- 按分类合计" : "- Totals by category"}：${catParts.join("；")}`);
			if (Number.isFinite(est.totalKb)) {
				L.push(zh
					? `- 面板估算合计（已去重、不含需确认）：${fmt(est.totalKb)}（用户缓存 ${fmt(est.cacheKb)} / 开发缓存 ${fmt(est.devKb)} / 应用残留推荐档 ${fmt(est.safeKb)}）`
					: `- App estimate (deduplicated, excluding needs-review): ${fmt(est.totalKb)} (caches ${fmt(est.cacheKb)} / developer caches ${fmt(est.devKb)} / recommended app leftovers ${fmt(est.safeKb)})`);
			}
			const buckets = [
				["recommended", zh ? "推荐清理" : "Recommended"],
				["optional", zh ? "可选清理" : "Optional"],
				["review", zh ? "需确认（面板不会自动勾选）" : "Needs review (never auto-selected)"],
				["protected", zh ? "受保护（面板不会清理）" : "Protected (never cleaned)"],
			];
			for (const [risk, label] of buckets) {
				const items = list.filter((r) => rowRisk(r) === risk).sort((a, b) => b.kb - a.kb);
				if (items.length === 0) continue;
				if (risk === "protected") {
					// 受保护项只报数量与合计，让模型知道分类合计里有一部分不可动。
					L.push(`- ${label}（${items.length} ${zh ? "项" : "items"}，${zh ? "合计" : "total"} ${fmt(sum(items))}）`);
					continue;
				}
				const shown = items.slice(0, 6);
				const rest = items.slice(6);
				L.push(`- ${label}（${items.length} ${zh ? "项" : "items"}，${zh ? "合计" : "total"} ${fmt(sum(items))}）：`);
				for (const r of shown) {
					// 用面板的「清理影响」文案：不要把扫描器 advice 里的命令（npm cache clean 等）带进提示词。
					L.push(`  - ${r.name} · ${fmt(r.kb)} · ${catLabel(r.category)} · ${aiImpactOf(lang, r)} · ${r.paths[0] || ""}`);
				}
				if (rest.length > 0) {
					L.push(zh
						? `  - …另有 ${rest.length} 项未列出，合计 ${fmt(sum(rest))}`
						: `  - …${rest.length} more not listed, total ${fmt(sum(rest))}`);
				}
			}
			const big = report.bigFiles || [];
			if (big.length > 0) {
				L.push(zh ? "- 大文件（≥300MB，程序已排序）：" : "- Large files (≥300 MB, sorted by the app):");
				for (const f of big.slice(0, 6)) {
					const days = f.mtime ? Math.max(0, Math.floor((Date.now() / 1000 - f.mtime) / 86400)) : null;
					const name = String(f.path || "").split("/").pop();
					L.push(`  - ${name} · ${fmt(f.kb)} · ${f.ext || "?"} · ${days === null ? (zh ? "修改时间未知" : "mtime unknown") : (zh ? `${days} 天未修改` : `${days} days unchanged`)}`);
				}
			}
			return L.join("\n");
		}

		function aiReportPrompt(lang, report, rows, at) {
			const zh = lang !== "en";
			const L = [aiReportDigest(lang, report, rows, at), ""];
			L.push(zh
				? "问题：请解读这次体检：1) 我的空间主要被什么占用；2) 现在最值得清理的 3 项和理由；3) 哪几项即使能清也建议先留着。"
				: "Question: explain this checkup: 1) what takes up most space; 2) the 3 best cleanup candidates and why; 3) which cleanable items should stay for now.");
			L.push("");
			L.push(aiRules(lang));
			return L.join("\n");
		}

		function aiItemPrompt(lang, report, rows, row, at, kind) {
			const zh = lang !== "en";
			const L = [aiReportDigest(lang, report, rows, at), ""];
			L.push(zh ? "## 目标条目" : "## Target item");
			L.push(`- ${zh ? "名称" : "Name"}：${row.name}`);
			L.push(`- ${zh ? "分类" : "Category"}：${tr(lang, AI_CATEGORY_LABEL[row.category] || row.category)} · ${zh ? "风险" : "Risk"}：${riskLabel(lang, row)}`);
			L.push(`- ${zh ? "大小" : "Size"}：${fmt(row.kb)}`);
			L.push(`- ${zh ? "路径" : "Paths"}：${row.paths.join("；")}`);
			L.push(`- ${zh ? "面板说明" : "Panel note"}：${aiImpactOf(lang, row)}`);
			if (row.unknown) {
				L.push(zh
					? "- 备注：扫描器没有收录这个应用名（名称回退为 bundle id），来源可能是已卸载或小众 App。"
					: "- Note: the scanner has no catalog entry for this app; the name falls back to its bundle id and may be an uninstalled or niche app.");
			}
			L.push("");
			if (kind === "unknown") {
				L.push(zh
					? "问题：这一项到底是什么？删除/移动它会影响什么？我该保留还是清理？如果需要更多事实，请先调用只读工具 disk_inspect（参数 path 取上面的路径）查看实际内容；该工具不会修改任何文件。"
					: "Question: what is this item, what breaks if it is moved, and should I keep or clean it? If you need more facts, call the read-only disk_inspect tool with the path above first; it never modifies files.");
			} else {
				L.push(zh
					? "问题：这一项是什么？移入清理目的地后会失去什么、有什么代价？我该怎么判断要不要清理？如果报告信息不够，可调用只读工具 disk_inspect（参数 path 取上面的路径）查看文件数、修改时间等事实；它不会修改任何文件。"
					: "Question: what is this item, what is lost when it moves to the cleanup destination, and how should I decide? If the report is not enough, call the read-only disk_inspect tool with the path above for file count and modification time; it never modifies files.");
			}
			L.push("");
			L.push(aiRules(lang));
			return L.join("\n");
		}

		function aiReviewPrompt(lang, report, rows, selectedRows, selectedKb, at, trash, pathCount) {
			const zh = lang !== "en";
			const L = [aiReportDigest(lang, report, rows, at), ""];
			L.push(zh ? "## 我准备清理的条目（已勾选，尚未执行）" : "## Items selected for cleanup (not executed yet)");
			const total = Number.isFinite(pathCount) ? pathCount : selectedRows.length;
			L.push(zh
				? `- 共 ${total} 项（涉及 ${selectedRows.length} 个条目），程序合计 ${displaySize(selectedKb)}；清理只移到${trash}，可在历史中恢复，不会立即释放空间。`
				: `- ${total} items (${selectedRows.length} rows), app-total ${displaySize(selectedKb)}; cleanup only moves them to the ${trash}, restorable from History, and does not free space immediately.`);
			const shown = selectedRows.slice(0, 40);
			for (const r of shown) {
				L.push(`  - ${r.name} · ${fmt(r.kb)} · ${tr(lang, AI_CATEGORY_LABEL[r.category] || r.category)} · ${aiImpactOf(lang, r)} · ${r.paths[0] || ""}`);
			}
			if (selectedRows.length > shown.length) {
				L.push(zh ? `  - …另有 ${selectedRows.length - shown.length} 项未展开` : `  - …${selectedRows.length - shown.length} more not listed`);
			}
			L.push("");
			L.push(zh
				? "问题：请以“第二意见”的身份复核这组选择：1) 哪几项建议保留或再确认，为什么；2) 有没有明显风险，清理后会影响什么；3) 如果目标只是腾出大约一半空间，最小集合是哪几项。不要建议执行命令。"
				: "Question: review this selection as a second opinion: 1) which items should be kept or re-checked and why; 2) any clear risk or consequence of cleaning them; 3) if the goal were only half of this, which minimal subset should be cleaned. Do not propose commands.");
			L.push("");
			L.push(aiRules(lang));
			return L.join("\n");
		}

		function aiInspectPrompt(lang, file) {
			const zh = lang !== "en";
			const days = file.mtime ? Math.max(0, Math.floor((Date.now() / 1000 - file.mtime) / 86400)) : null;
			const L = [];
			L.push(zh ? "## 大文件" : "## Large file");
			L.push(`- ${zh ? "路径" : "Path"}：${file.path}`);
			L.push(`- ${zh ? "大小" : "Size"}：${fmt(file.kb)}；${zh ? "扩展名" : "Extension"}：${file.ext || "?"}`);
			L.push(`- ${zh ? "修改时间" : "Modified"}：${days === null ? (zh ? "未知" : "unknown") : (zh ? `${days} 天前` : `${days} days ago`)}`);
			L.push("");
			L.push(zh
				? "问题：这个文件可能是什么（按扩展名/所在目录/大小推断，并说明不确定性）？我该怎么判断该保留、删除还是搬到其他盘？请先调用只读工具 disk_inspect（参数 path 取上面的路径）查看实际事实；该工具不会修改任何文件。"
				: "Question: what might this file be (infer from extension, folder, and size, and state the uncertainty)? How should I decide whether to keep, delete, or move it? Call the read-only disk_inspect tool with the path above first; it never modifies files.");
			L.push("");
			L.push(aiRules(lang));
			return L.join("\n");
		}

		function toMs(at) {
			const n = typeof at === "number" ? at : Date.parse(at);
			return Number.isFinite(n) ? n : 0;
		}

		function computeFreeTrend(history) {
			const scans = (history || []).filter((h) => h && h.at && Number.isFinite(h.free)).slice(-30);
			if (scans.length < 2) return null;
			const first = scans[0];
			const last = scans[scans.length - 1];
			return {
				scans,
				from: first,
				to: last,
				delta: last.free - first.free,
				days: Math.max(0, Math.round((toMs(last.at) - toMs(first.at)) / 86400000)),
			};
		}

		function computeRegrowth(rows, cleans) {
			const byPath = new Map();
			for (const r of rows || []) for (const p of r.paths || []) if (!byPath.has(p)) byPath.set(p, r);
			const latest = new Map();
			for (const batch of cleans || []) {
				const at = toMs(batch.at);
				for (const it of batch.items || []) {
					if (!(Number(it.kb) > 0)) continue;
					const row = byPath.get(it.from);
					if (!row) continue;
					const prev = latest.get(row.id);
					if (!prev || at > prev.at) latest.set(row.id, { row, cleanedKb: it.kb, at });
				}
			}
			const out = [];
			for (const v of latest.values()) {
				// 复清判定：现在仍占 ≥100MB，且至少回到清理时的 30%。
				if (v.row.kb >= 100 * 1024 && v.row.kb >= v.cleanedKb * 0.3) out.push(v);
			}
			return out.sort((a, b) => b.row.kb - a.row.kb).slice(0, 12);
		}

		function aiHistoryPrompt(lang, report, rows, history, cleans, regrowth, at) {
			const zh = lang !== "en";
			const L = [];
			L.push(zh ? "## 磁盘历史数据（DeepClean 面板提供）" : "## Disk history data (provided by the DeepClean panel)");
			const trend = computeFreeTrend(history);
			if (trend) {
				L.push(zh
					? `- 共 ${trend.scans.length} 次扫描：${timeStr(trend.from.at)} 可用 ${fmtBytes(trend.from.free)} → ${timeStr(trend.to.at)} 可用 ${fmtBytes(trend.to.free)}（净变化 ${trend.delta >= 0 ? "+" : "-"}${fmtBytes(Math.abs(trend.delta))}）`
					: `- ${trend.scans.length} scans: free ${fmtBytes(trend.from.free)} at ${timeStr(trend.from.at)} → ${fmtBytes(trend.to.free)} at ${timeStr(trend.to.at)} (net ${trend.delta >= 0 ? "+" : "-"}${fmtBytes(Math.abs(trend.delta))})`);
				for (const s of trend.scans.slice(-5)) {
					L.push(`  - ${timeStr(s.at)} · ${zh ? "可用" : "free"} ${fmtBytes(s.free)} · ${zh ? "估计可释放" : "reclaimable"} ${fmt(s.totalKb)}`);
				}
			} else {
				L.push(zh ? "- 扫描历史：不足 2 次，没有趋势" : "- Scan history: fewer than 2 scans, no trend");
			}
			const batches = (cleans || []).slice(0, 10);
			if (batches.length > 0) {
				const totalKb = batches.reduce((n, b) => n + (b.items || []).reduce((m, it) => m + (Number(it.kb) || 0), 0), 0);
				L.push(zh
					? `- 清理批次 ${batches.length} 个，程序合计移动 ${fmt(totalKb)}`
					: `- ${batches.length} clean batches, app-total ${fmt(totalKb)} moved`);
				for (const b of batches.slice(0, 5)) {
					L.push(`  - ${timeStr(toMs(b.at))} · ${b.count} ${zh ? "项" : "items"}`);
				}
			}
			if (regrowth && regrowth.length > 0) {
				L.push(zh ? "- 清过又长回来的条目（当前体检里仍然存在）：" : "- Cleaned before and already back (present in the current checkup):");
				for (const g of regrowth.slice(0, 8)) {
					L.push(`  - ${g.row.name} · ${zh ? "清理时" : "cleaned"} ${fmt(g.cleanedKb)} · ${zh ? "现在" : "now"} ${fmt(g.row.kb)} · ${timeStr(g.at)}`);
				}
			}
			L.push(zh ? "- 当前体检摘要：" : "- Current checkup summary:");
			L.push(aiReportDigest(lang, report, rows, at));
			L.push("");
			L.push(zh
				? "问题：请分析这台机器的空间趋势：1) 空间在变好还是变差，依据是什么；2) 哪些项目被清理后又长回来，可能的原因；3) 下一步最值得做的 2–3 件事（可以建议“用定时提醒每月体检”，但不要建议删除命令）。"
				: "Question: analyze this machine's space trend: 1) improving or worsening, and why; 2) which items grew back after cleaning and likely causes; 3) the 2–3 most valuable next steps (a scheduled monthly checkup is fine to suggest; no delete commands).");
			L.push("");
			L.push(aiRules(lang));
			return L.join("\n");
		}

        const spaceColors = ["#5087eb", "#769e76", "#bc9958", "#967cb5", "#59a3ad", "#a88471", "#8b949e"];
        const percent = (kb, total) => !kb || !total ? "0%" : kb / total < .01 ? "<1%" : `${Math.round(kb / total * 100)}%`;
        function spaceSegments(items) {
            const positive = items.filter(it => it.kb > 0);
            return positive.length <= 7 ? positive : [...positive.slice(0, 6), { name: "其他", tail: true, kb: positive.slice(6).reduce((n, it) => n + it.kb, 0) }];
        }
        function Sunburst({ items, lang, onPick, active, onActive, onTail }) {
            const total = items.reduce((n, it) => n + it.kb, 0);
            let angle = -Math.PI / 2;
            const point = (r, a) => `${95 + r * Math.cos(a)} ${95 + r * Math.sin(a)}`;
            return h("svg", { width: 230, height: 230, viewBox: "0 0 190 190", role: "img", "aria-label": tr(lang, "当前目录分布") },
                spaceSegments(items).map((it, i) => {
                    const start = angle, end = angle += it.kb / (total || 1) * Math.PI * 2;
                    // Two half arcs also render correctly for a directory containing one item.
                    const mid = (start + end) / 2;
                    const arc = (r, x, y) => `A${r} ${r} 0 0 1 ${point(r, y)}`;
                    const d = `M${point(84, start)} ${arc(84,start,mid)} ${arc(84,mid,end)} L${point(55,end)} A55 55 0 0 0 ${point(55,mid)} A55 55 0 0 0 ${point(55,start)} Z`;
                    return h("path", { key: it.path || "other", d, fill: spaceColors[i], opacity: active && items.slice(0,6).some(c=>c.path===active) && active !== it.path ? .5 : 1,
                        onMouseEnter: () => onActive(it.path), onMouseLeave: () => onActive(""), onClick: () => it.tail ? onTail && onTail() : it.isDir && onPick(it), style: { cursor: it.isDir || it.tail ? "pointer" : "default" } }, h("title", null, `${tr(lang,it.name)} · ${displaySize(it.kb)} · ${percent(it.kb,total)}`));
                }),
                h("text", { x:95, y:91, textAnchor:"middle", fill:"currentColor", fontSize:17, fontWeight:600 }, displaySize(total)),
                h("text", { x:95, y:109, textAnchor:"middle", fill:"currentColor", fontSize:10 }, tr(lang,"当前已统计")));
        }
        function SpaceView({ lang, onLarge, onClean, report, fresh, whitelist = [], refreshToken = 0 }) {
            const [data, setData] = useState(null);
            const [stack, setStack] = useState([]);
            const [loading, setLoading] = useState(false);
            const [error, setError] = useState("");
            const [limit, setLimit] = useState(20);
            const [active, setActive] = useState("");
            const [pending, setPending] = useState("");
            const request = useRef(null);
            const pendingStack = useRef([]);
            const load = useCallback(async (p = "", next = [], refresh = false) => {
                request.current?.abort();
                const controller = new AbortController(); request.current = controller;
                setLoading(true); setPending(p); pendingStack.current = next; setError("");
                try {
                    const res = await fetch(`${API}/tree?path=${encodeURIComponent(p)}${refresh ? "&refresh=1" : ""}`, { signal: controller.signal });
                    const body = await res.json();
                    if (!res.ok) throw Error(body.error || `HTTP ${res.status}`);
                    if (controller.signal.aborted) return;
                    setData(body); setStack(next); setLimit(20); setActive("");
                } catch (err) { if (!controller.signal.aborted) setError(err.message); }
                finally { if (request.current === controller) setLoading(false); }
            }, []);
            useEffect(() => { load(); return () => request.current?.abort(); }, [load]);
            // 搬家完成后由父组件递增 refreshToken：绕过 60s 缓存重统当前目录，
            // 消除「文件已搬走但目录大小没变」的困惑。
            const lastToken = useRef(refreshToken);
            useEffect(() => {
                if (refreshToken === lastToken.current) return;
                lastToken.current = refreshToken;
                if (data) load(data.path, stack, true);
            }, [refreshToken]);
            const children = data?.children || [], total = children.reduce((n,c) => n+c.kb,0);
            const drill = it => { if (!loading) load(it.path, [...stack, {path:it.path,name:it.name}]); };
            const expandTail = () => setLimit(children.length);
            // 「其中可清理」角标：仅基于新鲜体检报告的信息性估算；已被更上层条目覆盖的路径不重复计。
            const cleanableRows = onClean && fresh && report ? buildRows(report, whitelist, "all", "", "sizeDesc", lang).filter(r => r.checkable) : [];
            const cleanableKb = {};
            for (const c of children) {
                if (!c.isDir) continue;
                const counted = [];
                let kb = 0;
                for (const r of cleanableRows) {
                    const hit = r.paths.find(p => insidePath(p, c.path));
                    if (!hit || counted.some(p2 => insidePath(hit, p2))) continue;
                    counted.push(hit); kb += r.kb;
                }
                if (kb > 0) cleanableKb[c.path] = kb;
            }
            const reveal = async p => {
                try { const res = await fetch(`${API}/reveal`, { method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:p}) }); if (!res.ok) throw Error(tr(lang,"无法打开位置")); }
                catch(err) { setError(err.message); }
            };
            return h("section", { "aria-label":tr(lang,"目录分布"), "aria-busy":loading },
                h("nav", {className:"dc-space-crumbs", "aria-label":tr(lang,"目录导航")},
                    h("button", {className:"dc-link",disabled:loading,onClick:()=>load()},tr(lang,"个人文件夹")),
                    stack.map((it,i)=>h(React.Fragment,{key:it.path},h("span",null,"/"),h("button",{className:"dc-link",disabled:loading,onClick:()=>load(it.path,stack.slice(0,i+1))},it.name)))),
                h("div",{className:"dc-page-meta"},tr(lang,"仅统计个人文件夹，包含隐藏项；不代表整盘已用容量。"),data ? ` · ${timeStr(data.at)}` : ""),
                data ? h("p",{className:"dc-caption"},tr(lang,data.metric === "logical" ? "按文件大小统计；压缩、共享文件和系统保留空间可能造成差异。" : "按文件占用统计；共享文件和系统保留空间可能造成差异。")) : null,
                loading ? h("div",{className:"dc-notice",role:"status"},tr(lang,"正在统计目录，请稍候…"),pending,h("button",{className:"dc-link",onClick:()=>{request.current?.abort();setLoading(false);setError(tr(lang,"已停止加载，可重试。"));}},tr(lang,"停止加载"))) : null,
                error ? h("div",{className:"dc-notice",role:"alert"},error,h("button",{className:"dc-link",onClick:()=>load(pending,pendingStack.current)},tr(lang,"重试"))) : null,
                data?.unavailable || data?.skipped ? h("p",{className:"dc-caption",role:"status"},tf(lang,"未能读取 {n} 项，跳过链接 {s} 项；统计可能不完整。",{n:data.unavailable || 0,s:data.skipped || 0})) : null,
                data?.skippedCloud ? h("p",{className:"dc-caption",role:"status"},tf(lang,"已跳过云盘目录 {n} 个：云盘文件不参与搬家或去重。",{n:data.skippedCloud})) : null,
                data ? h("div",{className:"dc-space-grid",style:{opacity:loading ? .55 : 1}},
                    h("aside",null,h(Sunburst,{items:children,lang,onPick:drill,active,onActive:setActive,onTail:expandTail}),
                        h("p",{className:"dc-caption"},tr(lang,"点击目录或色块进入下一级")),
                        spaceSegments(children).map((it,i)=>h("button",{key:it.path || "other",type:"button",className:"dc-space-legend",disabled:loading,style:{background:"none",border:0,color:"inherit",font:"inherit",width:"100%",textAlign:"left",cursor:"pointer"},onClick:()=>{if(it.tail)expandTail();else{const target=children.find(c=>c.path===it.path);if(target&&target.isDir)drill(target);}}},h("span",{style:{background:spaceColors[i]}}),tr(lang,it.name),h("strong",null,percent(it.kb,total))))),
                    h("div",{style:{minWidth:0}},
                        h("div",{className:"dc-space-tools"},h("button",{className:"dc-link",onClick:()=>onLarge(data.path,data.bigFiles || [],data.at)},tr(lang,"查看此目录的大文件")),h("button",{className:"dc-link",onClick:()=>reveal(data.path)},tr(lang,"打开位置")),h("button",{className:"dc-link",disabled:loading,onClick:()=>load(data.path,stack,true)},tr(lang,"重新统计"))),
                        !children.length ? h("p",{className:"dc-notice"},tr(lang,"此目录没有可显示的项目")) :
                        h("table",{className:"dc-file-table"},h("colgroup",null,h("col",{style:{width:"55%"}}),h("col",{style:{width:"20%"}}),h("col",{style:{width:"25%"}})),h("thead",null,h("tr",null,["名称","大小","占比"].map(t=>h("th",{key:t,scope:"col"},tr(lang,t))))),
                            h("tbody",null,children.slice(0,limit).map(c=>h("tr",{key:c.path,onMouseEnter:()=>setActive(c.path),onMouseLeave:()=>setActive(""),style:{background:active===c.path?"var(--dc-tint)":undefined}},
                                h("td",null,h("button",{className:"dc-space-entry",disabled:loading,onFocus:()=>setActive(c.path),onBlur:()=>setActive(""),onClick:()=>c.isDir?drill(c):reveal(c.path)},h(Icon,{name:c.isDir?"folder":"app-window",size:18}),c.name,c.isDir?" ›":""),c.partial?h("span",{className:"dc-caption"},tr(lang,"部分统计")):null,cleanableKb[c.path]?h("button",{className:"dc-space-cleanable",title:tr(lang,"去清理页处理"),onClick:()=>onClean(c.path)},tf(lang,"其中可清理 {size}",{size:displaySize(cleanableKb[c.path])})):null),
                                h("td",{className:"dc-size-col"},displaySize(c.kb)),h("td",{className:"dc-size-col"},percent(c.kb,total),h("div",{className:"dc-space-bar"},h("span",{style:{width:`${total?c.kb/total*100:0}%`}}))))))),
                        children.length>limit?h("button",{className:"dc-link",onClick:()=>setLimit(limit+30)},tr(lang,"显示更多")):null)) : null);
        }

		function PhotoView(props) {
			const lang = props.lang || "zh";
			const trash = trashWord(lang, props.platform || "");
			const [scan, setScan] = useState({ status: "idle" });
			const [result, setResult] = useState(null);
			const [sel, setSel] = useState({});
			const [busy, setBusy] = useState(false);
			const [confirming, setConfirming] = useState(false);
			const [note, setNote] = useState("");
			const [photoBatch, setPhotoBatch] = useState("");
			const [photoBatchIds, setPhotoBatchIds] = useState([]);
			const [keepRule, setKeepRule] = useState("largest");
			const [folder, setFolder] = useState("");
			const [compare, setCompare] = useState("");
			const [keepIdx, setKeepIdx] = useState(0);
			const compareRef = useRef(null);
			const compareTriggerRef = useRef(null);
			const compareWasOpen = useRef(false);

			// 对比弹层：打开时聚焦弹层，**关闭时**才把焦点还给触发按钮（挂载时不能抢焦点）。
			useEffect(() => {
				if (compare) {
					compareWasOpen.current = true;
					const root = compareRef.current;
					const first = root && root.querySelector("button, input");
					if (first && typeof first.focus === "function") first.focus();
					return undefined;
				}
				if (!compareWasOpen.current) return undefined;
				compareWasOpen.current = false;
				const el = compareTriggerRef.current;
				if (el && el.isConnected && typeof el.focus === "function") el.focus();
				return undefined;
			}, [compare]);

			const load = useCallback(async () => {
				try {
					const res = await fetch(`${API}/photos`);
					const body = await res.json();
					setScan(body.scan || { status: "idle" });
					setResult(body.result || null);
					if (body.result && body.result.groups) {
						const next = {};
						for (const g of body.result.groups) g.items.slice(1).forEach((it) => { next[it.path] = true });
						setSel(next);
					}
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
			}, []);

			useEffect(() => { load(); }, [load]);

			useEffect(() => {
				if (scan.status !== "running") return undefined;
				const timer = setInterval(async () => {
					try {
						const res = await fetch(`${API}/photos`);
						const body = await res.json();
						setScan(body.scan || { status: "idle" });
						if (body.scan && body.scan.status === "done") { setResult(body.result); load(); }
					} catch { /* ignore */ }
				}, 900);
				return () => clearInterval(timer);
			}, [scan.status, load]);

			const start = useCallback(async () => {
				setBusy(true); setNote("");
				try {
					const res = await fetch(`${API}/photos/scan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
					const body = await res.json();
					if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
					setScan(body.scan || { status: "running", progress: 0 });
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, []);

			const cancel = useCallback(async () => {
				try { await fetch(`${API}/photos/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); }
				catch { /* ignore */ }
			}, []);

			const paths = Object.keys(sel).filter((p) => sel[p]);
			const totalKb = result ? result.groups.reduce((sum, g) => sum + g.items.reduce((s2, it) => s2 + (sel[it.path] ? it.kb : 0), 0), 0) : 0;

			const clean = useCallback(async () => {
				setBusy(true);
				try {
					const res = await fetch(`${API}/clean`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths }) });
					const body = await res.json();
					if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
					const ok = (body.results || []).filter((r) => r.ok).length;
					const ids = Array.isArray(body.batchIds) ? body.batchIds : (body.batchId ? [body.batchId] : []);
					setPhotoBatchIds(ids);
					setNote(tf(lang, "已移动 {n} 张相似照片到{trash}，可撤销", { n: ok, trash }) + (ids.length > 1 ? `（${tf(lang, "分 {n} 批", { n: ids.length })}）` : ""));
					setPhotoBatch(body.batchId || "");
					setConfirming(false);
					await load();
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, [paths.join("|"), load, lang, trash]);

			const undo = useCallback(async () => {
				setBusy(true);
				try {
					const payload = photoBatchIds.length > 0 ? { batchIds: photoBatchIds } : { batchId: photoBatch || undefined };
					const res = await fetch(`${API}/undo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
					const body = await res.json();
					if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
					const results = body.results || [];
					const ok = body.summary ? body.summary.ok : results.filter((r) => r.ok).length;
					const failed = body.summary ? body.summary.failed : results.filter((r) => !r.ok).length;
					setNote(failed > 0 ? tf(lang, "已恢复 {n} 张照片，失败 {m} 张", { n: ok, m: failed }) : tf(lang, "已恢复 {n} 张照片", { n: ok }));
					if (body.auditOk === false) setNote((failed > 0 ? tf(lang, "已恢复 {n} 张照片，失败 {m} 张", { n: ok, m: failed }) + "\n" : tf(lang, "已恢复 {n} 张照片", { n: ok }) + "\n") + tr(lang, "恢复记录写入失败：历史里可能仍显示为可恢复。"));
					if (failed === 0) { setPhotoBatch(""); setPhotoBatchIds([]); }
					await load();
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, [photoBatch, photoBatchIds, load, lang]);

			const itemNode = (it, idx, keep) => h("div", { key: it.path, style: { width: 150 } },
				h("label", { style: { display: "flex", alignItems: "center", gap: 4, fontSize: 11 } },
					h("input", { type: "checkbox", checked: !!sel[it.path], onChange: () => setSel((prev) => {
						const next = { ...prev };
						if (next[it.path]) delete next[it.path];
						else next[it.path] = true;
						return next;
					}) }),
					idx === keep ? tr(lang, "建议保留") : tr(lang, "可清理"),
					h("span", { style: { opacity: 0.6 } }, " " + fmt(it.kb))),
				h("img", { src: `${API}/thumb?path=${encodeURIComponent(it.path)}`, alt: it.path, loading: "lazy", style: { width: "100%", height: 90, objectFit: "cover", borderRadius: 6, marginTop: 4, background: "rgba(127,127,127,.12)" } }),
				h("div", { style: { fontSize: 10, opacity: 0.55, wordBreak: "break-all", marginTop: 2 } }, baseName(it.path)));
			const groupNode = (g) => h("div", { key: g.id, style: { border: "1px solid rgba(127,127,127,.25)", borderRadius: 10, padding: "10px", marginBottom: 10 } },
				h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
					h("div", { style: { fontSize: 12, opacity: 0.75 } }, tf(lang, "相似组 · {n} 张 · 可释放 {size}", { n: g.items.length, size: fmt(g.wastedKb) })),
					h("button", { style: btn, onClick: (e) => { compareTriggerRef.current = e.currentTarget; setCompare(g.id); setKeepIdx(keepIndex(g)); } }, tr(lang, "对比"))),
				h("div", { style: { display: "flex", gap: 10, flexWrap: "wrap" } }, g.items.map((it, i) => itemNode(it, i, keepIndex(g)))));
			const applyKeepRule = useCallback((rule) => {
				setKeepRule(rule);
				if (!result) return;
				const next = {};
				for (const g of result.groups) {
					let keep = 0;
					g.items.forEach((it, i) => {
						if (rule === "newest" && (it.mtime || 0) > (g.items[keep].mtime || 0)) keep = i;
						if (rule === "shallow" && pathDepth(it.path) < pathDepth(g.items[keep].path)) keep = i;
					});
					g.items.forEach((it, i) => { if (i !== keep) next[it.path] = true; });
				}
				setSel(next);
			}, [result]);
			const keepIndex = (g) => g.items.reduce((best, it, i) => {
				if (keepRule === "newest" && (it.mtime || 0) > (g.items[best].mtime || 0)) return i;
				if (keepRule === "shallow" && pathDepth(it.path) < pathDepth(g.items[best].path)) return i;
				return best;
			}, 0);
			const folders = result ? [...new Set(result.groups.flatMap((g) => g.items.map((it) => parentDir(it.path))))].sort() : [];
			const shownGroups = result ? result.groups.filter((g) => !folder || g.items.some((it) => insidePath(it.path, folder))) : [];
			const compareGroup = compare && result ? result.groups.find((g) => g.id === compare) : null;
			const groups = shownGroups.map(groupNode);
			const wasted = result ? result.groups.reduce((sum, g) => sum + g.wastedKb, 0) : 0;

			return h("div", null,
				h("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 } },
					h("button", { style: btnPrimary, disabled: busy || scan.status === "running", onClick: start }, scan.status === "running" ? tr(lang, "扫描中…") : tr(lang, "扫描相似照片")),
					scan.status === "running" ? h("button", { style: btn, onClick: cancel }, tr(lang, "取消")) : null,
					h("span", { style: { fontSize: 11, opacity: 0.6 } }, tr(lang, "默认保留每组中体积最大的一张，其余已勾选待清理；可手动调整")),
					result ? h("select", { style: input, value: keepRule, onChange: (e) => applyKeepRule(e.target.value) },
						h("option", { value: "largest" }, tr(lang, "保留策略") + ": " + tr(lang, "最大")),
						h("option", { value: "newest" }, tr(lang, "保留策略") + ": " + tr(lang, "最新")),
						h("option", { value: "shallow" }, tr(lang, "保留策略") + ": " + tr(lang, "路径最浅"))) : null,
					result && folders.length > 1 ? h("select", { style: input, value: folder, onChange: (e) => setFolder(e.target.value) },
						h("option", { value: "" }, tr(lang, "全部文件夹")),
						folders.map((f) => h("option", { key: f, value: f }, f))) : null),
				scan.status === "running" ? h("div", { style: { height: 6, borderRadius: 3, background: "rgba(127,127,127,.2)", overflow: "hidden", marginBottom: 8 } },
					h("div", { style: { height: "100%", width: `${Math.max(3, scan.progress || 0)}%`, background: "rgba(80,140,255,.9)" } })) : null,
				scan.status === "running" ? h("div", { style: { fontSize: 11, opacity: 0.7, marginBottom: 8 } }, `${trNote(lang, scan.stage || "扫描中…")} · ${scan.elapsed || 0}s`) : null,
				note ? h("pre", { style: { whiteSpace: "pre-wrap", fontSize: 11.5, opacity: 0.85, background: "rgba(127,127,127,.08)", padding: 8, borderRadius: 6, marginBottom: 8 } }, note) : null,
				result ? h("div", { style: { fontSize: 12, opacity: 0.7, marginBottom: 8 } }, tf(lang, "扫描 {n} 张，比较 {m} 张，找到 {g} 组相似；预计可释放 {size}", { n: result.scanned, m: result.compared, g: result.groups.length, size: fmt(wasted) }) + (result.skippedCloud ? " · " + tf(lang, "已跳过云盘目录 {n} 个：云盘文件不参与搬家或去重。", { n: result.skippedCloud }) : "")) : null,
				groups,
				compareGroup ? h("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }, onClick: (e) => { if (e.target === e.currentTarget) setCompare(""); } },
					h("div", {
						role: "dialog", "aria-modal": "true", "aria-labelledby": "dc-compare-title", tabIndex: -1,
						ref: compareRef,
						onKeyDown: (e) => {
							if (e.key === "Escape") { e.stopPropagation(); setCompare(""); return; }
							if (e.key !== "Tab") return;
							const root = compareRef.current;
							if (!root) return;
							const nodes = [...root.querySelectorAll("button, input")].filter((n) => !n.disabled);
							if (nodes.length === 0) return;
							const first = nodes[0];
							const last = nodes[nodes.length - 1];
							if (e.shiftKey && e.target === first) { e.preventDefault(); last.focus(); }
							else if (!e.shiftKey && e.target === last) { e.preventDefault(); first.focus(); }
						},
						style: { background: "var(--dc-bg)", color: "var(--dc-text)", border: "1px solid var(--dc-line)", boxShadow: "0 18px 50px rgba(0,0,0,.35)", borderRadius: 10, padding: 16, maxWidth: "90vw", maxHeight: "90vh", overflow: "auto", outline: "none" },
					},
						h("div", { id: "dc-compare-title", style: { fontSize: 13, fontWeight: 600, marginBottom: 8 } }, tr(lang, "选择保留的照片")),
						h("div", { style: { display: "flex", gap: 12, flexWrap: "wrap" } },
							compareGroup.items.map((it, i) => h("label", { key: it.path, style: { width: 220, cursor: "pointer" } },
								h("input", { type: "radio", checked: keepIdx === i, onChange: () => setKeepIdx(i), "aria-label": `${tr(lang, "保留")} ${baseName(it.path)}` }),
								h("img", { src: `${API}/thumb?path=${encodeURIComponent(it.path)}&size=240`, alt: "", style: { width: "100%", height: 160, objectFit: "contain", background: "rgba(127,127,127,.12)", borderRadius: 6, marginTop: 4 } }),
								h("div", { style: { fontSize: 10.5, wordBreak: "break-all", opacity: 0.7 } }, baseName(it.path), " · ", fmt(it.kb))))),
						h("div", { style: { display: "flex", gap: 8, marginTop: 10 } },
							h("button", { style: btnPrimary, onClick: () => {
								setSel((prev) => {
									const next = { ...prev };
									compareGroup.items.forEach((it, i) => { if (i === keepIdx) delete next[it.path]; else next[it.path] = true; });
									return next;
								});
								setCompare("");
							} }, tr(lang, "应用保留")),
							h("button", { style: btn, onClick: () => setCompare("") }, tr(lang, "取消"))))) : null,
				(paths.length > 0 || photoBatch) ? h("div", { style: { position: "sticky", bottom: 0, marginTop: 8, padding: "9px 0", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" } },
					paths.length > 0 ? h("span", { style: { fontSize: 12 } }, tf(lang, "已选 {n} 张 · {size}", { n: paths.length, size: fmt(totalKb) })) : h("span", { style: { fontSize: 12, opacity: 0.7 } }, tr(lang, "上次照片清理可恢复")),
					paths.length > 0 ? h("button", { style: btn, disabled: busy, onClick: () => setSel({}) }, tr(lang, "清空选择")) : null,
					paths.length > 200 ? h("span", { style: { fontSize: 11, opacity: 0.7 } }, tf(lang, "将分 {n} 批执行（每批最多 200 项）", { n: Math.ceil(paths.length / 200) })) : null,
					paths.length > 0 && !confirming ? h("button", { style: btnDanger, disabled: busy, onClick: () => setConfirming(true) }, tf(lang, "移到{trash}", { trash })) : null,
					photoBatch ? h("button", { style: btn, disabled: busy, onClick: undo }, tr(lang, "撤销照片清理")) : null,
					confirming ? h(React.Fragment, null,
						h("span", { style: { fontSize: 12, color: "#e5534b" } }, tf(lang, "确认将 {n} 张移到{trash}？", { n: paths.length, trash })),
						h("div", { style: { flexBasis: "100%", fontSize: 11, opacity: 0.7 } }, tf(lang, "将移到{trash}，可在「历史」恢复；不会自动永久删除", { trash })),
						h("button", { style: btnDanger, disabled: busy, onClick: clean }, busy ? tr(lang, "移动中…") : tr(lang, "确认清理")),
						h("button", { style: btn, disabled: busy, onClick: () => setConfirming(false) }, tr(lang, "取消"))) : null) : null);
		}

        function LargeView(props) {
            const { lang, report, scan, fresh, scope, onScope, onScan, onCancel, at, whitelist = [], local = null, onLocal, ai = null } = props;
            const [sort,setSort] = useState("size");
            const [age,setAge] = useState(0);
            const [ext,setExt] = useState("");
            const [query,setQuery] = useState("");
            const [minSize,setMinSize] = useState(0);
            const [sel,setSel] = useState({});
            const [destination,setDestination] = useState("");
            const [folder,setFolder] = useState(null);
            const [volumes,setVolumes] = useState([]);
            const [confirming,setConfirming] = useState(false);
            const [busy,setBusy] = useState(false);
            const [note,setNote] = useState("");
            const [move,setMove] = useState({status:"idle",done:0,total:0});
            const [lastDest,setLastDest] = useState("");
            const callback = useRef(props.onMoved); callback.current = props.onMoved;
            const handled = useRef("");
            useEffect(() => {
                let alive=true;
                fetch(`${API}/volumes`).then(r=>r.json()).then(b=>alive&&setVolumes(b.volumes || [])).catch(()=>{});
                fetch(`${API}/move`).then(r=>r.json()).then(b=>{if(alive) {setMove(b.move || {status:"idle"}); if(b.move?.destination){setDestination(b.move.destination);if(b.move.status!=="running")setLastDest(b.move.destination);}}}).catch(()=>{});
                return ()=>{alive=false;};
            },[]);
            const moving=move.status==="running", scanning=scan?.status==="running";
            // 目录联动模式：数据来自目录统计（tree.py 同一趟遍历的 bigFiles 堆），新鲜度按目录统计时间算。
            const scoped=!!(scope && local && local.scope===scope);
            const localFresh=scoped && Date.now()-local.at<=10*60*1000;
            const effectiveFresh=scoped?localFresh:fresh;
            const moved=new Set((move.results || []).filter(r=>r.ok).map(r=>r.path));
            const files=((scoped?local.files:report?.bigFiles) || []).filter(f=>!moved.has(f.path)).map(f=>({...f,ext:f.ext || (normalizedPath(f.path).match(/(\.[^./]+)$/)?.[1] || "").toLowerCase()}));
            const rows=files.filter(f=>(!scope || insidePath(f.path,scope)) && (!ext || f.ext===ext) && (!age || (Date.now()/1000-f.mtime)/86400>=age) && f.kb>=minSize*1024 && f.path.toLowerCase().includes(query.toLowerCase()))
                .sort((a,b)=>sort==="age"?a.mtime-b.mtime:b.kb-a.kb);
            const protectedFile=f=>whitelist.some(w=>insidePath(f.path,w));
            const selected=files.filter(f=>sel[f.path] && !protectedFile(f));
            const selectedKb=selected.reduce((n,f)=>n+f.kb,0);
            const volume=volumes.filter(v=>insidePath(destination,v.path)).sort((a,b)=>b.path.length-a.path.length)[0];
            const insufficient=volume && selectedKb*1024>volume.free*.95;
            const confirmationKey = JSON.stringify([destination, selected.map(f=>f.path)]);
            const confirmationValid = confirming === confirmationKey;
            useEffect(()=>{
                if(!moving)return;
                let alive=true;
                const timer=setInterval(async()=>{
                    try {
                        const res=await fetch(`${API}/move`); if(!res.ok)throw Error(tr(lang,"无法读取移动进度"));
                        const b=await res.json(), m=b.move; if(!alive || !m)return;
                        setMove(m);
                        if(m.status!=="running" && handled.current!==String(m.startedAt)) {
                            handled.current=String(m.startedAt); setSel({});setLastDest(m.destination || destination);
                            setNote(tr(lang,m.status==="canceled"?"移动已取消；已完成的文件保留在目标位置。":m.status==="error"?"移动失败，失败项见上方列表。":"移动完成"));
                            callback.current?.();
                        }
                    } catch(err){if(alive)setNote(err.message);}
                },700);
                return ()=>{alive=false;clearInterval(timer);};
            },[moving,destination,lang]);
            const browse=async(p)=>{
                setBusy(true);setNote("");
                try {const r=await fetch(`${API}/destination?path=${encodeURIComponent(p)}`),b=await r.json();if(!r.ok)throw Error(b.error);setFolder(b);setDestination(b.path);return b;}
                catch(err){setNote(err.message);return null;}finally{setBusy(false);}
            };
            const reveal=async(p)=>{
                try{const r=await fetch(`${API}/reveal`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:p})});if(!r.ok)throw Error(tr(lang,"无法打开位置"));}catch(err){setNote(err.message);}
            };
            // 「这是什么」：把路径的事实交给会话里的模型，由只读工具 disk_inspect 补充事实；不产生任何写操作。
            const askFile=async(f)=>{
                if(!ai)return;
                const prompt=aiInspectPrompt(lang,f);
                const status=await ai.ask(prompt);
                if(status==="no-session"||status==="unavailable"){
                    try{if(typeof navigator!=="undefined"&&navigator.clipboard)await navigator.clipboard.writeText(prompt);}catch{/* 复制失败仍给出提示 */}
                }
                setNote(status==="sent"?tr(lang,"已发送到对话"):status==="error"?tr(lang,"AI 发送失败，请重试"):tr(lang,"已复制提示词，打开对话后粘贴发送"));
            };
            const prepare=async()=>{
                const b=await browse(destination); if(!b)return;
                if(b.writable === false){setNote(tr(lang,"目标目录不可写"));return;}
                if(selectedKb*1024>b.free*.95){setNote(tr(lang,"目标磁盘空间不足"));return;}
                setConfirming(JSON.stringify([b.path, selected.map(f=>f.path)]));
            };
            const startMove=async()=>{
                setBusy(true);setNote("");
                try{const r=await fetch(`${API}/move`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({paths:selected.map(f=>f.path),destination})}),b=await r.json();if(!r.ok)throw Error(b.error);setMove({status:"running",done:0,total:b.count,results:[]});setConfirming(false);}
                catch(err){setNote(err.message);}finally{setBusy(false);}
            };
            const rescanScope=async()=>{
                setBusy(true);setNote("");
                try{const r=await fetch(`${API}/tree?path=${encodeURIComponent(scope)}&refresh=1`),b=await r.json();if(!r.ok)throw Error(b.error||`HTTP ${r.status}`);onLocal&&onLocal({scope,files:b.bigFiles || [],at:b.at});}
                catch(err){setNote(err.message);}finally{setBusy(false);}
            };
            const scanFull=scan?.full===true || (report?.bigFiles || []).length>0;
            const filtered=query || ext || age || minSize || scope;
            const filteredByUser=query || ext || age || minSize;
            const emptyMessage=tr(lang,scoped?(filteredByUser?"没有符合筛选条件的大文件":"该目录没有大文件"):scanning?"正在扫描大文件…":scan?.status==="error"?"大文件扫描失败，请重试":scan?.status==="canceled"?"扫描已取消":!report?"先扫描，查找占用较大的文件":!scanFull?"当前扫描未覆盖大文件，请进行完整扫描":filtered?"没有符合筛选条件的大文件":"没有发现大文件");
            return h("section",{"aria-label":tr(lang,"大文件")},
                h("div",{className:"dc-space-tools"},h("span",{className:"dc-page-meta"},scoped?tf(lang,"来源：目录统计 · {path}",{path:scope}):report?.bigFilesTop?tf(lang,"扫描范围：个人文件夹 · ≥300 MB · 仅显示最大的 {n} 个",{n:report.bigFilesTop}):tr(lang,"扫描范围：个人文件夹 · 仅列出 ≥300 MB 的大文件"),(scoped?local.at:at)?` · ${timeStr(scoped?local.at:at)}`:""),
                    scoped?h("button",{className:"dc-link",disabled:moving || busy,onClick:rescanScope},tr(lang,"重新统计")):h("button",{className:"dc-link",disabled:scanning || moving || busy,onClick:onScan},tr(lang,"完整扫描"))),
                !scoped && report?.truncated?h("p",{className:"dc-caption",role:"status"},tr(lang,"扫描时间预算有限，大文件结果可能不全。")):null,
                scoped?!localFresh?h("div",{className:"dc-notice",role:"status"},tr(lang,"目录统计已过期，请重新统计后移动。")):null
                    :!fresh && report?h("div",{className:"dc-notice",role:"status"},tr(lang,"扫描结果已过期，请重新扫描后移动。")):null,
                scanning?h("div",{className:"dc-notice",role:"status"},tr(lang,"正在扫描大文件…"),h("button",{className:"dc-link",onClick:onCancel},tr(lang,"取消"))):null,
                h("div",{className:"dc-space-filters"},
                    h("input",{"aria-label":tr(lang,"搜索名称或路径"),placeholder:tr(lang,"搜索名称或路径"),value:query,onChange:e=>setQuery(e.target.value)}),
                    h("select",{"aria-label":tr(lang,"排序"),value:sort,onChange:e=>setSort(e.target.value)},h("option",{value:"size"},tr(lang,"按大小")),h("option",{value:"age"},tr(lang,"按未修改天数"))),
                    h("select",{"aria-label":tr(lang,"修改时间"),value:age,onChange:e=>setAge(Number(e.target.value))},[0,90,180,365].map(n=>h("option",{value:n,key:n},n?tf(lang,"超过 {n} 天未修改",{n}):tr(lang,"全部时间")))),
                    h("select",{"aria-label":tr(lang,"文件类型"),value:ext,onChange:e=>setExt(e.target.value)},h("option",{value:""},tr(lang,"全部类型")),[...new Set(files.map(f=>f.ext).filter(Boolean))].sort().map(x=>h("option",{key:x,value:x},x))),
                    h("select",{"aria-label":tr(lang,"最小大小"),value:minSize,onChange:e=>setMinSize(Number(e.target.value))},(scoped?[0,50,100,500]:[0,500,1024,5120]).map(n=>h("option",{value:n,key:n},n?`≥ ${displaySize(n*1024)}`:tr(lang,"全部大小"))))),
                scope?h("p",{className:"dc-caption"},scope,h("button",{className:"dc-link",onClick:()=>onScope("")},tr(lang,"全部文件夹"))):null,
                note?h("div",{className:"dc-notice",role:"status"},note):null,
                lastDest?h("button",{className:"dc-link",onClick:()=>reveal(lastDest)},tr(lang,"打开目标文件夹")):null,
                moving?h("div",{className:"dc-notice",role:"status"},tf(lang,"正在移动 {done}/{total}",{done:move.done,total:move.total})," · ",move.current,h("button",{className:"dc-link",onClick:async()=>{try{const r=await fetch(`${API}/move/cancel`,{method:"POST"});if(!r.ok)throw Error(tr(lang,"无法取消当前任务"));setNote(tr(lang,"正在取消；当前文件处理完成后停止。"));}catch(err){setNote(err.message);}}},tr(lang,"取消"))):null,
                move.error?h("p",{role:"alert"},move.error):null,
                (move.results || []).filter(r=>!r.ok).map(r=>h("p",{key:r.path,role:"status"},r.path," · ",r.error)),
                !rows.length?h("div",{className:"dc-empty"},h("p",null,tr(lang,emptyMessage)),!scanning?h("button",{className:"dc-button",disabled:moving || busy,onClick:scoped?(filteredByUser?()=>{setQuery("");setExt("");setAge(0);setMinSize(0);}:rescanScope):(filtered && scanFull?()=>{setQuery("");setExt("");setAge(0);setMinSize(0);onScope("");}:onScan)},tr(lang,scoped?(filteredByUser?"清除筛选":"重新统计"):(filtered && scanFull?"清除筛选":"完整扫描"))):null):
                h("div",null,h("div",{className:"dc-space-tools"},h("span",null,tf(lang,"共 {n} 个文件",{n:rows.length})),
                    h("button",{className:"dc-link",disabled:!effectiveFresh || moving || scanning,onClick:()=>setSel(Object.fromEntries(rows.filter(f=>!protectedFile(f)).map(f=>[f.path,true])))},tr(lang,"选择筛选结果")),h("button",{className:"dc-link",disabled:moving,onClick:()=>setSel({})},tr(lang,"清空选择"))),
                    h("table",{className:"dc-file-table"},h("colgroup",null,h("col",{style:{width:44}}),h("col",null),h("col",{style:{width:90}}),h("col",{style:{width:90}})),h("thead",null,h("tr",null,["选择","名称","大小","操作"].map(t=>h("th",{scope:"col",key:t},tr(lang,t))))),
                        h("tbody",null,rows.map(f=>h("tr",{key:f.path},h("td",null,h("input",{type:"checkbox","aria-label":tf(lang,"选择 {name}",{name:f.path}),checked:!!sel[f.path]&&!protectedFile(f),disabled:!effectiveFresh||moving||scanning||protectedFile(f),onChange:()=>setSel(prev=>({...prev,[f.path]:!prev[f.path]}))})),
                            h("td",null,h("div",{style:{overflowWrap:"anywhere"}},normalizedPath(f.path).split("/").pop()),h("div",{className:"dc-file-path",title:f.path},f.path),h("div",{className:"dc-caption"},protectedFile(f)?tr(lang,"受保护"):f.mtime?tf(lang,"超过 {n} 天未修改",{n:Math.max(0,Math.floor((Date.now()/1000-f.mtime)/86400))}):tr(lang,"修改时间未知"))),
                            h("td",{className:"dc-size-col"},displaySize(f.kb)),h("td",null,h("button",{className:"dc-link",onClick:()=>reveal(f.path)},tr(lang,"打开位置")),ai?h("button",{className:"dc-link",onClick:()=>askFile(f)},tr(lang,"这是什么")):null,h("button",{className:"dc-link",onClick:async()=>{try{await navigator.clipboard.writeText(f.path);setNote(tr(lang,"已复制路径"));}catch{setNote(tr(lang,"无法复制路径"));}}},tr(lang,"复制路径")))))))),
                selected.length>0?h("div",{className:"dc-space-actions"},h("strong",null,tf(lang,"已选 {n} 个 · {size}",{n:selected.length,size:displaySize(selectedKb)})),
                    h("select",{"aria-label":tr(lang,"目标磁盘"),disabled:moving||busy,value:volume?.path || "",onChange:e=>{setDestination(e.target.value);setFolder(null);}},h("option",{value:""},tr(lang,"选择目标磁盘…")),volumes.map(v=>h("option",{key:v.path,value:v.path},`${v.label} · ${tr(lang,"可用")} ${displaySize(v.free/1024)}`))),
                    h("input",{"aria-label":tr(lang,"目标目录"),disabled:moving||busy,value:destination,placeholder:tr(lang,"目标目录"),onChange:e=>{setDestination(e.target.value);setFolder(null);}}),
                    h("button",{className:"dc-button",disabled:!destination.trim()||busy||moving,onClick:()=>browse(destination)},tr(lang,"选择文件夹")),
                    volume?h("span",{className:"dc-caption"},tf(lang,"目标可用 {free} · 已选 {size}",{free:displaySize(volume.free/1024),size:displaySize(selectedKb)})):null,
                    insufficient?h("span",{role:"alert"},tr(lang,"目标磁盘空间不足")):null,
                    folder?h("div",{style:{flexBasis:"100%"}},h("p",{className:"dc-caption"},folder.path),
                        h("select",{"aria-label":tr(lang,"进入子文件夹"),value:"",disabled:busy||moving,onChange:e=>{if(e.target.value)browse(e.target.value);}},h("option",{value:""},tr(lang,"进入子文件夹")),folder.folders.map(f=>h("option",{key:f.path,value:f.path},f.name))),
                        folder.parent?h("button",{className:"dc-link",disabled:busy||moving,onClick:()=>browse(folder.parent)},tr(lang,"上一级")):null):null,
                    !confirmationValid?h("button",{className:"dc-button dc-primary",disabled:busy||moving||!effectiveFresh||scanning||!destination.trim()||insufficient,onClick:prepare},tr(lang,"移动到…")):
                    h("div",{role:"group","aria-label":tr(lang,"确认移动"),style:{flexBasis:"100%"}},h("p",null,tf(lang,"确认移动 {n} 个文件到 {dest}？",{n:selected.length,dest:destination})),h("p",{className:"dc-caption"},tr(lang,"移动到其他磁盘时会先复制并逐字节校验，确认一致后才移除原文件。")),h("p",{className:"dc-caption"},tr(lang,"成功后原位置不再保留文件；移动不进入清理历史，无法通过「历史」恢复。")),
                        h("button",{className:"dc-button dc-primary",disabled:busy||moving||!effectiveFresh||scanning||insufficient,onClick:startMove},tr(lang,"确认移动")),h("button",{className:"dc-link",disabled:busy,onClick:()=>setConfirming(false)},tr(lang,"取消")))):null);
        }

		function Panel(props) {
			const ai = (props && props.ai) || null;
			const rootRef = useRef(null);
			const confirmRef = useRef(null);
			const [view, setView] = useState("home");
			const [overview, setOverview] = useState(null);
			const [liveDisk, setLiveDisk] = useState(null);
			const [scan, setScan] = useState({ status: "idle" });
			const [tab, setTab] = useState("all");
			const [risk, setRisk] = useState("all");
			const [moreOpen, setMoreOpen] = useState(false);
			const [clock, setClock] = useState(Date.now());
			const [search, setSearch] = useState("");
			const [sort, setSort] = useState("sizeDesc");
			const [sel, setSel] = useState({});
			const [expanded, setExpanded] = useState("");
			const [confirming, setConfirming] = useState(false);
			useEffect(() => { if (confirming && confirmRef.current) confirmRef.current.focus(); }, [confirming]);
			const [busy, setBusy] = useState(false);
			const [note, setNote] = useState("");
			const [lastBatch, setLastBatch] = useState("");
			const [lastBatchIds, setLastBatchIds] = useState([]);
			const [lastCleanResult, setLastCleanResult] = useState(null);
			const [cleanPurgeIds, setCleanPurgeIds] = useState(null);
			const [purgeAllConfirm, setPurgeAllConfirm] = useState(false);
			const [reclaim, setReclaim] = useState(null);
			const [reclaimBusy, setReclaimBusy] = useState(false);
			const [purgeConfirm, setPurgeConfirm] = useState("");
			const [newWhitelist, setNewWhitelist] = useState("");
			const [spaceMode, setSpaceMode] = useState("tree");
            const [spaceScope, setSpaceScope] = useState("");
            const [spaceFiles, setSpaceFiles] = useState(null);
            const [spaceRefresh, setSpaceRefresh] = useState(0);
            const scanOrigin = useRef("home");
            const [spaceVisited, setSpaceVisited] = useState(false);
            useEffect(() => { if (view === "space") setSpaceVisited(true); }, [view]);
			const [cleanMode, setCleanMode] = useState("junk");
			useEffect(() => { if (rootRef.current) rootRef.current.scrollTo({ top: 0 }); }, [view, cleanMode]);
			const [wizard, setWizard] = useState({ open: false, phase: "idle", batchId: "", batchIds: [], releasedKb: 0, error: "" });
			const [wizardSel, setWizardSel] = useState({});
			const [showAdvanced, setShowAdvanced] = useState(false);
			const [lang, setLang] = useState(() => {
				try { return localStorage.getItem("deepclean-lang") || "zh"; } catch { return "zh"; }
			});
			useEffect(() => { try { localStorage.setItem("deepclean-lang", lang); } catch { /* ignore */ } }, [lang]);

			const loadOverview = useCallback(async () => {
				try {
					const res = await fetch(`${API}/overview`);
					const body = await res.json();
					if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
					setOverview(body);
					setScan(body.scan || { status: "idle" });
					if (body.disk) setLiveDisk(body.disk);
					try {
						const stRes = await fetch(`${API}/state`);
						const st = await stRes.json();
						if (st && st.canUndo && st.lastBatchId) {
							setLastBatch(st.lastBatchId);
							setLastBatchIds(Array.isArray(st.lastBatchIds) && st.lastBatchIds.length > 0 ? st.lastBatchIds : [st.lastBatchId]);
						}
					} catch { /* ignore */ }
					return body;
				} catch (err) {
					setNote(String(err && err.message ? err.message : err));
					return null;
				}
			}, []);

			// 轻量刷新：只取 statfs 快照，不动扫描/历史状态（避免与扫描轮询抢状态）。
			const refreshDisk = useCallback(async () => {
				try {
					const res = await fetch(`${API}/disk`);
					const body = await res.json();
					if (res.ok && body.disk) setLiveDisk(body.disk);
				} catch { /* 忽略：下次刷新再试 */ }
			}, []);

			useEffect(() => { loadOverview(); }, [loadOverview]);

			// 磁盘容量是实时快照（statfs），面板可见时周期性刷新；切回窗口时也刷新一次。
			useEffect(() => {
				const refresh = () => {
					if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
					refreshDisk();
				};
				const timer = setInterval(refresh, 60000);
				if (typeof window !== "undefined") window.addEventListener("focus", refresh);
				if (typeof document !== "undefined") document.addEventListener("visibilitychange", refresh);
				return () => {
					clearInterval(timer);
					if (typeof window !== "undefined") window.removeEventListener("focus", refresh);
					if (typeof document !== "undefined") document.removeEventListener("visibilitychange", refresh);
				};
			}, [refreshDisk]);

			useEffect(() => {
				if (scan.status !== "running") return undefined;
				const timer = setInterval(async () => {
					try {
						const res = await fetch(`${API}/scan`);
						const body = await res.json();
						const s = body.scan || {};
						setScan(s);
						if (s.status !== "running") {
							if (s.status === "done") {
								setClock(Date.now());
								const ov = await loadOverview();
								if (wizard.open) { setWizard((w) => ({ ...w, phase: "review" })); setWizardSel(wizardInitSel(ov && ov.report, (ov && ov.whitelist) || [])); }
								else setView(scanOrigin.current === "space" ? "space" : "clean");
							}
							if (s.status === "error") { setNote(tr(lang, "扫描失败：") + (s.error || tr(lang, "未知错误"))); setWizard((w) => ({ ...w, open: false, phase: "idle" })); }
							if (s.status === "canceled") { setNote(tr(lang, "扫描已取消")); setWizard((w) => ({ ...w, open: false, phase: "idle" })); }
						}
					} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				}, 900);
				return () => clearInterval(timer);
			}, [scan.status, loadOverview, wizard.open]);

			const startScan = useCallback(async (full, keepNote = false) => {
				scanOrigin.current = view;
                if (!keepNote) setNote(""); setSel({}); setConfirming(false); setClock(Date.now()); setBusy(true);
				try {
					const res = await fetch(`${API}/scan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ full: !!full }) });
					const body = await res.json();
					if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
					setScan(body.scan || { status: "running", progress: 0 });
				} catch (err) { setNote(String(err && err.message ? err.message : err)); setWizard((w) => ({ ...w, open: false, phase: "idle" })); }
				finally { setBusy(false); }
			}, [view]);

			const cancelScan = useCallback(async () => {
				try {
					await fetch(`${API}/scan/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
					setNote(tr(lang, "正在取消…"));
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
			}, []);

			const report = overview && overview.report ? overview.report : null;
			const whitelist = (overview && overview.whitelist) || [];
			const platform = (overview && overview.platform) || "";
			const trash = trashWord(lang, platform);
			const disk = liveDisk || (report && report.disk) || null;
			const allRows = buildRows(report, whitelist, "all", "", "sizeDesc", lang);
			const rows = buildRows(report, whitelist, tab, search, sort, lang).filter((r) => risk === "all" || rowRisk(r) === risk);
			const reportFresh = !!report && clock - overview.at <= 10 * 60 * 1000;
			const scanning = scan.status === "running";
			const canClean = reportFresh && !scanning && !busy;
			useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 10000); return () => clearInterval(timer); }, []);
			const selectedRows = allRows.filter((r) => r.checkable && r.paths.every((p) => sel[p]));
			const selectedPaths = uniquePaths(selectedRows.flatMap((r) => r.paths));
			const selectedStats = { kb: selectedRows.filter((r, i, all) => !all.slice(0, i).some((other) => r.paths.every((p) => other.paths.some((parent) => insidePath(p, parent))))).reduce((sum, r) => sum + r.kb, 0), items: selectedPaths.length };
			const selectedKb = selectedStats.kb;

			const toggle = useCallback((paths) => {
				setConfirming(false);
				setSel((prev) => {
					const next = { ...prev };
					const on = paths.every((p) => next[p]);
					for (const p of paths) { if (on) delete next[p]; else next[p] = true; }
					return next;
				});
			}, []);

			const checkPermissions = useCallback(async () => {
				try {
					const res = await fetch(`${API}/permissions`);
					const body = await res.json();
					setNote((body.text || body.error || "").trim());
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
			}, []);

			// macOS 未授权完全磁盘访问时，首页/清理页常驻引导卡（区别于一次性 note）。
			const [perm, setPerm] = useState({ status: "ok", text: "" });
			const [permSteps, setPermSteps] = useState(false);
			const recheckPerm = useCallback(async () => {
				try {
					const res = await fetch(`${API}/permissions`);
					const body = await res.json();
					setPerm({ status: body.status || "ok", text: (body.text || "").trim() });
				} catch { /* 探测失败按无异常处理，不出卡片 */ }
			}, []);
			useEffect(() => { if (platform === "darwin") recheckPerm(); }, [platform, recheckPerm]);
			const openPrivacySettings = useCallback(async () => {
				try { await fetch(`${API}/open-privacy-settings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); }
				catch { /* 打不开设置页时详细步骤仍可手动跟随 */ }
			}, []);

			function PermBanner() {
				if (perm.status !== "denied") return null;
				return h("div", { className: "dc-notice", role: "alert" },
					h(Icon, { name: "warning-circle", size: 18 }),
					h("span", null, h("strong", null, tr(lang, "未授权完全磁盘访问，扫描结果会严重漏报。")), permSteps && perm.text ? "\n" + perm.text : ""),
					h("button", { className: "dc-link", onClick: openPrivacySettings }, tr(lang, "打开系统设置")),
					h("button", { className: "dc-link", onClick: () => setPermSteps((v) => !v) }, tr(lang, permSteps ? "收起详细步骤" : "查看详细步骤")),
					h("button", { className: "dc-link", onClick: recheckPerm }, tr(lang, "重新检查")));
			}

			const fetchReclaim = useCallback(async (paths) => {
				setReclaim(null);
				setReclaimBusy(true);
				try {
					const res = await fetch(`${API}/reclaim`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths }) });
					const body = await res.json();
					if (res.ok && !body.error) setReclaim(body);
				} catch { /* 估算失败不阻断清理 */ }
				finally { setReclaimBusy(false); }
			}, []);

			const doPurge = useCallback(async (batchId) => {
				setBusy(true);
				try {
					const res = await fetch(`${API}/purge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId }) });
					const body = await res.json();
					if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
					setPurgeConfirm("");
					setLastBatch("");
					setNote(tf(lang, "已永久删除 {n} 项（约 {size}）", { n: body.purged || 0, size: fmtBytes(body.freedBytes || 0) }));
					await loadOverview();
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, [lang, loadOverview]);

			const doPurgeAll = useCallback(async (batchIds) => {
				const ids = [...new Set((Array.isArray(batchIds) ? batchIds : []).filter((id) => typeof id === "string" && id))];
				if (!ids.length) { setNote(tr(lang, "没有可永久删除的批次")); return; }
				setBusy(true);
				try {
					const payload = { batchIds: ids };
					const res = await fetch(`${API}/quarantine/purge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
					const body = await res.json();
					if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
					setPurgeAllConfirm(false);
					setCleanPurgeIds(null);
					setLastCleanResult(null);
					setNote(tf(lang, "已永久删除 {n} 项（约 {size}）", { n: body.total ? body.total.purged : 0, size: fmtBytes(body.total ? body.total.freedBytes : 0) }));
					await loadOverview();
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, [lang, loadOverview]);

			const doClean = useCallback(async () => {
				const freeBefore = disk ? disk.free : null;
				setBusy(true);
				try {
					const res = await fetch(`${API}/clean`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: selectedPaths }) });
					const body = await res.json();
					if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
					const okPaths = (body.results || []).filter((r) => r.ok).map((r) => r.path);
					const failed = (body.results || []).filter((r) => !r.ok);
					const ids = Array.isArray(body.batchIds) ? body.batchIds : (body.batchId ? [body.batchId] : []);
					setSel({});
					if (okPaths.length) {
						setLastBatch(ids[ids.length - 1] || "");
						setLastBatchIds(ids);
						setCleanPurgeIds(null); setLastCleanResult({ batchIds: ids, moved: okPaths.length, kb: selectedKb, allocated: reclaim ? reclaim.allocatedBytes : null });
					}
					setConfirming(false);
					let line = tf(lang, "已移动 {n} 项到{trash}，可撤销", { n: okPaths.length, trash }) + (ids.length > 1 ? `（${tf(lang, "分 {n} 批", { n: ids.length })}）` : "") + (failed.length ? "\n" + tf(lang, "失败 {n} 项：{errors}", { n: failed.length, errors: failed.map((f) => f.error).join("；") }) : "");
					if (body.auditOk === false) line += "\n" + tf(lang, "审计写入失败：文件已在{trash}，但历史里可能看不到恢复记录。", { trash });
					if (Array.isArray(body.chunkErrors) && body.chunkErrors.length > 0) {
						line += "\n" + tf(lang, "部分批次失败：{errors}", { errors: body.chunkErrors.map((e) => e.error).filter(Boolean).slice(0, 2).join("；") });
					}
					const ov = await loadOverview();
					const fresh = ov && ov.disk;
					if (freeBefore != null && fresh && typeof fresh.free === "number") {
						if (fresh.free > freeBefore) line += "\n" + tf(lang, "可用空间 {from} → {to}（+{delta}）", { from: fmtBytes(freeBefore), to: fmtBytes(fresh.free), delta: fmtBytes(fresh.free - freeBefore) });
						else line += "\n" + tf(lang, "可用空间未变化（文件在{trash}）", { trash });
					}
					setNote(line);
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, [selectedPaths.join("|"), disk, lang, trash, loadOverview, reclaim, selectedKb]);

			const doUndo = useCallback(async () => {
				setBusy(true);
				try {
					const payload = lastBatchIds.length > 0 ? { batchIds: lastBatchIds } : { batchId: lastBatch || undefined };
					const res = await fetch(`${API}/undo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
					const body = await res.json();
					if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
					const results = body.results || [];
					const ok = body.summary ? body.summary.ok : results.filter((r) => r.ok).length;
					const failed = body.summary ? body.summary.failed : results.filter((r) => !r.ok).length;
					if (failed > 0) {
						const detail = results.filter((r) => !r.ok).map((r) => r.error).filter(Boolean).slice(0, 3).join("；");
						setNote(tf(lang, "已恢复 {n} 项，失败 {m} 项", { n: ok, m: failed }) + (detail ? "：" + detail : ""));
					} else {
						setLastBatch("");
						setLastBatchIds([]);
						setLastCleanResult(null);
						setNote(tf(lang, "已恢复 {n} 项；如需再次清理请重新扫描。", { n: ok }));
					}
					if (body.auditOk === false) setNote((failed > 0 ? tf(lang, "已恢复 {n} 项，失败 {m} 项", { n: ok, m: failed }) + "\n" : "") + tr(lang, "恢复记录写入失败：历史里可能仍显示为可恢复。"));
					await loadOverview();
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, [lastBatch, lastBatchIds, loadOverview, lang]);

			const protectSelected = useCallback(async () => {
				setBusy(true);
				try {
					const next = [...new Set([...whitelist, ...selectedPaths])];
					const res = await fetch(`${API}/whitelist`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: next }) });
					const body = await res.json();
					if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
					setSel({}); setNote(tf(lang, "已加入保护名单 {n} 项", { n: selectedPaths.length }));
					await loadOverview();
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, [whitelist, selectedPaths.join("|"), loadOverview, lang]);

			const removeWhitelist = useCallback(async (p) => {
				try {
					const next = whitelist.filter((x) => x !== p);
					const res = await fetch(`${API}/whitelist`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: next }) });
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					await loadOverview();
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
			}, [whitelist, loadOverview]);

			const addWhitelist = useCallback(async () => {
				const p = newWhitelist.trim();
				if (!p) return;
				try {
					const res = await fetch(`${API}/whitelist`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: [...new Set([...whitelist, p])] }) });
					const body = await res.json();
					if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
					setNewWhitelist(""); setNote(tr(lang, "已加入保护名单")); await loadOverview();
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
			}, [whitelist, newWhitelist, loadOverview, lang]);

			const restoreBatch = useCallback(async (batchId, mode = "") => {
				setBusy(true);
				try {
					const payload = mode ? { batchId, onConflict: mode } : { batchId };
					const res = await fetch(`${API}/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
					const body = await res.json();
					if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
					const results = body.results || [];
					const ok = body.summary ? body.summary.ok : results.filter((r) => r.ok).length;
					const failed = body.summary ? body.summary.failed : results.filter((r) => !r.ok).length;
					let msg;
					if (failed > 0) {
						const detail = results.filter((r) => !r.ok).map((r) => r.error).filter(Boolean).slice(0, 3).join("；");
						const conflict = body.summary && body.summary.codes && body.summary.codes.exists > 0;
						msg = tf(lang, "已恢复 {n} 项，失败 {m} 项", { n: ok, m: failed }) + (detail ? "：" + detail : "")
							+ (conflict ? "\n" + tr(lang, "原位置已有同名文件，可另存为副本恢复。") : "");
					} else {
						msg = tr(lang, "该批次已恢复");
					}
					if (body.auditOk === false) msg += "\n" + tr(lang, "恢复记录写入失败：历史里可能仍显示为可恢复。");
					const copies = results.filter((r) => r.ok && r.renamed).map((r) => r.restoredTo || "");
					if (copies.length > 0) {
						msg = tf(lang, "已恢复 {n} 项，其中 {k} 项另存为副本", { n: ok, k: copies.length }) + "\n" + tf(lang, "副本位置：{paths}", { paths: copies.slice(0, 3).join("；") })
							+ (failed > 0 ? "\n" + tf(lang, "已恢复 {n} 项，失败 {m} 项", { n: ok, m: failed }) : "");
					}
					setNote(msg);
					await loadOverview();
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, [loadOverview, lang, trash]);

			const copyCommands = useCallback(async () => {
				const isWin = overview && overview.platform === "win32";
				const cmds = selectedPaths.map((p) => isWin
					? `Move-Item -LiteralPath '${String(p).replace(/'/g, "''")}' -Destination "$env:LOCALAPPDATA\\deepclean-mydisk\\trash"`
					: `mv -n "${p}" ~/.Trash/`).join("\n");
				try { await navigator.clipboard.writeText(cmds); setNote(tf(lang, "已复制 {n} 条命令", { n: selectedPaths.length })); }
				catch { setNote(cmds); }
			}, [selectedPaths.join("|"), lang]);

			const selectRecommended = useCallback(() => {
				const rep = overview && overview.report;
				if (!rep) { setNote(tr(lang, "请先扫描一次")); return; }
				const next = {};
				for (const it of buildRows(rep, rep ? ((overview && overview.whitelist) || []) : [], "all", "", "sizeDesc", lang)) if (it.checkable && it.recommended) for (const p of it.paths) next[p] = true;
				setSel(next); setTab("all"); setRisk("all"); setSearch(""); setConfirming(false); setView("clean"); setNote("");
			}, [overview, lang]);

			// 空间页目录行上的「其中可清理」角标：跳到清理页并按该路径预筛选。
			const goClean = useCallback((p) => {
				setTab("all"); setRisk("all"); setSearch(p); setCleanMode("junk"); setView("clean"); setConfirming(false);
			}, []);

			// 首次体检默认完整扫描：快速扫描不含大文件，向导清单会漏掉最大的释放来源。
			const wizardStart = useCallback((full = true) => {
				setWizard({ open: true, phase: "scanning", batchId: "", batchIds: [], releasedKb: 0, error: "" });
				setWizardSel({});
				startScan(full);
			}, [startScan]);
			const wizardClose = useCallback(() => {
				setWizard({ open: false, phase: "idle", batchId: "", batchIds: [], releasedKb: 0, error: "" });
				setWizardSel({});
			}, []);
			const wizardClean = useCallback(async () => {
				const items = wizardItems(overview && overview.report, whitelist).filter((it) => wizardSel[it.id]);
				const paths = [...new Set(items.flatMap((it) => it.paths))];
				if (paths.length === 0) { setNote(tr(lang, "没有可清理项")); return; }
				const freeBefore = liveDisk ? liveDisk.free : null;
				setBusy(true);
				try {
					const res = await fetch(`${API}/clean`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths }) });
					const body = await res.json();
					if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
					const ok = (body.results || []).filter((r) => r.ok).length;
					const moved = new Set((body.results || []).filter((r) => r.ok).map((r) => r.path));
					const released = items.filter((it) => it.paths.every((p) => moved.has(p))).reduce((sum, it) => sum + it.kb, 0);
					const ids = ok ? (Array.isArray(body.batchIds) ? body.batchIds : (body.batchId ? [body.batchId] : [])) : [];
					setWizard((w) => ({ ...w, phase: "done", batchId: ids[ids.length - 1] || "", batchIds: ids, releasedKb: released }));
					let line = tf(lang, "已移动 {n} 项到{trash}，可撤销", { n: ok, trash }) + (ids.length > 1 ? `（${tf(lang, "分 {n} 批", { n: ids.length })}）` : "") + ((body.results || []).some((r) => !r.ok) ? "\n" + (body.results || []).filter((r) => !r.ok).map((r) => `${r.path}: ${r.error}`).join("\n") : "");
					if (body.auditOk === false) line += "\n" + tf(lang, "审计写入失败：文件已在{trash}，但历史里可能看不到恢复记录。", { trash });
					const ov = await loadOverview();
					const fresh = ov && ov.disk;
					if (freeBefore != null && fresh && typeof fresh.free === "number" && fresh.free > freeBefore) line += "\n" + tf(lang, "可用空间 {from} → {to}（+{delta}）", { from: fmtBytes(freeBefore), to: fmtBytes(fresh.free), delta: fmtBytes(fresh.free - freeBefore) });
					setNote(line);
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, [overview, wizardSel, lang, trash, loadOverview, liveDisk]);
			const wizardUndo = useCallback(async () => {
				setBusy(true);
				try {
					const payload = (wizard.batchIds || []).length > 0 ? { batchIds: wizard.batchIds } : { batchId: wizard.batchId || undefined };
					const res = await fetch(`${API}/undo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
					const body = await res.json();
					if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
					const results = body.results || [];
					const ok = body.summary ? body.summary.ok : results.filter((r) => r.ok).length;
					const failed = body.summary ? body.summary.failed : results.filter((r) => !r.ok).length;
					if (failed > 0) {
						setNote(tf(lang, "已恢复 {n} 项，失败 {m} 项", { n: ok, m: failed }));
					} else {
						setNote(tr(lang, "已撤销"));
						wizardClose();
					}
					if (body.auditOk === false) setNote(tr(lang, "恢复记录写入失败：历史里可能仍显示为可恢复。"));
					await loadOverview();
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, [wizard.batchId, wizard.batchIds, wizardClose, loadOverview, lang]);


			// 优先用宿主实时快照（打开即可显示，无需扫描）；旧版宿主或快照失败时回退到扫描报告。
			const diskFresh = !!liveDisk;
			const processableKb = allRows.filter((r) => r.checkable).reduce((sum, r) => sum + r.kb, 0);
			const history = (overview && overview.history) || [];
			const cleans = (overview && overview.cleanBatches) || [];
			const quarantine = (overview && overview.quarantine) || null;

			// AI 入口：只把已算好的数据拼成提示词注入当前会话；服务不可用或没有会话时降级为复制提示词。
			const askAi = useCallback(async (prompt) => {
				if (!ai || !prompt) return;
				const status = await ai.ask(prompt);
				if (status === "no-session" || status === "unavailable") {
					try {
						if (typeof navigator !== "undefined" && navigator.clipboard) await navigator.clipboard.writeText(prompt);
					} catch { /* 复制失败仍然给出提示 */ }
				}
				if (status === "sent") setNote(tr(lang, "已发送到对话"));
				else if (status === "no-session" || status === "unavailable") setNote(tr(lang, "已复制提示词，打开对话后粘贴发送"));
				else setNote(tr(lang, "AI 发送失败，请重试"));
			}, [ai, lang]);
			const askAiReport = useCallback(() => {
				if (report) askAi(aiReportPrompt(lang, report, allRows, overview && overview.at));
			}, [askAi, report, allRows, lang, overview]);
			const askAiRow = useCallback((row) => {
				if (row) askAi(aiItemPrompt(lang, report, allRows, row, overview && overview.at, row.unknown ? "unknown" : "item"));
			}, [askAi, report, allRows, lang, overview]);
			const askAiReview = useCallback(() => {
				if (report && selectedRows.length > 0) askAi(aiReviewPrompt(lang, report, allRows, selectedRows, selectedKb, overview && overview.at, trash, selectedPaths.length));
			}, [askAi, report, allRows, selectedRows, selectedKb, lang, overview, trash]);
			const askAiHistory = useCallback(() => {
				askAi(aiHistoryPrompt(lang, report, allRows, history, cleans, computeRegrowth(allRows, cleans), overview && overview.at));
			}, [askAi, report, allRows, lang, history, cleans, overview]);
			const nav = [["home", "体检"], ["clean", "清理"], ["space", "空间"], ["history", "历史"], ["settings", "设置"]];

			function Header() {
				return h("header", { className: "dc-header" },
					h("div", { className: "dc-brand" }, h(DiskIcon), "DeepClean MyDisk"),
					h("nav", { className: "dc-nav", "aria-label": tr(lang, "主导航") }, nav.map(([id, label]) => h("button", { key: id, type: "button", "aria-current": view === id ? "page" : undefined, onClick: () => { setView(id); setCleanPurgeIds(null); setConfirming(false); setMoreOpen(false); } }, tr(lang, label)))));
			}
			function Progress() {
				if (!scanning) return null;
				return h("section", { className: "dc-progress", "aria-label": tr(lang, "扫描进度") },
					h("div", { className: "dc-progress-head" }, h("strong", null, tr(lang, "正在扫描…")), h("button", { className: "dc-link", onClick: cancelScan }, tr(lang, "取消扫描"))),
					h("div", { className: "dc-progress-track", role: "progressbar", "aria-label": tr(lang, "扫描进度"), "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": scan.progress || 0 }, h("div", { className: "dc-progress-fill", style: { width: `${Math.max(2, scan.progress || 0)}%` } })),
					h("div", { className: "dc-progress-meta", role: "status" }, h("span", null, trNote(lang, scan.stage || "准备扫描")), h("span", null, `${scan.progress || 0}% · ${scan.elapsed || 0}s`)));
			}

			function WizardPanel() {
				if (!wizard.open) return null;
				const style = { border: "1px solid rgba(80,140,255,.35)", background: "rgba(80,140,255,.05)", borderRadius: 10, padding: "12px 14px", marginTop: 10 };
				const items = wizardItems(overview && overview.report, whitelist);
				const selected = items.filter((it) => wizardSel[it.id]);
				const totalKb = selected.reduce((sum, it) => sum + it.kb, 0);
				const selectedPaths = [...new Set(selected.flatMap((it) => it.paths))];
				if (wizard.phase === "scanning") {
					return h("div", { style }, h("div", { style: { fontSize: 13, fontWeight: 600 } }, tr(lang, "正在扫描…")),
						h("div", { style: { fontSize: 12, opacity: 0.7, marginTop: 4 } }, tr(lang, "扫描完成后会给出推荐清单")));
				}
				if (wizard.phase === "confirm") {
					return h("div", { style },
						h("div", { style: { fontSize: 13, fontWeight: 600 } }, tf(lang, "确认清理 {n} 项（{size}）？", { n: selected.length, size: fmt(totalKb) })),
						h("div", { style: { fontSize: 11, opacity: 0.7, margin: "4px 0 4px" } }, tf(lang, "本次移出 {size}，立即释放 0", { size: fmt(totalKb) })),
						h("div", { style: { fontSize: 11, opacity: 0.7, margin: "0 0 10px" } }, reclaim ? tf(lang, "永久删除本批次后可释放约 {size}（逻辑大小 {logical}）", { size: fmtBytes(reclaim.allocatedBytes), logical: fmtBytes(reclaim.logicalBytes) }) : tr(lang, "正在估算实际释放…")),
						reclaim && reclaim.snapshots ? h("div", { style: { fontSize: 11, opacity: 0.7, margin: "0 0 10px" } }, tf(lang, "本机有 {n} 个 APFS 本地快照，可能影响实际释放", { n: reclaim.snapshots })) : null,
						h("div", { style: { display: "flex", gap: 8 } },
							h("button", { style: btnDanger, disabled: busy, onClick: wizardClean }, busy ? "…" : tr(lang, "确认清理")),
							h("button", { style: btn, disabled: busy, onClick: () => setWizard((w) => ({ ...w, phase: "review" })) }, tr(lang, "取消"))));
				}
				if (wizard.phase === "purgeConfirm") {
					return h("div", { style },
						h("div", { style: { fontSize: 13, fontWeight: 600 } }, tr(lang, "确认永久删除本批次？删除后无法撤销。")),
						h("div", { style: { fontSize: 11, opacity: 0.7, margin: "4px 0 10px" } }, tr(lang, "永久删除后无法恢复，也不会保留恢复记录。")),
						h("div", { style: { display: "flex", gap: 8 } },
							h("button", { style: btnDanger, disabled: busy, onClick: async () => { await doPurgeAll(wizard.batchIds); wizardClose(); } }, tr(lang, "确认永久删除")),
							h("button", { style: btn, disabled: busy, onClick: () => setWizard((w) => ({ ...w, phase: "done" })) }, tr(lang, "取消"))));
				}
				if (wizard.phase === "done") {
					return h("div", { style },
						h("div", { style: { fontSize: 13, fontWeight: 600 } }, tf(lang, "已移入{trash} {size}", { size: displaySize(wizard.releasedKb), trash })),
						h("div", { style: { fontSize: 11, opacity: 0.7, margin: "4px 0 2px" } }, tr(lang, "可用空间现在不会变化")),
						h("div", { style: { fontSize: 11, opacity: 0.7, margin: "0 0 10px" } }, reclaim ? tf(lang, "永久删除此批次后约释放 {size}", { size: fmtBytes(reclaim.allocatedBytes) }) : null),
						h("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
							(wizard.batchId || (wizard.batchIds || []).length > 0) ? h("button", { style: btn, disabled: busy, onClick: wizardUndo }, tr(lang, "撤销")) : null,
							(wizard.batchId || (wizard.batchIds || []).length > 0) ? h("button", { style: btnDanger, disabled: busy, onClick: () => setWizard((w) => ({ ...w, phase: "purgeConfirm" })) }, tr(lang, "永久删除此批次")) : null,
							h("button", { style: btn, onClick: () => { wizardClose(); setView("history"); } }, tr(lang, "清理历史")),
							h("button", { style: btnPrimary, onClick: wizardClose }, tr(lang, "完成"))));
				}
				if (items.length === 0) {
					return h("div", { style }, h("div", { style: { fontSize: 13, fontWeight: 600 } }, tr(lang, "扫描结果")),
						h("div", { style: { fontSize: 12, opacity: 0.7, marginTop: 4 } }, tr(lang, "没有可清理项")),
						h("button", { style: { ...btn, marginTop: 8 }, onClick: wizardClose }, tr(lang, "关闭")));
				}
				const row = (it) => h("label", { key: it.id, style: { display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 12 } },
					h("input", { type: "checkbox", checked: !!wizardSel[it.id], onChange: () => setWizardSel((prev) => {
						const next = { ...prev };
						if (next[it.id]) delete next[it.id];
						else next[it.id] = true;
						return next;
					}) }),
					h("span", { style: { flex: 1 } }, it.name, " ", h("span", { style: { fontSize: 10, opacity: 0.6 } }, tr(lang, it.recommended ? "推荐" : "可选"))),
					h("span", { style: { opacity: 0.7 } }, fmt(it.kb)));
				return h("div", { style },
					h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
						h("div", { style: { fontSize: 13, fontWeight: 600 } }, tr(lang, "扫描结果")),
						h("div", { style: { fontSize: 12, opacity: 0.7 } }, tf(lang, "已选 {n} 项 · {size}", { n: selected.length, size: fmt(totalKb) }))),
					h("div", { style: { maxHeight: 220, overflow: "auto", marginBottom: 8 } }, items.map(row)),
					h("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
						h("button", { style: btnPrimary, disabled: busy || selected.length === 0, onClick: () => { setWizard((w) => ({ ...w, phase: "confirm" })); fetchReclaim(selectedPaths); } }, tr(lang, "清理推荐项")),
						h("button", { style: btn, onClick: () => { selectRecommended(); setView("clean"); } }, tr(lang, "查看全部详情")),
						h("button", { style: btn, onClick: wizardClose }, tr(lang, "关闭"))));
			}

			function Home() {
				const pct = disk && disk.total > 0 ? Math.min(100, Math.round(disk.used / disk.total * 100)) : 0;
				const recent = cleans[0];
				const fresh = reportFresh && !scanning;
				return h(React.Fragment, null,
					h("div", null, h("h1", null, tr(lang, "磁盘体检")), h("p", { className: "dc-subtitle" }, tr(lang, "了解空间占用，按需整理文件。"))),
					h(PermBanner),
					h("section", { className: "dc-disk-summary", "aria-label": tr(lang, "磁盘容量") },
						h("div", { className: "dc-disk-data" }, h("img", { className: "dc-drive-image", src: "/dsh-deepclean/assets/disk.png", alt: "", "aria-hidden": true }),
							h("div", null, h("div", { className: "dc-drive-name" }, tr(lang, "系统磁盘"), disk ? h("span", { className: "dc-live", title: timeStr(disk.at) }, tr(lang, diskFresh ? "实时" : "上次扫描")) : null),
								h("div", { className: "dc-free", "aria-label": disk ? tf(lang, "当前可用 {size}", { size: displaySize(disk.free / 1024) }) : tr(lang, "正在读取磁盘信息…") }, disk ? displaySize(disk.free / 1024) : "—"),
								h("div", { className: "dc-free-label" }, tr(lang, disk ? "当前可用" : "正在读取磁盘信息…")),
								disk ? h("div", { className: "dc-capacity" }, tf(lang, "总容量 {total} · 已用 {used}", { total: displaySize(disk.total / 1024), used: displaySize(disk.used / 1024) })) : null)),
						disk ? h("div", { className: "dc-capacity-chart" },
							h("div", { className: "dc-capacity-track", role: "img", "aria-label": tf(lang, "磁盘已用 {pct}%", { pct }) }, h("div", { className: "dc-capacity-used", style: { width: `${pct}%` } })),
							h("div", { className: "dc-legend" }, h("span", null, h("i", { className: "dc-key dc-key-used" }), tf(lang, "已用 {pct}%", { pct })), h("span", null, h("i", { className: "dc-key" }), tf(lang, "可用 {pct}%", { pct: 100 - pct })))) : null),
					quarantine && quarantine.kb > 0 ? h("section", { className: "dc-notice", role: "status" },
						h(Icon, { name: "info", size: 18 }),
						h("span", null, tf(lang, "{trash}里还有 {size}，永久删除后可释放", { trash, size: displaySize(quarantine.kb) })),
						quarantine.systemTrashKb && quarantine.systemTrashKb > quarantine.kb
							? h("span", { className: "dc-caption" }, tf(lang, "系统废纸篓共 {size}（含非本插件文件，请在 Finder 中清空）", { size: displaySize(quarantine.systemTrashKb) }))
							: null,
						h("button", { className: "dc-link", onClick: () => setView("history") }, tr(lang, "查看并释放"))) : null,
					h("section", { className: "dc-home-action" },
						h("div", { className: "dc-icon-disc" }, h(Icon, { name: "magnifying-glass", size: 37, color: "#6883b5" })),
						h("div", { className: "dc-home-action-body" },
							h("h2", null, tr(lang, scanning ? "正在查找可整理的空间" : fresh ? "扫描已完成，看看清理建议" : "看看哪些空间可以整理")),
							h("p", { className: "dc-subtitle" }, fresh ? tf(lang, "预计可释放 {size}，请核对后再清理。", { size: displaySize(processableKb) }) : tr(lang, "扫描只读取文件信息，清理前由你确认。")),
							scanning ? Progress() : h("div", { className: "dc-home-actions" },
								h("button", { className: "dc-button dc-primary", disabled: busy, onClick: fresh ? () => { wizardClose(); selectRecommended(); } : () => wizardStart(true) }, tr(lang, fresh ? "查看清理建议" : "开始扫描"), h(Icon, { name: "arrow-right", size: 18, color: "white" })),
								ai && report ? h("button", { className: "dc-link", disabled: busy, onClick: askAiReport }, tr(lang, "让 AI 解读这次体检")) : null,
								h("button", { className: "dc-link", "aria-expanded": showAdvanced, onClick: () => setShowAdvanced(!showAdvanced) }, tr(lang, "扫描选项"))),
							h("p", { className: "dc-caption" }, tr(lang, "覆盖应用残留、浏览器缓存、开发缓存与大文件。")),
							showAdvanced && !scanning ? h("div", { className: "dc-scan-options" },
								h("button", { className: "dc-button", disabled: busy, onClick: () => wizardStart(false) }, tr(lang, "快速扫描")),
								h("button", { className: "dc-button", disabled: busy, onClick: () => { wizardClose(); startScan(true); } }, tr(lang, "完整扫描")),
								h("button", { className: "dc-link", onClick: checkPermissions }, tr(lang, "权限检查"))) : null)),
					wizard.open && wizard.phase !== "scanning" ? h("div", { className: "dc-wizard" }, WizardPanel()) : null,
					scan.status === "error" ? h("div", { className: "dc-notice", role: "alert" }, h(Icon, { name: "warning-circle" }), h("span", null, tr(lang, "扫描失败，请重试。"), " ", scan.error || ""), h("button", { className: "dc-link", onClick: () => wizardStart(true) }, tr(lang, "重试"))) : null,
					h("section", { className: "dc-recent" },
						h("div", { className: "dc-icon-disc" }, h(Icon, { name: "clock", size: 25 })),
						h("div", { className: "dc-recent-body" }, h("div", { className: "dc-recent-title" }, tr(lang, "最近一次整理")),
							h("p", { className: "dc-muted" }, recent ? tf(lang, "{time} · 移入{trash} {n} 项", { time: recentTime(recent.at, lang), n: recent.count, trash }) : tr(lang, "还没有整理记录")),
							h("p", { className: "dc-caption dc-recent-note" }, h(Icon, { name: "shield-check", size: 16 }), tf(lang, "文件先移到{trash}，可在「历史」中恢复。", { trash }))),
						h("button", { className: "dc-link", onClick: () => setView("history") }, tr(lang, "查看与恢复"), h(Icon, { name: "caret-right", size: 16, color: "#356ae6" }))));
			}

			function Clean() {
				const categories = [["all", "全部项目", "squares-four"], ["dev", "开发缓存", "code"], ["browser", "浏览器缓存", "globe"], ["leftover", "应用残留", "app-window"], ["app", "应用缓存", "app-window"], ["special", "聊天软件缓存", "chat-circle"], ["other", "其他缓存", "folder"], ["system", "系统缓存", "shield-check"]];
				// 只读/需确认行也给「打开位置」：看见占用但不在允许集合时，用户可自行到系统里处理。
				const revealPath = async (p) => {
					try {
						const res = await fetch(`${API}/reveal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: p }) });
						if (!res.ok) throw Error(tr(lang, "无法打开位置"));
					} catch (err) { setNote(err.message); }
				};
				const visibleSelectable = rows.filter((r) => r.checkable);
				const everySelected = visibleSelectable.length > 0 && visibleSelectable.every((r) => r.paths.every((p) => sel[p]));
				const updateVisible = (checked) => { setConfirming(false); setSel((prev) => { const next = { ...prev }; for (const r of visibleSelectable) for (const p of r.paths) { if (checked) next[p] = true; else delete next[p]; } return next; }); };
				const clear = () => { setSel({}); setConfirming(false); };
				const menuAction = (fn) => { setMoreOpen(false); fn(); };
				return h("div", { className: "dc-clean" },
					Progress(),
					report && !reportFresh && !scanning ? h("div", { className: "dc-notice", role: "status" }, h(Icon, { name: "info" }), h("span", null, tr(lang, "扫描结果已超过 10 分钟，请重新扫描后清理。")), h("button", { className: "dc-link", disabled: busy, onClick: () => startScan(false) }, tr(lang, "重新扫描"))) : null,
					h("div", { className: "dc-clean-workspace" },
						h("nav", { className: "dc-categories", "aria-label": tr(lang, "内容分类") }, h("div", { className: "dc-category-title" }, tr(lang, "内容分类")), categories.filter(([id]) => !report || scanning || id === "all" || allRows.some((r) => r.category === id)).map(([id, label, icon]) => {
							const catRows = id === "all" ? allRows : allRows.filter((r) => r.category === id);
							return h("button", { key: id, className: "dc-category", "aria-pressed": tab === id, onClick: () => { setTab(id); setExpanded(""); setMoreOpen(false); } }, h(Icon, { name: icon, size: 19, color: tab === id ? "#356ae6" : "#667085" }), h("span", null, tr(lang, label), h("small", null, !report || scanning ? tr(lang, "待统计") : displaySize(catRows.reduce((sum, r) => sum + r.kb, 0)))));
						})),
						h("div", { className: "dc-clean-main" },
							h("div", { className: "dc-clean-toolbar" },
								h("div", { className: "dc-clean-total" }, tr(lang, "预计可释放"), h("strong", null, report && !scanning ? displaySize(processableKb) : "—"), h("small", null, tr(lang, "仅统计可清理的项目"))),
								h("label", { className: "dc-field" }, h(Icon, { name: "magnifying-glass", size: 16 }), h("input", { type: "search", "aria-label": tr(lang, "搜索名称或路径"), placeholder: tr(lang, "搜索名称或路径"), value: search, onChange: (e) => setSearch(e.target.value) })),
								h("select", { className: "dc-select", "aria-label": tr(lang, "风险筛选"), value: risk, onChange: (e) => setRisk(e.target.value) }, [["all", "风险：全部"], ["recommended", "推荐清理"], ["optional", "可选清理"], ["review", "需确认"], ["protected", "受保护"]].map(([id, label]) => h("option", { key: id, value: id }, tr(lang, label)))),
								h("select", { className: "dc-select", "aria-label": tr(lang, "排序"), value: sort, onChange: (e) => setSort(e.target.value) }, [["sizeDesc", "大小 ↓"], ["sizeAsc", "大小 ↑"], ["name", "名称"]].map(([id, label]) => h("option", { key: id, value: id }, tr(lang, label))))),
							!report || scanning ? h("div", { className: "dc-empty", role: "status" }, h(Icon, { name: "magnifying-glass", size: 36 }), h("h2", null, tr(lang, scanning ? "正在查找可整理的文件" : "先做一次磁盘扫描")), h("p", null, tr(lang, scanning ? "完成后将显示分类结果，请稍候。" : "扫描只读取文件信息，清理前由你确认。")), !scanning ? h("button", { className: "dc-button dc-primary", disabled: busy, onClick: () => startScan(false) }, tr(lang, "开始扫描")) : null) :
							h("table", { className: "dc-file-table", "aria-label": tr(lang, "清理项目") },
								h("thead", null, h("tr", null,
									h("th", { className: "dc-check-col" }, h("input", { type: "checkbox", "aria-label": tr(lang, "选择当前列表中可清理的项目"), checked: everySelected, disabled: !canClean || visibleSelectable.length === 0, onChange: (e) => updateVisible(e.target.checked), ref: (el) => { if (el) el.indeterminate = !everySelected && visibleSelectable.some((r) => r.paths.some((p) => sel[p])); } })),
									h("th", null, tr(lang, "项目")), h("th", { className: "dc-size-col" }, tr(lang, "大小")), h("th", { className: "dc-impact-col" }, tr(lang, "清理影响")), h("th", { className: "dc-detail-col" }, h("span", { className: "dc-muted" }, tr(lang, "详情"))))),
								h("tbody", null, rows.length === 0 ? h("tr", null, h("td", { colSpan: 5 }, h("div", { className: "dc-empty" }, h("h2", null, tr(lang, search || risk !== "all" ? "没有匹配的项目" : "这个分类没有发现项目")), h("p", null, tr(lang, "试试其他分类或调整筛选条件。"))))) : rows.map((row) => h(React.Fragment, { key: row.id },
									h("tr", { "data-risk": rowRisk(row) },
										h("td", { className: "dc-check-col" }, row.checkable ? h("input", { type: "checkbox", "aria-label": tf(lang, "选择 {name}", { name: row.name }), checked: row.paths.every((p) => sel[p]), disabled: !canClean, onChange: () => toggle(row.paths) }) : h(Icon, { name: "lock-simple", size: 16 })),
										h("td", null, h("div", { className: "dc-file-name" }, h("div", { className: "dc-file-icon" }, h(Icon, { name: { dev: "code", browser: "globe", leftover: "app-window", special: "chat-circle" }[row.category] || "folder", size: 21, color: "#356ae6" })), h("div", { className: "dc-file-name-body" }, h("strong", null, row.name), row.unknown ? h("span", { className: "dc-badge dc-badge-optional", title: tr(lang, "扫描器没有收录这个应用名") }, tr(lang, "未收录")) : null, h("div", { className: "dc-file-path", title: row.paths.join("\n") }, shortPath(row.paths[0] || "", report.home)), h("div", { className: "dc-mobile-impact" }, h("span", { className: `dc-badge dc-badge-${rowRisk(row)}` }, riskLabel(lang, row)))))),
										h("td", { className: "dc-size-col" }, displaySize(row.kb)),
										h("td", { className: "dc-impact-col" }, h("span", { className: `dc-badge dc-badge-${rowRisk(row)}` }, riskLabel(lang, row)), h("p", { className: "dc-impact" }, impactOf(lang, row))),
										h("td", { className: "dc-detail-col" }, h("button", { className: "dc-link dc-details-button", "aria-expanded": expanded === row.id, "aria-controls": `detail-${row.id}`, onClick: () => setExpanded(expanded === row.id ? "" : row.id) }, tr(lang, "查看详情"), h(Icon, { name: expanded === row.id ? "caret-down" : "caret-right", size: 13, color: "#356ae6" })))),
									expanded === row.id ? h("tr", { className: "dc-expanded", id: `detail-${row.id}` }, h("td", { colSpan: 5 }, h("dl", { className: "dc-detail-grid" },
										h("dt", null, tr(lang, "清理影响")), h("dd", null, impactOf(lang, row)),
										h("dt", null, tr(lang, "怎么恢复")), h("dd", null, row.checkable ? tf(lang, "在{trash}或「历史」中恢复", { trash }) : tr(lang, "仅供查看，不提供清理")),
										h("dt", null, tr(lang, "完整路径")), h("dd", null, row.paths.map((p) => h("div", { key: p }, p))),
										h("dt", null, tr(lang, "操作")), h("dd", null, h("button", { className: "dc-link", onClick: () => revealPath(row.paths[0]) }, tr(lang, "打开位置")), ai ? h("button", { className: "dc-link", disabled: busy, onClick: () => askAiRow(row) }, tr(lang, "问 AI")) : null)))) : null)))))),
					lastCleanResult && !confirming ? h("section", { className: "dc-confirm", role: "status", "aria-label": tr(lang, "清理完成") },
						h("strong", null, tf(lang, "已移出 {n} 项 · {size}；可用空间未变化", { n: lastCleanResult.moved, size: displaySize(lastCleanResult.kb) })),
						h("p", { className: "dc-caption" }, tf(lang, "文件在{trash}；永久删除后可释放（约 {size}）", { trash, size: lastCleanResult.allocated != null ? fmtBytes(lastCleanResult.allocated) : "—" })),
						h("div", { className: "dc-confirm-actions" },
							h("button", { className: "dc-button", disabled: busy, onClick: doUndo }, tr(lang, "撤销")),
							h("button", { className: "dc-button dc-primary", disabled: busy || !lastCleanResult.batchIds.length, onClick: () => setCleanPurgeIds([...lastCleanResult.batchIds]) }, tr(lang, "永久删除并释放")),
							h("button", { className: "dc-button", onClick: () => setView("history") }, tr(lang, "清理历史"))),
						cleanPurgeIds && JSON.stringify(cleanPurgeIds) === JSON.stringify(lastCleanResult.batchIds) ? h("div", { role: "group", "aria-label": tr(lang, "确认永久删除") },
							h("p", null, tr(lang, "确认永久删除这次清理的全部批次？删除后无法撤销。")),
							h("button", { className: "dc-button dc-primary", disabled: busy, onClick: () => doPurgeAll(cleanPurgeIds) }, tr(lang, "确认永久删除")),
							h("button", { className: "dc-button", disabled: busy, onClick: () => setCleanPurgeIds(null) }, tr(lang, "取消"))) : null) : null,
					h("footer", { className: "dc-action-bar" },
						confirming && selectedPaths.length > 0 ? h("section", { className: "dc-confirm", ref: confirmRef, tabIndex: -1, onKeyDown: (e) => { if (e.key === "Escape") setConfirming(false); }, role: "region", "aria-label": tr(lang, "确认清理") },
							h("strong", null, tf(lang, "确认将 {n} 项（{size}）移到{trash}？", { n: selectedPaths.length, size: displaySize(selectedKb), trash })),
							h("p", { className: "dc-caption" }, tf(lang, "将移到{trash}，可在「历史」恢复；不会自动永久删除", { trash })),
							selectedPaths.length > 200 ? h("p", { className: "dc-caption" }, tf(lang, "将分 {n} 批执行（每批最多 200 项）", { n: Math.ceil(selectedPaths.length / 200) })) : null,
							h("p", { className: "dc-caption" }, tf(lang, "本次移出 {size}，立即释放 0", { size: displaySize(selectedKb) })),
							h("p", { className: "dc-caption" }, reclaim ? tf(lang, "永久删除本批次后可释放约 {size}（逻辑大小 {logical}）", { size: fmtBytes(reclaim.allocatedBytes), logical: fmtBytes(reclaim.logicalBytes) }) : tr(lang, "正在估算实际释放…")),
							reclaim && reclaim.snapshots ? h("p", { className: "dc-caption" }, tf(lang, "本机有 {n} 个 APFS 本地快照，可能影响实际释放", { n: reclaim.snapshots })) : null,
							h("div", { className: "dc-confirm-actions" }, h("button", { className: "dc-button dc-primary", disabled: !canClean, onClick: doClean }, tr(lang, "确认清理")), h("button", { className: "dc-button", disabled: busy, onClick: () => setConfirming(false) }, tr(lang, "取消")), ai ? h("button", { className: "dc-link", disabled: busy, onClick: askAiReview }, tf(lang, "复核这 {n} 项", { n: selectedPaths.length })) : null)) : null,
						h("div", { className: "dc-action-bar-main" },
							h("div", { className: "dc-selection" }, h("strong", { role: "status" }, tf(lang, "已选 {n} 项 · {size}", { n: selectedStats.items, size: displaySize(selectedKb) })), selectedPaths.length ? h("button", { className: "dc-link", disabled: busy, onClick: clear }, tr(lang, "清空选择")) : null),
							h("button", { className: "dc-button dc-primary", disabled: !canClean || selectedPaths.length === 0 || confirming, onClick: () => { setMoreOpen(false); setConfirming(true); fetchReclaim(selectedPaths); } }, h(Icon, { name: "trash", size: 18, color: "white" }), busy ? tr(lang, "处理中…") : tf(lang, "移到{trash}", { trash })),
							h("div", { className: "dc-more", onKeyDown: (e) => { if (e.key === "Escape") setMoreOpen(false); } },
								h("button", { className: "dc-button", "aria-expanded": moreOpen, "aria-controls": "dc-more-actions", onClick: () => setMoreOpen(!moreOpen) }, tr(lang, "更多操作"), h(Icon, { name: "caret-down", size: 15 })),
								moreOpen ? h("div", { id: "dc-more-actions", className: "dc-menu", "aria-label": tr(lang, "更多操作") },
									h("button", { disabled: !canClean, onClick: () => menuAction(selectRecommended) }, tr(lang, "选中推荐项")),
									h("button", { disabled: !canClean || !visibleSelectable.length, onClick: () => menuAction(() => updateVisible(true)) }, tr(lang, "全选当前列表")),
									h("button", { disabled: !selectedPaths.length || busy, onClick: () => menuAction(copyCommands) }, tr(lang, "复制命令")),
									h("button", { disabled: !selectedPaths.length || busy, onClick: () => menuAction(protectSelected) }, tr(lang, "加入保护名单")),
									h("button", { disabled: !lastBatch || busy || scanning, onClick: () => menuAction(doUndo) }, tr(lang, "撤销上次清理"))) : null)),
						h("p", { className: "dc-caption" }, h(Icon, { name: "info", size: 15 }), tf(lang, "移入{trash}不会立即增加可用空间；可在「历史」中对本批次永久删除。", { trash }))));
			}

			function History() {
				const trend = computeFreeTrend(history);
				const regrowth = computeRegrowth(allRows, cleans);
				const cleanedKb = cleans.reduce((n, b) => n + (b.items || []).reduce((m, it) => m + (Number(it.kb) || 0), 0), 0);
				return h("div", null,
					h("div", { style: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" } },
						h("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 6 } }, tr(lang, "趋势与复清")),
						ai ? h("button", { className: "dc-link", disabled: busy, onClick: askAiHistory }, tr(lang, "让 AI 分析趋势")) : null),
					trend ? h("div", { style: { fontSize: 12, marginBottom: 6 } },
						tf(lang, "过去 {days} 天：可用 {from} → {to}（{delta}）", { days: trend.days, from: fmtBytes(trend.from.free), to: fmtBytes(trend.to.free), delta: (trend.delta >= 0 ? "+" : "-") + fmtBytes(Math.abs(trend.delta)) })) :
						h("div", { style: { fontSize: 12, opacity: 0.6, marginBottom: 6 } }, tr(lang, "还没有足够的历史数据")),
					cleans.length > 0 ? h("div", { style: { fontSize: 12, marginBottom: 6 } },
						cleanedKb > 0
							? tf(lang, "累计清理 {n} 批 · 约 {size}", { n: cleans.length, size: fmt(cleanedKb) })
							: tf(lang, "累计清理 {n} 批", { n: cleans.length }) + " · " + tr(lang, "更早的清理批次没有记录大小")) : null,
					regrowth.length > 0 ? h("div", { style: { marginBottom: 6 } },
						h("div", { style: { fontSize: 12, fontWeight: 600, marginBottom: 2 } }, tr(lang, "清了又长回来")),
						regrowth.map((g) => h("div", { key: g.row.id, style: { fontSize: 12, padding: "2px 0" } },
							h("strong", null, g.row.name), " · ",
							tf(lang, "清过 {size}，现在 {now}（{time}）", { size: fmt(g.cleanedKb), now: fmt(g.row.kb), time: timeStr(g.at) }),
							h("div", { style: { fontSize: 11, opacity: 0.65 } }, tr(lang, "当前体检里再次出现，说明清理后会重新生成，或上次清理不彻底。"))))) : null,
					h("div", { style: { fontSize: 11, opacity: 0.55, marginBottom: 10 } }, tr(lang, "历史趋势数据来自本机的扫描与清理审计；大小由程序统计。")),
					h("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 6 } }, tr(lang, "扫描历史")),
					history.length === 0 ? h("div", { style: { fontSize: 12, opacity: 0.6 } }, tr(lang, "（暂无）")) :
						h("table", { style: table }, h("tbody", null, [...history].reverse().slice(0, 15).map((s, i) =>
							h("tr", { key: i },
								h("td", { style: td }, timeStr(s.at)),
								h("td", { style: td }, tf(lang, "可用 {size}", { size: fmtBytes(s.free) })),
								h("td", { style: td }, tf(lang, "可释放 {size}", { size: fmt(s.totalKb) })),
								h("td", { style: { ...td, opacity: 0.6 } }, `${s.elapsed}s`))))),
					quarantine && quarantine.kb > 0 ? h("div", { style: { borderTop: "1px solid rgba(127,127,127,.18)", padding: "10px 0" } },
						h("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 4 } }, tr(lang, "隔离区/废纸篓")),
						h("div", { style: { fontSize: 12, marginBottom: 4 } }, tf(lang, "{trash}里还有 {size}，永久删除后可释放", { trash, size: fmt(quarantine.kb) })),
						h("div", { style: { fontSize: 11, opacity: 0.6, marginBottom: 6, wordBreak: "break-all" } }, quarantine.root),
						h("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
							h("button", { style: btn, disabled: busy, onClick: () => setPurgeAllConfirm(!purgeAllConfirm) }, tf(lang, "永久删除全部（{n} 批）", { n: quarantine.batches ? quarantine.batches.length : 0 })),
							h("button", { style: btn, disabled: busy, onClick: async () => {
								try {
									const r = await fetch(`${API}/reveal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: quarantine.root }) });
									if (!r.ok) throw Error(tr(lang, "无法打开位置"));
								} catch (err) { setNote(String(err && err.message ? err.message : err)); }
							} }, tr(lang, "打开位置"))),
						purgeAllConfirm ? h("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 } },
							h("span", { style: { fontSize: 12, color: "#e5534b" } }, tr(lang, "确认永久删除全部？删除后无法撤销。")),
							h("button", { style: btnDanger, disabled: busy, onClick: () => doPurgeAll(quarantine.batches ? quarantine.batches.map((b) => b.batchId) : []) }, tr(lang, "确认永久删除全部")),
							h("button", { style: btn, disabled: busy, onClick: () => setPurgeAllConfirm(false) }, tr(lang, "取消"))) : null) : null,
					h("div", { style: { fontSize: 13, fontWeight: 600, margin: "14px 0 6px" } }, tr(lang, "清理批次（可恢复）")),
					cleans.length === 0 ? h("div", { style: { fontSize: 12, opacity: 0.6 } }, tr(lang, "（暂无）")) :
						cleans.map((c) => {
							const ok = c.restorable === undefined ? c.count : c.restorable;
							return h("div", { key: c.batchId, style: { borderTop: "1px solid rgba(127,127,127,.18)", padding: "8px 0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } },
								h("span", { style: { fontSize: 12 } }, timeStr(c.at)),
								h("span", { style: { fontSize: 12, opacity: 0.7 } }, tf(lang, "{n} 项", { n: c.count }) + (ok !== c.count ? tf(lang, "，其中 {n} 项可恢复", { n: ok }) : "")),
								h("button", { style: btn, disabled: busy || ok === 0, onClick: () => restoreBatch(c.batchId) },
									ok > 0 ? tr(lang, "恢复此批次")
										: c.purged ? tr(lang, "已永久删除")
											: (c.restored > 0 ? tr(lang, "已恢复") : tr(lang, "已清空"))),
								c.lastRestore && c.lastRestore.codes && c.lastRestore.codes.exists > 0
									? h("button", { style: btn, disabled: busy || ok === 0, onClick: () => restoreBatch(c.batchId, "rename") }, tr(lang, "另存为副本恢复"))
									: null,
								c.lastRestore && c.lastRestore.failed > 0
									? h("span", { style: { fontSize: 11, color: "#e5534b" } }, tf(lang, "上次恢复失败 {n} 项", { n: c.lastRestore.failed }))
									: null,
								ok > 0 ? h("button", { style: btnDanger, disabled: busy, onClick: () => setPurgeConfirm(purgeConfirm === c.batchId ? "" : c.batchId) }, tr(lang, "永久删除此批次")) : null,
								purgeConfirm === c.batchId ? h("div", { style: { flexBasis: "100%", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 } },
									h("span", { style: { fontSize: 12, color: "#e5534b" } }, tr(lang, "确认永久删除本批次？删除后无法撤销。")),
									h("button", { style: btnDanger, disabled: busy, onClick: () => doPurge(c.batchId) }, tr(lang, "确认永久删除")),
									h("button", { style: btn, disabled: busy, onClick: () => setPurgeConfirm("") }, tr(lang, "取消"))) : null);
						}),
				);
			}

            function SpacePage() {
                return h("div",null,
                    h("div",{className:"dc-page-head"},h("div",null,h("h1",null,tr(lang,"空间分析")),h("p",{className:"dc-subtitle"},tr(lang,"找到占用来源，按需整理或移动。"))),
                        h("div",{className:"dc-mode-switch","aria-label":tr(lang,"空间视图")},[["tree","目录分布"],["large","大文件"]].map(([id,label])=>h("button",{key:id,"aria-pressed":spaceMode===id,onClick:()=>setSpaceMode(id)},tr(lang,label))))),
                    h("div",{hidden:spaceMode!=="tree"},h(SpaceView,{lang,report,fresh:reportFresh,whitelist,refreshToken:spaceRefresh,onClean:goClean,onLarge:(p,files,at)=>{setSpaceScope(p);setSpaceFiles({scope:p,files,at});setSpaceMode("large");}})),
                    h("div",{hidden:spaceMode!=="large"},h(LargeView,{report,lang,scan,fresh:reportFresh,scope:spaceScope,ai,onScope:(p)=>{setSpaceScope(p);if(!p)setSpaceFiles(null);},local:spaceFiles&&spaceScope&&spaceFiles.scope===spaceScope?spaceFiles:null,onLocal:setSpaceFiles,onScan:()=>startScan(true),onCancel:cancelScan,at:overview?.at,whitelist,onMoved:()=>{loadOverview();refreshDisk();setSpaceRefresh(n=>n+1);}})));
            }

			function CleanPage() {
				return h(React.Fragment, null,
					h("div", { className: "dc-page-head" }, h("div", null, h("h1", null, tr(lang, cleanMode === "junk" ? "清理文件" : "相似照片")),
						h("div", { className: "dc-page-meta" }, h("span", null, tr(lang, scanning ? "扫描中…" : !report ? "等待首次扫描" : reportFresh ? "扫描完成" : "扫描结果已过期"), report && !scanning ? ` · ${recentTime(overview.at, lang)}` : ""),
						h("button", { className: "dc-link", disabled: scanning || busy, onClick: () => startScan(false) }, h(Icon, { name: "arrow-clockwise", size: 17, color: "#356ae6" }), tr(lang, "重新扫描")))),
						h("div", { className: "dc-mode-switch", "aria-label": tr(lang, "清理类型") }, [["junk", "垃圾清理"], ["photos", "相似照片"]].map(([id, label]) => h("button", { key: id, "aria-pressed": cleanMode === id, onClick: () => setCleanMode(id) }, tr(lang, label))))),
					h(PermBanner),
					cleanMode === "junk" ? Clean() : h(PhotoView, { lang, platform: (overview && overview.platform) || "" }));
			}

			function Settings() {
				const safety = [
					tf(lang, "默认只移动：清理和照片去重都先移到{trash}，可在「历史」恢复；永久删除需在「历史」中二次确认。", { trash }),
					tr(lang, "「需确认」和聊天数据永远不会被自动勾选，也不会进入推荐清理。"),
					tr(lang, "保护名单中的路径永远不会被清理；符号链接一律拒绝。"),
					tr(lang, "跨盘移动会先复制并做 SHA-256 校验，校验失败保留原文件。"),
				];
				return h("div", null,
					h("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 6 } }, tr(lang, "安全说明")),
					h("ul", { style: { margin: "0 0 12px", paddingLeft: 18, fontSize: 12, opacity: 0.8, lineHeight: 1.8 } },
						safety.map((x, i) => h("li", { key: i }, x))),
					h("div", { style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 14 } },
						h("span", { style: { fontSize: 13, fontWeight: 600 } }, tr(lang, "语言 / Language")),
						h("button", { style: lang === "zh" ? btnPrimary : btn, onClick: () => setLang("zh") }, "中文"),
						h("button", { style: lang === "en" ? btnPrimary : btn, onClick: () => setLang("en") }, "English")),
					h("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 6 } }, tr(lang, "保护名单（永不清理）")),
					whitelist.length === 0 ? h("div", { style: { fontSize: 12, opacity: 0.6, marginBottom: 6 } }, tr(lang, "（暂无）")) :
						h("div", { style: { marginBottom: 8 } }, whitelist.map((p) => h("div", { key: p, style: { display: "flex", gap: 8, alignItems: "center", padding: "3px 0" } },
							h("span", { style: { fontSize: 11.5, wordBreak: "break-all", flex: 1 } }, p),
							h("button", { style: btn, onClick: () => removeWhitelist(p) }, tr(lang, "移除"))))),
					h("div", { style: { display: "flex", gap: 8, marginBottom: 14 } },
						h("input", { style: { ...input, flex: 1 }, placeholder: tr(lang, "输入要保护的绝对路径"), value: newWhitelist, onChange: (e) => setNewWhitelist(e.target.value) }),
						h("button", { style: btn, onClick: addWhitelist }, tr(lang, "添加"))),
					h("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 6 } }, tr(lang, "环境")),
					h("div", { style: { fontSize: 12, opacity: 0.75, lineHeight: 1.8 } },
						h("div", null, `${tr(lang, "平台")}: ${overview ? overview.platform : "?"}`),
						h("div", null, `${tr(lang, "权限")}: ${report && report.fda ? (report.fda.status === "granted" ? tr(lang, "完全磁盘访问已授权") : report.fda.status === "denied" ? tr(lang, "完全磁盘访问未授权") : tr(lang, "无法确认")) : tr(lang, "未知")}`),
						h("div", null, `${tr(lang, "隔离区/废纸篓")}: ${quarantine ? quarantine.root : "—"}${quarantine ? ` · ${fmt(quarantine.kb)}` : ""}`),
						h("div", null, `${tr(lang, "审计日志")}: ${(overview && overview.paths && overview.paths.audit) || "~/.dsh/deepclean-audit.log"}`),
						h("div", null, `${tr(lang, "历史文件")}: ${(overview && overview.paths && overview.paths.history) || "~/.dsh/deepclean-history.json"}`),
						h("div", null, `${tr(lang, "保护名单文件")}: ${(overview && overview.paths && overview.paths.whitelist) || "~/.dsh/deepclean-whitelist.json"}`)),
					h("div", { style: { display: "flex", gap: 8, marginTop: 10 } },
						h("button", { style: btn, onClick: checkPermissions }, tr(lang, "权限检查")),
						h("button", { style: btn, disabled: busy || scan.status === "running", onClick: () => startScan(false) }, tr(lang, "立即扫描"))));
			}

			return h("div", { className: "dc", ref: rootRef, lang: lang === "en" ? "en" : "zh-CN" },
				h("style", null, STYLES), Header(),
				h("main", { className: "dc-content" },
					note ? h("div", { className: "dc-notice", role: "status" }, h(Icon, { name: "info", size: 18 }), h("span", null, trNote(lang, note)), h("button", { "aria-label": tr(lang, "关闭提示"), onClick: () => setNote("") }, h(Icon, { name: "x", size: 17 }))) : null,
					h("div", { hidden: view !== "space" }, (spaceVisited || view === "space") ? SpacePage() : null),
                    view === "home" ? Home() : view === "clean" ? CleanPage() : h("div", { className: "dc-legacy-page" }, view === "space" ? null : view === "history" ? History() : Settings())));

		}

		function apply(ctx) {
			// AI 入口只依赖 client 侧的会话服务（只读：往当前会话注入一段提示词），不新增宿主路由。
			const ai = createAiBridge(ctx);
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: PANEL_ID,
				order: 30,
				label: "DeepClean MyDisk",
			}, DiskIcon));
			ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_ID,
				inject: () => ({ ai }),
			}, Panel));
		}

		exports.apply = apply;
		exports.inject = ["slots"];
		return module.exports;
	}
});
