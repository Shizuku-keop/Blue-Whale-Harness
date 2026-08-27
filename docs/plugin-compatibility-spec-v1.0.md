# Blue-Whale-Harness 插件兼容性规范 v1.0

> 适用于 DeepSeek Harness（DSH）插件目录 [Blue-Whale-Harness](https://github.com/leenkcool/Blue-Whale-Harness) 的**新插件收录**与**存量校验**。
> 配套自动化：`check-compat.mjs`（同目录）；配套核查结果：`插件兼容性核查报告.md`。
> 版本基线：dsh `0.1.1-rc.2`（2026-08-27 实测）。

---

## 一、目的与适用范围

1. **统一兼容性口径**：让目录中每个插件的 `compat` 字段含义唯一、可机器校验、可被用户理解。
2. **标准化收录流程**：从"提交 → 机器核查 → 人工复核 → 收录"四步，任何人可照做。
3. **把已知坑写进规则**：npm 子包 dist-tags 错配、运行时旧版本线双拷贝、同名包冲突、`@deepseek-ai/*` 作用域仿冒、AV 标记等，均在收录时拦截。
4. 适用范围：`catalog/intents.json` 中所有条目；新条目经 `catalog-intake` Issue 或 PR 进入。

---

## 二、术语

| 术语 | 定义 |
|---|---|
| **dsh 版本线** | 官方包共用发布序列：`0.0.1-rc.1 → rc.2 → rc.3 → rc.5 → 0.1.0-rc.2 → rc.3 → rc.6 → rc.7 → rc.8 → 0.1.1-rc.1 → rc.2`（当前） |
| **cordis.patch.yml** | DSH 插件的挂载清单（bundle patch），声明 `- insert: - id/name/config` 行；安装后并入 profile 的插件栈 |
| **@deepseek-ai/* 依赖** | 官方作用域包（dsh、dsh-base、dsh-tools、dsh-session、dsh-llm、dsh-client-* 等）。**声明依赖 ≠ 声明了兼容版本，必须看范围** |
| **runtime-injected** | web 客户端插件合法形态：不声明任何 @deepseek-ai 依赖，客户端运行时注入（如 `dsh-compat-guard`、`dsh-mermaid`）。**不得据此判不兼容** |
| **双拷贝风险** | 插件把旧版本线（如 `0.1.0-rc.6` 精确版）的官方包放进 dependencies，与宿主 0.1.1-rc.2 形成两份拷贝 → unique-symbol 失效（`undefined.prepare` 家族报错） |
| **preset / skill / 集成** | 非插件形态：预设=纯配置仓库；技能=SKILL.md 资源；集成=桌面端/外部工具。**收录时与插件分开标注，不占 plugin 列表** |

---

## 三、兼容性分级（compat 字段词汇表）

`compat` 字段取值必须是以下之一，机器可校验：

| 值 | 含义 | 判定规则（全部满足才可写） |
|---|---|---|
| **版本串**，如 `0.1.0-rc.6+` | 声明范围的最低版本线起均兼容（含当前线） | `cordis.patch.yml` 存在 + peer/dev 范围内有解析结果且覆盖当前线 + 最低 ≥ 0.1.0-rc.6。也可写维护者实测的具体范围（如 `0.1.0-rc.7 \|\| 0.1.1-rc.1 \|\| 0.1.1-rc.2`） |
| `ok` | 维护者实测可用（无版本串时用） | 维护者在本机 dsh 实测安装+冒烟通过，记录于备注 |
| `unknown` | 无法核实 | 不满足以上任何条件；**新收录默认 unknown，禁止跳过核查直接写 ok** |
| `not-a-plugin` | 非 DSH 插件（集成/桌面/内容） | catalog isDshPlugin=false 或判定无插件形态 |
| `old-line` | 仅兼容旧版本线，当前线有风险 | 运行时 dependencies 钉死范围不含当前线 |
| `av-flagged` | 有 AV 告警待复核 | risk-360 有记录，人工复核通过前不得转其他值 |

**配套字段**（建议随 compat 一并记录）：`compatEvidence`（证据链，如 `peer:@deepseek-ai/dsh-client-ui-primitives@^0.1.0-rc.6||^0.1.1-rc.1`）、`compatCheckedAt`（核查日期）、`compatChecker`（核查方式：auto/manual）。

---

## 四、版本范围写法规范

### 4.1 范围语义表（插件声明 @deepseek-ai/* 依赖时必须）

| 写法 | 实际语义 | 当前线 0.1.1-rc.2 是否满足 | 判定 |
|---|---|---|---|
| `^0.1.0-rc.6` | `>=0.1.0-rc.6 <0.2.0` | ✅ | **推荐** |
| `^0.1.0-rc.8` | `>=0.1.0-rc.8 <0.2.0` | ✅ | 推荐（要求 rc.8+） |
| `>=0.1.0-rc.6 <0.2.0` / `<0.3.0-0` | 显式区间 | ✅ | 推荐 |
| `0.1.1-rc.2`（精确=当前） | 仅当前版 | ✅ | 可用（peer 中） |
| `0.1.1-rc.1`（精确=非当前） | 仅旧版 | ❌ | 运行时依赖中=双拷贝风险 |
| `0.1.0-rc.6`（精确） | 仅旧版 | ❌ | 运行时依赖中=双拷贝风险 |
| `^0.0.1-rc.1` / `^0.0.1-rc.5` | 0.0.1 旧线 | ❌ | 禁止（旧 API，未迁移） |
| `latest` / `*` / 裸包名 | 跟随 dist-tag | ⚠️ | **禁止**（见 4.3） |
| `workspace:^` / `file:` / git URL | 非 registry | — | 仅限官方 monorepo 内；发布前必须改为 registry 范围 |

### 4.2 依赖位置规范

| 位置 | 用途 | 规范 |
|---|---|---|
| `peerDependencies` | 声明与宿主共享的官方包 | ✅ 首选位置；范围覆盖当前线（`^0.1.0-rc.6` 及以上） |
| `dependencies` | 插件自带的运行时依赖 | ⚠️ 官方 `@deepseek-ai/*` **禁止放这里**（双拷贝风险）；第三方包可放 |
| `devDependencies` | 构建/测试 | ✅ 可钉精确版（仅构建期，不影响运行时） |

### 4.3 npm dist-tags 陷阱（官方 bug，必须规避）

实测所有 `@deepseek-ai/*` 子包的 `dist-tags.latest` 错误指向 `0.0.1-rc.1`。因此：

- **插件不得**用 `latest`、裸版本、`*` 声明官方依赖；
- **用户侧**：安装插件请用 `dsh plugin --profile <p> add <pkg>@<版本>` 显式版本，或 `@deepseek-ai/dsh@0.1.1-rc.2` 主入口安装；
- **目录侧**：核查时以声明范围解析为准，**不以 dist-tag 判断版本**。

---

## 五、录入流程（Intake Workflow）

```
提交（Issue/PR）→ 机器核查（check-compat.mjs --repo）→ 人工复核（清单 §6）→ 收录写库（§7）
```

### 5.1 提交

沿用现有 `catalog-intake.yml` 模板，新增必填字段：

```yaml
- type: input
  id: compat_range
  attributes:
    label: 兼容的 dsh 版本范围（compat）
    description: 从 package.json 的 peerDependencies 抄，如 ^0.1.0-rc.6；不确定填「不确定」
  validations: { required: false }
- type: dropdown
  id: plugin_shape
  attributes:
    label: 插件形态
    options: [真插件（cordis.patch.yml）, 预设/配置, 技能(SKILL), 桌面端/集成, 不确定]
```

### 5.2 机器核查（必做）

```bash
# 克隆后用单仓模式核查（离线，仅 Node 内置模块）
node check-compat.mjs --repo owner/name --dir <克隆根>
```

脚本输出：level（A/B/C/D）、compatLabel 建议值、manifest 结构校验、范围解析证据、错误列表。

### 5.3 人工复核（机器判 B/C/D 时必须）

见 §6 清单；机器判 A 的仍需抽查 entry 指向文件是否存在（`main`/`exports` 落地）。

### 5.4 收录写库

按 §7 写入 `catalog/intents.json`（或 `repos.json`），`compat` 取 §3 词汇，随后重跑 `analyze.mjs` + `generate.mjs` 重生成站点。

---

## 六、人工复核清单（Checklist）

### A. 插件形态与入口
- [ ] 根目录（或声明的子目录）存在 `cordis.patch.yml`，且是 `- insert:` 列表结构
- [ ] `package.json` 的 `main`/`exports` 指向真实存在的文件（`lib/index.js`、`src/index.ts` 等）
- [ ] `name` 唯一（§6.2 冲突检查）、`type: module`、`engines.node` 明确

### B. 版本兼容
- [ ] 官方 `@deepseek-ai/*` 只在 peer/dev 声明，范围覆盖当前线（§4.1 语义表）
- [ ] `dependencies` 中无官方包（或有但范围覆盖当前线）
- [ ] 无 `latest`/裸版本声明
- [ ] 与 `@deepseek-ai/dsh@0.1.1-rc.2` 主安装树兼容（可用 `npm ls @deepseek-ai/dsh-tools` 验证单拷贝）

### C. 命名与供应链安全
- [ ] 包名不在既有 74 组冲突名单中（`compat-summary.json → nameCollisions`）
- [ ] **不使用 `@deepseek-ai/*` 作用域**（官方保留；社区用 `@<作者>/dsh-*` 或裸名 `dsh-*`）
- [ ] 不在 risk-360 AV 名单，或已人工复核并说明
- [ ] 无凭据硬编码（API Key 等）；权限遵循最小化

### D. 平台与运行时
- [ ] 标注支持平台（win/mac/linux/wsl/移动端）与运行时（Node 版本、Python/Rust 外部依赖）
- [ ] 非 JS 运行时的技能/工具类注明前置安装要求

### E. 文档
- [ ] README 含安装方式（`dsh plugin add` 或 cordis.patch.yml 挂载行）、配置项、卸载方式

---

## 七、intents.json 字段扩展建议

在现有 `compat`（保留）之外新增：

```jsonc
{
  "compat": "0.1.0-rc.6+",          // §3 词汇表
  "compatEvidence": ["peer:@deepseek-ai/dsh-client-ui-primitives@^0.1.0-rc.6||^0.1.1-rc.1"],
  "compatCheckedAt": "2026-08-27",
  "compatChecker": "auto",          // auto | manual
  "platform": ["win", "mac", "linux"],  // 可选
  "runtime": "node>=20",            // 可选
  "riskFlags": []                   // ["av","old-line","scope-squat","name-collision"]
}
```

`plugins.csv` 渲染时新增列：`compat`（已有）、`platform`、`runtime`、`riskFlags`。

---

## 八、自动化与持续维护

1. **`check-compat.mjs`**（本目录 `catalog/check-compat.mjs`）：
   - 批量：`--dir <clones-root>` → 产出 `catalog/compat-suggestions.json`（含建议 compat 值）；
   - 单仓：`--repo owner/name --dir <clones-root>` → 录入核查报告；
   - **合并闸门**：`--gate --repo owner/name --dir <clones-root> [--list plugin|watch] [--risk360 <path>]` → 硬性项评估，通过退出 0 / 未通过退出 1；
   - 版本线变更：更新文件顶部 `CURRENT` / `TRAIN` 常量后重跑。
2. **CI 合并闸门（本目录已交付，规范附录 A 落地）**：
   - 文件：`.github/workflows/catalog-intake-check.yml` + `ci/find-new-repos.mjs` + `ci/run-intake-gate.mjs`（配合 `catalog/check-compat.mjs`）；
   - 行为：收录 PR（改动 `repos.txt` / `repos.json` / `catalog/**`）自动触发 → 提取新增仓库 → 浅克隆 → `runGate` 硬性项评估（manifest 结构、档位门槛 A/B、latest/裸版本、@deepseek-ai 作用域、入口文件、AV 名单）→ step summary + PR 评论表格 → 任一未过退出 1；
   - 启用：把 4 个文件复制进仓库，主分支保护把 `intake-check` 设为 required status check；手动核查可用 workflow_dispatch 填 `owner/name`；
   - 部署与自测步骤见交付包 `README.md`。
3. **定期全量重扫**：每次 dsh 发布新版本线后，重跑批量模式并 diff `compat-suggestions.json`，把 A/B 变化同步回目录。

---

## 附录 A：收录 PR 检查单（机器侧硬性项）

| # | 检查项 | 硬性？ |
|---|---|---|
| 1 | `cordis.patch.yml` 结构合法（真插件时） | ✅ |
| 2 | 官方依赖仅 peer/dev，范围覆盖当前线 | ✅（old-line 一律打回） |
| 3 | 无 `latest`/裸版本 | ✅ |
| 4 | 包名不在冲突名单 | ✅ |
| 5 | 非 `@deepseek-ai/*` 作用域 | ✅ |
| 6 | 不在 AV 名单（或附人工复核说明） | ✅ |
| 7 | engines.node 与 README 安装说明一致 | ⭕ 建议 |
| 8 | entry 文件存在 | ⭕ 建议 |

## 附录 B：与《插件开发规范 v1.0》的分工

- **开发规范**（仓库内 `PLUGIN-DEVELOPMENT-GUIDE-1.0.md`）面向**作者**：怎么写一个 dsh 插件（API、事件、安全、测试）。
- **本规范**面向**目录维护者/收录审核**：怎么判定一个插件是否兼容、兼容到什么版本、如何防坑。
- 两者衔接点：开发规范 §12 发布规范应补充"peer 范围写法"（§4.1 本规范）与"禁止 @deepseek-ai 作用域"。

---

*本规范 v1.0 基于 2026-08-27 全量核查（1913 仓库）与官方 npm 版本实测制定；版本线变化时先更新 §2 术语与 §4.1 语义表再发布 v1.1。*
