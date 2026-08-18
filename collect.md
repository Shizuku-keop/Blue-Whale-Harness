# [Bug & Fix] 极简模式下 persistent bash 每次执行卡顿 3.5s+ 的根本原因与修复方案（附 Fork 分支）

### 1. 现象
在 `dsh` 中使用 **极简模式（minimal preset）** 时，任何极简单命令（如 `pwd`、`ls`）每次执行均固定耗时 **3500ms ~ 3800ms**，首条命令耗时高达 **~7200ms**。

---

### 2. 根本原因

1. **Prompt 协议握手不一致**：
   - 底层 `@deepseek-ai/dsh-terminal-bash` (`packages/terminal/terminal-bash/src/sanitize.ts`) 中预设的提示符是：
     ```typescript
     export const CONTROLLED_PROMPT = 'dsh> '
     ```
   - 但上层 `@deepseek-ai/dsh-tool-bash-persistent` 在初始化 Persistent Shell 时，实际注入的 `PS1` 是：
     ```typescript
     const SHELL_PROMPT = '__DSH_PERSISTENT_BASH_PROMPT__ '
     ```
   - 导致底层 `TerminalSanitizer` 收到命令结束的 OSC 转义标记后，无法匹配到预期的提示符，`promptTextSeen` 始终为 `false`，导致 **50ms 的快速返回通道完全失效**。

2. **兜底推断超时（Inferred Idle）**：
   - 快速通道失效后，底层退化为等待终端完全静默：`idleSilenceMs (3000ms) + handoffGraceMs (500ms) = 3500ms`。
   - 首条命令因为经历了 Shell 初始化（3.5s）+ 正式命令（3.5s），总耗时为 ~7.2 秒。

---

### 3. 已验证的修复方案

已在源码中将底层的 `CONTROLLED_PROMPT` 统一修改为持久化终端实际使用的提示符，并实测验证通过：
👉 **修复分支**：https://github.com/ManTouMT/deepseek-harness/tree/fix/persistent-bash-prompt-timeout

**修改文件**：
`packages/terminal/terminal-bash/src/sanitize.ts`:
```diff
- export const CONTROLLED_PROMPT = 'dsh> '
+ export const CONTROLLED_PROMPT = '__DSH_PERSISTENT_BASH_PROMPT__ '
```

### 4.测试截图
之前：
<img width="1408" height="719" alt="image" src="https://github.com/user-attachments/assets/53422646-dad7-4eb8-b809-66f766240c66" />

之后：
<img width="1323" height="775" alt="image" src="https://github.com/user-attachments/assets/30ea601c-4fa5-433d-86b6-5d486671c13e" />

------------------------------------------------------------------------------------------------------------------------------------------------------------------
# 来自 HaoyanZhang123
## 使用问题

### 1. WebUI 历史加载超时

**问题描述**：  
在使用 `pnpm dsh web` 启动 WebUI 后，首次加载一个已存在的较长对话时，页面会提示“历史加载失败：signal timed out (internal)”。此时需要手动在多个已存在的对话之间来回切换点击加载，才能最终成功加载该对话。
<img width="2180" height="1624" alt="屏幕截图 2026-08-17 212329" src="https://github.com/user-attachments/assets/d64f5f0e-049f-4dc4-82bb-26291d4412bc" />

**影响**：  
该问题会干扰用户对历史对话的访问，首次加载失败带来了额外的操作成本，降低了使用体验的流畅度。

---

## 功能优化

### 2. 支持会话内动态切换预设（Preset）

**现状痛点**：  
DeepSeek Harness 官方版本中，一个会话一旦开始，其预设（Preset）模式便被固定，中途无法更改。这带来了两个具体问题：

- **被迫中断工作流**：如果用户需要在对话中途切换模式（例如从“标准”切换到“编程”），必须放弃当前对话并重新创建一个新会话，这会导致之前的聊天记录和上下文全部丢失。
- **缺乏灵活性**：DSH 的预设本质上是不同的“工具包”和“系统指令”组合。但在一个长对话中，用户往往需要根据任务阶段（如先头脑风暴，再写代码）灵活调整能力。若一开始就选择加载全部指令的“全能型”预设，则会引发以下问题：
  - **Token 冗余与上下文挤占**：系统提示词过于臃肿，消耗额外 Token 并压缩历史对话的可用上下文空间。
  - **工具调用歧义与决策延迟**：AI 在过多工具中选择时容易产生歧义，导致调用错误或响应变慢。
  - **对立风格折中妥协**：不同场景所需的人设（如创意发散与严谨 Debug）无法兼顾，最终结果“样样通，样样松”。
  - **高权限常驻带来的攻击面暴露**：涉及高风险操作的预设若常驻开启，可能增加 Prompt 注入等安全风险。

