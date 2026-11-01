window.__ModuleLoader__.load({
	id: "deepclean-mydisk",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const h = React.createElement;
		const { useState, useEffect, useCallback } = React;

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
		 "只移动，不永久删除：清理和照片去重都先进废纸篓/隔离区，可在「历史」恢复。": "Moves only: cleaned files go to Trash/quarantine and can be restored from History.",
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
		 "将移到废纸篓，可在「历史」恢复；不会永久删除": "Moves to Trash; restorable from History; never permanently deleted",
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
		function trNote(lang, s) { return lang === "en" ? noteEn(s) : s; }
		function safetyOf(lang, row) {
			if (row.protected) return [tr(lang, "在白名单中"), tr(lang, "不会被清理"), tr(lang, "手动处理")];
			if (row.bucket === "system") return [tr(lang, "系统缓存"), tr(lang, "收益小，可能影响系统行为"), tr(lang, "不提供清理")];
			if (row.bucket === "special") return [tr(lang, "聊天数据"), tr(lang, "删除后可能无法恢复"), tr(lang, "仅支持手动处理")];
			if (row.bucket === "dev" && !row.checkable) return [tr(lang, "可能含镜像/归档/模拟器数据"), tr(lang, "删除不可恢复"), tr(lang, "手动处理")];
			if (row.bucket === "confirm") return [tr(lang, "可能含聊天记录/文档/笔记"), tr(lang, "建议先打开确认；删除后可从废纸篓恢复"), tr(lang, "在废纸篓或历史中恢复")];
			return [tr(lang, "缓存/残留，可重建或重新下载"), tr(lang, "不影响登录、文档或聊天记录"), tr(lang, "在废纸篓或历史中恢复")];
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

		function DiskIcon() {
			return h("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
				h("rect", { x: 3, y: 4, width: 18, height: 7, rx: 2 }),
				h("rect", { x: 3, y: 13, width: 18, height: 7, rx: 2 }),
				h("circle", { cx: 7.5, cy: 7.5, r: 0.8, fill: "currentColor", stroke: "none" }),
				h("circle", { cx: 7.5, cy: 16.5, r: 0.8, fill: "currentColor", stroke: "none" }));
		}

		function Donut(props) {
			const { used, total } = props;
			const pct = total > 0 ? Math.min(1, used / total) : 0;
			const r = 52, c = 2 * Math.PI * r;
			const col = pct > 0.9 ? "#e5534b" : pct > 0.75 ? "#d29922" : "#3fb950";
			return h("svg", { width: 150, height: 150, viewBox: "0 0 130 130", role: "img", "aria-label": `磁盘已用 ${Math.round(pct * 100)}%` },
				h("circle", { cx: 65, cy: 65, r, fill: "none", stroke: "rgba(127,127,127,.2)", strokeWidth: 12 }),
				h("circle", { cx: 65, cy: 65, r, fill: "none", stroke: col, strokeWidth: 12, strokeLinecap: "round",
					strokeDasharray: `${c * pct} ${c}`, transform: "rotate(-90 65 65)" }),
				h("text", { x: 65, y: 60, textAnchor: "middle", fill: "currentColor", fontSize: 20, fontWeight: 600 }, `${Math.round(pct * 100)}%`),
				h("text", { x: 65, y: 80, textAnchor: "middle", fill: "currentColor", fontSize: 11, opacity: 0.6 }, "已用"));
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

		function riskBadge(row) {
			if (row.protected) return h("span", { style: { fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "rgba(127,127,127,.2)" }, title: "在白名单中，永不清理" }, "🔒 保护");
			if (row.bucket === "safe") return h("span", { style: { fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "rgba(63,185,80,.16)", color: "#3fb950" } }, "安全");
			if (row.bucket === "confirm") return h("span", { style: { fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "rgba(210,153,34,.16)", color: "#d29922" } }, "需确认");
			if (row.bucket === "system") return h("span", { style: { fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "rgba(127,127,127,.2)" }, title: "系统缓存，不建议清理" }, "系统");
			if (row.bucket === "dev" && !row.checkable) return h("span", { style: { fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "rgba(210,153,34,.16)", color: "#d29922" } }, "需确认");
			if (row.bucket === "special" && !row.checkable) return h("span", { style: { fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "rgba(210,153,34,.16)", color: "#d29922" } }, "聊天数据");
			return h("span", { style: { fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "rgba(80,140,255,.14)", color: "rgba(80,140,255,1)" } }, "可再生");
		}

		function buildRows(report, whitelist, tab, search, sort, lang) {
			const rows = [];
			if (!report) return rows;
			const protectedOf = (p) => whitelist.some((w) => p === w || p.startsWith(w.replace(/\/+$/, "") + "/"));
			for (const g of report.leftoverGroups || []) {
				const paths = g.paths || [];
				const prot = paths.some(protectedOf);
				rows.push({ id: `g:${g.baseId}`, bucket: g.bucket, name: g.name || g.baseId, paths, kb: g.kb, note: trNote(lang, g.why || ""), group: true, protected: prot, checkable: g.bucket === "safe" && !prot });
			}
			for (const c of report.caches || []) {
				const prot = protectedOf(c.path);
				rows.push({ id: `c:${c.path}`, bucket: c.system ? "system" : "cache", name: c.path.split("/").pop() || c.path, paths: [c.path], kb: c.kb, note: tr(lang, c.system ? "系统缓存" : "缓存"), protected: prot, checkable: !c.system && !prot });
			}
			for (const d of report.devCaches || []) {
				const prot = protectedOf(d.path);
				const cleanable = d.cleanable !== false;
				rows.push({ id: `d:${d.path}`, bucket: "dev", name: d.path.split("/").pop() || d.path, paths: [d.path], kb: d.kb, note: trNote(lang, (d.advice || "缓存") + (cleanable ? "" : "；⚠️ 可能含重要数据，不进入一键清理")), protected: prot, checkable: cleanable && !prot });
			}
			for (const app of report.special || []) {
				for (const c of app.categories || []) {
					const paths = c.paths || [];
					const prot = paths.some(protectedOf);
					rows.push({ id: `s:${app.app}:${c.name}`, bucket: "special", name: `${app.app} · ${tr(lang, c.name)}`, paths, kb: c.kb, note: trNote(lang, c.cleanable ? "缓存，可重建" : "聊天数据（图片/视频/文件/缓存），删除后可能无法恢复，需人工确认"), protected: prot, checkable: !!c.cleanable && !prot });
				}
			}
			for (const b of report.browsers || []) {
				const prot = protectedOf(b.path);
				rows.push({ id: `b:${b.path}`, bucket: "cache", name: `${tr(lang, "缓存")} · ${b.name}`, paths: [b.path], kb: b.kb, note: tr(lang, "浏览器缓存，可重建（不碰书签/密码）"), protected: prot, checkable: !prot });
			}
			const q = search.trim().toLowerCase();
			const filtered = rows.filter((r) => {
				if (tab === "safe" && r.bucket !== "safe") return false;
				if (tab === "confirm" && r.bucket !== "confirm") return false;
				if (tab === "cache" && r.bucket !== "cache" && r.bucket !== "dev") return false;
				if (tab === "special" && r.bucket !== "special") return false;
				if (tab === "keep" && r.bucket !== "system") return false;
				if (q && !(r.name + " " + r.paths.join(" ") + " " + r.note).toLowerCase().includes(q)) return false;
				return true;
			});
			filtered.sort((a, b) => {
				if (sort === "name") return String(a.name).localeCompare(String(b.name));
				if (sort === "sizeAsc") return a.kb - b.kb;
				return b.kb - a.kb;
			});
			return filtered;
		}

		function Sunburst(props) {
			const lang = props.lang || "zh";
			const items = props.items.slice(0, 16);
			const total = items.reduce((sum, it) => sum + Math.max(1, it.kb), 0) || 1;
			const colors = ["#4c8dff", "#3fb950", "#d29922", "#e5534b", "#a371f7", "#39c5cf", "#db6d28", "#8b949e", "#f778ba", "#56d364"];
			let a = -Math.PI / 2;
			const R = 84, r = 50, cx = 95, cy = 95;
			const pt = (rad, ang) => `${(cx + rad * Math.cos(ang)).toFixed(2)} ${(cy + rad * Math.sin(ang)).toFixed(2)}`;
			const segs = items.map((it, i) => {
				const frac = Math.max(1, it.kb) / total;
				const b = a + frac * Math.PI * 2;
				const large = b - a > Math.PI ? 1 : 0;
				const d = `M${pt(R, a)} A${R} ${R} 0 ${large} 1 ${pt(R, b)} L${pt(r, b)} A${r} ${r} 0 ${large} 0 ${pt(r, a)} Z`;
				a = b;
				return h("path", { key: i, d, fill: colors[i % colors.length], opacity: 0.9, style: { cursor: it.isDir ? "pointer" : "default" }, onClick: () => it.isDir && props.onPick(it) },
					h("title", null, `${it.name} · ${fmt(it.kb)}`));
			});
			return h("svg", { width: 190, height: 190, viewBox: "0 0 190 190", role: "img", "aria-label": tr(lang, "磁盘空间分布") }, segs,
				h("text", { x: 95, y: 92, textAnchor: "middle", fill: "currentColor", fontSize: 11, opacity: 0.6 }, tr(lang, "点击色块")),
				h("text", { x: 95, y: 106, textAnchor: "middle", fill: "currentColor", fontSize: 11, opacity: 0.6 }, tr(lang, "钻取目录")));
		}

		function SpaceView(props) {
			const lang = props.lang || "zh";
			const [stack, setStack] = useState([]);
			const [children, setChildren] = useState([]);
			const [loading, setLoading] = useState(false);
			const [error, setError] = useState("");
			const load = useCallback(async (p) => {
				setLoading(true); setError("");
				try {
					const res = await fetch(`${API}/tree${p ? `?path=${encodeURIComponent(p)}` : ""}`);
					const body = await res.json();
					if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
					setChildren(body.children || []);
					return body;
				} catch (err) {
					setError(String(err && err.message ? err.message : err));
					return null;
				} finally { setLoading(false); }
			}, []);
			useEffect(() => { load(""); }, [load]);
			const drill = useCallback(async (item) => {
				const body = await load(item.path);
				if (body) setStack((prev) => [...prev, { path: item.path, name: item.name }]);
			}, [load]);
			const back = useCallback(async () => {
				const next = stack.slice(0, -1);
				setStack(next);
				await load(next.length > 0 ? next[next.length - 1].path : "");
			}, [stack, load]);
			const current = stack.length > 0 ? stack[stack.length - 1].path : "";
			const total = children.reduce((sum, c) => sum + c.kb, 0) || 1;
			const rowNodes = children.slice(0, 15).map((c) => h("tr", { key: c.path },
				h("td", { style: { ...td, cursor: c.isDir ? "pointer" : "default" }, onClick: () => c.isDir && drill(c) },
					h("div", { style: { fontSize: 12.5 } }, c.name, c.isDir ? " /" : ""),
					h("div", { style: { fontSize: 10.5, opacity: 0.5 } }, fmt(c.kb), " · ", `${Math.round((c.kb / total) * 100)}%`))));
			return h("div", null,
				h("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 } },
					h("button", { style: btn, disabled: stack.length === 0, onClick: back }, tr(lang, "上一级")),
					h("span", { style: { fontSize: 12, opacity: 0.75, wordBreak: "break-all" } }, current || tr(lang, "家目录")),
					loading ? h("span", { style: { fontSize: 11, opacity: 0.6 } }, tr(lang, "统计中…")) : null),
				error ? h("div", { style: { fontSize: 12, color: "#e5534b" } }, error) : null,
				h("div", { style: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" } },
					h(Sunburst, { items: children, onPick: drill, lang }),
					h("div", { style: { flex: "1 1 240px", minWidth: 220 } },
						h("table", { style: table }, h("tbody", null, rowNodes)))));
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

			const itemNode = (it, idx) => h("div", { key: it.path, style: { width: 150 } },
				h("label", { style: { display: "flex", alignItems: "center", gap: 4, fontSize: 11 } },
					h("input", { type: "checkbox", checked: !!sel[it.path], onChange: () => setSel((prev) => {
						const next = { ...prev };
						if (next[it.path]) delete next[it.path];
						else next[it.path] = true;
						return next;
					}) }),
					idx === 0 ? tr(lang, "建议保留") : tr(lang, "可清理"),
					h("span", { style: { opacity: 0.6 } }, " " + fmt(it.kb))),
				h("img", { src: `${API}/thumb?path=${encodeURIComponent(it.path)}`, alt: it.path, loading: "lazy", style: { width: "100%", height: 90, objectFit: "cover", borderRadius: 6, marginTop: 4, background: "rgba(127,127,127,.12)" } }),
				h("div", { style: { fontSize: 10, opacity: 0.55, wordBreak: "break-all", marginTop: 2 } }, it.path.split("/").pop()));
			const groupNode = (g) => h("div", { key: g.id, style: { border: "1px solid rgba(127,127,127,.25)", borderRadius: 10, padding: "10px", marginBottom: 10 } },
				h("div", { style: { fontSize: 12, opacity: 0.75, marginBottom: 6 } }, tf(lang, "相似组 · {n} 张 · 可回收 {size}", { n: g.items.length, size: fmt(g.wastedKb) })),
				h("div", { style: { display: "flex", gap: 10, flexWrap: "wrap" } }, g.items.map(itemNode)));
			const groups = result && result.groups ? result.groups.map(groupNode) : [];
			const wasted = result ? result.groups.reduce((sum, g) => sum + g.wastedKb, 0) : 0;

			return h("div", null,
				h("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 } },
					h("button", { style: btnPrimary, disabled: busy || scan.status === "running", onClick: start }, scan.status === "running" ? tr(lang, "扫描中…") : tr(lang, "扫描相似照片")),
					scan.status === "running" ? h("button", { style: btn, onClick: cancel }, tr(lang, "取消")) : null,
					h("span", { style: { fontSize: 11, opacity: 0.6 } }, "默认保留每组第一张（体积最大），取消勾选可调整")),
				scan.status === "running" ? h("div", { style: { height: 6, borderRadius: 3, background: "rgba(127,127,127,.2)", overflow: "hidden", marginBottom: 8 } },
					h("div", { style: { height: "100%", width: `${Math.max(3, scan.progress || 0)}%`, background: "rgba(80,140,255,.9)" } })) : null,
				scan.status === "running" ? h("div", { style: { fontSize: 11, opacity: 0.7, marginBottom: 8 } }, `${scan.stage || "扫描中"} · ${scan.elapsed || 0}s`) : null,
				note ? h("pre", { style: { whiteSpace: "pre-wrap", fontSize: 11.5, opacity: 0.85, background: "rgba(127,127,127,.08)", padding: 8, borderRadius: 6, marginBottom: 8 } }, note) : null,
				result ? h("div", { style: { fontSize: 12, opacity: 0.7, marginBottom: 8 } }, tf(lang, "扫描 {n} 张，比较 {m} 张，找到 {g} 组相似；预计可回收 {size}", { n: result.scanned, m: result.compared, g: result.groups.length, size: fmt(wasted) })) : null,
				groups,
				(paths.length > 0 || photoBatch) ? h("div", { style: { position: "sticky", bottom: 0, marginTop: 8, padding: "9px 0", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" } },
					paths.length > 0 ? h("span", { style: { fontSize: 12 } }, tf(lang, "已选 {n} 张 · {size}", { n: paths.length, size: fmt(totalKb) })) : h("span", { style: { fontSize: 12, opacity: 0.7 } }, "上次照片清理可恢复"),
					paths.length > 0 && !confirming ? h("button", { style: btnDanger, disabled: busy, onClick: () => setConfirming(true) }, tr(lang, "移到废纸篓")) : null,
					photoBatch ? h("button", { style: btn, disabled: busy, onClick: undo }, tr(lang, "撤销照片清理")) : null,
					confirming ? h(React.Fragment, null,
						h("span", { style: { fontSize: 12, color: "#e5534b" } }, tf(lang, "确认把 {n} 张移到废纸篓？", { n: paths.length })),
						h("div", { style: { flexBasis: "100%", fontSize: 11, opacity: 0.7 } }, tr(lang, "将移到废纸篓，可在「历史」恢复；不会永久删除")),
						h("button", { style: btnDanger, disabled: busy, onClick: clean }, busy ? tr(lang, "移动中…") : tr(lang, "确认移动")),
						h("button", { style: btn, disabled: busy, onClick: () => setConfirming(false) }, tr(lang, "取消"))) : null) : null);
		}

		function LargeView(props) {
			const lang = props.lang || "zh";
			const report = props.report;
			const [sort, setSort] = useState("size");
			const [age, setAge] = useState(0);
			const [ext, setExt] = useState("");
			const [sel, setSel] = useState({});
			const [destination, setDestination] = useState("");
			const [confirming, setConfirming] = useState(false);
			const [busy, setBusy] = useState(false);
			const [note, setNote] = useState("");
			const [move, setMove] = useState({ status: "idle", done: 0, total: 0, current: "" });
			const [movedPaths, setMovedPaths] = useState({});

			const files = ((report && report.bigFiles) || []).map((f) => ({ ...f, ageDays: f.mtime ? Math.floor((Date.now() / 1000 - f.mtime) / 86400) : -1 }));
			const exts = [...new Set(files.map((f) => f.ext).filter(Boolean))].sort();
			const rows = files
				.filter((f) => !movedPaths[f.path] && (!age || f.ageDays >= age) && (!ext || f.ext === ext))
				.sort((a, b) => (sort === "age" ? b.ageDays - a.ageDays : b.kb - a.kb));
			const selected = Object.keys(sel).filter((p) => sel[p]);
			const selectedKb = files.reduce((sum, f) => sum + (sel[f.path] ? f.kb : 0), 0);

			useEffect(() => {
				if (move.status !== "running") return undefined;
				const timer = setInterval(async () => {
					try {
						const res = await fetch(`${API}/move`);
						const body = await res.json();
						const m = body.move || {};
						setMove(m);
						if (m.status !== "running") {
							const ok = (m.results || []).filter((r) => r.ok);
							const failed = (m.results || []).filter((r) => !r.ok);
							const next = {};
							for (const r of ok) next[r.path] = true;
							setMovedPaths((prev) => ({ ...prev, ...next }));
							setSel({});
							setNote(tf(lang, "已移动 {n} 个文件（跨盘 SHA-256 校验通过）", { n: ok.length }) + (failed.length ? `\n失败 ${failed.length}：${failed.map((f) => f.error).join("；")}` : ""));
							if (props.onMoved) props.onMoved();
						}
					} catch { /* ignore */ }
				}, 700);
				return () => clearInterval(timer);
			}, [move.status, props]);

			const reveal = async (p) => {
				try { await fetch(`${API}/reveal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: p }) }); }
				catch { /* ignore */ }
			};
			const startMove = useCallback(async () => {
				setBusy(true); setNote("");
				try {
					const res = await fetch(`${API}/move`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: selected, destination }) });
					const body = await res.json();
					if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
					setMove({ status: "running", done: 0, total: body.count || selected.length, current: "" });
					setConfirming(false);
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, [selected.join("|"), destination]);
			const cancelMove = useCallback(async () => {
				try { await fetch(`${API}/move/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); }
				catch { /* ignore */ }
			}, []);

			const moving = move.status === "running";
			return h("div", null,
				h("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 } },
					h("select", { style: input, value: sort, onChange: (e) => setSort(e.target.value) },
						h("option", { value: "size" }, tr(lang, "按大小")), h("option", { value: "age" }, tr(lang, "按未修改天数"))),
					h("select", { style: input, value: age, onChange: (e) => setAge(Number(e.target.value)) },
						h("option", { value: 0 }, tr(lang, "全部时间")), h("option", { value: 90 }, "> 90 " + tr(lang, "按未修改天数").split(" ").pop()), h("option", { value: 180 }, "> 180"), h("option", { value: 365 }, "> 365")),
					h("select", { style: input, value: ext, onChange: (e) => setExt(e.target.value) },
						h("option", { value: "" }, tr(lang, "全部类型")), exts.map((x) => h("option", { key: x, value: x }, x))),
					h("span", { style: { fontSize: 11, opacity: 0.6 } }, "勾选后可「移动」到其他磁盘；跨盘会复制并校验")),
				note ? h("pre", { style: { whiteSpace: "pre-wrap", fontSize: 11.5, opacity: 0.85, background: "rgba(127,127,127,.08)", padding: 8, borderRadius: 6, marginBottom: 8 } }, note) : null,
				moving ? h("div", { style: { marginBottom: 8 } },
					h("div", { style: { height: 6, borderRadius: 3, background: "rgba(127,127,127,.2)", overflow: "hidden" } },
						h("div", { style: { height: "100%", width: `${move.total ? Math.round((move.done / move.total) * 100) : 5}%`, background: "rgba(80,140,255,.9)", transition: "width .3s" } })),
					h("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.7, marginTop: 4 } },
						h("span", null, tf(lang, "正在移动 {done}/{total}", { done: move.done, total: move.total }) + (move.current ? " · " + move.current : "")),
						h("button", { style: btn, onClick: cancelMove }, tr(lang, "取消")))) : null,
				rows.length === 0 ? h("div", { style: { fontSize: 12, opacity: 0.6 } }, report ? tr(lang, "没有符合条件的大文件；需要先「完整扫描」") : "先扫描一次") :
					h("table", { style: table }, h("tbody", null, rows.map((f) => h("tr", { key: f.path },
						h("td", { style: { ...td, width: 24 } }, h("input", { type: "checkbox", checked: !!sel[f.path], disabled: moving, onChange: () => setSel((prev) => { const next = { ...prev }; if (next[f.path]) delete next[f.path]; else next[f.path] = true; return next; }) })),
						h("td", { style: td },
							h("div", { style: { fontSize: 12.5, wordBreak: "break-all" } }, f.path),
							h("div", { style: { fontSize: 10.5, opacity: 0.55 } }, f.category || "", " · ", f.ageDays >= 0 ? `未修改 ${f.ageDays} 天` : "")),
						h("td", { style: { ...td, width: 64 } }, fmt(f.kb)),
						h("td", { style: { ...td, width: 150 } },
							h("button", { style: btn, onClick: () => navigator.clipboard && navigator.clipboard.writeText(f.path) }, "复制路径"),
							" ",
							h("button", { style: btn, onClick: () => reveal(f.path) }, "Finder")))))),
				selected.length > 0 ? h("div", { style: { position: "sticky", bottom: 0, marginTop: 8, padding: "9px 0", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" } },
					h("span", { style: { fontSize: 12 } }, tf(lang, "已选 {n} 个 · {size}", { n: selected.length, size: fmt(selectedKb) })),
					h("input", { style: { ...input, flex: "1 1 220px" }, placeholder: tr(lang, "目标目录，例如 /Volumes/Backup"), value: destination, onChange: (e) => setDestination(e.target.value) }),
					!confirming ? h("button", { style: btnPrimary, disabled: busy || moving || !destination.trim(), onClick: () => setConfirming(true) }, tr(lang, "移动到…")) : null,
					confirming ? h(React.Fragment, null,
						h("span", { style: { fontSize: 12, color: "#e5534b" } }, tf(lang, "确认移动 {n} 个文件到 {dest}？", { n: selected.length, dest: destination })),
						h("div", { style: { flexBasis: "100%", fontSize: 11, opacity: 0.7 } }, tr(lang, "跨盘搬家会复制并做 SHA-256 校验，校验失败保留原文件。")),
						h("button", { style: btnDanger, disabled: busy, onClick: startMove }, busy ? tr(lang, "准备中…") : tr(lang, "确认移动")),
						h("button", { style: btn, disabled: busy, onClick: () => setConfirming(false) }, "取消")) : null) : null);
		}

		function Panel() {
			const [view, setView] = useState("home");
			const [overview, setOverview] = useState(null);
			const [scan, setScan] = useState({ status: "idle" });
			const [tab, setTab] = useState("safe");
			const [search, setSearch] = useState("");
			const [sort, setSort] = useState("sizeDesc");
			const [sel, setSel] = useState({});
			const [expanded, setExpanded] = useState("");
			const [confirming, setConfirming] = useState(false);
			const [busy, setBusy] = useState(false);
			const [note, setNote] = useState("");
			const [lastBatch, setLastBatch] = useState("");
			const [newWhitelist, setNewWhitelist] = useState("");
			const [pendingSmart, setPendingSmart] = useState(false);
			const [spaceMode, setSpaceMode] = useState("tree");
			const [cleanMode, setCleanMode] = useState("junk");
			const [lang, setLang] = useState(() => {
				try { return localStorage.getItem("deepclean-lang") || "zh"; } catch { return "zh"; }
			});
			useEffect(() => { try { localStorage.setItem("deepclean-lang", lang); } catch { /* ignore */ } }, [lang]);
			const [safetySeen, setSafetySeen] = useState(() => {
				try { return localStorage.getItem("deepclean-safety-ok") === "1"; } catch { return true; }
			});
			const dismissSafety = useCallback(() => {
				setSafetySeen(true);
				try { localStorage.setItem("deepclean-safety-ok", "1"); } catch { /* ignore */ }
			}, []);

			const loadOverview = useCallback(async () => {
				try {
					const res = await fetch(`${API}/overview`);
					const body = await res.json();
					if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
					setOverview(body);
					setScan(body.scan || { status: "idle" });
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

			useEffect(() => { loadOverview(); }, [loadOverview]);

			useEffect(() => {
				if (scan.status !== "running") return undefined;
				const timer = setInterval(async () => {
					try {
						const res = await fetch(`${API}/scan`);
						const body = await res.json();
						const s = body.scan || {};
						setScan(s);
						if (s.status !== "running") {
							if (s.status === "done") { setNote(`扫描完成（${s.elapsed}s）`); loadOverview(); setView("clean"); }
							if (s.status === "error") setNote("扫描失败：" + (s.error || "未知错误"));
							if (s.status === "canceled") setNote("扫描已取消");
						}
					} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				}, 900);
				return () => clearInterval(timer);
			}, [scan.status, loadOverview]);

			const startScan = useCallback(async (full) => {
				setNote(""); setBusy(true);
				try {
					const res = await fetch(`${API}/scan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ full: !!full }) });
					const body = await res.json();
					if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
					setScan(body.scan || { status: "running", progress: 0 });
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, []);

			const cancelScan = useCallback(async () => {
				try {
					await fetch(`${API}/scan/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
					setNote("正在取消…");
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
			}, []);

			const report = overview && overview.report ? overview.report : null;
			const whitelist = (overview && overview.whitelist) || [];
			const rows = buildRows(report, whitelist, tab, search, sort, lang);
			const selectedPaths = Object.keys(sel).filter((p) => sel[p]);
			const selectedStats = (() => {
				let kb = 0, items = 0;
				if (report) {
					for (const g of report.leftoverGroups || []) if ((g.paths || []).some((p) => sel[p])) { kb += g.kb; items += 1; }
					for (const c of report.caches || []) if (sel[c.path]) { kb += c.kb; items += 1; }
					for (const d of report.devCaches || []) if (sel[d.path]) { kb += d.kb; items += 1; }
					for (const b of report.browsers || []) if (sel[b.path]) { kb += b.kb; items += 1; }
					for (const app of report.special || []) for (const c of app.categories || []) if ((c.paths || []).some((p) => sel[p])) { kb += c.kb; items += 1; }
				}
				return { kb, items };
			})();
			const selectedKb = selectedStats.kb;

			const toggle = useCallback((paths) => {
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

			const doClean = useCallback(async () => {
				setBusy(true);
				try {
					const res = await fetch(`${API}/clean`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: selectedPaths }) });
					const body = await res.json();
					if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
					const okPaths = (body.results || []).filter((r) => r.ok).map((r) => r.path);
					const failed = (body.results || []).filter((r) => !r.ok);
					setSel({}); setLastBatch(body.batchId || ""); setConfirming(false);
					setNote(`已移动 ${okPaths.length} 项到废纸篓/隔离区，可撤销` + (failed.length ? `\n失败 ${failed.length} 项：${failed.map((f) => f.error).join("；")}` : ""));
					await loadOverview();
					await startScan(false);
				} catch (err) { setNote(String(err && err.message ? err.message : err)); }
				finally { setBusy(false); }
			}, [selectedPaths.join("|"), loadOverview, startScan]);

			const doUndo = useCallback(async () => {
				setBusy(true);
				try {
					const res = await fetch(`${API}/undo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId: lastBatch || undefined }) });
					const body = await res.json();
					if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
					const ok = (body.results || []).filter((r) => r.ok).length;
					setLastBatch(""); setNote(`已恢复 ${ok} 项，重新扫描中…`);
					await loadOverview();
					await startScan(false);
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
				for (const g of rep.leftoverGroups || []) if (g.bucket === "safe") for (const p of g.paths || []) next[p] = true;
				for (const c of rep.caches || []) if (!c.system) next[c.path] = true;
				for (const d of rep.devCaches || []) if (d.cleanable !== false) next[d.path] = true;
				setSel(next); setView("clean"); setNote("已选中推荐项，请核对后清理");
			}, [overview]);

			useEffect(() => {
				if (pendingSmart && scan.status === "done" && overview && overview.report) {
					setPendingSmart(false);
					selectRecommended();
				}
			}, [pendingSmart, scan.status, overview, selectRecommended]);

			const disk = report && report.disk ? report.disk : null;
			const est = report && report.estimate ? report.estimate : null;
			const history = (overview && overview.history) || [];
			const cleans = (overview && overview.cleanBatches) || [];
			const nav = [["home", "体检"], ["space", "空间"], ["clean", "清理"], ["history", "历史"], ["settings", "设置"]];

			function Header() {
				return h("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 } },
					h(DiskIcon),
					h("h2", { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, "DeepClean MyDisk"),
					h("span", { style: { fontSize: 11, opacity: 0.55 } }, scan.status === "running" ? `${tr(lang, "扫描中…")} ${scan.progress || 0}%` : (overview && overview.at ? `${tr(lang, "历史")}: ${timeStr(overview.at)}` : "")),
				);
			}

			function Progress() {
				if (scan.status !== "running") return null;
				return h("div", { style: { margin: "8px 0 12px" } },
					h("div", { style: { height: 6, borderRadius: 3, background: "rgba(127,127,127,.2)", overflow: "hidden" } },
						h("div", { style: { height: "100%", width: `${Math.max(3, scan.progress || 0)}%`, background: "rgba(80,140,255,.9)", transition: "width .4s" } })),
					h("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.7, marginTop: 4 } },
						h("span", null, `${scan.stage || "扫描中"} · ${scan.elapsed || 0}s`),
						h("button", { style: btn, onClick: cancelScan }, "取消")));
			}

			function Home() {
				const total = disk ? disk.total : 0;
				const spark = history.slice(-12);
				return h("div", null,
					!safetySeen ? h("div", { style: { border: "1px solid rgba(80,140,255,.35)", background: "rgba(80,140,255,.06)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 } },
						h("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 4 } }, tr(lang, "安全说明")),
						h("div", { style: { fontSize: 12, opacity: 0.8, lineHeight: 1.7 } }, tr(lang, "只移动，不永久删除：清理和照片去重都先进废纸篓/隔离区，可在「历史」恢复。")),
						h("div", { style: { display: "flex", gap: 8, marginTop: 8 } },
							h("button", { style: btnPrimary, onClick: dismissSafety }, tr(lang, "知道了")),
							h("button", { style: btn, onClick: () => setView("settings") }, tr(lang, "查看安全说明")))) : null,
					h("div", { style: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" } },
						h(Donut, { used: disk ? disk.used : 0, total }),
						h("div", { style: { flex: "1 1 220px", minWidth: 200 } },
							h("div", { style: { fontSize: 13, marginBottom: 6 } }, `${tr(lang, "可用")} ${fmtBytes(disk ? disk.free : 0)} / ${tr(lang, "共")} ${fmtBytes(total)}`),
							est ? h("div", { style: { fontSize: 13, marginBottom: 6 } }, `${tr(lang, "可回收约")} ${fmt(est.totalKb)} (${tr(lang, "安全")} ${fmt(est.safeKb)} · ${tr(lang, "缓存")} ${fmt(est.cacheKb)} · ${tr(lang, "开发")} ${fmt(est.devKb)})`) : null,
							h("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
								h("button", { style: btnPrimary, disabled: busy || scan.status === "running", onClick: () => startScan(false) }, tr(lang, "快速扫描")),
								h("button", { style: btnPrimary, disabled: busy || scan.status === "running", onClick: () => { setPendingSmart(true); startScan(false); } }, tr(lang, "智能体检")),
								h("button", { style: btn, disabled: busy || scan.status === "running", onClick: () => startScan(true) }, tr(lang, "完整扫描")),
								h("button", { style: btn, onClick: checkPermissions }, tr(lang, "权限检查"))))),
					h(Progress),
					scan.status === "error" ? h("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#e5534b", marginTop: 6 } },
						h("span", null, "扫描失败：", scan.error || "未知错误"),
						h("button", { style: btn, onClick: () => startScan(false) }, "重试")) : null,
					!report && scan.status !== "running" ? h("div", { style: { fontSize: 12, opacity: 0.7, marginTop: 6 } }, tr(lang, "还没有扫描结果，先点「快速扫描」开始第一次体检。")) : null,
					spark.length > 1 ? h("div", { style: { marginTop: 14 } },
						h("div", { style: { fontSize: 12, opacity: 0.7, marginBottom: 4 } }, tr(lang, "可用空间趋势")),
						h("div", { style: { display: "flex", alignItems: "flex-end", gap: 3, height: 48 } },
							spark.map((s, i) => {
								const max = Math.max(...spark.map((x) => x.free || 0)) || 1;
								return h("div", { key: i, title: `${timeStr(s.at)} · 可用 ${fmtBytes(s.free)}`, style: { flex: 1, height: `${Math.max(4, ((s.free || 0) / max) * 100)}%`, background: "rgba(80,140,255,.5)", borderRadius: 2 } });
							}))) : null,
					h("div", { style: { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 } },
						h("div", { style: card }, h("div", { style: { fontSize: 12, opacity: 0.65 } }, tr(lang, "可安全清理")), h("div", { style: { fontSize: 18, fontWeight: 600, marginTop: 4 } }, fmt(est ? est.safeKb : 0))),
						h("div", { style: card }, h("div", { style: { fontSize: 12, opacity: 0.65 } }, tr(lang, "缓存 + 开发缓存")), h("div", { style: { fontSize: 18, fontWeight: 600, marginTop: 4 } }, fmt(est ? (est.cacheKb + est.devKb) : 0))),
						h("div", { style: card }, h("div", { style: { fontSize: 12, opacity: 0.65 } }, tr(lang, "清理历史")), h("div", { style: { fontSize: 18, fontWeight: 600, marginTop: 4 } }, `${cleans.length} 批`), h("button", { style: { ...btn, marginTop: 6 }, onClick: () => setView("history") }, tr(lang, "查看")))));
			}

			function Clean() {
				const tabs = [["safe", tr(lang, "可安全清理")], ["confirm", tr(lang, "需确认")], ["cache", tr(lang, "缓存/开发")], ["special", tr(lang, "微信/QQ")], ["keep", tr(lang, "系统缓存")]];
				return h("div", null,
					h(Progress),
					(overview && overview.at && Date.now() - overview.at > 10 * 60 * 1000) ? h("div", { style: { display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#d29922", marginBottom: 8 } },
						h("span", null, tr(lang, "扫描结果已超过 10 分钟，清理会被拒绝。")),
						h("button", { style: btn, disabled: scan.status === "running", onClick: () => startScan(false) }, tr(lang, "重新扫描"))) : null,
					h("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 } },
						tabs.map(([id, label]) => h("button", { key: id, style: navBtn(tab === id), onClick: () => { setTab(id); setSel({}); } }, label)),
						h("button", { style: btn, onClick: selectRecommended }, tr(lang, "选中推荐项")),
						h("input", { style: { ...input, marginLeft: "auto" }, placeholder: tr(lang, "搜索名称/路径…"), value: search, onChange: (e) => setSearch(e.target.value) }),
						h("select", { style: input, value: sort, onChange: (e) => setSort(e.target.value) },
							h("option", { value: "sizeDesc" }, tr(lang, "大小 ↓")),
							h("option", { value: "sizeAsc" }, tr(lang, "大小 ↑")),
							h("option", { value: "name" }, tr(lang, "名称")))),
					h("table", { style: table },
						h("thead", null, h("tr", null, h("th", { style: { ...th, width: 26 } }), h("th", { style: th }, tr(lang, "项目")), h("th", { style: { ...th, width: 64 } }, tr(lang, "大小")), h("th", { style: th }, tr(lang, "说明")))),
						h("tbody", null, rows.length === 0
							? h("tr", null, h("td", { style: { ...td, opacity: 0.75 }, colSpan: 4 },
								report ? tr(lang, "（无）") : h("span", null, tr(lang, "还没有扫描结果，先点") + " ",
									h("button", { style: btnPrimary, disabled: busy || scan.status === "running", onClick: () => startScan(false) }, tr(lang, "快速扫描")), " " + tr(lang, "或回首页选择完整扫描"))))
							: rows.map((row) => h(React.Fragment, { key: row.id },
								h("tr", null,
									h("td", { style: td }, row.checkable ? h("input", { type: "checkbox", checked: row.paths.every((p) => sel[p]), onChange: () => toggle(row.paths) }) : h("span", { style: { opacity: 0.35 }, title: "不可勾选" }, "🔒")),
									h("td", { style: { ...td, cursor: "pointer" }, onClick: () => setExpanded(expanded === row.id ? "" : row.id) },
										h("div", { style: { fontWeight: 500 } }, row.name, " ", riskBadge(row)),
										h("div", { style: { opacity: 0.55, fontSize: 11, wordBreak: "break-all" } }, row.paths[0] || "")),
									h("td", { style: td }, fmt(row.kb)),
									h("td", { style: { ...td, opacity: 0.75 } }, row.note || "")),
								expanded === row.id ? h("tr", { key: row.id + ":x" }, h("td", { colSpan: 4, style: { ...td, background: "rgba(127,127,127,.06)", fontSize: 11.5 } },
									h("div", { style: { display: "grid", gap: 2, marginBottom: 4 } },
										safetyOf(lang, row).map((line, i) => h("div", { key: i, style: { fontSize: 11 } },
											`${tr(lang, ["为什么在这里", "删了会怎样", "怎么恢复"][i])}: ${line}`))),
									h("div", null, row.note || tr(lang, "（无说明）")),
									row.paths.length > 1 ? h("ul", { style: { margin: "4px 0", paddingLeft: 18 } }, row.paths.map((p, i) => h("li", { key: i }, p))) : null)) : null,
							))),
					),
					(selectedPaths.length > 0 || lastBatch) ? h("div", { style: { position: "sticky", bottom: 0, marginTop: 10, padding: "10px 0", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },
						selectedPaths.length > 0 ? h("span", { style: { fontSize: 12 } }, tf(lang, "已选 {n} 项 · {size}", { n: selectedStats.items, size: fmt(selectedKb) })) : h("span", { style: { fontSize: 12, opacity: 0.7 } }, tr(lang, "上次清理可撤销")),
						selectedPaths.length > 0 && !confirming ? h("button", { style: btnPrimary, disabled: busy, onClick: () => setConfirming(true) }, tr(lang, "清理选中")) : null,
						confirming ? h(React.Fragment, null,
							h("span", { style: { fontSize: 12, color: "#e5534b" } }, tf(lang, "确认把 {n} 项（{size}）移到废纸篓？", { n: selectedStats.items, size: fmt(selectedKb) })),
							h("button", { style: btnDanger, disabled: busy, onClick: doClean }, busy ? "清理中…" : tr(lang, "确认清理")),
							h("button", { style: btn, disabled: busy, onClick: () => setConfirming(false) }, "取消")) : null,
						selectedPaths.length > 0 ? h("button", { style: btn, onClick: copyCommands }, tr(lang, "复制命令")) : null,
						selectedPaths.length > 0 ? h("button", { style: btn, onClick: protectSelected }, tr(lang, "加入保护")) : null,
						lastBatch ? h("button", { style: btn, disabled: busy, onClick: doUndo }, tr(lang, "撤销上次清理")) : null) : null,
				);
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
								h("button", { style: btn, disabled: busy || ok === 0, onClick: () => restoreBatch(c.batchId) }, ok === 0 ? tr(lang, "已恢复/已清空") : tr(lang, "恢复此批次")));
						}),
				);
			}

			function SpacePage() {
				return h("div", null,
					h("div", { style: { display: "flex", gap: 6, marginBottom: 10 } },
						h("button", { style: navBtn(spaceMode === "tree"), onClick: () => setSpaceMode("tree") }, tr(lang, "目录分布")),
						h("button", { style: navBtn(spaceMode === "large"), onClick: () => setSpaceMode("large") }, tr(lang, "大文件"))),
					spaceMode === "tree" ? h(SpaceView, { lang }) : h(LargeView, { report, lang, onMoved: () => { loadOverview(); startScan(false); } }));
			}

			function CleanPage() {
				return h("div", null,
					h("div", { style: { display: "flex", gap: 6, marginBottom: 10 } },
						h("button", { style: navBtn(cleanMode === "junk"), onClick: () => setCleanMode("junk") }, tr(lang, "垃圾清理")),
						h("button", { style: navBtn(cleanMode === "photos"), onClick: () => setCleanMode("photos") }, tr(lang, "相似照片"))),
					cleanMode === "junk" ? h(Clean) : h(PhotoView, { lang }));
			}

			function Settings() {
				const safety = [
					"只移动，不永久删除：清理和照片去重都先进废纸篓/隔离区，可在「历史」恢复。",
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

			return h("div", { style: { padding: "16px 20px", fontFamily: "inherit", color: "inherit", height: "100%", overflow: "auto" } },
				h(Header),
				note ? h("pre", { style: { whiteSpace: "pre-wrap", fontSize: 11.5, opacity: 0.85, background: "rgba(127,127,127,.08)", padding: 8, borderRadius: 6, maxHeight: 110, overflow: "auto", margin: "0 0 10px" } }, note) : null,
				h("div", { style: { display: "flex", gap: 14, alignItems: "flex-start" } },
					h("div", { style: { width: 120, flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 2 } },
						nav.map(([id, label]) => h("button", { key: id, style: navBtn(view === id), onClick: () => setView(id) }, tr(lang, label)))),
					h("div", { style: { flex: 1, minWidth: 0 } },
						view === "home" ? h(Home) : view === "space" ? h(SpacePage) : view === "clean" ? h(CleanPage) : view === "history" ? h(History) : h(Settings))));
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
