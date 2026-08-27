# Blue-Whale-Harness 插件兼容性核查报告

**核查对象**：[leenkcool/Blue-Whale-Harness](https://github.com/leenkcool/Blue-Whale-Harness) 目录全量 1913 个仓库
**核查时间**：2026-08-27
**判定基线版本**：`@deepseek-ai/dsh@0.1.1-rc.2`（npm latest，当前发布线）
**报告配套数据**：`compat-verdicts.json`（逐仓库判定全量）、`compat-fill.csv`（可回写目录的合并表）、`compat-summary.json` / `compat-stats.json`（聚合）、`npm-versions.json`（官方包版本实测）、`compat-raw.json`（逐仓库原始抓取）

---

## 一、核查范围与方法

### 1.1 数据基线

| 数据源 | 说明 |
|---|---|
| `catalog/intents.json`（1913 条） | 目录权威数据源：每仓库的 manifestType、dshSignals（@deepseek-ai/* 依赖名）、分类、star、isDshPlugin 等 |
| 实时抓取（本次） | 经 jsDelivr 对全部 1913 仓库抓取根 `package.json`（命中 1636 个）与 `cordis.patch.yml`（命中 1201 个），提取真实版本范围 |
| npm registry（本次） | 21 个官方 `@deepseek-ai/*` 包完整版本列表 + dist-tags |
| `catalog/risk-360.json` | 既有 AV 标记 6 个仓库 |
| `catalog/risk-scan.json` | 既有启发式扫描 293 个仓库 |

### 1.2 判定模型

对每个仓库输出四档判定（level）+ 建议 compat 值（compatLabel）+ 证据链（evidence）：

| 档位 | 含义 | 判定依据（优先级从高到低） |
|---|---|---|
| **A 已确认兼容** | 有 DSH 插件形态，且声明的 @deepseek-ai 版本范围覆盖当前线 `0.1.1-rc.2`（最低 ≥ `0.1.0-rc.6`）；或维护者已实测 | `cordis.patch.yml` 存在 + peer/dev 范围解析后覆盖当前线；维护者 compat 为版本串 |
| **B 基本兼容** | 有 DSH 插件形态，但版本证据不完整；或依赖 web 运行时注入（无 @deepseek-ai 依赖是正常形态） | `cordis.patch.yml` + 有 @deepseek-ai 依赖但范围未解析到覆盖；或 `cordis.patch.yml` 无依赖（runtime-injected）；或仅有 @deepseek-ai 依赖无 manifest |
| **C 无法核实** | 根目录无 manifest/依赖证据，无法静态判定 | 根 `package.json`/`cordis.patch.yml` 均缺失（monorepo 子目录 / 预设 / 技能 / 内容仓库），需人工复核 |
| **D 有风险 / 非插件** | 运行时依赖钉死旧版本线（双拷贝风险）、非 JS 运行时、AV 标记、或根本非 DSH 插件 | 见 4.4 明细 |

版本范围解析支持 `exact`、`^`、`~`、`>=a <b`、`||` 联合、`*` 等 npm 语义，并区分 **dependencies（运行时）** 与 peer/dev（构建期）——只有运行时钉死旧线才判 D，peer/dev 旧钉仅降为 B 提示。

### 1.3 官方版本线（npm 实测）

所有官方包共用同一发布序列（实测 `@deepseek-ai/dsh`、`dsh-base`、`dsh-tools`、`dsh-session`、`dsh-llm`、`dsh-client-*`、`dsh-tool-*` 等 21 包逐一确认）：

```
0.0.1-rc.1 → 0.0.1-rc.2 → 0.0.1-rc.3 → 0.0.1-rc.5 → 0.1.0-rc.2 → 0.1.0-rc.3
→ 0.1.0-rc.6 → 0.1.0-rc.7 → 0.1.0-rc.8 → 0.1.1-rc.1 → 0.1.1-rc.2（当前）
```

- `@deepseek-ai/cordis`：`4.0.1`（另有 4.0.1-rc.1 / 4.0.1-rc.4）
- `@deepseek-ai/schemastery`：`3.18.1`
- 注：`0.0.1-rc.4`、`0.1.0-rc.4/rc.5` 不存在。
- `@deepseek-ai/dsh@0.1.1-rc.2` 把全部子包声明为 **dependencies `^0.1.1-rc.2`**（非 peer）——当前 dsh 安装树是自洽单拷贝。

---

## 二、总体结论

### 2.1 全量 1913 仓库分档

| 档位 | 数量 | 占比 | 说明 |
|---|---|---|---|
| **A 已确认兼容** | **447** | 23.4% | 443 个由版本范围自动推导 + 4 个维护者实测 |
| **B 基本兼容** | **936** | 48.9% | 含 255 个 runtime-injected web 插件、249 个 cordis+依赖声明、82 个仅依赖声明等 |
| **C 无法核实** | **314** | 16.4% | 217 个根目录无证据（多为 monorepo/内容仓库）、42 个桌面端、18 个列表/市场等 |
| **D 有风险 / 非插件** | **216** | 11.3% | 128 非插件、75 非 JS 运行时、11 运行时旧版本线、2 AV 标记 |

> **可直接判定为"有兼容性证据"的仓库 = A + B = 1383 个（72.3%）**；
> **判定为"当前 dsh 0.1.1-rc.2 可运行"（A + B 且范围覆盖当前线）= 715 个**。

### 2.2 目录两个列表的分档

| 列表 | 总数 | A | B | C | D | A+B 占比 |
|---|---|---|---|---|---|---|
| plugin（真插件列表） | 1301 | 341 | 717 | 182 | 61 | **81.3%** |
| watch（观察/相关仓库） | 611 | 106 | 218 | 132 | 155 | 53.0% |

### 2.3 与现状的差距

目录 `intents.json` 的 `compat` 字段当前：**1900 个 `unknown`、2 个空、6 个版本串、5 个 `ok`**——即 1913 个仓库中仅 11 个有有效版本信息。本次核查为其中 **1383 个**给出可写回的建议值（见 `compat-fill.csv` 的 `level`/`compatLabel` 列）。

---

## 三、分类统计

| 分类 | 总数 | A | B | C | D |
|---|---|---|---|---|---|
| tools | 603 | 145 | 312 | 92 | 54 |
| utility | 363 | 74 | 147 | 92 | 50 |
| session | 234 | 68 | 128 | 20 | 18 |
| ui | 203 | 44 | 116 | 35 | 8 |
| orchestration | 200 | 42 | 79 | 26 | 53 |
| llm | 165 | 48 | 85 | 20 | 12 |
| acp | 65 | 14 | 31 | 18 | 2 |
| skills | 53 | 7 | 21 | 8 | 17 |
| sandbox | 11 | 2 | 6 | 1 | 2 |
| skin | 8 | 2 | 6 | 0 | 0 |
| memory | 4 | 1 | 2 | 1 | 0 |
| preset | 2 | 0 | 2 | 0 | 0 |
| notify / uncategorized | 2 | 0 | 1 | 1 | 0 |

---

## 四、关键发现

### 4.1 ⚠️ npm 子包 dist-tags 错配（官方 bug，影响面最大）

实测 21 个官方包中，除 `@deepseek-ai/dsh`（latest=`0.1.1-rc.2`）外，**几乎所有子包的 `dist-tags.latest` 都错误指向 `0.0.1-rc.1`**（`dsh-agent-loop` 指向 `0.1.0-rc.6`、`dsh-terminal-bash` 指向 `0.0.1-rc.3`），尽管 `0.1.1-rc.2` 版本均存在。

**后果**：任何 `npm i @deepseek-ai/dsh-tools`（不带版本）或依赖 `latest` 的安装都会拿到 0.0.1 旧线，与 collect.md 记载的 ralph 包版本不一致问题（#1677 同源）一致。**插件声明 `peerDependencies ^0.1.0-rc.x` 不受影响（随 dsh 主安装解析到 0.1.1-rc.2）**；受影响的是独立安装子包的用户。

**规范要求**（详见《插件兼容性规范》§4.3）：插件必须用显式范围（`^0.1.0-rc.6` 或 `>=0.1.0-rc.6 <0.2.0`）声明依赖，禁用 `latest`/裸版本。

### 4.2 ⚠️ 11 个插件运行时依赖钉死旧版本线（双拷贝/API 错配风险）

以下仓库把 `@deepseek-ai/*` 放在 **dependencies** 且范围**不含当前线**（多为精确钉死），在 dsh 0.1.1-rc.2 环境安装会形成第二份包拷贝 → 触发 collect.md 记载的 unique-symbol 失效（`Cannot read properties of undefined (reading 'prepare')` 家族）风险：

| 仓库 | 钉死的运行时依赖 |
|---|---|
| BiBoyang/dsh-im-bridge | `dsh-agent/jobs/llm/scope/session/timeout/user-approval @0.0.1-rc.1/rc.3` |
| BiBoyang/dsh-eval-harness | `dsh-llm/scope/session/timeout/tools @0.0.1-rc.1` |
| Suxeca/dsh-plugin | `dsh-tools @0.0.1-rc.1` |
| Lum1104/dsh-browser | `@deepseek-ai/dsh @0.1.1-rc.1`（精确钉死非当前版） |
| Axiaohungry/dsh-llm-codebuddy | `dsh-credentials/launch-environment/llm/llm-pi-ai/settings @0.1.0-rc.6` |
| zjzqs/dsh-client-ui-voice-input | `dsh-llm @0.1.0-rc.6` |
| krislavten/ai-sdk-provider-dsh | 19 个子包全部 `@0.1.0-rc.6` 精确钉死 |
| kevenxz/dsh-desktop / xiangshangya/deepseek-harness-desktop / AlliotTech/deepseek-harness-docker | `@deepseek-ai/dsh @0.1.0-rc.6` |
| cyanseek/dsh-native-playbook | `dsh-tool-session-query @0.1.0-rc.6` |

（完整清单见 `compat-stats.json → oldLine`。）另有 17 个仓库 peer/dev 旧钉（构建期约束，不判 D，但建议作者升级）。

### 4.3 74 组 npm 包名冲突

同名 npm 包由多个不同仓库发布/声明，安装时可能互相覆盖。典型：

- **`dsh-archived-sessions`**：Zephyr-vibe（0.1.5，web profile 实际使用的版本）与 hashdiana（0.1.0）——同名不同源；
- `dsh-desktop`（29 个 fork/包装）、`deepseek-harness-desktop`（9）、`dsh-plugins`（9）、`dsh-mcp-manager`（4）、`dsh-memory`（4）、`dsh-browser`（4）等；
- 注：`@deepseek-ai/dsh-root` 的 9 个同名是官方 monorepo 的 fork 根包，非插件冲突。

（完整清单见 `compat-summary.json → nameCollisions`。）

### 4.4 69 个仓库以官方作用域 `@deepseek-ai/*` 发布社区包

如 `@deepseek-ai/dsh-tool-csv`、`@deepseek-ai/dsh-trace`、`@deepseek-ai/dsh-ultra-ui`、`@deepseek-ai/dsh-ex-setting`、`@deepseek-ai/dsh-sandbox-*` 等。这些包**不在官方版本线上**（0.0.1/0.0.2/0.1.0 独立版本），用户极易误认为官方出品——供应链仿冒风险。规范要求新录入插件**禁止使用 `@deepseek-ai/*` 作用域**（§6.2）。

### 4.5 AV 标记 6 个仓库（risk-360）

| 仓库 | 严重度 | 告警数 | 说明 |
|---|---|---|---|
| dhicoc/dsh-reverse-skill | critical | 23 | 渗透测试技能集（webshell/免杀 payload 参考文件），内容本身是红队资料 |
| foryourhealth111-pixel/Vibe-Skills | high | 1 | 单文件 Trojan.Generic |
| coding-chimera/chimera / paean-ai/deeptide / wink-run/dsh-plugin-store / wink-run/tokenbank | medium | 各 1 | 单文件告警，多为误报级 |

规范要求：**AV 告警仓库必须人工复核后再上架**，目录需保留 `risk-360` 记录（§6.3）。

### 4.6 C 档 314 个待人工复核（重点）

- **217 个"plugin?"**：根目录无 manifest/依赖，但被 README/关键词信号标记——多为 **monorepo 子目录插件**（如 orziz/odai）、**预设/配置仓库**（如 xiaobright/dsh-anchored-standard、yjh051108/dsh-router-standard）、**内容仓库**（如 nexu-io/open-design 8.7 万 star 桌面应用、tt-a1i/archify 技能源仓库）。
- **42 个桌面端**（dsh-desktop 系）、**18 个列表/市场**、**11 个皮肤**、**9 个技能**、**8 个文档**、**5 个桌宠**、**3 个 MCP**、**1 个预设**。
- 高 star 待复核代表：`nexu-io/open-design`(86934)、`tt-a1i/archify`(12971)、`anywhere-labs/deepseek-harness-desktop`(5892)、`Devin-AXIS/iPolloWork`(4082)、`xiaobright/dsh-anchored-standard`(2189) 等（完整 top40 见 `compat-stats.json → topC`）。

### 4.7 Node 引擎分布

有 engines 声明的仓库：`^22.19.0 || >=24.0.0`(271)、`>=22`(121)、`>=20`(115)、`>=22.19.0`(61)、`>=18`(57)、`>=22.19`(35)、`^22.19 || >=24`(35)、`>=24`(14)。生态已整体迁往 **Node ≥ 20，新插件建议 ≥ 22.19 / 24 LTS**。

### 4.8 其他

- `@deepseek-ai/dsh-test-support` 在 npm 上**不存在**（开发指南引用但未发布）——集成测试示例暂不可用。
- 插件形态观察：web 客户端插件（255 个 B/runtime-injected）**不声明 @deepseek-ai 依赖**是正常形态（客户端运行时注入），静态判定时不可据此判不兼容。
- 主流插件兼容写法实测：`dsh-mnemon`（peer `^0.1.0-rc.6 || ^0.1.1-rc.1`）、`DSH-better-sidebar`（peer `^0.1.0-rc.8`）、`dsh-archived-sessions`（peer `^0.1.0-rc.6`）、`dsh-session-health`（peer `>=0.0.1-rc.1 <0.2.0`）——全部覆盖当前线。

---

## 五、分档代表（高 star 抽查）

| 档位 | 代表仓库 | compatLabel | 依据 |
|---|---|---|---|
| A | omdsh-dev/DSH-better-sidebar（1267★） | 0.1.0-rc.8+ | cordis.patch.yml + 15 个 peer 范围覆盖当前线 |
| A | ccch1mneyyy/dsh-TUI（1265★） | 0.1.0-rc.6+ | 同上 |
| A | Anionex/dsh-vision-toolkit（433★） | 0.1.0-rc.6+ | 同上 |
| A | omdsh-dev/dsh-mnemon（29★） | 0.1.0-rc.6+ | peer `^0.1.0-rc.6 \|\| ^0.1.1-rc.1`，dev 钉 0.1.1-rc.2 |
| B | Shizuku-keop/dsh-compat-guard | runtime-injected | cordis.patch.yml 无 @deepseek-ai 依赖（web 客户端） |
| B | wefio/dsh-cache-miss | 0.1.0-rc.6+ | `>=0.1.0-rc.6 <0.3.0-0` 四包声明 |
| C | nexu-io/open-design（86934★） | unknown | 根目录无 manifest（桌面应用，watch 项） |
| D | dhicoc/dsh-reverse-skill | av-flagged | risk-360 critical |

---

## 六、对目录维护的建议

1. **回写 compat 字段**：将 `compat-fill.csv` 中 A/B 档的 `compatLabel` 合并进 `intents.json`（A 档 447 个可直接写版本串，B 档建议写 `label（inferred）` 或维持 unknown 待人工确认），并同步重生成站点。
2. **建立复核队列**：C 档 314 个按 star 倒序人工复核（monorepo 需进子目录查 cordis.patch.yml；预设/技能/桌面端单独分类标注，不混入"插件"）。
3. **D 档处置**：not-a-plugin 建议从 plugin 列表移入 watch 或标注 `非插件`；old-line 11 个建议向作者提交升级 PR 或在条目标注"仅兼容 0.1.0-rc.6 及更早"；AV 2 个保留风险标记。
4. **防冲突**：收录时启用包名唯一性检查（§规范 6.2）与 `@deepseek-ai/*` 作用域占用拦截。
5. **版本线常量化**：目录仓库内置 `check-compat.mjs`（本次交付），版本线变更（如 0.1.2）时仅需更新 `CURRENT`/`TRAIN` 常量后重跑。

---

*核查脚本与全部中间数据见 `Blue-Whale-Harness-compat/` 目录；判定逻辑与录入规范见《插件兼容性规范 v1.0》。*
