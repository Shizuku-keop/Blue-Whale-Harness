# Blue-Whale-Harness 目录维护手册

本仓库是 **DSH（DeepSeek Harness）社区插件目录** 的权威源。本文件记录我们（人类 + AI 助手）长期维护它的方式，供任何维护者（包括 opencode 等其他 AI 代理）照做。

> 一句话原则：**合并社区 PR 只是第一步；真正的生效，是把改动同步进 `intents.json` 并重生站点。**

---

## 1. 两个仓库与分工

| 仓库 | 分支 | 作用 |
|---|---|---|
| `leenkcool/Blue-Whale-Harness`（本地 `/d/github/Blue-Whale-Harness`） | `main` | 数据源与生成脚本所在地 |
| `leenkcool/leenkcool.github.io`（本地 `/d/github/leenkcool.github.io`） | `master` | 线上站点（GitHub Pages），只放 4 个生成产物 |

## 2. 数据源层级（最关键）

- **`catalog/intents.json` = 权威数据源**。对象结构，以 `repo`（如 `owner/name`）为 key，每条含 `intentZh`/`intentEn`/`dshCategory`/`isDshPlugin`/`dshSignals`/`language`/`stars`/`topics` 等。站点（`index.html` / `plugins.zh.html` / `plugins.en.html` / `plugins.csv`）与 `README.md` **全部由脚本从它生成**。
- **`repos.json` = 中间收录表**（数组）。社区 PR 经常只改它，但它**不直接喂站点**。维护时把它和 `intents.json` 一起对齐即可。
- **`repos.txt` = 裸仓库列表**，管线**不读取**，只是社区顺手改的便利文件。PR 若改了它，必须手动同步到 `repos.json` + `intents.json`，否则站点不更新。
- **`README.md` = 生成物**（由 `build-readme.mjs` 从 `intents.json` 生成）。PR 若直接改 README 文案/描述，**必须反向同步进 `intents.json` 的 `intentZh`/`intentEn`**，否则下次重生会被覆盖回退。

生成命令：
```bash
cd /d/github/Blue-Whale-Harness/catalog
node generate.mjs      # 生成 index.html / plugins.zh.html / plugins.en.html / plugins.csv + 对应 .md
node build-readme.mjs  # 由 intents.json 重生 ../README.md（分类索引，截断 90 字）
```

## 3. 认证与推送（必读）

- 写令牌在 `/d/github/Blue-Whale-Harness/.gh_token`（已被 `.gitignore`，**不在版本库**），是 classic PAT（`ghp_` 开头，repo scope）。读取：`TOKEN=$(tr -d '[:space:]' < /d/github/Blue-Whale-Harness/.gh_token)`。
- **Windows 推送必须绕过 credential helper**（否则它用缓存凭证覆盖 URL 里的 token → 403）：
  ```bash
  GIT_CREDENTIAL_HELPER= git -c credential.helper= -c credential.https://github.com.helper= \
    push "https://leenkcool:$TOKEN@github.com/leenkcool/<repo>.git" <branch>
  ```
- GitHub API 用 `Authorization: token $TOKEN` 头（或 `Bearer`，classic PAT 两者皆可）。涉及网络抓取时工具需有网络权限。

## 4. 处理一个社区 PR 的标准流程

### 4.1 列出开放 PR
```bash
TOKEN=$(tr -d '[:space:]' < /d/github/Blue-Whale-Harness/.gh_token)
curl -s -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/leenkcool/Blue-Whale-Harness/pulls?state=open&per_page=100" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{JSON.parse(d).forEach(p=>console.log(p.number+"|"+p.title+"|"+p.user.login+"|draft:"+p.draft))})'
```

### 4.2 看内容（body + 改动文件 + diff）
```bash
curl -s -H "Authorization: token $TOKEN" "https://api.github.com/repos/leenkcool/Blue-Whale-Harness/pulls/<N>"   # title/body/head.sha
curl -s -H "Authorization: token $TOKEN" "https://api.github.com/repos/leenkcool/Blue-Whale-Harness/pulls/<N>/files?per_page=50"
curl -s -H "Authorization: token $TOKEN" "https://api.github.com/repos/leenkcool/Blue-Whale-Harness/pulls/<N>" -H "Accept: application/vnd.github.v3.diff"
```
判断：新增插件（编辑 `repos.json` / `repos.txt` 加条目）还是更新已有（改描述）。