**解决方案建议**：  
本人已构建插件 [deepseek-harness-live-preset-switch](https://github.com/HaoyanZhang123/deepseek-harness-live-preset-switch)，该插件在 WebUI 输入框处添加了一个 Preset Chip，允许用户在不中断当前对话的情况下随时切换预设，且切换会在下一轮对话时生效。此功能为那些需要在一个长对话中根据不同任务阶段灵活调整 Agent 能力的用户，提供了一个非常刚需的能力，建议官方考虑将其整合进主分支。
<img width="824" height="204" alt="屏幕截图 2026-08-17 212556" src="https://github.com/user-attachments/assets/01d6f82a-84f3-41a6-833b-f69865b77c4f" />
<img width="1730" height="1110" alt="屏幕截图 2026-08-17 214132" src="https://github.com/user-attachments/assets/6b22ee3f-c588-48e9-8631-6307b99a056c" />

---

### 3. 优化“轨迹”功能的可视化呈现方式

**现状痛点**：  
DSH 目前已具备轨迹（Trace）功能，能够对每个turn及其对应的input、model、tools进行追踪。然而，在当前版本中，这些信息以列表平铺的方式呈现。当对话轮次较多或任务较长时，用户难以快速把握整体对话结构和关键节点的依赖关系，增加了追踪与理解项目整体流程的难度。

**优化建议**：  
建议官方参考 [dsh-compass](https://github.com/Happy2Git/dsh-compass) 项目的实现思路，将轨迹展示形式由**列表平铺**改为**Git 提交树（git tree）样式**。这种树形结构能够更直观地展示对话的分支、回溯和依赖关系，显著提升轨迹的可视化效果，帮助用户更清晰地理解复杂对话的整体脉络。
<img width="1546" height="726" alt="屏幕截图 2026-08-17 213520" src="https://github.com/user-attachments/assets/acc32bb3-3c37-42f6-bcc3-e18320ca4b6d" />

------------------------------------------------------------------------------------------------------------------------------------------------------------------

---

### [Bug] 所有工具调用都报 "Cannot read properties of undefined (reading 'prepare')" — ToolRuntime 调度器未注册（rc.6）
**问题原网址**: https://github.com/deepseek-ai/deepseek-harness/discussions/1677
**分类**: Bug 反馈
**dsh 版本**: 0.1.0-rc.6（全新安装：先清空 npm 缓存再 `npx @deepseek-ai/dsh web`）
**Node**: v22.22.3 / npm 10.9.8
**系统**: WSL2（Ubuntu / Linux），`process.platform === 'linux'`
**可在以下环境稳定复现**: 完全干净安装、默认 `web` profile、默认 `standard` 预设、patch 配置为空

----

## 问题概述

所有面向模型的工具调用（bash、jobs、fs、web、todo、subagent、ralph、workflow——全部）都能被模型正确选中，但**一执行就崩溃**：

```
Cannot read properties of undefined (reading 'prepare')
```

工具已注册、模型能看到（它会用正确参数调用 `bash`），但 agent 循环执行时 `tools` 服务上的**调度器（scheduler）是 undefined**。在无任何自定义插件的全新安装上即可复现。

## 复现步骤

1. `npx @deepseek-ai/dsh web`（全新安装）
2. 打开 `http://127.0.0.1:3080`，新建会话（工作区如 `/tmp`）
3. 发送：`运行 bash echo hello`（或任何会触发工具调用的消息）
4. 模型返回 `bash` 工具调用：`{"command": "echo hello", ...}`
5. 工具行显示**已停止**，本轮以 `本轮运行失败 Cannot read properties of undefined (reading 'prepare')` 结束
6. 轨迹页显示：`bash {...} → interrupted`

## 观察到的现象

- 模型**能**看到完整工具目录并正确调用工具。
- 所有工具失败方式完全一致——bash、jobs、fs、web、todo、subagent、workflow 全是 `undefined.prepare`。
- 插件清单（`设置 → 插件 → 插件列表`）显示所有 `tool-*` 条目在进程级为**已停用**，但它们的底层服务（`bash-sandbox`、`jobs-local`、`subprocess-local`、`fs-sandbox`、`system-prompt`、`tools`）都是**已挂载、已启用**。
- `pwsh-sandbox` 在 Linux 上显示停用是正常的（预期行为）。

## 根因分析（源码级）

Agent 循环通过 `tools` 服务调用调度器：

`@deepseek-ai/dsh-agent-loop/lib/index.js:193`
```js
const prepared = await ctx.tools[TOOL_RUNTIME_SCHEDULER].prepare(call.exec);
```

`ctx.tools` 能解析，但 `ctx.tools[TOOL_RUNTIME_SCHEDULER]` 是 `undefined` → 抛 `undefined.prepare`。

调度器是 ToolRuntime 服务的**类字段**：

`@deepseek-ai/dsh-tools/lib/index.js:2557`
```js
[TOOL_RUNTIME_SCHEDULER] = {
    prepare: (exec) => this.prepareScheduledExecution(exec),
    dispatch: (exec) => this.dispatchScheduledExecution(exec),
    finalize: (exec, result) => this.finalizeScheduledExecution(exec, result),
    finish: (exec, result) => this.finishScheduledExecution(exec, result)
};
```

服务以 `tools` 名注册（`dsh-tools/lib/index.js:2585` `super(ctx, "tools")`）。

如果 `ToolRuntime` 被实例化，`ctx.tools[TOOL_RUNTIME_SCHEDULER]` 必然有值。它是 undefined 而 `ctx.tools` 又能解析，说明 **ToolRuntime 在 agent/会话域从未被实例化**——但 `tools` 这个名字却能解析到（否则报错会是 "ctx.tools is undefined"）。

`ToolRuntime` 声明 `static inject = ["systemPrompt"]`（`dsh-tools/lib/index.js:2547`）。`systemPrompt` 服务（`@deepseek-ai/dsh-system-prompt`，lib/index.js:162 `super(ctx, "systemPrompt")`）在清单中显示已挂载/已启用。我们的推测：在会话域中 `systemPrompt` 注入未成功解析（或作用域/顺序问题阻止了 ToolRuntime 实例化），导致循环拿到一个没有调度器字段的残缺 `tools` 服务——这与清单中所有 `tool-*` 显示停用而宿主服务启用的情况一致。

## 我们试过的方法（均无效）

1. **全新安装** — `rm -rf ~/.npm/_npx/*` 后 `npx @deepseek-ai/dsh web` → 依旧崩溃。
2. **默认 `standard` 预设不动**、`cordis.patch.yml` 清空 → 依旧崩溃。
3. **换不同工作区**（`/tmp` 等）→ 依旧崩溃。
4. **新建会话 vs 恢复会话** → 两种都崩。
5. **在 profile 里安装 `@deepseek-ai/dsh-tool-ralph`** → 引发*别的*错误（恢复会话时 `tool-ralph: waiting for workflows`，之后又出现 `duplicate loader entry id: tool-ralph`）；卸载并恢复默认后 `undefined.prepare` 依旧存在。
6. **自定义插件（`dsh-plan-debate`）注入 `"workflowEngine"`** → 报 `pending (waiting for service: workflowEngine)`。`@deepseek-ai/dsh-workflow` 通过 `super(ctx, "workflowEngine")`（dsh-workflow/lib/index.js:61）提供服务，但只在预设的隔离 `delegation` 域内——挂载在根域的消费者无法解析到它。可能与工具插件的域/注入作用域问题同源。

## 给维护者的额外发现

- **ralph 包版本不一致**：npm 上 `@deepseek-ai/dsh-tool-ralph` 的 `latest` 是 `0.0.1-rc.1`，但 `dsh@0.1.0-rc.6` 内置的是 `0.1.0-rc.6`。用户单独安装会拿到错误的（更旧的）版本——我们最初就是这么中招的。
- 插件清单"进程级停用"与"会话级启用"的区分容易误导——要么在清单中反映真实会话激活状态，要么在 UI 上说明进程级停用是预期的。

## 预期行为

- 工具调用正常执行（bash 能跑、结果返回、回合正常结束）。
- 插件清单反映真实的会话级激活状态，或明确说明进程级"停用"是预期的。

## 解决方案
先给结论：你的复现质量很高，但**机制结论需要修正**——源码证据不支持"ToolRuntime 未被实例化 / systemPrompt 注入失败导致残缺 tools 服务"的假设；这个报错更可能是我们**已知家族**的第四次报告（#1337、#1633、#1665 同签名），而干净安装能复现恰恰说明这次是**发布打包层面**的变体。

**1. 源码证据：ctx.tools 能解析 ⇒ 它必然是 ToolRuntime 实例**

- 全仓只有一处 `super(ctx, 'tools')`（`packages/core/tools/src/index.ts:827`）——没有第二个服务用 'tools' 名字注册，不存在"残缺 tools 服务"。
- 调度器是**类字段初始化器**（:796 `readonly [TOOL_RUNTIME_SCHEDULER]: ToolRuntimeScheduler = {...}`）——只要 ToolRuntime 被构造，字段必然存在，与 systemPrompt 注入无关。
- 所以 `ctx.tools` 解析成功 + `ctx.tools[TOOL_RUNTIME_SCHEDULER]` 为 undefined 只剩一种机制：**ctx.tools 是另一份物理拷贝的 dsh-tools 构造的实例**。`TOOL_RUNTIME_SCHEDULER` 是 unique symbol（tools/src/index.ts:466），每份拷贝在磁盘上求值都得到不同的 Symbol 实例——agent-loop 用自己拷贝的 Symbol 去索引外来拷贝实例的字段 → undefined → `undefined.prepare`。

**2. 干净安装为什么会有两份拷贝（打包层面，已核实）**

- **npm 上 `@deepseek-ai/dsh-base@0.1.0-rc.6` 把 `@deepseek-ai/dsh-tools` 声明为普通 dependency（`^0.1.0-rc.6`）**，而所有 tool-* 插件把它声明为 peerDependency。npm 7+ 自动安装 peer，且 npm 的 hoisting 是路径相关的——同一版本也可能在顶层和嵌套位置各出现一次（`node_modules/@deepseek-ai/dsh-tools` 与 `node_modules/<某包>/node_modules/@deepseek-ai/dsh-tools`）。agent-loop（应用闭包）与 tool 插件条目（loader 解析）若分别命中两个路径 → 两个 Symbol。
- **npm 上还存在旧行 `0.0.1-rc.5` 的 dsh-tools**，旧行插件（如 `dsh-tool-bash@0.0.1-rc.5`）peer 它。任何装到旧行插件的 profile 都会得到第二份拷贝——这正是你发现的 ralph 版本不一致（npm latest 0.0.1-rc.1 vs 内置 0.1.0-rc.6）的同一根源。
- 补充：本地 master（rc.5 时代）的 `loadProfile`/`resolveBundleDir`（app-boot/src/profile.ts:344-359）是"安装锚优先"解析，理论上干净安装单拷贝；rc.6 的实际安装树是否出现两拷贝需要现场确认。

**3. 决定性诊断（请在 rc.6 机器上跑，30 秒定位）**

```bash
# 找到应用闭包里的 dsh-tools 拷贝数
find ~/.npm/_npx -type d -name dsh-tools 2>/dev/null
# 在 profile 目录看 dsh-tools 是否是符号链接、指向哪
ls -la ~/.dsh/profiles/web/node_modules/@deepseek-ai/ | grep dsh-tools

# 关键：两个解析点是否命中同一物理文件
node -e "
const path=require('path');
const fs=require('fs');
const fromLoop=require.resolve('@deepseek-ai/dsh-tools',{paths:[path.dirname(require.resolve('@deepseek-ai/dsh-agent-loop/package.json'))]});
const fromBash=require.resolve('@deepseek-ai/dsh-tools',{paths:[path.dirname(require.resolve('@deepseek-ai/dsh-tool-bash/package.json'))]});
console.log('loop ->', fromLoop);
console.log('bash ->', fromBash);
console.log('same path:', fromLoop===fromBash, '| same realpath:', fs.realpathSync(fromLoop)===fs.realpathSync(fromBash));
"
```

若两个 realpath 不同 → 两拷贝实锤，机制确认。若相同 → 排除拷贝机制，我再帮你从 loader 的条目解析顺序查（那就要看 rc.6 实际发布树了）。

**4. 你观察里另两个点**

- "插件清单 tool-* 进程级停用但服务已挂载"：这是 inventory 的会话级挂载误报——工具条目是在会话作用域挂载的，进程级清单看不到。你观察到模型能看到全部工具，恰恰证明它们都在运行，不是停用。
- `workflowEngine` 只在预设隔离的 `delegation` 域内、根域消费者 `pending`：这是一个**独立且真实的作用域隔离 bug**，与工具崩溃无关，建议单独开一帖（值得维护者单独修）。

**5. 家族连接 + 修复方向**

四次报告（#1337 Windows+插件、#1633 Windows+插件、#1665 Windows、#1677 干净安装）同签名。两个既有 PR 蓝图（`apps/cli/src/plugin.ts` reconcile 加核心包名单臂拦截顶层 dsh-tools/cordis 依赖；`tool-calls.ts:169` 加防御检查 + 合成 tool result 收尾）之外，这次新增第三条：**打包侧修正**——dsh-base 的 dsh-tools 依赖改为 peer（与 tool 插件一致），并审计 npm 发布图里是否残留旧行 `0.0.1-rc.5` 引用。请把诊断输出贴回来，如果确认两拷贝，我可以在帖子里把打包修复写成可直接提交的 diff 草案。


