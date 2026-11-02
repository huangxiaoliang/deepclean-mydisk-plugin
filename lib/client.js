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
		const EN = {
		 "首页": "Home",
		 "空间": "Space",
		 "大文件": "Large files",
		 "清理": "Clean",
		 "相似照片": "Similar photos",
		 "历史": "History",
		 "设置": "Settings",
		 "可用": "Free",
		 "共": "of",
		 "可回收约": "Reclaimable about",
		 "安全": "Safe",
		 "缓存": "Cache",
		 "开发": "Dev",
		 "快速扫描": "Quick scan",
		 "智能体检": "Smart scan",
		 "完整扫描": "Full scan",
		 "权限检查": "Check permission",
		 "扫描中…": "Scanning…",
		 "取消": "Cancel",
		 "重试": "Retry",
		 "查看": "View",
		 "添加": "Add",
		 "移除": "Remove",
		 "可用空间趋势": "Free space trend",
		 "可安全清理": "Safe to clean",
		 "缓存 + 开发缓存": "Cache + dev cache",
		 "清理历史": "Clean history",
		 "需确认": "Needs review",
		 "缓存/开发": "Cache/Dev",
		 "微信/QQ": "WeChat/QQ",
		 "系统缓存": "System cache",
		 "选中推荐项": "Select recommended",
		 "搜索名称/路径…": "Search name/path…",
		 "大小 ↓": "Size ↓",
		 "大小 ↑": "Size ↑",
		 "名称": "Name",
		 "项目": "Item",
		 "大小": "Size",
		 "说明": "Details",
		 "（无）": "(none)",
		 "已选 {n} 项 · {size}": "Selected {n} items · {size}",
		 "清理选中": "Clean selected",
		 "复制命令": "Copy commands",
		 "加入保护": "Protect",
		 "撤销上次清理": "Undo last clean",
		 "确认把 {n} 项（{size}）移到废纸篓？": "Move {n} items ({size}) to Trash?",
		 "确认清理": "Confirm clean",
		 "上次清理可撤销": "Last clean can be undone",
		 "扫描历史": "Scan history",
		 "清理批次（可恢复）": "Clean batches (restorable)",
		 "恢复此批次": "Restore this batch",
		 "已恢复/已清空": "Restored/emptied",
		 "保护名单（永不清理）": "Protected paths (never clean)",
		 "环境": "Environment",
		 "平台": "Platform",
		 "权限": "Permission",
		 "语言 / Language": "Language",
		 "中文": "中文",
		 "English": "English",
		 "安全说明": "Safety",
		 "知道了": "Got it",
		 "查看安全说明": "Safety details",
		 "默认只移动：清理和照片去重先进废纸篓/隔离区，可在「历史」恢复；永久删除需在历史中二次确认。": "Moves by default: cleaned files go to Trash/quarantine and can be restored from History; permanent deletion requires a second confirmation in History.",
		 "「需确认」与聊天数据永不自动勾选，也不会进入一键清理。": "\"Needs review\" and chat data are never auto-selected and never enter one-click clean.",
		 "白名单路径永远拒绝清理；符号链接永远拒绝。": "Whitelisted paths are always refused; symlinks are always refused.",
		 "跨盘搬家会复制并做 SHA-256 校验，校验失败保留原文件。": "Cross-disk moves copy and verify SHA-256; on mismatch the original file is kept.",
		 "为什么在这里": "Why here",
		 "删了会怎样": "What happens if deleted",
		 "怎么恢复": "How to recover",
		 "缓存/残留，可重建或重新下载": "Cache/leftover; recreated or re-downloaded",
		 "不影响登录、文档或聊天记录": "Login state, documents, chats are unaffected",
		 "在废纸篓或历史中恢复": "Restore from Trash or History",
		 "可能含聊天记录/文档/笔记": "May contain chats/documents/notes",
		 "建议先打开确认；删除后可从废纸篓恢复": "Open and check first; restorable from Trash",
		 "收益小，可能影响系统行为": "Small gain; may affect system behavior",
		 "不提供清理": "Not offered for cleaning",
		 "聊天数据": "Chat data",
		 "删除后可能无法恢复": "May be unrecoverable after deletion",
		 "仅支持手动处理": "Handle manually only",
		 "在白名单中": "Whitelisted",
		 "不会被清理": "Will never be cleaned",
		 "可能含镜像/归档/模拟器数据": "May contain images/archives/simulator data",
		 "删除不可恢复": "Cannot be recovered",
		 "手动处理": "Handle manually",
		 "扫描结果已超过 10 分钟，清理会被拒绝。": "Scan result is older than 10 minutes; cleaning will be refused.",
		 "重新扫描": "Rescan",
		 "还没有扫描结果，先点": "No scan yet. Click",
		 "或回首页选择完整扫描": "or go Home for a full scan.",
		 "上一级": "Up",
		 "家目录": "Home",
		 "统计中…": "Calculating…",
		 "点击色块": "Click a slice",
		 "钻取目录": "to drill down",
		 "按大小": "By size",
		 "按未修改天数": "By unmodified days",
		 "全部时间": "Any time",
		 "全部类型": "Any type",
		 "复制路径": "Copy path",
		 "Finder": "Finder",
		 "移动到…": "Move to…",
		 "确认移动": "Confirm move",
		 "扫描相似照片": "Scan similar photos",
		 "建议保留": "Keep",
		 "可清理": "Removable",
		 "移到废纸篓": "Move to Trash",
		 "撤销照片清理": "Undo photo clean",
		 "上次照片清理可恢复": "Last photo clean can be restored",
		 "默认保留每组第一张（体积最大），取消勾选可调整": "Keeps the first (largest) item per group by default; uncheck to adjust",
		 "扫描 {n} 张，比较 {m} 张，找到 {g} 组相似；预计可回收 {size}": "Scanned {n}, compared {m}, found {g} similar groups; reclaimable {size}",
		 "还没有扫描结果，先点「快速扫描」开始第一次体检。": "No scan yet. Click 'Quick scan' to start.",
		 "扫描失败：": "Scan failed: ",
		 "未知错误": "unknown error",
		 "目标目录，例如 /Volumes/Backup": "Destination, e.g. /Volumes/Backup",
		 "已选 {n} 张 · {size}": "Selected {n} photos · {size}",
		 "只读；个人文件请自行判断": "Read-only; judge personal files yourself",
		 "只读展示；勾选后可「移动」到其他磁盘": "Read-only; select files to move to another disk",
		 "相似组 · {n} 张 · 可回收 {size}": "Similar group · {n} photos · reclaimable {size}",
		 "数据文件位置": "Data files",
		 "历史文件": "History file",
		 "白名单文件": "Whitelist file"
		};
						Object.assign(EN, {
		 "勾选后可「移动」到其他磁盘；跨盘会复制并校验": "Select files to move to another disk; cross-disk copies are verified",
		 "正在移动 {done}/{total}": "Moving {done}/{total}",
		 "已选 {n} 个 · {size}": "Selected {n} files · {size}",
		 "没有符合条件的大文件；需要先「完整扫描」": "No matching large files; run a full scan first",
		 "先扫描一次": "Scan first",
		 "确认移动 {n} 个文件到 {dest}？": "Move {n} files to {dest}?",
		 "目标目录，例如 /Volumes/Backup": "Destination, e.g. /Volumes/Backup",
		 "确认把 {n} 张移到废纸篓？": "Move {n} photos to Trash?",
		 "已选 {n} 张 · {size}": "Selected {n} photos · {size}",
		 "相似组 · {n} 张 · 可回收 {size}": "Similar group · {n} photos · reclaimable {size}",
		 "已移动 {n} 个文件（跨盘 SHA-256 校验通过）": "Moved {n} files (SHA-256 verified for cross-disk)",
		 "已移动 {n} 张相似照片到废纸篓，可撤销": "Moved {n} similar photos to Trash; can be undone",
		 "已恢复 {n} 张照片": "Restored {n} photos",
		 "正在移动中…": "Moving…",
		 "准备中…": "Preparing…",
		 "移动中…": "Moving…",
		 "上次照片清理可恢复": "Last photo clean can be restored",
		 "数据文件位置": "Data files"
		});
		Object.assign(EN, {
		 "将移到废纸篓，可在「历史」恢复；不会自动永久删除": "Moves to Trash; restorable from History; not automatically deleted",
		 "审计日志": "Audit log",
		 "历史文件": "History file",
		 "白名单文件": "Whitelist file",
		 "语言": "Language",
		 "输入要保护的绝对路径": "Absolute path to protect",
		 "完全磁盘访问已授权": "Full Disk Access granted",
		 "完全磁盘访问未授权": "Full Disk Access not granted",
		 "无法确认": "Unknown",
		 "未知": "Unknown",
		 "立即扫描": "Scan now",
		 "（暂无）": "(none)",
		 "安全说明": "Safety",
		 "为什么在这里": "Why here",
		 "删了会怎样": "What happens if deleted",
		 "怎么恢复": "How to recover",
		 "（无说明）": "(no details)"
		});
		Object.assign(EN, {"体检": "Checkup", "目录分布": "Folders", "垃圾清理": "Junk clean"});
		Object.assign(EN, {"磁盘空间分布": "Disk usage", "点击色块": "Click a slice", "钻取目录": "to drill down"});
		Object.assign(EN, {"开始体检": "Start checkup", "高级选项": "Advanced", "体检结果": "Checkup result", "推荐清理": "Recommended", "可选缓存": "Optional cache", "清理推荐项": "Clean recommended", "查看全部详情": "View all details", "已释放 {size}": "Released {size}", "完成": "Done", "没有可清理项": "Nothing to clean", "正在体检…": "Checking…", "关闭": "Close", "确认清理": "Confirm clean", "推荐": "Recommended", "可选": "Optional", "体检": "Checkup"});
		Object.assign(EN, {"已移动 {n} 项到废纸篓": "Moved {n} items to Trash", "还没有体检结果：点「开始体检」统计可清理项。": "No checkup yet: click 'Start checkup' to measure what can be cleaned.", "体检": "Checkup"});
		Object.assign(EN, {"确认清理 {n} 项（{size}）？": "Clean {n} items ({size})?", "撤销": "Undo", "已释放 {size}": "Released {size}"});
		Object.assign(EN, {
		 "实时": "Live",
		 "已用": "used",
		 "磁盘已用 {pct}%": "Disk used {pct}%",
		 "正在读取磁盘信息…": "Reading disk…",
		 "已用 {used} · 共 {total} · 可用 {free}": "Used {used} · Total {total} · Free {free}",
		 "共 {total} · 已用 {used}": "{total} total · {used} used",
		 "实时读取（无需扫描）· {time}": "Live read, no scan needed · {time}"
		});
		Object.assign(EN, {"全选": "Select all", "清空": "Clear", "选择 ≥ {size}": "Select ≥ {size}", "项": "items", "分区总览": "Overview", "已卸载 App 的缓存/残留，可安全清理；删除不影响登录/文档": "Caches/leftovers of uninstalled apps; safe, login/docs unaffected", "可能含聊天记录/文档/笔记，默认锁定，需人工确认": "May contain chats/docs/notes; locked, needs manual review", "缓存可再生；Docker/Archives 等高风险项已锁定": "Caches regenerate; high-risk items (Docker/Archives) are locked", "聊天数据只读；缓存可清理": "Chat data is read-only; caches can be cleaned", "系统缓存，收益小，不建议清理": "System cache; small gain, not recommended"});
		Object.assign(EN, {"{n} 项 · {size}": "{n} items · {size}"});
		Object.assign(EN, {"目标磁盘": "Target disk", "打开目标文件夹": "Open destination", "目标可用 {free} · 已选 {size}": "Destination free {free} · selected {size}", "选择目标磁盘…": "Choose a destination…", "空间不足，可能无法移动": "Not enough space; move may fail", "保留策略": "Keep rule", "最大": "Largest", "最新": "Newest", "路径最浅": "Shallowest", "全部文件夹": "All folders", "对比": "Compare", "选择保留的照片": "Choose the photo to keep", "应用保留": "Apply"});
		Object.assign(EN, {
 "主导航": "Main navigation",
 "磁盘体检": "Disk checkup",
 "了解空间占用，按需整理文件。": "Understand your storage. Organize what you choose.",
 "磁盘容量": "Disk capacity",
 "系统磁盘": "System disk",
 "上次扫描": "Last scan",
 "当前可用 {size}": "{size} available",
 "当前可用": "Available now",
 "总容量 {total} · 已用 {used}": "Total {total} · Used {used}",
 "已用 {pct}%": "Used {pct}%",
 "可用 {pct}%": "Free {pct}%",
 "正在查找可整理的空间": "Finding space to organize",
 "体检已完成，看看处理建议": "Your checkup is ready",
 "看看哪些空间可以整理": "See what you can organize",
 "可处理 {size}，请核对后再清理。": "{size} can be moved. Review before cleaning.",
 "扫描只读取文件信息，清理前由你确认。": "Scanning is read-only. You confirm what gets moved.",
 "查看清理建议": "Review suggestions",
 "扫描选项": "Scan options",
 "覆盖应用残留、浏览器缓存和开发缓存。": "Checks app leftovers, browser caches and developer caches.",
 "扫描失败，请重试。": "Scan failed. Please try again.",
 "最近一次整理": "Last cleanup",
 "{time} · {n} 项移入记录": "{time} · {n} items moved",
 "还没有整理记录": "No cleanup history yet",
 "文件先移到废纸篓，可在历史中恢复。": "Files go to Trash first. Restore them from History.",
 "查看与恢复": "Review and restore",
 "体检进度": "Checkup progress",
 "取消扫描": "Cancel scan",
 "已移入废纸篓 {size}": "Moved {size} to Trash",
 "受保护": "Protected",
 "推荐处理": "Recommended",
 "可选处理": "Optional",
 "已加入保护，不会移动": "Protected; will not be moved",
 "可能含重要数据，仅供查看": "May contain important data; view only",
 "下次构建时重新生成": "Regenerated on the next build",
 "使用时可能重新下载或构建": "May require downloading or building again",
 "网页资源可能需要重新加载": "Web resources may need to reload",
 "缓存可重新生成": "Cache can be regenerated",
 "全部项目": "All items",
 "开发缓存": "Developer caches",
 "浏览器缓存": "Browser caches",
 "应用残留": "App leftovers",
		 "应用缓存": "App cache",
		 "已安装 App 的缓存/临时文件，可重建，不碰聊天/文档": "Installed app caches/temp; regenerable, chat/docs untouched",
		 "App 正在运行，退出后可清理": "App is running; quit it before cleaning",
 "聊天软件缓存": "Chat app caches",
 "其他缓存": "Other caches",
 "内容分类": "Categories",
 "待统计": "Pending",
 "建议处理": "Suggested cleanup",
 "仅统计可移动的项目": "Only items that can be moved",
 "搜索名称或路径": "Search name or path",
 "风险筛选": "Filter by risk",
 "风险：全部": "Risk: all",
 "排序": "Sort",
 "正在查找可整理的文件": "Finding files to organize",
 "先做一次磁盘体检": "Start with a disk checkup",
 "完成后将显示分类结果，请稍候。": "Results will appear when scanning finishes.",
 "选择当前列表中可处理的项目": "Select movable items in this list",
 "处理影响": "Impact",
 "详情": "Details",
 "没有匹配的项目": "No matching items",
 "这个分类没有发现项目": "No items found in this category",
 "试试其他分类或调整筛选条件。": "Try another category or adjust the filters.",
 "选择 {name}": "Select {name}",
 "查看详情": "View details",
 "完整路径": "Full paths",
 "仅供查看，不提供清理": "View only; cleanup is unavailable",
 "确认将 {n} 项（{size}）移到废纸篓？": "Move {n} items ({size}) to Trash?",
 "确认移入": "Confirm move",
 "清空选择": "Clear selection",
 "移到废纸篓": "Move to Trash",
 "处理中…": "Working…",
 "更多操作": "More actions",
 "全选当前列表": "Select all in this list",
 "移入废纸篓不会立即增加可用空间；可在历史中对本批次永久删除。": "Restore from History. Moving to Trash does not immediately free disk space.",
 "清理文件": "Clean files",
 "等待首次体检": "Waiting for your first checkup",
 "扫描完成": "Scan complete",
 "扫描结果已过期": "Scan results expired",
 "扫描结果已超过 10 分钟，请重新扫描后清理。": "Scan results are over 10 minutes old. Scan again before cleanup.",
 "清理类型": "Cleanup type",
 "关闭提示": "Dismiss notification",
 "准备扫描": "Preparing scan",
 "扫描 App 容器与缓存…": "Scanning app containers and caches…",
 "扫描 App 容器": "Scanning app containers",
 "扫描系统/用户缓存": "Scanning system and user caches",
 "扫描 ~/.cache": "Scanning ~/.cache",
 "扫描开发缓存": "Scanning developer caches",
 "识别已安装 App": "Identifying installed apps",
 "扫描大文件": "Scanning large files",
 "整理结果": "Preparing results",
 "分析微信/企微/QQ 数据": "Analyzing chat app data",
 "统计废纸篓": "Measuring Trash",
 "完成": "Done"
});
		Object.assign(EN, { "npm 缓存": "npm cache", "Maven 本地仓库": "Maven repository", "pnpm 缓存": "pnpm cache", "Codex 运行缓存": "Codex runtime cache", "Xcode 归档": "Xcode archives", "iOS 模拟器数据": "iOS simulator data" });
		Object.assign(EN, {"离线构建可能受影响": "Offline builds may be affected", "安装依赖时可能重新下载": "May download dependencies again"});
		Object.assign(EN, {"扫描已取消":"Scan canceled", "正在取消…":"Canceling…", "已加入白名单":"Added to protected paths", "已撤销":"Restored"});
		Object.assign(EN, {"清理项目":"Cleanup items"});
		Object.assign(EN, {"今天 {time}":"Today {time}"});
        Object.assign(EN, {
            "已停止等待，可重试。": "Stopped waiting. You can retry.",
            "目标目录不可写": "The destination folder is not writable",
            "已复制路径": "Path copied", "无法复制路径": "Could not copy path", "重新统计": "Refresh totals",
            "空间分析": "Storage analysis",
            "找到占用来源，按需整理或搬家。": "Find what uses storage. Organize or move what you choose.",
            "空间视图": "Storage view",
            "仅统计家目录，包含隐藏项；不代表整盘已用容量。": "Home folder including hidden items; this is not total disk usage.",
            "按文件大小统计；压缩、共享文件和系统保留空间可能造成差异。": "Logical file sizes; compression, shared files and system reserves can cause differences.",
            "按文件占用统计；共享文件和系统保留空间可能造成差异。": "Allocated file storage; shared files and system reserves can cause differences.",
            "修改时间": "Modification time",
            "修改时间未知": "Modification time unknown",
            "停止等待": "Stop waiting",
            "全部大小": "All sizes",
            "共 {n} 个文件": "{n} files",
            "取消失败": "Could not cancel",
            "当前已统计": "Counted in this folder",
            "当前目录分布": "Current folder usage",
            "成功后原位置不再保留文件；搬家不属于废纸篓恢复记录。": "After success, files leave their original location. Moves are not restored through Trash history.",
            "打开位置": "Show location",
            "扫描结果已过期，请重新扫描后搬家。": "Results have expired. Scan again before moving.",
            "扫描范围：家目录 · 大文件 ≥300 MB（结果数量有限）": "Scope: home folder · files ≥300 MB (limited results)",
            "文件类型": "File type",
            "无法打开位置": "Could not open location",
            "无法读取搬家进度": "Could not read move progress",
            "显示更多": "Show more",
            "最小大小": "Minimum size",
            "未能读取 {n} 项，跳过链接 {s} 项；统计可能不完整。": "Could not read {n} items; skipped {s} links. Totals may be incomplete.",
            "查看此目录的大文件": "Large files in this folder",
            "正在取消；当前文件处理完成后停止。": "Canceling after the current file finishes.",
            "正在扫描大文件…": "Scanning large files…",
            "正在统计目录，请稍候…": "Counting folder usage, please wait…",
            "此目录没有可显示的项目": "No items to display in this folder",
            "点击目录或色块进入下一级": "Select a folder or chart segment to explore",
            "目录导航": "Folder navigation",
            "目标目录": "Destination folder",
            "目标磁盘空间不足": "Not enough space on the destination",
            "超过 {n} 天未修改": "Not modified for {n} days",
            "进入子文件夹": "Enter subfolder",
            "选择文件夹": "Browse folders",
            "选择筛选结果": "Select filtered results",
            "部分统计": "Partial total",
            "搜索名称或路径": "Search name or path",
            "排序": "Sort",
            "搬家已取消；已完成的文件保留在目标位置。": "Move canceled. Completed files remain at the destination.",
            "搬家失败，请查看详情。": "Move failed. See details.",
            "搬家完成": "Move completed",
            "大文件扫描失败，请重试": "Large-file scan failed. Try again.",
            "扫描已取消": "Scan canceled",
            "先扫描，查找占用较大的文件": "Scan to find large files",
            "当前体检未覆盖大文件，请进行完整扫描": "This checkup did not cover large files. Run a full scan.",
            "没有符合筛选条件的大文件": "No large files match these filters",
            "没有发现大文件": "No large files found",
            "清除筛选": "Clear filters",
            "清空选择": "Clear selection",
            "选择 {name}": "Select {name}"
});

		Object.assign(EN, {"永久删除后无法从废纸篓恢复，也不会进入历史恢复记录。": "After permanent deletion it cannot be restored from Trash or History."});
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
                [/^已移动 (\d+) 项到废纸篓\/隔离区，可撤销/, "Moved $1 items to Trash/quarantine. Undo is available."],
                [/^已移动 (\d+) 项到废纸篓/, "Moved $1 items to Trash"],
                [/^已恢复 (\d+) 项，重新扫描中…/, "Restored $1 items. Scanning again…"],
                [/^已保护 (\d+) 项/, "Protected $1 items"],
                [/^已复制 (\d+) 条命令/, "Copied $1 commands"],
				[/^已安装：(.+)$/, "Installed: $1"],
				[/^媒体类 App 已卸载，缓存为主/, "Media app uninstalled; cache only"],
				[/^媒体类 App 已卸载；体积较大，可能含已下载内容/, "Media app uninstalled; may contain downloads"],
				[/^可能含聊天记录\/文档\/笔记/, "May contain chats/documents/notes"],
				[/^检测到相关进程正在运行，禁止删除/, "Related process running; deletion disabled"],
				[/^系统自带 App 数据/, "Built-in app data"],
				[/^缓存，可重建/, "Cache, regenerable"],
				[/^系统缓存，收益小，不建议动/, "System cache; small gain, not recommended"],
				[/^缓存，可重建；⚠️ 较大，确认对应 App 是否仍需要/, "Cache, regenerable; large — confirm the app is still needed"],
				[/^缓存，可重建；Playwright 浏览器，项目测试在用请保留/, "Cache; Playwright browsers — keep if tests use them"],
				[/^聊天数据（图片\/视频\/文件\/缓存），删除后可能无法恢复，需人工确认/, "Chat data (images/videos/files/cache); may be unrecoverable — confirm manually"],
				[/^浏览器缓存，可重建（不碰书签\/密码）/, "Browser cache, regenerable (bookmarks/passwords untouched)"],
				[/^可删，Codex 用到会重下/, "Removable; re-downloaded when needed"],
				[/^pnpm store prune/, "pnpm store prune"],
				[/^npm cache clean --force/, "npm cache clean --force"],
				[/^Xcode 构建缓存，安全可再生/, "Xcode build cache; safe to regenerate"],
				[/^iOS 设备支持文件，可重下/, "iOS device support; re-downloadable"],
				[/^模拟器数据；确认不再用再删/, "Simulator data; confirm before deleting"],
				[/^App 归档；提交\/回滚可能需要，需确认/, "App archives; may be needed for submission/rollback"],
				[/^Docker 镜像\/卷；删了会丢容器数据，需确认/, "Docker images/volumes; deleting loses container data"],
				[/；⚠️ 可能含重要数据，不进入一键清理/, "; may contain important data; not in one-click clean"],
			];
			for (const [re, rep] of rules) out = out.replace(re, rep);
			return out;
		}
		function trNote(lang, s) { return lang === "en" ? noteEn(EN[s] || s) : s; }
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
		function riskLabel(lang, row) { return tr(lang, { protected: "受保护", review: "需确认", recommended: "推荐处理", optional: "可选处理" }[rowRisk(row)]); }
		function shortPath(p, home) { return home && insidePath(p, home) ? "~" + p.slice(home.length) : p; }
		function devName(p, lang) {
			const names = [[/DerivedData/, "Xcode DerivedData"], [/\/\.npm\//, "npm 缓存"], [/\/\.m2\/repository/, "Maven 本地仓库"], [/pnpm.*store/, "pnpm 缓存"], [/codex-runtimes/, "Codex 运行缓存"], [/Xcode\/Archives/, "Xcode 归档"], [/CoreSimulator/, "iOS 模拟器数据"]];
			const found = names.find(([re]) => re.test(normalizedPath(p)));
			return found ? tr(lang, found[1]) : normalizedPath(p).split("/").pop();
		}
		function impactOf(lang, row) {
			if (row.protected) return tr(lang, "已加入保护，不会移动");
			if (!row.checkable) return row.note || tr(lang, "可能含重要数据，仅供查看");
			if (row.category === "dev" && /\/\.m2\/repository/.test(normalizedPath(row.paths[0]))) return tr(lang, "离线构建可能受影响");
			if (row.category === "dev" && /\/\.npm\//.test(normalizedPath(row.paths[0]))) return tr(lang, "安装依赖时可能重新下载");
			if (row.category === "dev") return tr(lang, /DerivedData/.test(row.paths[0] || "") ? "下次构建时重新生成" : "使用时可能重新下载或构建");
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
			const add = (row) => {
				row.paths = [...new Set((row.paths || []).filter(Boolean))];
				row.protected = row.paths.some((p) => whitelist.some((w) => insidePath(p, w)));
				row.checkable = !!row.checkable && !row.protected && row.paths.length > 0;
				rows.push(row);
			};
			for (const g of report.leftoverGroups || []) add({ id: `g:${g.baseId}`, bucket: g.bucket, category: "leftover", name: g.name || g.baseId, paths: g.paths, kb: g.kb, note: trNote(lang, g.why || ""), checkable: g.bucket === "safe", recommended: g.bucket === "safe" });
			for (const a of report.appCaches || []) add({ id: `a:${a.baseId}`, bucket: "app", category: "app", name: `${a.app || a.baseId} · ${tr(lang, "应用缓存")}`, paths: a.paths, kb: a.kb, note: tr(lang, a.running ? "App 正在运行，退出后可清理" : "已安装 App 的缓存/临时文件，可重建，不碰聊天/文档"), checkable: a.cleanable !== false && !a.running, recommended: a.cleanable !== false && !a.running });
			for (const d of report.devCaches || []) add({ id: `d:${d.path}`, bucket: "dev", category: "dev", name: devName(d.path, lang), paths: [d.path], kb: d.kb, note: trNote(lang, d.advice || "缓存"), checkable: d.cleanable !== false, recommended: d.cleanable !== false });
			for (const b of report.browsers || []) add({ id: `b:${b.path}`, bucket: "cache", category: "browser", name: `${b.name} · ${tr(lang, "缓存")}`, paths: [b.path], kb: b.kb, note: tr(lang, "浏览器缓存，可重建（不碰书签/密码）"), checkable: true, recommended: true });
			for (const app of report.special || []) for (const c of app.categories || []) add({ id: `s:${app.app}:${c.name}`, bucket: "special", category: "special", name: `${app.app} · ${tr(lang, c.name)}`, paths: c.paths, kb: c.kb, note: tr(lang, c.cleanable ? "缓存可重新生成" : "聊天数据只读；缓存可清理"), checkable: !!c.cleanable, recommended: !!c.cleanable });
			// Generic caches may contain an already listed browser/developer directory. Prefer the specific explanation.
			const specific = rows.flatMap((r) => r.paths);
			for (const c of report.caches || []) {
				if (specific.some((p) => insidePath(c.path, p) || insidePath(p, c.path))) continue;
				add({ id: `c:${c.path}`, bucket: c.system ? "system" : "cache", category: c.system ? "system" : "other", name: normalizedPath(c.path).split("/").pop(), paths: [c.path], kb: c.kb, note: tr(lang, c.system ? "系统缓存，收益小，不建议清理" : "缓存可重新生成"), checkable: !c.system, recommended: false });
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
			filtered.sort((a, b) => sort === "name" ? String(a.name).localeCompare(String(b.name)) : sort === "sizeAsc" ? a.kb - b.kb : b.kb - a.kb);
			return filtered;
		}

        const spaceColors = ["#5087eb", "#769e76", "#bc9958", "#967cb5", "#59a3ad", "#a88471", "#8b949e"];
        const percent = (kb, total) => !kb || !total ? "0%" : kb / total < .01 ? "<1%" : `${Math.round(kb / total * 100)}%`;
        function spaceSegments(items) {
            const positive = items.filter(it => it.kb > 0);
            return positive.length <= 7 ? positive : [...positive.slice(0, 6), { name: "其他", kb: positive.slice(6).reduce((n, it) => n + it.kb, 0) }];
        }
        function Sunburst({ items, lang, onPick, active, onActive }) {
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
                        onMouseEnter: () => onActive(it.path), onMouseLeave: () => onActive(""), onClick: () => it.isDir && onPick(it), style: { cursor: it.isDir ? "pointer" : "default" } }, h("title", null, `${tr(lang,it.name)} · ${displaySize(it.kb)} · ${percent(it.kb,total)}`));
                }),
                h("text", { x:95, y:91, textAnchor:"middle", fill:"currentColor", fontSize:17, fontWeight:600 }, displaySize(total)),
                h("text", { x:95, y:109, textAnchor:"middle", fill:"currentColor", fontSize:10 }, tr(lang,"当前已统计")));
        }
        function SpaceView({ lang, onLarge }) {
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
            const children = data?.children || [], total = children.reduce((n,c) => n+c.kb,0);
            const drill = it => { if (!loading) load(it.path, [...stack, {path:it.path,name:it.name}]); };
            const reveal = async p => {
                try { const res = await fetch(`${API}/reveal`, { method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:p}) }); if (!res.ok) throw Error(tr(lang,"无法打开位置")); }
                catch(err) { setError(err.message); }
            };
            return h("section", { "aria-label":tr(lang,"目录分布"), "aria-busy":loading },
                h("nav", {className:"dc-space-crumbs", "aria-label":tr(lang,"目录导航")},
                    h("button", {className:"dc-link",disabled:loading,onClick:()=>load()},tr(lang,"家目录")),
                    stack.map((it,i)=>h(React.Fragment,{key:it.path},h("span",null,"/"),h("button",{className:"dc-link",disabled:loading,onClick:()=>load(it.path,stack.slice(0,i+1))},it.name)))),
                h("div",{className:"dc-page-meta"},tr(lang,"仅统计家目录，包含隐藏项；不代表整盘已用容量。"),data ? ` · ${timeStr(data.at)}` : ""),
                data ? h("p",{className:"dc-caption"},tr(lang,data.metric === "logical" ? "按文件大小统计；压缩、共享文件和系统保留空间可能造成差异。" : "按文件占用统计；共享文件和系统保留空间可能造成差异。")) : null,
                loading ? h("div",{className:"dc-notice",role:"status"},tr(lang,"正在统计目录，请稍候…"),pending,h("button",{className:"dc-link",onClick:()=>{request.current?.abort();setLoading(false);setError(tr(lang,"已停止等待，可重试。"));}},tr(lang,"停止等待"))) : null,
                error ? h("div",{className:"dc-notice",role:"alert"},error,h("button",{className:"dc-link",onClick:()=>load(pending,pendingStack.current)},tr(lang,"重试"))) : null,
                data?.unavailable || data?.skipped ? h("p",{className:"dc-caption",role:"status"},tf(lang,"未能读取 {n} 项，跳过链接 {s} 项；统计可能不完整。",{n:data.unavailable || 0,s:data.skipped || 0})) : null,
                data ? h("div",{className:"dc-space-grid",style:{opacity:loading ? .55 : 1}},
                    h("aside",null,h(Sunburst,{items:children,lang,onPick:drill,active,onActive:setActive}),
                        h("p",{className:"dc-caption"},tr(lang,"点击目录或色块进入下一级")),
                        spaceSegments(children).map((it,i)=>h("div",{key:it.path || "other",className:"dc-space-legend"},h("span",{style:{background:spaceColors[i]}}),tr(lang,it.name),h("strong",null,percent(it.kb,total))))),
                    h("div",{style:{minWidth:0}},
                        h("div",{className:"dc-space-tools"},h("button",{className:"dc-link",onClick:()=>onLarge(data.path)},tr(lang,"查看此目录的大文件")),h("button",{className:"dc-link",onClick:()=>reveal(data.path)},tr(lang,"打开位置")),h("button",{className:"dc-link",disabled:loading,onClick:()=>load(data.path,stack,true)},tr(lang,"重新统计"))),
                        !children.length ? h("p",{className:"dc-notice"},tr(lang,"此目录没有可显示的项目")) :
                        h("table",{className:"dc-file-table"},h("colgroup",null,h("col",{style:{width:"55%"}}),h("col",{style:{width:"20%"}}),h("col",{style:{width:"25%"}})),h("thead",null,h("tr",null,["名称","大小","占比"].map(t=>h("th",{key:t,scope:"col"},tr(lang,t))))),
                            h("tbody",null,children.slice(0,limit).map(c=>h("tr",{key:c.path,onMouseEnter:()=>setActive(c.path),onMouseLeave:()=>setActive(""),style:{background:active===c.path?"var(--dc-tint)":undefined}},
                                h("td",null,h("button",{className:"dc-space-entry",disabled:loading,onFocus:()=>setActive(c.path),onBlur:()=>setActive(""),onClick:()=>c.isDir?drill(c):reveal(c.path)},h(Icon,{name:c.isDir?"folder":"app-window",size:18}),c.name,c.isDir?" ›":""),c.partial?h("span",{className:"dc-caption"},tr(lang,"部分统计")):null),
                                h("td",{className:"dc-size-col"},displaySize(c.kb)),h("td",{className:"dc-size-col"},percent(c.kb,total),h("div",{className:"dc-space-bar"},h("span",{style:{width:`${total?c.kb/total*100:0}%`}}))))))),
                        children.length>limit?h("button",{className:"dc-link",onClick:()=>setLimit(limit+30)},tr(lang,"显示更多")):null)) : null);
        }

		function PhotoView(props) {
			const lang = props.lang || "zh";
			const [scan, setScan] = useState({ status: "idle" });
			const [result, setResult] = useState(null);
			const [sel, setSel] = useState({});
			const [busy, setBusy] = useState(false);
			const [confirming, setConfirming] = useState(false);
			const [note, setNote] = useState("");
			const [photoBatch, setPhotoBatch] = useState("");
			const [keepRule, setKeepRule] = useState("largest");
			const [folder, setFolder] = useState("");
			const [compare, setCompare] = useState("");
			const [keepIdx, setKeepIdx] = useState(0);

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
					setNote(`已移动 ${ok} 张相似照片到废纸篓，可撤销`);
					setPhotoBatch(body.batchId || "");
					setConfirming(false);
					await load();
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, [paths.join("|"), load]);

			const undo = useCallback(async () => {
				setBusy(true);
				try {
					const res = await fetch(`${API}/undo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId: photoBatch || undefined }) });
					const body = await res.json();
					if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
					const ok = (body.results || []).filter((r) => r.ok).length;
					setNote(`已恢复 ${ok} 张照片`);
					setPhotoBatch("");
					await load();
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, [photoBatch, load]);

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
				h("div", { style: { fontSize: 10, opacity: 0.55, wordBreak: "break-all", marginTop: 2 } }, it.path.split("/").pop()));
			const groupNode = (g) => h("div", { key: g.id, style: { border: "1px solid rgba(127,127,127,.25)", borderRadius: 10, padding: "10px", marginBottom: 10 } },
				h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
					h("div", { style: { fontSize: 12, opacity: 0.75 } }, tf(lang, "相似组 · {n} 张 · 可回收 {size}", { n: g.items.length, size: fmt(g.wastedKb) })),
					h("button", { style: btn, onClick: () => { setCompare(g.id); setKeepIdx(keepIndex(g)); } }, tr(lang, "对比"))),
				h("div", { style: { display: "flex", gap: 10, flexWrap: "wrap" } }, g.items.map((it, i) => itemNode(it, i, keepIndex(g)))));
			const applyKeepRule = useCallback((rule) => {
				setKeepRule(rule);
				if (!result) return;
				const next = {};
				for (const g of result.groups) {
					let keep = 0;
					g.items.forEach((it, i) => {
						if (rule === "newest" && (it.mtime || 0) > (g.items[keep].mtime || 0)) keep = i;
						if (rule === "shallow" && it.path.split("/").length < g.items[keep].path.split("/").length) keep = i;
					});
					g.items.forEach((it, i) => { if (i !== keep) next[it.path] = true; });
				}
				setSel(next);
			}, [result]);
			const keepIndex = (g) => g.items.reduce((best, it, i) => {
				if (keepRule === "newest" && (it.mtime || 0) > (g.items[best].mtime || 0)) return i;
				if (keepRule === "shallow" && it.path.split("/").length < g.items[best].path.split("/").length) return i;
				return best;
			}, 0);
			const folders = result ? [...new Set(result.groups.flatMap((g) => g.items.map((it) => it.path.split("/").slice(0, -1).join("/"))))].sort() : [];
			const shownGroups = result ? result.groups.filter((g) => !folder || g.items.some((it) => it.path.startsWith(folder + "/"))) : [];
			const compareGroup = compare && result ? result.groups.find((g) => g.id === compare) : null;
			const groups = shownGroups.map(groupNode);
			const wasted = result ? result.groups.reduce((sum, g) => sum + g.wastedKb, 0) : 0;

			return h("div", null,
				h("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 } },
					h("button", { style: btnPrimary, disabled: busy || scan.status === "running", onClick: start }, scan.status === "running" ? tr(lang, "扫描中…") : tr(lang, "扫描相似照片")),
					scan.status === "running" ? h("button", { style: btn, onClick: cancel }, tr(lang, "取消")) : null,
					h("span", { style: { fontSize: 11, opacity: 0.6 } }, "默认保留每组第一张（体积最大），取消勾选可调整"),
					result ? h("select", { style: input, value: keepRule, onChange: (e) => applyKeepRule(e.target.value) },
						h("option", { value: "largest" }, tr(lang, "保留策略") + ": " + tr(lang, "最大")),
						h("option", { value: "newest" }, tr(lang, "保留策略") + ": " + tr(lang, "最新")),
						h("option", { value: "shallow" }, tr(lang, "保留策略") + ": " + tr(lang, "路径最浅"))) : null,
					result && folders.length > 1 ? h("select", { style: input, value: folder, onChange: (e) => setFolder(e.target.value) },
						h("option", { value: "" }, tr(lang, "全部文件夹")),
						folders.map((f) => h("option", { key: f, value: f }, f))) : null),
				scan.status === "running" ? h("div", { style: { height: 6, borderRadius: 3, background: "rgba(127,127,127,.2)", overflow: "hidden", marginBottom: 8 } },
					h("div", { style: { height: "100%", width: `${Math.max(3, scan.progress || 0)}%`, background: "rgba(80,140,255,.9)" } })) : null,
				scan.status === "running" ? h("div", { style: { fontSize: 11, opacity: 0.7, marginBottom: 8 } }, `${scan.stage || "扫描中"} · ${scan.elapsed || 0}s`) : null,
				note ? h("pre", { style: { whiteSpace: "pre-wrap", fontSize: 11.5, opacity: 0.85, background: "rgba(127,127,127,.08)", padding: 8, borderRadius: 6, marginBottom: 8 } }, note) : null,
				result ? h("div", { style: { fontSize: 12, opacity: 0.7, marginBottom: 8 } }, tf(lang, "扫描 {n} 张，比较 {m} 张，找到 {g} 组相似；预计可回收 {size}", { n: result.scanned, m: result.compared, g: result.groups.length, size: fmt(wasted) })) : null,
				groups,
				compareGroup ? h("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" } },
					h("div", { style: { background: "var(--dsh-bg, #1e1e1e)", color: "inherit", borderRadius: 10, padding: 16, maxWidth: "90vw", maxHeight: "90vh", overflow: "auto" } },
						h("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 8 } }, tr(lang, "选择保留的照片")),
						h("div", { style: { display: "flex", gap: 12, flexWrap: "wrap" } },
							compareGroup.items.map((it, i) => h("label", { key: it.path, style: { width: 220, cursor: "pointer" } },
								h("input", { type: "radio", checked: keepIdx === i, onChange: () => setKeepIdx(i) }),
								h("img", { src: `${API}/thumb?path=${encodeURIComponent(it.path)}&size=240`, alt: it.path, style: { width: "100%", height: 160, objectFit: "contain", background: "rgba(127,127,127,.12)", borderRadius: 6, marginTop: 4 } }),
								h("div", { style: { fontSize: 10.5, wordBreak: "break-all", opacity: 0.7 } }, it.path.split("/").pop(), " · ", fmt(it.kb))))),
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
					paths.length > 0 ? h("span", { style: { fontSize: 12 } }, tf(lang, "已选 {n} 张 · {size}", { n: paths.length, size: fmt(totalKb) })) : h("span", { style: { fontSize: 12, opacity: 0.7 } }, "上次照片清理可恢复"),
					paths.length > 0 && !confirming ? h("button", { style: btnDanger, disabled: busy, onClick: () => setConfirming(true) }, tr(lang, "移到废纸篓")) : null,
					photoBatch ? h("button", { style: btn, disabled: busy, onClick: undo }, tr(lang, "撤销照片清理")) : null,
					confirming ? h(React.Fragment, null,
						h("span", { style: { fontSize: 12, color: "#e5534b" } }, tf(lang, "确认把 {n} 张移到废纸篓？", { n: paths.length })),
						h("div", { style: { flexBasis: "100%", fontSize: 11, opacity: 0.7 } }, tr(lang, "将移到废纸篓，可在「历史」恢复；不会自动永久删除")),
						h("button", { style: btnDanger, disabled: busy, onClick: clean }, busy ? tr(lang, "移动中…") : tr(lang, "确认移动")),
						h("button", { style: btn, disabled: busy, onClick: () => setConfirming(false) }, tr(lang, "取消"))) : null) : null);
		}

        function LargeView(props) {
            const { lang, report, scan, fresh, scope, onScope, onScan, onCancel, at, whitelist = [] } = props;
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
            const moved=new Set((move.results || []).filter(r=>r.ok).map(r=>r.path));
            const files=(report?.bigFiles || []).filter(f=>!moved.has(f.path)).map(f=>({...f,ext:f.ext || (normalizedPath(f.path).match(/(\.[^./]+)$/)?.[1] || "").toLowerCase()}));
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
                        const res=await fetch(`${API}/move`); if(!res.ok)throw Error(tr(lang,"无法读取搬家进度"));
                        const b=await res.json(), m=b.move; if(!alive || !m)return;
                        setMove(m);
                        if(m.status!=="running" && handled.current!==String(m.startedAt)) {
                            handled.current=String(m.startedAt); setSel({});setLastDest(m.destination || destination);
                            setNote(tr(lang,m.status==="canceled"?"搬家已取消；已完成的文件保留在目标位置。":m.status==="error"?"搬家失败，请查看详情。":"搬家完成"));
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
            const scanFull=scan?.full===true || (report?.bigFiles || []).length>0;
            const filtered=query || ext || age || minSize || scope;
            const emptyMessage=scanning?"正在扫描大文件…":scan?.status==="error"?"大文件扫描失败，请重试":scan?.status==="canceled"?"扫描已取消":!report?"先扫描，查找占用较大的文件":!scanFull?"当前体检未覆盖大文件，请进行完整扫描":filtered?"没有符合筛选条件的大文件":"没有发现大文件";
            return h("section",{"aria-label":tr(lang,"大文件")},
                h("div",{className:"dc-space-tools"},h("span",{className:"dc-page-meta"},tr(lang,"扫描范围：家目录 · 大文件 ≥300 MB（结果数量有限）"),at?` · ${timeStr(at)}`:""),
                    h("button",{className:"dc-link",disabled:scanning || moving || busy,onClick:onScan},tr(lang,"完整扫描"))),
                !fresh && report?h("div",{className:"dc-notice",role:"status"},tr(lang,"扫描结果已过期，请重新扫描后搬家。")):null,
                scanning?h("div",{className:"dc-notice",role:"status"},tr(lang,"正在扫描大文件…"),h("button",{className:"dc-link",onClick:onCancel},tr(lang,"取消"))):null,
                h("div",{className:"dc-space-filters"},
                    h("input",{"aria-label":tr(lang,"搜索名称或路径"),placeholder:tr(lang,"搜索名称或路径"),value:query,onChange:e=>setQuery(e.target.value)}),
                    h("select",{"aria-label":tr(lang,"排序"),value:sort,onChange:e=>setSort(e.target.value)},h("option",{value:"size"},tr(lang,"按大小")),h("option",{value:"age"},tr(lang,"按未修改天数"))),
                    h("select",{"aria-label":tr(lang,"修改时间"),value:age,onChange:e=>setAge(Number(e.target.value))},[0,90,180,365].map(n=>h("option",{value:n,key:n},n?tf(lang,"超过 {n} 天未修改",{n}):tr(lang,"全部时间")))),
                    h("select",{"aria-label":tr(lang,"文件类型"),value:ext,onChange:e=>setExt(e.target.value)},h("option",{value:""},tr(lang,"全部类型")),[...new Set(files.map(f=>f.ext).filter(Boolean))].sort().map(x=>h("option",{key:x,value:x},x))),
                    h("select",{"aria-label":tr(lang,"最小大小"),value:minSize,onChange:e=>setMinSize(Number(e.target.value))},[0,500,1024,5120].map(n=>h("option",{value:n,key:n},n?`≥ ${displaySize(n*1024)}`:tr(lang,"全部大小"))))),
                scope?h("p",{className:"dc-caption"},scope,h("button",{className:"dc-link",onClick:()=>onScope("")},tr(lang,"全部文件夹"))):null,
                note?h("div",{className:"dc-notice",role:"status"},note):null,
                lastDest?h("button",{className:"dc-link",onClick:()=>reveal(lastDest)},tr(lang,"打开目标文件夹")):null,
                moving?h("div",{className:"dc-notice",role:"status"},tf(lang,"正在移动 {done}/{total}",{done:move.done,total:move.total})," · ",move.current,h("button",{className:"dc-link",onClick:async()=>{try{const r=await fetch(`${API}/move/cancel`,{method:"POST"});if(!r.ok)throw Error(tr(lang,"取消失败"));setNote(tr(lang,"正在取消；当前文件处理完成后停止。"));}catch(err){setNote(err.message);}}},tr(lang,"取消"))):null,
                move.error?h("p",{role:"alert"},move.error):null,
                (move.results || []).filter(r=>!r.ok).map(r=>h("p",{key:r.path,role:"status"},r.path," · ",r.error)),
                !rows.length?h("div",{className:"dc-empty"},h("p",null,tr(lang,emptyMessage)),!scanning?h("button",{className:"dc-button",disabled:moving || busy,onClick:filtered && scanFull?()=>{setQuery("");setExt("");setAge(0);setMinSize(0);onScope("");}:onScan},tr(lang,filtered && scanFull?"清除筛选":"完整扫描")):null):
                h("div",null,h("div",{className:"dc-space-tools"},h("span",null,tf(lang,"共 {n} 个文件",{n:rows.length})),
                    h("button",{className:"dc-link",disabled:!fresh || moving || scanning,onClick:()=>setSel(Object.fromEntries(rows.filter(f=>!protectedFile(f)).map(f=>[f.path,true])))},tr(lang,"选择筛选结果")),h("button",{className:"dc-link",disabled:moving,onClick:()=>setSel({})},tr(lang,"清空选择"))),
                    h("table",{className:"dc-file-table"},h("colgroup",null,h("col",{style:{width:44}}),h("col",null),h("col",{style:{width:90}}),h("col",{style:{width:90}})),h("thead",null,h("tr",null,["选择","名称","大小","操作"].map(t=>h("th",{scope:"col",key:t},tr(lang,t))))),
                        h("tbody",null,rows.map(f=>h("tr",{key:f.path},h("td",null,h("input",{type:"checkbox","aria-label":tf(lang,"选择 {name}",{name:f.path}),checked:!!sel[f.path]&&!protectedFile(f),disabled:!fresh||moving||scanning||protectedFile(f),onChange:()=>setSel(prev=>({...prev,[f.path]:!prev[f.path]}))})),
                            h("td",null,h("div",{style:{overflowWrap:"anywhere"}},normalizedPath(f.path).split("/").pop()),h("div",{className:"dc-file-path",title:f.path},f.path),h("div",{className:"dc-caption"},protectedFile(f)?tr(lang,"受保护"):f.mtime?tf(lang,"超过 {n} 天未修改",{n:Math.max(0,Math.floor((Date.now()/1000-f.mtime)/86400))}):tr(lang,"修改时间未知"))),
                            h("td",{className:"dc-size-col"},displaySize(f.kb)),h("td",null,h("button",{className:"dc-link",onClick:()=>reveal(f.path)},tr(lang,"打开位置")),h("button",{className:"dc-link",onClick:async()=>{try{await navigator.clipboard.writeText(f.path);setNote(tr(lang,"已复制路径"));}catch{setNote(tr(lang,"无法复制路径"));}}},tr(lang,"复制路径")))))))),
                selected.length>0?h("div",{className:"dc-space-actions"},h("strong",null,tf(lang,"已选 {n} 个 · {size}",{n:selected.length,size:displaySize(selectedKb)})),
                    h("select",{"aria-label":tr(lang,"目标磁盘"),disabled:moving||busy,value:volume?.path || "",onChange:e=>{setDestination(e.target.value);setFolder(null);}},h("option",{value:""},tr(lang,"选择目标磁盘…")),volumes.map(v=>h("option",{key:v.path,value:v.path},`${v.label} · ${tr(lang,"可用")} ${displaySize(v.free/1024)}`))),
                    h("input",{"aria-label":tr(lang,"目标目录"),disabled:moving||busy,value:destination,placeholder:tr(lang,"目标目录"),onChange:e=>{setDestination(e.target.value);setFolder(null);}}),
                    h("button",{className:"dc-button",disabled:!destination.trim()||busy||moving,onClick:()=>browse(destination)},tr(lang,"选择文件夹")),
                    volume?h("span",{className:"dc-caption"},tf(lang,"目标可用 {free} · 已选 {size}",{free:displaySize(volume.free/1024),size:displaySize(selectedKb)})):null,
                    insufficient?h("span",{role:"alert"},tr(lang,"目标磁盘空间不足")):null,
                    folder?h("div",{style:{flexBasis:"100%"}},h("p",{className:"dc-caption"},folder.path),
                        h("select",{"aria-label":tr(lang,"进入子文件夹"),value:"",disabled:busy||moving,onChange:e=>{if(e.target.value)browse(e.target.value);}},h("option",{value:""},tr(lang,"进入子文件夹")),folder.folders.map(f=>h("option",{key:f.path,value:f.path},f.name))),
                        folder.parent?h("button",{className:"dc-link",disabled:busy||moving,onClick:()=>browse(folder.parent)},tr(lang,"上一级")):null):null,
                    !confirmationValid?h("button",{className:"dc-button dc-primary",disabled:busy||moving||!fresh||scanning||!destination.trim()||insufficient,onClick:prepare},tr(lang,"移动到…")):
                    h("div",{role:"group","aria-label":tr(lang,"确认移动"),style:{flexBasis:"100%"}},h("p",null,tf(lang,"确认移动 {n} 个文件到 {dest}？",{n:selected.length,dest:destination})),h("p",{className:"dc-caption"},tr(lang,"跨盘搬家会复制并做 SHA-256 校验，校验失败保留原文件。")),h("p",{className:"dc-caption"},tr(lang,"成功后原位置不再保留文件；搬家不属于废纸篓恢复记录。")),
                        h("button",{className:"dc-button dc-primary",disabled:busy||moving||!fresh||scanning||insufficient,onClick:startMove},tr(lang,"确认移动")),h("button",{className:"dc-link",disabled:busy,onClick:()=>setConfirming(false)},tr(lang,"取消")))):null);
        }

		function Panel() {
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
			const [reclaim, setReclaim] = useState(null);
			const [reclaimBusy, setReclaimBusy] = useState(false);
			const [purgeConfirm, setPurgeConfirm] = useState("");
			const [newWhitelist, setNewWhitelist] = useState("");
			const [spaceMode, setSpaceMode] = useState("tree");
            const [spaceScope, setSpaceScope] = useState("");
            const scanOrigin = useRef("home");
            const [spaceVisited, setSpaceVisited] = useState(false);
            useEffect(() => { if (view === "space") setSpaceVisited(true); }, [view]);
			const [cleanMode, setCleanMode] = useState("junk");
			useEffect(() => { if (rootRef.current) rootRef.current.scrollTo({ top: 0 }); }, [view, cleanMode]);
			const [wizard, setWizard] = useState({ open: false, phase: "idle", batchId: "", releasedKb: 0, error: "" });
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
						if (st && st.canUndo && st.lastBatchId) setLastBatch(st.lastBatchId);
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
							if (s.status === "error") { setNote("扫描失败：" + (s.error || "未知错误")); setWizard((w) => ({ ...w, open: false, phase: "idle" })); }
							if (s.status === "canceled") { setNote("扫描已取消"); setWizard((w) => ({ ...w, open: false, phase: "idle" })); }
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
					setNote("正在取消…");
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
			}, []);

			const report = overview && overview.report ? overview.report : null;
			const whitelist = (overview && overview.whitelist) || [];
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

			const doClean = useCallback(async () => {
				const freeBefore = disk ? disk.free : null;
				setBusy(true);
				try {
					const res = await fetch(`${API}/clean`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: selectedPaths }) });
					const body = await res.json();
					if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
					const okPaths = (body.results || []).filter((r) => r.ok).map((r) => r.path);
					const failed = (body.results || []).filter((r) => !r.ok);
					setSel({}); if (okPaths.length) setLastBatch(body.batchId || ""); setConfirming(false);
					let line = `已移动 ${okPaths.length} 项到废纸篓/隔离区，可撤销` + (failed.length ? `\n失败 ${failed.length} 项：${failed.map((f) => f.error).join("；")}` : "");
					const ov = await loadOverview();
					const fresh = ov && ov.disk;
					if (freeBefore != null && fresh && typeof fresh.free === "number") line += "\n" + tf(lang, "可用空间 {from} → {to}（+{delta}）", { from: fmtBytes(freeBefore), to: fmtBytes(fresh.free), delta: fmtBytes(Math.max(0, fresh.free - freeBefore)) });
					setNote(line);
					await startScan(false, true);
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, [selectedPaths.join("|"), disk, lang, loadOverview, startScan]);

			const doUndo = useCallback(async () => {
				setBusy(true);
				try {
					const res = await fetch(`${API}/undo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId: lastBatch || undefined }) });
					const body = await res.json();
					if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
					const ok = (body.results || []).filter((r) => r.ok).length;
					setLastBatch(""); setNote(`已恢复 ${ok} 项，重新扫描中…`);
					await loadOverview();
					await startScan(false, true);
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, [lastBatch, loadOverview, startScan]);

			const protectSelected = useCallback(async () => {
				setBusy(true);
				try {
					const next = [...new Set([...whitelist, ...selectedPaths])];
					const res = await fetch(`${API}/whitelist`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: next }) });
					const body = await res.json();
					if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
					setSel({}); setNote(`已保护 ${selectedPaths.length} 项`);
					await loadOverview();
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, [whitelist, selectedPaths.join("|"), loadOverview]);

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
					setNewWhitelist(""); setNote("已加入白名单"); await loadOverview();
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
			}, [whitelist, newWhitelist, loadOverview]);

			const restoreBatch = useCallback(async (batchId) => {
				setBusy(true);
				try {
					const res = await fetch(`${API}/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId }) });
					const body = await res.json();
					if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
					setNote(`已恢复批次 ${batchId}`); await loadOverview();
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, [loadOverview]);

			const copyCommands = useCallback(async () => {
				const isWin = overview && overview.platform === "win32";
				const cmds = selectedPaths.map((p) => isWin
					? `Move-Item -LiteralPath '${String(p).replace(/'/g, "''")}' -Destination "$env:LOCALAPPDATA\\deepclean-mydisk\\trash"`
					: `mv -n "${p}" ~/.Trash/`).join("\n");
				try { await navigator.clipboard.writeText(cmds); setNote(`已复制 ${selectedPaths.length} 条命令`); }
				catch { setNote(cmds); }
			}, [selectedPaths.join("|")]);

			const selectRecommended = useCallback(() => {
				const rep = overview && overview.report;
				if (!rep) { setNote("请先扫描一次"); return; }
				const next = {};
				for (const it of buildRows(rep, rep ? ((overview && overview.whitelist) || []) : [], "all", "", "sizeDesc", lang)) if (it.checkable && it.recommended) for (const p of it.paths) next[p] = true;
				setSel(next); setTab("all"); setRisk("all"); setSearch(""); setConfirming(false); setView("clean"); setNote("");
			}, [overview, lang]);

			const wizardStart = useCallback(() => {
				setWizard({ open: true, phase: "scanning", batchId: "", releasedKb: 0, error: "" });
				setWizardSel({});
				startScan(false);
			}, [startScan]);
			const wizardClose = useCallback(() => {
				setWizard({ open: false, phase: "idle", batchId: "", releasedKb: 0, error: "" });
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
					setWizard((w) => ({ ...w, phase: "done", batchId: ok ? (body.batchId || "") : "", releasedKb: released }));
					let line = `已移动 ${ok} 项到废纸篓` + ((body.results || []).some((r) => !r.ok) ? "\n" + (body.results || []).filter((r) => !r.ok).map((r) => `${r.path}: ${r.error}`).join("\n") : "");
					const ov = await loadOverview();
					const fresh = ov && ov.disk;
					if (freeBefore != null && fresh && typeof fresh.free === "number") line += "\n" + tf(lang, "可用空间 {from} → {to}（+{delta}）", { from: fmtBytes(freeBefore), to: fmtBytes(fresh.free), delta: fmtBytes(Math.max(0, fresh.free - freeBefore)) });
					setNote(line);
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, [overview, wizardSel, lang, loadOverview, liveDisk]);
			const wizardUndo = useCallback(async () => {
				setBusy(true);
				try {
					const res = await fetch(`${API}/undo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId: wizard.batchId || undefined }) });
					const body = await res.json();
					if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
					setNote("已撤销");
					wizardClose();
					await loadOverview();
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, [wizard.batchId, wizardClose, loadOverview]);


			// 优先用宿主实时快照（打开即可显示，无需扫描）；旧版宿主或快照失败时回退到扫描报告。
			const diskFresh = !!liveDisk;
			const processableKb = allRows.filter((r) => r.checkable).reduce((sum, r) => sum + r.kb, 0);
			const history = (overview && overview.history) || [];
			const cleans = (overview && overview.cleanBatches) || [];
			const nav = [["home", "体检"], ["space", "空间"], ["clean", "清理"], ["history", "历史"], ["settings", "设置"]];

			function Header() {
				return h("header", { className: "dc-header" },
					h("div", { className: "dc-brand" }, h(DiskIcon), "DeepClean MyDisk"),
					h("nav", { className: "dc-nav", "aria-label": tr(lang, "主导航") }, nav.map(([id, label]) => h("button", { key: id, type: "button", "aria-current": view === id ? "page" : undefined, onClick: () => { setView(id); setConfirming(false); setMoreOpen(false); } }, tr(lang, label)))));
			}
			function Progress() {
				if (!scanning) return null;
				return h("section", { className: "dc-progress", "aria-label": tr(lang, "体检进度") },
					h("div", { className: "dc-progress-head" }, h("strong", null, tr(lang, "正在体检…")), h("button", { className: "dc-link", onClick: cancelScan }, tr(lang, "取消扫描"))),
					h("div", { className: "dc-progress-track", role: "progressbar", "aria-label": tr(lang, "体检进度"), "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": scan.progress || 0 }, h("div", { className: "dc-progress-fill", style: { width: `${Math.max(2, scan.progress || 0)}%` } })),
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
					return h("div", { style }, h("div", { style: { fontSize: 13, fontWeight: 600 } }, tr(lang, "正在体检…")),
						h("div", { style: { fontSize: 12, opacity: 0.7, marginTop: 4 } }, tr(lang, "扫描完成后会给出推荐清单")));
				}
				if (wizard.phase === "confirm") {
					return h("div", { style },
						h("div", { style: { fontSize: 13, fontWeight: 600 } }, tf(lang, "确认清理 {n} 项（{size}）？", { n: selected.length, size: fmt(totalKb) })),
						h("div", { style: { fontSize: 11, opacity: 0.7, margin: "4px 0 10px" } }, tr(lang, "将移到废纸篓，可在「历史」恢复；不会自动永久删除")),
						h("div", { style: { fontSize: 11, opacity: 0.7, margin: "0 0 10px" } }, reclaim ? tf(lang, "预计实际释放 {size}（逻辑 {logical}）", { size: fmtBytes(reclaim.allocatedBytes), logical: fmtBytes(reclaim.logicalBytes) }) : tr(lang, "正在估算实际释放…")),
						reclaim && reclaim.snapshots ? h("div", { style: { fontSize: 11, opacity: 0.7, margin: "0 0 10px" } }, tf(lang, "本机有 {n} 个 APFS 本地快照，可能影响实际释放", { n: reclaim.snapshots })) : null,
						h("div", { style: { display: "flex", gap: 8 } },
							h("button", { style: btnDanger, disabled: busy, onClick: wizardClean }, busy ? "…" : tr(lang, "确认清理")),
							h("button", { style: btn, disabled: busy, onClick: () => setWizard((w) => ({ ...w, phase: "review" })) }, tr(lang, "取消"))));
				}
				if (wizard.phase === "purgeConfirm") {
					return h("div", { style },
						h("div", { style: { fontSize: 13, fontWeight: 600 } }, tr(lang, "确认永久删除本批次？删除后无法撤销。")),
						h("div", { style: { fontSize: 11, opacity: 0.7, margin: "4px 0 10px" } }, tr(lang, "永久删除后无法从废纸篓恢复，也不会进入历史恢复记录。")),
						h("div", { style: { display: "flex", gap: 8 } },
							h("button", { style: btnDanger, disabled: busy, onClick: async () => { await doPurge(wizard.batchId); wizardClose(); } }, tr(lang, "确认永久删除")),
							h("button", { style: btn, disabled: busy, onClick: () => setWizard((w) => ({ ...w, phase: "done" })) }, tr(lang, "取消"))));
				}
				if (wizard.phase === "done") {
					return h("div", { style },
						h("div", { style: { fontSize: 13, fontWeight: 600 } }, tf(lang, "已移入废纸篓 {size}", { size: displaySize(wizard.releasedKb) })),
						h("div", { style: { fontSize: 11, opacity: 0.7, margin: "4px 0 10px" } }, tr(lang, "将移到废纸篓，可在「历史」恢复；不会自动永久删除")),
						h("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
							wizard.batchId ? h("button", { style: btn, disabled: busy, onClick: wizardUndo }, tr(lang, "撤销")) : null,
							wizard.batchId ? h("button", { style: btnDanger, disabled: busy, onClick: () => setWizard((w) => ({ ...w, phase: "purgeConfirm" })) }, tr(lang, "永久删除本批次")) : null,
							h("button", { style: btn, onClick: () => { wizardClose(); setView("history"); } }, tr(lang, "清理历史")),
							h("button", { style: btnPrimary, onClick: wizardClose }, tr(lang, "完成"))));
				}
				if (items.length === 0) {
					return h("div", { style }, h("div", { style: { fontSize: 13, fontWeight: 600 } }, tr(lang, "体检结果")),
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
						h("div", { style: { fontSize: 13, fontWeight: 600 } }, tr(lang, "体检结果")),
						h("div", { style: { fontSize: 12, opacity: 0.7 } }, `推荐 ${selected.length} 项 · ${fmt(totalKb)}`)),
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
					h("section", { className: "dc-disk-summary", "aria-label": tr(lang, "磁盘容量") },
						h("div", { className: "dc-disk-data" }, h("img", { className: "dc-drive-image", src: "/dsh-deepclean/assets/disk.png", alt: "", "aria-hidden": true }),
							h("div", null, h("div", { className: "dc-drive-name" }, tr(lang, "系统磁盘"), disk ? h("span", { className: "dc-live", title: timeStr(disk.at) }, tr(lang, diskFresh ? "实时" : "上次扫描")) : null),
								h("div", { className: "dc-free", "aria-label": disk ? tf(lang, "当前可用 {size}", { size: displaySize(disk.free / 1024) }) : tr(lang, "正在读取磁盘信息…") }, disk ? displaySize(disk.free / 1024) : "—"),
								h("div", { className: "dc-free-label" }, tr(lang, disk ? "当前可用" : "正在读取磁盘信息…")),
								disk ? h("div", { className: "dc-capacity" }, tf(lang, "总容量 {total} · 已用 {used}", { total: displaySize(disk.total / 1024), used: displaySize(disk.used / 1024) })) : null)),
						disk ? h("div", { className: "dc-capacity-chart" },
							h("div", { className: "dc-capacity-track", role: "img", "aria-label": tf(lang, "磁盘已用 {pct}%", { pct }) }, h("div", { className: "dc-capacity-used", style: { width: `${pct}%` } })),
							h("div", { className: "dc-legend" }, h("span", null, h("i", { className: "dc-key dc-key-used" }), tf(lang, "已用 {pct}%", { pct })), h("span", null, h("i", { className: "dc-key" }), tf(lang, "可用 {pct}%", { pct: 100 - pct })))) : null),
					h("section", { className: "dc-home-action" },
						h("div", { className: "dc-icon-disc" }, h(Icon, { name: "magnifying-glass", size: 37, color: "#6883b5" })),
						h("div", { className: "dc-home-action-body" },
							h("h2", null, tr(lang, scanning ? "正在查找可整理的空间" : fresh ? "体检已完成，看看处理建议" : "看看哪些空间可以整理")),
							h("p", { className: "dc-subtitle" }, fresh ? tf(lang, "可处理 {size}，请核对后再清理。", { size: displaySize(processableKb) }) : tr(lang, "扫描只读取文件信息，清理前由你确认。")),
							scanning ? Progress() : h("div", { className: "dc-home-actions" },
								h("button", { className: "dc-button dc-primary", disabled: busy, onClick: fresh ? () => { wizardClose(); selectRecommended(); } : wizardStart }, tr(lang, fresh ? "查看清理建议" : "开始体检"), h(Icon, { name: "arrow-right", size: 18, color: "white" })),
								h("button", { className: "dc-link", "aria-expanded": showAdvanced, onClick: () => setShowAdvanced(!showAdvanced) }, tr(lang, "扫描选项"))),
							h("p", { className: "dc-caption" }, tr(lang, "覆盖应用残留、浏览器缓存和开发缓存。")),
							showAdvanced && !scanning ? h("div", { className: "dc-scan-options" },
								h("button", { className: "dc-button", disabled: busy, onClick: wizardStart }, tr(lang, "快速扫描")),
								h("button", { className: "dc-button", disabled: busy, onClick: () => { wizardClose(); startScan(true); } }, tr(lang, "完整扫描")),
								h("button", { className: "dc-link", onClick: checkPermissions }, tr(lang, "权限检查"))) : null)),
					wizard.open && wizard.phase !== "scanning" ? h("div", { className: "dc-wizard" }, WizardPanel()) : null,
					scan.status === "error" ? h("div", { className: "dc-notice", role: "alert" }, h(Icon, { name: "warning-circle" }), h("span", null, tr(lang, "扫描失败，请重试。"), " ", scan.error || ""), h("button", { className: "dc-link", onClick: wizardStart }, tr(lang, "重试"))) : null,
					h("section", { className: "dc-recent" },
						h("div", { className: "dc-icon-disc" }, h(Icon, { name: "clock", size: 25 })),
						h("div", { className: "dc-recent-body" }, h("div", { className: "dc-recent-title" }, tr(lang, "最近一次整理")),
							h("p", { className: "dc-muted" }, recent ? tf(lang, "{time} · {n} 项移入记录", { time: recentTime(recent.at, lang), n: recent.count }) : tr(lang, "还没有整理记录")),
							h("p", { className: "dc-caption dc-recent-note" }, h(Icon, { name: "shield-check", size: 16 }), tr(lang, "文件先移到废纸篓，可在历史中恢复。"))),
						h("button", { className: "dc-link", onClick: () => setView("history") }, tr(lang, "查看与恢复"), h(Icon, { name: "caret-right", size: 16, color: "#356ae6" }))));
			}

			function Clean() {
				const categories = [["all", "全部项目", "squares-four"], ["dev", "开发缓存", "code"], ["browser", "浏览器缓存", "globe"], ["leftover", "应用残留", "app-window"], ["app", "应用缓存", "app-window"], ["special", "聊天软件缓存", "chat-circle"], ["other", "其他缓存", "folder"], ["system", "系统缓存", "shield-check"]];
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
								h("div", { className: "dc-clean-total" }, tr(lang, "建议处理"), h("strong", null, report && !scanning ? displaySize(processableKb) : "—"), h("small", null, tr(lang, "仅统计可移动的项目"))),
								h("label", { className: "dc-field" }, h(Icon, { name: "magnifying-glass", size: 16 }), h("input", { type: "search", "aria-label": tr(lang, "搜索名称或路径"), placeholder: tr(lang, "搜索名称或路径"), value: search, onChange: (e) => setSearch(e.target.value) })),
								h("select", { className: "dc-select", "aria-label": tr(lang, "风险筛选"), value: risk, onChange: (e) => setRisk(e.target.value) }, [["all", "风险：全部"], ["recommended", "推荐处理"], ["optional", "可选处理"], ["review", "需确认"], ["protected", "受保护"]].map(([id, label]) => h("option", { key: id, value: id }, tr(lang, label)))),
								h("select", { className: "dc-select", "aria-label": tr(lang, "排序"), value: sort, onChange: (e) => setSort(e.target.value) }, [["sizeDesc", "大小 ↓"], ["sizeAsc", "大小 ↑"], ["name", "名称"]].map(([id, label]) => h("option", { key: id, value: id }, tr(lang, label))))),
							!report || scanning ? h("div", { className: "dc-empty", role: "status" }, h(Icon, { name: "magnifying-glass", size: 36 }), h("h2", null, tr(lang, scanning ? "正在查找可整理的文件" : "先做一次磁盘体检")), h("p", null, tr(lang, scanning ? "完成后将显示分类结果，请稍候。" : "扫描只读取文件信息，清理前由你确认。")), !scanning ? h("button", { className: "dc-button dc-primary", disabled: busy, onClick: () => startScan(false) }, tr(lang, "开始体检")) : null) :
							h("table", { className: "dc-file-table", "aria-label": tr(lang, "清理项目") },
								h("thead", null, h("tr", null,
									h("th", { className: "dc-check-col" }, h("input", { type: "checkbox", "aria-label": tr(lang, "选择当前列表中可处理的项目"), checked: everySelected, disabled: !canClean || visibleSelectable.length === 0, onChange: (e) => updateVisible(e.target.checked), ref: (el) => { if (el) el.indeterminate = !everySelected && visibleSelectable.some((r) => r.paths.some((p) => sel[p])); } })),
									h("th", null, tr(lang, "项目")), h("th", { className: "dc-size-col" }, tr(lang, "大小")), h("th", { className: "dc-impact-col" }, tr(lang, "处理影响")), h("th", { className: "dc-detail-col" }, h("span", { className: "dc-muted" }, tr(lang, "详情"))))),
								h("tbody", null, rows.length === 0 ? h("tr", null, h("td", { colSpan: 5 }, h("div", { className: "dc-empty" }, h("h2", null, tr(lang, search || risk !== "all" ? "没有匹配的项目" : "这个分类没有发现项目")), h("p", null, tr(lang, "试试其他分类或调整筛选条件。"))))) : rows.map((row) => h(React.Fragment, { key: row.id },
									h("tr", { "data-risk": rowRisk(row) },
										h("td", { className: "dc-check-col" }, row.checkable ? h("input", { type: "checkbox", "aria-label": tf(lang, "选择 {name}", { name: row.name }), checked: row.paths.every((p) => sel[p]), disabled: !canClean, onChange: () => toggle(row.paths) }) : h(Icon, { name: "lock-simple", size: 16 })),
										h("td", null, h("div", { className: "dc-file-name" }, h("div", { className: "dc-file-icon" }, h(Icon, { name: { dev: "code", browser: "globe", leftover: "app-window", special: "chat-circle" }[row.category] || "folder", size: 21, color: "#356ae6" })), h("div", { className: "dc-file-name-body" }, h("strong", null, row.name), h("div", { className: "dc-file-path", title: row.paths.join("\n") }, shortPath(row.paths[0] || "", report.home)), h("div", { className: "dc-mobile-impact" }, h("span", { className: `dc-badge dc-badge-${rowRisk(row)}` }, riskLabel(lang, row)))))),
										h("td", { className: "dc-size-col" }, displaySize(row.kb)),
										h("td", { className: "dc-impact-col" }, h("span", { className: `dc-badge dc-badge-${rowRisk(row)}` }, riskLabel(lang, row)), h("p", { className: "dc-impact" }, impactOf(lang, row))),
										h("td", { className: "dc-detail-col" }, h("button", { className: "dc-link dc-details-button", "aria-expanded": expanded === row.id, "aria-controls": `detail-${row.id}`, onClick: () => setExpanded(expanded === row.id ? "" : row.id) }, tr(lang, "查看详情"), h(Icon, { name: expanded === row.id ? "caret-down" : "caret-right", size: 13, color: "#356ae6" })))),
									expanded === row.id ? h("tr", { className: "dc-expanded", id: `detail-${row.id}` }, h("td", { colSpan: 5 }, h("dl", { className: "dc-detail-grid" },
										h("dt", null, tr(lang, "处理影响")), h("dd", null, impactOf(lang, row)),
										h("dt", null, tr(lang, "怎么恢复")), h("dd", null, tr(lang, row.checkable ? "在废纸篓或历史中恢复" : "仅供查看，不提供清理")),
										h("dt", null, tr(lang, "完整路径")), h("dd", null, row.paths.map((p) => h("div", { key: p }, p)))))) : null)))))),
					h("footer", { className: "dc-action-bar" },
						confirming && selectedPaths.length > 0 ? h("section", { className: "dc-confirm", ref: confirmRef, tabIndex: -1, onKeyDown: (e) => { if (e.key === "Escape") setConfirming(false); }, role: "region", "aria-label": tr(lang, "确认清理") },
							h("strong", null, tf(lang, "确认将 {n} 项（{size}）移到废纸篓？", { n: selectedPaths.length, size: displaySize(selectedKb) })),
							h("p", { className: "dc-caption" }, tr(lang, "将移到废纸篓，可在「历史」恢复；不会自动永久删除")),
							h("p", { className: "dc-caption" }, reclaim ? tf(lang, "预计实际释放 {size}（逻辑 {logical}）", { size: fmtBytes(reclaim.allocatedBytes), logical: fmtBytes(reclaim.logicalBytes) }) : tr(lang, reclaimBusy ? "正在估算实际释放…" : "正在估算实际释放…")),
							reclaim && reclaim.snapshots ? h("p", { className: "dc-caption" }, tf(lang, "本机有 {n} 个 APFS 本地快照，可能影响实际释放", { n: reclaim.snapshots })) : null,
							h("div", { className: "dc-confirm-actions" }, h("button", { className: "dc-button dc-primary", disabled: !canClean, onClick: doClean }, tr(lang, "确认移入")), h("button", { className: "dc-button", disabled: busy, onClick: () => setConfirming(false) }, tr(lang, "取消")))) : null,
						h("div", { className: "dc-action-bar-main" },
							h("div", { className: "dc-selection" }, h("strong", { role: "status" }, tf(lang, "已选 {n} 项 · {size}", { n: selectedStats.items, size: displaySize(selectedKb) })), selectedPaths.length ? h("button", { className: "dc-link", disabled: busy, onClick: clear }, tr(lang, "清空选择")) : null),
							h("button", { className: "dc-button dc-primary", disabled: !canClean || selectedPaths.length === 0 || confirming, onClick: () => { setMoreOpen(false); setConfirming(true); fetchReclaim(selectedPaths); } }, h(Icon, { name: "trash", size: 18, color: "white" }), tr(lang, busy ? "处理中…" : "移到废纸篓")),
							h("div", { className: "dc-more", onKeyDown: (e) => { if (e.key === "Escape") setMoreOpen(false); } },
								h("button", { className: "dc-button", "aria-expanded": moreOpen, "aria-controls": "dc-more-actions", onClick: () => setMoreOpen(!moreOpen) }, tr(lang, "更多操作"), h(Icon, { name: "caret-down", size: 15 })),
								moreOpen ? h("div", { id: "dc-more-actions", className: "dc-menu", "aria-label": tr(lang, "更多操作") },
									h("button", { disabled: !canClean, onClick: () => menuAction(selectRecommended) }, tr(lang, "选中推荐项")),
									h("button", { disabled: !canClean || !visibleSelectable.length, onClick: () => menuAction(() => updateVisible(true)) }, tr(lang, "全选当前列表")),
									h("button", { disabled: !selectedPaths.length || busy, onClick: () => menuAction(copyCommands) }, tr(lang, "复制命令")),
									h("button", { disabled: !selectedPaths.length || busy, onClick: () => menuAction(protectSelected) }, tr(lang, "加入保护")),
									h("button", { disabled: !lastBatch || busy || scanning, onClick: () => menuAction(doUndo) }, tr(lang, "撤销上次清理"))) : null)),
						h("p", { className: "dc-caption" }, h(Icon, { name: "info", size: 15 }), tr(lang, "移入废纸篓不会立即增加可用空间；可在历史中对本批次永久删除。"))));
			}

			function History() {
				return h("div", null,
					h("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 6 } }, tr(lang, "扫描历史")),
					history.length === 0 ? h("div", { style: { fontSize: 12, opacity: 0.6 } }, "（暂无）") :
						h("table", { style: table }, h("tbody", null, [...history].reverse().slice(0, 15).map((s, i) =>
							h("tr", { key: i },
								h("td", { style: td }, timeStr(s.at)),
								h("td", { style: td }, `可用 ${fmtBytes(s.free)}`),
								h("td", { style: td }, `可回收 ${fmt(s.totalKb)}`),
								h("td", { style: { ...td, opacity: 0.6 } }, `${s.elapsed}s`))))),
					h("div", { style: { fontSize: 13, fontWeight: 600, margin: "14px 0 6px" } }, tr(lang, "清理批次（可恢复）")),
					cleans.length === 0 ? h("div", { style: { fontSize: 12, opacity: 0.6 } }, "（暂无）") :
						cleans.map((c) => {
							const ok = c.restorable === undefined ? c.count : c.restorable;
							return h("div", { key: c.batchId, style: { borderTop: "1px solid rgba(127,127,127,.18)", padding: "8px 0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } },
								h("span", { style: { fontSize: 12 } }, timeStr(c.at)),
								h("span", { style: { fontSize: 12, opacity: 0.7 } }, `${c.count} 项${ok !== c.count ? `（${ok} 可恢复）` : ""}`),
								h("button", { style: btn, disabled: busy || ok === 0, onClick: () => restoreBatch(c.batchId) }, ok === 0 ? tr(lang, "已恢复/已清空") : tr(lang, "恢复此批次")),
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
                    h("div",{className:"dc-page-head"},h("div",null,h("h1",null,tr(lang,"空间分析")),h("p",{className:"dc-subtitle"},tr(lang,"找到占用来源，按需整理或搬家。"))),
                        h("div",{className:"dc-mode-switch","aria-label":tr(lang,"空间视图")},[["tree","目录分布"],["large","大文件"]].map(([id,label])=>h("button",{key:id,"aria-pressed":spaceMode===id,onClick:()=>setSpaceMode(id)},tr(lang,label))))),
                    h("div",{hidden:spaceMode!=="tree"},h(SpaceView,{lang,onLarge:p=>{setSpaceScope(p);setSpaceMode("large");}})),
                    h("div",{hidden:spaceMode!=="large"},h(LargeView,{report,lang,scan,fresh:reportFresh,scope:spaceScope,onScope:setSpaceScope,onScan:()=>startScan(true),onCancel:cancelScan,at:overview?.at,whitelist,onMoved:()=>{loadOverview();refreshDisk();}})));
            }

			function CleanPage() {
				return h(React.Fragment, null,
					h("div", { className: "dc-page-head" }, h("div", null, h("h1", null, tr(lang, cleanMode === "junk" ? "清理文件" : "相似照片")),
						h("div", { className: "dc-page-meta" }, h("span", null, tr(lang, scanning ? "扫描中…" : !report ? "等待首次体检" : reportFresh ? "扫描完成" : "扫描结果已过期"), report && !scanning ? ` · ${recentTime(overview.at, lang)}` : ""),
						h("button", { className: "dc-link", disabled: scanning || busy, onClick: () => startScan(false) }, h(Icon, { name: "arrow-clockwise", size: 17, color: "#356ae6" }), tr(lang, "重新扫描")))),
						h("div", { className: "dc-mode-switch", "aria-label": tr(lang, "清理类型") }, [["junk", "垃圾清理"], ["photos", "相似照片"]].map(([id, label]) => h("button", { key: id, "aria-pressed": cleanMode === id, onClick: () => setCleanMode(id) }, tr(lang, label))))),
					cleanMode === "junk" ? Clean() : h(PhotoView, { lang }));
			}

			function Settings() {
				const safety = [
					"默认只移动：清理和照片去重先进废纸篓/隔离区，可在「历史」恢复；永久删除需在历史中二次确认。",
					"「需确认」与聊天数据永不自动勾选，也不会进入一键清理。",
					"白名单路径永远拒绝清理；符号链接永远拒绝。",
					"跨盘搬家会复制并做 SHA-256 校验，校验失败保留原文件。",
				];
				return h("div", null,
					h("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 6 } }, tr(lang, "安全说明")),
					h("ul", { style: { margin: "0 0 12px", paddingLeft: 18, fontSize: 12, opacity: 0.8, lineHeight: 1.8 } },
						safety.map((x, i) => h("li", { key: i }, tr(lang, x)))),
					h("div", { style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 14 } },
						h("span", { style: { fontSize: 13, fontWeight: 600 } }, tr(lang, "语言 / Language")),
						h("button", { style: lang === "zh" ? btnPrimary : btn, onClick: () => setLang("zh") }, "中文"),
						h("button", { style: lang === "en" ? btnPrimary : btn, onClick: () => setLang("en") }, "English")),
					h("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 6 } }, tr(lang, "保护名单（永不清理）")),
					whitelist.length === 0 ? h("div", { style: { fontSize: 12, opacity: 0.6, marginBottom: 6 } }, "（暂无）") :
						h("div", { style: { marginBottom: 8 } }, whitelist.map((p) => h("div", { key: p, style: { display: "flex", gap: 8, alignItems: "center", padding: "3px 0" } },
							h("span", { style: { fontSize: 11.5, wordBreak: "break-all", flex: 1 } }, p),
							h("button", { style: btn, onClick: () => removeWhitelist(p) }, tr(lang, "移除"))))),
					h("div", { style: { display: "flex", gap: 8, marginBottom: 14 } },
						h("input", { style: { ...input, flex: 1 }, placeholder: "输入要保护的绝对路径", value: newWhitelist, onChange: (e) => setNewWhitelist(e.target.value) }),
						h("button", { style: btn, onClick: addWhitelist }, tr(lang, "添加"))),
					h("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 6 } }, tr(lang, "环境")),
					h("div", { style: { fontSize: 12, opacity: 0.75, lineHeight: 1.8 } },
						h("div", null, `${tr(lang, "平台")}: ${overview ? overview.platform : "?"}`),
						h("div", null, `${tr(lang, "权限")}: ${report && report.fda ? (report.fda.status === "granted" ? tr(lang, "完全磁盘访问已授权") : report.fda.status === "denied" ? tr(lang, "完全磁盘访问未授权") : tr(lang, "无法确认")) : tr(lang, "未知")}`),
						h("div", null, `${tr(lang, "审计日志")}: ~/.dsh/deepclean-audit.log`),
						h("div", null, `${tr(lang, "历史文件")}: ~/.dsh/deepclean-history.json`),
						h("div", null, `${tr(lang, "白名单文件")}: ~/.dsh/deepclean-whitelist.json`)),
					h("div", { style: { display: "flex", gap: 8, marginTop: 10 } },
						h("button", { style: btn, onClick: checkPermissions }, tr(lang, "权限检查")),
						h("button", { style: btn, disabled: busy || scan.status === "running", onClick: () => startScan(false) }, "立即扫描")));
			}

			return h("div", { className: "dc", ref: rootRef, lang: lang === "en" ? "en" : "zh-CN" },
				h("style", null, STYLES), Header(),
				h("main", { className: "dc-content" },
					note ? h("div", { className: "dc-notice", role: "status" }, h(Icon, { name: "info", size: 18 }), h("span", null, trNote(lang, note)), h("button", { "aria-label": tr(lang, "关闭提示"), onClick: () => setNote("") }, h(Icon, { name: "x", size: 17 }))) : null,
					h("div", { hidden: view !== "space" }, (spaceVisited || view === "space") ? SpacePage() : null),
                    view === "home" ? Home() : view === "clean" ? CleanPage() : h("div", { className: "dc-legacy-page" }, view === "space" ? null : view === "history" ? History() : Settings())));

		}

		function apply(ctx) {
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: PANEL_ID,
				order: 30,
				label: "DeepClean MyDisk",
			}, DiskIcon));
			ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_ID,
				inject: () => ({}),
			}, Panel));
		}

		exports.apply = apply;
		exports.inject = ["slots"];
		return module.exports;
	}
});