### 4.3 合并（保留联合作者身份 —— 硬性要求）
每个社区 PR 的合并 commit **必须带 `Co-authored-by: <login> <login@users.noreply.github.com>` trailer**，贡献者才会进入 GitHub 贡献图。no-reply 邮箱会自动关联账号，无需真实邮箱。

- **优先用 API 合并**（推荐，自动标 Merged）：
  ```bash
  curl -s -X PUT -H "Authorization: token $TOKEN" -H "Content-Type: application/json" \
    -d "{\"commit_title\":\"Merge PR #<N>: <标题>\",\"commit_message\":\"Merge PR #<N>: <标题>\n\nCo-authored-by: $login <$login@users.noreply.github.com>\",\"merge_method\":\"merge\",\"sha\":\"<head.sha>\"}" \
    "https://api.github.com/repos/leenkcool/Blue-Whale-Harness/pulls/<N>/merge"
  ```
  若返回 `Head branch was modified`，重新取最新 head.sha 再合并。
- **draft PR 无法用 API 合并**（报 still a draft）。改用本地 no-ff：
  ```bash
  cd /d/github/Blue-Whale-Harness
  GIT_CREDENTIAL_HELPER= git -c credential.helper= -c credential.https://github.com.helper= \
    fetch "https://leenkcool:$TOKEN@github.com/leenkcool/Blue-Whale-Harness.git" "pull/<N>/head:pr<N>"
  git -c user.name=leenkcool -c user.email=leenkcool@users.noreply.github.com merge --no-ff pr<N> \
    -m "Merge PR #<N>: <标题>

  Co-authored-by: $login <$login@users.noreply.github.com>"
  ```
  一旦 PR 的 head 成为 main 的祖先，GitHub 仍会标记为 Merged。

### 4.4 多 PR 冲突的处理（常见坑）
多个 PR 都往 `repos.txt` / `repos.json` 的 EOF 追加时，本地合并会冲突。做法：
- **取并集 + 去重**：保留所有新增行/条目，删掉重复项（重复常来自 PR 作者手滑，如把同一仓库加两次）。
- 当一个 PR **分支自旧 main**、其 `repos.json` 含你**已经删除**的旧条目（例如被重定向的仓库别名 `reshuibuduo/tmcra-deepseek-harness-memory`），**不要回加**。技巧：分别取 `git show HEAD:repos.json` 与 `git show pr<N>:repos.json` 的干净版本，用脚本把 PR 有而 HEAD 没有、且不在“已删除清单”里的条目并入 HEAD，再写回。
- 冲突的 `repos.json` 若手工解易错，可程序化：解析两侧 JSON，按 `repo` 求差集后 `concat` 写回（记得 `JSON.parse` 校验）。

### 4.5 把改进同步进 `intents.json`（核心，不可省）
合并完 PR 后，用一次性 Node 脚本把改动写进权威源：
- **新增插件**（intents 里 MISSING）：整条插入，字段模板：
  ```js
  {
    repo, lists:["plugin"], dshCategory:<category>, isDshPlugin:true,
    dshSignals:["readme-mentions-dsh"], manifestType:"none",
    language, intent:<en>, intentEn:<en>, intentZh:<zh>,
    zhSource:"native", enSource:"native", needsReview:false,
    techStack:[<language>], keyDeps:[], entry:null,
    stars, forks:0, created_at:"YYYY-MM-DD", updated_at:"YYYY-MM-DD",
    license, open_issues:0, topics:[...], cloned:false, compat:"unknown",
    featured:false, analyzed_at:new Date().toISOString()
  }
  ```
  PR 给的 `desc_en` → `intentEn`，`desc_zh` → `intentZh`，同时设 `intent = intentEn`。`dshCategory` 用 PR 给的（llm/skin/tools/ui/utility/session 等）。
- **更新已有插件**（如改描述）：只改 `intentZh`/`intentEn`/`intent` 等字段。
- 脚本用 `JSON.stringify(obj, null, 2) + "\n"` 写回。写完删除临时脚本（别提交）。

