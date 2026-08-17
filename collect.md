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
