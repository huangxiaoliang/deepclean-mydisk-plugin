# 自建插件市场索引

`docs/market/index.json` 是本仓库自建的 DSH 插件市场索引（format 1）。它解决的问题：DSH 客户端「插件 → 发现」里，条目页「来源」区的 **主页** 链接取的是索引条目的 `homepage` 字段，而不是 README 或 `package.json#homepage`。想让主页直接落到 GitHub README，就得自己提供索引。

## 文件

- `docs/market/index.json` — 索引本体，当前两条：
  - `@yolk_vat-y/dsh-project-memory`（`00080000/dsh-project-memory`），`homepage` 指向其 GitHub README（示例条目，不需要可删）；
  - `deepclean-mydisk`，`homepage` 指向本仓库 README，版本 `0.14.2`。
- `scripts/update-market-index.mjs` — 从 npm registry 刷新版本。
- `.github/workflows/market-index.yml` — 定时/发版后自动刷新并提交。

## 本地验证（不用 push）

```bash
python3 -m http.server 8791 --directory docs/market
```

然后 DSH：**插件 → 发现 → 顶部「插件索引」菜单 → 管理索引源… → 添加** `http://127.0.0.1:8791/index.json`。

## 挂到线上

push 到 `main` 后使用 jsDelivr（无需 npm 发布，`docs/` 不在 npm `files` 里也不影响）：

```
https://cdn.jsdelivr.net/gh/huangxiaoliang/deepclean-mydisk-plugin@main/docs/market/index.json
```

jsDelivr 有缓存；改完文件可访问 `https://purge.jsdelivr.net/gh/huangxiaoliang/deepclean-mydisk-plugin@main/docs/market/index.json` 刷新，或把 `@main` 换成 commit SHA / tag 固定。

也可以写进 profile 配置（等价于 UI 操作）：`~/.dsh/profiles/<profile>/cordis.patch.yml` 的 `plugin-market` 行 `config.indexes` 追加 URL，然后重启 DSH。

## 刷新版本

```bash
npm run market:index          # 改写 docs/market/index.json
npm run market:index:check    # 只校验，过期 exit 1
node scripts/update-market-index.mjs --dry-run
```

脚本只处理 npm 来源的条目：确保 `dist-tags.latest` 在 `versions` 里（补 `publishTimestamp`，新版本从 manifest 取 `engines.dsh`），并校正已列版本的发布时间；已有版本不会被删。发版后 `.github/workflows/market-index.yml` 在 release published、每日 06:00（Asia/Shanghai）或手动 dispatch 时自动跑，只在文件变化时提交（需要 Actions 写权限；`main` 有分支保护时改成开 PR）。

## 加条目

`format: 1`，必填字段按 DSH 校验器：

- 根：`format`、`title`（对象必须含 `en`）、`plugins`；`metadata.categories` 里声明了分类才能被条目引用；
- 条目：`name`（npm 包名）、`versions`（非空）；可选 `title` / `description` / `author` / `homepage` / `repository` / `icon` / `metadata.category|keywords`；
- 版本：`version`（精确 SemVer）、`publishTimestamp`（Unix 秒）、`source`（`{type:'npm'}` 或 `{type:'git',url,commit,path?}`）、`engines.dsh`（可选 SemVer range）。

规则要点：`homepage` 允许 http(s) 绝对 URL，`#readme` 这类 fragment 会保留；`repository.url` 必须是规范 URL；`icon` 可用绝对 https 或相对索引 URL 的路径；条目 `name` 不能重复。

## DSH 侧行为备忘

- 条目页正文（详细介绍）与「主页」无关：正文按 `locale/<语言>.json` 的 `meta.detail` → 发布包 README → 仓库默认分支 README 顺序读取并本地渲染，不嵌入 GitHub 页面。
- 「主页」只来自索引 `homepage`，缺省时整行不显示（不会回退到仓库地址）。
- 市场没有官方索引，全部来自用户添加的索引源；条目页的「源代码」来自索引 `repository`。
- `link:` 本地安装的插件被官方插件管理判为 not-updatable，属预期。

## 校验

索引改动后用 DSH 自带的 `parseMarketIndex`（`@deepseek-ai/dsh-plugin-market-index`）预检；它不在本仓库依赖里，可以临时解包 DSH 的 `app.asar` 调用，或先靠脚本 + 人工核对字段。`npm run market:index:check` 只能发现版本过期，不做格式校验。