### 4.6 重生站点 + 验证
```bash
cd /d/github/Blue-Whale-Harness/catalog
node generate.mjs
node build-readme.mjs
# 校验：新仓库名/关键文案在产物里 grep -c 都 ≥ 1
```

### 4.7 提交 + 推送两个仓库
```bash
set -e; TOKEN=$(tr -d '[:space:]' < /d/github/Blue-Whale-Harness/.gh_token)
cd /d/github/Blue-Whale-Harness
git add -A
git status -s | grep -iE "Plugins/|plugins\.(csv|html|md)|index\.html|\.gh_token|intents\.backup" && echo LEAK || echo OK  # 必须 OK
git -c user.name=leenkcool -c user.email=leenkcool@users.noreply.github.com commit -q -m "Sync PR #<N> <内容> to authoritative intents.json

Co-authored-by: $login <$login@users.noreply.github.com>"
GIT_CREDENTIAL_HELPER= git -c credential.helper= -c credential.https://github.com.helper= \
  push "https://leenkcool:$TOKEN@github.com/leenkcool/Blue-Whale-Harness.git" main

cd /d/github/leenkcool.github.io
cp /d/github/Blue-Whale-Harness/catalog/{index.html,plugins.zh.html,plugins.en.html,plugins.csv} .
git add -A
git -c user.name=leenkcool -c user.email=leenkcool@users.noreply.github.com commit -q -m "Sync PR #<N> ..."
GIT_CREDENTIAL_HELPER= git -c credential.helper= -c credential.https://github.com.helper= \
  push "https://leenkcool:$TOKEN@github.com/leenkcool/leenkcool.github.io.git" master
```
- **同步 intents 的 commit 也必须带 `Co-authored-by`**（复用 4.3 的 `$login`）。
- 推送前**必做泄漏检查**（见 `git status` 那行）。

### 4.8 验证线上
```bash
sleep 25   # GitHub Pages 重建延迟
curl -s https://leenkcool.github.io/plugins.zh.html | grep -c "<repo>"
curl -sI https://leenkcool.github.io/ | grep -iE "HTTP/1.1 200"
curl -s -H "Authorization: token $TOKEN" "https://api.github.com/repos/leenkcool/Blue-Whale-Harness/pulls/<N>"  # state:closed merged:true
```
若仓库名 grep 不到但描述文案能命中，通常是 Pages 缓存，再等一会重试。

## 5. 批量处理多个 PR
- 一次来多个 PR 时：ff 本地 main → 逐个 `git fetch pull/<N>/head:pr<N>` → 逐个 `--no-ff` 合并（带 Co-authored-by），冲突按 4.4 取并集 → 统一用一个脚本把全部新增/更新写进 `intents.json` → 重生 → 双仓推送（一个同步 commit 里把所有贡献者都列进 `Co-authored-by`）。
- 人类可能指定“某 PR 先不动”（如 #28 是关于新增 GitHub 工作流的 PR，长期被要求保留 open）。遇到明确豁免的 PR，跳过它，其余照常处理。

## 6. 反模式（绝对别做）
- ❌ 只合并 PR 就完事（线上不生效，下次重生还要回退）。
- ❌ 漏 `Co-authored-by`：每个社区 PR 的合并 commit **和** 同步 intents 的 commit 都必须带。
- ❌ 把 `Plugins/`、生成产物（`index.html`/`plugins.*`/`risk-report*`）、`.gh_token` 提交进仓库。
- ❌ 重跑 `catalog/analyze.mjs`——它会用 `repos.json` 重建全量条目，把人工 native 直译覆盖成机翻。
- ❌ 把 token 写进任何仓库文件或 `.git/config`。

## 7. 安全
- classic PAT 一旦在对话/日志里暴露，建议到 GitHub 后台 revoke 并轮换。
- 本地残留的 `pr<N>` 分支（合并时建的）无害，可定期 `git branch -D pr<N>` 清理。

## 8. 历史回看（目录规模演进）
1808（初始）→ 1790（清死库/去重）→ 1795 → 1797 → 1798 → 1803 → 1809 → 1811（截至最近一次维护）。每次数字变化都来自“新增收录 − 删除重定向/重复/死库”。
